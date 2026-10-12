// Run against scripts/miupc-reconnect-e2e-server.ts in campus-profes. Synthetic
// Browserbase navigation is fulfilled locally: never accesses real identity.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.CAMPUS_RECONNECT_E2E_ORIGIN??'http://127.0.0.1:4330';
const path='/app/profes/c/11111111-1111-4111-8111-111111111111/';
const browser=await chromium.launch({headless:true});
async function scenario(mode,blocked=false,mobile=false){
 await fetch(`${base}/__e2e/${mode}`,{method:'POST'});
 const context=await browser.newContext({serviceWorkers:'block',viewport:mobile?{width:390,height:844}:{width:1100,height:800}});
 await context.route('https://www.browserbase.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Verificación Microsoft simulada</h1>'}));
 if(blocked)await context.addInitScript(()=>{window.open=()=>null;});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+path);
  const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});
  await input.fill('Mis notas actuales');await input.press('Enter');
  const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});
  await notice.waitFor();await page.getByText('Necesitas volver a verificar tu acceso a Mi UPC.',{exact:true}).last().waitFor();
  await input.fill('Borrador que se conserva');
  await notice.scrollIntoViewIfNeeded();
  assert.equal(await notice.getByRole('button').evaluate(button=>{const r=button.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===button||button.contains(hit);}),true,'The composer must not cover the reconnect action');
  if(process.env.CAMPUS_RECONNECT_SCREENSHOT_DIR){await notice.scrollIntoViewIfNeeded();await page.screenshot({path:`${process.env.CAMPUS_RECONNECT_SCREENSHOT_DIR}/campus-miupc-reconnect-${mobile?'mobile':'desktop'}.png`});}
  const previous=await(await fetch(`${base}/__e2e/state`)).json();
  let popup;
  const busyRead=mode==='busy'?page.waitForResponse(response=>response.url().endsWith('/api/app/miupc/connect/')&&response.request().method()==='GET'):null;
  if(mode==='normal'&&!blocked){const opened=page.waitForEvent('popup');await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();popup=await opened;await popup.waitForURL('https://www.browserbase.com/e2e/verification');assert.equal(await popup.evaluate(()=>window.opener),null);}
  else await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();
  if(['normal','near-deadline'].includes(mode)){
   await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();
   assert.equal(new URL(await notice.getByRole('link').getAttribute('href')).hostname,'www.browserbase.com');
   assert.equal(await notice.getByRole('button').isDisabled(),true);
   await fetch(`${base}/__e2e/saving`,{method:'POST'});await notice.getByText('Guardando tu conexión…',{exact:true}).waitFor();
   await fetch(`${base}/__e2e/connected`,{method:'POST'});await notice.getByText('Conexión restablecida. Ya puedes seguir preguntando en este chat.',{exact:true}).waitFor();
   if(popup&&!popup.isClosed())await popup.waitForEvent('close',{timeout:3000}).catch(()=>{});
   await notice.getByRole('button',{name:'Listo',exact:true}).click();
  }else{
   if(mode==='busy'){await busyRead;await page.evaluate(()=>{const original=Date.now;Date.now=()=>original()+125000;});}
   await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).waitFor({state:'visible'});
   await page.waitForFunction(()=>!document.querySelector('.app-miupc-reconnect button')?.disabled);
   assert.equal(await notice.getByRole('link').count(),0);
   assert.equal(await notice.getByText('Conexión restablecida. Ya puedes seguir preguntando en este chat.',{exact:true}).count(),0);
  }
  assert.equal(page.url(),base+path);assert.equal(await input.inputValue(),'Borrador que se conserva');
  const after=await(await fetch(`${base}/__e2e/state`)).json();
  assert.equal(after.queries,previous.queries);assert.equal(after.messageCount,previous.messageCount);
  const storage=await page.evaluate(()=>JSON.stringify({...sessionStorage,...localStorage}));
  assert.ok(!storage.includes('browserbase.com'));assert.ok(!storage.includes('/verification'));
  if(['normal','near-deadline'].includes(mode)){
   await input.fill('Vuelve a consultar mis notas actuales');await input.press('Enter');
   await page.getByText('Notas actuales recuperadas.',{exact:true}).last().waitFor();
   assert.equal(page.url(),base+path);
  }else if(mode==='failed'){
   await page.reload();await page.getByRole('complementary',{name:'Reconexión de Mi UPC'}).waitFor();
   assert.equal(await input.inputValue(),'Borrador que se conserva');
   assert.equal((await(await fetch(`${base}/__e2e/state`)).json()).starts,after.starts);
   await page.getByRole('button',{name:/^Consulta sin aviso/}).click();await notice.waitFor({state:'hidden'});
   assert.ok(page.url().endsWith('/22222222-2222-4222-8222-222222222222/'));
   await page.locator('#profes-sidebar-actions .app-profes-sidebar-new').click();assert.equal(page.url(),base+'/app/profes/');assert.equal(await notice.count(),0);
   await page.getByRole('button',{name:/^Consulta E2E/}).click();await notice.waitFor();assert.equal(page.url(),base+path);assert.equal(await input.inputValue(),'Borrador que se conserva');
  }
  assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({mode,blocked,mobile,conversationPreserved:true,draftPreserved:true,noQueryChargedForReconnect:true,noLoginUrlInStorage:true}));
 }finally{await context.close();}
}
try{
 if(process.env.CAMPUS_RECONNECT_E2E_CASE==='busy-bound')await scenario('busy',true);
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE){
 await scenario('normal');await scenario('normal',true,true);await scenario('near-deadline',true);
 for(const mode of ['busy','failed','unsafe','expired','restart'])await scenario(mode,true);
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='upc'){
 await fetch(`${base}/__e2e/upc`,{method:'POST'});
 const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();let authorizationRestored=false;
 await page.route('**/api/app/miupc/connect/',route=>route.request().method()==='GET'?route.fulfill({contentType:'application/json',body:JSON.stringify({status:authorizationRestored?'not_connected':'upc_reconnect_required'})}):route.continue());
 try{
  await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});
  await input.fill('Mis notas actuales');await input.press('Enter');
  const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});const link=notice.getByRole('link',{name:'Actualizar acceso UPC'});await link.waitFor();
  assert.equal(await link.getAttribute('href'),'https://profes.campuscli.com/?conectar=banner');assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).count(),0);
  await input.fill('Borrador de acceso UPC');const state=await(await fetch(`${base}/__e2e/state`)).json();
  await page.reload();await link.waitFor();assert.equal(await input.inputValue(),'Borrador de acceso UPC');assert.equal(page.url(),base+path);
  assert.equal((await(await fetch(`${base}/__e2e/state`)).json()).starts,state.starts);await page.evaluate(()=>{sessionStorage.setItem('campus-miupc-reconnect:22222222-2222-4222-8222-222222222222','upc');sessionStorage.setItem('campus-miupc-reconnect:33333333-3333-4333-8333-333333333333','1');});authorizationRestored=true;await notice.getByRole('button',{name:'Ya actualicé mi acceso',exact:true}).click();await notice.getByText('Acceso UPC actualizado',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>[sessionStorage.getItem('campus-miupc-reconnect:22222222-2222-4222-8222-222222222222'),sessionStorage.getItem('campus-miupc-reconnect:33333333-3333-4333-8333-333333333333')]),[null,'1']);
  await notice.getByRole('button',{name:'Listo',exact:true}).click();await notice.waitFor({state:'hidden'});
  await page.reload();await input.waitFor();assert.equal(await notice.count(),0);assert.equal(await input.inputValue(),'Borrador de acceso UPC');
  console.log(JSON.stringify({mode:'upc',noUnusableBrowserbaseAction:true,authorizationNoticeCleared:true,conversationPreserved:true,draftPreserved:true}));
 }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='terminals'){
 for(const terminal of ['expired','failed','upc_reconnect_required']){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});
  const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;});const page=await context.newPage();
  await page.route('**/api/app/miupc/connect/',route=>route.request().method()==='GET'?route.fulfill({contentType:'application/json',body:JSON.stringify({status:terminal})}):route.continue());
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');
   const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.waitFor();await input.fill('Borrador de respuesta terminal');
   await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();
   if(terminal==='upc_reconnect_required')await notice.getByRole('link',{name:'Actualizar acceso UPC'}).waitFor();
   else await notice.getByText(terminal==='expired'?'La ventana de verificación venció. Vuelve a conectar Mi UPC.':'No pudimos completar la conexión. Puedes volver a intentarlo.',{exact:true}).waitFor();
   assert.equal(page.url(),base+path);assert.equal(await input.inputValue(),'Borrador de respuesta terminal');assert.equal(await notice.getByRole('link',{name:'Abrir ventana de verificación'}).count(),0);
   console.log(JSON.stringify({terminal,correctRecoveryGuidance:true,conversationPreserved:true,draftPreserved:true}));
  }finally{await context.close();}
 }
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='active'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;});const page=await context.newPage();
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');
   const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();
   const link=notice.getByRole('link',{name:'Abrir ventana de verificación'});await link.waitFor();const live=await link.getAttribute('href');const state=await(await fetch(`${base}/__e2e/state`)).json();
   const responses=await page.getByText('Necesitas volver a verificar tu acceso a Mi UPC.',{exact:true}).count();
   await input.fill('Otra pregunta sobre mis notas actuales');await input.press('Enter');await page.waitForFunction(count=>Array.from(document.querySelectorAll('.app-profes-ai__text-block')).filter(el=>el.textContent==='Necesitas volver a verificar tu acceso a Mi UPC.').length>count,responses);
   await input.fill('Borrador durante verificación');assert.equal(await link.getAttribute('href'),live);assert.equal(await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).count(),0);
   assert.equal((await(await fetch(`${base}/__e2e/state`)).json()).starts,state.starts);
   await fetch(`${base}/__e2e/connected`,{method:'POST'});await notice.getByText('Conexión restablecida. Ya puedes seguir preguntando en este chat.',{exact:true}).waitFor();
   assert.equal(page.url(),base+path);assert.equal(await input.inputValue(),'Borrador durante verificación');console.log(JSON.stringify({mode:'active',repeatedNoticePreservesAttempt:true,completedOriginalAttempt:true,conversationPreserved:true,draftPreserved:true}));
  }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='resume'){
 for(const reopen of ['reload','switch']){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;});const page=await context.newPage();
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');
   const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();
   await input.fill('Borrador de verificación recuperada');const state=await(await fetch(`${base}/__e2e/state`)).json();
   if(reopen==='reload'){await page.reload();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();await fetch(`${base}/__e2e/connected`,{method:'POST'});}
   else{await page.getByRole('button',{name:/^Consulta sin aviso/}).click();await notice.waitFor({state:'hidden'});await fetch(`${base}/__e2e/connected`,{method:'POST'});await page.getByRole('button',{name:/^Consulta E2E/}).click();}
   await notice.getByText('Conexión restablecida. Ya puedes seguir preguntando en este chat.',{exact:true}).waitFor();
   assert.equal(page.url(),base+path);assert.equal(await input.inputValue(),'Borrador de verificación recuperada');const after=await(await fetch(`${base}/__e2e/state`)).json();assert.equal(after.starts,state.starts);assert.equal(after.queries,state.queries);
   const storage=await page.evaluate(()=>JSON.stringify({...sessionStorage,...localStorage}));assert.ok(!storage.includes('browserbase.com'));assert.ok(!storage.includes('campus-miupc-attempt:'));
   console.log(JSON.stringify({reopen,resumedOriginalAttempt:true,noNewConnectRequest:true,conversationPreserved:true,draftPreserved:true,noLoginUrlInStorage:true}));
  }finally{await context.close();}
 }
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='categories'){
 for(const firstUpc of [false,true]){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();
  await context.addInitScript(firstUpc=>{sessionStorage.setItem('campus-miupc-reconnect:11111111-1111-4111-8111-111111111111',firstUpc?'upc':'1');sessionStorage.setItem('campus-miupc-reconnect:22222222-2222-4222-8222-222222222222',firstUpc?'1':'upc');},firstUpc);
  try{
   await page.goto(base+path);const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});
   const action=upc=>upc?notice.getByRole('link',{name:'Actualizar acceso UPC'}):notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true});
   await action(firstUpc).waitFor();await page.getByRole('button',{name:/^Consulta sin aviso/}).click();await action(!firstUpc).waitFor();assert.equal(await action(firstUpc).count(),0);
   await page.getByRole('button',{name:/^Consulta E2E/}).click();await action(firstUpc).waitFor();assert.equal(await action(!firstUpc).count(),0);
   console.log(JSON.stringify({firstUpc,conversationNoticeCategoryCorrect:true}));
  }finally{await context.close();}
 }
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='access-race'){
  await fetch(`${base}/__e2e/upc`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();
  let release;const paused=new Promise(resolve=>{release=resolve;});let requested;const started=new Promise(resolve=>{requested=resolve;});
  await page.route('**/api/app/miupc/connect/',async route=>{if(route.request().method()!=='GET')return route.continue();requested();await paused;await route.fulfill({contentType:'application/json',body:JSON.stringify({status:'not_connected'})}).catch(()=>{});});
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');
   const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('button',{name:'Ya actualicé mi acceso',exact:true}).click();await started;
   await fetch(`${base}/__e2e/normal`,{method:'POST'});await input.fill('Vuelve a consultar mis notas actuales');await input.press('Enter');await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).waitFor();
   release();await input.fill('Borrador durante comprobación');await page.waitForTimeout(100);assert.equal(await notice.getByText('Acceso UPC actualizado',{exact:true}).count(),0);assert.equal(await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).isEnabled(),true);assert.equal(await input.inputValue(),'Borrador durante comprobación');
   console.log(JSON.stringify({mode:'access-race',latestReconnectNoticePreserved:true,staleAuthorizationIgnored:true,draftPreserved:true}));
  }finally{release();await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='transient'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;});const page=await context.newPage();let failed=false;
  await page.route('**/api/app/miupc/connect/',route=>{if(route.request().method()==='GET'&&!failed){failed=true;return route.fulfill({status:503,body:'temporary'});}return route.continue();});
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});
   await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();const before=await(await fetch(`${base}/__e2e/state`)).json();await input.fill('Borrador durante fallo temporal');
   await notice.getByText('La conexión está tardando. Seguimos comprobando tu verificación…',{exact:true}).waitFor();assert.equal(await notice.getByRole('button').isDisabled(),true);
   await fetch(`${base}/__e2e/connected`,{method:'POST'});await notice.getByText('Conexión restablecida. Ya puedes seguir preguntando en este chat.',{exact:true}).waitFor();assert.equal((await(await fetch(`${base}/__e2e/state`)).json()).starts,before.starts);assert.equal(await input.inputValue(),'Borrador durante fallo temporal');
   console.log(JSON.stringify({mode:'transient',retriedOriginalPoll:true,noNewConnectRequest:true,draftPreserved:true}));
  }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='restore-race'){
  await fetch(`${base}/__e2e/upc`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();const attemptId='44444444-4444-4444-8444-444444444444';const expiresAt=Date.now()+60_000;
  await context.addInitScript(({attemptId,expiresAt})=>{sessionStorage.setItem('campus-miupc-reconnect:11111111-1111-4111-8111-111111111111','1');sessionStorage.setItem('campus-miupc-attempt:11111111-1111-4111-8111-111111111111',JSON.stringify({attemptId,expiresAt}));},{attemptId,expiresAt});
  let release;const paused=new Promise(resolve=>{release=resolve;});let requested;const started=new Promise(resolve=>{requested=resolve;});
  await page.route('**/api/app/miupc/connect/',async route=>{requested();await paused;await route.fulfill({contentType:'application/json',body:JSON.stringify({status:'connected',attemptId,expiresAt})}).catch(()=>{});});
  try{
   await page.goto(base+path);await started;const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('link',{name:'Actualizar acceso UPC'}).waitFor();
   release();await input.fill('Borrador durante recuperación');await page.waitForTimeout(100);assert.equal(await notice.getByRole('link',{name:'Actualizar acceso UPC'}).count(),1);assert.equal(await notice.getByText('Mi UPC está conectado',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>sessionStorage.getItem('campus-miupc-reconnect:11111111-1111-4111-8111-111111111111')),'upc');
   console.log(JSON.stringify({mode:'restore-race',latestAuthorizationNoticePreserved:true,staleRestorationIgnored:true,draftPreserved:true}));
  }finally{release();await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='retry-expiry'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;});const page=await context.newPage();let polls=0;
  await page.route('**/api/app/miupc/connect/',async route=>{if(route.request().method()!=='GET')return route.continue();if(++polls===1)return route.fulfill({status:503,body:'temporary'});const state=await(await fetch(`${base}/__e2e/state`)).json();return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'pending_login',attemptId:state.attemptId,expiresAt:Date.now()-1})});});
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();
   await notice.getByText('La conexión está tardando. Seguimos comprobando tu verificación…',{exact:true}).waitFor();await notice.getByText('La ventana de verificación venció. Vuelve a conectar Mi UPC.',{exact:true}).waitFor();assert.equal(await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).isEnabled(),true);assert.equal(await notice.getByText('La conexión está tardando. Seguimos comprobando tu verificación…',{exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('campus-miupc-attempt:11111111-1111-4111-8111-111111111111')),null);await page.waitForTimeout(3200);assert.equal(polls,2);console.log(JSON.stringify({mode:'retry-expiry',correctExpiryGuidance:true,terminalPollStopped:true,attemptMetadataCleared:true}));
  }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='shared'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;});const page=await context.newPage();
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();await input.fill('Borrador del chat original');const state=await(await fetch(`${base}/__e2e/state`)).json();
   await page.evaluate(()=>sessionStorage.setItem('campus-miupc-reconnect:22222222-2222-4222-8222-222222222222','1'));await page.getByRole('button',{name:/^Consulta sin aviso/}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();await input.fill('Borrador del segundo chat');
   await fetch(`${base}/__e2e/connected`,{method:'POST'});await notice.getByText('Conexión restablecida. Ya puedes seguir preguntando en este chat.',{exact:true}).waitFor();assert.equal((await(await fetch(`${base}/__e2e/state`)).json()).starts,state.starts);assert.equal(await input.inputValue(),'Borrador del segundo chat');await page.getByRole('button',{name:/^Consulta E2E/}).click();await notice.waitFor({state:'hidden'});assert.equal(await input.inputValue(),'Borrador del chat original');assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('campus-miupc-attempt:')).length),0);
   console.log(JSON.stringify({mode:'shared',secondChatResumesSameAttempt:true,noNewConnectRequest:true,bothDraftsPreserved:true,allAttemptMetadataCleared:true}));
  }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='failed-expiry'){
  await fetch(`${base}/__e2e/near-deadline`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;});const page=await context.newPage();let polls=0;
  await page.route('**/api/app/miupc/connect/',route=>{if(route.request().method()!=='GET')return route.continue();polls++;return route.fulfill({status:503,body:'temporary'});});
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByText('La ventana de verificación venció. Vuelve a conectar Mi UPC.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('campus-miupc-attempt:')).length),0);await page.reload();await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).waitFor();assert.equal(polls,1);
   console.log(JSON.stringify({mode:'failed-expiry',expiredAttemptForgotten:true,reloadOffersCleanRetry:true}));
  }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='restore-transient'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;});const page=await context.newPage();let restoring=false,failed=false;
  await page.route('**/api/app/miupc/connect/',route=>{if(restoring&&route.request().method()==='GET'&&!failed){failed=true;return route.fulfill({status:503,body:'temporary'});}return route.continue();});
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();const before=await(await fetch(`${base}/__e2e/state`)).json();await input.fill('Borrador de recuperación temporal');restoring=true;await page.reload();
   await notice.getByRole('button',{name:'Recuperando…',exact:true}).waitFor();assert.equal(await notice.getByRole('button').isDisabled(),true);await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();await fetch(`${base}/__e2e/connected`,{method:'POST'});await notice.getByText('Conexión restablecida. Ya puedes seguir preguntando en este chat.',{exact:true}).waitFor();assert.equal((await(await fetch(`${base}/__e2e/state`)).json()).starts,before.starts);assert.equal(await input.inputValue(),'Borrador de recuperación temporal');console.log(JSON.stringify({mode:'restore-transient',resumedOriginalAttemptAfterFailedGet:true,noNewConnectRequest:true,draftPreserved:true}));
  }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='saving-bound'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;});const page=await context.newPage();let polls=0;
  await page.route('**/api/app/miupc/connect/',route=>{if(route.request().method()==='GET')polls++;return route.continue();});
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();await fetch(`${base}/__e2e/saving`,{method:'POST'});await notice.getByText('Guardando tu conexión…',{exact:true}).waitFor();await page.evaluate(()=>{const original=Date.now;Date.now=()=>original()+125000;});await notice.getByText('La conexión no terminó de guardarse. Vuelve a comprobar Mi UPC.',{exact:true}).waitFor();assert.equal(await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).isEnabled(),true);const ended=polls;await page.waitForTimeout(3200);assert.equal(polls,ended);console.log(JSON.stringify({mode:'saving-bound',successfulSavingPollsBounded:true,noInfinitePolling:true}));
  }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='popup-retry'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();
  await context.addInitScript(()=>{window.__verificationWindows=[];let next=0;window.open=()=>{const id=++next;window.__verificationWindows.push(`open:${id}`);return {closed:false,opener:null,location:{replace(){window.__verificationWindows.push(`navigate:${id}`);}},close(){this.closed=true;window.__verificationWindows.push(`close:${id}`);}}};});
  await page.route('**/api/app/miupc/connect/',route=>route.request().method()==='GET'?route.fulfill({contentType:'application/json',body:JSON.stringify({status:'failed'})}):route.continue());
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByText('No pudimos completar la conexión. Puedes volver a intentarlo.',{exact:true}).waitFor();await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();const events=await page.evaluate(()=>window.__verificationWindows);assert.ok(events.indexOf('close:1')>=0&&events.indexOf('close:1')<events.indexOf('open:2'));console.log(JSON.stringify({mode:'popup-retry',previousWindowClosedBeforeReplacement:true}));
  }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='mismatch'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();let polls=0;
  await context.addInitScript(()=>{window.__staleWindowClosed=false;window.open=()=>({closed:false,opener:null,location:{replace(){}},close(){window.__staleWindowClosed=true;}});});
  await page.route('**/api/app/miupc/connect/',route=>{if(route.request().method()!=='GET')return route.continue();polls++;return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'pending_login',attemptId:'55555555-5555-4555-8555-555555555555',expiresAt:Date.now()+60000})});});
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByText('Se interrumpió la verificación. Vuelve a conectar Mi UPC.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__staleWindowClosed),true);assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('campus-miupc-attempt:')).length),0);await page.reload();await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).waitFor();assert.equal(polls,1);console.log(JSON.stringify({mode:'mismatch',obsoleteAttemptCleared:true,stalePopupClosed:true,reloadOffersCleanRetry:true}));
  }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='lost-start'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;});const page=await context.newPage();let posts=0,failedGet=false;
  await page.route('**/api/app/miupc/connect/',async route=>{if(route.request().method()==='POST'){posts++;await route.fetch();return route.abort('failed');}if(!failedGet){failedGet=true;return route.fulfill({status:503,body:'temporary'});}return route.continue();});
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});const before=await(await fetch(`${base}/__e2e/state`)).json();await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();assert.equal(posts,1);assert.equal((await(await fetch(`${base}/__e2e/state`)).json()).starts,before.starts+1);await input.fill('Borrador tras respuesta perdida');await fetch(`${base}/__e2e/connected`,{method:'POST'});await notice.getByText('Conexión restablecida. Ya puedes seguir preguntando en este chat.',{exact:true}).waitFor();assert.equal(await input.inputValue(),'Borrador tras respuesta perdida');assert.equal(page.url(),base+path);assert.equal(posts,1);console.log(JSON.stringify({mode:'lost-start',existingAttemptRecoveredAfterLostPost:true,noDuplicatePost:true,draftPreserved:true}));
  }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='lost-start-stale'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;});const page=await context.newPage();
  await page.route('**/api/app/miupc/connect/',route=>route.request().method()==='POST'?route.abort('failed'):route.fulfill({contentType:'application/json',body:JSON.stringify({status:'connected',attemptId:'66666666-6666-4666-8666-666666666666',expiresAt:Date.now()+60000})}));
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await input.fill('Borrador frente a estado anterior');await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByText('No pudimos confirmar esta nueva verificación. Vuelve a consultar tus notas o reconecta Mi UPC.',{exact:true}).waitFor();assert.equal(await notice.getByText('Mi UPC está conectado',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>sessionStorage.getItem('campus-miupc-reconnect:11111111-1111-4111-8111-111111111111')),'1');assert.equal(await input.inputValue(),'Borrador frente a estado anterior');console.log(JSON.stringify({mode:'lost-start-stale',uncorrelatedConnectedRejected:true,noticeAndDraftPreserved:true}));
  }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='upc-supersedes'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();
  await context.addInitScript(()=>{window.__staleWindowClosed=false;window.open=()=>({closed:false,opener:null,location:{replace(){}},close(){window.__staleWindowClosed=true;}});});
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();await page.evaluate(()=>sessionStorage.setItem('campus-miupc-attempt:22222222-2222-4222-8222-222222222222',sessionStorage.getItem('campus-miupc-attempt:11111111-1111-4111-8111-111111111111')));
   await fetch(`${base}/__e2e/upc`,{method:'POST'});await input.fill('Vuelve a consultar mis notas actuales');await input.press('Enter');await notice.getByRole('link',{name:'Actualizar acceso UPC'}).waitFor();assert.equal(await page.evaluate(()=>window.__staleWindowClosed),true);assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('campus-miupc-attempt:')).length),0);assert.equal(await notice.getByRole('link',{name:'Abrir ventana de verificación'}).count(),0);console.log(JSON.stringify({mode:'upc-supersedes',previousAttemptForgotten:true,stalePopupClosed:true,correctAuthorizationAction:true}));
  }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='superseded-start'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;});const page=await context.newPage();let active,posts=0,authorized=false,stage='pending_login';let release;const paused=new Promise(resolve=>{release=resolve;});let ready;const created=new Promise(resolve=>{ready=resolve;});
  await page.route('**/api/app/miupc/connect/',async route=>{if(route.request().method()==='POST'){posts++;const response=await route.fetch();active=await response.json();ready();await paused;return route.fulfill({response}).catch(()=>{});}return route.fulfill({contentType:'application/json',body:JSON.stringify(authorized?{...active,status:stage,...(stage==='connected'?{loginUrl:undefined}:{})}:{status:'upc_reconnect_required'})});});
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await created;
   await fetch(`${base}/__e2e/upc`,{method:'POST'});await input.fill('Vuelve a consultar mis notas actuales');await input.press('Enter');await notice.getByRole('link',{name:'Actualizar acceso UPC'}).waitFor();release();authorized=true;await notice.getByRole('button',{name:'Ya actualicé mi acceso',exact:true}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();await input.fill('Borrador tras renovar UPC');stage='connected';await notice.getByText('Conexión restablecida. Ya puedes seguir preguntando en este chat.',{exact:true}).waitFor();assert.equal(posts,1);assert.equal(await input.inputValue(),'Borrador tras renovar UPC');console.log(JSON.stringify({mode:'superseded-start',originalUntrackedAttemptRecoveredAfterAuthorization:true,noSecondPost:true,draftPreserved:true}));
  }finally{release();await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='busy-recovery'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;});const page=await context.newPage();let posts=0,reads=0,stage='pending_login';const attemptId='77777777-7777-4777-8777-777777777777';
  await page.route('**/api/app/miupc/connect/',route=>{if(route.request().method()==='POST'){posts++;return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'busy'})});}reads++;return route.fulfill({contentType:'application/json',body:JSON.stringify(reads===1?{status:'connected',attemptId:'88888888-8888-4888-8888-888888888888',expiresAt:Date.now()+60000}:{status:stage,attemptId,expiresAt:Date.now()+60000,...(stage==='pending_login'?{loginUrl:'https://www.browserbase.com/e2e/verification'}:{})})});});
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();stage='connected';await notice.getByText('Conexión restablecida. Ya puedes seguir preguntando en este chat.',{exact:true}).waitFor();assert.equal(posts,1);console.log(JSON.stringify({mode:'busy-recovery',externalAttemptDiscovered:true,noSecondPost:true,staleConnectedNotAccepted:true}));
  }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='denied-storage'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;Object.defineProperty(window,'sessionStorage',{get(){throw new Error('Storage denied');}});});const page=await context.newPage();
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.waitFor();await input.fill('Borrador sin almacenamiento de sesión');await page.getByRole('button',{name:/^Consulta sin aviso/}).click();await notice.waitFor({state:'hidden'});await page.getByRole('button',{name:/^Consulta E2E/}).click();await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).waitFor();await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();const before=await(await fetch(`${base}/__e2e/state`)).json();await page.getByRole('button',{name:/^Consulta sin aviso/}).click();await page.getByRole('button',{name:/^Consulta E2E/}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();await fetch(`${base}/__e2e/connected`,{method:'POST'});await notice.getByText('Conexión restablecida. Ya puedes seguir preguntando en este chat.',{exact:true}).waitFor();assert.equal((await(await fetch(`${base}/__e2e/state`)).json()).starts,before.starts);assert.equal(await input.inputValue(),'Borrador sin almacenamiento de sesión');console.log(JSON.stringify({mode:'denied-storage',noticeAndAttemptRetainedInMemory:true,noDuplicateStart:true,draftPreserved:true}));
  }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='upc-marked-switch'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;});const page=await context.newPage();
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();const before=await(await fetch(`${base}/__e2e/state`)).json();await input.fill('Borrador de verificación activa');await page.evaluate(()=>sessionStorage.setItem('campus-miupc-reconnect:22222222-2222-4222-8222-222222222222','upc'));await page.getByRole('button',{name:/^Consulta sin aviso/}).click();await notice.getByRole('link',{name:'Actualizar acceso UPC'}).waitFor();assert.ok(await page.evaluate(()=>sessionStorage.getItem('campus-miupc-attempt:11111111-1111-4111-8111-111111111111')));await page.getByRole('button',{name:/^Consulta E2E/}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();await fetch(`${base}/__e2e/connected`,{method:'POST'});await notice.getByText('Conexión restablecida. Ya puedes seguir preguntando en este chat.',{exact:true}).waitFor();assert.equal((await(await fetch(`${base}/__e2e/state`)).json()).starts,before.starts);assert.equal(await input.inputValue(),'Borrador de verificación activa');console.log(JSON.stringify({mode:'upc-marked-switch',otherConversationAttemptPreserved:true,resumedOriginalAttempt:true,noSecondPost:true,draftPreserved:true}));
  }finally{await context.close();}
 }
 if(!process.env.CAMPUS_RECONNECT_E2E_CASE||process.env.CAMPUS_RECONNECT_E2E_CASE==='pre-attempt'){
  await fetch(`${base}/__e2e/normal`,{method:'POST'});const context=await browser.newContext({serviceWorkers:'block'});await context.addInitScript(()=>{window.open=()=>null;});const page=await context.newPage();let posts=0,reads=0;
  await page.route('**/api/app/miupc/connect/',async route=>{if(route.request().method()==='POST'){posts++;await route.fetch();return route.abort('failed');}if(++reads===1)return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'not_connected'})});return route.continue();});
  try{
   await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});await input.fill('Mis notas actuales');await input.press('Enter');const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});await notice.getByRole('button',{name:'Reconectar Mi UPC',exact:true}).click();await notice.getByRole('link',{name:'Abrir ventana de verificación'}).waitFor();await fetch(`${base}/__e2e/connected`,{method:'POST'});await notice.getByText('Conexión restablecida. Ya puedes seguir preguntando en este chat.',{exact:true}).waitFor();assert.equal(posts,1);console.log(JSON.stringify({mode:'pre-attempt',waitedForServerSideCreation:true,noSecondPost:true}));
  }finally{await context.close();}
 }
}finally{await browser.close();}
