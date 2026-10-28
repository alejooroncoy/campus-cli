import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { auth, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { OAuthClientInformationSchema, OAuthTokensSchema, type OAuthClientInformationMixed, type OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { relayUrl, relayFetch } from './config.js';

export const LOGIN_REQUIRED = 'Inicia sesión en el relay de Campus: campus login. El acceso depende del plan y cupo de tu cuenta.';
export type RelayCredentials = {
  redirectUrl: string;
  client: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
};

/** Separate from legacy Campus identity and Blackboard cookies; bound to the full MCP URL. */
export class RelayCredentialStore {
  readonly file: string;
  constructor(url: URL, directory = path.join(os.homedir(), '.blackboard-cli', 'relay')) {
    this.file = path.join(directory, `${createHash('sha256').update(url.href).digest('hex')}.json`);
  }
  private checkParents(): void {
    for (let dir = path.dirname(this.file); ; dir = path.dirname(dir)) {
      if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) throw new Error('No se guardan credenciales del relay a través de enlaces simbólicos');
      if (path.dirname(dir) === dir) break;
    }
  }
  load(): RelayCredentials | undefined {
    this.checkParents();
    if (!fs.existsSync(this.file)) return undefined;
    if (fs.lstatSync(this.file).isSymbolicLink()) throw new Error('Archivo de credenciales del relay inseguro');
    fs.chmodSync(this.file, 0o600);
    const value = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (typeof value.redirectUrl !== 'string') throw new Error(LOGIN_REQUIRED);
    return { redirectUrl: value.redirectUrl, client: OAuthClientInformationSchema.parse(value.client),
      ...(value.tokens ? { tokens: OAuthTokensSchema.parse(value.tokens) } : {}) };
  }
  save(value: RelayCredentials): void {
    this.checkParents();
    const directory = path.dirname(this.file);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    if (fs.existsSync(this.file) && fs.lstatSync(this.file).isSymbolicLink()) throw new Error('Archivo de credenciales del relay inseguro');
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, this.file);
    } finally { fs.rmSync(temporary, { force: true }); }
  }
  clear(): void {
    this.checkParents();
    fs.rmSync(this.file, { force: true });
  }
}

export class RelayAuthProvider implements OAuthClientProvider {
  private verifier?: string;
  constructor(readonly store: RelayCredentialStore) {}
  get redirectUrl(): string { return this.store.load()?.redirectUrl ?? 'http://127.0.0.1/callback'; }
  get clientMetadata() {
    return { client_name: 'campus-cli', redirect_uris: [this.redirectUrl], grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'], token_endpoint_auth_method: 'none' as const, scope: 'campus.read' };
  }
  clientInformation() { return this.store.load()?.client; }
  tokens() { return this.store.load()?.tokens; }
  saveTokens(tokens: OAuthTokens) {
    const current = this.store.load();
    if (!current) throw new Error(LOGIN_REQUIRED);
    this.store.save({ ...current, tokens });
  }
  redirectToAuthorization(_url: URL): void { throw new Error(LOGIN_REQUIRED); }
  saveCodeVerifier(verifier: string) { this.verifier = verifier; }
  codeVerifier(): string {
    if (!this.verifier) throw new Error(LOGIN_REQUIRED);
    return this.verifier;
  }
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (scope === 'all' || scope === 'client') this.store.clear();
    if (scope === 'tokens') {
      const current = this.store.load();
      if (current) this.store.save({ ...current, tokens: undefined });
    }
    if (scope === 'verifier' || scope === 'all') this.verifier = undefined;
  }
}

function openBrowser(url: URL): Promise<void> {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url.href] : [url.href];
  return new Promise((resolve, reject) => execFile(command, args, error => error ? reject(error) : resolve()));
}

/** Uses the relay's OAuth and university onboarding, never local university SSO. */
export async function loginToRelay(options: {
  url?: URL; store?: RelayCredentialStore; openBrowser?: (url: URL) => Promise<void>; timeoutMs?: number;
  scope?: 'campus.read' | 'campus.identity';
  finalize?: (tokens: OAuthTokens, signal: AbortSignal) => Promise<OAuthTokens>;
} = {}): Promise<void> {
  const url = options.url ?? relayUrl();
  const store = options.store ?? new RelayCredentialStore(url);
  const state = randomBytes(32).toString('base64url');
  const scope = options.scope ?? 'campus.read';
  const cancelled = new AbortController();
  let client: OAuthClientInformationMixed | undefined;
  let tokens: OAuthTokens | undefined;
  let verifier = '';
  let receiveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const code = new Promise<string>((resolve, reject) => { receiveCode = resolve; rejectCode = reject; });
  void code.catch(() => undefined);
  const server = createServer((req, res) => {
    const callback = new URL(req.url ?? '/', 'http://127.0.0.1');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (req.method !== 'GET' || callback.pathname !== '/callback') { res.writeHead(404).end(); return; }
    if (callback.searchParams.get('state') !== state) { res.writeHead(400).end('Estado OAuth incorrecto.'); return; }
    const received = callback.searchParams.get('code');
    if (callback.searchParams.has('error') || !received) {
      res.writeHead(400).end('Inicio de sesión cancelado.');
      rejectCode(new Error('No se autorizó el acceso al relay de Campus.'));
    } else {
      res.end('Autorización recibida. Vuelve a la terminal para comprobar el resultado.');
      receiveCode(received);
    }
  });
  const timeout = setTimeout(() => {
    const error = new Error('Tiempo de espera agotado durante campus login.');
    rejectCode(error);
    cancelled.abort(error);
  }, options.timeoutMs ?? 300_000);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No se pudo iniciar el retorno OAuth.');
    const redirectUrl = `http://127.0.0.1:${address.port}/callback`;
    const provider: OAuthClientProvider = {
      redirectUrl,
      clientMetadata: { client_name: 'campus-cli', redirect_uris: [redirectUrl], grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'], token_endpoint_auth_method: 'none', scope },
      state: () => state,
      clientInformation: () => client,
      saveClientInformation: value => { client = value; },
      tokens: () => tokens,
      saveTokens: value => { tokens = value; },
      saveCodeVerifier: value => { verifier = value; },
      codeVerifier: () => verifier,
      redirectToAuthorization: authorization => {
        if (authorization.origin !== url.origin) throw new Error('La autorización debe iniciarse en el relay configurado.');
        return (options.openBrowser ?? openBrowser)(authorization);
      },
    };
    const fetchFn = relayFetch(url, cancelled.signal, 20_000);
    await auth(provider, { serverUrl: url, scope, fetchFn });
    const authorizationCode = await code;
    const result = await auth(provider, { serverUrl: url, authorizationCode, scope, fetchFn });
    if (result !== 'AUTHORIZED' || !client || !tokens) throw new Error('El relay no completó la autorización.');
    if (options.finalize) tokens = OAuthTokensSchema.parse(await options.finalize(tokens, cancelled.signal));
    if (cancelled.signal.aborted) throw cancelled.signal.reason;
    store.save({ redirectUrl, client, tokens });
  } finally {
    clearTimeout(timeout);
    cancelled.abort();
    server.closeAllConnections();
    server.close();
  }
}
