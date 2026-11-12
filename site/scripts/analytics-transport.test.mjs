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
  window.finishLogin = () => {
    analyticsSession({authenticated:true,analyticsAudience:'customer',plan:'free',analyticsId:'${buyer}',universityConfirmed:true,usage:{remaining:25,limit:25}});
    track('campus_cta_clicked',{intent:'plus',email:'private@example.test',receipt:'private-proof'});
    track('campus_plus_checkout_viewed',{offer:'founder',amount_cents:500});
    const survey={$survey_id:'01a18cc9-dfcf-0000-9228-5fe27651e15d',$survey_iteration:null};
    track('survey shown',survey);
    const answer={...survey,$survey_submission_id:'11111111-1111-4111-8111-111111111111',
      $survey_questions:[{id:'e8c41d6d-d964-46c6-8174-7296eb8e01d2',question:'¿Qué te frena?'}],
      '$survey_response_e8c41d6d-d964-46c6-8174-7296eb8e01d2':'El precio'};
    track('survey sent',{...answer,$survey_completed:false});
    track('survey sent',{...answer,$survey_completed:true});
  };
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
  await context.addCookies([{name:'campus_session',value:'private-cookie',url:'https://campus.analytics.test'}]);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>messages.push(message.text()));
  let resolveReceived;
  const received=new Promise(resolve=>resolveReceived=resolve);
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    requested.push(url.origin+url.pathname);
    if(url.origin==='https://campus.analytics.test' && !url.pathname.startsWith('/c-events/')){
      if(url.pathname==='/analytics-test.js')return route.fulfill({contentType:'text/javascript',body:outputFiles[0].text});
      return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="es"><body style="min-height:4000px"><h1>Campus analytics</h1><button>Interactuar</button><a href="/app/plus/">Plus</a><script type="module" src="/analytics-test.js"></script></body></html>'});
    }
    if(url.origin==='https://campus.analytics.test'){
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
      if(url.pathname==='/c-events/batch/'){
        assert.equal(request.headers().cookie, undefined, 'The proxy request must not carry site cookies');
        const bytes=request.postDataBuffer();assert.ok(bytes);
        let text;
        if(bytes[0]===0x1f&&bytes[1]===0x8b)text=gunzipSync(bytes).toString('utf8');
        else text=bytes.toString('utf8');
        const payload=JSON.parse(text),batch=Array.isArray(payload)?payload:payload.batch??[payload];
        events.push(...batch);
        await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"status":"Ok"}'});
        if(events.some(e=>e.event==='campus_cta_clicked')&&events.some(e=>e.event==='campus_plus_checkout_viewed')&&events.some(e=>e.event==='survey sent'&&e.properties.$survey_completed===true))resolveReceived();
        return;
      }
    }
    unexpected.push(url.origin+url.pathname);await route.abort();
  });
  await page.goto('https://campus.analytics.test/app/turnitin/?source=mcp&ai_client=chatgpt&code=private-oauth&utm_source=viva_engage&utm_medium=social&utm_campaign=grupo_de_la_u&utm_content=mejoralo_upecinos',{
    waitUntil:'domcontentloaded',referer:'https://www.google.com/search?q=private-academic-question',
  });
  await page.waitForFunction(() => typeof window.finishLogin === 'function');
  const authUrl = 'https://campus.analytics.test/api/app/auth/start';
  const entry = (await context.cookies(authUrl)).find(cookie => cookie.name === 'campus_entry');
  assert.ok(entry);
  assert.deepEqual(JSON.parse(decodeURIComponent(entry.value)), {entry_channel:'mcp',entry_source:'chatgpt',entry_landing:'turnitin_app'});
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('campus_entry_first_v1'))).entry,{entry_channel:'mcp',entry_source:'chatgpt',entry_landing:'turnitin_app'});
  assert.ok(!(await context.cookies(page.url())).some(cookie => cookie.name === 'campus_entry'));
  await page.evaluate(() => window.finishLogin());
  assert.ok(!(await context.cookies(authUrl)).some(cookie => cookie.name === 'campus_entry'));
  let timer;
  try{await Promise.race([received,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Real SDK did not deliver the checkout events: '+JSON.stringify({errors,unexpected,requested,messages,shapes:events.map(e=>({keys:Object.keys(e),event:e.event}))}))),15000);})]);}
  finally{clearTimeout(timer);}
  for(const name of ['campus_cta_clicked','campus_plus_checkout_viewed']){
    const event=events.find(e=>e.event===name);assert.ok(event);
    assert.equal(event.properties.token,key,'Privacy filtering must preserve SDK ingestion authentication');
    assert.equal(event.properties.$lib_custom_api_host,'https://campus.analytics.test/c-events');
    assert.equal(event.properties.distinct_id,buyer,'Google buyer identity must match the server');
    assert.equal(event.properties.aiClient,'chatgpt');assert.equal(event.properties.aiClientSource,'handoff_url');
    assert.equal(event.properties.current_plan,'free');assert.equal(event.properties.environment,'production');
  }
  assert.equal(events.find(e=>e.event==='campus_plus_checkout_viewed').properties.amount_cents,500);
  const checkout=events.find(e=>e.event==='campus_plus_checkout_viewed').properties;
  assert.equal(checkout.entry_channel,'mcp');assert.equal(checkout.entry_source,'chatgpt');assert.equal(checkout.entry_landing,'turnitin_app');
  assert.ok(!('entry_channel' in events.find(e=>e.event==='campus_cta_clicked').properties),'Only conversion events carry the entry channel');
  const surveyEvents=events.filter(e=>e.event==='survey sent');
  assert.equal(surveyEvents.length,2);
  assert.equal(surveyEvents[0].properties.$survey_submission_id,surveyEvents[1].properties.$survey_submission_id);
  assert.equal(surveyEvents[1].properties['$survey_response_e8c41d6d-d964-46c6-8174-7296eb8e01d2'],'El precio');
  assert.equal(surveyEvents[1].properties.$set['$survey_responded/01a18cc9-dfcf-0000-9228-5fe27651e15d'],true,'Real SDK must retain the person property which prevents repeated surveys.');
  assert.ok(events.find(e=>e.event==='survey shown').properties.$set.$survey_last_seen_date);
  assert.deepEqual(events.find(e=>e.event==='campus_cta_clicked').properties.$set,{analytics_audience:'customer',is_test:false,is_internal:false});
  const view=events.find(e=>e.event==='$pageview');assert.ok(view,'Web Analytics needs the standard pageview event');
  assert.deepEqual([view.properties.utm_source,view.properties.utm_medium,view.properties.utm_campaign,view.properties.utm_content],
    ['viva_engage','social','grupo_de_la_u','mejoralo_upecinos']);
  assert.equal(view.properties.$current_url,'https://campus.analytics.test/app/turnitin/');
  assert.equal(view.properties.$pathname,'/app/turnitin/');
  assert.equal(view.properties.$host,'campus.analytics.test');
  assert.equal(view.properties.$device_type,'Desktop');
  assert.match(view.properties.$raw_user_agent, /Chrome\/140/);
  assert.equal(view.properties.$referrer,'https://www.google.com/');
  assert.equal(view.properties.$referring_domain,'www.google.com');
  await page.locator('button').click();
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  await page.waitForFunction(() => window.scrollY > 0);
  await page.waitForTimeout(150); // Let the passive scroll listener observe the real geometry.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  const vitalDeadline=Date.now()+10000;
  while(!events.some(e=>e.event==='$web_vitals')){
    if(Date.now()>vitalDeadline)throw Error('Missing real browser Web Vitals');
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  const vital=events.find(e=>e.event==='$web_vitals');
  assert.ok(Number.isFinite(vital.properties.$web_vitals_FCP_value));
  assert.ok(Number.isFinite(vital.properties.$web_vitals_LCP_value));
  assert.equal(vital.properties.$current_url,view.properties.$current_url);
  assert.equal(vital.properties.$pageview_id,view.properties.$pageview_id);
  assert.equal(vital.properties.$session_id,view.properties.$session_id);
  assert.equal(vital.properties.distinct_id,buyer);
  assert.ok(!('utm_source' in vital.properties));
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
  assert.ok(leaves.every(e=>!('utm_content' in e.properties) && !('utm_source' in e.properties)), 'Campaign labels belong to the landing view, not page exits');
  assert.ok(leaves.every(e=>e.properties.$raw_user_agent===view.properties.$raw_user_agent));
  assert.equal(leaves[0].properties.$pathname,'/app/turnitin/','Route changes leave the old route');
  assert.equal(leaves[0].properties.page,'turnitin_app');
  assert.equal(leaves[0].properties.$pageview_id,view.properties.$pageview_id);
  assert.equal(leaves[0].properties.$prev_pageview_id,view.properties.$pageview_id);
  assert.equal(leaves[0].properties.$prev_pageview_max_scroll_percentage,1);
  assert.equal(leaves[0].properties.$prev_pageview_max_content_percentage,1);
  assert.equal(leaves[0].properties.$prev_pageview_last_scroll_percentage,0);
  assert.ok(leaves[0].properties.$prev_pageview_max_scroll>0);
  assert.equal(leaves[1].properties.$pathname,'/app/asistente/','Conversation IDs never enter analytics');
  assert.equal(leaves[1].properties.$prev_pageview_max_scroll_percentage,0,'New routes reset scroll depth');
  assert.ok(leaves.every(e=>Number.isFinite(e.properties.$prev_pageview_duration)&&e.properties.$prev_pageview_duration>=0));
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  while(events.filter(e=>e.event==='$pageview').length<3){
    if(Date.now()>deadline)throw Error('BFCache restore did not start a new view');
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(JSON.stringify(events).includes('private'),false,'No email, receipt, referrer or OAuth URL reaches transport');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);

  await page.goto('https://campus.analytics.test/?utm_source=whatsapp&utm_medium=social&utm_campaign=mismo_prompt&email=private@example.org');
  const whatsappDeadline = Date.now() + 10000;
  let whatsappView;
  while (!(whatsappView = events.find(event => event.event === '$pageview' && event.properties.$pathname === '/'))) {
    if (Date.now() > whatsappDeadline) throw Error('Missing WhatsApp landing pageview');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(whatsappView.properties.utm_source, 'whatsapp');
  assert.equal(whatsappView.properties.utm_medium, 'social');
  assert.equal(whatsappView.properties.utm_campaign, 'mismo_prompt');
  assert.equal(whatsappView.properties.$current_url, 'https://campus.analytics.test/');
  assert.equal(JSON.stringify(whatsappView).includes('private'), false);

  const internalTab = await context.newPage();
  await internalTab.route('**/*', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/analytics-test.js') return route.fulfill({contentType:'text/javascript',body:outputFiles[0].text});
    if (path.startsWith('/c-events/')) return route.fulfill({status:200,contentType:'application/json',body:'{"status":"Ok"}'});
    return route.fulfill({contentType:'text/html',body:'<!doctype html><a href="/api/app/auth/start">Entrar</a><script type="module" src="/analytics-test.js"></script>'});
  });
  // Simulate a cookie set by a different tab, with no landing recorded in this tab.
  await context.addCookies([{...entry,expires:Math.floor(Date.now()/1000)+60}]);
  await internalTab.goto('https://campus.analytics.test/app/',{referer:'https://campus.analytics.test/'});
  await internalTab.waitForFunction(() => typeof window.finishLogin === 'function');
  assert.ok((await context.cookies(authUrl)).some(cookie => cookie.name === 'campus_entry'));
  await internalTab.evaluate(() => {
    window.addEventListener('click',event => event.preventDefault(),{once:true});
    document.querySelector('a').click();
  });
  assert.ok(!(await context.cookies(authUrl)).some(cookie => cookie.name === 'campus_entry'),
    'Login must not inherit another tab’s attribution when this tab has no eligible landing');
  await context.close();
  console.log('Real PostHog SDK transport: project token, Google identity, Plus intent/price and private-field stripping passed; all requests intercepted locally.');
}finally{await browser.close();}
