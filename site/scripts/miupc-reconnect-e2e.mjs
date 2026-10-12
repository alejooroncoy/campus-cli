// Run against scripts/miupc-reconnect-e2e-server.ts in campus-profes. Synthetic
// Browserbase navigation is fulfilled locally: never accesses real identity.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.CAMPUS_RECONNECT_E2E_ORIGIN??'http://127.0.0.1:4330';
const path='/app/profes/c/11111111-1111-4111-8111-111111111111/';
const browser=await chromium.launch({headless:true});
async function scenario(mode,blocked=false,mobile=false){
 await fetch(`${base}/__e2e/${mode}`,{method:'POST'});
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1100,height:800}});
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
 await scenario('normal');await scenario('normal',true,true);await scenario('near-deadline',true);
 for(const mode of ['busy','failed','unsafe','expired','restart'])await scenario(mode,true);
 await fetch(`${base}/__e2e/upc`,{method:'POST'});
 const context=await browser.newContext();const page=await context.newPage();
 try{
  await page.goto(base+path);const input=page.getByRole('textbox',{name:'Escribe tu pregunta sobre profesores o tus cursos'});
  await input.fill('Mis notas actuales');await input.press('Enter');
  const notice=page.getByRole('complementary',{name:'Reconexión de Mi UPC'});const link=notice.getByRole('link',{name:'Actualizar acceso UPC'});await link.waitFor();
  assert.equal(await link.getAttribute('href'),'https://profes.campuscli.com/?conectar=banner');assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await notice.getByRole('button').count(),0);
  await input.fill('Borrador de acceso UPC');const state=await(await fetch(`${base}/__e2e/state`)).json();
  await page.reload();await link.waitFor();assert.equal(await input.inputValue(),'Borrador de acceso UPC');assert.equal(page.url(),base+path);
  assert.equal((await(await fetch(`${base}/__e2e/state`)).json()).starts,state.starts);console.log(JSON.stringify({mode:'upc',noUnusableBrowserbaseAction:true,conversationPreserved:true,draftPreserved:true}));
 }finally{await context.close();}
}finally{await browser.close();}
