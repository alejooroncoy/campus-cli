import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const { outputFiles } = await build({ entryPoints: [new URL('../src/scripts/conversation-cache.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false });
const { createConversationCache } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

let calls = 0;
const request = deferred();
const cache = createConversationCache(async () => { calls++; return request.promise; });
const hover = cache.get('a');
const click = cache.get('a');
assert.equal(hover, click, 'Hover and click reuse the same pending request');
request.resolve({ messages: ['latest five'] });
await click;
assert.equal(calls, 1);
assert.deepEqual(cache.peek('a'), { messages: ['latest five'] }, 'A cached chat is available synchronously');
await cache.get('a');
assert.equal(calls, 1, 'Switching back does not fetch again');

const stale = deferred(), fresh = deferred();
const requests = [stale.promise, fresh.promise];
const changed = createConversationCache(() => requests.shift());
const old = changed.get('a');
changed.invalidate('a');
const newer = changed.get('a');
fresh.resolve('new messages');
await newer;
stale.resolve('old messages');
await old;
assert.equal(changed.peek('a'), 'new messages', 'A delayed response cannot replace an invalidated cache');

const cursors = [];
const paged = createConversationCache(async (id, before) => { cursors.push([id, before]); return `${id}/${before ?? 'latest'}`; });
await Promise.all([paged.get('a'), paged.get('a', '10'), paged.get('b')]);
assert.equal(cursors.length, 3, 'Different chats/pages stay separate');
assert.equal(paged.peek('a', '10'), 'a/10');
assert.equal(paged.peek('a'), 'a/latest');

let attempts = 0;
const retry = createConversationCache(async () => { if (++attempts === 1) throw Error('offline'); return 'recovered'; });
await assert.rejects(retry.get('a'));
assert.equal(await retry.get('a'), 'recovered', 'Failed prefetches can be retried');

const now = Date.now;
try {
  const expires = now() + 61_000;
  Date.now = () => expires;
  assert.equal(cache.peek('a'), undefined, 'Expired pages require a fresh request');
} finally { Date.now = now; }
assert.equal(createConversationCache(async () => 'other user').peek('a'), undefined, 'Mounted chats do not share private messages');

const bootstrap = await readFile(new URL('../public/campus-conversation-bootstrap.js', import.meta.url), 'utf8');
const id = 'fbe400c2-5195-4e9b-8ae5-fdfd34c65e20';
for (const pathname of [`/app/asistente/c/${id}/`, `/app/profes/c/${id}/`]) {
  const earlyCalls = [];
  const context = { window: {}, location: { pathname }, AbortSignal, fetch: async (url, options) => { earlyCalls.push({ url, options }); return { ok: true, json: async () => ({ messages: [] }) }; } };
  vm.runInNewContext(bootstrap, context);
  vm.runInNewContext(bootstrap, context);
  await context.window.__campusConversationPreload.promise;
  assert.equal(earlyCalls.length, 1, `Early preload runs once for ${pathname}`);
  assert.match(earlyCalls[0].url, /limit=5/);
  assert.equal(earlyCalls[0].options.credentials, 'same-origin');
  assert.equal(earlyCalls[0].options.cache, 'no-store');
}
console.log('Conversation cache and early preload: all checks passed.');
