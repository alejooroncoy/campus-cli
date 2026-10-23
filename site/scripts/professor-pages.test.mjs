import {test} from 'node:test';import assert from 'node:assert/strict';
import {professorsPage} from '../api/professors.js';import {profileBody,formBody,externalRatingsSection,directoryBody,catalogReviewCard} from '../src/lib/professor-pages.mjs';
const data={professor:{id:468,slug:'juan-carlos-morales-arevalo',name:'Juan Carlos Morales Arevalo',university:'UPC'},courses:[{id:1,name:'Base de Datos',code:'SI400'}],stats:{reviewCount:1,ratingCount:1,averageRating:2},reviews:[{id:1,professor:'Juan Carlos Morales Arevalo',professorSlug:'juan-carlos-morales-arevalo',rating:2,text:'Una experiencia con ejemplos.',course:'Base de Datos',term:'2026-1',createdAt:'2026-10-22',editedAt:null}],nextCursor:null};
const template='<head><title>__CAMPUS_PUBLIC_TITLE__</title><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><link rel="canonical" href="__CAMPUS_PUBLIC_CANONICAL__"></head><main>__CAMPUS_PUBLIC_BODY__</main>';
const run=(path,opts={})=>professorsPage(new Request('https://campuscli.com'+path),{fetchData:async(url,options)=>{assert.equal(new URL(url).hostname,'profes.campuscli.com');assert.equal(options.headers.Cookie,undefined);return Response.json(data);},loadTemplate:async()=>template,...opts});
test('profile HTML includes its name, courses, native reviews and canonical slug without client JS',async()=>{
 const response=await run('/profes/upc/juan-carlos-morales-arevalo/');const html=await response.text();assert.equal(response.status,200);
 for(const text of ['Una experiencia con ejemplos.','Base de Datos','<h1>Juan Carlos Morales Arevalo</h1>','BreadcrumbList'])assert.ok(html.includes(text));
 assert.ok(html.includes('href="https://campuscli.com/profes/upc/juan-carlos-morales-arevalo/"'));assert.doesNotMatch(html,/professorId=/);
});
test('legacy IDs redirect once, unknown slugs return real 404, and failed data never becomes a fake empty profile',async()=>{
 const legacy=await run('/profes/resenas/?professorId=468');assert.equal(legacy.status,308);assert.equal(legacy.headers.get('location'),'/profes/upc/juan-carlos-morales-arevalo/');
 const missing=await run('/profes/upc/no-existe/',{fetchData:async()=>Response.json({},{status:404})});assert.equal(missing.status,404);
 assert.equal((await run('/profes/upc/ana-perez/',{fetchData:async()=>{throw new Error('private');}})).status,503);
});
test('dedicated writing page keeps the selected professor, requires explicit confirmation, and only preview mode simulates',async()=>{
 const response=await run('/profes/upc/juan-carlos-morales-arevalo/escribir/');const html=await response.text();assert.ok(html.includes('noindex,follow'));assert.ok(html.includes('data-professor-id="468"'));assert.ok(html.includes('Confirmar y enviar'));assert.doesNotMatch(html,/data-preview="true"/);
 assert.match(formBody(data,{preview:true}),/data-preview="true"/);assert.match(formBody(data,{preview:true}),/no guarda reseñas/);
});
test('student text and metadata cannot inject HTML, including JSON-LD script termination',async()=>{
 const malicious=structuredClone(data);malicious.professor.name='</script><script>alert(1)</script>';malicious.reviews[0].text='<img src=x onerror=alert(1)>';
 const body=profileBody(malicious);assert.doesNotMatch(body,/<img src=x/);assert.match(body,/&lt;img/);
 const response=await run('/profes/upc/juan-carlos-morales-arevalo/',{fetchData:async()=>Response.json(malicious)});assert.doesNotMatch(await response.text(),/<script>alert/);
});

test('community landing also contains native comments and slug links in its first HTML response',async()=>{
 const response=await professorsPage(new Request('https://campuscli.com/profes/resenas/'),{fetchData:async()=>Response.json(data)});
 assert.equal(response.status,200);const html=await response.text();assert.match(html,/Una experiencia con ejemplos\./);assert.match(html,/href="\/profes\/upc\/juan-carlos-morales-arevalo\/"/);
});

test('an unconfirmed historical course is labeled pending without inventing a course',()=>{
 const pending=structuredClone(data);pending.reviews[0].course=null;pending.reviews[0].courseStatus='pending';
 const html=profileBody(pending);assert.match(html,/Curso por confirmar/);assert.ok(html.includes('Una experiencia con ejemplos.'));
});

const external={source:'profematch',sourceLabel:'ProfeMatch',sourceId:'797',sourceUrl:'https://profematchperu.com/u/upc/profesor/797-merwil-luciano-arroyo-flores',score:4.6,scale:5,ratingCount:7,courseLabel:'Cálculo 1',observedAt:'2026-10-22T21:18:55Z',includedInCampusScore:false};
test('external-only profile shows source scores while retaining zero native reviews and noindex',async()=>{
 const empty={...data,stats:{reviewCount:0,ratingCount:0,averageRating:null},reviews:[],externalRatings:[external]};
 const result=await run('/profes/upc/juan-carlos-morales-arevalo/',{fetchData:async()=>Response.json(empty)});const html=await result.text();
 for(const text of ['Puntuaciones en ProfeMatch','4.6',' / 5','7 valoraciones reportadas','Ver fuente en ProfeMatch','aún no tiene reseñas propias','noindex,follow'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/4.6\/10|AggregateRating/);assert.match(html,/<strong>0<\/strong> reseñas de Campus/);
});
test('external scores never replace the native score and source text cannot inject HTML or links',()=>{
 const body=profileBody({...data,externalRatings:[{...external,courseLabel:'<script>bad</script>'}]});
 assert.match(body,/<strong>2\/10<\/strong>/);assert.match(body,/&lt;script&gt;bad/);assert.doesNotMatch(body,/<script>bad/);
 assert.equal(externalRatingsSection([{...external,sourceUrl:'javascript:alert(1)'}]),'');assert.equal(externalRatingsSection([{...external,score:9}]),'');
});
test('directory makes external ratings discoverable without counting them as native reviews',()=>{
 const body=directoryBody({query:'',page:1,pages:1,total:1,professors:[{...data.professor,courses:[],reviewCount:0,hasExternalRatings:true}]});
 assert.match(body,/Puntuaciones disponibles en ProfeMatch/);assert.match(body,/Sé el primero/);
});

test('rewritten canonical URLs resolve without a slash redirect before the renderer',async()=>{
 const response=await run('/api/professors/?route=/profes/upc/juan-carlos-morales-arevalo/');
 assert.equal(response.status,200);assert.match(await response.text(),/<h1>Juan Carlos Morales Arevalo<\/h1>/);
 const form=await run('/api/professors/?route=/profes/upc/juan-carlos-morales-arevalo/escribir/');
 assert.equal(form.status,200);assert.match(await form.text(),/data-review-form-root/);
});

test('existing catalog reviews retain their source and scale, escape text and paginate on the same professor',async()=>{
 const catalog={...data,catalogReviews:{stats:{reviewCount:17,ratingCount:17,averageRating:8.9},sourceUrls:['https://peru.misprofesores.com/profesores/Jonathan-Sueros_18445','javascript:alert(1)'],reviews:[{id:9,text:'Explica <b>bien</b>',rating:10,course:'Matemática discreta',courseStatus:'source_label',date:'2026-01-01'}],nextCursor:9}};
 const ordered={...catalog,externalRatings:[external]};const html=profileBody(ordered);assert.ok(html.indexOf('id="resenas"')<html.indexOf('id="resenas-catalogo"'));assert.ok(html.indexOf('id="resenas-catalogo"')<html.indexOf('id="puntuaciones"'));assert.equal(catalogReviewCard({rating:6,text:null}),'');for(const text of ['8.9/10','MisProfesores','Curso indicado en la fuente','Explica &lt;b&gt;bien&lt;/b&gt;','?before=9#resenas-catalogo'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/href="javascript/);assert.match(html,/<strong>2\/10<\/strong>/);
 let before;await run('/profes/upc/juan-carlos-morales-arevalo/?before=9',{fetchData:async url=>{before=new URL(url).searchParams.get('before');return Response.json(catalog);}});assert.equal(before,'9');
 const directory=directoryBody({query:'Jonathan',page:1,pages:1,total:1,professors:[{...data.professor,courses:[],reviewCount:1,averageRating:2,catalogReviewCount:17,catalogAverageRating:8.9}]});
 assert.match(directory,/2\/10 · 1 reseña de Campus/);assert.match(directory,/8.9\/10 · 17 valoraciones de MisProfesores/);
});

test('profile conversations belong only to Campus reviews and sources remain independent',()=>{
 const html=profileBody({...data,catalogReviews:{stats:{reviewCount:1,ratingCount:1,averageRating:9,commentCount:1},sourceUrls:['https://peru.misprofesores.com/profesores/Ana_12'],reviews:[{id:8,text:'Opinión externa',rating:9}],nextCursor:null}});
 assert.match(html,/id="review-1"/);assert.match(html,/data-review-thread="1"/);
 assert.doesNotMatch(html,/data-review-thread="8"/);assert.equal((html.match(/<h1>/g)||[]).length,1);
 assert.doesNotMatch(html,/<h3><a[^>]*>Juan Carlos/);
 assert.match(html,/class="prof-public__catalog-details" >/);
 assert.match(profileBody({...data,catalogBefore:9,catalogReviews:{stats:{reviewCount:1,commentCount:1},sourceUrls:['https://peru.misprofesores.com/profesores/Ana_12'],reviews:[],nextCursor:null}}),/class="prof-public__catalog-details" open/);
});

test('ProfeMatch comments are attributed, escaped and keep their original scale without reply controls',()=>{
 const html=profileBody({...data,externalRatings:[{...external,commentsStatus:'available',comments:[{text:'Explica <b>bien</b>',rating:4,dateLabel:'agosto de 2026'}]}]});
 assert.match(html,/Comentarios de ProfeMatch/);assert.match(html,/Explica &lt;b&gt;bien&lt;\/b&gt;/);assert.match(html,/<strong>4\/5<\/strong>/);
 assert.match(html,/1 comentario disponible/);assert.match(html,/Ver comentarios en ProfeMatch/);
 assert.equal((html.match(/data-review-thread=/g)||[]).length,1);
 const failed=profileBody({...data,externalRatings:[{...external,commentsStatus:'unavailable',comments:[]}]});
 assert.match(failed,/No pudimos cargar los comentarios/);assert.doesNotMatch(failed,/0 comentarios disponibles/);
});

test('imported replies remain nested under the owning review and share the Campus reply design',()=>{
 const html=profileBody({...data,externalRatings:[{...external,commentsStatus:'available',comments:[{id:'profematch-5-review-9',text:'Reseña principal',rating:4,repliesStatus:'available',replies:[{text:'Respuesta <script>bad</script>',dateLabel:'23 oct. 2026',replies:[{text:'Respuesta anidada',replies:[]}]}]},{id:'profematch-5-review-10',text:'Otra reseña',rating:2,repliesStatus:'unavailable',replies:[]}]}]});
 assert.match(html,/id="profematch-5-review-9"/);
 assert.equal((html.match(/class="prof-public__reply"/g)||[]).length,2);
 assert.match(html,/Respuesta &lt;script&gt;bad&lt;\/script&gt;/);
 assert.match(html,/Las respuestas no están disponibles/);
 assert.match(html,/Responder en ProfeMatch/);
 assert.equal((html.match(/data-review-thread=/g)||[]).length,1);
 assert.ok(html.indexOf('Respuesta anidada')<html.indexOf('id="profematch-5-review-10"'));
});

test('published ProfeMatch snapshot remains readable during rollout; live empty threads are authoritative',async()=>{
 const {withProfeMatchSnapshots}=await import('../src/lib/professor-pages.mjs');
 const corpus=(await import('../src/data/profematch-excerpts.json',{with:{type:'json'}})).default;
 const snapshot=corpus.profiles[0],professor={id:snapshot.professorId,slug:snapshot.professorSlug};
 const source={source:'profematch',sourceId:snapshot.sourceId,sourceUrl:snapshot.sourceUrl,courseLabel:snapshot.courseLabel};
 assert.equal(withProfeMatchSnapshots([source],professor)[0].commentsStatus,'snapshot');
 assert.equal(withProfeMatchSnapshots([{...source,commentsStatus:'unavailable',comments:[]}],professor)[0].comments.length,snapshot.comments.length);
 assert.deepEqual(withProfeMatchSnapshots([{...source,commentsStatus:'available',comments:[]}],professor)[0].comments,[]);
 assert.equal(withProfeMatchSnapshots([source],{...professor,id:-1})[0].comments,undefined);
});
