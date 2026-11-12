import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// E2E con el backend real (handler de campus-profes) y el sitio compilado.
// Requiere el repo del backend con la muestra de invitado: CAMPUS_PROFES_DIR.
const profesDir = resolve(process.env.CAMPUS_PROFES_DIR ?? '/Users/USER/alejo/campus-profes-guest-sample');
if (!existsSync(resolve(profesDir, 'src/app/guest-sample.ts'))) {
  console.log(`Guest sample live E2E skipped: ${profesDir} has no guest sample backend.`);
  process.exit(0);
}
const port = 4331;
const base = `http://127.0.0.1:${port}`;
const server = spawn('node', ['scripts/guest-sample-live-fixture.ts'], {env: {...process.env, CAMPUS_E2E_PORT: String(port), CAMPUS_PROFES_DIR: profesDir}, stdio: ['ignore', 'pipe', 'pipe']});
let log = '';
server.stdout.on('data', data => { log += data; });
server.stderr.on('data', data => { log += data; });
for (let i = 0; i < 100 && !log.includes('Guest sample live fixture'); i++) {
  if (server.exitCode !== null) throw new Error(`Fixture exited early:\n${log}`);
  await new Promise(resolve => setTimeout(resolve, 100));
}
assert.ok(log.includes('Guest sample live fixture'), `Fixture did not start:\n${log}`);

const post = (path, body) => fetch(base + path, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body ?? {})});
const state = async () => (await fetch(base + '/__e2e/state')).json();
const database = async () => (await fetch(base + '/__e2e/db')).json();
const usingDatabase = (await state()).database === true;
console.log(usingDatabase ? 'Mode: real PostgreSQL store.' : 'Mode: in-memory store (set CAMPUS_E2E_DATABASE_URL for PostgreSQL).');
const browser = await chromium.launch({headless: true});
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
// Cada contexto es un invitado nuevo (cookies vacías) con la IP que le demos.
async function guest(ip, arm) {
  const context = await browser.newContext({viewport: {width: 390, height: 900}, serviceWorkers: 'block', userAgent: UA, extraHTTPHeaders: {'x-real-ip': ip}});
  if (arm) await context.addInitScript(value => localStorage.setItem('campus-guest-sample-arm-v1', value), arm);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  return {context, page, errors};
}
const wall = page => page.getByRole('heading', {name: 'Entra para hablar con Campu.'});
const box = page => page.getByRole('textbox', {name: 'Escribe tu pregunta a Campu'});

try {
  await post('/__e2e/reset');

  // 1. Invitado nuevo en el brazo "sample": una pregunta real contra el handler.
  const a = await guest('203.0.113.10', 'sample');
  await a.page.goto(base + '/app/asistente/');
  await box(a.page).waitFor();
  assert.equal(await wall(a.page).count(), 0);
  await box(a.page).fill('¿Qué dicen los estudiantes de Luis Vives?');
  await a.page.getByRole('button', {name: 'Enviar pregunta', exact: true}).click();
  await a.page.getByText('Respuesta pública del catálogo (e2e).', {exact: true}).waitFor();
  await a.page.locator('[data-guest-sample-cta]').waitFor();
  assert.equal(await box(a.page).isVisible(), false, 'composer closes after the sample');
  let s = await state();
  assert.equal(s.agentCalls, 1);
  assert.equal(s.agentMessages[0], '¿Qué dicen los estudiantes de Luis Vives?');
  if (!usingDatabase) assert.equal(s.served, 1);
  assert.ok(s.events.some(e => e.event.event === 'campus_guest_sample_served'), 'backend telemetry: served');
  if (usingDatabase) {
    const rows = await database();
    assert.equal(rows.requests.length, 1, 'one request row');
    const [row] = rows.requests;
    assert.equal(row.plan, 'anon');
    assert.equal(row.status, 'complete', 'the real finishGuest closed the request');
    assert.match(row.ip_hash, /^[a-f0-9]{64}$/, 'only a sha256 of the IP is stored');
    assert.notEqual(row.ip_hash, '203.0.113.10');
    assert.match(row.guest_id, /^gst_/);
    assert.equal(row.input_tokens, 10); assert.equal(row.output_tokens, 5);
    assert.equal(rows.conversations, 1);
    assert.deepEqual(rows.messages.map(m => m.role), ['user', 'assistant']);
    assert.ok(rows.indexes.includes('campus_app_ai_ip_hash_time') && rows.indexes.includes('campus_app_ai_sample_time'), 'migration 209 indexes exist');
    assert.equal(JSON.stringify(rows).includes('203.0.113.10'), false, 'the raw IP is nowhere in the database');
  }
  console.log('Live E2E: sample arm gets one real answer and the account CTA.');

  // 2. Recargar: la muestra ya está gastada, vuelve el muro y no hay una segunda llamada.
  await a.page.reload();
  await wall(a.page).waitFor();
  assert.equal((await state()).agentCalls, 1);
  console.log('Live E2E: after the sample the wall is back on reload.');

  // 3. Otra cookie desde la misma IP no obtiene muestra (límite por IP) y no se le asigna brazo.
  const b = await guest('203.0.113.10', null);
  await b.page.goto(base + '/app/asistente/');
  await wall(b.page).waitFor();
  assert.equal(await b.page.evaluate(() => localStorage.getItem('campus-guest-sample-arm-v1')), null, 'blocked visitors are not assigned an arm');
  assert.equal((await state()).agentCalls, 1);
  console.log('Live E2E: same IP, new cookie gets the wall and no arm.');

  // 4. IP distinta + brazo "gate": el backend la ofrece pero el sitio mantiene el muro.
  const c = await guest('203.0.113.20', 'gate');
  await c.page.goto(base + '/app/asistente/');
  await wall(c.page).waitFor();
  assert.equal(await box(c.page).count(), 0);
  assert.equal((await state()).agentCalls, 1);
  console.log('Live E2E: gate arm keeps the wall even when the backend offers the sample.');

  // 5. Interruptor apagado: aunque el brazo sea "sample", nada cambia respecto a hoy.
  await post('/__e2e/config', {enabled: false});
  const d = await guest('203.0.113.30', 'sample');
  await d.page.goto(base + '/app/asistente/');
  await wall(d.page).waitFor();
  assert.equal((await state()).agentCalls, 1);
  const offered = await d.page.evaluate(() => fetch('/api/app/session', {credentials: 'same-origin'}).then(r => r.json()));
  assert.deepEqual(offered.guestSample, {available: false, remaining: 0, limit: 1}, 'backend does not offer the sample when off');
  console.log('Live E2E: the kill switch restores today\'s behavior.');

  // 6. Tope diario: con el interruptor encendido y tope 1 ya cubierto, nadie más recibe muestra.
  await post('/__e2e/config', {enabled: true, dailyCap: 1});
  const e = await guest('203.0.113.40', 'sample');
  await e.page.goto(base + '/app/asistente/');
  await wall(e.page).waitFor();
  assert.equal((await state()).agentCalls, 1);
  console.log('Live E2E: the daily cap closes the sample.');

  // 7. Una cabecera X-Forwarded-For falsificada no abre una segunda muestra desde la misma IP real.
  const f = await guest('203.0.113.10', 'sample');
  await f.context.setExtraHTTPHeaders({'x-real-ip': '203.0.113.10', 'x-forwarded-for': '10.9.9.9'});
  await post('/__e2e/config', {dailyCap: 150});
  await f.page.goto(base + '/app/asistente/');
  await wall(f.page).waitFor();
  assert.equal((await state()).agentCalls, 1);
  console.log('Live E2E: a forged X-Forwarded-For does not unlock a second sample.');

  if (usingDatabase) assert.equal((await database()).requests.length, 1, 'blocked and disabled attempts leave no rows');

  // 8. Carrera real: peticiones simultáneas desde una IP nueva, con la misma cookie y con cookies
  // distintas, solo reservan una muestra (bloqueo de PostgreSQL, no solo lógica en memoria).
  await post('/__e2e/config', {enabled: true, dailyCap: 150});
  const send = (ip, cookie) => fetch(base + '/api/app/profes/message', {
    method: 'POST',
    headers: {origin: base, 'content-type': 'application/json', accept: 'application/x-ndjson', 'user-agent': UA, 'x-real-ip': ip, ...(cookie ? {cookie: `campus_guest=${cookie}`} : {})},
    body: JSON.stringify({message: 'Carrera'}),
  });
  const sameCookie = await Promise.all(Array.from({length: 6}, () => send('203.0.113.60', 'gst_e2e0123456789abcdef')));
  assert.equal(sameCookie.filter(r => r.status === 200).length, 1, `same cookie: one winner (got ${sameCookie.map(r => r.status)})`);
  const sameIp = await Promise.all(Array.from({length: 6}, (_, i) => send('203.0.113.61', `gst_e2e${String(i).repeat(14)}`)));
  assert.equal(sameIp.filter(r => r.status === 200).length, 1, `same IP, different cookies: one winner (got ${sameIp.map(r => r.status)})`);
  if (usingDatabase) {
    const rows = await database();
    assert.equal(rows.requests.length, 3, 'exactly one row per winner plus the first sample');
    assert.equal(new Set(rows.requests.map(r => r.ip_hash)).size, 3, 'one row per IP');
  }
  console.log('Live E2E: concurrent requests reserve a single sample.');

  for (const {errors} of [a, b, c, d, e, f]) assert.deepEqual(errors, []);
  console.log('Guest sample live E2E passed.');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
