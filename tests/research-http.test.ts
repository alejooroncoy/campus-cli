import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import dns from 'node:dns/promises';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { researchDownload, researchJson, resolvedPublicHttpsUrl, ResearchHttpError, ResearchBrowserAccessError } from '../src/providers/academic/research-http.js';

function mockHttp(t: TestContext, responses: Array<{ status: number; location?: string; body?: string; length?: string; retryAfter?: string; rateRemaining?: string }>) {
  const requests: Array<{ url: URL; options: any }> = [];
  t.mock.method(https, 'request', ((url: URL, options: any, callback: (response: any) => void) => {
    requests.push({ url, options });
    const config = responses.shift();
    assert.ok(config, 'unexpected network request');
    const req = new EventEmitter() as any;
    req.end = () => {
      const res = Readable.from([Buffer.from(config.body ?? '')]) as any;
      res.statusCode = config.status;
      res.headers = { location: config.location, 'content-length': config.length, 'content-type': 'application/json', 'retry-after': config.retryAfter, 'x-ratelimit-remaining': config.rateRemaining };
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

test('resource links reject provider hostnames that resolve to private addresses', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '10.0.0.8', family: 4 }]);
  await assert.rejects(resolvedPublicHttpsUrl('https://catalog.example.edu/article.pdf'), /privadas/);
  await assert.rejects(resolvedPublicHttpsUrl('https://127.0.0.1/article.pdf'), /privadas/);
});

test('resource-link DNS validation has a bounded deadline', async () => {
  const neverResolves = (() => new Promise(() => {})) as typeof dns.lookup;
  await assert.rejects(resolvedPublicHttpsUrl('https://catalog.example.edu/article.pdf', neverResolves, 5), /DNS agotado/);
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

test('the UPCH legacy redirect reaches the same bitstream entirely over HTTPS', async t => {
  const bitstream = '51bad407-ef26-4045-949c-8bb6ff6b08e0';
  const content = `https://repositorio.upch.edu.pe/server/api/core/bitstreams/${bitstream}/content`;
  const lookups: string[] = [];
  t.mock.method(dns, 'lookup', async (host: string) => {
    lookups.push(host); return [{ address: '8.8.8.8', family: 4 }];
  });
  const requests = mockHttp(t, [
    { status: 301, location: `http://repositorio.upch.edu.pe/bitstreams/${bitstream}/download` },
    { status: 302, location: content },
    { status: 200, body: '%PDF-public-bitstream' },
  ]);
  const result = await researchDownload('https://repositorio.upch.edu.pe/bitstream/20.500.12866/15479/1/thesis.pdf', { redirects: 4 });
  assert.equal(result.url, content);
  assert.equal(result.bytes.toString(), '%PDF-public-bitstream');
  assert.equal(requests.length, 3);
  assert.equal(lookups.length, 3, 'each upgraded/redirected hop must be revalidated');
  assert.ok(requests.every(request => request.url.protocol === 'https:' && !request.options.headers.Cookie));
});

test('UPCH recovery never upgrades other hosts, paths, credential URLs or custom ports', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  const bitstream = '/bitstreams/51bad407-ef26-4045-949c-8bb6ff6b08e0/download';
  const targets = [
    `http://other.example.edu${bitstream}`, `http://repositorio.upch.edu.pe.evil.example${bitstream}`,
    'http://repositorio.upch.edu.pe/login', `http://user:secret@repositorio.upch.edu.pe${bitstream}`,
    `http://repositorio.upch.edu.pe:8080${bitstream}`, `http://repositorio.upch.edu.pe${bitstream}?token=secret`,
  ];
  const requests = mockHttp(t, targets.map(location => ({ status: 301, location })));
  for (const _target of targets) await assert.rejects(researchDownload('https://repositorio.upch.edu.pe/old.pdf', { redirects: 4 }), /HTTPS pública/);
  assert.equal(requests.length, targets.length);
});

test('a verified UPCH HTTPS upgrade still rejects private DNS answers and credential redirects', async t => {
  const location = 'http://repositorio.upch.edu.pe/bitstreams/51bad407-ef26-4045-949c-8bb6ff6b08e0/download';
  let lookups = 0;
  t.mock.method(dns, 'lookup', async () => [{ address: ++lookups === 2 ? '10.0.0.8' : '8.8.8.8', family: 4 }]);
  const requests = mockHttp(t, [{ status: 301, location }, { status: 301, location }]);
  await assert.rejects(researchDownload('https://repositorio.upch.edu.pe/old.pdf', { redirects: 4 }), /privadas/);
  assert.equal(requests.length, 1);
  await assert.rejects(researchDownload('https://repositorio.upch.edu.pe/api', {
    headers: { 'X-Api-Key': 'secret' }, redirects: 4,
  }), /Redirección/);
  assert.equal(requests.length, 2);
});

test('Nature PDF and HTML access challenges stop before cookies or script-dependent pages', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  const requests = mockHttp(t, [
    { status: 303, location: 'https://idp.nature.com/authorize?redirect_uri=https%3A%2F%2Fwww.nature.com' },
    { status: 303, location: 'https://idp.nature.com/authorize' },
  ]);
  for (const path of ['/articles/s41597-026-08240-w.pdf', '/articles/s41597-026-08240-w']) {
    await assert.rejects(researchDownload(`https://www.nature.com${path}`, { redirects: 4 }), ResearchBrowserAccessError);
  }
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.url.hostname === 'www.nature.com'));
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
  await assert.rejects(researchJson('https://example.edu/api', { Authorization: 'Bearer secret' }), /rechazó la clave/);
  await assert.rejects(researchJson('https://example.edu/api', { 'X-Api-Key': 'secret' }), /no tiene permisos/);
});

test('public page authentication errors do not claim an API key was used', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  mockHttp(t, [{ status: 401 }, { status: 403 }]);
  await assert.rejects(researchDownload('https://example.edu/article.html', { headers: { Accept: 'text/html' } }), /iniciar sesión/);
  await assert.rejects(researchDownload('https://example.edu/article.html', { headers: { Accept: 'text/html' } }), /lectura automática/);
});

test('the journal temporary 403 request limit is recognized by its bounded response', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  mockHttp(t, [{ status: 403, body: 'Acceso denegado temporalmente por exceso de peticiones.' }]);
  await assert.rejects(researchDownload('https://revistas.uh.cu/revflacso/article/view/7514'),
    (error: unknown) => error instanceof ResearchHttpError && error.rateLimited === true);
});

test('document Accept header follows a public redirect without forwarding credentials', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  const requests = mockHttp(t, [
    { status: 302, location: 'https://cdn.example.edu/article.html' },
    { status: 200, body: '<html>Public article</html>' },
  ]);
  const result = await researchDownload('https://publisher.example.edu/article', {
    accept: 'text/html', redirects: 4,
  });
  assert.equal(result.url, 'https://cdn.example.edu/article.html');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.headers.Accept, 'text/html');
  assert.equal(requests[1].options.headers.Authorization, undefined);
});

test('metadata fetch retries one short provider cooldown and one transient 503', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  const requests = mockHttp(t, [
    { status: 429, retryAfter: '0' }, { status: 200, body: '{"source":"openalex"}' },
    { status: 503 }, { status: 200, body: '{"source":"crossref"}' },
  ]);
  assert.deepEqual(await researchJson('https://example.edu/openalex'), { source: 'openalex' });
  assert.deepEqual(await researchJson('https://example.edu/crossref'), { source: 'crossref' });
  assert.equal(requests.length, 4);
});

test('metadata fetch respects a long Retry-After without retrying', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  const requests = mockHttp(t, [{ status: 429, retryAfter: '60' }]);
  await assert.rejects(researchJson('https://example.edu/openalex'), /límite/);
  assert.equal(requests.length, 1);
});

test('OpenAlex retries one 429 without Retry-After only while its reported budget remains', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  const requests = mockHttp(t, [
    { status: 429, rateRemaining: '3' }, { status: 200, body: '{"results":[]}' },
    { status: 429, rateRemaining: '0' },
  ]);
  assert.deepEqual(await researchJson('https://api.openalex.org/works?search=test'), { results: [] });
  await assert.rejects(researchJson('https://api.openalex.org/works?search=test'), /límite/);
  assert.equal(requests.length, 3);
});
