import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RelayCredentialStore } from '../src/relay/auth.js';
import { captureWithProfile, clearLoginProfiles, loginProfileDir, SilentLoginUnavailable } from '../src/relay/local-login.js';
import { keepSessionRenewed, renewRelaySession, RENEW_BEFORE_MS } from '../src/relay/session-renewal.js';

const cookie = (domain = 'aulavirtual.upc.edu.pe') => ({ name: 'BbRouter', value: 'xsrf:abcd-1234', domain, path: '/', expires: -1, secure: true, httpOnly: true, sameSite: 'Lax' as const });
const sessionCapture = async () => ({ cookies: [cookie(), cookie('login.microsoftonline.com')], expiresAt: Date.now() + 3 * 3600_000 });

async function relay(t: any, loginStatus = 201) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'campus-renewal-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let base = '';
  const uploads: Array<{ authorization?: string; body: any }> = [];
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
      return reply({ tokens: { access_token: 'renewed-read', refresh_token: 'renewed-refresh', token_type: 'Bearer', scope: 'campus.read' } }, loginStatus);
    }
    return reply({ error: 'unexpected path' }, 404);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = new URL(`${base}/mcp`), store = new RelayCredentialStore(url, dir);
  const enroll = (expiresAt: number) => store.save({ redirectUrl: 'http://127.0.0.1:1/callback', client: { client_id: 'local-cli' },
    tokens: { access_token: 'old-read', refresh_token: 'old-refresh', token_type: 'Bearer', scope: 'campus.read' }, sessionUpload: { universityId: 'upc-pe', expiresAt } });
  return { url, store, uploads, enroll };
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
    const launch = (async (profile: string, options: any) => { launches.push({ dir: profile, headless: options.headless }); return context; }) as any;
    const capture = await captureWithProfile('upc-pe', new AbortController().signal, { headless: true, profileDir: path.join(dir, 'p'), launch });
    assert.equal(capture.cookies[0].domain, 'aulavirtual.upc.edu.pe');
    assert.deepEqual(launches, [{ dir: path.join(dir, 'p'), headless: true }]);
    assert.equal(fs.statSync(path.join(dir, 'p')).mode & 0o777, 0o700);
    assert.equal(closes, 1);
    const stuck = { ...context, newPage: async () => ({ ...page, waitForURL: async () => { throw new Error('timeout en Microsoft'); } }) };
    await assert.rejects(captureWithProfile('upc-pe', new AbortController().signal, { headless: true, profileDir: path.join(dir, 'p'), launch: (async () => stuck) as any }), SilentLoginUnavailable);
    assert.equal(closes, 2);
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

test('el temporizador renueva, reporta el fallo y se detiene', async () => {
  const messages: string[] = [];
  let calls = 0;
  const stop = keepSessionRenewed(message => messages.push(message), async () => { calls++; return 'unavailable'; });
  await new Promise(resolve => setTimeout(resolve, 20));
  stop();
  assert.equal(calls, 1);
  assert.match(messages[0], /campus login/);
});
