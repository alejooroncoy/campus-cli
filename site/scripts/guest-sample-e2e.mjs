import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Pregunta de muestra para invitados: brazo "sample" con una pregunta y CTA,
// brazo "gate" con el muro de siempre, y backend sin muestra igual que hoy.
const root = resolve('dist');
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    let path = resolve(root, '.' + pathname);
    if (path !== root && !path.startsWith(root + '/')) throw Error();
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    res.writeHead(200, {'content-type': ({'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json'})[extname(path)] ?? 'application/octet-stream'});
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true});
const id = '22222222-2222-4222-8222-222222222222';

async function scenario(name, {arm, guestSample, rejectMessage, run}) {
  const context = await browser.newContext({viewport:{width:390, height:900}, serviceWorkers:'block'});
  if (arm) await context.addInitScript(value => localStorage.setItem('campus-guest-sample-arm-v1', value), arm);
  const page = await context.newPage(), errors = [], messages = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith('/api/app/')) return route.continue();
    const path = url.pathname.replace(/\/$/, '');
    const json = data => route.fulfill({contentType:'application/json', body:JSON.stringify(data)});
    if (path === '/api/app/session') return json({authenticated:false, plan:'anon', aiReady:true, universityConfirmed:false, ...(guestSample ? {guestSample} : {}), usage:{remaining:5, limit:5, period:'trial'}});
    if (path === '/api/app/profes/conversations') return json({conversations:[]});
    if (path === '/api/app/profes/conversation') return json({messages:[], hasMore:false});
    if (path === '/api/app/auth/start') return route.fulfill({contentType:'text/html', body:'<!doctype html><title>login</title>'});
    if (path === '/api/app/profes/message') {
      messages.push(JSON.parse(route.request().postData() ?? '{}'));
      if (rejectMessage) return route.fulfill({status:401, contentType:'application/json', body:JSON.stringify({code:'LOGIN_REQUIRED_GUEST_LIMIT', error:'Crea tu cuenta Campus.'})});
      return route.fulfill({contentType:'application/x-ndjson', body:JSON.stringify({type:'answer', answer:'Respuesta pública de muestra.', conversationId:id, usage:{remaining:0, limit:1, period:'sample'}})+'\n'});
    }
    return json({});
  });
  try {
    await page.goto(base + '/app/asistente/');
    await run({page, messages, errors});
    assert.deepEqual(errors, []);
    console.log(`Guest sample: ${name} passes.`);
  } finally { await context.close(); }
}

try {
  await scenario('sample arm asks one question and then shows the account CTA', {
    arm:'sample', guestSample:{available:true, remaining:1, limit:1},
    run: async ({page, messages}) => {
      const box = page.getByRole('textbox', {name:'Escribe tu pregunta a Campu'});
      await box.waitFor();
      assert.equal(await page.getByRole('heading', {name:'Entra para hablar con Campu.'}).count(), 0);
      assert.equal(await page.getByRole('group', {name:'Ideas para empezar'}).getByRole('button').count(), 2, 'Only public professor and course starters');
      await box.fill('¿Qué dicen los estudiantes de Luis Vives?');
      await page.getByRole('button', {name:'Enviar pregunta', exact:true}).click();
      await page.getByText('Respuesta pública de muestra.', {exact:true}).waitFor();
      assert.equal(messages.length, 1);
      const cta = page.locator('[data-guest-sample-cta]');
      await cta.waitFor();
      assert.equal(await box.isVisible(), false, 'The composer closes once the sample is used');
      const href = new URL(await cta.getByRole('link', {name:'Crear cuenta y seguir'}).getAttribute('href'), page.url());
      assert.equal(href.pathname, '/api/app/auth/start');
      // A session refresh after the sample is spent (the backend no longer offers it)
      // must not swap the conversation for the account wall.
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('campus:session-updated', {detail:{authenticated:false, plan:'anon', aiReady:true, guestSample:{available:false, remaining:0, limit:1}}})));
      await page.waitForTimeout(300);
      assert.equal(await page.getByRole('heading', {name:'Entra para hablar con Campu.'}).count(), 0, 'The wall does not replace the answer');
      assert.equal(await page.getByText('Respuesta pública de muestra.', {exact:true}).count(), 1);
      assert.equal(await cta.count(), 1);
      // Starting a new consultation after the sample must not leave a chat without input or prompt.
      await page.evaluate(() => document.querySelector('[aria-label="Nueva consulta"]')?.click());
      await page.getByRole('heading', {name:'Entra para hablar con Campu.'}).waitFor();
      assert.equal(await page.getByRole('group', {name:'Ideas para empezar'}).count(), 0);
      assert.equal(await page.getByRole('textbox', {name:'Escribe tu pregunta a Campu'}).count(), 0);
    },
  });
  await scenario('a sample rejected with 401 (spent in another tab) keeps the question for the login handoff', {
    arm:'sample', guestSample:{available:true, remaining:1, limit:1}, rejectMessage:true,
    run: async ({page, messages}) => {
      const question = '¿Qué dicen los estudiantes de Luis Vives?';
      await page.getByRole('textbox', {name:'Escribe tu pregunta a Campu'}).fill(question);
      await page.getByRole('button', {name:'Enviar pregunta', exact:true}).click();
      await page.waitForURL(url => new URL(url).pathname === '/api/app/auth/start');
      assert.equal(messages.length, 1);
      const stored = await page.evaluate(() => ({
        drafts: JSON.parse(sessionStorage.getItem('campus-conversation-drafts-v1') ?? 'null'),
        handoff: JSON.parse(sessionStorage.getItem('campus-guest-draft-handoff-v1') ?? 'null'),
      }));
      assert.equal(stored.drafts?.owner, 'guest');
      assert.deepEqual(stored.drafts?.entries, [['new', question]], 'the rejected question is persisted');
      assert.ok(stored.handoff?.record, 'the handoff marker points at that draft');
    },
  });
  await scenario('gate arm keeps the account wall even when the backend offers the sample', {
    arm:'gate', guestSample:{available:true, remaining:1, limit:1},
    run: async ({page, messages}) => {
      await page.getByRole('heading', {name:'Entra para hablar con Campu.'}).waitFor();
      assert.equal(await page.getByRole('textbox', {name:'Escribe tu pregunta a Campu'}).count(), 0);
      assert.equal(messages.length, 0);
    },
  });
  await scenario('backend without the sample behaves exactly like today', {
    arm:'sample', guestSample:undefined,
    run: async ({page, messages}) => {
      await page.getByRole('heading', {name:'Entra para hablar con Campu.'}).waitFor();
      assert.equal(await page.getByRole('textbox', {name:'Escribe tu pregunta a Campu'}).count(), 0);
      assert.equal(messages.length, 0);
    },
  });
  await scenario('used sample goes back to the wall on reload', {
    arm:'sample', guestSample:{available:false, remaining:0, limit:1},
    run: async ({page}) => {
      await page.getByRole('heading', {name:'Entra para hablar con Campu.'}).waitFor();
    },
  });
  // Arm assignment: stored once, only when the backend offers the sample.
  const context = await browser.newContext({viewport:{width:390, height:900}, serviceWorkers:'block'});
  const page = await context.newPage();
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith('/api/app/')) return route.continue();
    const json = data => route.fulfill({contentType:'application/json', body:JSON.stringify(data)});
    if (url.pathname.replace(/\/$/, '') === '/api/app/session') return json({authenticated:false, plan:'anon', aiReady:true, guestSample:{available:true, remaining:1, limit:1}});
    return json({conversations:[], messages:[], hasMore:false});
  });
  await page.goto(base + '/app/asistente/');
  await page.waitForFunction(() => ['sample', 'gate'].includes(localStorage.getItem('campus-guest-sample-arm-v1')));
  const first = await page.evaluate(() => localStorage.getItem('campus-guest-sample-arm-v1'));
  await page.reload();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => localStorage.getItem('campus-guest-sample-arm-v1')), first, 'The arm is stable across visits');
  await context.close();
  console.log('Guest sample: arm assignment is stored once and stays stable.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
console.log('Guest sample E2E passed.');
