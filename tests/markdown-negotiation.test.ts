import assert from 'node:assert/strict';
import test from 'node:test';
import proxy from '../site/proxy.ts';

const ORIGIN = 'https://campuscli.com';
const request = (path: string, accept: string, method = 'GET') =>
  new Request(`${ORIGIN}${path}`, { method, headers: { accept } });

/** Replaces fetch with a HEAD probe that answers from a set of existing Markdown twins. */
const withTwins = async (twins: string[], run: () => Promise<void>) => {
  const original = globalThis.fetch;
  const probed: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    probed.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    return new Response(null, { status: twins.includes(url.pathname) ? 200 : 404 });
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
  return probed;
};

const isRewriteTo = (response: Response | undefined, path: string) =>
  response?.headers.get('x-middleware-rewrite') === `${ORIGIN}${path}`;
const passesThrough = (response: Response | undefined) =>
  response?.headers.get('x-middleware-next') === '1' && !response.headers.has('x-middleware-rewrite');

test('a page that has a Markdown twin is rewritten to it when Markdown is asked for', async () => {
  const probed = await withTwins(['/herramientas/formato-apa-7/index.md'], async () => {
    assert.ok(isRewriteTo(await proxy(request('/herramientas/formato-apa-7/', 'text/markdown')), '/herramientas/formato-apa-7/index.md'));
    assert.ok(isRewriteTo(await proxy(request('/herramientas/formato-apa-7/', 'text/html;q=0.5, TEXT/Markdown; q=1')), '/herramientas/formato-apa-7/index.md'));
  });
  assert.deepEqual(probed, ['HEAD /herramientas/formato-apa-7/index.md', 'HEAD /herramientas/formato-apa-7/index.md']);
});

test('a page without a Markdown twin keeps serving HTML, never a not-found body', async () => {
  await withTwins([], async () => {
    assert.ok(passesThrough(await proxy(request('/app/', 'text/markdown'))));
  });
});

test('browsers and non-page requests are not touched and cost no probe', async () => {
  const probed = await withTwins(['/herramientas/formato-apa-7/index.md'], async () => {
    assert.ok(passesThrough(await proxy(request('/herramientas/formato-apa-7/', 'text/html,application/xhtml+xml,*/*;q=0.8'))));
    assert.ok(passesThrough(await proxy(request('/herramientas/formato-apa-7/', '*/*'))));
    assert.ok(passesThrough(await proxy(request('/herramientas/formato-apa-7', 'text/markdown')))); // sin barra final: no es una página
    assert.ok(passesThrough(await proxy(request('/herramientas/formato-apa-7/', 'text/markdown', 'POST'))));
    assert.ok(passesThrough(await proxy(request('/herramientas/formato-apa-7/', 'text/x-markdown-not-really'))));
  });
  assert.deepEqual(probed, []);
});

test('if the probe throws the page is served as HTML', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;
  try {
    assert.ok(passesThrough(await proxy(request('/herramientas/formato-apa-7/', 'text/markdown'))));
  } finally {
    globalThis.fetch = original;
  }
});

test('the matcher in vercel.json skips assets, the api, and anything with a file extension', async () => {
  const { readFileSync } = await import('node:fs');
  const config = JSON.parse(readFileSync(new URL('../site/vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.proxy.entrypoint, 'proxy.ts');
  const [matcher] = config.proxy.matcher as string[];
  const compiled = new RegExp(`^${matcher.replace(/^\//, '/').replace(/\(\?!/g, '(?!')}$`);
  for (const path of ['/', '/herramientas/formato-apa-7/', '/blog/organizar-tu-semana-blackboard/', '/app/']) assert.match(path, compiled, path);
  for (const path of ['/assets/og-default.jpg', '/_astro/x.js', '/api/professors', '/herramientas/formato-apa-7/index.md', '/sitemap-0.xml', '/robots.txt']) {
    assert.doesNotMatch(path, compiled, path);
  }
});
