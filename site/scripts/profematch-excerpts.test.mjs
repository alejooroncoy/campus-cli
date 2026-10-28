import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseComments,sourceURL} from './profematch-excerpts.mjs';
import {matchedComments,courseSourceRatings} from '../src/lib/profematch-excerpts.mjs';
const match={source_id:'5',source_url:'https://profematchperu.com/u/upc/profesor/5-juan-carlos-morales-arevalo',source_name:'Juan Carlos Morales Arévalo',professor_id:468,professor_slug:'juan-carlos-morales-arevalo',raw_course:'Base de Datos'};
const identity={id:468,slug:match.professor_slug};
const rating={source:'profematch',sourceId:'5',sourceUrl:match.source_url,courseLabel:'Base de Datos'};
const html=comments=>`<link rel="canonical" href="${match.source_url}"><script type="application/ld+json">${JSON.stringify({'@type':'Person',name:match.source_name,worksFor:{name:'Universidad Peruana de Ciencias Aplicadas'},aggregateRating:{bestRating:5,ratingValue:4,ratingCount:9}})}</script><p class="lead">Base de Datos en Universidad Peruana de Ciencias Aplicadas · Ingeniería · Presencial.</p>${comments.map(text=>`<div class="cmt"><b>@alumno</b><span class="fecha">4★ · lo recomienda · agosto de 2026</span><p>${text}</p></div>`).join('')}`;
test('empty source comments and duplicates do not generate cards or affect reported rating totals',()=>{
 const p=parseComments(html(['','  ','Explica con ejemplos','Explica con ejemplos','[Comentario esperando revisión]']),match);
 assert.equal(p.comments.length,1);assert.equal(p.ratingCount,9);assert.equal(p.emptyCount,3);
 assert.equal(p.comments[0].sourceUrl,match.source_url);assert.equal(p.comments[0].rating,4);
});
test('source contacts are withheld rather than copied into a comment',()=>{
 const p=parseComments(html(['Escribe a alumno@example.org','Llama al +51 987 654 321','Explica con ejemplos']),match);
 assert.equal(p.comments.length,1);assert.equal(p.withheldCount,2);
});
test('changed professor/course/canonical and unsafe URLs stop extraction',()=>{
 for(const patch of [{source_name:'Otra Persona Perez'},{raw_course:'Otro curso'},{source_id:'57'}])assert.throws(()=>parseComments(html(['Buena clase']),{...match,...patch}));
 assert.throws(()=>parseComments(html(['Buena clase']).replace('rel="canonical"','rel="other"'),match));
 for(const url of ['https://profematchperu.com.evil.com/u/upc/profesor/5-juan','https://user@profematchperu.com/u/upc/profesor/5-juan','https://profematchperu.com/api/reviews','javascript:alert(1)'])assert.throws(()=>sourceURL(url));
});
test('long comments keep their complete ending instead of being cut at 240 characters',()=>{
 const text='Explica con ejemplos y ejercicios prácticos. '.repeat(20)+'Esta es la conclusión completa.';
 const p=parseComments(html([text]),match);
 assert.equal(p.comments[0].text,text);
 assert.equal(p.comments[0].truncated,false);
 assert.ok(p.comments[0].text.length>240);
});
test('a snapshot is only shown when the live backend still confirms the exact professor/source/course',()=>{
 const record=parseComments(html(['Buena explicación']),match);
 assert.equal(matchedComments(identity,rating,[record]).comments.length,1);
 for(const person of [{...identity,id:999},{...identity,slug:'otra-persona'}])assert.equal(matchedComments(person,rating,[record]),null);
 for(const change of [{sourceId:'57'},{courseLabel:'HCI'},{sourceUrl:'https://example.com/'}])assert.equal(matchedComments(identity,{...rating,...change},[record]),null);
 assert.equal(matchedComments(identity,rating,[{...record,comments:[{...record.comments[0],text:' '}]}]),null);
 assert.equal(matchedComments(identity,rating,[{...record,comments:[{...record.comments[0],truncated:true}]}]),null);
});
test('only an existing exact course name gets a source link; abbreviations are not guessed',()=>{
 assert.equal(courseSourceRatings({name:'Base de Datos'},[rating]).length,1);
 assert.equal(courseSourceRatings({name:'Diseño de Base de Datos'},[rating]).length,0);
 assert.equal(courseSourceRatings({name:'IHC y Tecnologías Móviles'},[{...rating,courseLabel:'HCI'}]).length,0);
});

test('the renderer escapes each complete source comment and places it in the unified feed',async()=>{
 const {profeMatchCommentsSection,withProfeMatchSnapshots,profileBody}=await import('../src/lib/professor-pages.mjs');
 const corpus=(await import('../src/data/profematch-excerpts.json',{with:{type:'json'}})).default;
 const entry=corpus.profiles.find(p=>p.professorId===468&&p.sourceId==='5');
 assert.ok(entry);
 const original=entry.comments[0].text;
 try{
  entry.comments[0].text='Una experiencia detallada. '.repeat(30)+'<img src=x onerror=alert(1)> FINAL COMPLETO';
  const section=profeMatchCommentsSection(withProfeMatchSnapshots([{...rating,score:1.9,scale:5,ratingCount:14,observedAt:entry.observedAt}],identity));assert.match(section,/&lt;img/);assert.doesNotMatch(section,/<img src=x/);assert.match(section,/FINAL COMPLETO<\/p>/);assert.doesNotMatch(section,/Fragmento de ProfeMatch/);
  const links=[...section.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(m=>m[1]);assert.equal(links.length,entry.comments.length+1);assert.ok(links.every(url=>url===match.source_url));
  const html=profileBody({professor:{...identity,name:'Juan Carlos Morales Arevalo'},courses:[],stats:{reviewCount:0,ratingCount:0,averageRating:null},reviews:[],externalRatings:[{...rating,score:1.9,scale:5,ratingCount:14,observedAt:entry.observedAt}]});
  assert.match(html,/FINAL COMPLETO<\/p>/);assert.match(html,/Fuente: ProfeMatch/);assert.doesNotMatch(html,/id="puntuaciones"|AggregateRating/);
 }finally{entry.comments[0].text=original;}
});

test('published snapshot covers all confirmed sources and contains complete attributed comments',async()=>{
 const corpus=(await import('../src/data/profematch-excerpts.json',{with:{type:'json'}})).default;
 assert.equal(corpus.schemaVersion,2);assert.equal(corpus.contentMode,'full');assert.equal(corpus.complete,true);assert.equal(corpus.profiles.length,corpus.expectedSources);assert.equal(corpus.errors.length,0);
 const seenSources=new Set();
 for(const profile of corpus.profiles){
  assert.equal(sourceURL(profile.sourceUrl),profile.sourceUrl);assert.ok(!seenSources.has(profile.sourceId));seenSources.add(profile.sourceId);
  const seen=new Set();
  for(const c of profile.comments){assert.ok(c.text.trim());assert.equal(c.truncated,false);assert.equal(c.sourceUrl,profile.sourceUrl);assert.ok(!seen.has(c.id));seen.add(c.id);}
 }
});
