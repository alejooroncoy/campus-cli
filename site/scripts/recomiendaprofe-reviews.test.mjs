import {test} from 'node:test';import assert from 'node:assert/strict';
import corpus from '../src/data/recomiendaprofe-reviews.json' with {type:'json'};
import {recomiendaProfeReviews,recomiendaProfeCommentCounts,validRecomiendaProfeURL} from '../src/lib/recomiendaprofe-reviews.mjs';
import {profileBody,isIndexableProfile} from '../src/lib/professor-pages.mjs';
import {indexableProfessors} from '../api/professors.js';

const record={professorId:7,professorSlug:'ana-prueba',sourceUrl:'https://recomienda-profe-upc-frontend.vercel.app/profesores/ana-prueba',reviews:[
 {id:'a'.repeat(24),rating:8,difficulty:6,recommends:true,course:'Cálculo I',createdAt:'2026-08-22T06:34:02.885Z',text:'Explica con ejemplos y responde todas las dudas en clase.'},
 {id:'b'.repeat(24),rating:4,difficulty:9,recommends:false,course:'Cálculo I',createdAt:'2026-08-01T06:34:02.885Z',text:'<img src=x onerror=alert(1)> Exige mucho y corrige tarde los trabajos.'},
 {id:'b'.repeat(24),rating:4,recommends:false,course:'Cálculo I',createdAt:'2026-08-01T06:34:02.885Z',text:'duplicada'},
 {id:'c'.repeat(24),rating:11,course:'Cálculo I',createdAt:'2026-08-01T06:34:02.885Z',text:'fuera de escala'},
]};
const profile={professor:{id:7,slug:'ana-prueba',name:'Ana Prueba'},courses:[],reviews:[],stats:{reviewCount:0,ratingCount:0,averageRating:null},externalRatings:[],teachingCourses:[]};

test('el snapshot real es coherente: ids únicos, escala 1-10, enlaces válidos y un perfil por profesor',()=>{
 assert.equal(corpus.schemaVersion,1);
 const slugs=new Set(),ids=new Set();
 for(const p of corpus.profiles){
  assert.ok(Number.isSafeInteger(p.professorId));assert.ok(!slugs.has(p.professorSlug));slugs.add(p.professorSlug);
  assert.ok(validRecomiendaProfeURL(p.sourceUrl),p.sourceUrl);
  for(const r of p.reviews){assert.ok(!ids.has(r.id));ids.add(r.id);assert.ok(r.rating>=1&&r.rating<=10);assert.ok(r.text.trim());assert.doesNotMatch(r.text,/@[\w-]+\.\w+|\b9\d{8}\b/);}
 }
});

test('solo se muestran con id y slug de Campus coincidentes; se descartan duplicadas y fuera de escala',()=>{
 assert.equal(recomiendaProfeReviews({id:7,slug:'ana-prueba'},[record]).reviews.length,2);
 assert.equal(recomiendaProfeReviews({id:8,slug:'ana-prueba'},[record]),null);
 assert.equal(recomiendaProfeReviews({id:7,slug:'otra'},[record]),null);
 assert.equal(recomiendaProfeReviews({id:7,slug:'ana-prueba'},[{...record,sourceUrl:'https://evil.example/profesores/ana'}]),null);
 assert.equal(recomiendaProfeCommentCounts(40,[record]).get('ana-prueba'),2);
});

test('una ficha vinculada muestra las reseñas con su fuente, escapa el HTML y cuenta para indexar',()=>{
 const p=corpus.profiles.find(x=>x.reviews.length>=2);
 const data={...profile,professor:{id:p.professorId,slug:p.professorSlug,name:'Profe'}};
 const html=profileBody(data);
 assert.ok(html.includes('Fuente: Recomienda Profe'));
 assert.ok(html.includes(`href="${p.sourceUrl}"`));
 assert.ok(html.includes(p.reviews[0].text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')));
 assert.match(html,/Lo recomienda|No lo recomienda/);
 assert.doesNotMatch(html,/<img src=x/);
 assert.equal(isIndexableProfile(data),p.reviews.filter(r=>r.text.length>=40).length>=2);
 assert.ok(indexableProfessors([{slug:p.professorSlug,comments:0,profematch:false}],{counts:new Map(),minComments:1}).length===1);
});

test('una ficha sin vínculo no recibe reseñas de Recomienda Profe',()=>{
 assert.doesNotMatch(profileBody(profile),/Fuente: Recomienda Profe/);
});
