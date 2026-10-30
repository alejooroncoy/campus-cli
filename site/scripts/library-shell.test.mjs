import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { libraryPage } from '../api/library.js';
import { renderLibraryShell } from '../src/lib/library-shell.mjs';

const template = await readFile(new URL('../.generated/library.html', import.meta.url), 'utf8');
const source = `<!doctype html><html><head><title>Proyecto &amp; apuntes | Campus</title><meta name="description" content="Un aporte de prueba."><meta name="robots" content="index,follow"><link rel="canonical" href="https://campuscli.com/biblioteca/"><script type="application/ld+json">{"@type":"LearningResource","name":"Proyecto"}</script></head><body><header class="lib-nav">OLD APP</header><main class="lib-container" id="contenido"><h1>Proyecto &amp; apuntes</h1><p>$& &lt;script&gt;texto&lt;/script&gt;</p><a href="/app/biblioteca/">Mis aportes</a></main></body></html>`;
const run = (path, options = {}) => libraryPage(new Request('https://campuscli.com' + path), {
  loadTemplate: async () => template,
  fetchData: async (url, init) => {
    assert.equal(url.origin, 'https://profes.campuscli.com');
    assert.equal(url.pathname, '/api/app/library/pages/');
    assert.equal(init.headers.Cookie, undefined);
    return new Response(source, { headers: { 'content-type': 'text/html' } });
  }, ...options,
});
test('public library shares the main website header and footer while keeping its SEO content', async () => {
  const response = await run('/biblioteca/');
  const html = await response.text();
  assert.equal(response.status, 200);
  for (const text of ['site-header', 'Qué ofrece', 'Planes', 'Conectar Campus a tu IA', 'href="/app/copilot/"', 'footer__inner', 'LearningResource', '<h1>Proyecto &amp; apuntes</h1>', '$& &lt;script&gt;texto&lt;/script&gt;', 'index,follow']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /OLD APP|__CAMPUS_LIBRARY_BODY__|shadcn-sidebar|app-mobile-nav/);
  assert.equal((html.match(/id="campus-content"/g) ?? []).length, 1);
  assert.equal((html.match(/<title>/g) ?? []).length, 1);
  assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1);
  const homepage = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.equal((homepage.match(/id="home-library-title"/g) ?? []).length, 1);
  assert.equal(html.match(/<header class="shell site-header">[\s\S]*?<\/header>/)?.[0], homepage.match(/<header class="shell site-header">[\s\S]*?<\/header>/)?.[0]);
  assert.match(html, /href="\/biblioteca\/">Biblioteca/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('filter URLs and noindex survive integration without forwarding account cookies', async () => {
  const response = await run('/api/library?route=/biblioteca/&q=SQL&tipo=proyecto', { fetchData: async (url, init) => {
    assert.equal(url.search, '?q=SQL&tipo=proyecto');
    assert.equal(init.headers.Cookie, undefined);
    return new Response(source.replace('content="index,follow"', 'content="noindex,follow"'), { headers: { 'content-type': 'text/html' } });
  } });
  assert.match(await response.text(), /name="robots" content="noindex,follow"/);
});
test('sitemaps, redirects, missing pages and outages retain their HTTP semantics', async () => {
  const xml = await run('/biblioteca/sitemap.xml', { fetchData: async () => new Response('<sitemapindex/>', { headers: { 'content-type': 'application/xml' } }) });
  assert.equal(await xml.text(), '<sitemapindex/>');
  const moved = await run('/biblioteca/', { fetchData: async () => new Response(null, { status: 308, headers: { location: '/biblioteca/trabajos/ejemplo-123/' } }) });
  assert.equal(moved.status, 308);
  assert.equal((await run('/biblioteca/', { fetchData: async () => new Response('', { status: 404 }) })).status, 404);
  assert.equal((await run('/biblioteca/', { fetchData: async () => { throw new Error('private'); } })).status, 503);
  const head = await libraryPage(new Request('https://campuscli.com/biblioteca/', { method: 'HEAD' }), { fetchData: async () => new Response(source, { headers: { 'content-type': 'text/html' } }), loadTemplate: async () => template });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
test('unrelated routes and malformed upstream pages fail closed', async () => {
  assert.equal((await run('/api/library?route=https://other.example')).status, 404);
  assert.throws(() => renderLibraryShell(template, '<h1>Broken page</h1>'), /LIBRARY_PAGE_INVALID/);
  assert.equal((await run('/biblioteca/', { fetchData: async () => new Response('broken', { headers: { 'content-type': 'text/html' } }) })).status, 503);
});
