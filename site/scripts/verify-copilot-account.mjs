import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: [new URL('../src/scripts/copilot-account.ts', import.meta.url).pathname],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { copilotAccountView, renderCopilotAccount } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const guest = { authenticated: false, aiReady: true, plan: 'anon' };
const free = { authenticated: true, aiReady: true, plan: 'free', usage: { remaining: 7, limit: 25, period: 'trial' } };
const plus = { ...free, plan: 'plus', usage: { remaining: 0, limit: 100, period: 'day' } };
assert.equal(copilotAccountView(guest).state, 'guest');
assert.equal(copilotAccountView(guest).label, 'Prueba gratis');
assert.equal(copilotAccountView(guest).action.href, '/api/app/auth/start?return=%2Fapp%2Fcopilot%2F');
assert.equal(copilotAccountView(free).label, 'Campus Free');
assert.equal(copilotAccountView(plus).label, 'Campus Plus', 'Using all daily queries must not downgrade a Plus account');
assert.match(copilotAccountView(plus).usage, /0 de 100.*hoy/);
for (const session of ['error', { ...plus, accessUnavailable: true }, { ...plus, plan: undefined }, { ...free, plan: 'unrecognized' }, {}]) {
  assert.equal(copilotAccountView(session).state, 'unavailable', 'Unverified state must never appear as Free or logged out');
}
assert.equal(copilotAccountView({ ...plus, accessBlocked: true }).state, 'blocked');
assert.equal(copilotAccountView({ ...plus, usage: { remaining: NaN, limit: 100 } }).usage, undefined);
assert.equal(copilotAccountView('loading').action, undefined);

// A same-document upgrade, downgrade, logout or failure must clear stale CTAs and balances.
const fields = new Map(['label', 'description', 'usage', 'action', 'upgrade', 'retry'].map(name => [name, {
  textContent: '', hidden: false, href: undefined,
  replaceChildren(...children) { this.children = children; },
  removeAttribute(name) { if (name === 'href') this.href = undefined; },
}]));
const root = { dataset: {}, setAttribute() {}, querySelector(selector) { return fields.get(selector.match(/data-copilot-account-(.*)\]/)[1]); } };
globalThis.document = { createElement() { return { className: '', setAttribute() {} }; } };
renderCopilotAccount(root, free);
assert.equal(fields.get('upgrade').hidden, false);
renderCopilotAccount(root, plus);
assert.equal(root.dataset.state, 'plus');
assert.equal(fields.get('upgrade').hidden, true);
assert.match(fields.get('usage').textContent, /0 de 100/);
renderCopilotAccount(root, 'error');
assert.equal(fields.get('usage').hidden, true);
assert.equal(fields.get('usage').textContent, '');
assert.equal(fields.get('action').hidden, true);
assert.equal(fields.get('action').href, undefined);
assert.equal(fields.get('retry').hidden, false);
renderCopilotAccount(root, guest);
assert.equal(fields.get('retry').hidden, true);
assert.equal(fields.get('action').textContent, 'Crear cuenta o entrar');
renderCopilotAccount(root, free);
assert.equal(fields.get('label').textContent, 'Campus Free');
assert.equal(fields.get('action').href, '/app/perfil/');
console.log('Copilot account: verified guest/Free/Plus, exhausted quota, unavailable plan, blocked account and same-document transitions passed.');
