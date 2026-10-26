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

const id='11111111-1111-4111-8111-111111111111';
const university={id:1,name:'Universidad Peruana de Ciencias Aplicadas',shortName:'UPC'};
async function fixture(width,scenario,run){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
 await context.addInitScript(u=>localStorage.setItem('campus-university-choice-v1',JSON.stringify({version:1,university:u})),university);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const state={authenticated:false,enabled:false,preferenceWrites:[],feedback:[],followups:[],auth:null,failPreference:false,failFeedback:false,failFollowup:false,turn:0};
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  if(!url.pathname.startsWith('/api/app/'))return route.continue();
  const path=url.pathname.replace(/\/$/,'');const json=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  if(path==='/api/app/session')return json({authenticated:state.authenticated,analyticsId:state.authenticated?'campus:fixture-guest-value':undefined,email:state.authenticated?'fixture@example.test':undefined,analyticsAudience:'test',plan:state.authenticated?'free':'anon',aiReady:true,profesAvailable:true,universityConfirmed:true,university,usage:{remaining:5,limit:5,period:'trial'},banner:{connected:false},features:{schedulePlanning:false}});
  if(path==='/api/app/profes/conversations')return json({conversations:[]});
  if(path==='/api/app/profes/message'){
   state.turn++;return route.fulfill({contentType:'application/x-ndjson',headers:{'X-Campus-Trace-Id':`22222222-2222-4222-8222-${String(state.turn).padStart(12,'0')}`},body:JSON.stringify({type:'answer',answer:'Respuesta útil con datos sintéticos de prueba '+state.turn,conversationId:id,title:'Fixture',usage:{remaining:4,limit:5,period:'trial'}})+'\n'});
  }
  if(path==='/api/app/product-feedback'){if(state.failFeedback)return route.fulfill({status:503,contentType:'application/json',body:'{}'});state.feedback.push(route.request().postDataJSON());return json({ok:true});}
  if(path==='/api/app/agent-feedback-followup'){
   if(state.failFollowup)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fallo sintético al guardar.'})});
   const input=route.request().postDataJSON();assert.ok(state.feedback.some(f=>f.traceId===input.traceId&&f.reason==='not_resolved'));
   state.followups.push(input);return json({ok:true,callbackRequested:Boolean(input.whatsappPhone&&input.whatsappConsent)});
  }
  if(path==='/api/app/correction-preferences'){
   if(state.failPreference)return route.fulfill({status:503,contentType:'application/json',body:'{}'});
   if(route.request().method()==='POST'){const body=route.request().postDataJSON();assert.ok(Object.keys(body).every(key=>['enabled','traceId'].includes(key)));if(!state.authenticated)assert.ok(body.traceId);state.preferenceWrites.push(body.enabled);state.enabled=body.enabled;}
   return json({authenticated:state.authenticated,enabled:state.enabled});
  }
  if(path==='/api/app/auth/start'){state.auth=url;return route.fulfill({contentType:'text/html',body:'<h1>Fixture login</h1>'});}
  return json({});
 });
 const ask=async()=>{await page.getByRole('textbox',{name:'Escribe tu pregunta a Campus'}).fill('Consulta sintética '+(state.turn+1));await page.getByRole('button',{name:'Enviar pregunta',exact:true}).click();await page.getByRole('group',{name:'Valorar la respuesta'}).getByRole('button',{name:'Sí',exact:true}).waitFor();};
 try{await run({page,state,ask});assert.deepEqual(errors,[]);console.log(JSON.stringify({width,scenario,result:'passed'}));}finally{await context.close();}
}
try{
 for(const width of [390,1100]){
  await fixture(width,'negative feedback can report without a phone and continue chatting',async({page,state,ask})=>{
   await page.goto(base+'/app/asistente/');await ask();await page.getByRole('button',{name:'Todavía no',exact:true}).click();const card=page.locator('[data-agent-recovery]');await card.waitFor();
   assert.equal(await page.locator('[data-guest-signup-invite]').count(),0);
   await card.getByRole('radio',{name:'No encontró lo que buscaba'}).check();await card.getByRole('textbox',{name:'¿Qué necesitabas? (opcional)'}).fill('Comentario sintético privado');
   const link=card.getByRole('link',{name:'Hablar con soporte por WhatsApp'}),href=new URL(await link.getAttribute('href'));
   assert.equal(href.origin,'https://wa.me');assert.equal(href.pathname,'/51946189585');assert.match(href.searchParams.get('text'),/Referencia: [a-f0-9-]{36}/);assert.ok(!href.href.includes('privado'));
   await card.getByRole('button',{name:'Enviar comentario',exact:true}).click();await card.getByText('Recibimos tu comentario para revisar qué pasó.',{exact:true}).waitFor();
   assert.equal(state.followups.length,1);assert.equal(state.followups[0].failureReason,'not_found');assert.equal(state.followups[0].details,'Comentario sintético privado');assert.equal('whatsappPhone' in state.followups[0],false);
   await card.getByRole('button',{name:'Seguir consultando'}).click();assert.equal(await card.count(),0);await ask();assert.equal(state.turn,2);
  });
  await fixture(width,'negative feedback saves an optional WhatsApp after retry',async({page,state,ask})=>{
   await page.goto(base+'/app/asistente/');await ask();await page.getByRole('button',{name:'Todavía no',exact:true}).click();const card=page.locator('[data-agent-recovery]');await card.waitFor();
   await card.getByRole('radio',{name:'La información era incorrecta'}).check();await card.getByRole('textbox',{name:'Tu WhatsApp para avisarte cuando lo resolvamos (opcional)'}).fill('999 999 999');
   await card.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await mkdir('.test-results/agent-recovery',{recursive:true});await page.screenshot({path:`.test-results/agent-recovery/${width}.png`});
   state.failFollowup=true;await card.getByRole('button',{name:'Guardar número y avisarme',exact:true}).click();await card.getByRole('alert').waitFor();assert.equal(state.followups.length,0);
   assert.equal(await card.getByRole('textbox',{name:'Tu WhatsApp para avisarte cuando lo resolvamos (opcional)'}).inputValue(),'999 999 999');assert.equal(await page.getByRole('textbox',{name:'Escribe tu pregunta a Campus'}).isEnabled(),true);
   assert.ok(await card.getByRole('link',{name:'Hablar con soporte por WhatsApp'}).isVisible());
   state.failFollowup=false;await card.getByRole('button',{name:'Guardar número y avisarme',exact:true}).click();await card.getByText('Guardamos tu WhatsApp para que el equipo pueda avisarte cuando resuelva este problema.',{exact:true}).waitFor();
   assert.equal(state.followups.length,1);assert.equal(state.followups[0].whatsappPhone,'999 999 999');assert.equal(state.followups[0].whatsappConsent,true);assert.equal(state.auth,null);
  });
  await fixture(width,'resolved-only and optional dismissal',async({page,state,ask})=>{
   await page.goto(base+'/app/asistente/');const card=page.locator('[data-guest-signup-invite]');assert.equal(await card.count(),0);
   await ask();assert.equal(await card.count(),0);
   await page.getByRole('group',{name:'Valorar la respuesta'}).getByRole('button',{name:'Todavía no'}).click();await page.getByText('Gracias por contarnos.',{exact:true}).waitFor();assert.equal(await card.count(),0);
   await ask();await page.getByRole('group',{name:'Valorar la respuesta'}).getByRole('button',{name:'Sí',exact:true}).click();await card.waitFor();
   assert.equal(await card.getByRole('checkbox').isChecked(),false);assert.equal(await page.getByRole('textbox',{name:'Escribe tu pregunta a Campus'}).isEnabled(),true);
   await card.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await mkdir('.test-results/guest-signup',{recursive:true});await page.screenshot({path:`.test-results/guest-signup/${width}.png`});
   await card.getByRole('button',{name:'Seguir como invitado'}).click();assert.equal(await card.count(),0);
   // Feedback and signup are sibling components; their keys must stay distinct across turns.
   assert.equal(await page.getByRole('group',{name:'Valorar la respuesta'}).count(),1);
   await ask();await page.getByRole('group',{name:'Valorar la respuesta'}).getByRole('button',{name:'Sí',exact:true}).click();await page.getByText('Gracias por contarnos.',{exact:true}).waitFor();assert.equal(await card.count(),0);assert.equal(state.auth,null);
   assert.equal(await page.getByRole('group',{name:'Valorar la respuesta'}).count(),1);
  });
  await fixture(width,'explicit opt-in and conversation return',async({page,state,ask})=>{
   await page.goto(base+'/app/asistente/');await ask();await page.getByRole('group',{name:'Valorar la respuesta'}).getByRole('button',{name:'Sí',exact:true}).click();const card=page.locator('[data-guest-signup-invite]');await card.waitFor();assert.equal(await page.locator('[data-agent-recovery]').count(),0);await card.getByRole('checkbox').check();
   await card.getByRole('link',{name:'Crear cuenta y guardar mi chat'}).click();await page.getByRole('heading',{name:'Fixture login'}).waitFor();
   assert.deepEqual(state.preferenceWrites,[true]);assert.equal(state.auth.searchParams.get('return'),`/app/asistente/c/${id}/`);
  });
  await fixture(width,'default opt-out and retry after failed save',async({page,state,ask})=>{
   await page.goto(base+'/app/asistente/');await ask();await page.getByRole('group',{name:'Valorar la respuesta'}).getByRole('button',{name:'Sí',exact:true}).click();const card=page.locator('[data-guest-signup-invite]');await card.waitFor();state.failPreference=true;
   await card.getByRole('link',{name:'Crear cuenta y guardar mi chat'}).click();await card.getByRole('alert').waitFor();assert.equal(state.auth,null);state.failPreference=false;
   await card.getByRole('link',{name:'Crear cuenta y guardar mi chat'}).click();await page.getByRole('heading',{name:'Fixture login'}).waitFor();assert.deepEqual(state.preferenceWrites,[false]);
  });
 }
 await fixture(390,'support remains available when the initial negative feedback save fails',async({page,state,ask})=>{
  await page.goto(base+'/app/asistente/');await ask();state.failFeedback=true;await page.getByRole('button',{name:'Todavía no',exact:true}).click();const card=page.locator('[data-agent-recovery]');await card.waitFor();
  await page.getByText('No pudimos guardar tu respuesta. Puedes intentarlo nuevamente.',{exact:true}).waitFor();assert.ok(await card.getByRole('link',{name:'Hablar con soporte por WhatsApp'}).count());
  state.failFeedback=false;await card.getByRole('textbox',{name:'Tu WhatsApp para avisarte cuando lo resolvamos (opcional)'}).fill('+1 415 555 0123');await card.getByRole('button',{name:'Guardar número y avisarme',exact:true}).click();
  await card.getByText('Guardamos tu WhatsApp para que el equipo pueda avisarte cuando resuelva este problema.',{exact:true}).waitFor();assert.equal(state.followups[0].whatsappConsent,true);
 });
 await fixture(390,'profile revocation',async({page,state})=>{
  state.authenticated=true;state.enabled=true;await page.goto(base+'/app/perfil/');const toggle=page.getByRole('checkbox',{name:/Permitir que el equipo/});await toggle.waitFor();assert.equal(await toggle.isChecked(),true);await toggle.uncheck();await page.getByText('Preferencia guardada.',{exact:true}).waitFor();assert.equal(state.enabled,false);assert.deepEqual(state.preferenceWrites,[false]);
 });
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
