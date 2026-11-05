import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Real compiled site + OAuth handler/PKCE + local PostgreSQL + real Plus HTTP.
// Only the identity provider and Flow's remote responses are simulated.
const base=process.env.CAMPUS_PLUS_E2E_ORIGIN??'http://127.0.0.1:4363';
assert.equal(new URL(base).hostname,'127.0.0.1');
const flow=process.env.CAMPUS_CAMPAIGN_E2E_FLOW==='true';
const receipt=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2FoAAAAASUVORK5CYII=','base64');
const browser=await chromium.launch({headless:true});
const results=[];
try {
  for (const scenario of [
    {name:'new-email',source:'email',id:'2026110501',fresh:true},
    {name:'oauth-cookie-without-sync',source:'email',id:'2026110505',fresh:true,offline:true},
    {name:'existing-email',source:'email',id:'2026110502'},
    {name:'sync-offline-cookie-fallback',source:'email',id:'2026110503',offline:true},
    {name:'meta-regression',source:'meta',id:'123456789'},
    {name:'invalid-id',source:'email',id:'private@example.test',unattributed:true},
    {name:'opt-out',source:'email',id:'2026110504',optOut:true,unattributed:true},
  ]) {
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    const page=await context.newPage(),errors=[],external=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.setDefaultTimeout(12000);
    await context.request.post(base+'/__fixture/reset');
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if (url.origin!==base) { external.push(url.origin+url.pathname);return route.abort(); }
      if (scenario.offline && url.pathname==='/api/app/campaign') return route.fulfill({status:503,body:''});
      return route.continue();
    });
    if(scenario.optOut)await context.addInitScript(()=>localStorage.setItem('__ph_opt_in_out_phc_campaign_local_fixture','0'));
    if(!scenario.fresh){
      const login=await context.request.get(base+'/api/app/auth/start?return=%2Fapp%2Fplus%2F');
      assert.equal(login.status(),200);
      assert.equal((await context.request.post(base+'/api/app/university',{headers:{origin:base},data:{universityId:1}})).status(),200);
    }
    const query=new URLSearchParams({utm_source:scenario.source,utm_medium:'email',utm_campaign:scenario.id});
    await page.goto(base+'/?'+query);
    await page.waitForFunction(()=>document.querySelector('body') && performance.getEntriesByType('resource').some(e=>e.name.includes('Analytics.astro')));
    if (!scenario.unattributed) await assert.doesNotReject(async()=>{
      await page.waitForFunction(()=>sessionStorage.getItem('campus_campaign_v1')!==null
        || performance.getEntriesByType('resource').some(e=>e.name.endsWith('/api/app/campaign')));
    });
    await page.goto(base+'/app/plus/');
    if(scenario.fresh){
      await page.locator('[data-plus-view=guest]:visible').waitFor();
      await page.getByRole('link',{name:'Crear cuenta o entrar',exact:true}).click();
      await page.waitForURL('**/app/perfil/**');
      await page.locator('[data-app-select-upc]:visible').waitFor().catch(async error=>{console.log('SETUP DEBUG',page.url(),(await page.locator('body').innerText()).slice(-3500),errors,external);throw error;});
      await page.locator('[data-app-select-upc]:visible').click();
      await page.getByRole('button',{name:'Guardar y continuar'}).click();
    }
    await page.locator('[data-plus-view=ready]:visible').waitFor();
    if(!scenario.unattributed&&(!scenario.offline||scenario.fresh)){
      await page.waitForFunction(async()=>{
        const rows=await (await fetch('/__fixture/campaign')).json();return rows.length===1;
      });
      // Switch devices: only the verified login cookie travels. No marketing
      // cookie or storage is needed once the touch has been bound to the account.
      const signed=await context.cookies();
      await context.clearCookies();
      await context.addCookies(signed.filter(cookie=>cookie.name==='campus_matricula'));
      await page.evaluate(()=>sessionStorage.removeItem('campus_campaign_v1'));
      await page.goto(base+'/app/plus/');
      await page.locator('[data-plus-view=ready]:visible').waitFor();
    }
    await page.getByRole('button',{name:'Ver mi precio',exact:true}).click();
    await page.locator(`[data-plus-view=${flow?'flow':'payment'}]:visible`).waitFor();
    const state=await (await context.request.get(base+'/api/app/plus/state')).json();
    const quote=state.orders[0];assert.equal(quote.status,'quoted');
    const expected=scenario.unattributed?undefined:{source:scenario.source,id:scenario.id};
    if(expected){assert.equal(quote.campaign.source,expected.source);assert.equal(quote.campaign.id,expected.id);}
    else assert.equal(quote.campaign,undefined);

    // Later marketing clicks (including the reviewer's own campaign) cannot
    // change the attribution of a quote that already exists.
    const newer={source:'email',id:'2026110599',observedAt:Date.now()+1};
    if(!scenario.optOut)assert.equal((await context.request.post(base+'/api/app/campaign',{
      headers:{origin:base},data:newer})).status(),200);
    if(flow){
      const notify=()=>context.request.post(base+'/api/app/plus/flow/confirm?order='+quote.id,{form:{token:'isolated-qr-token'}});
      assert.equal((await notify()).status(),200);
      assert.equal((await (await context.request.get(base+'/api/app/plus/state')).json()).currentPlan,'free');
      await context.request.post(base+'/__fixture/qr?status=2&amount=4');
      assert.equal((await notify()).status(),409,'A mismatched amount cannot confirm a payment');
      assert.equal((await (await context.request.get(base+'/api/app/plus/state')).json()).currentPlan,'free');
      await page.route('https://api.flow.cl/fixture-checkout?*',async route=>{
        await context.request.post(base+'/__fixture/qr?status=2');
        assert.ok((await Promise.all([notify(),notify()])).every(response=>response.status()===200));
        const returned=await context.request.post(base+'/api/app/plus/flow/return?order='+quote.id,
          {form:{token:'isolated-qr-token'},maxRedirects:0});
        assert.equal(returned.status(),303);
        await route.fulfill({status:303,headers:{location:returned.headers().location}});
      });
      await page.getByRole('link',{name:'Ir a pagar por QR',exact:true}).click();
    } else {
      await page.locator('#plus-receipt').setInputFiles({name:'private-campaign-proof.png',mimeType:'image/png',buffer:receipt});
      await page.locator('[name=consent]').check();
      await page.getByRole('button',{name:'Enviar comprobante',exact:true}).click();
      await page.locator('[data-plus-view=pending]:visible').waitFor();
      const staff=await browser.newContext();
      await staff.addCookies([{name:'plus_fixture_session',value:'9',url:base},
        {name:'campus_campaign',value:encodeURIComponent(JSON.stringify(newer)),url:base}]);
      const approved=await staff.request.post(base+`/api/app/plus/admin/orders/${quote.id}/review`,{
        headers:{origin:base},data:{accepted:true,paymentVerified:true}});
      assert.equal(approved.status(),200);
      await staff.close();
      await page.getByRole('button',{name:'Actualizar estado'}).click();
    }
    await page.locator('[data-plus-view=active]:visible').waitFor();
    const active=await (await context.request.get(base+'/api/app/plus/state')).json();
    assert.deepEqual(active.orders[0].campaign,quote.campaign);
    assert.equal(active.orders[0].status,'active');assert.equal(active.currentPlan,'plus');
    const metrics=await (await context.request.get(base+'/__fixture/metrics')).json();
    if(scenario.fresh){
      const login=metrics.find(e=>e.event==='campus_auth_completed');
      assert.equal(login.properties.campaign_source,expected.source);assert.equal(login.properties.campaign_id,expected.id);
    }
    const confirmations=metrics.filter(e=>e.properties.plus_status==='active'&&e.properties.operation==='plus_payment_review');
    assert.equal(confirmations.length,1,'Repeated Flow callbacks must not duplicate a confirmation');
    const event=confirmations[0];assert.equal(event.distinctId,'campus:plus-fixture-owner-1');
    assert.equal(event.properties.payment_order_id,quote.id);
    assert.equal(event.properties.campaign_source,expected?.source);assert.equal(event.properties.campaign_id,expected?.id);
    assert.equal(event.properties.$session_id,undefined);
    assert.equal(JSON.stringify(metrics).includes('private-campaign-proof'),false);
    assert.equal(JSON.stringify(metrics).includes('private@example.test'),false);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    results.push({scenario:scenario.name,payment:flow?'Flow':'manual',campaign:expected??null,confirmed:true});
    console.log('PASS '+scenario.name+': email link → browser → OAuth/session → database → order → '+(flow?'Flow':'staff')+' confirmation → buyer telemetry');
    await context.close();
  }
  console.log(JSON.stringify({passed:results.length,results},null,2));
} finally { await browser.close(); }
