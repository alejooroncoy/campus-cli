import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
// Mi suscripción: estado, avisos y pagos de Campus Plus con la API simulada. Sirve el sitio ya construido.
const root=fileURLToPath(new URL('../dist', import.meta.url));
const server=createServer(async(req,res)=>{
  try {
    let file=path.join(root,new URL(req.url,'http://localhost').pathname);
    if ((await stat(file)).isDirectory()) file=path.join(file,'index.html');
    const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'}[path.extname(file)]??'application/octet-stream';
    res.writeHead(200,{'content-type':type});res.end(await readFile(file));
  }catch {res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;

const initial={available:true,paymentsAvailable:true,subscribed:true,linked:true,enabled:false,pack:false,weeklyIncluded:true,weeklySent:1,quota:0,used:0,remaining:0,resetsAt:'2026-12-01T05:00:00Z'};
const browser=await chromium.launch({headless:true});
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[],writes=[];
  let state={...initial};page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async r=>{
   const u=new URL(r.request().url());u.pathname=u.pathname.replace(/\/+$/,'');
   if(u.pathname==='/api/app/session')return r.fulfill({json:{authenticated:true,email:'fixture@example.test',plan:'plus',universityConfirmed:true,analyticsId:'campus:fixture'}});
   if(u.pathname==='/api/app/whatsapp')return r.fulfill({json:state});
   if(u.pathname==='/api/app/whatsapp/preferences'){const input=r.request().postDataJSON();writes.push(input);state.enabled=input.enabled;return r.fulfill({json:{enabled:state.enabled}});}
   if(u.pathname==='/api/app/whatsapp/phone'){const input=r.request().postDataJSON();writes.push(input);state={...state,linked:true,phone:'+51 ••• ••• 321'};return r.fulfill({json:{phone:state.phone}});}
   if(u.pathname==='/api/app/whatsapp/checkout'){writes.push(r.request().postDataJSON());return r.fulfill({status:409,json:{error:'Pago de prueba sin cobro'}});}
   // Tu calendario (/app/novedades/) no es lo que se prueba aquí: responde como servicio no disponible.
   if(u.pathname.startsWith('/api/app/proactive'))return r.fulfill({status:503,json:{error:'PROACTIVE_UNAVAILABLE'}});
   if(u.pathname==='/api/app/plus/config')return r.fulfill({json:{enabled:true,ordersAvailable:true}});
   if(u.pathname==='/api/app/plus/state')return r.fulfill({json:{orders:[],subscription:null,subscriptionState:'none',currentPlan:'plus',enabled:true,eligible:true,flowAvailable:true}});
   return r.fulfill({json:{}});
  });
  const panel=page.locator('[data-whatsapp-reminders]'),summary=page.locator('[data-wa-summary]'),pack=page.locator('[data-wa-pack-wrap]');
  // Espera a que la tarjeta pinte el estado que devuelve la API (data-state), no un texto concreto.
  const load=async(expected,url='/app/plus/')=>{await page.goto(base+url);await page.locator(`[data-whatsapp-reminders][data-state="${expected}"]`).waitFor({state:'attached'});};
  // Sin el campo phone (servicio anterior) no se inventa un número; con él, se muestra enmascarado y se puede cambiar.
  await load('off');assert.equal(await page.locator('[data-wa-number]').isVisible(),false);
  state={...initial,phone:'+51 ••• ••• 585'};await load('off');
  assert.equal(await page.locator('[data-wa-phone]').textContent(),'+51 ••• ••• 585');
  // Cambiar número se hace aquí mismo: nada abre WhatsApp.
  assert.equal(await page.locator('[data-whatsapp-reminders] a[href*="wa.me"]').count(),0);
  await page.locator('[data-wa-change]').click();assert.equal(await page.locator('[data-wa-phone-form]').isVisible(),true);assert.equal(await page.locator('[data-wa-number]').isVisible(),false);
  await page.locator('[data-wa-phone-cancel]').click();assert.equal(await page.locator('[data-wa-phone-form]').isVisible(),false);assert.equal(await page.locator('[data-wa-number]').isVisible(),true);
  state={...initial,phone:'Usuario de WhatsApp'};await load('off');assert.equal(await page.locator('[data-wa-phone]').textContent(),'tu WhatsApp vinculado');
  state={...initial};
  await load('off');assert.match(await panel.textContent(),/Un mensaje a la semana/);assert.equal(await summary.textContent(),'');assert.equal(await pack.isVisible(),false,'el paquete se ofrece después de encender el resumen');assert.equal(writes.length,0);
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/app/whatsapp/preferences/'));
  await page.locator('[data-wa-enabled]').check();await saved;assert.deepEqual(writes[0],{enabled:true,consent:true});
  await page.locator('[data-whatsapp-reminders][data-state="on"]').waitFor({state:'attached'});
  await page.waitForFunction(()=>!document.querySelector('[data-wa-enabled]').disabled);
  assert.equal(await summary.textContent(),'Activo · 1 resumen este mes');
  await pack.locator('summary').click();assert.match(await pack.textContent(),/20 por S\/5 al mes/);
  await page.locator('[data-wa-pack] button').click();assert.equal(writes.length,1,'purchase requires explicit consent');
  await page.locator('[data-wa-pack] [name=consent]').check();await page.locator('[data-wa-pack] button').click();
  await summary.filter({hasText:'Pago de prueba sin cobro'}).waitFor();assert.deepEqual(writes[1],{consent:true});assert.equal(await summary.getAttribute('data-error'),'true');
  if(process.argv[2])await page.screenshot({path:process.argv[2]+'/whatsapp-'+width+'.png',fullPage:true});
  state={...initial,enabled:true,pack:true,quota:20,used:20,remaining:0};await load('on');
  assert.match(await summary.textContent(),/Avisos al momento: te quedan 0 de 20 hasta el 1 de diciembre/);assert.equal(await summary.getAttribute('data-error'),null);assert.equal(await pack.isVisible(),false);
  state={...initial,linked:false,phone:null};await load('link');assert.equal(await page.locator('[data-wa-phone-form]').isVisible(),true);assert.equal(await page.locator('[data-wa-phone-cancel]').isVisible(),false);assert.equal(await page.locator('[data-wa-number]').isVisible(),false);assert.equal(await page.locator('[data-wa-optin]').isVisible(),false);
  // Un número que no se reconoce no se manda; uno válido se confirma antes de guardarse.
  const writesBefore=writes.length,input=page.locator('[data-wa-phone-input]'),submit=page.locator('[data-wa-phone-submit]'),hintEl=page.locator('[data-wa-phone-hint]');
  await input.fill('12345');await submit.click();assert.equal(await hintEl.getAttribute('data-error'),'true');assert.equal(writes.length,writesBefore);
  await input.fill('987 654 321');await submit.click();assert.equal(await hintEl.textContent(),'¿Es +51 987 654 321? Ahí te llegarán tus avisos.');assert.equal(await submit.textContent(),'Sí, es mi número');assert.equal(writes.length,writesBefore);
  const savedPhone=page.waitForResponse(r=>r.url().endsWith('/api/app/whatsapp/phone/'));await submit.click();await savedPhone;
  assert.deepEqual(writes.at(-1),{phone:'987 654 321'});
  await page.locator('[data-whatsapp-reminders][data-state="off"]').waitFor({state:'attached'});
  assert.equal(await page.locator('[data-wa-phone]').textContent(),'+51 ••• ••• 321');assert.equal(await page.locator('[data-wa-phone-form]').isVisible(),false);assert.equal(await page.locator('[data-wa-optin]').isVisible(),true);
  state={...initial,available:false};await load('unavailable');assert.equal(await page.locator('[data-wa-unavailable]').isVisible(),true);assert.equal(await page.locator('[data-wa-unavailable] a').getAttribute('href'),'/app/novedades/#avisos');assert.equal(await pack.isVisible(),false);
  // Sin Plus: en Mi suscripción el pago ya está arriba; en Tu calendario la tarjeta lleva a Plus.
  state={...initial,subscribed:false,linked:false,enabled:false};await load('free');assert.equal(await page.locator('[data-wa-upsell]').isVisible(),false);
  await load('free','/app/novedades/');assert.equal(await page.locator('[data-wa-upsell]').isVisible(),true);assert.equal(await page.locator('[data-wa-upsell] a').getAttribute('href'),'/app/plus/');assert.equal(await page.locator('[data-wa-unavailable]').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  console.log('ok whatsapp quota, opt-in, purchase consent, unavailable, linked identity',width);await context.close();
 }
}finally{await browser.close();server.close();}
