import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import dns from 'node:dns/promises';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { researchDownload, researchJson } from '../src/providers/academic/research-http.js';

function mockHttp(t: TestContext, responses: Array<{ status: number; location?: string; body?: string; length?: string }>) {
  const requests: Array<{ url: URL; options: any }> = [];
  t.mock.method(https, 'request', ((url: URL, options: any, callback: (response: any) => void) => {
    requests.push({ url, options });
    const config = responses.shift();
    assert.ok(config, 'unexpected network request');
    const req = new EventEmitter() as any;
    req.end = () => {
      const res = Readable.from([Buffer.from(config.body ?? '')]) as any;
      res.statusCode = config.status;
      res.headers = { location: config.location, 'content-length': config.length, 'content-type': 'application/json' };
      queueMicrotask(() => callback(res));
    };
    return req;
  }) as any);
  return requests;
}

test('HTTP pins public DNS answers for both Node lookup modes and never sends campus credentials', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  const requests = mockHttp(t, [{ status: 200, body: '{"message":"ok"}' }]);
  assert.deepEqual(await researchJson('https://example.edu/metadata'), { message: 'ok' });
  const options = requests[0].options;
  options.lookup('example.edu', {}, (error: unknown, address: string, family: number) => {
    assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4);
  });
  options.lookup('example.edu', { all: true }, (error: unknown, addresses: unknown) => {
    assert.equal(error, null); assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }]);
  });
  assert.equal(options.headers.Cookie, undefined);
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.agent, false);
});

test('HTTP rejects private DNS answers including mixed public/private responses before connecting', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]);
  const requests = mockHttp(t, []);
  await assert.rejects(researchDownload('https://example.edu/file.pdf'), /privadas/);
  assert.equal(requests.length, 0);
});

test('PDF redirects are revalidated and cannot reach a metadata service', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  const requests = mockHttp(t, [{ status: 302, location: 'https://169.254.169.254/latest' }]);
  await assert.rejects(researchDownload('https://example.edu/file.pdf', { redirects: 4 }), /privadas/);
  assert.equal(requests.length, 1);
});

test('API credential headers never follow even a public redirect', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  const requests = mockHttp(t, [{ status: 302, location: 'https://another.example.edu/file' }]);
  await assert.rejects(researchDownload('https://example.edu/api', {
    headers: { Authorization: 'Bearer secret' }, redirects: 4,
  }), /Redirección/);
  assert.equal(requests.length, 1);
});

test('an ordinary Accept header may follow a public redirect', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  const requests = mockHttp(t, [
    { status: 302, location: 'https://cdn.example.edu/file.xml' },
    { status: 200, body: '<article>public</article>' },
  ]);
  const result = await researchDownload('https://example.edu/file.xml', {
    headers: { Accept: 'application/xml' }, redirects: 4,
  });
  assert.equal(result.bytes.toString(), '<article>public</article>');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.headers.Accept, 'application/xml');
});

test('HTTP enforces size caps both with and without Content-Length', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  mockHttp(t, [{ status: 200, body: '123456', length: '6' }, { status: 200, body: '123456' }]);
  for (let i = 0; i < 2; i++) await assert.rejects(researchDownload('https://example.edu/file', { maxBytes: 5 }), /tamaño/);
});

test('provider rate-limit and invalid JSON are errors, never empty successful searches', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  mockHttp(t, [{ status: 429 }, { status: 200, body: '<html>login</html>' }]);
  await assert.rejects(researchJson('https://example.edu/api'), /límite/);
  await assert.rejects(researchJson('https://example.edu/api'), /JSON/);
});

test('provider authentication errors distinguish invalid keys from missing permissions', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  mockHttp(t, [{ status: 401 }, { status: 403 }]);
  await assert.rejects(researchJson('https://example.edu/api'), /rechazó la clave/);
  await assert.rejects(researchJson('https://example.edu/api'), /no tiene permisos/);
});
