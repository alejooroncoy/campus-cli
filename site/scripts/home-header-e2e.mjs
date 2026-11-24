// Prueba de punta a punta del header de la home, en computadora y en celular.
// Corre contra el sitio ya construido (`npm run build`) y deja capturas en .test-results/home-header/
// para mirarlas a ojo. Cada comprobación dice en español qué se espera.
import {createServer} from 'node:http';
import {readFile, stat, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root = resolve('dist');
const shots = resolve('.test-results/home-header');
await mkdir(shots, {recursive: true});
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.webm':'video/webm', '.mov':'video/quicktime', '.woff2':'font/woff2'};
const server = createServer(async (req, res) => {
  try {
    let path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (path !== root && !path.startsWith(root + '/')) throw Error();
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    res.writeHead(200, {'content-type': types[extname(path)] ?? 'application/octet-stream'});
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true});

/** Estado del header tal como lo ve el visitante. */
const header = page => page.evaluate(() => {
  const h = document.querySelector('.site-header');
  const r = h.getBoundingClientRect();
  const title = document.querySelector('.hv-hero h1')?.getBoundingClientRect();
  return {compact: h.classList.contains('is-scrolled'), top: r.top, bottom: r.bottom, width: r.width,
    visible: r.bottom > 0 && getComputedStyle(h).visibility !== 'hidden', titleTop: title ? title.top : null};
});
/** Espera a que termine la animación del header (0,42 s en styles.css). */
const settle = page => page.waitForTimeout(600);

let checks = 0;
const check = (ok, message) => { assert.ok(ok, message); checks++; };

try {
  for (const [label, viewport] of [['computadora', {width: 1440, height: 900}], ['celular', {width: 390, height: 844}]]) {
    const context = await browser.newContext({viewport, serviceWorkers: 'block', reducedMotion: 'reduce'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Nada sale a internet: analítica, fuentes externas y videos remotos se cortan.
    await page.route(url => !url.href.startsWith(base), route => route.abort());

    // 1. Al abrir la home, arriba de todo: header completo y sin tapar el título.
    await page.goto(base + '/');
    await settle(page);
    let h = await header(page);
    check(!h.compact, `[${label}] Arriba de la página el header debe verse completo, no como píldora.`);
    check(h.titleTop === null || h.bottom <= h.titleTop, `[${label}] El header no debe tapar el título de la portada (header termina en ${Math.round(h.bottom)} px, título empieza en ${Math.round(h.titleTop)} px).`);
    await page.screenshot({path: `${shots}/${label}-1-arriba.png`});

    // 2. Al bajar con la rueda: se vuelve píldora, queda pegado arriba y entra en la pantalla.
    await page.mouse.wheel(0, 1200);
    await settle(page);
    h = await header(page);
    check(h.compact, `[${label}] Al bajar, el header debe pasar a la píldora compacta.`);
    check(h.visible && h.top >= 0 && h.top <= 16, `[${label}] La píldora debe quedar pegada arriba y visible (top ${Math.round(h.top)} px).`);
    check(h.width <= Math.min(860, viewport.width - 24) + 1, `[${label}] La píldora no debe ser más ancha que 860 px ni salirse de la pantalla (mide ${Math.round(h.width)} px).`);
    await page.screenshot({path: `${shots}/${label}-2-bajando.png`});

    // 3. Al volver arriba: regresa al header completo.
    await page.mouse.wheel(0, -5000);
    await settle(page);
    h = await header(page);
    check(!h.compact, `[${label}] Al volver arriba, el header debe volver a verse completo.`);

    // 4. Un salto de golpe a una sección (como un enlace del menú): la píldora aparece sin tener que mover la rueda.
    await page.evaluate(() => document.querySelector('#planes').scrollIntoView({behavior: 'instant'}));
    await settle(page);
    h = await header(page);
    check(h.compact && h.visible, `[${label}] Tras saltar a «Precios», el header debe estar compacto y visible.`);

    // 5. Entrar directo con un enlace a una sección (/#planes): ya sale compacto.
    await page.goto(base + '/#planes');
    await settle(page);
    h = await header(page);
    check(h.compact && h.visible, `[${label}] Al entrar por /#planes, el header debe salir compacto y visible.`);
    await page.screenshot({path: `${shots}/${label}-3-planes.png`});

    // 6. En celular, el menú se abre y muestra sus enlaces.
    if (label === 'celular') {
      await page.locator('.site-menu summary').click();
      check(await page.locator('.site-menu').evaluate(m => m.open), '[celular] El botón de menú debe abrir el menú.');
      check(await page.locator('.site-menu__panel a').first().isVisible(), '[celular] Con el menú abierto deben verse sus enlaces.');
      await page.screenshot({path: `${shots}/${label}-4-menu.png`});
    }

    check(errors.length === 0, `[${label}] La página no debe tener errores de JavaScript: ${errors.join(' | ')}`);
    await context.close();
  }
  // Selector de universidad (con animaciones encendidas, como un visitante normal).
  {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, serviceWorkers: 'block'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(url => !url.href.startsWith(base), route => route.abort());
    await page.goto(base + '/');
    const visible = sel => page.locator(sel).filter({visible: true}).count();
    const trial = await page.locator('.home-v2 .plan--free a[href="/campito/"]').count() > 0;

    // Sin elegir: la versión UPC, con el botón de Chrome.
    check(await visible('.hv-hero .actions a[href="/campito/"]') === 1, '[selector] Sin elegir universidad, la portada ofrece «Agregar Campito a Chrome».');

    // UPN: nada de Campito en vivo ni en la portada ni en precios.
    await page.getByRole('radio', {name: 'UPN'}).click();
    check(await page.getByRole('radio', {name: 'UPN'}).getAttribute('aria-checked') === 'true', '[selector] La UPN queda marcada como elegida.');
    check(await visible('.hv-hero .actions a[href="/campito/"]') === 0, '[selector] Con la UPN, la portada no ofrece la extensión.');
    check(await visible('.hv-hero .actions a[href="/app/copilot/"]') === 1, '[selector] Con la UPN, el botón principal es «Conectar mi IA».');
    check(await visible('#planes a[href="/campito/"]') === 0, '[selector] Con la UPN, precios no ofrece la clase gratis de Campito.');
    check(await visible('.hv-final a[href="/campito/"]') === 0, '[selector] Con la UPN, el cierre no ofrece la extensión.');
    if (trial) check(await visible('#planes .plan--free a[href="/app/"]') === 1, '[selector] Con la UPN y la clase gratis activa, la tarjeta Gratis lleva a la app.');

    // Otra: formulario para pedir Campus; arma el mensaje de WhatsApp y no se recuerda.
    await page.getByRole('radio', {name: 'Otra'}).click();
    check(await page.locator('[data-uni-ask]').isVisible(), '[selector] «Otra» muestra el formulario para pedir Campus.');
    await page.locator('#uni-ask-name').fill('  a');
    await page.locator('[data-uni-ask] button[type="submit"]').click();
    check(await page.locator('[data-uni-ask-error]').isVisible(), '[selector] Un nombre de una letra (con espacios) muestra el aviso «Escribe el nombre de tu universidad».');
    await page.locator('#uni-ask-name').fill('Universidad San Martín');
    await page.locator('[data-uni-ask] button[type="submit"]').click();
    const href = await page.locator('[data-uni-ask-link]').getAttribute('href');
    check(href.startsWith('https://wa.me/51946189585?text=') && decodeURIComponent(href).includes('Universidad San Martín'), '[selector] El pedido abre WhatsApp de soporte con el nombre ya escrito.');
    check(await page.locator('[data-uni-ask-done]').isVisible(), '[selector] Tras enviar se ve el aviso con el enlace de respaldo.');
    check(await page.evaluate(() => localStorage.getItem('campus-home-university')) === null, '[selector] «Otra» no se guarda en el navegador.');
    // Analítica (en local se guarda lo que se enviaría): la universidad viaja como código, nunca el nombre escrito.
    const sent = await page.evaluate(() => JSON.parse(sessionStorage.getItem('campus-analytics-debug') || '[]'));
    const names = sent.map(e => `${e.event}:${e.properties?.home_university ?? ''}`);
    check(names.includes('campus_home_university_selected:upn'), `[analítica] Elegir la UPN se mide con home_university=upn (llegó: ${names.join(', ')}).`);
    check(names.includes('campus_university_requested:otra'), '[analítica] El pedido de otra universidad se mide.');
    check(!JSON.stringify(sent).includes('San Martín'), '[analítica] El nombre escrito de la universidad nunca se envía.');

    // La UPN sí se recuerda al volver.
    await page.getByRole('radio', {name: 'UPN'}).click();
    await page.reload();
    check(await page.getByRole('radio', {name: 'UPN'}).getAttribute('aria-checked') === 'true', '[selector] Al volver, la UPN sigue elegida.');

    // El medidor de la clase no queda escondido detrás del header.
    await page.evaluate(() => document.querySelector('#en-clase .steps').scrollIntoView({block: 'center'}));
    await settle(page);
    const overlap = await page.evaluate(() => {
      const m = document.querySelector('.home-v2 .meter')?.getBoundingClientRect();
      const h = document.querySelector('.site-header').getBoundingClientRect();
      return m && m.height ? Math.max(0, h.bottom - m.top) : 0;
    });
    check(overlap === 0, `[en clase] El medidor de la clase no debe quedar debajo del header (se tapan ${Math.round(overlap)} px).`);
    check(errors.length === 0, `[selector] Sin errores de JavaScript: ${errors.join(' | ')}`);
    await context.close();
  }
  console.log(`Header y selector de la home: ${checks} comprobaciones pasaron. Capturas en .test-results/home-header/`);
} finally {
  await browser.close();
  server.close();
}
