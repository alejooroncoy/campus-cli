import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const bundle=await build({stdin:{contents:`import {setupMarketingConsent,syncMarketingPreference,clearMarketingPreference,metaClickId} from './src/scripts/marketing-consent.ts';window.marketing={setupMarketingConsent,syncMarketingPreference,clearMarketingPreference,metaClickId};`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'});
const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext();
  const page=await context.newPage();const requests=[];
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    assert.equal(url.origin,'https://campus.test','No external requests are permitted');
    if(url.pathname==='/api/app/marketing'){
      requests.push(JSON.parse(request.postData()));return route.fulfill({status:204});
    }
    return route.fulfill({contentType:'text/html',body:'<!doctype html><aside data-marketing-consent hidden><button data-marketing-reject>Rechazar</button><button data-marketing-accept>Permitir</button></aside><button data-marketing-settings>Preferencias</button>'});
  });
  await page.goto('https://campus.test/?fbclid=synthetic_click&utm_source=instagram&utm_campaign=123456789&course=private');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(()=>window.marketing.setupMarketingConsent());
  assert.equal(await page.locator('[data-marketing-consent]').isVisible(),true);
  assert.equal(requests.length,0,'No consent: no outbound marketing calls or identifiers');
  assert.equal((await context.cookies()).length,0);
  await page.getByRole('button',{name:'Permitir',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-marketing-consent]').hidden);
  await page.evaluate(()=>window.marketing.syncMarketingPreference());
  assert.equal(requests[0].consent,true);assert.match(requests[0].fbc,/\.synthetic_click$/);
  assert.match(requests[0].fbp,/^fb\.1\.[0-9]{13}\.[0-9]+$/);
  assert.equal(JSON.stringify(requests).includes('private'),false);
  const cookie=(await context.cookies('https://campus.test/api/app/auth/callback')).find(c=>c.name==='campus_marketing');
  assert.ok(cookie.secure);assert.equal(cookie.sameSite,'Lax');assert.equal(cookie.path,'/api/app/');
  assert.equal((await context.cookies('https://campus.test/')).some(c=>c.name==='campus_marketing'),false);
  await page.getByRole('button',{name:'Preferencias',exact:true}).click();
  await page.getByRole('button',{name:'Rechazar',exact:true}).click();
  await page.evaluate(()=>window.marketing.syncMarketingPreference());
  assert.equal(requests.at(-1).consent,false);assert.equal(requests.at(-1).fbc,undefined);assert.equal(requests.at(-1).fbp,undefined);
  assert.equal(await page.evaluate(()=>window.marketing.metaClickId('?fbclid=one&fbclid=two')),undefined);
  assert.equal(await page.evaluate(()=>window.marketing.metaClickId('?fbclid=private%40example.test')),undefined);
  await page.evaluate(()=>window.marketing.clearMarketingPreference());
  assert.equal(await page.locator('[data-marketing-consent]').isVisible(),true);
  assert.equal((await context.cookies()).some(c=>c.name==='campus_marketing'),false,'Logout does not carry click/consent cookies to another account');
  await context.close();
  console.log('Marketing consent: default off, explicit acceptance/rejection, OAuth cookie, click validation and no external/private data pass.');
}finally{await browser.close();}
