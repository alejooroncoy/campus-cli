// First-visit entry persistence: first wins, "direct" yields to a later channel,
// expiry, corrupt storage, opt-out and reset. Runs the real module with stubbed browser globals.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['src/scripts/entry-attribution.ts'], bundle: true, format: 'esm', write: false });
const mod = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() }; };
const KEY = 'phc_test';
function visit({ url = 'https://campuscli.com/', referrer = '', fresh = true } = {}) {
  const u = new URL(url);
  globalThis.location = { href: u.href, search: u.search, pathname: u.pathname, hostname: u.hostname };
  globalThis.document = { referrer, cookie: '' };
  if (fresh) globalThis.sessionStorage = store();
  mod.rememberEntry(KEY);
}
globalThis.localStorage = store();

visit({ referrer: 'https://www.google.com/search?q=private' });
assert.deepEqual(mod.firstEntry(KEY), { entry_channel: 'referral', entry_source: 'www.google.com', entry_landing: 'home' });
visit({ url: 'https://campuscli.com/turnitin/?utm_source=facebook&utm_campaign=123456789', referrer: 'https://l.facebook.com/' });
assert.equal(mod.firstEntry(KEY).entry_channel, 'referral', 'The first observed channel is never overwritten');

localStorage.clear();
visit({ referrer: '' });
assert.equal(mod.firstEntry(KEY).entry_channel, 'direct');
visit({ url: 'https://campuscli.com/?utm_source=facebook&utm_campaign=123456789' });
assert.deepEqual(mod.firstEntry(KEY), { entry_channel: 'campaign', entry_source: 'meta', entry_campaign: '123456789', entry_landing: 'home' },
  'A bare direct visit must not hide a later campaign');
visit({ referrer: '' });
assert.equal(mod.firstEntry(KEY).entry_channel, 'campaign', 'Direct never replaces a real channel');

// A tab opened before the feature (session entry present, local entry missing) still records it.
localStorage.clear();
visit({ referrer: 'https://www.reddit.com/r/upc' });
const session = sessionStorage.getItem('campus_entry');
localStorage.clear();
globalThis.sessionStorage = store(); sessionStorage.setItem('campus_entry', session);
visit({ fresh: false });
assert.equal(mod.firstEntry(KEY).entry_source, 'www.reddit.com');

// Expiry and corrupt storage.
localStorage.setItem('campus_entry_first_v1', JSON.stringify({ entry: { entry_channel: 'direct' }, expires: Date.now() - 1 }));
assert.deepEqual(mod.firstEntry(KEY), {});
localStorage.setItem('campus_entry_first_v1', 'not json');
assert.deepEqual(mod.firstEntry(KEY), {});
localStorage.setItem('campus_entry_first_v1', JSON.stringify({ entry: { entry_channel: 'direct' }, expires: Date.now() + 365 * 86_400_000 }));
assert.deepEqual(mod.firstEntry(KEY), {}, 'A forged far-future expiry is rejected');

// Opt-out clears on read and on the next visit; clearFirstEntry empties it.
localStorage.clear();
visit({ referrer: 'https://www.google.com/' });
assert.ok(localStorage.getItem('campus_entry_first_v1'));
localStorage.setItem(`__ph_opt_in_out_${KEY}`, '0');
assert.deepEqual(mod.firstEntry(KEY), {});
assert.equal(localStorage.getItem('campus_entry_first_v1'), null, 'Opt-out removes the stored entry even without a new visit');
localStorage.clear();
visit({ referrer: 'https://www.google.com/' });
mod.clearFirstEntry();
assert.deepEqual(mod.firstEntry(KEY), {});
console.log('Entry attribution: first wins, direct yields, expiry, corrupt storage, opt-out and reset passed.');
