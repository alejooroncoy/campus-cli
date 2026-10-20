import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { turnitinServiceEnabled as enabled } from '../feature-flags.mjs';

const read = path => readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');
for (const path of ['index.html', 'index.md', 'llms.txt', 'llms-full.txt', 'app/plus/index.html']) {
  assert.equal(/Turnitin/i.test(read(path)), enabled, `${path}: public promotion follows the flag`);
}
assert.equal(read('sitemap-0.xml').includes('/turnitin/'), enabled, 'sitemap follows the flag');
assert.equal(read('turnitin/index.html').includes('data-ti-start'), enabled, 'public service page follows the flag');
assert.equal(read('turnitin/index.md').toLowerCase().includes('turnitin'), enabled, 'service Markdown follows the flag');
for (const path of ['index.html', 'app/asistente/index.html']) {
  assert.equal(read(path).includes('href="/app/turnitin/"') || read(path).includes('href="/turnitin/"'), enabled, `${path}: navigation follows the flag`);
}
assert.ok(!read('llms.txt').includes('there.\\n'), 'discovery uses a real newline');
assert.equal(/Turnitin/i.test(read('contacto/index.html')), enabled, 'contact page follows public visibility');
const history = read('app/turnitin/index.html');
assert.ok(history.includes('data-ti-my-orders-panel'), 'existing customer history remains available');
assert.equal((history.match(/id="ti-login-title"/g) ?? []).length, 1, 'login remains unique and available');
if (!enabled) assert.ok(history.indexOf('data-ti-login-panel') < history.indexOf('data-ti-new-order'), 'paused login remains outside the hidden new-order panel');
assert.ok(history.includes(`data-ti-service-enabled="${enabled}"`));
const newOrder = history.match(/<details\b[^>]*data-ti-new-order[^>]*>/)?.[0];
assert.ok(newOrder);
assert.equal(/\bhidden(?:\s|>|=)/.test(newOrder), !enabled, 'new order panel is hidden while paused');
if (!enabled) assert.ok(read('turnitin/index.html').includes('url=/'), 'public service page redirects home');
console.log(`Turnitin public feature ${enabled ? 'enabled' : 'disabled'}: promotion, navigation, discovery, pages and preserved history verified.`);
