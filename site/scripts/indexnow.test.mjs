import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { INDEXNOW_KEY, WINDOW_DAYS, changedSince, collectEntries, limaDate, notifyChanged, parseSitemapIndex, parseUrlset, submit } from '../src/lib/indexnow.mjs';

const index = '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://campuscli.com/profes/sitemap.xml</loc></sitemap><sitemap><loc>https://campuscli.com/sitemap-0.xml</loc><lastmod>2026-11-23T00:00:00.000Z</lastmod></sitemap><sitemap><loc>https://otro.com/sitemap.xml</loc></sitemap></sitemapindex>';
const main = '<urlset><url><loc>https://campuscli.com/</loc></url><url><loc>https://campuscli.com/blog/a/</loc><lastmod>2026-11-22T00:00:00.000Z</lastmod></url><url><loc>https://campuscli.com/blog/b/</loc><lastmod>2026-08-04T00:00:00.000Z</lastmod></url><url><loc>https://campuscli.com/blog/futuro/</loc><lastmod>2027-01-01</lastmod></url></urlset>';
const profes = '<urlset><url><loc>https://campuscli.com/profes/upc/</loc></url><url><loc>https://campuscli.com/profes/upc/ana-perez/</loc><lastmod>2026-11-21</lastmod></url><url><loc>https://otro.com/x/</loc><lastmod>2026-11-22</lastmod></url></urlset>';
const sitemaps = { 'https://campuscli.com/sitemap-index.xml': index, 'https://campuscli.com/sitemap-0.xml': main, 'https://campuscli.com/profes/sitemap.xml': profes };

function fakeFetch(calls = []) {
  return async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === 'https://api.indexnow.org/indexnow') return new Response(null, { status: 202 });
    const body = sitemaps[String(url)];
    if (body === undefined) throw new Error(`sitemap ajeno pedido: ${url}`);
    return new Response(body, { status: 200 });
  };
}

test('lee el índice y solo sigue sitemaps propios', () => {
  assert.deepEqual(parseSitemapIndex(index), ['https://campuscli.com/profes/sitemap.xml', 'https://campuscli.com/sitemap-0.xml', 'https://otro.com/sitemap.xml']);
  assert.deepEqual(parseUrlset(main)[0], { loc: 'https://campuscli.com/', lastmod: undefined });
  assert.equal(parseUrlset(main)[1].lastmod, '2026-11-22');
});

test('avisa solo URLs propias con fecha dentro de la ventana', async () => {
  const { entries, errors } = await collectEntries({ fetchData: fakeFetch() });
  assert.deepEqual(errors, []);
  assert.deepEqual(changedSince(entries, '2026-11-21', '2026-11-23').sort(), ['https://campuscli.com/blog/a/', 'https://campuscli.com/profes/upc/ana-perez/']);
  assert.deepEqual(changedSince(entries, '2026-11-23', '2026-11-24'), []);
  // Sin tope, una fecha futura se repetiría cada día hasta llegar.
  assert.ok(changedSince(entries, '2026-11-21').includes('https://campuscli.com/blog/futuro/'));
});

test('la fecha de corte está en hora de Lima', () => {
  // 03:00 UTC del 23 son las 22:00 del 22 en Lima.
  assert.equal(limaDate(0, new Date('2026-11-23T03:00:00Z')), '2026-11-22');
  assert.equal(limaDate(1, new Date('2026-11-23T03:00:00Z')), '2026-11-21');
});

test('el envío lleva host, clave y ubicación de la clave', async () => {
  const calls = [];
  const result = await submit(['https://campuscli.com/blog/a/', 'https://otro.com/x/'], { fetchData: fakeFetch(calls) });
  assert.deepEqual(result, { submitted: 1, status: 202 });
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body, { host: 'campuscli.com', key: INDEXNOW_KEY, keyLocation: `https://campuscli.com/${INDEXNOW_KEY}.txt`, urlList: ['https://campuscli.com/blog/a/'] });
  assert.deepEqual(await submit([], { fetchData: fakeFetch() }), { submitted: 0, status: null });
});

test('el archivo de clave publicado coincide con la clave', () => {
  assert.equal(readFileSync(new URL(`../public/${INDEXNOW_KEY}.txt`, import.meta.url), 'utf8').trim(), INDEXNOW_KEY);
});

test('el aviso diario cubre la ventana en hora de Lima', async () => {
  const calls = [];
  const result = await notifyChanged({ fetchData: fakeFetch(calls), now: new Date('2026-11-22T15:00:00Z') });
  assert.equal(WINDOW_DAYS, 3);
  assert.equal(result.since, '2026-11-20');
  assert.equal(result.until, '2026-11-23');
  assert.deepEqual(result.urls.sort(), ['https://campuscli.com/blog/a/', 'https://campuscli.com/profes/upc/ana-perez/']);
  assert.deepEqual(result.errors, []);
  assert.deepEqual([result.submitted, result.status], [2, 202]);
  assert.equal(calls.filter(c => c.url === 'https://api.indexnow.org/indexnow').length, 1);
});

test('con all avisa todas las URLs propias y con dryRun no envía nada', async () => {
  const calls = [];
  const result = await notifyChanged({ all: true, dryRun: true, fetchData: fakeFetch(calls), now: new Date('2026-11-22T15:00:00Z') });
  assert.equal(result.urls.length, 6);
  assert.ok(result.urls.every(url => url.startsWith('https://campuscli.com/')));
  assert.equal(result.submitted, 0);
  assert.equal(calls.filter(c => c.url === 'https://api.indexnow.org/indexnow').length, 0);
});

test('un fallo de IndexNow no se oculta', async () => {
  const failing = async (url, options) => String(url).includes('indexnow.org') ? new Response(null, { status: 403 }) : fakeFetch()(url, options);
  await assert.rejects(notifyChanged({ fetchData: failing, now: new Date('2026-11-22T15:00:00Z') }), /403/);
});

test('un sitemap caído no frena el aviso de los demás', async () => {
  const calls = [];
  const flaky = async (url, options) => { calls.push({ url: String(url) }); return String(url).includes('/profes/') ? new Response('', { status: 503 }) : fakeFetch()(url, options); };
  const result = await notifyChanged({ fetchData: flaky, now: new Date('2026-11-22T15:00:00Z'), wait: async () => {} });
  assert.deepEqual(result.urls, ['https://campuscli.com/blog/a/']);
  assert.match(result.errors[0], /profes.*503/);
  assert.equal(calls.filter(c => c.url === 'https://api.indexnow.org/indexnow').length, 1);
});

test('el aviso diario corre en GitHub Actions, no como cron de Vercel', () => {
  // Vercel no registra crons en este sitio (se publica sin promover el despliegue).
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.crons, undefined);
  const workflow = readFileSync(new URL('../../.github/workflows/indexnow.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '23 11 \* \* \*'/);
  assert.match(workflow, /working-directory: site\s+[\s\S]*node scripts\/indexnow-submit\.mjs/);
  assert.ok(existsSync(new URL('./indexnow-submit.mjs', import.meta.url)));
});

test('un fallo pasajero del sitemap se reintenta y no queda como error', async () => {
  const waits = [];
  let profesCalls = 0;
  const flaky = async (url, options) => {
    if (String(url).includes('/profes/') && profesCalls++ < 2) return profesCalls === 1 ? new Response('', { status: 502 }) : Promise.reject(new Error('socket hang up'));
    return fakeFetch()(url, options);
  };
  const { entries, errors } = await collectEntries({ fetchData: flaky, wait: async ms => { waits.push(ms); } });
  assert.deepEqual(errors, []);
  assert.equal(profesCalls, 3);
  assert.deepEqual(waits, [2_000, 8_000]);
  assert.ok(entries.some(e => e.loc === 'https://campuscli.com/profes/upc/ana-perez/'));
});

test('un 404 del sitemap no se reintenta', async () => {
  let calls = 0;
  const missing = async (url, options) => String(url).includes('/profes/') ? (calls++, new Response('', { status: 404 })) : fakeFetch()(url, options);
  const { errors } = await collectEntries({ fetchData: missing, wait: async () => { throw new Error('no debía esperar'); } });
  assert.equal(calls, 1);
  assert.match(errors[0], /profes.*404/);
});

test('si IndexNow falla, los sitemaps sin leer viajan con el error', async () => {
  const both = async (url, options) => {
    if (String(url).includes('indexnow.org')) return new Response(null, { status: 429 });
    if (String(url).includes('/profes/')) return new Response('', { status: 500 });
    return fakeFetch()(url, options);
  };
  const error = await notifyChanged({ fetchData: both, now: new Date('2026-11-22T15:00:00Z'), wait: async () => {} }).catch(e => e);
  assert.match(error.message, /429/);
  assert.match(error.sitemapErrors[0], /profes.*500/);
});

test('las peticiones se identifican con un User-Agent propio', async () => {
  const calls = [];
  await notifyChanged({ fetchData: fakeFetch(calls), now: new Date('2026-11-22T15:00:00Z') });
  assert.ok(calls.length > 0);
  assert.ok(calls.every(c => /^campuscli-indexnow/.test(c.options.headers['User-Agent'])));
});
