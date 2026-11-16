import {test} from 'node:test';import assert from 'node:assert/strict';
import corpus from '../src/data/recomiendaprofe-reviews.json' with {type:'json'};
import {recomiendaProfeReviews,recomiendaProfeCommentCounts,validRecomiendaProfeURL} from '../src/lib/recomiendaprofe-reviews.mjs';
import {profileBody,isIndexableProfile} from '../src/lib/professor-pages.mjs';
import {indexableProfessors} from '../api/professors.js';

const url='https://recomienda-profe-upc-frontend.vercel.app/profesores/ana-prueba';
const record={professorId:7,professorSlug:'ana-prueba',reviews:[
 {id:'a'.repeat(24),sourceUrl:url,rating:8,difficulty:6,recommends:true,course:'Cálculo I',createdAt:'2026-08-22T06:34:02.885Z',text:'Explica con ejemplos y responde todas las dudas en clase.'},
 {id:'b'.repeat(24),sourceUrl:url,rating:4,difficulty:9,recommends:false,course:'Cálculo I',createdAt:'2026-08-01T06:34:02.885Z',text:'<img src=x onerror=alert(1)> Exige mucho y corrige tarde los trabajos.'},
 {id:'b'.repeat(24),sourceUrl:url,rating:4,recommends:false,course:'Cálculo I',createdAt:'2026-08-01T06:34:02.885Z',text:'duplicada'},
 {id:'c'.repeat(24),sourceUrl:url,rating:11,course:'Cálculo I',createdAt:'2026-08-01T06:34:02.885Z',text:'fuera de escala'},
 {id:'d'.repeat(24),sourceUrl:'https://evil.example/profesores/ana',rating:7,course:'Cálculo I',createdAt:'2026-08-01T06:34:02.885Z',text:'enlace ajeno'},
 {id:'e'.repeat(24),sourceUrl:url,rating:7,course:'Cálculo I',createdAt:'2026-08-01T06:34:02.885Z',text:'compartida mal formada',sharedWith:'Otra Persona'},
]};
const profile={professor:{id:7,slug:'ana-prueba',name:'Ana Prueba'},courses:[],reviews:[],stats:{reviewCount:0,ratingCount:0,averageRating:null},externalRatings:[],teachingCourses:[]};
const escape=text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

test('el snapshot real es coherente: escala 1-10, enlaces válidos, un perfil por profesor y sin datos de contacto',()=>{
 assert.equal(corpus.schemaVersion,2);
 const slugs=new Set();
 for(const p of corpus.profiles){
  assert.ok(Number.isSafeInteger(p.professorId));assert.ok(!slugs.has(p.professorSlug));slugs.add(p.professorSlug);
  const ids=new Set();
  for(const r of p.reviews){
   assert.ok(!ids.has(r.id));ids.add(r.id);
   assert.ok(validRecomiendaProfeURL(r.sourceUrl),r.sourceUrl);assert.ok(r.rating>=1&&r.rating<=10);assert.ok(r.text.trim());
   assert.doesNotMatch(r.text,/@[\w-]+\.\w+|\b9\d{8}\b/);
   if(r.sharedWith)assert.ok(Array.isArray(r.sharedWith)&&r.sharedWith.length>0);
  }
 }
});

test('solo se muestran con id y slug de Campus coincidentes; se descartan duplicadas, fuera de escala y enlaces ajenos',()=>{
 const linked=recomiendaProfeReviews({id:7,slug:'ana-prueba'},[record]);
 assert.equal(linked.reviews.length,2);assert.deepEqual(linked.sourceUrls,[url]);
 assert.equal(recomiendaProfeReviews({id:8,slug:'ana-prueba'},[record]),null);
 assert.equal(recomiendaProfeReviews({id:7,slug:'otra'},[record]),null);
 assert.equal(recomiendaProfeCommentCounts(40,[record]).get('ana-prueba'),2);
});

test('una ficha vinculada muestra las reseñas con su fuente, escapa el HTML y cuenta para indexar',()=>{
 const p=corpus.profiles.find(x=>x.reviews.length>=2);
 const data={...profile,professor:{id:p.professorId,slug:p.professorSlug,name:'Profe'}};
 const html=profileBody(data);
 assert.ok(html.includes('Fuente: Recomienda Profe'));
 assert.ok(html.includes(`href="${p.reviews[0].sourceUrl}"`));
 assert.ok(html.includes(escape(p.reviews[0].text)));
 assert.match(html,/Lo recomienda|No lo recomienda/);
 assert.equal(isIndexableProfile(data),p.reviews.filter(r=>r.text.length>=40).length>=2);
 assert.ok(indexableProfessors([{slug:p.professorSlug,comments:0,profematch:false}],{counts:new Map(),minComments:1}).length===1);
});

test('una reseña compartida sale en la ficha de cada docente y nombra al otro',()=>{
 const shared=corpus.profiles.flatMap(p=>p.reviews.filter(r=>r.sharedWith).map(r=>({p,r})));
 assert.ok(shared.length>0);
 const byId=new Map();for(const {p,r} of shared)byId.set(r.id,[...(byId.get(r.id)??[]),p]);
 assert.ok([...byId.values()].some(list=>list.length===2),'al menos una reseña aparece en dos fichas');
 const {p,r}=shared[0];
 const html=profileBody({...profile,professor:{id:p.professorId,slug:p.professorSlug,name:'Profe'}});
 assert.ok(html.includes(`Reseña compartida con ${escape(r.sharedWith.join(' y '))}`));
});

test('una ficha sin vínculo no recibe reseñas de Recomienda Profe',()=>{
 assert.doesNotMatch(profileBody(profile),/Fuente: Recomienda Profe/);
});

test('con varias fichas de origen, cada enlace de referencia indica a cuál lleva',()=>{
 const p=corpus.profiles.find(x=>new Set(x.reviews.map(r=>r.sourceUrl)).size>1);
 assert.ok(p,'hay al menos una ficha con dos orígenes');
 const html=profileBody({...profile,professor:{id:p.professorId,slug:p.professorSlug,name:'Profe'}});
 for(const s of p.sources)assert.ok(html.includes(`Ver fuente en Recomienda Profe (${escape(s.sourceName)})`),s.sourceName);
});
