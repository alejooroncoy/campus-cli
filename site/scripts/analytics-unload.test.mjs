import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Actual HTTP requests to a loopback fixture: routing/mocking an unloading
// request can cancel it independently of the browser's keepalive behavior.
const key = 'phc_' + 'A'.repeat(43);
const { outputFiles } = await build({
  stdin: { contents: "import {setupAnalytics} from './src/scripts/analytics.ts'; setupAnalytics();", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'browser',
  define: { 'import.meta.env': JSON.stringify({ DEV: false, PUBLIC_POSTHOG_KEY: key }) },
});
const events = [], errors = [];
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/c-events/batch/') {
      assert.equal(request.headers.cookie, undefined);
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      const payload = JSON.parse((raw[0] === 0x1f ? gunzipSync(raw) : raw).toString());
      assert.equal(payload.api_key, key);
      events.push(...payload.batch);
      response.writeHead(200, { 'content-type': 'application/json' });
      return response.end('{"status":"Ok"}');
    }
    if (request.url === '/fixture.js') {
      response.writeHead(200, { 'content-type': 'text/javascript' });
      return response.end(outputFiles[0].text);
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(request.url === '/exit/' ? '<!doctype html><title>Exit without analytics</title>' :
      '<!doctype html><html><body style="height:4000px"><h1>Native navigation</h1><button>Interact</button><script type="module" src="/fixture.js"></script></body></html>');
  } catch (error) { errors.push(error.message); response.writeHead(500); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
// The test hostname enables the production code path while DNS stays local.
const origin = `http://campus.analytics.test:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP campus.analytics.test 127.0.0.1', '--no-proxy-server'] });
try {
  const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'userAgentData', { get: () => ({ brands: [{ brand: 'Chromium', version: '140' }] }) });
    // This loopback fixture uses HTTP; production HTTPS provides randomUUID.
    crypto.randomUUID ??= () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,
      c => (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4).toString(16));
  });
  await page.goto(origin + '/?code=private-unload', { waitUntil: 'networkidle' });
  // Ensure Event Timing records an interaction even on a fast CI machine.
  await page.evaluate(() => document.querySelector('button').addEventListener('click', () => {
    const until = performance.now() + 80;
    while (performance.now() < until) { /* Deliberately slow test interaction. */ }
  }));
  await page.locator('button').click();
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  await page.waitForTimeout(250);
  await page.goto(origin + '/exit/');
  const deadline = Date.now() + 10000;
  const values = () => Object.assign({}, ...events.filter(event => event.event === '$web_vitals').map(event => event.properties));
  while (!events.some(event => event.event === '$pageleave') || !['CLS', 'FCP', 'INP', 'LCP'].every(name => Number.isFinite(values()[`$web_vitals_${name}_value`]))) {
    if (Date.now() > deadline) throw Error('Native navigation lost final pageleave or Web Vitals events: ' + JSON.stringify({
      events: events.map(event => event.event),
      metrics: Object.fromEntries(['CLS', 'FCP', 'INP', 'LCP'].map(name => [name, values()[`$web_vitals_${name}_value`]])), errors,
    }));
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const view = events.find(event => event.event === '$pageview');
  const leave = events.find(event => event.event === '$pageleave');
  assert.equal(leave.properties.$prev_pageview_id, view.properties.$pageview_id);
  assert.equal(leave.properties.$prev_pageview_max_content_percentage, 1);
  assert.ok(events.every(event => event.properties.$lib_custom_api_host === origin + '/c-events'));
  assert.ok(events.every(event => event.properties.$session_id === view.properties.$session_id));
  assert.equal(JSON.stringify(events).includes('private-unload'), false);
  assert.deepEqual(errors, []);
  console.log('Native document exit: scroll, CLS/FCP/INP/LCP, session correlation and private URL removal reached a real local HTTP server without a future visit.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
