import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RelayAuthProvider, RelayCredentialStore } from '../src/relay/auth.js';
import { captureWithProfile, clearLoginProfiles, loginProfileDir, SilentLoginUnavailable } from '../src/relay/local-login.js';
import { keepSessionRenewed, renewRelaySession, RENEW_BEFORE_MS, RENEWAL_AUTHORIZATION_MS } from '../src/relay/session-renewal.js';

const cookie = (domain = 'aulavirtual.upc.edu.pe') => ({ name: 'BbRouter', value: 'xsrf:abcd-1234', domain, path: '/', expires: -1, secure: true, httpOnly: true, sameSite: 'Lax' as const });
const sessionCapture = async () => ({ cookies: [cookie(), cookie('login.microsoftonline.com')], expiresAt: Date.now() + 3 * 3600_000 });

async function relay(t: any, loginStatus = 201) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'campus-renewal-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let base = '';
  const uploads: Array<{ authorization?: string; body: any }> = [];
  const hooks: { onUpload?: () => void } = {};
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, base);
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString();
    const reply = (value: unknown, code = 200) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(value));
    if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return reply({ resource: `${base}/mcp`, authorization_servers: [base] });
    if (url.pathname.startsWith('/.well-known/oauth-authorization-server')) return reply({ issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`, token_endpoint: `${base}/oauth/token`, registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'] });
    if (url.pathname === '/oauth/token') {
      assert.equal(new URLSearchParams(raw).get('grant_type'), 'refresh_token');
      return reply({ access_token: 'refreshed-read', refresh_token: 'rotated-refresh', token_type: 'Bearer', scope: 'campus.read' });
    }
    if (url.pathname === '/v1/cli/login' && req.method === 'POST') {
      uploads.push({ authorization: req.headers.authorization, body: JSON.parse(raw) });
      hooks.onUpload?.();
      return reply({ tokens: { access_token: 'renewed-read', refresh_token: 'renewed-refresh', token_type: 'Bearer', scope: 'campus.read' } }, loginStatus);
    }
    return reply({ error: 'unexpected path' }, 404);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = new URL(`${base}/mcp`), store = new RelayCredentialStore(url, dir);
  const enroll = (expiresAt: number, authorizedAt = Date.now()) => store.save({ redirectUrl: 'http://127.0.0.1:1/callback', client: { client_id: 'local-cli' },
    tokens: { access_token: 'old-read', refresh_token: 'old-refresh', token_type: 'Bearer', scope: 'campus.read' }, sessionUpload: { universityId: 'upc-pe', expiresAt, authorizedAt } });
  return { url, store, uploads, enroll, hooks };
}

test('sin autorización guardada no se abre el navegador ni se sube nada', async t => {
  const f = await relay(t);
  let captures = 0;
  assert.equal(await renewRelaySession({ ...f, capture: async () => { captures++; return sessionCapture(); } }), 'not-enrolled');
  f.store.save({ redirectUrl: 'http://127.0.0.1:1/callback', client: { client_id: 'x' }, tokens: { access_token: 'a', token_type: 'Bearer' } });
  assert.equal(await renewRelaySession({ ...f, capture: async () => { captures++; return sessionCapture(); } }), 'not-enrolled');
  assert.equal(captures, 0); assert.equal(f.uploads.length, 0);
});

test('una sesión con margen suficiente no se toca', async t => {
  const f = await relay(t);
  f.enroll(Date.now() + RENEW_BEFORE_MS + 5 * 60_000);
  let captures = 0;
  assert.equal(await renewRelaySession({ ...f, capture: async () => { captures++; return sessionCapture(); } }), 'fresh');
  assert.equal(captures, 0); assert.equal(f.uploads.length, 0);
});

test('cerca del vencimiento renueva con token refrescado y sube solo cookies de la universidad', async t => {
  const f = await relay(t);
  f.enroll(Date.now() + 60_000);
  assert.equal(await renewRelaySession({ ...f, capture: sessionCapture }), 'renewed');
  assert.equal(f.uploads.length, 1);
  assert.equal(f.uploads[0].authorization, 'Bearer refreshed-read');
  assert.deepEqual(Object.keys(f.uploads[0].body).sort(), ['consent', 'cookies', 'expiresAt', 'universityId']);
  assert.deepEqual(f.uploads[0].body.cookies.map((item: any) => item.domain), ['aulavirtual.upc.edu.pe']);
  const saved = f.store.load()!;
  assert.equal(saved.tokens?.access_token, 'renewed-read');
  assert.ok(saved.sessionUpload!.expiresAt - Date.now() > 2.9 * 3600_000, 'el vencimiento guardado se mueve ~3 h adelante');
  const file = fs.readFileSync(f.store.file, 'utf8');
  assert.ok(!file.includes('BbRouter') && !file.includes('xsrf:') && !file.includes('microsoftonline'));
});

test('si el SSO ya no recuerda la sesión, deja las credenciales como estaban', async t => {
  const f = await relay(t);
  f.enroll(Date.now() + 60_000);
  assert.equal(await renewRelaySession({ ...f, capture: async () => { throw new SilentLoginUnavailable(); } }), 'unavailable');
  assert.equal(f.uploads.length, 0);
  assert.equal(f.store.load()?.tokens?.access_token, 'old-read');
});

test('si el relay rechaza la subida no cambia tokens ni vencimiento', async t => {
  const f = await relay(t, 403);
  const before = Date.now() + 60_000;
  f.enroll(before);
  assert.equal(await renewRelaySession({ ...f, capture: sessionCapture }), 'unavailable');
  assert.equal(f.store.load()?.sessionUpload?.expiresAt, before);
  assert.equal(f.store.load()?.tokens?.access_token, 'refreshed-read', 'solo se conserva el refresh legítimo del token anterior');
});

test('captureWithProfile reutiliza el perfil, va en headless y cierra el contexto', async () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'campus-profile-'));
  try {
    const launches: Array<{ dir: string; headless?: boolean }> = [];
    let closes = 0;
    const page = { goto: async () => {}, waitForURL: async () => {}, waitForTimeout: async () => {} };
    const context = { newPage: async () => page, cookies: async () => [cookie()], close: async () => { closes++; } };
    const installs: Array<boolean | undefined> = [];
    const launch = (async (profile: string, options: any, extra?: { install?: boolean }) => { launches.push({ dir: profile, headless: options.headless }); installs.push(extra?.install); return context; }) as any;
    const capture = await captureWithProfile('upc-pe', new AbortController().signal, { headless: true, profileDir: path.join(dir, 'p'), launch });
    assert.equal(capture.cookies[0].domain, 'aulavirtual.upc.edu.pe');
    assert.deepEqual(launches, [{ dir: path.join(dir, 'p'), headless: true }]);
    assert.deepEqual(installs, [false], 'la captura en segundo plano nunca descarga Chromium');
    assert.equal(fs.statSync(path.join(dir, 'p')).mode & 0o777, 0o700);
    assert.equal(closes, 1);
    const stuck = { ...context, newPage: async () => ({ ...page, waitForURL: async () => { throw new Error('timeout en Microsoft'); } }) };
    await assert.rejects(captureWithProfile('upc-pe', new AbortController().signal, { headless: true, profileDir: path.join(dir, 'p'), launch: (async () => stuck) as any }), SilentLoginUnavailable);
    assert.equal(closes, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('captureWithProfile cierra el contexto sin navegar si se canceló mientras se lanzaba', async () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'campus-profile-'));
  try {
    const controller = new AbortController();
    let navigations = 0, pages = 0, closes = 0;
    const page = { goto: async () => { navigations++; }, waitForURL: async () => { navigations++; }, waitForTimeout: async () => {} };
    const context = { newPage: async () => { pages++; return page; }, cookies: async () => [cookie()], close: async () => { closes++; } };
    const launch = (async () => { await new Promise(resolve => setTimeout(resolve, 20)); controller.abort(new Error('puente cerrado')); return context; }) as any;
    await assert.rejects(captureWithProfile('upc-pe', controller.signal, { headless: true, profileDir: path.join(dir, 'p'), launch }), /puente cerrado/);
    assert.equal(navigations, 0, 'no debe navegar tras cancelarse');
    assert.equal(pages, 0, 'ni abrir una página');
    assert.equal(closes, 1, 'el navegador recién lanzado se cierra');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('UPC conserva su perfil histórico y cada universidad tiene el suyo; logout los borra', () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'campus-root-'));
  try {
    assert.equal(loginProfileDir('upc-pe', root), path.join(root, 'browser-profile'));
    assert.equal(loginProfileDir('palermo-ar', root), path.join(root, 'browser-profile-palermo-ar'));
    for (const id of ['upc-pe', 'upn-pe', 'palermo-ar'] as const) fs.mkdirSync(loginProfileDir(id, root));
    clearLoginProfiles(root);
    assert.deepEqual(fs.readdirSync(root), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('un fallo deja una espera: no se vuelve a abrir el navegador hasta que pase', async t => {
  const f = await relay(t);
  f.enroll(Date.now() + 60_000);
  let captures = 0;
  const capture = async () => { captures++; throw new SilentLoginUnavailable(); };
  assert.equal(await renewRelaySession({ ...f, capture }), 'unavailable');
  assert.equal(await renewRelaySession({ ...f, capture }), 'fresh');
  assert.equal(captures, 1);
  assert.ok(f.store.load()!.sessionUpload!.nextAttemptAt! > Date.now() + 50 * 60_000);
});

test('tras renovar no se vuelve a intentar antes de 30 minutos aunque la cookie capturada sea vieja', async t => {
  const f = await relay(t);
  f.enroll(Date.now() + 60_000);
  let captures = 0;
  const stale = async () => { captures++; return { cookies: [cookie()], expiresAt: Date.now() + 5 * 60_000 }; };
  assert.equal(await renewRelaySession({ ...f, capture: stale }), 'renewed');
  assert.equal(await renewRelaySession({ ...f, capture: stale }), 'fresh');
  assert.equal(captures, 1);
});

test('la autorización de renovar caduca a los 30 días y exige un nuevo campus login', async t => {
  const f = await relay(t);
  f.enroll(Date.now() + 60_000, Date.now() - RENEWAL_AUTHORIZATION_MS - 1000);
  let captures = 0;
  assert.equal(await renewRelaySession({ ...f, capture: async () => { captures++; return sessionCapture(); } }), 'unavailable');
  assert.equal(captures, 0); assert.equal(f.uploads.length, 0);
});

test('dos procesos con la misma sesión vencida renuevan una sola vez', async t => {
  const f = await relay(t);
  f.enroll(Date.now() + 60_000);
  let captures = 0;
  const slow = async () => { captures++; await new Promise(resolve => setTimeout(resolve, 150)); return sessionCapture(); };
  const results = await Promise.all([renewRelaySession({ ...f, capture: slow }), renewRelaySession({ ...f, capture: slow })]);
  assert.deepEqual(results.sort(), ['fresh', 'renewed']);
  assert.equal(captures, 1); assert.equal(f.uploads.length, 1);
});

test('un login nuevo mientras se renueva descarta el resultado y no mezcla cuentas', async t => {
  const f = await relay(t);
  f.enroll(Date.now() + 60_000);
  f.hooks.onUpload = () => f.store.save({ redirectUrl: 'http://127.0.0.1:2/callback', client: { client_id: 'new-login' },
    tokens: { access_token: 'new-account-read', refresh_token: 'new-refresh', token_type: 'Bearer', scope: 'campus.read' },
    sessionUpload: { universityId: 'upn-pe', expiresAt: Date.now() + 3 * 3600_000, authorizedAt: Date.now() + 5 } });
  assert.equal(await renewRelaySession({ ...f, capture: sessionCapture }), 'unavailable');
  const saved = f.store.load()!;
  assert.equal(saved.client.client_id, 'new-login');
  assert.equal(saved.tokens?.access_token, 'new-account-read');
  assert.equal(saved.tokens?.refresh_token, 'new-refresh');
  assert.equal(saved.sessionUpload?.universityId, 'upn-pe');
  assert.equal(saved.sessionUpload?.nextAttemptAt, undefined, 'no se hereda la espera del login anterior');
});

test('un logout mientras se renueva no reescribe credenciales', async t => {
  const f = await relay(t);
  f.enroll(Date.now() + 60_000);
  f.hooks.onUpload = () => f.store.clear();
  assert.equal(await renewRelaySession({ ...f, capture: sessionCapture }), 'unavailable');
  assert.equal(f.store.load(), undefined);
});

test('un proveedor atado a un login no guarda tokens si las credenciales cambiaron', async t => {
  const f = await relay(t);
  f.enroll(Date.now() + 60_000);
  const provider = new RelayAuthProvider(f.store, 'local-cli');
  provider.saveTokens({ access_token: 'same-login', token_type: 'Bearer' });
  assert.equal(f.store.load()?.tokens?.access_token, 'same-login');
  f.store.save({ ...f.store.load()!, client: { client_id: 'other-login' } });
  assert.throws(() => provider.saveTokens({ access_token: 'stale-login', token_type: 'Bearer' }), /campus login/);
  assert.equal(f.store.load()?.tokens?.access_token, 'same-login');
});

test('un archivo de credenciales dañado no lanza: devuelve no disponible', async t => {
  const f = await relay(t);
  fs.mkdirSync(path.dirname(f.store.file), { recursive: true });
  fs.writeFileSync(f.store.file, '{ no es json');
  assert.equal(await renewRelaySession({ ...f, capture: sessionCapture }), 'unavailable');
});

test('el temporizador sobrevive a una renovación que lanza y reporta el fallo', async () => {
  const messages: string[] = [];
  let calls = 0;
  const stop = keepSessionRenewed(message => messages.push(message), async () => { calls++; throw new Error('boom'); });
  await new Promise(resolve => setTimeout(resolve, 20));
  await stop();
  assert.equal(calls, 1);
  assert.match(messages[0], /campus login/);
});

test('al detenerse aborta la renovación en curso y espera a que termine', async () => {
  let sawAbort = false, finished = false;
  const stop = keepSessionRenewed(() => {}, signal => new Promise(resolve => {
    signal.addEventListener('abort', () => { sawAbort = true; setTimeout(() => { finished = true; resolve('unavailable'); }, 30); });
  }));
  await new Promise(resolve => setTimeout(resolve, 10));
  await stop();
  assert.ok(sawAbort); assert.ok(finished, 'stop() no debe volver antes de que la renovación cierre el navegador');
});
