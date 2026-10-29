import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { OAuthTokensSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import { RelayAuthProvider, RelayCredentialStore } from './auth.js';
import { relayFetch, relayUrl } from './config.js';
import { captureWithProfile, capturePayload, loginUniversity, type LoginCapture, type LoginUniversity } from './local-login.js';

/**
 * La sesión de Blackboard dura 3 h. Se renueva cuando le quedan menos de 2 h (cada ~60 min): usar el SSO
 * seguido lo mantiene vivo, mientras que tras varias horas sin uso Microsoft vuelve a pedir contraseña.
 */
export const RENEW_BEFORE_MS = 2 * 3600_000;
const CHECK_INTERVAL_MS = 10 * 60_000;
const RETRY_AFTER_FAILURE_MS = 60 * 60_000;

export type RenewalResult = 'renewed' | 'fresh' | 'not-enrolled' | 'unavailable';

type RenewalOptions = {
  url?: URL; store?: RelayCredentialStore; now?: number; force?: boolean;
  capture?: (universityId: LoginUniversity, signal: AbortSignal) => Promise<LoginCapture>;
};

/**
 * Vuelve a subir al relay solo las cookies de la universidad usando el SSO que quedó en el
 * perfil local. Solo actúa si el estudiante ya autorizó el envío en `campus login`.
 * Cualquier fallo deja intactas las credenciales anteriores.
 */
export async function renewRelaySession(options: RenewalOptions = {}): Promise<RenewalResult> {
  const url = options.url ?? relayUrl();
  const store = options.store ?? new RelayCredentialStore(url);
  const now = options.now ?? Date.now();
  const current = store.load();
  if (!current?.tokens || !current.sessionUpload) return 'not-enrolled';
  if (!options.force && current.sessionUpload.expiresAt - now > RENEW_BEFORE_MS) return 'fresh';
  const signal = AbortSignal.timeout(90_000);
  try {
    const universityId = loginUniversity(current.sessionUpload.universityId);
    const captured = await (options.capture ?? ((id, abort) => captureWithProfile(id, abort, { headless: true })))(universityId, signal);
    const payload = capturePayload(captured.cookies, universityId);
    // El SDK refresca el token del relay si hace falta; sin refresh válido no hay renovación posible.
    const provider = new RelayAuthProvider(store);
    if (await auth(provider, { serverUrl: url, scope: 'campus.read', fetchFn: relayFetch(url, signal, 20_000) }) !== 'AUTHORIZED') return 'unavailable';
    const access = provider.tokens()?.access_token;
    if (!access) return 'unavailable';
    const expiresAt = Math.min(payload.expiresAt, captured.expiresAt);
    const response = await relayFetch(url, signal, 30_000)(new URL('/v1/cli/login', url), { method: 'POST',
      headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
      body: JSON.stringify({ universityId, consent: true, cookies: payload.cookies, expiresAt }) });
    if (!response.ok) return 'unavailable';
    const tokens = OAuthTokensSchema.parse((await response.json()).tokens);
    if (tokens.scope?.split(/\s+/).includes('campus.read') !== true) return 'unavailable';
    const latest = store.load();
    if (!latest) return 'unavailable';
    store.save({ ...latest, tokens: { ...tokens, ...(tokens.refresh_token ? {} : { refresh_token: latest.tokens?.refresh_token }) }, sessionUpload: { universityId, expiresAt } });
    return 'renewed';
  } catch {
    return 'unavailable';
  }
}

/** Mantiene viva la sesión mientras el servidor MCP siga abierto. */
export function keepSessionRenewed(report: (message: string) => void = console.error, renew: () => Promise<RenewalResult> = renewRelaySession): () => void {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  const tick = async () => {
    const result = await renew();
    if (stopped) return;
    if (result === 'unavailable') report('No se pudo renovar la sesión universitaria sola. Ejecuta campus login.');
    timer = setTimeout(() => { void tick(); }, result === 'unavailable' ? RETRY_AFTER_FAILURE_MS : CHECK_INTERVAL_MS);
    timer.unref();
  };
  void tick();
  return () => { stopped = true; clearTimeout(timer); };
}
