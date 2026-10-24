import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';

const listeners = {};
const puts = [];
const deleted = [];
let offline = true;
let precached = [];
const cache = {
  addAll: async paths => { precached.push(...paths.map(path => typeof path === 'string' ? path : new URL(path.url).pathname)); },
  put: async (...args) => puts.push(args),
};
const context = {
  URL, Response, Request: class extends Request { constructor(path, options) { super(new URL(path, 'http://localhost:4321'), options); } },
  self: {
    addEventListener: (name, listener) => { listeners[name] = listener; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  },
  caches: {
    open: async () => cache,
    match: async request => {
      if (request === '/library-offline.html') return new Response('static library editor shell');
      const url = new URL(request.url);
      const path = url.pathname + url.search;
      if (precached.includes(path)) return new Response(`asset:${path}`);
      // A stale private HTML entry must never be returned by the fallback.
      if (url.pathname.startsWith('/app/')) return new Response('private stale data');
      return undefined;
    },
    keys: async () => ['campus-shell-v2', 'campus-shell-v3', 'campus-shell-v4', 'campus-shell-v5', 'campus-shell-v6', 'campus-shell-v7', 'campus-shell-v8', 'campus-shell-v9', 'campus-shell-v10', 'campus-shell-v11', 'campus-shell-v12', 'campus-shell-v13', 'another-app'],
    delete: async name => deleted.push(name),
  },
  fetch: async request => {
    if (request === '/library-offline-assets.json') return Response.json(['/library-offline.html']);
    if (offline) throw new TypeError('Failed to fetch');
    return new Response(`online:${request.url}`);
  },
};
vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
async function lifecycle(name) {
  let pending;
  listeners[name]({ waitUntil: promise => { pending = promise; } });
  await pending;
}
async function request(path, mode) {
  let pending;
  listeners.fetch({
    request: { url: `http://localhost:4321${path}`, mode },
    respondWith: promise => { pending = promise; },
    waitUntil: () => {},
  });
  return pending;
}
await lifecycle('install');
for (const path of precached.filter(path=>path!=='/library-offline.html')) await access(new URL(`../public${path.split('?')[0]}`, import.meta.url));
assert(precached.some(path => path.endsWith('Regular.woff2')));
assert(precached.some(path => path.endsWith('SemiBold.woff2')));
const appShell = await readFile(new URL('../src/layouts/AppShell.astro', import.meta.url), 'utf8');
const stylesheetUrls = [...appShell.matchAll(/href="(\/(?:app-dashboard|profes-chat)\.css\?v=\d+)"/g)].map(match => match[1]);
assert.equal(stylesheetUrls.length, 2);
for (const stylesheet of stylesheetUrls) {
  assert(precached.includes(stylesheet), `Precache must include the current stylesheet URL: ${stylesheet}`);
  const cachedCss = await request(stylesheet, 'cors');
  assert.equal(await cachedCss.text(), `asset:${stylesheet}`, 'Styles remain available after network failure');
}
await lifecycle('activate');
assert.deepEqual(deleted, ['campus-shell-v2', 'campus-shell-v3', 'campus-shell-v4', 'campus-shell-v5', 'campus-shell-v6', 'campus-shell-v7', 'campus-shell-v8', 'campus-shell-v9', 'campus-shell-v10', 'campus-shell-v11', 'campus-shell-v12', 'campus-shell-v13']);
assert.equal(await (await request('/app/biblioteca/', 'navigate')).text(), 'static library editor shell');

const path = '/app/asistente/c/d65145e9-0504-4e42-852f-0581930025d2/';
const failed = await request(path, 'navigate');
assert.equal(failed.status, 503);
assert.equal(failed.headers.get('cache-control'), 'no-store');
const html = await failed.text();
assert.match(html, /<style>/);
assert.match(html, /system-ui/);
assert.match(html, /<svg aria-hidden="true" xmlns=/);
assert.doesNotMatch(html, /<link|<img|private stale data/);
assert.match(html, /No podemos conectar/);
assert.match(html, /focus-visible/);
const click = html.match(/onclick="([^"]+)"/)[1];
let retries = 0;
const location = { href: `http://localhost:4321${path}`, reload: () => { retries++; } };
vm.runInNewContext(click, { window: { location } });
assert.equal(retries, 1);
assert.equal(new URL(location.href).pathname, path);

const apiFailure = await request('/api/app/session', 'cors');
assert.equal(apiFailure.status, 503);
assert.match(apiFailure.headers.get('content-type'), /application\/json/);
assert.equal(puts.length, 0, 'Neither navigation nor API responses enter the asset cache');
offline = false;
const recovered = await request(path, 'navigate');
assert.equal(recovered.status, 200);
assert.equal(await recovered.text(), `online:http://localhost:4321${path}`);
console.log('Offline shell: install, cache isolation, standalone fallback, same-route retry, API failure and recovery passed.');
