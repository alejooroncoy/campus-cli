import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { captureLocalLogin, capturePayload, loginLocally, loginUniversity } from '../src/relay/local-login.js';
import { RelayCredentialStore } from '../src/relay/auth.js';
import { loginHosted } from '../src/relay/hosted-login.js';

const cookie = (domain = 'aulavirtual.upc.edu.pe') => ({ name: 'BbRouter', value: 'xsrf:abcd-1234', domain, path: '/', expires: -1, secure: true, httpOnly: true, sameSite: 'Lax' as const });

test('local capture filters identity providers, other universities and expired cookies before transfer', () => {
  const now = Date.now();
  const result = capturePayload([cookie(), cookie('.upc.edu.pe'), cookie('upn.blackboard.com'), cookie('login.microsoftonline.com'),
    cookie('accounts.google.com'), cookie('aulavirtual.upc.edu.pe.evil.test'), { ...cookie(), name: 'old', expires: now / 1000 - 1 }], 'upc-pe', now);
  assert.deepEqual(result.cookies.map(item => item.domain), ['aulavirtual.upc.edu.pe', '.upc.edu.pe']);
  assert.equal(result.expiresAt, now + 3 * 3600_000);
  assert.throws(() => capturePayload([cookie('login.microsoftonline.com')], 'upc-pe'), /sesión universitaria/);
  assert.throws(() => capturePayload([{ ...cookie(), value: `expires:${Math.floor(now / 1000) - 5}` }], 'upc-pe', now), /venció/);
  assert.throws(() => loginUniversity('__proto__'), /Universidad/);
});

test('Playwright opens only the selected university and closes its temporary context on success and failure', async () => {
  let closes = 0;
  const requests: string[] = [];
  const page = {
    goto: async (value: string) => { requests.push(value); },
    waitForURL: async (matches: (url: URL) => boolean) => {
      assert.ok(matches(new URL('https://upn.blackboard.com/ultra/courses')));
      assert.equal(matches(new URL('https://aulavirtual.upc.edu.pe/ultra')), false);
      assert.equal(matches(new URL('https://upn.blackboard.com.evil.test/ultra')), false);
    }, waitForTimeout: async () => {},
  };
  const browser = { newContext: async () => ({ newPage: async () => page, cookies: async () => [cookie('upn.blackboard.com')] }), close: async () => { closes++; } };
  const capture = await captureLocalLogin('upn-pe', new AbortController().signal, async () => browser as any);
  assert.equal(capture.cookies[0].domain, 'upn.blackboard.com');
  assert.equal(new URL(requests[0]).pathname, '/auth-saml/saml/login');
  assert.equal(closes, 1);
  const failed = { ...browser, newContext: async () => { throw new Error('private browser details'); } };
  await assert.rejects(captureLocalLogin('upn-pe', new AbortController().signal, async () => failed as any), /No se completó/);
  assert.equal(closes, 2);
  assert.equal(requests.length, 1, 'capture must not query courses, grades or materials');
});

async function relay(t: any, status = 201, hostedUniversity?: string, tokenScope?: string) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'campus-local-login-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let base = '', pkce = '';
  const received: any[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, base);
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString();
    const reply = (value: unknown, code = 200) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(value));
    if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return reply({ resource: `${base}/mcp`, authorization_servers: [base] });
    if (url.pathname.startsWith('/.well-known/oauth-authorization-server')) return reply({ issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`, token_endpoint: `${base}/oauth/token`, registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], scopes_supported: ['campus.identity', 'campus.read'] });
    if (url.pathname === '/oauth/register') return reply({ ...JSON.parse(raw), client_id: 'local-cli' }, 201);
    if (url.pathname === '/oauth/token') {
      const params = new URLSearchParams(raw);
      assert.equal(createHash('sha256').update(params.get('code_verifier')!).digest('base64url'), pkce);
      return reply({ access_token: 'identity-only', refresh_token: 'identity-refresh', token_type: 'Bearer', scope: tokenScope ?? (hostedUniversity ? 'campus.read' : 'campus.identity') });
    }
    if (url.pathname === '/v1/account') { assert.equal(req.headers.authorization, 'Bearer identity-only'); return reply({ account: { id: 'google:test', universityId: hostedUniversity ?? 'upc-pe' } }); }
    if (url.pathname === '/v1/cli/login' && req.method === 'GET') return reply({ localLogin: true, universities: ['upc-pe', 'upn-pe'] });
    if (url.pathname === '/v1/cli/login' && req.method === 'POST') {
      assert.equal(req.headers.authorization, 'Bearer identity-only'); received.push(JSON.parse(raw));
      return reply({ tokens: { access_token: 'verified-relay-read', refresh_token: 'verified-refresh', token_type: 'Bearer', scope: 'campus.read' } }, status);
    }
    return reply({ error: 'unexpected path' }, 404);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = new URL(`${base}/mcp`), store = new RelayCredentialStore(url, dir);
  return { url, store, received, openBrowser: async (authorize: URL) => {
    assert.equal(authorize.searchParams.get('scope'), hostedUniversity ? 'campus.read' : 'campus.identity');
    pkce = authorize.searchParams.get('code_challenge')!;
    const callback = new URL(authorize.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', authorize.searchParams.get('state')!); callback.searchParams.set('code', 'test-code');
    await fetch(callback);
  } };
}

test('complete local login uses identity-only OAuth, sends only filtered cookies and stores only the promoted relay grant', async t => {
  const f = await relay(t);
  await loginLocally({ ...f, consent: true, capture: async () => ({ cookies: [cookie(), cookie('login.microsoftonline.com')], expiresAt: Date.now() + 60_000 }) });
  assert.equal(f.received.length, 1);
  assert.deepEqual(Object.keys(f.received[0]).sort(), ['consent', 'cookies', 'expiresAt', 'universityId']);
  assert.equal(f.received[0].cookies.length, 1);
  assert.equal(f.store.load()?.tokens?.access_token, 'verified-relay-read');
  assert.equal(f.store.load()?.sessionUpload?.universityId, 'upc-pe', 'el consentimiento queda registrado para renovar después');
  const file = fs.readFileSync(f.store.file, 'utf8');
  assert.ok(!file.includes('BbRouter') && !file.includes('xsrf:') && !file.includes('identity-refresh'));
});

test('a rejected upload preserves the previous authorization and cannot enable local queries', async t => {
  const f = await relay(t, 403);
  f.store.save({ redirectUrl: 'http://127.0.0.1:1/callback', client: { client_id: 'previous' }, tokens: { access_token: 'previous-read', token_type: 'Bearer' } });
  await assert.rejects(loginLocally({ ...f, consent: true, capture: async () => capturePayload([cookie()], 'upc-pe') }), /no aceptó/);
  assert.equal(f.store.load()?.tokens?.access_token, 'previous-read');
});

test('cancelled consent and unsupported universities stop before Google, Playwright or an upload', async t => {
  const f = await relay(t);
  let opened = 0;
  const openBrowser = async () => { opened++; };
  await assert.rejects(loginLocally({ ...f, openBrowser, confirm: async () => false }), /cancelado/);
  await assert.rejects(loginLocally({ ...f, openBrowser, consent: true, universityId: 'palermo-ar' }), /universidad todavía/);
  assert.equal(opened, 0); assert.equal(f.received.length, 0); assert.equal(f.store.load(), undefined);
});

test('hosted Palermo login uses relay onboarding and stores only OAuth credentials without a cookie upload',async t=>{
  const f=await relay(t,201,'palermo-ar');
  await loginHosted({...f,universityId:'palermo-ar'});
  assert.equal(f.received.length,0);
  assert.equal(f.store.load()?.tokens?.scope,'campus.read');
  assert.ok(!fs.readFileSync(f.store.file,'utf8').includes('BbRouter'));
});

test('hosted login cannot silently connect another university or replace the prior authorization on mismatch',async t=>{
  const f=await relay(t,201,'upc-pe');
  f.store.save({redirectUrl:'http://127.0.0.1:1/callback',client:{client_id:'previous'},tokens:{access_token:'previous-read',token_type:'Bearer'}});
  await assert.rejects(loginHosted({...f,universityId:'palermo-ar'}),/no coincide/);
  assert.equal(f.store.load()?.tokens?.access_token,'previous-read');assert.equal(f.received.length,0);
});

test('a hosted grant without campus.read cannot enable queries or trigger a local upload',async t=>{
  const f=await relay(t,201,'palermo-ar','campus.identity');
  await assert.rejects(loginHosted({...f,universityId:'palermo-ar'}),/no habilitó/);
  assert.equal(f.store.load(),undefined);assert.equal(f.received.length,0);
});
