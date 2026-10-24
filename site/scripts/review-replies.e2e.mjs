import {chromium,webkit,devices} from 'playwright';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {verifyNoReviewFixtures} from './verify-no-review-fixtures.mjs';

const fixturePath=fileURLToPath(new URL('./fixtures/professor-conversations.json',import.meta.url));
const fixture=JSON.parse(await readFile(fixturePath,'utf8'));
const resultsRoot=fileURLToPath(new URL('../.test-results/review-replies/',import.meta.url));
const browserTypes={chromium,webkit};
const args=process.argv.slice(2);
assert.ok(args.length<=1&&(!args.length||/^--browser=(chromium|webkit)$/.test(args[0])),
 'Usage: node scripts/review-replies.e2e.mjs [--browser=chromium|webkit]');
const selected=args.length?[args[0].slice('--browser='.length)]:Object.keys(browserTypes);
await rm(resultsRoot,{recursive:true,force:true});

async function run(browserName){
 const out=join(resultsRoot,browserName);
 const report={browser:browserName,device:browserName==='webkit'?'iPhone 13':'mobile Chromium',layout:[],errors:[],unexpectedRequests:[],checks:[]};
 let preview,browser,page,serverLog='';
 await mkdir(out,{recursive:true});
 const check=name=>report.checks.push(name);
 const visible=async(locator,wanted=true)=>{await locator.waitFor({state:wanted?'visible':'hidden'});};
 async function count(locator,wanted){
  const deadline=Date.now()+10000;
  while(await locator.count()!==wanted&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(await locator.count(),wanted);
 }
 async function reload(){await page.reload({waitUntil:'networkidle'});}
 async function startPreview(){
  // Only browser/runtime environment, never database credentials or production API overrides.
  const env=Object.fromEntries(['PATH','HOME','TMPDIR','SYSTEMROOT'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
  preview=spawn(process.execPath,[fileURLToPath(new URL('./preview-professor-conversations.mjs',import.meta.url))],{
   env:{...env,PORT:'0',PROFESSOR_PREVIEW_FIXTURE:fixturePath},stdio:['ignore','pipe','pipe'],
  });
  preview.stderr.on('data',data=>{serverLog+=data;});
  return new Promise((resolve,reject)=>{
   let output='';const timer=setTimeout(()=>reject(Error('Preview startup timed out: '+serverLog)),15000);
   preview.once('error',error=>{clearTimeout(timer);reject(error);});
   preview.once('exit',code=>{clearTimeout(timer);reject(Error(`Preview exited (${code}): ${serverLog}`));});
   preview.stdout.on('data',chunk=>{
    output+=chunk;const url=output.match(/http:\/\/127\.0\.0\.1:\d+\/profes\/upc\/[a-z-]+\//)?.[0];
    if(url){clearTimeout(timer);resolve(url);}
   });
  });
 }

 try{
  report.buildIsolation=await verifyNoReviewFixtures();
  // Prove the guard rejects a leak, including an imported comment without its sentinel.
  const leakDir=await mkdtemp(join(tmpdir(),'campus-fixture-leak-'));
  try{
   await writeFile(join(leakDir,'page.html'),fixture.profile.externalRatings[0].comments[0].text);
   await assert.rejects(verifyNoReviewFixtures([leakDir]),/Synthetic review data in build/);
  }finally{await rm(leakDir,{recursive:true,force:true});}
  check('synthetic data excluded from production build');
  const url=await startPreview(),origin=new URL(url).origin;
  browser=await browserTypes[browserName].launch({headless:true});
  const context=await browser.newContext({
   ...(browserName==='webkit'?devices['iPhone 13']:{}),
   viewport:{width:375,height:900},isMobile:true,hasTouch:true,serviceWorkers:'block',
  });
  report.browserVersion=browser.version();
  context.setDefaultTimeout(10000);
  // The event observer also covers requests handled by later test-specific routes.
  context.on('request',request=>{
   const target=new URL(request.url());
   if(target.origin!==origin||(!['GET','HEAD'].includes(request.method())&&!/^\/api\/app\/profes\/reviews\/\d+\/replies\/$/.test(target.pathname)))
    report.unexpectedRequests.push(`${request.method()} ${request.url()}`);
  });
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  const response=await page.goto(url,{waitUntil:'networkidle'});
  assert.equal(response.status(),200);assert.equal(response.headers()['x-robots-tag'],'noindex');
  report.emulation=await page.evaluate(()=>({userAgent:navigator.userAgent,touchPoints:navigator.maxTouchPoints,coarsePointer:matchMedia('(pointer: coarse)').matches,deviceScaleFactor:devicePixelRatio}));
  assert.ok(report.emulation.coarsePointer,'Mobile touch emulation is required');
  if(browserName==='webkit'){assert.match(report.emulation.userAgent,/iPhone/);assert.equal(report.emulation.deviceScaleFactor,devices['iPhone 13'].deviceScaleFactor);}
  await visible(page.getByText(/PRUEBA LOCAL · Todos los comentarios/));
  await visible(page.getByRole('heading',{name:'Docente de prueba',exact:true}));
  const native=page.locator('#review-9001'),nativeThread=native.locator('[data-review-thread]');
  // WebKit can report navigator.maxTouchPoints=0 despite touch emulation.
  // Verify an actual touch event rather than trusting that platform property.
  await page.evaluate(()=>{
   window.__reviewTouchPoints=0;
   document.addEventListener('touchstart',event=>{window.__reviewTouchPoints=event.touches.length;},{once:true});
  });
  await nativeThread.locator(':scope > summary').tap();
  report.emulation.observedTouchPoints=await page.evaluate(()=>window.__reviewTouchPoints);
  assert.ok(report.emulation.observedTouchPoints>0,'The thread must open through a real touch event');
  await count(native.locator('.prof-public__reply'),2);
  await visible(native.getByLabel('Tu respuesta',{exact:true}));
  const originalSummary=await page.locator('.prof-public__profile-header .prof-public__summary').innerText();
  const imported=page.locator('#profematch-9000-review-9001');
  assert.equal(await page.locator('#resenas').count(),1);assert.equal(await imported.count(),1);
  await visible(imported); // Imported comments are present in the first profile response.
  await reload();await visible(imported); // Deep links keep the comment in the unified feed.
  await nativeThread.locator(':scope > summary').tap();await count(native.locator('.prof-public__reply'),2);
  assert.equal(await page.locator('#resenas-catalogo, #puntuaciones').count(),0);
  const root=imported.locator(':scope > .prof-public__thread');
  const first=root.locator(':scope > .prof-public__thread-content > div').nth(0);
  const sibling=root.locator(':scope > .prof-public__thread-content > div').nth(1);
  const child=first.locator(':scope > .prof-public__thread');
  const grandchild=child.locator(':scope > .prof-public__thread-content > div > .prof-public__thread');
  await visible(first.locator(':scope > .prof-public__reply'),false);
  await root.locator(':scope > summary').tap();
  await visible(first.locator(':scope > .prof-public__reply'));
  await visible(sibling.locator(':scope > .prof-public__reply'));
  await visible(imported.getByText(/SUBCOMENTARIO DE PRUEBA: ¿también/),false);
  await child.locator(':scope > summary').tap();
  await visible(imported.getByText(/SUBCOMENTARIO DE PRUEBA: ¿también/));
  await visible(imported.getByText(/SEGUNDO SUBNIVEL DE PRUEBA/),false);
  await grandchild.locator(':scope > summary').tap();
  await visible(imported.getByText(/SEGUNDO SUBNIVEL DE PRUEBA/));
  // Closing one branch must not close or move its sibling.
  await child.locator(':scope > summary').tap();
  await visible(imported.getByText(/SEGUNDO SUBNIVEL DE PRUEBA/),false);
  await visible(sibling.locator(':scope > .prof-public__reply'));
  await child.locator(':scope > summary').tap();
  await visible(imported.getByText(/SEGUNDO SUBNIVEL DE PRUEBA/));
  await sibling.locator(':scope > .prof-public__thread > summary').tap();
  await root.locator(':scope > summary').tap();
  await visible(imported.getByText(/SEGUNDO SUBNIVEL DE PRUEBA/),false);
  await root.locator(':scope > summary').tap();
  await visible(imported.getByText(/SEGUNDO SUBNIVEL DE PRUEBA/));
  await visible(imported.getByText('SUBCOMENTARIO DE PRUEBA: gracias, ahora entiendo el orden de estudio.',{exact:true}));
  check('independent nested branches, two sublevels and collapse/reopen');

  // Use the complete rendered profile, including the real compiled CSS and scripts.
  for(const width of [320,375,430]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(()=>document.fonts.ready);
   const layout=await page.evaluate(()=>{
    const elements=[...document.querySelectorAll('.prof-public__comment,.prof-public__reply p,.prof-public__thread > summary,.prof-public__reply-form textarea')].filter(el=>el.getClientRects().length);
    return {width:innerWidth,scroll:document.documentElement.scrollWidth,content:elements.map(el=>{
     const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
     return {tag:el.tagName,text:el.textContent.slice(0,55),left:rect.left,right:rect.right,width:rect.width,fontSize:parseFloat(style.fontSize),scroll:el.scrollWidth,client:el.clientWidth};
    })};
   });
   assert.equal(layout.scroll,width,JSON.stringify(layout));
   for(const item of layout.content){
    assert.ok(item.left>=-1&&item.right<=width+1,JSON.stringify(item));
    assert.ok(item.fontSize>=12,JSON.stringify(item));
    if(item.tag!=='SUMMARY'){
     assert.ok(item.width>=100,JSON.stringify(item));
     assert.ok(item.scroll<=item.client+1,JSON.stringify(item));
    }
   }
   const styles=await page.evaluate(()=>{
    const signature=selector=>[...document.querySelectorAll(selector)].map(el=>{
     const style=getComputedStyle(el);return [style.fontFamily,style.fontSize,style.lineHeight,style.fontWeight];
    });
    return {comments:signature('.prof-public__comment'),ratings:signature('.prof-public__review-rating'),replies:signature('.prof-public__reply p'),authors:signature('.prof-public__reply-meta strong')};
   });
   for(const [group,signatures] of Object.entries(styles)){
    assert.ok(signatures.length>=3,`Missing source coverage: ${group}`);
    signatures.forEach(signature=>assert.deepEqual(signature,signatures[0],`Shared ${group} typography changed`));
   }
   report.layout.push(layout);
   await page.screenshot({path:join(out,`mobile-${width}.png`),fullPage:true,scale:'css'});
   await imported.screenshot({path:join(out,`nested-${width}.png`),scale:'css'});
  }
  check('320/375/430 px: readable content, no overflow and shared source typography');
  await page.setViewportSize({width:375,height:900});
  const draft='RESPUESTA FICTICIA NUEVA: ¿los ejercicios incluyen resultados esperados?';
  await native.getByLabel('Tu respuesta',{exact:true}).fill(draft);
  await reload();await nativeThread.locator(':scope > summary').tap();
  const textarea=native.getByLabel('Tu respuesta',{exact:true});await visible(textarea);
  assert.equal(await textarea.inputValue(),draft);
  await native.getByRole('button',{name:'Publicar respuesta',exact:true}).tap();
  await visible(native.getByText('Respuesta de prueba guardada solo en memoria.',{exact:true}));
  await count(native.locator('.prof-public__reply'),3);
  assert.equal(await textarea.inputValue(),'');
  assert.equal(await page.locator('.prof-public__profile-header .prof-public__summary').innerText(),originalSummary);
  await reload();await nativeThread.locator(':scope > summary').tap();
  await count(native.locator('.prof-public__reply'),3);await visible(native.getByText(draft,{exact:true}));
  await visible(textarea);assert.equal(await textarea.inputValue(),'');
  await textarea.fill('Mi correo es test@example.com');
  await native.getByRole('button',{name:'Publicar respuesta',exact:true}).tap();
  await visible(native.getByText('Quita correos y teléfonos antes de publicar.',{exact:true}));
  assert.equal(await textarea.inputValue(),'Mi correo es test@example.com');
  assert.equal(await native.locator('.prof-public__reply').count(),3);
  check('memory-only submission, unchanged review rating, reload, draft recovery and privacy error');

  await page.route('**/api/app/session/',route=>route.fulfill({json:{authenticated:false}}));
  await reload();await nativeThread.locator(':scope > summary').tap();
  const login=native.getByRole('link',{name:'Entrar para responder',exact:true});await visible(login);
  assert.equal(new URL(await login.getAttribute('href'),origin).searchParams.get('return'),'/profes/upc/docente-de-prueba/#review-9001');
  await count(native.locator('.prof-public__reply'),3);
  assert.equal(await textarea.count(),0);
  const olderReview={id:8999,professorId:9000,professorSlug:'docente-de-prueba',professor:'Docente de prueba',text:'RESEÑA ANTERIOR FICTICIA',rating:4,createdAt:'2026-01-01T12:00:00Z',course:null};
  await page.route('**/api/app/profes/community/**',route=>route.fulfill({json:{reviews:[olderReview],nextCursor:null}}));
  await page.goto(url+'#review-8999',{waitUntil:'networkidle'});
  await visible(page.locator('#review-8999 [data-review-thread][open]'));
  await visible(page.locator('#review-8999').getByText(olderReview.text,{exact:true}));
  await visible(page.locator('#review-8999').getByRole('link',{name:'Entrar para responder',exact:true}));
  await page.unroute('**/api/app/profes/community/**');
  check('guest reading and login return to the exact older review');
  await page.goto(url,{waitUntil:'networkidle'});
  await page.route('**/replies/',route=>route.fulfill({status:503,json:{error:'No pudimos cargar las respuestas.'}}));
  await nativeThread.locator(':scope > summary').tap();
  const retry=native.getByRole('button',{name:'Volver a cargar',exact:true});await visible(retry);
  await visible(native.getByText('Todavía no hay respuestas. Puedes iniciar la conversación.',{exact:true}),false);
  await page.unroute('**/replies/');await retry.tap();
  await count(native.locator('.prof-public__reply'),3);await visible(retry,false);
  check('failed load retries successfully without a false empty state');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpectedRequests,[]);
  assert.equal(serverLog,'','Fixture server attempted an outbound request or logged an error');
  report.passed=true;
  console.log(JSON.stringify({browser:browserName,passed:true,checks:report.checks,output:out}));
 }catch(error){
  report.passed=false;report.failure=error.stack??String(error);
  if(page)await page.screenshot({path:join(out,'failure.png'),fullPage:true,scale:'css'}).catch(()=>{});
  throw error;
 }finally{
  await browser?.close();
  if(preview?.pid&&preview.exitCode===null&&preview.signalCode===null){
   await new Promise(resolve=>{
    const timer=setTimeout(()=>{preview.kill('SIGKILL');},2000);
    preview.once('exit',()=>{clearTimeout(timer);resolve();});preview.kill();
   });
  }
  report.serverLog=serverLog;
  await writeFile(join(out,'checks.json'),JSON.stringify(report,null,2));
 }
}

// A failure in one engine must not skip the other engine's coverage or report.
const failures=[];
for(const browserName of selected){
 try{await run(browserName);}
 catch(error){failures.push(error);console.error(`${browserName}: ${error.stack??error}`);}
}
if(failures.length)throw new AggregateError(failures,'Mobile review thread regression failed');
