import {createServer} from 'node:http';
import {readFile, stat, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root = resolve('dist');
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname.replace(/^\/app\/asistente\/c\/[0-9a-f-]+\/$/, '/app/asistente/');
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
const id = '11111111-1111-4111-8111-111111111111';
try {
  for (const width of [390, 1100]) {
    const context = await browser.newContext({viewport:{width, height:900}, serviceWorkers:'block'});
    // An old browser preference and trial balance cannot bypass the new gate.
    await context.addInitScript(() => localStorage.setItem('campus-university-choice-v1', JSON.stringify({version:1, university:{id:1, name:'UPC', shortName:'UPC'}})));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let authenticated = false, questions = 0, authReturn;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith('/api/app/')) return route.continue();
      const path = url.pathname.replace(/\/$/, '');
      const json = data => route.fulfill({contentType:'application/json', body:JSON.stringify(data)});
      if (path === '/api/app/session') return json({authenticated, email:authenticated?'fixture@example.test':undefined, plan:authenticated?'free':'anon', aiReady:true, universityConfirmed:true, university:{id:1,name:'UPC',shortName:'UPC'}, profesAvailable:true, usage:{remaining:authenticated?25:5, limit:authenticated?25:5, period:'trial'}});
      if (path === '/api/app/profes/conversations') return json({conversations:[]});
      if (path === '/api/app/profes/conversation') return json({messages:[], hasMore:false});
      if (path === '/api/app/auth/start') {
        authReturn = url.searchParams.get('return');
        authenticated = true;
        return route.fulfill({status:302, headers:{location:base + authReturn}, body:''});
      }
      if (path === '/api/app/profes/message') {
        assert.equal(authenticated, true);
        questions++;
        return route.fulfill({contentType:'application/x-ndjson', body:JSON.stringify({type:'answer',answer:'Respuesta de prueba con cuenta.',conversationId:id,usage:{remaining:24,limit:25,period:'trial'}})+'\n'});
      }
      return json({});
    });
    await page.goto(base + '/');
    await page.locator('.cp-plan--free').waitFor();
    assert.equal(await page.locator('.cp-plan-trial').count(), 0);
    assert.equal(await page.getByText('¿Solo quieres probar?', {exact:true}).count(), 0);
    if (width > 760) {
      const free = await page.locator('.cp-plan--free').boundingBox();
      const plus = await page.locator('.cp-plan--plus').boundingBox();
      assert.ok(Math.abs(free.y - plus.y) < 2, 'Plan cards share a row after removing the trial');
    }
    await page.goto(base + '/app/asistente/');
    await page.getByRole('heading', {name:'Entra para hablar con Campu.'}).waitFor();
    assert.equal(await page.getByRole('textbox', {name:'Escribe tu pregunta a Campu'}).count(), 0);
    assert.equal(await page.getByRole('group', {name:'Ideas para empezar'}).count(), 0);
    assert.equal(questions, 0);
    const mascot = page.getByRole('img', {name:'Campu saludando'});
    await mascot.waitFor();
    await page.locator('[data-character-greeting][data-ready="true"]').waitFor();
    assert.equal(await mascot.evaluate(root => [...root.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0)), true);
    const poses = await mascot.evaluate(root => {
      const arm = root.querySelector('.character-greeting__arm');
      const animation = arm.getAnimations()[0];
      if (!animation) return [];
      animation.pause();
      animation.currentTime = 650;
      const first = getComputedStyle(arm).transform;
      animation.currentTime = 1050;
      return [first, getComputedStyle(arm).transform];
    });
    assert.equal(poses.length, 2);
    assert.notEqual(poses[0], poses[1], 'The greeting moves the arm independently of the body');
    await mascot.evaluate(root => root.getAnimations({subtree:true}).forEach(animation => animation.finish()));
    const imageBox = await mascot.boundingBox();
    const buttonBox = await page.getByRole('link', {name:'Crear cuenta o iniciar sesión',exact:true}).boundingBox();
    assert.ok(imageBox.y >= buttonBox.y + buttonBox.height);
    const navigation = width < 700 ? page.locator('.app-mobile-nav') : page.locator('nav[aria-label="Plataforma"]');
    assert.equal(await navigation.getByRole('link', {name:'Campu',exact:true}).count(), 1);

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mkdir('.test-results/account-required', {recursive:true});
    await page.screenshot({path:`.test-results/account-required/${width}.png`, fullPage:true});
    await page.getByRole('link', {name:'Crear cuenta o iniciar sesión',exact:true}).click();
    await page.getByRole('textbox', {name:'Escribe tu pregunta a Campu'}).waitFor();
    assert.equal(authReturn, '/app/asistente/');
    await page.getByRole('textbox', {name:'Escribe tu pregunta a Campu'}).fill('Hola');
    await page.getByRole('button', {name:'Enviar pregunta',exact:true}).click();
    await page.getByText('Respuesta de prueba con cuenta.', {exact:true}).waitFor();
    assert.equal(questions, 1);

    authenticated = false;
    const returnPath = `/app/asistente/c/${id}/?modal=review`;
    await page.goto(base + returnPath);
    await page.getByRole('heading', {name:'Entra para hablar con Campu.'}).waitFor();
    const login = page.getByRole('link', {name:'Crear cuenta o iniciar sesión',exact:true});
    assert.equal(new URL(await login.getAttribute('href'), base).searchParams.get('return'), returnPath);
    assert.equal(await page.getByRole('dialog').count(), 0, 'Review entry also waits for login');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator('[data-character-greeting][data-ready="true"]').waitFor();
    assert.equal(await page.locator('[data-character-greeting]').evaluate(root => root.getAnimations({subtree:true}).length), 0, 'Reduced motion keeps the greeting still');
    // A failed layer must keep the complete original illustration visible.
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.route('**/assets/campu/campu-body-*.webp', route => route.abort());
    await page.reload();
    const fallback = page.locator('.character-greeting__fallback');
    await fallback.waitFor({state:'visible'});
    await page.waitForFunction(() => document.querySelector('.character-greeting__fallback')?.complete);
    assert.equal(await fallback.evaluate(image => image.naturalWidth > 0), true);
    assert.equal(await page.locator('[data-character-greeting]').getAttribute('data-ready'), 'false');
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Account required: marketing, legacy guest, login, authenticated query and return path pass at ${width}px.`);
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
