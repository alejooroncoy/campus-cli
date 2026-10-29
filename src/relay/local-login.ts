import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import type { Browser, BrowserContext, Page } from 'playwright';
import { OAuthTokensSchema, type OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { loginToRelay, RelayCredentialStore, type SessionUpload } from './auth.js';
import { relayFetch, relayUrl } from './config.js';
import { launchPersistentContextSafe } from '../browser-install.js';

// Login-only allow-list. No university data client or query engine ships here.
export const LOGIN_UNIVERSITIES = {
  'upc-pe': { name: 'UPC', origin: 'https://aulavirtual.upc.edu.pe', apId: '_4893_1' },
  'upn-pe': { name: 'UPN', origin: 'https://upn.blackboard.com', apId: '_111_1' },
  'palermo-ar': { name: 'Universidad de Palermo', origin: 'https://palermo.blackboard.com', apId: '_2352_1' },
} as const;
export type LoginUniversity = keyof typeof LOGIN_UNIVERSITIES;
export type LoginCapture = { cookies: Awaited<ReturnType<BrowserContext['cookies']>>; expiresAt: number };

export function loginUniversity(value: string): LoginUniversity {
  if (!Object.hasOwn(LOGIN_UNIVERSITIES, value)) throw new Error('Universidad no admitida: usa upc-pe, upn-pe o palermo-ar.');
  return value as LoginUniversity;
}

export function capturePayload(cookies: LoginCapture['cookies'], universityId: LoginUniversity, now = Date.now()): LoginCapture {
  const host = new URL(LOGIN_UNIVERSITIES[universityId].origin).hostname;
  const filtered = cookies.filter(cookie => {
    const domain = cookie.domain.replace(/^\./, '').toLowerCase();
    return (domain === host || (domain.includes('.') && host.endsWith(`.${domain}`))) && (cookie.expires <= 0 || cookie.expires * 1000 > now);
  }).map(({ name, value, domain, path, expires, httpOnly, secure, sameSite }) => ({ name, value, domain, path, expires, httpOnly, secure, sameSite }));
  const credentials = filtered.filter(cookie => ['BbRouter', 'JSESSIONID'].includes(cookie.name) && cookie.value.length > 0);
  if (!credentials.length) throw new Error('El navegador todavía no tiene una sesión universitaria válida.');
  const expires = credentials.flatMap(cookie => {
    const routerExpiry = cookie.name === 'BbRouter' ? cookie.value.match(/expires:(\d+)/)?.[1] : undefined;
    return [cookie.expires > 0 ? cookie.expires * 1000 : Infinity, routerExpiry ? Number(routerExpiry) * 1000 : Infinity];
  });
  const expiresAt = Math.min(now + 3 * 60 * 60_000, ...expires);
  if (expiresAt <= now) throw new Error('La sesión universitaria ya venció. Vuelve a iniciar sesión.');
  if (filtered.length > 200 || Buffer.byteLength(JSON.stringify(filtered)) > 200 * 1024) throw new Error('La sesión universitaria excede el límite de transferencia.');
  return { cookies: filtered, expiresAt };
}

function universityLoginUrl(universityId: LoginUniversity): string {
  const university = LOGIN_UNIVERSITIES[universityId];
  const login = new URL('/auth-saml/saml/login', university.origin);
  login.searchParams.set('apId', university.apId); login.searchParams.set('redirectUrl', `${university.origin}/ultra`);
  return login.href;
}

/** Espera a Ultra y devuelve solo las cookies de la universidad; reintenta 5 s por si tardan. */
async function awaitUniversityCookies(context: BrowserContext, page: Page, universityId: LoginUniversity, signal: AbortSignal, timeout: number, gotoTimeout = 60_000): Promise<LoginCapture> {
  const university = LOGIN_UNIVERSITIES[universityId];
  await page.goto(universityLoginUrl(universityId), { waitUntil: 'commit', timeout: gotoTimeout });
  await page.waitForURL(url => url.origin === university.origin && /^\/ultra(?:\/|$)/.test(url.pathname), { timeout, waitUntil: 'commit' });
  const deadline = Date.now() + 5_000;
  do {
    signal.throwIfAborted();
    try { return capturePayload(await context.cookies(), universityId); } catch (error) {
      if (Date.now() >= deadline) throw error;
    }
    await page.waitForTimeout(100);
  } while (true);
}

async function launchLoginBrowser(): Promise<Browser> {
  const { chromium } = await import('playwright');
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel, headless: false }); } catch { /* try bundled Chromium next */ }
  }
  try { return await chromium.launch({ headless: false }); } catch (error) {
    if (!(error instanceof Error) || !/Executable doesn't exist/.test(error.message)) throw new Error('No se pudo abrir el navegador local de login.');
    console.error('Instalando Chromium para el login local de Campus…');
    const cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
    await new Promise<void>((resolve, reject) => {
      const child = execFile(process.execPath, [cli, 'install', 'chromium'], { timeout: 180_000 }, err => err ? reject(new Error('No se pudo instalar Chromium. Ejecuta npx playwright install chromium.')) : resolve());
      child.stdout?.pipe(process.stderr); child.stderr?.pipe(process.stderr);
    });
    return chromium.launch({ headless: false });
  }
}

/** Browser state exists only in this temporary context. Never reads courses,
 * grades or materials and never saves a legacy university session to disk. */
export async function captureLocalLogin(universityId: LoginUniversity, signal: AbortSignal, launch = launchLoginBrowser): Promise<LoginCapture> {
  signal.throwIfAborted();
  const university = LOGIN_UNIVERSITIES[universityId];
  const browser = await launch();
  const onAbort = () => { void browser.close(); };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    signal.throwIfAborted();
    const context = await browser.newContext();
    return await awaitUniversityCookies(context, await context.newPage(), universityId, signal, 180_000);
  } catch {
    if (signal.aborted) throw signal.reason;
    throw new Error(`No se completó el login local de ${university.name}. Vuelve a ejecutar campus login.`);
  } finally {
    signal.removeEventListener('abort', onAbort);
    await browser.close();
  }
}

// Coherente con la plataforma real: un UA de macOS en Windows/Linux delata automatización a Entra.
const USER_AGENT = {
  darwin: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  win32: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}[process.platform as string] ?? 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** UPC conserva `browser-profile` para aprovechar el SSO que ya existe; el resto usa un perfil propio. */
export function loginProfileDir(universityId: LoginUniversity, root = path.join(os.homedir(), '.blackboard-cli')): string {
  return path.join(root, universityId === 'upc-pe' ? 'browser-profile' : `browser-profile-${universityId}`);
}

function prepareProfileDir(dir: string): void {
  if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) throw new Error('El perfil del navegador es un enlace simbólico; ejecuta campus logout y vuelve a iniciar sesión.');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
}

/** Borra los perfiles locales (cookies de Microsoft incluidas). Lo usa `campus logout`. */
export function clearLoginProfiles(root?: string): void {
  for (const id of Object.keys(LOGIN_UNIVERSITIES) as LoginUniversity[]) fs.rmSync(loginProfileDir(id, root), { recursive: true, force: true });
}

export class SilentLoginUnavailable extends Error {
  constructor() { super('El SSO ya no recuerda esta sesión; ejecuta campus login.'); this.name = 'SilentLoginUnavailable'; }
}

/**
 * En headless Microsoft pide elegir cuenta aunque el SSO siga vivo. Se elige solo si hay una única
 * cuenta recordada (con varias no se adivina) y se acepta "Mantener sesión" para que el SSO persista.
 */
function rememberedAccountPicker(page: Page): () => void {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      if (new URL(page.url()).hostname !== 'login.microsoftonline.com') return;
      const accounts = page.locator('#tilesHolder div.table[data-test-id]');
      if (await accounts.count() === 1) await accounts.first().click({ timeout: 3_000 });
      else if (await page.locator('#idBtn_Back').isVisible()) await page.locator('#idSIButton9').click({ timeout: 3_000 });
    } catch { /* la página cambió mientras se miraba; el siguiente intento la revisa */ } finally { busy = false; }
  }, 400);
  return () => clearInterval(timer);
}

/**
 * Login con perfil persistente: las cookies de Microsoft/Google se quedan en este equipo
 * (nunca se envían) y permiten renovar la sesión sin MFA. `headless` solo reutiliza el SSO.
 */
export async function captureWithProfile(universityId: LoginUniversity, signal: AbortSignal, options: {
  headless?: boolean; profileDir?: string; launch?: typeof launchPersistentContextSafe;
} = {}): Promise<LoginCapture> {
  signal.throwIfAborted();
  const headless = options.headless ?? false;
  const dir = options.profileDir ?? loginProfileDir(universityId);
  prepareProfileDir(dir);
  const context = await (options.launch ?? launchPersistentContextSafe)(dir, { headless, userAgent: USER_AGENT });
  const onAbort = () => { void context.close(); };
  signal.addEventListener('abort', onAbort, { once: true });
  let stopPicker = () => {};
  try {
    const page = await context.newPage();
    if (headless) stopPicker = rememberedAccountPicker(page);
    return await awaitUniversityCookies(context, page, universityId, signal, headless ? 25_000 : 180_000, headless ? 25_000 : 60_000);
  } catch {
    if (signal.aborted) throw signal.reason;
    if (headless) throw new SilentLoginUnavailable();
    throw new Error(`No se completó el login local de ${LOGIN_UNIVERSITIES[universityId].name}. Vuelve a ejecutar campus login.`);
  } finally {
    stopPicker();
    signal.removeEventListener('abort', onAbort);
    await context.close();
  }
}

async function confirmSessionUpload(): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) throw new Error('El login requiere una terminal interactiva o --consent-session-upload.');
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try { return /^(s|si|sí|y|yes)$/i.test((await prompt.question('¿Autorizas enviar tu sesión universitaria al relay para consultar tu campus? Mientras uses el MCP se renovará sola, reenviando solo cookies de tu universidad con el acceso que queda guardado en este equipo, hasta 30 días o hasta campus logout. [s/N] ')).trim()); }
  finally { prompt.close(); }
}

export async function loginLocally(options: {
  universityId?: string; consent?: boolean; url?: URL; store?: RelayCredentialStore;
  openBrowser?: (url: URL) => Promise<void>; capture?: (universityId: LoginUniversity, signal: AbortSignal) => Promise<LoginCapture>; confirm?: () => Promise<boolean>;
} = {}): Promise<void> {
  const url = options.url ?? relayUrl();
  if (options.universityId) loginUniversity(options.universityId);
  const request = relayFetch(url, undefined, 20_000);
  let uploaded: SessionUpload | undefined;
  // Fail before asking the student to log in if their relay lacks this contract.
  const capabilities = await request(new URL('/v1/cli/login', url));
  if (!capabilities.ok) throw new Error('Este relay todavía no admite el login local de Campus 3.0.0.');
  const supported = await capabilities.json();
  if (supported.localLogin !== true || !Array.isArray(supported.universities)) throw new Error('El relay no anunció un contrato válido de login local.');
  if (options.universityId && !supported.universities.includes(options.universityId)) throw new Error('Esta universidad todavía no admite login local en el relay configurado.');
  console.error('Campus enviará al relay solo las cookies de tu campus universitario para comprobar la sesión y guardarla cifrada. La contraseña y las cookies de Microsoft/Google no se transfieren.');
  if (options.consent !== true && !await (options.confirm ?? confirmSessionUpload)()) throw new Error('Login cancelado: no se autorizó transferir la sesión.');
  await loginToRelay({ url, store: options.store, openBrowser: options.openBrowser, scope: 'campus.identity',
    finalize: async (tokens: OAuthTokens, signal) => {
      const fetcher = relayFetch(url, signal, 30_000);
      const headers = { authorization: `Bearer ${tokens.access_token}`, 'content-type': 'application/json' };
      const profile = await fetcher(new URL('/v1/account', url), { headers });
      if (!profile.ok) throw new Error('El relay no pudo verificar la cuenta Campus.');
      const { account } = await profile.json();
      const universityId = loginUniversity(options.universityId ?? account?.universityId ?? 'upc-pe');
      if (!supported.universities.includes(universityId)) throw new Error('Esta universidad todavía no admite login local en el relay configurado.');
      console.error(`Completa el login de ${LOGIN_UNIVERSITIES[universityId].name} y su MFA en el navegador local.`);
      const captured = await (options.capture ?? captureWithProfile)(universityId, signal);
      signal.throwIfAborted();
      const payload = capturePayload(captured.cookies, universityId);
      const response = await fetcher(new URL('/v1/cli/login', url), { method: 'POST', headers,
        body: JSON.stringify({ universityId, consent: true, cookies: payload.cookies, expiresAt: Math.min(payload.expiresAt, captured.expiresAt) }),
      });
      if (!response.ok) throw new Error(`El relay no aceptó la sesión universitaria (${response.status}). No se guardó una autorización nueva.`);
      const result = await response.json();
      uploaded = { universityId, expiresAt: Math.min(payload.expiresAt, captured.expiresAt), authorizedAt: Date.now() };
      const upgraded = OAuthTokensSchema.parse(result.tokens);
      if (upgraded.scope?.split(/\s+/).includes('campus.read') !== true) throw new Error('El relay no habilitó el acceso MCP de esta cuenta.');
      return { ...upgraded, issuer: tokens.issuer };
    },
  });
  // El consentimiento dado aquí es lo que permite renovar después solo cookies de la universidad.
  const store = options.store ?? new RelayCredentialStore(url);
  const saved = store.load();
  if (saved && uploaded) store.save({ ...saved, sessionUpload: uploaded });
}
