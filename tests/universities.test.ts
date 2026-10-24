import assert from 'node:assert/strict';
import { test } from 'node:test';
import axios from 'axios';
import { createClient, assertBlackboardFileUrl, assertPublicApiUrl, assertTrustedBlackboardRedirect } from '../src/providers/blackboard/api/client.js';
import { blackboardCookies } from '../src/providers/blackboard/auth/session.js';
import { isBlackboardUltraUrl } from '../src/providers/blackboard/auth/login.js';
import { blackboardUniversity, blackboardLoginUrl } from '../src/providers/blackboard/universities.js';
import { extractEmbeddedFiles } from '../src/providers/blackboard/embedded-files.js';

const upn = 'https://upn.blackboard.com';
const upc = 'https://aulavirtual.upc.edu.pe';
const cookies = [
  { name: 'BbRouter', value: 'upn-session', domain: 'upn.blackboard.com', path: '/' },
  { name: 'BbRouter', value: 'upc-session', domain: 'aulavirtual.upc.edu.pe', path: '/' },
  { name: 'ESTSAUTH', value: 'identity', domain: 'login.microsoftonline.com', path: '/' },
  { name: 'lookalike', value: 'bad', domain: 'upn.blackboard.com.evil.test', path: '/' },
];

test('university selection preserves legacy UPC and rejects unknown values', () => {
  assert.equal(blackboardUniversity().origin, upc);
  assert.equal(blackboardUniversity('upn-pe').origin, upn);
  assert.throws(() => blackboardUniversity('unknown'), /Unsupported/);
  assert.throws(() => blackboardUniversity('__proto__'), /Unsupported/);
  assert.equal(new URL(blackboardLoginUrl('upn-pe')).searchParams.get('apId'), '_111_1');
});

test('navigation and cookie capture are bound to the selected university', () => {
  assert.equal(isBlackboardUltraUrl(`${upn}/ultra`, 'upn-pe'), true);
  assert.equal(isBlackboardUltraUrl(`${upc}/ultra`, 'upn-pe'), false);
  assert.equal(isBlackboardUltraUrl(`${upn}:444/ultra`, 'upn-pe'), false);
  assert.equal(isBlackboardUltraUrl('https://upn.blackboard.com.evil.test/ultra', 'upn-pe'), false);
  assert.deepEqual(blackboardCookies(cookies, 'upn-pe').map(c => c.value), ['upn-session']);
  assert.deepEqual(blackboardCookies(cookies).map(c => c.value), ['upc-session']);
});

test('UPN files and raw API URLs cannot cross into UPC', () => {
  assert.doesNotThrow(() => assertBlackboardFileUrl(`${upn}/bbcswebdav/file`, upn));
  assert.doesNotThrow(() => assertPublicApiUrl(`${upn}/learn/api/public/v1/users/me`, upn));
  assert.throws(() => assertPublicApiUrl(`${upc}/learn/api/public/v1/users/me`, upn));
  assert.throws(() => assertBlackboardFileUrl(`${upc}/bbcswebdav/file`, upn));
  assert.throws(() => assertTrustedBlackboardRedirect(`${upn}:444/file`, upn));
  const files = extractEmbeddedFiles('<a href="/bbcswebdav/file">material</a>', upn);
  assert.equal(files[0].downloadUrl, `${upn}/bbcswebdav/file`);
  assert.deepEqual(extractEmbeddedFiles(`<a href="${upc}/bbcswebdav/file">material</a>`, upn), []);
});

test('UPN client sends only UPN credentials and rejects cross-university requests before transport', async () => {
  const previous = axios.defaults.adapter;
  const requests: any[] = [];
  axios.defaults.adapter = async config => {
    requests.push(config);
    return { data: { university: config.baseURL }, status: 200, statusText: 'OK', headers: {}, config };
  };
  try {
    const client = createClient({ universityId: 'upn-pe', cookies, xsrfToken: 'nonce', expiresAt: Date.now() + 60_000 });
    await client.get('/learn/api/public/v1/users/me');
    assert.equal(requests[0].baseURL, upn);
    assert.equal(requests[0].headers.Cookie, 'BbRouter=upn-session');
    await assert.rejects(client.get(`${upc}/learn/api/public/v1/users/me`), /non-Blackboard/);
    await assert.rejects(client.get('/learn/api/public/v1/users/me', { baseURL: upc }), /override/);
    assert.equal(requests.length, 1);
    const headers = { Cookie: 'secret', 'X-Blackboard-XSRF': 'secret' };
    client.defaults.beforeRedirect!({ protocol: 'https:', hostname: 'files.blackboard.com', path: '/file', headers } as any, {} as any, {} as any);
    assert.deepEqual(headers, {});
  } finally {
    axios.defaults.adapter = previous;
  }
});
