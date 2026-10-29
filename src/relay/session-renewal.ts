import fs from 'node:fs';
import path from 'node:path';
import lockfile from 'proper-lockfile';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { OAuthTokensSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import { RelayAuthProvider, RelayCredentialStore, type RelayCredentials } from './auth.js';
import { relayFetch, relayUrl } from './config.js';
import { captureWithProfile, capturePayload, loginUniversity, type LoginCapture, type LoginUniversity } from './local-login.js';

/**
 * La sesión de Blackboard dura 3 h. Se renueva cuando le quedan menos de 2 h (cada ~60 min): usar el SSO
 * seguido lo mantiene vivo, mientras que tras varias horas sin uso Microsoft vuelve a pedir contraseña.
 */
export const RENEW_BEFORE_MS = 2 * 3600_000;
/** El consentimiento de `campus login` para renovar sola la sesión dura 30 días. */
export const RENEWAL_AUTHORIZATION_MS = 30 * 24 * 3600_000;
const AFTER_SUCCESS_MS = 30 * 60_000;
const AFTER_FAILURE_MS = 60 * 60_000;
const CHECK_INTERVAL_MS = 10 * 60_000;
const CAPTURE_TIMEOUT_MS = 60_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const STOP_WAIT_MS = 5_000;

export type RenewalResult = 'renewed' | 'fresh' | 'not-enrolled' | 'unavailable';

type RenewalOptions = {
  url?: URL; store?: RelayCredentialStore; now?: number; signal?: AbortSignal;
  capture?: (universityId: LoginUniversity, signal: AbortSignal) => Promise<LoginCapture>;
};

const withSignal = (timeoutMs: number, signal?: AbortSignal) =>
  signal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]) : AbortSignal.timeout(timeoutMs);

function due(credentials: RelayCredentials | undefined, now: number): 'not-enrolled' | 'fresh' | 'due' | 'unauthorized' {
  const upload = credentials?.sessionUpload;
  if (!credentials?.tokens || !upload) return 'not-enrolled';
  if (now - upload.authorizedAt > RENEWAL_AUTHORIZATION_MS) return 'unauthorized';
  if (upload.nextAttemptAt !== undefined && now < upload.nextAttemptAt) return 'fresh';
  return upload.expiresAt - now > RENEW_BEFORE_MS ? 'fresh' : 'due';
}

/** Un solo proceso a la vez renueva: el perfil de Chromium y el archivo de credenciales no admiten escritores concurrentes. */
async function withRenewalLock<T>(store: RelayCredentialStore, run: () => Promise<T>): Promise<T | undefined> {
  const target = `${store.file}.renew`;
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  let release: (() => Promise<void>) | undefined;
  try { release = await lockfile.lock(target, { realpath: false, stale: 3 * 60_000, retries: 0 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ELOCKED') return undefined; throw error; }
  try { return await run(); } finally { await release().catch(() => undefined); }
}

function defer(store: RelayCredentialStore, now: number, delayMs: number, sameLogin: (credentials: RelayCredentials) => boolean): void {
  const latest = store.load();
  if (latest?.sessionUpload && sameLogin(latest)) store.save({ ...latest, sessionUpload: { ...latest.sessionUpload, nextAttemptAt: now + delayMs } });
}

/**
 * Vuelve a subir al relay solo las cookies de la universidad usando el SSO que quedó en el
 * perfil local. Solo actúa si el estudiante ya autorizó el envío en `campus login` (dura 30 días).
 * Nunca lanza: cualquier fallo deja intactas las credenciales anteriores y espera antes de reintentar.
 */
export async function renewRelaySession(options: RenewalOptions = {}): Promise<RenewalResult> {
  const now = options.now ?? Date.now();
  let store: RelayCredentialStore | undefined;
  try {
    const url = options.url ?? relayUrl();
    store = options.store ?? new RelayCredentialStore(url);
    const first = due(store.load(), now);
    if (first === 'not-enrolled' || first === 'fresh') return first;
    if (first === 'unauthorized') return 'unavailable';
    const outcome = await withRenewalLock(store, async (): Promise<RenewalResult> => {
      // Otro proceso pudo renovar mientras esperábamos el candado.
      const current = store!.load();
      const again = due(current, now);
      if (again !== 'due') return again === 'unauthorized' ? 'unavailable' : again;
      const upload = current!.sessionUpload!;
      const universityId = loginUniversity(upload.universityId);
      // `campus login` y `logout` escriben sin este candado: si cambian las credenciales mientras renovamos
      // (otra cuenta, otro registro de cliente), el resultado pertenece al login anterior y se descarta.
      const clientId = current!.client.client_id;
      const sameLogin = (credentials: RelayCredentials) => credentials.client.client_id === clientId && credentials.sessionUpload?.authorizedAt === upload.authorizedAt;
      let result: RenewalResult = 'unavailable';
      try {
        const captured = await (options.capture ?? ((id, abort) => captureWithProfile(id, abort, { headless: true })))(universityId, withSignal(CAPTURE_TIMEOUT_MS, options.signal));
        const payload = capturePayload(captured.cookies, universityId);
        const signal = withSignal(UPLOAD_TIMEOUT_MS, options.signal);
        // El SDK refresca el token del relay si hace falta; sin refresh válido no hay renovación posible.
        const provider = new RelayAuthProvider(store!, clientId);
        if (await auth(provider, { serverUrl: url, scope: 'campus.read', fetchFn: relayFetch(url, signal, 20_000) }) === 'AUTHORIZED') {
          const access = provider.tokens()?.access_token;
          const expiresAt = Math.min(payload.expiresAt, captured.expiresAt);
          const response = access ? await relayFetch(url, signal, 30_000)(new URL('/v1/cli/login', url), { method: 'POST',
            headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
            body: JSON.stringify({ universityId, consent: true, cookies: payload.cookies, expiresAt }) }) : undefined;
          if (response?.ok) {
            const tokens = OAuthTokensSchema.parse((await response.json()).tokens);
            const latest = store!.load();
            if (latest && sameLogin(latest) && tokens.scope?.split(/\s+/).includes('campus.read') === true) {
              store!.save({ ...latest, tokens: { ...tokens, ...(tokens.refresh_token ? {} : { refresh_token: latest.tokens?.refresh_token }) },
                sessionUpload: { universityId, expiresAt, authorizedAt: upload.authorizedAt, nextAttemptAt: now + AFTER_SUCCESS_MS } });
              result = 'renewed';
            }
          }
        }
      } catch { /* el SSO ya no sirve, no hay red o el relay rechazó: se reporta como no disponible */ }
      if (result !== 'renewed') defer(store!, now, AFTER_FAILURE_MS, sameLogin);
      return result;
    });
    return outcome ?? 'fresh'; // otro proceso está renovando ahora mismo
  } catch {
    return 'unavailable';
  }
}

/**
 * Mantiene viva la sesión mientras el servidor MCP siga abierto. Devuelve una función que detiene el
 * temporizador, aborta una renovación en curso y espera a que cierre el navegador antes de que el proceso salga.
 */
export function keepSessionRenewed(
  report: (message: string) => void = console.error,
  renew: (signal: AbortSignal) => Promise<RenewalResult> = signal => renewRelaySession({ signal }),
): () => Promise<void> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();
  const tick = async () => {
    let result: RenewalResult = 'unavailable';
    try { result = await renew(controller.signal); } catch { /* una renovación fallida nunca debe tumbar el servidor MCP */ }
    if (controller.signal.aborted) return;
    if (result === 'unavailable') report('No se pudo renovar la sesión universitaria sola. Ejecuta campus login.');
    timer = setTimeout(() => { running = tick(); }, CHECK_INTERVAL_MS);
    timer.unref();
  };
  running = tick();
  return async () => {
    controller.abort();
    clearTimeout(timer);
    await Promise.race([running, new Promise(resolve => setTimeout(resolve, STOP_WAIT_MS).unref())]);
  };
}
