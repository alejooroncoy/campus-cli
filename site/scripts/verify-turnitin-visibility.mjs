import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { turnitinServiceEnabled } from '../feature-flags.mjs';
const root=fileURLToPath(new URL('../dist', import.meta.url));
const server=createServer(async(req,res)=>{
  try {
    let file=path.join(root,new URL(req.url,'http://localhost').pathname);
    if ((await stat(file)).isDirectory()) file=path.join(file,'index.html');
    const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'}[path.extname(file)] ?? 'application/octet-stream';
    res.writeHead(200,{'content-type':type});res.end(await readFile(file));
  }catch {res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
try {
 for(const authenticated of [false,true]) for(const backendEnabled of [false,true]) {
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let submission;
  await page.route('**/api/app/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   let body={};
   if(pathname.endsWith('/turnitin/config'))body={enabled:backendEnabled,ordersAvailable:true,amountCents:1500,availability:{ai:12,similarity:8,both:5},products:[{id:'ai',label:'Solo IA',amountCents:1000,reports:['ai']},{id:'similarity',label:'Solo similitud',amountCents:1000,reports:['similarity']},{id:'both',label:'Similitud + IA',amountCents:1500,reports:['similarity','ai']}],phone:'fixture',holder:'fixture',maxDocumentBytes:20971520,maxReceiptBytes:5242880};
   else if(pathname.endsWith('/turnitin/orders')&&route.request().method()==='POST'){submission=route.request().postDataJSON();body={order:{id:'22222222-2222-4222-8222-222222222222'}};}
   else if(pathname.endsWith('/session'))body={authenticated,universityConfirmed:true,account:{id:'fixture',email:'fixture@example.test'}};
   else if(pathname.endsWith('/turnitin/orders'))body={orders:[{id:'11111111-1111-4111-8111-111111111111',status:'completed',amountCents:800,documentName:'Fixture preserved.pdf',createdAt:'2026-10-01T12:00:00Z',availableReports:['similarity','ai']}],counts:{all:1,completed:1,payment_review:0,processing:0,payment_rejected:0},nextCursor:null};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(base+'/app/turnitin/');
  await page.waitForFunction(()=>!document.querySelector('[data-ti-status]').textContent.includes('Comprobando disponibilidad'));
  assert.equal(await page.locator('[data-ti-new-order]').isVisible(),turnitinServiceEnabled && backendEnabled);
  if(authenticated){
   await page.getByText('Fixture preserved.pdf',{exact:true}).waitFor({state:'visible'});
   assert.ok(await page.locator('a[href*="/files/ai"]').count());
   if(turnitinServiceEnabled&&backendEnabled){
    await page.locator('[data-ti-new-order] > summary').click();
    for(const [report,price] of [['ai','S/10'],['similarity','S/10'],['both','S/15']]){
     await page.locator(`input[name="report"][value="${report}"]`).check();
     assert.equal(await page.locator('[data-ti-amount]').textContent(),price);
    }
    assert.equal(await page.locator('[data-ti-availability]').textContent(),'Puedes continuar con la revisión que elegiste.');
    assert.equal(await page.locator('[data-ti-option-status][data-state="available"]').count(),3);
    await page.locator('input[name="report"][value="ai"]').check();
    await page.locator('input[name="document"]').setInputFiles({name:'Synthetic.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 local fixture')});
    await page.locator('[data-ti-next]').click();
    assert.equal(await page.locator('[data-ti-product-summary]').textContent(),'Solo IA');
    await page.locator('input[name="receipt"]').setInputFiles({name:'Synthetic-receipt.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 no real payment')});
    await page.locator('input[name="consent"]').check();
    await page.locator('button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-ti-status]').textContent.includes('Pedido recibido')).catch(async error=>{console.error({submission,errors,status:await page.locator('[data-ti-status]').textContent(),submit:await page.locator('[data-ti-submit-status]').textContent(),form:await page.locator('[data-ti-form]').innerText()});throw error;});
    assert.equal(submission.report,'ai');assert.equal(submission.amountCents,1000);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile page does not overflow');
   }
  }else await page.getByRole('link',{name:'Continuar con Google'}).waitFor({state:'visible'});
  assert.deepEqual(errors,[]);
  console.log(`Mobile history (build=${turnitinServiceEnabled}, backend=${backendEnabled}, signedIn=${authenticated}): login/history visible, intake follows both flags, no browser errors.`);
  await context.close();
 }
}finally {await browser.close();await new Promise(r=>server.close(r));}
