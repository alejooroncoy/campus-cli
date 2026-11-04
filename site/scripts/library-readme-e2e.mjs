// Standalone browser regression for the authenticated imported-report viewer.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';
import assert from 'node:assert/strict';

const css = await readFile(new URL('../public/biblioteca.css', import.meta.url), 'utf8');
const bundle = await build({ entryPoints: [new URL('../src/lib/library-unlock.ts', import.meta.url).pathname], bundle: true, format: 'esm', write: false });
const html = `<div align="center"><h3>Informe de prueba</h3><img src="/diagram.svg" width="80" alt="Diagrama del equipo" loading="lazy"></div>
<p>Primera línea<br>Segunda línea</p><img src="/missing.png" alt="Imagen ausente">
<div class="lib-doc-table" tabindex="0" role="region" aria-label="Tabla del informe"><table><thead><tr><th>Versión</th><th>Fecha</th><th>Autor</th><th>Descripción de modificación</th></tr></thead><tbody><tr><td>1.0</td><td>07/09/2026</td><td>Nombre del equipo</td><td>${'Una descripción extensa que conserva sus palabras. '.repeat(6)}</td></tr></tbody></table></div>`;
const server = createServer((req, res) => {
  if (req.url === '/api/app/session') { res.setHeader('content-type', 'application/json'); return res.end('{"authenticated":true}'); }
  if (req.url?.endsWith('/readme')) { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ html, truncated: false })); }
  if (req.url === '/unlock.js') { res.setHeader('content-type', 'text/javascript'); return res.end(bundle.outputFiles[0].text); }
  if (req.url === '/diagram.svg') { res.setHeader('content-type', 'image/svg+xml'); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="green"/></svg>'); }
  if (req.url === '/missing.png') { res.writeHead(404); return res.end(); }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="es"><meta name="viewport" content="width=device-width"><style>body{margin:0;padding:16px;font-family:Arial,sans-serif}${css}</style><main class="lib-site lib-public"><aside data-lib-source-card><span data-lib-locked>Bloqueado</span><span data-lib-unlocked hidden>GitHub</span></aside><section class="lib-doc" data-lib-doc data-work="11111111-1111-4111-8111-111111111111"><button data-lib-doc-print hidden>Guardar como PDF</button><div class="lib-doc-viewport"><div class="lib-doc-sheet" data-lib-doc-sheet></div><div data-lib-doc-lock>Inicia sesión</div></div></section></main><script type="module">import{unlockImported}from'/unlock.js';unlockImported();</script></html>`);
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
    await page.waitForFunction(() => document.querySelector('img[alt="Diagrama del equipo"]')?.naturalWidth > 0);
    await sheet.locator('.lib-doc-image-error').waitFor();
    assert.equal(await sheet.locator('p br').count(), 1);
    assert.equal(await sheet.getByRole('link', { name: 'Abrir imagen original' }).getAttribute('href'), `http://127.0.0.1:${server.address().port}/missing.png`);
    assert.equal(await page.locator('[data-lib-doc-print]').isVisible(), true);
    assert.equal(await page.locator('[data-lib-doc-lock]').isVisible(), false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no page overflow');
    assert.ok(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth), 'only the table scrolls horizontally');
    const region = sheet.getByRole('region', { name: 'Tabla del informe' });
    assert.equal(await region.getAttribute('tabindex'), '0');
    assert.ok(await region.locator('th').first().evaluate(el => el.clientWidth >= 98), 'version/date columns are legible');
    if (width < 700) assert.ok(await region.evaluate(el => el.scrollWidth > el.clientWidth), 'mobile table is horizontally scrollable');
    else assert.ok(await region.evaluate(el => el.scrollWidth <= el.clientWidth), 'four-column desktop table fits');
    console.log(`README viewer ${width}px: images, fallback, line breaks, table layout and print control passed`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
