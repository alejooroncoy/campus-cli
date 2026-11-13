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
const out=process.argv[2];
const day=86400000,iso=ms=>new Date(Date.now()+ms).toISOString();
const order=(over)=>({id:crypto.randomUUID(),accountId:1,kind:'activation',cohort:'standard',status:'active',amountCents:1500,renewalCents:1500,expiresAt:iso(0),createdAt:iso(-3*day),activeUntil:iso(27*day),note:'',paymentMethod:'flow',...over});
const scenarios={
  active:{view:'active',plan:'plus',state:{orders:[order({})],subscription:{cohort:'standard',renewalCents:1500,activeUntil:iso(27*day)},subscriptionState:'active',renewableFrom:iso(20*day),currentPlan:'plus',enabled:true,eligible:true,flowAvailable:true},badge:'Activo',renewHidden:true,rule:/No se renueva solo/},
  expiring:{view:'active',plan:'plus',state:{orders:[order({createdAt:iso(-27*day),activeUntil:iso(3*day)})],subscription:{cohort:'founder',renewalCents:1000,activeUntil:iso(3*day)},subscriptionState:'expiring',renewableFrom:iso(-4*day),currentPlan:'plus',enabled:true,eligible:true,flowAvailable:true},badge:'Vence pronto',renewHidden:false,rule:/Ya puedes renovar/},
  pending:{view:'pending',plan:'plus',state:{orders:[order({kind:'renewal',status:'payment_review',paymentMethod:undefined,createdAt:iso(-1*day),activeUntil:null,amountCents:1000}),order({createdAt:iso(-27*day),activeUntil:iso(3*day)})],subscription:{cohort:'founder',renewalCents:1000,activeUntil:iso(3*day)},subscriptionState:'expiring',renewableFrom:iso(-4*day),currentPlan:'plus',enabled:true,eligible:true,flowAvailable:true},badge:'Vence pronto',rule:/renovación está en revisión/},
  expired:{view:'ready',plan:'free',state:{orders:[order({createdAt:iso(-33*day),activeUntil:iso(-3*day)})],subscription:{cohort:'standard',renewalCents:1500,activeUntil:iso(-3*day)},subscriptionState:'expired',renewableFrom:iso(-10*day),currentPlan:'free',enabled:true,eligible:true,flowAvailable:true},badge:'Plus vencido',renewHidden:true,rule:/volvió a Campus Free/,facts:false,name:'Campus Free'},
  legacyexpired:{view:'ready',plan:'free',state:{orders:[order({createdAt:iso(-33*day),activeUntil:iso(-3*day)})],subscription:{cohort:'standard',renewalCents:1500,activeUntil:iso(-3*day)},currentPlan:'free',enabled:true,eligible:true,flowAvailable:true,legacy:true},badge:'Plus vencido',rule:/volvió a Campus Free/,facts:false},
  never:{view:'ready',plan:'free',state:{orders:[],subscription:null,subscriptionState:'none',renewableFrom:null,currentPlan:'free',enabled:true,eligible:true,flowAvailable:true},panel:false},
  // Captura del 2026-11-12: prueba vencida, un pago observado y un QR sin terminar. Sin aviso de prueba ni tres "Sin…".
  unfinished:{view:'flow',plan:'free',state:{orders:[order({status:'quoted',activeUntil:null,createdAt:iso(-1*day),amountCents:500,renewalCents:1000}),order({status:'rejected',paymentMethod:undefined,activeUntil:null,createdAt:iso(-27*day),amountCents:500,note:'El monto no coincide.'}),order({isTest:true,createdAt:iso(-2*day),activeUntil:iso(-1*day)})],subscription:{cohort:'founder',renewalCents:1000,activeUntil:iso(-1*day),isTest:true},subscriptionState:'expired',renewableFrom:null,currentPlan:'free',enabled:true,eligible:true,flowAvailable:true},panel:false,qa:false,history:/Motivo: El monto no coincide\./},
  qa:{view:'active',plan:'plus',state:{orders:[order({isTest:true})],subscription:{cohort:'founder',renewalCents:1000,activeUntil:iso(0.5*day),isTest:true},subscriptionState:'none',renewableFrom:null,currentPlan:'plus',enabled:true,eligible:true,flowAvailable:true},panel:false},
};
const browser=await chromium.launch({headless:true});
try{
  for(const [name,sc] of Object.entries(scenarios)){
    for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
      const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/api/app/session**',r=>r.fulfill({json:{authenticated:true,email:'estudiante@example.test',plan:sc.plan,aiReady:true,universityConfirmed:true,profesAvailable:true,analyticsId:'campus:fixture'}}));
      await page.route('**/api/app/plus/config',r=>r.fulfill({json:{enabled:true,ordersAvailable:true}}));
      await page.route('**/api/app/plus/state',r=>r.fulfill({json:(()=>{const {legacy,...rest}=sc.state;return {...rest,admin:false,blocked:false,unavailable:false};})()}));
      await page.route('**/api/**',r=>r.request().url().includes('/api/app/plus/')||r.request().url().includes('/api/app/session')?r.fallback():r.fulfill({json:{}}));
      await page.goto(base+'/app/plus/');
      await page.locator('[data-plus-message][data-loading=false]').waitFor({state:'attached',timeout:15000});
      const panel=page.locator('[data-plus-subscription]');
      // With a paid month, the plan card replaces the active panel: one card per state.
      const merged=sc.view==='active'&&sc.panel!==false;
      await page.locator(merged?'[data-plus-subscription]:visible':`[data-plus-view=${sc.view}]:visible`).waitFor({timeout:15000});
      if(merged)assert.equal(await page.locator('[data-plus-view=active]').isVisible(),false,name+' duplicates the plan');
      if(sc.panel===false){assert.equal(await panel.isVisible(),false,name+' must not show the panel');}
      else{
        await panel.waitFor({state:'visible'});
        assert.equal((await page.locator('[data-plus-sub-badge]').textContent()).trim(),sc.badge,name);
        assert.match(await page.locator('[data-plus-sub-rule]').textContent(),sc.rule,name);
        const renew=page.locator('[data-plus-renew]');
        if(sc.view==='active')assert.equal(await renew.isHidden(),sc.renewHidden,name+' renew button');
        const text=await panel.textContent()+(await page.locator('[data-plus-history-panel]').textContent());
        if(sc.facts!==false)assert.match(text,/estudiante@example\.test/,name+' notice');
        else assert.equal(await page.locator('[data-plus-sub-facts]').isVisible(),false,name+' facts');
        assert.ok(((text.match(/cobros? autom/g)??[]).length)<=1,name+' repeats the no-autopay notice');
        if(sc.name)assert.equal((await page.locator('[data-plus-sub-name]').textContent()).trim(),sc.name,name);
        assert.match(await page.locator('[data-plus-history-panel]').textContent(),/Historial de pagos/);
        assert.doesNotMatch(text,/[—–]/,'no dash separators');
      }
      if(sc.history)assert.match(await page.locator('[data-plus-history-panel]').textContent(),sc.history,name+' history');
      if(sc.qa===false)assert.equal(await page.locator('[data-plus-qa]').isVisible(),false,name+' must not show the test notice');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+' '+viewport.width+' overflows');
      assert.deepEqual(errors,[],name);
      if(out)await page.screenshot({path:`${out}/${name}-${viewport.width}.png`,fullPage:true});
      console.log('ok',name,viewport.width);
      await context.close();
    }
  }
}finally{await browser.close();server.close();}
