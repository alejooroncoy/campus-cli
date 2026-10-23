import {profeMatchCommentsSection} from '../src/lib/professor-pages.mjs';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const out=fileURLToPath(new URL('../../output/professor-conversations/',import.meta.url));
const fixtureDir=await mkdtemp(join(tmpdir(),'campus-thread-test-'));
const snapshotFile=join(fixtureDir,'profematch.json');
await writeFile(snapshotFile,JSON.stringify({'https://profematchperu.com/u/upc/profesor/5-juan-carlos-morales-arevalo':{commentsStatus:'available',comments:[{id:'profematch-5-review-99',text:'Comentario ficticio para probar la interfaz.',rating:4,repliesStatus:'available',replies:[]}]}}));
const preview=spawn(process.execPath,[fileURLToPath(new URL('./preview-professor-conversations.mjs',import.meta.url))],{env:{...process.env,PORT:'0',PROFEMATCH_PREVIEW_FILE:snapshotFile},stdio:['ignore','pipe','inherit']});
const previewURL=await new Promise((resolve,reject)=>{preview.stdout.once('data',resolve);preview.once('error',reject);preview.once('exit',code=>reject(new Error('Preview exited: '+code)));});
process.on('exit',()=>preview.kill());await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1050}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const url=String(previewURL).trim();
await page.goto(url,{waitUntil:'networkidle'});await page.screenshot({path:out+'/desktop.png',fullPage:true});
await page.getByRole('link',{name:'Leer 1 comentario',exact:true}).click();
assert.equal(await page.locator('#profematch-5-comments .prof-public__review').first().isVisible(),true);
await page.reload({waitUntil:'networkidle'});
assert.equal(await page.locator('#profematch-5-comments .prof-public__review').first().isVisible(),true);
await page.locator('.prof-public__profematch-comments > summary').first().click();
const styleMarkup=await page.locator('head link[rel="stylesheet"], head style').evaluateAll(nodes=>nodes.map(n=>n.outerHTML).join(''));
const layout=[];
for(const width of [320,375,768,1024,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(600);layout.push(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth})));}
assert.ok(layout.every(r=>r.width===r.scroll),JSON.stringify(layout));
await page.setViewportSize({width:375,height:900});await page.screenshot({path:out+'/mobile.png',fullPage:true});
await page.locator('[data-review-thread] > summary').first().click();
await page.getByLabel('Tu respuesta',{exact:true}).fill('Pregunta de prueba: ¿las prácticas incluyen ejercicios resueltos?');
await page.getByRole('button',{name:'Publicar respuesta',exact:true}).click();
await page.getByText('Respuesta de prueba guardada solo en memoria.').waitFor();
assert.equal(await page.locator('.prof-public__reply').count(),1);
await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(500);await page.screenshot({path:out+'/mobile-replies.png',fullPage:true});
await page.locator('[data-review-thread]').first().screenshot({path:out+'/reply-detail.png'});
await page.reload({waitUntil:'networkidle'});await page.locator('[data-review-thread] > summary').first().click();await page.locator('.prof-public__reply').waitFor();
assert.equal(await page.locator('.prof-public__reply').count(),1);
// Privacy errors preserve the typed draft.
await page.getByLabel('Tu respuesta',{exact:true}).fill('Mi correo es test@example.com');await page.getByRole('button',{name:'Publicar respuesta',exact:true}).click();await page.getByText('Quita correos y teléfonos antes de publicar.').waitFor();
assert.equal(await page.getByLabel('Tu respuesta',{exact:true}).inputValue(),'Mi correo es test@example.com');
// Signed-out users can still read; login returns to the same thread.
await page.route('**/api/app/session/',route=>route.fulfill({json:{authenticated:false}}));await page.reload({waitUntil:'networkidle'});await page.locator('[data-review-thread] > summary').first().click();
const login=page.getByRole('link',{name:'Entrar para responder',exact:true});await login.waitFor();assert.match(await login.getAttribute('href'),/%23review-/);assert.equal(await page.locator('.prof-public__reply').count(),1);
// Returning from login to an older review must restore that exact public review.
const olderReview={id:1,professorSlug:'juan-carlos-morales-arevalo',professor:'Juan Carlos Morales Arevalo',text:'Reseña anterior de prueba',rating:4,createdAt:'2026-01-01T12:00:00Z',course:null};
await page.route('**/api/app/profes/community/**',route=>route.fulfill({json:{reviews:[{...olderReview,professorId:Number(new URL(route.request().url()).searchParams.get('professorId'))}],nextCursor:null}}));
await page.goto(url+'#review-1',{waitUntil:'networkidle'});
await page.locator('#review-1 [data-review-thread][open]').waitFor();
assert.equal(await page.locator('#review-1').getByText('Reseña anterior de prueba',{exact:true}).isVisible(),true);
await page.locator('#review-1').getByRole('link',{name:'Entrar para responder',exact:true}).waitFor();
await page.goto(url,{waitUntil:'networkidle'});
await page.unroute('**/api/app/profes/community/**');
// Loading failure has a retry, not a false empty state.
await page.route('**/replies/',route=>route.fulfill({status:503,json:{error:'No pudimos cargar las respuestas.'}}));await page.reload({waitUntil:'networkidle'});await page.locator('[data-review-thread] > summary').first().click();await page.getByRole('button',{name:'Volver a cargar'}).waitFor();
// Explicit synthetic fixture: this professor has no public source replies today.
const fixture=profeMatchCommentsSection([{source:'profematch',sourceId:'5',sourceUrl:'https://profematchperu.com/u/upc/profesor/5-juan-carlos-morales-arevalo',score:4,scale:5,ratingCount:1,observedAt:'2026-10-23',courseLabel:'Curso de prueba',commentsStatus:'available',comments:[{id:'profematch-5-review-99',rating:4,text:'Reseña de prueba',repliesStatus:'available',replies:[{text:'Respuesta de prueba',dateLabel:'23 oct. 2026',replies:[{text:'Subrespuesta de prueba',replies:[]}]}]}]}]);
await page.setContent(`<base href="${url}">${styleMarkup}<main class="prof-public shell"><div class="prof-public__profile" data-professor-profile><p>Hilo ficticio para validar el diseño</p>${fixture}</div></main>`);
await page.locator('.prof-public__catalog-details > summary').click();
await page.locator('.prof-public__thread > summary').first().click();
assert.equal(await page.getByText('Respuesta de prueba',{exact:true}).isVisible(),true);
assert.equal(await page.getByText('Subrespuesta de prueba',{exact:true}).isVisible(),false);
await page.locator('.prof-public__thread > summary').nth(1).click();
assert.equal(await page.getByText('Subrespuesta de prueba',{exact:true}).isVisible(),true);
for(const width of [320,375,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);}
await page.setViewportSize({width:375,height:900});await page.waitForTimeout(200);assert.equal(await page.locator('.prof-public__thread > summary > svg').first().evaluate(el=>getComputedStyle(el).transform),'none');await page.screenshot({path:out+'/thread-fixture.png',fullPage:true});
assert.deepEqual(errors,[]);await writeFile(out+'/checks.json',JSON.stringify({layout,errors,submission:true,reload:true,privacyError:true,guest:true,retry:true,externalNestedReplies:true,olderReviewReturn:true},null,2));
console.log(JSON.stringify({layout,errors,output:out}));await browser.close();preview.kill();await rm(fixtureDir,{recursive:true,force:true});
