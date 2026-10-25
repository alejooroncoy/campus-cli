import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { gunzipSync, gzipSync } from 'node:zlib';

const key = 'phc_' + 'A'.repeat(43), buyer = 'campus:google:123456789012345678901';
const store = `ph_campus_analytics_v2_${key}`, origin = 'https://campus.analytics.test';
const bundle = async contents => (await build({ stdin: { contents, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'browser', write: false })).outputFiles[0].text;
// Generate legacy state with the actual previous SDK, rather than guessing its schema.
const seed = await bundle(`import posthog from 'posthog-js/dist/module.slim';
  const p=posthog.init('${key}',{api_host:'https://posthog.analytics.test',defaults:'2026-05-30',
    autocapture:false,capture_pageview:false,capture_pageleave:false,disable_session_recording:true,
    capture_exceptions:false,capture_performance:false,rageclick:false,capture_dead_clicks:false,
    advanced_disable_flags:true,disable_surveys:true,disable_external_dependency_loading:true,persistence:'localStorage',persistence_save_debounce_ms:0,before_send:()=>null});
  if(window.knownAccount)p.identify('${buyer}');
  const session=p.sessionManager.checkAndGetSessionAndWindowId();
  window.seeded={id:p.get_distinct_id(),session:p.get_session_id(),windowId:session.windowId};
  p.persistence.flush?.();`);
const modern = await bundle(`import {createAnalyticsClient} from './src/scripts/analytics-client.ts';
  window.client=createAnalyticsClient('${key}',{host:'https://posthog.analytics.test',before_send:event=>event});`);
const minified = (await build({ entryPoints: ['src/scripts/analytics-client.ts'], bundle: true,
  format: 'esm', platform: 'browser', minify: true, target: 'es2022', write: false })).outputFiles[0];
assert.ok(gzipSync(minified.contents).length < 28 * 1024, 'The capture/identity SDK must stay below the payload budget.');
assert.doesNotMatch(minified.text, /(?:Math\.trunc|Number\.isInteger)\s*=/, 'Modern clients must not ship IE polyfills.');
const browser = await chromium.launch({ headless: true });
const waitFor = async predicate => {
  const deadline = Date.now() + 10000;
  while (!predicate()) { if (Date.now() > deadline) throw Error('Timed out waiting for intercepted ingestion'); await new Promise(r => setTimeout(r, 20)); }
};

async function fixture({ known = false, blockStorage = false, bot = false } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36' });
  await context.addInitScript(({ known, blockStorage, bot }) => {
    window.knownAccount = known;
    Object.defineProperty(navigator, 'webdriver', { get: () => bot });
    Object.defineProperty(navigator, 'userAgentData', { get: () => ({ brands: [{ brand: 'Chromium', version: '140' }] }) });
    if (blockStorage) for (const method of ['getItem', 'setItem', 'removeItem']) Storage.prototype[method] = () => { throw Error('Storage denied'); };
    window.fetchOptions = [];
    const original = window.fetch;
    window.fetch = (url, options) => { window.fetchOptions.push({ keepalive: options?.keepalive, credentials: options?.credentials }); return original(url, options); };
  }, { known, blockStorage, bot });
  const accepted = [], attempts = [], unexpected = [], errors = [];
  let failNext = false;
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin) {
      if (url.pathname.endsWith('.js')) return route.fulfill({ contentType: 'text/javascript', body: url.pathname === '/seed.js' ? seed : modern });
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><script type="module" src="${url.pathname === '/seed' ? '/seed.js' : '/modern.js'}"></script>` });
    }
    if (url.origin === 'https://posthog.analytics.test' && req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (url.origin === 'https://posthog.analytics.test' && url.pathname === '/batch/') {
      const bytes = req.postDataBuffer();
      const payload = JSON.parse((bytes[0] === 0x1f ? gunzipSync(bytes) : bytes).toString());
      assert.equal(payload.api_key, key);
      attempts.push(...payload.batch);
      if (failNext) { failNext = false; return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: 'retry' }); }
      accepted.push(...payload.batch);
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"status":"Ok"}' });
    }
    unexpected.push(req.url()); await route.abort();
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  const open = async path => { await page.goto(origin + path); await page.waitForFunction(path === '/seed' ? 'window.seeded' : 'window.client'); };
  return { page, context, open, accepted, attempts, errors, unexpected, fail: () => { failNext = true; } };
}

try {
  for (const known of [false, true]) {
    const f = await fixture({ known });
    try {
      await f.open('/seed'); const previous = await f.page.evaluate(() => window.seeded);
      await f.open('/modern');
      assert.equal(await f.page.evaluate(() => client.get_distinct_id()), previous.id);
      assert.equal(await f.page.evaluate(() => client.get_session_id()), previous.session);
      await f.page.evaluate(() => client.capture('migration_conversion', { amount_cents: 500 }));
      await waitFor(() => f.accepted.some(e => e.event === 'migration_conversion'));
      const conversion = f.accepted.find(e => e.event === 'migration_conversion');
      assert.equal(conversion.distinct_id, previous.id);
      assert.equal(conversion.properties.$session_id, previous.session);
      assert.equal(conversion.properties.$window_id, previous.windowId);
      await f.page.evaluate(id => client.identify(id), buyer);
      if (known) assert.equal(f.attempts.some(e => e.event === '$identify'), false, 'An existing identified user is not merged again');
      else {
        await waitFor(() => f.accepted.some(e => e.event === '$identify'));
        assert.equal(f.accepted.find(e => e.event === '$identify').properties.$anon_distinct_id, previous.id);
      }
      // Switching known users must not merge the first account into the second.
      const second = 'campus:another_account_1234';
      await f.page.evaluate(id => client.identify(id), second);
      await waitFor(() => f.accepted.some(e => e.event === '$identify' && e.distinct_id === second));
      assert.notEqual(f.accepted.find(e => e.event === '$identify' && e.distinct_id === second).properties.$anon_distinct_id, buyer);
      // Old tabs cannot overwrite the new SDK's identity, and logout survives reload.
      await f.page.evaluate(key => localStorage.setItem(`ph_${key}_posthog`, JSON.stringify({ distinct_id: 'stale_old_tab' })), key);
      await f.open('/modern'); assert.equal(await f.page.evaluate(() => client.get_distinct_id()), second);
      await f.page.evaluate(() => client.reset());
      const fresh = await f.page.evaluate(() => ({ id: client.get_distinct_id(), session: client.get_session_id() }));
      assert.notEqual(fresh.id, second); assert.notEqual(fresh.session, previous.session);
      await f.open('/modern'); assert.equal(await f.page.evaluate(() => client.get_distinct_id()), fresh.id);
      assert.deepEqual(f.errors, []); assert.deepEqual(f.unexpected, []);
      assert.ok((await f.page.evaluate(() => fetchOptions)).every(o => o.keepalive === true && o.credentials === 'omit'));
    } finally { await f.context.close(); }
  }
  for (const scenario of ['expired-session', 'corrupt-store', 'opted-out']) {
    const f = await fixture();
    try {
      await f.open('/seed'); const previous = await f.page.evaluate(() => seeded);
      await f.page.evaluate(({ scenario, store, key }) => {
        if (scenario === 'corrupt-store') localStorage.setItem(store, '{invalid');
        if (scenario === 'opted-out') localStorage.setItem(`__ph_opt_in_out_${key}`, '0');
        if (scenario === 'expired-session') { const k=`ph_${key}_posthog`, s=JSON.parse(localStorage.getItem(k)); s.$sesid[0]=Date.now()-3600000; localStorage.setItem(k,JSON.stringify(s)); }
      }, { scenario, store, key });
      await f.open('/modern'); assert.equal(await f.page.evaluate(() => client.get_distinct_id()), previous.id);
      if (scenario === 'expired-session') assert.notEqual(await f.page.evaluate(() => client.get_session_id()), previous.session);
      await f.page.evaluate(() => client.capture('continuity_check', {}));
      if (scenario === 'opted-out') {
        assert.equal(await f.page.evaluate(store => JSON.parse(localStorage.getItem(store)).opted_out, store), true);
        await f.page.evaluate(() => { client.reset(); client.capture('opted_out_after_logout', {}); });
        await f.open('/modern');
        await f.page.evaluate(() => client.capture('opted_out_after_reload', {}));
        await f.page.waitForTimeout(250); assert.deepEqual(f.attempts, []);
      } else await waitFor(() => f.accepted.length > 0);
      assert.deepEqual(f.errors, []); assert.deepEqual(f.unexpected, []);
    } finally { await f.context.close(); }
  }
  const denied = await fixture({ blockStorage: true });
  try { await denied.open('/modern'); await denied.page.evaluate(() => client.capture('memory_fallback', {})); await waitFor(() => denied.accepted.length > 0); assert.deepEqual(denied.errors, []); }
  finally { await denied.context.close(); }
  const bot = await fixture({ bot: true });
  try { await bot.open('/modern'); await bot.page.evaluate(() => client.capture('bot_event', {})); await bot.page.waitForTimeout(250); assert.deepEqual(bot.attempts, []); }
  finally { await bot.context.close(); }
  const retry = await fixture();
  try {
    await retry.open('/modern'); retry.fail();
    await retry.page.evaluate(() => client.capture('persisted_conversion', { amount_cents: 500 }));
    await waitFor(() => retry.attempts.some(e => e.event === 'persisted_conversion'));
    const uuid = retry.attempts.find(e => e.event === 'persisted_conversion').uuid;
    await retry.open('/modern'); await retry.page.evaluate(() => client.capture('next_visit', {}));
    await waitFor(() => retry.accepted.some(e => e.event === 'persisted_conversion'));
    assert.equal(retry.accepted.filter(e => e.event === 'persisted_conversion').length, 1);
    assert.equal(retry.accepted.find(e => e.event === 'persisted_conversion').uuid, uuid);
    assert.deepEqual(retry.errors, []); assert.deepEqual(retry.unexpected, []);
  } finally { await retry.context.close(); }
  console.log('Real SDK migration: anonymous/known users, sessions/windows, account isolation, logout/reload, consent, corrupt/denied storage, bots and persisted conversion retries passed.');
} finally { await browser.close(); }
