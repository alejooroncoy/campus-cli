import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';

const bundle=await build({stdin:{contents:`import * as marketing from './src/scripts/marketing-consent.ts';window.marketing=marketing;`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'});
const browser=await chromium.launch({headless:true});
const root=resolve('dist');
const server=createServer(async(req,res)=>{try{
  let path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!path.startsWith(root+'/'))throw Error();
  if((await stat(path)).isDirectory())path=resolve(path,'index.html');
  res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.webp':'image/webp'})[extname(path)]??'application/octet-stream'});
  res.end(await readFile(path));
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
try{
  // Browser matching IDs are created only by an explicit account setting, never a page visit.
  const context=await browser.newContext(),page=await context.newPage(),requests=[];
  let saved={enabled:false,observedAt:null,expiresAt:null};
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());assert.equal(url.origin,'https://campus.test');
    if(url.pathname==='/api/app/marketing'){
      if(req.method()==='GET')return route.fulfill({json:saved});
      const p=req.postDataJSON();requests.push(p);saved={enabled:p.consent,observedAt:p.observedAt,expiresAt:p.observedAt+30*86400000};return route.fulfill({status:200});
    }
    return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><h1>Campus</h1>'});
  });
  await page.goto('https://campus.test/?fbclid=synthetic_click&course=private');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(()=>window.marketing.setupMarketingConsent());
  assert.equal(requests.length,0);assert.equal((await context.cookies()).length,0);
  assert.equal(await page.evaluate(()=>window.marketing.accountMarketingPreference()),false);
  await page.evaluate(()=>window.marketing.setAccountMarketingPreference(true));
  assert.equal(requests[0].consent,true);assert.match(requests[0].fbc,/\.synthetic_click$/);
  assert.match(requests[0].fbp,/^fb\.1\.[0-9]{13}\.[0-9]+$/);assert.equal(JSON.stringify(requests).includes('private'),false);
  const cookie=(await context.cookies('https://campus.test/api/app/auth/callback')).find(c=>c.name==='campus_marketing');
  assert.ok(cookie.secure);assert.equal(cookie.sameSite,'Lax');assert.equal(cookie.path,'/api/app/');
  assert.equal((await context.cookies('https://campus.test/')).some(c=>c.name==='campus_marketing'),false);
  await page.evaluate(()=>window.marketing.setAccountMarketingPreference(false));
  assert.equal(requests.at(-1).consent,false);assert.equal(requests.at(-1).fbc,undefined);assert.equal(requests.at(-1).fbp,undefined);
  assert.equal(await page.evaluate(()=>window.marketing.metaClickId('?fbclid=one&fbclid=two')),undefined);
  assert.equal(await page.evaluate(()=>window.marketing.metaClickId('?fbclid=private%40example.test')),undefined);
  await page.evaluate(()=>window.marketing.clearMarketingPreference());
  assert.equal((await context.cookies()).some(c=>c.name==='campus_marketing'),false);
  await context.close();

  for(const width of [390,1280]){
    const ctx=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
    const screen=await ctx.newPage(),errors=[],writes=[];screen.on('pageerror',e=>errors.push(e.message));
    let authenticated=false,failRead=false,failSave=false;
    let preference={enabled:false,observedAt:null,expiresAt:null};
    await ctx.route('**/*',route=>{
      const req=route.request(),url=new URL(req.url());if(url.origin!==base)return route.abort();
      const path=url.pathname.replace(/\/$/,'');
      if(path.startsWith('/c-events'))return route.fulfill({status:204});
      if(!path.startsWith('/api/'))return route.continue();
      if(path==='/api/app/session')return route.fulfill({json:{authenticated,analyticsId:authenticated?'campus:profile_marketing_fixture':undefined,analyticsAudience:'test',email:authenticated?'fixture@example.test':undefined,plan:authenticated?'free':'anon',aiReady:true,universityConfirmed:true,profesAvailable:true,university:{id:1,name:'Universidad Peruana de Ciencias Aplicadas',shortName:'UPC'},usage:{remaining:25,limit:25,period:'trial'},banner:{connected:false},features:{schedulePlanning:false}}});
      if(path==='/api/app/marketing'){
        if(req.method()==='GET')return failRead?route.fulfill({status:503}):route.fulfill({json:preference});
        if(failSave)return route.fulfill({status:503});
        const p=req.postDataJSON();writes.push(p);
        assert.ok(Object.keys(p).every(k=>['consent','version','observedAt','fbc','fbp'].includes(k)));
        if(p.observedAt>=(preference.observedAt??0))preference={enabled:p.consent,observedAt:p.observedAt,expiresAt:p.observedAt+30*86400000};
        return route.fulfill({status:200});
      }
      if(path==='/api/app/correction-preferences')return route.fulfill({json:{authenticated,enabled:false}});
      return route.fulfill({json:{}});
    });
    await screen.goto(base+'/app/perfil/',{waitUntil:'networkidle'});
    await screen.locator('[data-app-profile-guest]').waitFor({state:'visible'});
    assert.equal(await screen.locator('[data-marketing-consent],[data-marketing-choice]').count(),0);
    assert.equal(await screen.getByRole('switch',{name:'Medición de anuncios'}).count(),0);
    assert.equal(writes.length,0);assert.equal(await screen.locator('[data-app-login]').isEnabled(),true);
    authenticated=true;
    await screen.reload({waitUntil:'networkidle'});
    const control=screen.getByRole('switch',{name:'Medición de anuncios'}),card=screen.locator('#privacidad');
    await control.waitFor({state:'visible'});await screen.waitForFunction(()=>!document.querySelector('#privacidad input').disabled);
    assert.equal(await control.isChecked(),false);
    await control.check();await card.getByRole('status').filter({hasText:'Medición activada.'}).waitFor();
    assert.equal(preference.enabled,true);assert.equal(writes.at(-1).consent,true);
    // A newer account withdrawal from another browser wins over the old browser cookie.
    preference={enabled:false,observedAt:Date.now(),expiresAt:Date.now()+30*86400000};
    await screen.reload({waitUntil:'networkidle'});
    await screen.waitForFunction(()=>!document.querySelector('#privacidad input').disabled);
    assert.equal(await control.isChecked(),false);assert.equal(preference.enabled,false);
    failSave=true;await control.check();await card.getByRole('status').filter({hasText:'No pudimos guardar'}).waitFor();
    assert.equal(await control.isChecked(),false);assert.equal(preference.enabled,false);
    failSave=false;await control.check();await card.getByRole('status').filter({hasText:'Medición activada.'}).waitFor();
    await control.uncheck();await card.getByRole('status').filter({hasText:'Medición desactivada.'}).waitFor();
    assert.equal(preference.enabled,false);
    failRead=true;await screen.reload({waitUntil:'networkidle'});await card.getByRole('status').filter({hasText:'No pudimos consultar'}).waitFor();
    assert.equal(await control.isEnabled(),false,'An unavailable account choice must not be presented as a saved off choice');
    failRead=false;await card.getByRole('button',{name:'Volver a intentar'}).click();await screen.waitForFunction(()=>!document.querySelector('#privacidad input').disabled);
    await screen.goto(base+'/privacidad/#anuncios',{waitUntil:'networkidle'});
    assert.equal(await screen.getByRole('button',{name:'Cambiar preferencia de anuncios'}).count(),0);
    assert.equal(await screen.getByRole('link',{name:'Mi perfil → Privacidad'}).getAttribute('href'),'/app/perfil/#privacidad');
    assert.equal(await screen.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    assert.deepEqual(errors,[]);await ctx.close();
    console.log(`${width}px: clean signup, account switch, saved activation/withdrawal, newer remote rejection, errors/retry and Privacy link passed.`);
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
