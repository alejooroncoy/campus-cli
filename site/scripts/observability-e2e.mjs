import {createServer} from 'node:http';
import {readFile,stat,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=resolve('dist');
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');let path=resolve(root,'.'+url.pathname);
  if(!path.startsWith(root+'/')&&path!==root)throw Error();
  if((await stat(path)).isDirectory())path=resolve(path,'index.html');
  const bytes=await readFile(path);res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[extname(path)]??'application/octet-stream'});res.end(bytes);
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
 const errors=[],feedback=[];page.on('pageerror',e=>errors.push(e.message));
 const trace='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',conversation='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
 const session={authenticated:true,analyticsId:'campus:fixture-owner-123',analyticsAudience:'customer',email:'fixture@example.test',plan:'free',aiReady:true,universityConfirmed:true,profesAvailable:true,university:{id:1,name:'UPC',shortName:'UPC'},usage:{remaining:25,limit:25,period:'trial'},banner:{connected:false},features:{schedulePlanning:false}};
 await page.route('**/api/app/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname.replace(/\/+$/,'');
  const json=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  if(path==='/api/app/session')return json(session);
  if(path==='/api/app/plus/config')return json({enabled:true,ordersAvailable:true});
  if(path==='/api/app/plus/state')return json({orders:[],currentPlan:'free',subscription:null,enabled:true,eligible:true,blocked:false,unavailable:false,admin:false});
  if(path==='/api/app/plus/checkout')return json({order:{id:conversation,accountId:1,kind:'activation',cohort:'standard',status:'quoted',amountCents:1000,renewalCents:1000,expiresAt:new Date(Date.now()+600000).toISOString(),activeUntil:null,note:'',isTest:false},phone:'+51999999999',holder:'Fixture'});
  if(path==='/api/app/product-feedback'){feedback.push(route.request().postDataJSON());return json({ok:true});}
  if(path==='/api/app/profes/conversations')return json({conversations:[]});
  if(path==='/api/app/profes/message')return route.fulfill({status:200,contentType:'application/x-ndjson',headers:{'X-Campus-Trace-Id':trace},body:[{type:'status',activity:'grades'},{type:'answer',answer:'Esta es una respuesta de prueba local.',usage:session.usage,conversationId:conversation,title:'Consulta de prueba'}].map(e=>JSON.stringify(e)).join('\n')+'\n'});
  return json({});
 });
 await page.goto(base+'/app/plus/');
 await page.locator('[data-plus-view=ready]:visible').waitFor();
 assert.equal(await page.locator('[data-plus-survey]').isVisible(),false,'Localhost never loads remote surveys or records responses.');
 await page.getByRole('button',{name:'Ver precio y cómo pagar',exact:true}).click();
 await page.locator('[data-plus-view=payment]:visible').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const metrics=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('campus-analytics-debug')??'[]'));
 assert.ok(metrics.some(e=>e.event==='campus_plus_step_viewed'&&e.properties.plus_step==='ready'));
 assert.ok(metrics.some(e=>e.event==='campus_plus_step_viewed'&&e.properties.plus_step==='payment'));
 assert.ok(metrics.some(e=>e.event==='campus_plus_checkout_started'));
 await mkdir('../output/observability-e2e',{recursive:true});
 await page.screenshot({path:'../output/observability-e2e/plus-mobile.png',fullPage:true});
 await page.goto(base+'/app/asistente/');
 await page.locator('#profes-message').fill('Cuánto necesito para aprobar');
 await page.getByRole('button',{name:'Enviar pregunta',exact:true}).click();
 const group=page.getByRole('group',{name:'Valorar la respuesta'});await group.waitFor();
 await group.getByRole('button',{name:'Todavía no'}).click();
 await group.getByRole('status').filter({hasText:'Gracias'}).waitFor();
 assert.deepEqual(feedback[0],{kind:'agent',reason:'not_resolved',traceId:trace});
 const agentMetrics=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('campus-analytics-debug')??'[]'));
 assert.ok(agentMetrics.some(e=>e.event==='campus_answer_displayed'&&e.properties.trace_id===trace));
 await page.screenshot({path:'../output/observability-e2e/agent-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('Mobile browser: Plus steps, remote-survey isolation on localhost, server trace propagation and owner-scoped response feedback passed. APIs intercepted locally.');
 await context.close();
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

