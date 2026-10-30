import {createServer} from 'node:http';
import {readFile,stat,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=resolve('dist');
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');let path=resolve(root,'.'+url.pathname);
 if(!path.startsWith(root+'/'))throw Error();
 if((await stat(path)).isDirectory())path=resolve(path,'index.html');
 res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[extname(path)]??'application/octet-stream'});res.end(await readFile(path));
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const id='11111111-1111-4111-8111-111111111111',back=`/app/asistente/c/${id}/`;
const request='Diapositivas y exámenes de Cálculo I <img src=x onerror="window.handoffInjected=true">';
const session={authenticated:true,analyticsId:'campus:fixture-owner-123',analyticsAudience:'test',email:'fixture@example.test',plan:'free',aiReady:true,universityConfirmed:true,profesAvailable:true,university:{id:1,name:'UPC',shortName:'UPC'},usage:{remaining:25,limit:25,period:'trial'},banner:{connected:false},features:{schedulePlanning:false}};
try{
 for(const width of [390,1100]){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
  await context.addInitScript(()=>{window.handoffCopies=[];window.handoffCopyFails=false;Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{if(window.handoffCopyFails)throw Error('denied');window.handoffCopies.push(text);}}});});
  const page=await context.newPage();let authorized=true,failRead=false,handoffReads=0;const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==base)return route.abort();
   if(!url.pathname.startsWith('/api/app/'))return route.continue();
   const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   if(url.pathname.replace(/\/$/,'')==='/api/app/session')return json(session);
   if(url.pathname.replace(/\/$/,'')==='/api/app/profes/handoff'){
    handoffReads++;assert.equal(url.searchParams.get('conversationId'),id);
    if(failRead)return route.fulfill({status:503,contentType:'application/json',body:'{}'});
    return json({conversationId:id,request:authorized?request:null});
   }
   return json({});
  });
  try{
   await page.goto(base+'/app/copilot/?return='+encodeURIComponent(back));
   const card=page.locator('[data-materials-handoff]');
   await card.waitFor();assert.equal(await card.locator('textarea').inputValue(),request);
   assert.equal(await page.evaluate(()=>Boolean(window.handoffInjected)),false);
   await card.getByRole('button',{name:'Copiar pedido para mi IA'}).click();
   await card.getByRole('status').filter({hasText:'Pedido copiado'}).waitFor();
   assert.ok((await page.evaluate(()=>window.handoffCopies[0])).includes(request));
   assert.equal(await card.getByRole('link',{name:'Volver a esta conversación'}).getAttribute('href'),back);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await page.evaluate(value=>JSON.stringify({...localStorage,...sessionStorage}).includes(value),request),false);
   await mkdir('.test-results/materials-handoff',{recursive:true});await page.screenshot({path:`.test-results/materials-handoff/${width}.png`,fullPage:true});
   await page.evaluate(()=>{window.handoffCopyFails=true;});
   await card.getByRole('button',{name:'Copiar pedido para mi IA'}).click();await card.getByRole('status').filter({hasText:'No pudimos copiarlo'}).waitFor();
   failRead=true;
   const failedRefresh=page.waitForResponse(response=>response.url().includes('/profes/handoff')&&response.status()===503);
   await page.evaluate(detail=>window.dispatchEvent(new CustomEvent('campus:session-updated',{detail})),session);
   await failedRefresh;
   assert.equal(await card.isVisible(),true);assert.equal(await card.locator('textarea').inputValue(),request);
   await card.getByRole('status').filter({hasText:'No pudimos copiarlo'}).waitFor();
   failRead=false;
   await page.evaluate(()=>{window.handoffCopyFails=false;});
   await card.getByRole('button',{name:'Copiar pedido para mi IA'}).click();await card.getByRole('status').filter({hasText:'Pedido copiado'}).waitFor();
   authorized=false;await page.evaluate(detail=>window.dispatchEvent(new CustomEvent('campus:session-updated',{detail})),{...session,authenticated:false,plan:'anon',analyticsId:undefined});
   await card.waitFor({state:'hidden'});assert.equal(await card.locator('textarea').inputValue(),'');
   const login=page.locator('[data-copilot-account-action]');
   await login.waitFor();
   const loginUrl=new URL(await login.getAttribute('href'),base);
   assert.equal(loginUrl.searchParams.get('return'),'/app/copilot/?return='+encodeURIComponent(back));
   const before=handoffReads;await page.goto(base+'/app/copilot/?return='+encodeURIComponent('https://evil.example/'));
   await page.getByRole('heading',{name:'Tu campus, dentro de tu IA.'}).waitFor();assert.equal(handoffReads,before);
   assert.deepEqual(errors,[]);console.log(JSON.stringify({width,requestPreserved:true,clipboardWorks:true,failedCopyRecoverable:true,privateTextNotStored:true,accountChangeClearsRequest:true,invalidReturnRejected:true}));
  }finally{await context.close();}
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
