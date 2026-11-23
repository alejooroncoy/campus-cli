import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INDEXNOW_KEY, changedSince, collectEntries, limaDate, parseSitemapIndex, parseUrlset, submit } from '../src/lib/indexnow.mjs';
import { indexNow, WINDOW_DAYS } from '../api/indexnow.js';

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

test('el endpoint exige CRON_SECRET y el Bearer correcto', async () => {
  const now = new Date('2026-11-22T15:00:00Z');
  const cron = { 'user-agent': 'vercel-cron/1.0' };
  const missing = await indexNow(new Request('https://campuscli.com/api/indexnow/', { headers: cron }), { fetchData: fakeFetch(), env: {}, now });
  assert.equal(missing.status, 503);
  const spoofed = await indexNow(new Request('https://campuscli.com/api/indexnow/', { headers: cron }), { fetchData: fakeFetch(), env: { CRON_SECRET: 's' }, now });
  assert.equal(spoofed.status, 401);
  const wrong = await indexNow(new Request('https://campuscli.com/api/indexnow/', { headers: { ...cron, authorization: 'Bearer x' } }), { fetchData: fakeFetch(), env: { CRON_SECRET: 's' }, now });
  assert.equal(wrong.status, 401);
  const calls = [];
  const ok = await indexNow(new Request('https://campuscli.com/api/indexnow/', { headers: { ...cron, authorization: 'Bearer s' } }), { fetchData: fakeFetch(calls), env: { CRON_SECRET: 's' }, now });
  assert.equal(ok.status, 200);
  const json = await ok.json();
  assert.equal(WINDOW_DAYS, 3);
  assert.equal(json.since, '2026-11-20');
  assert.equal(json.until, '2026-11-23');
  assert.deepEqual(json.urls.sort(), ['https://campuscli.com/blog/a/', 'https://campuscli.com/profes/upc/ana-perez/']);
  assert.equal(calls.filter(c => c.url === 'https://api.indexnow.org/indexnow').length, 1);
});

test('un fallo de IndexNow devuelve 502 sin ocultarlo', async () => {
  const failing = async (url, options) => String(url).includes('indexnow.org') ? new Response(null, { status: 403 }) : fakeFetch()(url, options);
  const res = await indexNow(new Request('https://campuscli.com/api/indexnow', { headers: { authorization: 'Bearer s' } }), { fetchData: failing, env: { CRON_SECRET: 's' }, now: new Date('2026-11-22T15:00:00Z') });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /403/);
});

test('un sitemap caído no frena el aviso de los demás', async () => {
  const calls = [];
  const flaky = async (url, options) => { calls.push({ url: String(url) }); return String(url).includes('/profes/') ? new Response('', { status: 503 }) : fakeFetch()(url, options); };
  const res = await indexNow(new Request('https://campuscli.com/api/indexnow/', { headers: { authorization: 'Bearer s' } }), { fetchData: flaky, env: { CRON_SECRET: 's' }, now: new Date('2026-11-22T15:00:00Z') });
  assert.equal(res.status, 207);
  const json = await res.json();
  assert.deepEqual(json.urls, ['https://campuscli.com/blog/a/']);
  assert.match(json.errors[0], /profes.*503/);
  assert.equal(calls.filter(c => c.url === 'https://api.indexnow.org/indexnow').length, 1);
});

test('la ruta del cron lleva barra final (trailingSlash redirige y el cron no sigue redirecciones)', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.trailingSlash, true);
  assert.deepEqual(config.crons.map(c => c.path), ['/api/indexnow/']);
});
