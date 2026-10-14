import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: [new URL('../src/scripts/campus-session.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false });
const source = outputFiles[0].text;
let sequence = 0;
const load = () => import(`data:text/javascript;base64,${Buffer.from(`${source}\n// case ${sequence++}`).toString('base64')}`);
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const signedIn = { authenticated: true, email: 'test@example.org', aiReady: true };
const guest = { authenticated: false, aiReady: true };
const response = value => ({ ok: true, json: async () => value });
const savedGlobals = { window: globalThis.window, fetch: globalThis.fetch, sessionStorage: globalThis.sessionStorage };
const storage = new Map();
globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null, removeItem: key => storage.delete(key) };
try {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response(signedIn); };
  globalThis.window = { __campusSessionBootstrap: { promise: Promise.resolve(signedIn) } };
  let api = await load();
  assert.deepEqual(await api.getCampusSession(), signedIn);
  const upc = { ...signedIn, universityConfirmed: true, profesAvailable: true, university: { shortName: "UPC" } };
  assert.equal(api.canConnectMiupc(upc), true);
  for (const session of [guest, signedIn, { ...upc, universityConfirmed: false }, { ...upc, profesAvailable: false }, { ...upc, university: { shortName: "UNMSM" } }]) assert.equal(api.canConnectMiupc(session), false);
  assert.equal(calls, 0, 'Reuse the head request instead of fetching twice');

  globalThis.window = {};
  calls = 0;
  api = await load();
  await Promise.all([api.getCampusSession(), api.getCampusSession(), api.getCampusSession()]);
  assert.equal(calls, 1, 'Concurrent callers share one session request');

  const old = deferred();
  const fresh = deferred();
  let requests = [old.promise, fresh.promise];
  globalThis.window = {};
  globalThis.fetch = () => requests.shift();
  api = await load();
  const olderRequest = api.getCampusSession();
  const newerRequest = api.getCampusSession(true);
  fresh.resolve(response(guest));
  await newerRequest;
  old.resolve(response(signedIn));
  await olderRequest;
  assert.deepEqual(await api.getCampusSession(), guest, 'Old responses cannot override a refreshed session');

  const beforeLogout = deferred();
  globalThis.window = { __campusSessionBootstrap: { promise: beforeLogout.promise } };
  globalThis.fetch = async () => response(guest);
  api = await load();
  storage.set('campus_ui_profile', JSON.stringify({ authenticated: true, savedAt: Date.now(), cleanName: 'Test User' }));
  const obsolete = api.getCampusSession();
  storage.set("campus-conversation-drafts-v1", "private draft fixture");
  storage.set("campus-question", "legacy draft fixture");
  api.clearCampusSession();
  assert.equal(storage.has("campus-conversation-drafts-v1"), false);
  assert.equal(storage.has("campus-question"), false);
  assert.equal(storage.has('campus_ui_profile'), false);
  assert.equal(window.__campusSessionBootstrap, undefined);
  beforeLogout.resolve(signedIn);
  await obsolete;
  assert.deepEqual(await api.getCampusSession(), guest, 'Logout discards the bootstrap and any late response');

  const failed = deferred();
  globalThis.window = { __campusSessionBootstrap: { promise: failed.promise } };
  api = await load();
  const failedRequest = api.getCampusSession();
  failed.reject(new Error('Offline'));
  await assert.rejects(failedRequest);
  assert.deepEqual(await api.getCampusSession(), guest, 'A failed bootstrap can be retried');

  globalThis.window = {};
  calls = 0;
  globalThis.fetch = async () => response(++calls === 1 ? { ...signedIn, accessUnavailable: true } : signedIn);
  api = await load();
  assert.equal((await api.getCampusSession()).authenticated, true, 'Billing unavailability does not log the user out');
  assert.deepEqual(await api.getCampusSession(), signedIn, 'Degraded balance checks can retry without a sticky bootstrap');
  assert.equal(calls, 2);

  storage.set('campus_ui_profile', JSON.stringify({ authenticated: true, cleanName: 'Test User', savedAt: Date.now() }));
  assert.equal(api.getCampusProfilePreview()?.cleanName, 'Test User');
  storage.set('campus_ui_profile', JSON.stringify({ authenticated: true, savedAt: Date.now() - 16 * 60 * 1000 }));
  assert.equal(api.getCampusProfilePreview(), null, 'Expired previews are not displayed');
  storage.set('campus_ui_profile', '{broken');
  assert.equal(api.getCampusProfilePreview(), null);
  console.log('Session checks passed: early fetch, deduplication, refresh race, logout, retry, preview expiry and invalid storage.');
} finally {
  Object.assign(globalThis, savedGlobals);
}
