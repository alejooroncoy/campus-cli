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
const otherUniversity={id:2,name:'Universidad de prueba',shortName:'PRUEBA'};
const addedUniversities=[{id:40,name:'Universidad Privada del Norte',shortName:null,code:'UPN'},{id:90,name:'Universidad de Palermo',shortName:'UP',code:'UP',country:'Argentina'},{id:25,name:'Universidad del Pacífico',shortName:null,code:'UP',country:'Perú'}];
const samples=[
 ['professor_reviews','¿Qué dicen los estudiantes de Luis Vives?'],
 ['course_professors','¿Qué profesores hay para Cálculo I?'],
 ['grade_workbook','Quiero un Excel para calcular mis promedios.'],
];
async function fixture(width,scenario,run,options={}) {
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
 const page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));
 const state={remaining:5,unavailable:false,fail:false,catalogFail:false,universityWrites:[],...options};
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  if(!url.pathname.startsWith('/api/app/'))return route.continue();
  const path=url.pathname.replace(/\/$/,'');
  const json=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  if(path==='/api/app/session'){
   if(state.unavailable)return route.fulfill({status:503,contentType:'application/json',body:'{}'});
   return json({authenticated:false,analyticsAudience:'test',plan:'anon',aiReady:true,profesAvailable:true,usage:{remaining:state.remaining,limit:5,period:'trial'},banner:{connected:false},features:{schedulePlanning:false},...(state.authenticated?{authenticated:true,email:'fixture@example.test',plan:'free',universityConfirmed:!!state.savedUniversity,university:state.savedUniversity,profesAvailable:!!state.savedUniversity&&state.savedUniversity.id!==null&&state.savedUniversity.id!==2}:{})});
  }
  if(path==='/api/app/universities'){
   if(state.catalogFail)return route.fulfill({status:503,contentType:'application/json',body:'{}'});
   return json({universities:[university,otherUniversity,...addedUniversities]});
  }
  if(path==='/api/app/university'){
   const input=route.request().postDataJSON();state.universityWrites.push(input);
   await new Promise(resolve=>setTimeout(resolve,50));
   if(state.universityFail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'No se pudo guardar la universidad sintética.'})});
   state.savedUniversity=input.universityName?{id:null,name:input.universityName,shortName:null}:[university,otherUniversity,...addedUniversities].find(u=>u.id===input.universityId);
   return json({universityConfirmed:true,university:state.savedUniversity});
  }
  if(path==='/api/app/profes/conversations')return json({conversations:[]});
  if(path==='/api/app/profes/message'){
   requests.push(route.request().postDataJSON());
   // Hold the response long enough to exercise repeated taps during an active turn.
   await new Promise(resolve=>setTimeout(resolve,100));
   if(state.fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fallo sintético',code:'AI_FAILED'})});
   return route.fulfill({contentType:'application/x-ndjson',headers:{'X-Campus-Trace-Id':'22222222-2222-4222-8222-222222222222'},body:JSON.stringify({type:'answer',answer:'Respuesta sintética para comprobar el inicio.',conversationId:'11111111-1111-4111-8111-111111111111',title:'Fixture',usage:{remaining:4,limit:5,period:'trial'}})+'\n'});
  }
  return json({});
 });
 const events=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('campus-analytics-debug')??'[]'));
 const enter=async()=>{
  await page.goto(base+'/app/asistente/');
  await page.getByRole('heading',{name:'¿Dónde estudias?'}).waitFor();
  await page.getByRole('radio',{name:/Universidad Peruana de Ciencias Aplicadas/}).check();
  await page.getByRole('button',{name:'Empezar con Campus',exact:true}).click();
  await page.locator('section.app-profes-ai').waitFor();
 };
 try {await run({page,state,requests,events,enter});assert.deepEqual(errors,[]);console.log(JSON.stringify({width,scenario,result:'passed'}));}
 finally {await context.close();}
}
try {
 for(const choice of addedUniversities.filter(u=>u.code==='UP')){
  await fixture(390,choice.name+' profile rejects ambiguity and saves once after retry',async({page,state})=>{
   await page.goto(base+'/app/perfil/');
   const input=page.getByLabel('Tu universidad',{exact:true});await input.waitFor();
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-app-university-options] option')).some(o=>o.value.includes('Universidad de Palermo')));
   await input.fill('UP');await page.getByRole('button',{name:'Guardar y continuar'}).click();
   await page.locator('[data-app-university-status]').filter({hasText:'UP identifica a dos universidades'}).waitFor();assert.equal(state.universityWrites.length,0);
   await input.fill(choice.name);await page.getByRole('button',{name:'Guardar y continuar'}).click();
   await page.locator('[data-app-university-status]').filter({hasText:'No se pudo guardar la universidad sintética.'}).waitFor();assert.equal(state.universityWrites.length,1);
   state.universityFail=false;
   await page.getByRole('button',{name:'Guardar y continuar'}).click();
   await page.locator('[data-app-university-name]').filter({hasText:choice.name+' · '+choice.country}).waitFor();
   assert.equal(state.universityWrites.length,2);assert.ok(state.universityWrites.every(write=>write.universityId===choice.id));
  },{authenticated:true,universityFail:true});
 }
 for(const width of [390,1100]) {
  for(const choice of addedUniversities)for(const method of ['quick','search']) {
   await fixture(width,choice.name+' opens chat via '+method,async({page,requests,events})=>{
    await page.goto(base+'/app/asistente/');
    const radio=page.getByRole('radio',{name:new RegExp(choice.name)});
    await radio.waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const continueButton=page.getByRole('button',{name:'Empezar con Campus',exact:true});
    assert.equal(await continueButton.isDisabled(),true);
    if(choice.code==='UPN'&&method==='quick'){
      await mkdir('.test-results/first-question',{recursive:true});
      await page.screenshot({path:`.test-results/first-question/selector-${width}.png`,fullPage:true});
    }
    if(method==='search') {
      await page.getByLabel('Busca o elige tu universidad').fill(choice.code);
      if(choice.code==='UP') {
        assert.equal(await page.getByRole('radio').count(),2);
        assert.equal(await continueButton.isDisabled(),true);
        assert.equal(requests.length,0);assert.equal(await page.getByRole('textbox',{name:'Escribe tu pregunta a Campus'}).count(),0);
        if(choice.country==='Argentina')await page.screenshot({path:`.test-results/first-question/up-search-${width}.png`,fullPage:true});
        await page.getByLabel('Busca o elige tu universidad').fill(choice.name);
      }
    }
    await radio.check();
    assert.equal(await page.getByRole('textbox',{name:'Escribe tu pregunta a Campus'}).count(),0,'Selecting a row waits for the same explicit continue action');
    if(choice.country)await radio.locator('..').getByText('UP · '+choice.country,{exact:true}).waitFor();
    await continueButton.click();
    await page.getByRole('group',{name:'Ideas para empezar'}).waitFor();
    if(choice.code==='UP')await page.getByRole('button',{name:new RegExp(choice.name+' · '+choice.country)}).waitFor();
    await page.reload();
    await page.getByRole('group',{name:'Ideas para empezar'}).waitFor();
    await page.getByRole('textbox',{name:'Escribe tu pregunta a Campus'}).fill('Opiniones de profesores');
    await page.getByRole('button',{name:'Enviar pregunta',exact:true}).click();
    await page.getByText('Respuesta sintética para comprobar el inicio.',{exact:true}).waitFor();
    assert.equal(requests.length,1);assert.equal(requests[0].universityId,choice.id);
    assert.ok((await events()).some(e=>e.event==='campus_university_selected'&&e.properties.supported===true));
   });
  }
  for(const [example,prompt] of samples) {
   await fixture(width,'UPC selection opens chat and starts '+example,async({page,requests,events,enter})=>{
    await enter();
    const starters=page.getByRole('group',{name:'Ideas para empezar'});
    await starters.waitFor();assert.equal(await starters.getByRole('button').count(),3);
    assert.equal(await page.getByRole('button',{name:'Continuar',exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(example==='professor_reviews'){
     await mkdir('.test-results/first-question',{recursive:true});
     await page.screenshot({path:`.test-results/first-question/${width}.png`,fullPage:true});
    }
    // Two synchronous clicks must consume only one question.
    await starters.getByRole('button',{name:prompt,exact:true}).evaluate(button=>{button.click();button.click();});
    await page.getByText('Respuesta sintética para comprobar el inicio.',{exact:true}).waitFor();
    assert.equal(requests.length,1);assert.equal(requests[0].message,prompt);assert.equal(requests[0].universityId,1);
    assert.equal(await starters.count(),0);
    const tracked=await events();
    assert.equal(tracked.filter(item=>item.event==='campus_agent_examples_viewed').length,1);
    const started=tracked.filter(item=>item.event==='campus_agent_example_started');
    assert.equal(started.length,1);assert.equal(started[0].properties.example,example);
    assert.equal(tracked.filter(item=>item.event==='campus_question_submitted').length,1);
    assert.ok(tracked.some(item=>item.event==='campus_university_selected'&&item.properties.selection_method==='quick'&&item.properties.supported===true));
    assert.ok(!JSON.stringify(tracked).includes(prompt));
   });
  }
  await fixture(width,'typed questions are preserved and hide examples',async({page,requests,events,enter})=>{
   await enter();const input=page.getByRole('textbox',{name:'Escribe tu pregunta a Campus'});
   await input.fill('Mi consulta propia');assert.equal(await page.getByRole('group',{name:'Ideas para empezar'}).count(),0);
   await page.getByRole('button',{name:'Enviar pregunta',exact:true}).click();
   await page.getByText('Respuesta sintética para comprobar el inicio.',{exact:true}).waitFor();
   assert.equal(requests.length,1);assert.equal(requests[0].message,'Mi consulta propia');
   assert.equal((await events()).filter(item=>item.event==='campus_agent_example_started').length,0);
  });
 }
 for(const width of [390,1100])for(const authenticated of [false,true])for(const custom of [false,true]){
  await fixture(width,`onboarding ${authenticated?'account':'guest'} ${custom?'unlisted':'uncovered catalog'} university keeps the chat available`,async({page,state,requests,events})=>{
   await page.goto(base+'/app/asistente/');
   const input=page.getByLabel('Busca o elige tu universidad');await input.waitFor();
   const name=custom?'Universidad fuera del catálogo':otherUniversity.name;
   await input.fill(name);
   if(custom){
    await page.getByRole('button',{name:'Mi universidad no aparece',exact:true}).click();
    await page.getByLabel('Nombre de tu universidad',{exact:true}).fill(name);
   }else await page.getByRole('radio',{name:new RegExp(name)}).check();
   await page.getByText('Podrás usar el agente para estudiar y preparar tus trabajos.',{exact:false}).waitFor();
   const enter=page.getByRole('button',{name:'Empezar con Campus',exact:true});
   await enter.evaluate(button=>{button.click();button.click();});
   await page.getByRole('group',{name:'Ideas para empezar'}).waitFor();
   assert.equal(state.universityWrites.length,authenticated?1:0);
   await page.reload();await page.getByRole('group',{name:'Ideas para empezar'}).waitFor();
   await page.getByRole('button',{name:'Ayúdame a organizar mi semana de estudio.',exact:true}).click();
   await page.getByText('Respuesta sintética para comprobar el inicio.',{exact:true}).waitFor();
   assert.equal(requests.length,1);
   if(custom){assert.equal(requests[0].universityName,name);assert.ok(!('universityId' in requests[0]));}
   else assert.equal(requests[0].universityId,otherUniversity.id);
   assert.ok((await events()).some(e=>e.event==='campus_agent_example_started'&&e.properties.example==='study_plan'));
   assert.equal((await events()).some(e=>JSON.stringify(e).includes(name)),false,'University declarations stay out of analytics');
  },{authenticated});
 }
 await fixture(390,'an unknown search does not guess a university',async({page,requests})=>{
  await page.goto(base+'/app/asistente/');
  const input=page.getByLabel('Busca o elige tu universidad');await input.waitFor();
  await input.fill('Universidad inexistente');await page.getByText('No encontramos esa universidad',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Empezar con Campus',exact:true}).isDisabled(),true);assert.equal(requests.length,0);
 });
 await fixture(390,'a declared university survives signup without returning to onboarding',async({page,state})=>{
  await page.goto(base+'/app/asistente/');
  await page.getByRole('button',{name:'Mi universidad no aparece',exact:true}).click();
  await page.getByLabel('Nombre de tu universidad',{exact:true}).fill('Universidad declarada de prueba');
  await page.getByRole('button',{name:'Empezar con Campus',exact:true}).click();
  await page.getByRole('group',{name:'Ideas para empezar'}).waitFor();
  state.authenticated=true;
  await page.reload();await page.getByRole('group',{name:'Ideas para empezar'}).waitFor();
  assert.deepEqual(state.universityWrites,[{universityName:'Universidad declarada de prueba'}]);
  assert.equal(state.savedUniversity.id,null);
  assert.ok((await page.locator('.app-university-context').innerText()).includes('Universidad declarada de prueba'));
 });
 await fixture(390,'authenticated onboarding can retry a failed declaration without duplicate saves',async({page,state})=>{
  await page.goto(base+'/app/asistente/');
  await page.getByRole('button',{name:'Mi universidad no aparece',exact:true}).click();
  await page.getByLabel('Nombre de tu universidad',{exact:true}).fill('Universidad declarada de prueba');
  const button=page.getByRole('button',{name:'Empezar con Campus',exact:true});
  await button.evaluate(button=>{button.click();button.click();});
  await page.getByRole('alert').filter({hasText:'No se pudo guardar'}).waitFor();
  assert.equal(state.universityWrites.length,1);
  state.universityFail=false;await button.click();
  await page.getByRole('group',{name:'Ideas para empezar'}).waitFor();assert.equal(state.universityWrites.length,2);
 },{authenticated:true,universityFail:true});
 await fixture(390,'changing university clears the previous chat context',async({page,requests,enter})=>{
  await enter();
  await page.getByRole('button',{name:samples[0][1],exact:true}).click();
  await page.getByText('Respuesta sintética para comprobar el inicio.',{exact:true}).waitFor();
  await page.locator('.app-university-context').click();
  await page.getByRole('radio',{name:/Universidad del Pacífico/}).check();
  await page.getByRole('button',{name:'Empezar con Campus',exact:true}).click();
  await page.getByRole('group',{name:'Ideas para empezar'}).waitFor();
  assert.equal(await page.getByText('Respuesta sintética para comprobar el inicio.',{exact:true}).count(),0);
  await page.getByRole('textbox',{name:'Escribe tu pregunta a Campus'}).fill('Consulta de prueba para otra universidad');
  await page.getByRole('button',{name:'Enviar pregunta',exact:true}).click();
  await page.getByText('Respuesta sintética para comprobar el inicio.',{exact:true}).waitFor();
  assert.equal(requests.length,2);assert.equal(requests[1].universityId,25);assert.ok(!requests[1].conversationId);
 });
 await fixture(390,'failed catalog can retry without assuming a university',async({page,state,requests})=>{
  await page.goto(base+'/app/asistente/');await page.getByRole('button',{name:'Volver a intentar',exact:true}).waitFor();
  assert.equal(await page.getByRole('group',{name:'Ideas para empezar'}).count(),0);assert.equal(requests.length,0);
  state.catalogFail=false;await page.getByRole('button',{name:'Volver a intentar',exact:true}).click();
  await page.getByRole('radio',{name:/Universidad Peruana de Ciencias Aplicadas/}).check();
  await page.getByRole('button',{name:'Empezar con Campus',exact:true}).click();
  await page.getByRole('group',{name:'Ideas para empezar'}).waitFor();
 },{catalogFail:true});
 await fixture(390,'quota prevents sample sends',async({page,requests,enter})=>{
  await enter();await page.getByRole('dialog',{name:'Continúa con tu cuenta Campus.'}).waitFor();
  assert.equal(await page.getByRole('group',{name:'Ideas para empezar'}).count(),0);assert.equal(requests.length,0);
 },{remaining:0});
 await fixture(390,'failed sample remains visible for retry',async({page,state,requests,events,enter})=>{
  await enter();await page.getByRole('button',{name:samples[2][1],exact:true}).click();
  await page.getByRole('button',{name:'Reintentar consulta',exact:true}).waitFor();
  assert.equal(requests.length,1);assert.equal(await page.getByRole('group',{name:'Ideas para empezar'}).count(),0);
  assert.ok(await page.getByText(samples[2][1],{exact:true}).count());
  state.fail=false;await page.getByRole('button',{name:'Reintentar consulta',exact:true}).click();
  await page.getByText('Respuesta sintética para comprobar el inicio.',{exact:true}).waitFor();
  assert.equal(requests.length,2);assert.equal(requests[1].message,samples[2][1]);
  assert.equal((await events()).filter(item=>item.event==='campus_agent_example_started').length,1);
 },{fail:true});
 console.log('First-question activation E2E passed.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
