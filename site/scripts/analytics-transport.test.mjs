import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { gunzipSync } from 'node:zlib';

// Real browser SDK and production configuration, but every request is fulfilled
// locally. Neither real project credentials nor PostHog Cloud are involved.
const key='phc_'+ 'A'.repeat(43);
const buyer='campus:google:123456789012345678901';
const {outputFiles}=await build({stdin:{contents:`
  import {analyticsSession,setupAnalytics,track} from './src/scripts/analytics.ts';
  setupAnalytics();
  analyticsSession({authenticated:true,plan:'free',analyticsId:'${buyer}',universityConfirmed:true,usage:{remaining:25,limit:25}});
  track('campus_cta_clicked',{intent:'plus',email:'private@example.test',receipt:'private-proof'});
  track('campus_plus_checkout_viewed',{offer:'founder',amount_cents:500});
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'browser',write:false,
  define:{'import.meta.env':JSON.stringify({DEV:false,PUBLIC_POSTHOG_KEY:key,PUBLIC_POSTHOG_HOST:'https://posthog.analytics.test'})},
});
const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({serviceWorkers:'block',userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'}),page=await context.newPage();
  // Exercise the same production code as a human browser; no SDK source patches.
  await context.addInitScript(() => {
    Object.defineProperty(navigator,'webdriver',{get:()=>false});
    Object.defineProperty(navigator,'userAgentData',{get:()=>({brands:[{brand:'Chromium',version:'140'}]})});
  });
  const events=[],errors=[],unexpected=[],requested=[],messages=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>messages.push(message.text()));
  let resolveReceived;
  const received=new Promise(resolve=>resolveReceived=resolve);
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    requested.push(url.origin+url.pathname);
    if(url.origin==='https://campus.analytics.test'){
      if(url.pathname==='/analytics-test.js')return route.fulfill({contentType:'text/javascript',body:outputFiles[0].text});
      return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="es"><body><a href="/app/plus/">Plus</a><script type="module" src="/analytics-test.js"></script></body></html>'});
    }
    if(url.origin==='https://posthog.analytics.test'){
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
      if(url.pathname==='/batch/'){
        const bytes=request.postDataBuffer();assert.ok(bytes);
        let text;
        if(bytes[0]===0x1f&&bytes[1]===0x8b)text=gunzipSync(bytes).toString('utf8');
        else text=bytes.toString('utf8');
        const payload=JSON.parse(text),batch=Array.isArray(payload)?payload:payload.batch??[payload];
        events.push(...batch);
        await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"status":"Ok"}'});
        if(events.some(e=>e.event==='campus_cta_clicked')&&events.some(e=>e.event==='campus_plus_checkout_viewed'))resolveReceived();
        return;
      }
    }
    unexpected.push(url.origin+url.pathname);await route.abort();
  });
  await page.goto('https://campus.analytics.test/app/turnitin/?source=mcp&ai_client=chatgpt&code=private-oauth',{
    waitUntil:'domcontentloaded',referer:'https://www.google.com/search?q=private-academic-question',
  });
  let timer;
  try{await Promise.race([received,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Real SDK did not deliver the checkout events: '+JSON.stringify({errors,unexpected,requested,messages,shapes:events.map(e=>({keys:Object.keys(e),event:e.event}))}))),15000);})]);}
  finally{clearTimeout(timer);}
  for(const name of ['campus_cta_clicked','campus_plus_checkout_viewed']){
    const event=events.find(e=>e.event===name);assert.ok(event);
    assert.equal(event.properties.token,key,'Privacy filtering must preserve SDK ingestion authentication');
    assert.equal(event.properties.distinct_id,buyer,'Google buyer identity must match the server');
    assert.equal(event.properties.aiClient,'chatgpt');assert.equal(event.properties.aiClientSource,'handoff_url');
    assert.equal(event.properties.current_plan,'free');assert.equal(event.properties.environment,'production');
  }
  assert.equal(events.find(e=>e.event==='campus_plus_checkout_viewed').properties.amount_cents,500);
  const view=events.find(e=>e.event==='$pageview');assert.ok(view,'Web Analytics needs the standard pageview event');
  assert.equal(view.properties.$current_url,'https://campus.analytics.test/app/turnitin/');
  assert.equal(view.properties.$pathname,'/app/turnitin/');
  assert.equal(view.properties.$host,'campus.analytics.test');
  assert.equal(view.properties.$device_type,'Desktop');
  assert.equal(view.properties.$referrer,'https://www.google.com/');
  assert.equal(view.properties.$referring_domain,'www.google.com');
  await page.evaluate(()=>{
    document.dispatchEvent(new Event('astro:page-load')); // Initial Astro event must not duplicate views.
    history.pushState({},'', '/app/asistente/c/private-conversation/?code=private#private');
    document.dispatchEvent(new Event('astro:page-load'));
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    window.dispatchEvent(new PageTransitionEvent('pagehide')); // Only one leave per view.
  });
  const deadline=Date.now()+10000;
  while(events.filter(e=>e.event==='$pageleave').length<2){
    if(Date.now()>deadline)throw Error('Missing pageleave transport');
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(events.filter(e=>e.event==='$pageview').length,2);
  const leaves=events.filter(e=>e.event==='$pageleave');assert.equal(leaves.length,2);
  assert.equal(leaves[0].properties.$pathname,'/app/turnitin/','Route changes leave the old route');
  assert.equal(leaves[0].properties.page,'turnitin_app');
  assert.equal(leaves[0].properties.$pageview_id,view.properties.$pageview_id);
  assert.equal(leaves[1].properties.$pathname,'/app/asistente/','Conversation IDs never enter analytics');
  assert.ok(leaves.every(e=>Number.isFinite(e.properties.$prev_pageview_duration)&&e.properties.$prev_pageview_duration>=0));
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  while(events.filter(e=>e.event==='$pageview').length<3){
    if(Date.now()>deadline)throw Error('BFCache restore did not start a new view');
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(JSON.stringify(events).includes('private'),false,'No email, receipt, referrer or OAuth URL reaches transport');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  await context.close();
  console.log('Real PostHog SDK transport: project token, Google identity, Plus intent/price and private-field stripping passed; all requests intercepted locally.');
}finally{await browser.close();}
