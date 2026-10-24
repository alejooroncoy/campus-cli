import { createHash, randomBytes, randomUUID, createPublicKey, verify } from 'node:crypto';
export const MIUPC_PORTAL = 'https://estudiante.upc.edu.pe';
export const MIUPC_API = 'https://mibe.upc.edu.pe';
export const MIUPC_PROCEDURES_API = 'https://tramitesbe.upc.edu.pe';
const TENANT = '0e0cb060-09ad-49f5-a005-68b9b49aa1f6';
const AUTHORITY = `https://login.microsoftonline.com/${TENANT}`;
const CLIENT_ID = '96437ad2-7878-4bf1-9418-3ddad181b672';
const REDIRECT_URI = `${MIUPC_PORTAL}/auth/`;
type Row = Record<string, any>;
const object = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
export type MiupcFetch = typeof fetch;
export type MiupcCookie = { name: string; value: string; domain: string; path?: string; expires?: number; secure?: boolean };
export class MiupcPortalError extends Error {
  constructor(public readonly code: 'MIUPC_RECONNECT_REQUIRED' | 'MIUPC_UNAVAILABLE' | 'MIUPC_INVALID_RESPONSE' | 'MIUPC_NOT_ENROLLED' | 'MIUPC_WRONG_UNIVERSITY', message: string) { super(message);this.name='MiupcPortalError'; }
}
const reconnect = () => new MiupcPortalError('MIUPC_RECONNECT_REQUIRED','Vuelve a conectar tu cuenta UPC para consultar Mi UPC.');
const invalid = () => new MiupcPortalError('MIUPC_INVALID_RESPONSE','Mi UPC devolvió una respuesta no reconocida.');
const unavailable = () => new MiupcPortalError('MIUPC_UNAVAILABLE','Mi UPC no respondió correctamente. Intenta nuevamente.');
const studentCode = (v: unknown) => {
  if (typeof v !== 'string' || !/^U\d{9}$/i.test(v)) throw reconnect();
  return v.toUpperCase();
};
async function jsonResponse(response: Response): Promise<any> {
  if (!response.body) throw invalid();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 4 * 1024 * 1024) { await reader.cancel(); throw invalid(); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (e) { if (e instanceof MiupcPortalError) throw e; throw invalid(); }
  finally { reader.releaseLock(); }
}
async function request(fetcher: MiupcFetch, url: string | URL, options: RequestInit = {}) {
  try { return await fetcher(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(20_000) }); }
  catch { throw unavailable(); }
}
function jwtPart(part: string): Row {
  try { const value = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); if (object(value)) return value; } catch {}
  throw reconnect();
}
export type MiupcAccess = { accessToken: string; expiresAt: number; studentCode: string };
/** Existing SSO only. No password, interactive consent, or cross-university fallback. */
export async function authenticateMiupc(input: { universityId: string; cookies: MiupcCookie[]; expectedStudentCode: string }, fetcher: MiupcFetch = fetch): Promise<MiupcAccess> {
  if (input.universityId !== 'upc-pe') throw new MiupcPortalError('MIUPC_WRONG_UNIVERSITY', 'Esta consulta requiere una sesión UPC.');
  const expected = studentCode(input.expectedStudentCode);
  const cookie = input.cookies.filter(c => {
    const domain = c.domain.replace(/^\./, '').toLowerCase();
    return (domain === 'login.microsoftonline.com' || domain === 'microsoftonline.com')
      && (!c.path || c.path === '/' || new URL(AUTHORITY).pathname.startsWith(c.path))
      && (c.expires === undefined || c.expires === -1 || c.expires * 1000 > Date.now())
      && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(c.name) && !/[;\r\n]/.test(c.value);
  }).map(c => `${c.name}=${c.value}`).join('; ');
  if (!cookie) throw reconnect();
  const verifier = randomBytes(32).toString('base64url'), state = randomUUID(), nonce = randomUUID();
  const authorization = new URL(`${AUTHORITY}/oauth2/v2.0/authorize`);
  authorization.search = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', response_mode: 'fragment',
    scope: 'openid profile User.Read', prompt: 'none', login_hint: `${expected.toLowerCase()}@upc.edu.pe`,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state, nonce }).toString();
  const response = await request(fetcher, authorization, { headers: { cookie, 'user-agent': 'Mozilla/5.0' } });
  let location: URL;
  try { location = new URL(response.headers.get('location') ?? ''); } catch { throw reconnect(); }
  if (response.status !== 302 || location.origin + location.pathname !== REDIRECT_URI) throw reconnect();
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.get('state') !== state || !params.get('code') || params.has('error')) throw reconnect();
  const tokenResponse = await request(fetcher, `${AUTHORITY}/oauth2/v2.0/token`, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: MIUPC_PORTAL },
    body: new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code', code: params.get('code')!, code_verifier: verifier }) });
  if (!tokenResponse.ok) throw tokenResponse.status >= 500 ? unavailable() : reconnect();
  const token = await jsonResponse(tokenResponse);
  if (typeof token.access_token !== 'string' || typeof token.id_token !== 'string' || !Number.isFinite(token.expires_in) || token.expires_in <= 0) throw reconnect();
  const parts = token.id_token.split('.'); if (parts.length !== 3) throw reconnect();
  const header = jwtPart(parts[0]), claims = jwtPart(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || claims.nonce !== nonce || claims.aud !== CLIENT_ID || claims.tid !== TENANT
    || claims.iss !== `${AUTHORITY}/v2.0` || typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()
    || (typeof claims.nbf === 'number' && claims.nbf * 1000 > Date.now() + 60_000)
    || typeof claims.preferred_username !== 'string' || !/^u\d{9}@upc\.edu\.pe$/i.test(claims.preferred_username)
    || studentCode(claims.preferred_username.split('@')[0]) !== expected) throw reconnect();
  const keysResponse = await request(fetcher, `${AUTHORITY}/discovery/v2.0/keys`);
  if (!keysResponse.ok) throw unavailable();
  const keys = await jsonResponse(keysResponse);
  const jwk = Array.isArray(keys.keys) ? keys.keys.find((k: any) => k.kid === header.kid && k.kty === 'RSA' && k.use === 'sig') : undefined;
  try {
    if (!jwk || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw reconnect();
  } catch { throw reconnect(); }
  return { accessToken: token.access_token, expiresAt: Math.min(Date.now() + token.expires_in * 1000, claims.exp * 1000), studentCode: expected };
}

