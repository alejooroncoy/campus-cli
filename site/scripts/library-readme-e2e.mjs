// Standalone browser regression for the authenticated imported-report viewer.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';
import assert from 'node:assert/strict';

const css = await readFile(new URL('../public/biblioteca.css', import.meta.url), 'utf8');
const bundle = await build({ entryPoints: [new URL('../src/lib/library-unlock.ts', import.meta.url).pathname], bundle: true, format: 'esm', write: false });
const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
let legacyWorker = false;
const imageServer = createServer((req, res) => {
  if (req.url === '/diagram.svg') { res.setHeader('content-type', 'image/svg+xml'); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="green"/></svg>'); }
  res.writeHead(404); res.end();
});
await new Promise(resolve => imageServer.listen(0, '127.0.0.1', resolve));
const imageOrigin = `http://127.0.0.1:${imageServer.address().port}`;
const policy = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' ${imageOrigin}; connect-src 'self';`;
const html = `<div align="center"><h3>Informe de prueba</h3><img src="${imageOrigin}/diagram.svg" width="80" alt="Diagrama del equipo" loading="lazy"></div>
<p>Primera línea<br>Segunda línea</p><img src="${imageOrigin}/missing.png" alt="Imagen ausente">
<div class="lib-doc-table" tabindex="0" role="region" aria-label="Tabla del informe"><table><thead><tr><th>Versión</th><th>Fecha</th><th>Autor</th><th>Descripción de modificación</th></tr></thead><tbody><tr><td>1.0</td><td>07/09/2026</td><td>Nombre del equipo</td><td>${'Una descripción extensa que conserva sus palabras. '.repeat(6)}</td></tr></tbody></table></div>`;
const server = createServer((req, res) => {
  res.setHeader('Content-Security-Policy', policy);
  if (req.url === '/sw.js') { res.setHeader('content-type', 'text/javascript'); return res.end(legacyWorker ? worker.replace('  if (url.origin !== self.location.origin) return;', '') : worker); }
  if (req.url === '/library-offline-assets.json') { res.setHeader('content-type', 'application/json'); return res.end('[]'); }
  if (req.url === '/init.js') {
    res.setHeader('content-type', 'text/javascript');
    return res.end(`import {unlockImported} from '/unlock.js';
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
      unlockImported();`);
  }
  if (req.url === '/api/app/session') { res.setHeader('content-type', 'application/json'); return res.end('{"authenticated":true}'); }
  if (req.url?.endsWith('/readme')) { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ html, truncated: false })); }
  if (req.url === '/unlock.js') { res.setHeader('content-type', 'text/javascript'); return res.end(bundle.outputFiles[0].text); }
  if (req.url === '/diagram.svg') { res.setHeader('content-type', 'image/svg+xml'); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="green"/></svg>'); }
  if (req.url === '/missing.png') { res.writeHead(404); return res.end(); }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="es"><meta name="viewport" content="width=device-width"><style>body{margin:0;padding:16px;font-family:Arial,sans-serif}${css}</style><main class="lib-site lib-public"><aside data-lib-source-card><span data-lib-locked>Bloqueado</span><span data-lib-unlocked hidden>GitHub</span></aside><section class="lib-doc" data-lib-doc data-work="11111111-1111-4111-8111-111111111111"><button data-lib-doc-print hidden>Guardar como PDF</button><div class="lib-doc-viewport"><div class="lib-doc-sheet" data-lib-doc-sheet></div><div data-lib-doc-lock>Inicia sesión</div></div></section></main><script type="module" src="/init.js"></script></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browserName = process.env.CAMPUS_LIBRARY_TEST_BROWSER || 'chromium';
const browser = await ({ chromium, firefox, webkit })[browserName].launch();
try {
  for (const width of [1200, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    // Reproduce deferred/cached selection before image decoding: it must stay mounted.
    await page.addInitScript(() => Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const sheet = page.locator('[data-lib-doc-sheet]');
    await page.locator('[data-lib-doc][data-unlocked]').waitFor();
    assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true, 'the report must be controlled by the real service worker');
    await page.waitForFunction(() => document.querySelector('img[alt="Diagrama del equipo"]')?.naturalWidth > 0, null, { timeout: 5000 });
    await sheet.locator('.lib-doc-image-error').waitFor();
    assert.equal(await sheet.locator('p br').count(), 1);
    assert.equal(await sheet.getByRole('link', { name: 'Abrir imagen original' }).getAttribute('href'), `${imageOrigin}/missing.png`);
    assert.equal(await page.locator('[data-lib-doc-print]').isVisible(), true);
    assert.equal(await page.locator('[data-lib-doc-lock]').isVisible(), false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no page overflow');
    assert.ok(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth), 'only the table scrolls horizontally');
    const region = sheet.getByRole('region', { name: 'Tabla del informe' });
    assert.equal(await region.getAttribute('tabindex'), '0');
    assert.ok(await region.locator('th').first().evaluate(el => el.clientWidth >= 98), 'version/date columns are legible');
    if (width < 700) assert.ok(await region.evaluate(el => el.scrollWidth > el.clientWidth), 'mobile table is horizontally scrollable');
    else assert.ok(await region.evaluate(el => el.scrollWidth <= el.clientWidth), 'four-column desktop table fits');
    const cachedURLs = await page.evaluate(async () => { const requests = await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => request.url))); return requests.flat(); });
    assert.ok(cachedURLs.every(url => new URL(url).origin !== imageOrigin && !new URL(url).pathname.startsWith('/api/')), 'external images and private API responses must never enter the shell cache');
    console.log(`README viewer ${width}px: active service worker, external images, cache isolation, fallback, line breaks, table layout and print control passed`);
    await page.close();
  }
  // Existing students already have the previous worker installed. Verify the
  // update fixes an actually failed report without asking them to clear data.
  legacyWorker = true;
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('.lib-doc-image-error').filter({ hasText: 'Diagrama del equipo' }).waitFor();
  legacyWorker = false;
  let reloads = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) reloads++; });
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.waitForFunction(() => document.querySelector('img[alt="Diagrama del equipo"]')?.naturalWidth > 0, null, { timeout: 10000 });
  assert.equal(reloads, 1, 'an outdated worker refreshes the failed report once');
  assert.equal(await page.locator('.lib-doc-image-error').filter({ hasText: 'Diagrama del equipo' }).count(), 0);
  console.log('README viewer: existing worker update recovers external images automatically');
  await page.close();
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => imageServer.close(resolve));
}
