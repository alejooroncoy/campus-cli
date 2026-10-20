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
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/app/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   let body={};
   if(pathname.endsWith('/turnitin/config'))body={enabled:backendEnabled,ordersAvailable:true,amountCents:800,phone:'fixture',holder:'fixture',maxDocumentBytes:20971520,maxReceiptBytes:5242880};
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
  }else await page.getByRole('link',{name:'Continuar con Google'}).waitFor({state:'visible'});
  assert.deepEqual(errors,[]);
  console.log(`Mobile history (build=${turnitinServiceEnabled}, backend=${backendEnabled}, signedIn=${authenticated}): login/history visible, intake follows both flags, no browser errors.`);
  await context.close();
 }
}finally {await browser.close();await new Promise(r=>server.close(r));}
