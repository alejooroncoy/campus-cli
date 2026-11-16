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
   if(u.pathname==='/api/app/whatsapp/checkout'){writes.push(r.request().postDataJSON());return r.fulfill({status:409,json:{error:'Pago de prueba sin cobro'}});}
   if(u.pathname==='/api/app/plus/config')return r.fulfill({json:{enabled:true,ordersAvailable:true}});
   if(u.pathname==='/api/app/plus/state')return r.fulfill({json:{orders:[],subscription:null,subscriptionState:'none',currentPlan:'plus',enabled:true,eligible:true,flowAvailable:true}});
   return r.fulfill({json:{}});
  });
  const panel=page.locator('[data-whatsapp-reminders]');
  const load=async()=>{await page.goto(base+'/app/plus/');await page.locator('[data-wa-summary]').filter({hasText:/Resumen semanal incluido/}).waitFor();};
  await load();assert.match(await panel.textContent(),/resumen por WhatsApp cada semana/);assert.match(await panel.textContent(),/20 avisos extra al mes por S\/5/);assert.match(await page.locator('[data-wa-summary]').textContent(),/Resumen semanal incluido \(1 enviado este mes\)\. Sin avisos extra/);assert.equal(writes.length,0);
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/app/whatsapp/preferences'));
  await page.locator('[data-wa-enabled]').check();await saved;assert.deepEqual(writes[0],{enabled:true,consent:true});
  await page.waitForFunction(()=>!document.querySelector('[data-wa-enabled]').disabled);
  await page.locator('[data-wa-pack] button').click();assert.equal(writes.length,1,'purchase requires explicit consent');
  await page.locator('[data-wa-pack] [name=consent]').check();await page.locator('[data-wa-pack] button').click();
  await page.locator('[data-wa-summary]').filter({hasText:'Pago de prueba sin cobro'}).waitFor();assert.deepEqual(writes[1],{consent:true});
  if(process.argv[2])await page.screenshot({path:process.argv[2]+'/whatsapp-'+width+'.png',fullPage:true});
  state={...initial,enabled:true,pack:true,quota:20,used:20,remaining:0};await load();
  assert.match(await page.locator('[data-wa-summary]').textContent(),/Avisos extra: 20 de 20.*Te quedan 0/);assert.equal(await page.locator('[data-wa-pack]').isVisible(),false);
  state={...initial,linked:false};await load();assert.equal(await page.locator('[data-wa-link-needed]').isVisible(),true);assert.equal(await page.locator('[data-wa-optin]').isVisible(),false);
  state={...initial,available:false};await load();assert.equal(await page.locator('[data-wa-unavailable]').isVisible(),true);assert.equal(await page.locator('[data-wa-pack]').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  console.log('ok whatsapp quota, opt-in, purchase consent, unavailable, linked identity',width);await context.close();
 }
}finally{await browser.close();server.close();}
