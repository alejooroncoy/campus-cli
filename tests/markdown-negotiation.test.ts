import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import proxy, { prefersMarkdown } from '../site/proxy.ts';

const ORIGIN = 'https://campuscli.com';
const request = (path: string, accept: string, method = 'GET', headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, { method, headers: { accept, ...headers } });

type Probe = { method?: string; url: string; redirect?: string; cookie?: string | null };

/** Replaces fetch with a HEAD probe that answers from a map of path -> status, and records every probe. */
const withTwins = async (twins: Record<string, number>, run: () => Promise<void>) => {
  const original = globalThis.fetch;
  const probed: Probe[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    probed.push({ method: init?.method, url: url.href, redirect: init?.redirect, cookie: new Headers(init?.headers).get('cookie') });
    return new Response(null, { status: twins[url.pathname] ?? 404 });
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
  return probed;
};

const isRewriteTo = (response: Response | undefined, path: string) => response?.headers.get('x-middleware-rewrite') === `${ORIGIN}${path}`;
const passesThrough = (response: Response | undefined) => response?.headers.get('x-middleware-next') === '1' && !response.headers.has('x-middleware-rewrite');
const TWIN = '/herramientas/formato-apa-7/index.md';

test('Accept parsing honours q values and never serves Markdown that was refused or ranked below HTML', () => {
  for (const accept of ['text/markdown', 'text/markdown;q=1', 'text/markdown ;q=1', 'TEXT/Markdown; q=0.9', 'text/html;q=0.5, text/markdown', 'text/markdown, text/html;q=0.5']) {
    assert.equal(prefersMarkdown(accept), true, accept);
  }
  for (const accept of ['', '*/*', 'text/html', 'text/html,application/xhtml+xml,*/*;q=0.8', 'text/markdown;q=0', 'text/html, text/markdown;q=0.1', 'text/x-markdown', 'text/markdown;q=abc']) {
    assert.equal(prefersMarkdown(accept), false, accept);
  }
});

test('a page with a Markdown twin is rewritten to it for GET and HEAD, probing the twin with a HEAD that does not follow redirects', async () => {
  const probed = await withTwins({ [TWIN]: 200 }, async () => {
    assert.ok(isRewriteTo(await proxy(request('/herramientas/formato-apa-7/', 'text/markdown')), TWIN));
    assert.ok(isRewriteTo(await proxy(request('/herramientas/formato-apa-7/', 'text/markdown', 'HEAD')), TWIN));
  });
  assert.equal(probed.length, 2);
  for (const probe of probed) {
    assert.equal(probe.method, 'HEAD');
    assert.equal(probe.url, `${ORIGIN}${TWIN}`);
    assert.equal(probe.redirect, 'manual');
  }
});

test('the rewrite response asks caches to vary on Accept', async () => {
  await withTwins({ [TWIN]: 200 }, async () => {
    const response = await proxy(request('/herramientas/formato-apa-7/', 'text/markdown'));
    assert.equal(response?.headers.get('vary'), 'Accept');
  });
});

test('the caller credentials reach the probe, so a protected preview can be tested', async () => {
  const probed = await withTwins({ [TWIN]: 200 }, async () => {
    await proxy(request('/herramientas/formato-apa-7/', 'text/markdown', 'GET', { cookie: '_vercel_jwt=abc' }));
  });
  assert.equal(probed[0].cookie, '_vercel_jwt=abc');
});

test('a page without a Markdown twin, or whose twin redirects, keeps serving HTML', async () => {
  await withTwins({}, async () => {
    assert.ok(passesThrough(await proxy(request('/app/', 'text/markdown'))));
  });
  await withTwins({ [TWIN]: 308 }, async () => {
    assert.ok(passesThrough(await proxy(request('/herramientas/formato-apa-7/', 'text/markdown'))));
  });
});

test('browsers, refused Markdown and other methods are not touched and cost no probe', async () => {
  const probed = await withTwins({ [TWIN]: 200 }, async () => {
    for (const [path, accept, method] of [
      ['/herramientas/formato-apa-7/', 'text/html,application/xhtml+xml,*/*;q=0.8', 'GET'],
      ['/herramientas/formato-apa-7/', '*/*', 'GET'],
      ['/herramientas/formato-apa-7/', 'text/markdown;q=0', 'GET'],
      ['/herramientas/formato-apa-7/', 'text/html, text/markdown;q=0.1', 'GET'],
      ['/herramientas/formato-apa-7', 'text/markdown', 'GET'],
      ['/herramientas/formato-apa-7/', 'text/markdown', 'POST'],
    ]) {
      assert.ok(passesThrough(await proxy(request(path, accept, method))), `${method} ${path} ${accept}`);
    }
  });
  assert.deepEqual(probed, []);
});

test('a path that is not a plain page path never builds a probe URL, so it cannot point at another host', async () => {
  const probed = await withTwins({}, async () => {
    for (const path of ['//evil/', '//2130706433/', '/%5Cevil/', '//evil%2ecom/', '/with.dot/', '/ñ/']) {
      const response = await proxy(new Request(`${ORIGIN}${path}`, { headers: { accept: 'text/markdown' } }));
      assert.ok(passesThrough(response), path);
    }
  });
  assert.deepEqual(probed, []);
});

test('if the probe throws or times out the page is served as HTML', async () => {
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

test('vercel.json points at the entrypoint and its matcher skips assets, the api, analytics, library routes and files', () => {
  const config = JSON.parse(readFileSync(new URL('../site/vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.proxy.entrypoint, 'proxy.ts');
  const [matcher] = config.proxy.matcher as string[];
  // Vercel compiles the matcher with path-to-regexp; the Next.js-style negative lookahead used here is also valid
  // as a JavaScript regular expression, which is the closest thing that can be checked locally.
  const compiled = new RegExp(`^${matcher}$`);
  for (const path of ['/', '/herramientas/formato-apa-7/', '/blog/organizar-tu-semana-blackboard/', '/app/']) assert.match(path, compiled, path);
  for (const path of ['/assets/og-default.jpg', '/_astro/x.js', '/api/professors', '/c-events/e/', '/biblioteca/x/', '/.well-known/ard.json', TWIN, '/sitemap-0.xml', '/robots.txt']) {
    assert.doesNotMatch(path, compiled, path);
  }
});
