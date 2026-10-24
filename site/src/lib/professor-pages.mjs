import {matchedComments,courseSourceRatings} from './profematch-excerpts.mjs';
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const validSlug=slug=>typeof slug==='string'&&slug.length<=180&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
export const professorPath=slug=>`/profes/upc/${slug}/`;
const e=escapeHTML;
export const icon=name=>`<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" focusable="false"><use href="/assets/lucide.svg?v=profes-20261023#${name}"></use></svg>`;
const link=(url,text,cls='')=>`<a class="${cls}" href="${e(url)}">${text}</a>`;
const writingURL=slug=>`${professorPath(slug)}escribir/`;
const displayScore=value=>Number.isFinite(Number(value))?Number(Number(value).toFixed(1)).toString():'';
const starRow=value=>{const stars=Math.max(0,Math.min(5,Math.round(Number(value)/2)));return `<span class="prof-public__stars" role="img" aria-label="${stars} de 5 estrellas">${'★'.repeat(stars)}${'☆'.repeat(5-stars)}</span>`;};
const reviewHeader=(label,rating,scale)=>`<div class="prof-public__review-top"><span><span class="prof-public__review-avatar">${icon('user')}</span>${e(label)}</span><span class="prof-public__review-rating">${rating==null?'Sin puntuación':`${starRow(scale===5?Number(rating)*2:rating)}<strong>${e(displayScore(scale===5?Number(rating)*2:rating))}/10</strong>`}</span></div>`;
export function replyCard(reply){
 return `<article class="prof-public__reply"><div class="prof-public__reply-meta"><strong>${e(reply.authorLabel)}</strong>${reply.dateLabel?`<span>${e(reply.dateLabel)}</span>`:''}</div><p>${e(reply.text)}</p></article>`;
}
function externalThread(comment,sourceUrl,depth=0){
 const replies=Array.isArray(comment.replies)?comment.replies.filter(r=>typeof r.text==='string'&&r.text.trim()):[];
 if(depth>4)return '';
 if(!replies.length)return comment.repliesStatus==='unavailable'?'<p class="prof-public__help">Las respuestas no están disponibles aquí. Puedes consultarlas en ProfeMatch.</p>':'';
 return `<details class="prof-public__thread"><summary>${icon('message-circle')}<span>${replies.length} ${replies.length===1?'respuesta':'respuestas'}</span>${icon('arrow-down')}</summary><div class="prof-public__thread-content">${replies.map(reply=>`<div>${replyCard({...reply,authorLabel:'Estudiante de ProfeMatch'})}${externalThread(reply,sourceUrl,depth+1)}</div>`).join('')}</div></details>`;
}
export function reviewCard(r,options={}){
 const path=validSlug(r.professorSlug)?professorPath(r.professorSlug):'/profes/upc/';
 const date=new Date(r.createdAt);const dateText=Number.isFinite(date.getTime())?new Intl.DateTimeFormat('es-PE',{day:'numeric',month:'short',year:'numeric',timeZone:'America/Lima'}).format(date):'';
 const thread=options.profile&&Number.isSafeInteger(r.id)&&r.id>0;
 return `<article class="prof-public__review" ${thread?`id="review-${r.id}"`:''}>
 ${reviewHeader('Estudiante de Campus',r.rating,10)}
 ${options.profile?'':`<h3>${link(path,e(r.professor))}</h3>`}
 <div class="prof-public__chips"><span>${e(r.course??(r.courseStatus==='pending'?'Curso por confirmar':'Curso no indicado'))}</span>${r.term?`<span>Ciclo ${e(r.term)}</span>`:''}${options.sourceLabel?`<span class="prof-public__review-source">Fuente: ${e(options.sourceLabel)}</span>`:''}</div>
 <p class="prof-public__comment">${e(r.text)}</p>
 ${options.sourceLinks?`<div class="prof-public__source-links">${options.sourceLinks}</div>`:''}
 <footer><span>${dateText?`Publicada el ${e(dateText)}`:''}${r.editedAt?' · Editada':''}</span>${options.profile?'':link(path,`Ver ficha del profesor ${icon('arrow-right')}`)}</footer>
 ${thread?`<details class="prof-public__thread" data-review-thread="${r.id}"><summary>${icon('message-circle')}<span data-thread-label>Ver respuestas · Responder</span>${icon('arrow-down')}</summary><div class="prof-public__thread-content"><div data-reply-list></div><p data-reply-status role="status" aria-live="polite"></p><button type="button" class="prof-public__text-button" data-reply-more hidden>Ver más respuestas</button><button type="button" class="prof-public__text-button" data-reply-retry hidden>Volver a cargar</button><div data-reply-composer></div><noscript>Activa JavaScript para leer las respuestas y participar.</noscript></div></details>`:''}</article>`;
}
export function externalRatingsSection(ratings=[]){
 const safe=ratings.filter(r=>{
  try{const url=new URL(r.sourceUrl);return r.source==='profematch'&&url.origin==='https://profematchperu.com'&&!url.username&&!url.password&&!url.search&&!url.hash&&/^\/u\/upc\/profesor\/\d+-[a-z0-9-]+\/?$/.test(url.pathname)&&Number.isFinite(r.score)&&r.score>=1&&r.score<=5&&r.scale===5&&Number.isSafeInteger(r.ratingCount)&&r.ratingCount>0&&Number.isFinite(Date.parse(r.observedAt));}catch{return false;}
 });
 if(!safe.length)return '';
 return `<section id="puntuaciones" class="prof-public__panel prof-public__external" aria-label="Puntuaciones en ProfeMatch"><h2>Puntuaciones en ProfeMatch</h2><p class="prof-public__muted">Escala de 1 a 5. No se suma a la nota de Campus.</p><div class="prof-public__external-list">${safe.map(r=>`<article><div class="prof-public__external-row"><h3>${e(r.courseLabel??'Curso no indicado en la fuente')}</h3><strong>${e(r.score)}<small> / 5</small></strong></div><p class="prof-public__help">${e(r.ratingCount)} ${r.ratingCount===1?'valoración reportada':'valoraciones reportadas'} · ${e(new Intl.DateTimeFormat('es-PE',{day:'numeric',month:'short',year:'numeric',timeZone:'America/Lima'}).format(new Date(r.observedAt)))}</p><a href="${e(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">Ver fuente en ProfeMatch ${icon('arrow-up-right')}<span class="visually-hidden"> (abre en otra pestaña)</span></a>${r.comments?.length?`<a href="#profematch-${e(r.sourceId)}-comments">Leer ${r.comments.length} ${r.comments.length===1?'comentario':'comentarios'} ${icon('message-circle')}</a>`:''}</article>`).join('')}</div></section>`;
}

// Keep the verified published snapshot while the companion backend rolls out.
// A successful live response (including an empty one) always takes precedence.
export function withProfeMatchSnapshots(ratings=[],professor){
 return ratings.map(r=>{
  if(r.commentsStatus==='available')return r;
  const snapshot=matchedComments(professor,r);
  return snapshot?{...r,commentsStatus:'snapshot',commentsObservedAt:snapshot.observedAt,comments:snapshot.comments.map(c=>({...c,repliesStatus:'unavailable',replies:[]}))}:r;
 });
}
export function profeMatchCommentsSection(ratings=[]){
 const sources=ratings.filter(r=>externalRatingsSection([r]));
 if(!sources.length)return '';
 return `<section id="resenas-profematch" class="prof-public__catalog"><h2>${icon('message-circle')} Comentarios de ProfeMatch</h2><p class="prof-public__muted">Opiniones publicadas en ProfeMatch · Puntuaciones de 1 a 5.</p>${sources.map(r=>{
  const comments=Array.isArray(r.comments)?r.comments.filter(c=>typeof c.text==='string'&&c.text.trim()&&Number.isInteger(c.rating)&&c.rating>=1&&c.rating<=5):[];
  const sourceLink=`<a href="${e(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">Ver comentarios en ProfeMatch ${icon('arrow-up-right')}<span class="visually-hidden"> (abre en otra pestaña)</span></a>`;
  return `<details class="prof-public__catalog-details prof-public__profematch-comments"><summary><span>${e(r.courseLabel??'Curso no indicado')}<small>${['available','snapshot'].includes(r.commentsStatus)?`${comments.length} ${comments.length===1?'comentario disponible':'comentarios disponibles'}`:'Ver fuente original'}</small></span>${icon('arrow-down')}</summary><div id="profematch-${e(r.sourceId)}-comments"><div class="prof-public__source-links">${sourceLink}</div>${r.commentsStatus==='snapshot'?`<p class="prof-public__help">Copia consultada el ${e(new Intl.DateTimeFormat('es-PE',{day:'numeric',month:'short',year:'numeric',timeZone:'America/Lima'}).format(new Date(r.commentsObservedAt)))}. Las respuestas actuales se consultan en ProfeMatch.</p>`:''}${comments.map(c=>`<article class="prof-public__review" ${/^profematch-\d+-review-\d+$/.test(c.id??'')?`id="${c.id}"`:''}>${reviewHeader('Estudiante de ProfeMatch',c.rating,5)}<div class="prof-public__chips"><span>${e(r.courseLabel??'Curso no indicado')}</span></div><p class="prof-public__comment">${e(c.text)}</p>${c.dateLabel?`<footer>${e(c.dateLabel)}</footer>`:''}${externalThread(c,r.sourceUrl)}<a class="prof-public__text-button" href="${e(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">Responder en ProfeMatch ${icon('arrow-up-right')}<span class="visually-hidden"> (abre en otra pestaña)</span></a></article>`).join('')}${!comments.length?`<p class="prof-public__help">${r.commentsStatus==='available'?'No hay comentarios de texto disponibles en esta página.':'No pudimos cargar los comentarios de esta fuente. Puedes leerlos en ProfeMatch.'}</p>`:''}</div></details>`;
 }).join('')}</section>`;
}

export function catalogReviewCard(r){
 if(typeof r.text!=='string'||!r.text.trim())return '';
 const date=r.date?new Date(r.date):null;
 const dateText=date&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('es-PE',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(date):'';
 return `<article class="prof-public__review">${reviewHeader('Estudiante de MisProfesores',r.rating,10)}${r.course?`<div class="prof-public__chips"><span>${e(r.course)}</span><span>${r.courseStatus==='linked'?'Curso del catálogo':'Curso indicado en la fuente'}</span></div>`:''}<p class="prof-public__comment">${e(r.text)}</p>${dateText?`<footer>${e(dateText)}</footer>`:''}</article>`;
}
export function catalogReviewsSection(data){
 const catalog=data.catalogReviews;
 if(!catalog?.stats?.reviewCount)return '';
 const sources=(catalog.sourceUrls??[]).filter(value=>{try{const u=new URL(value);return u.origin==='https://peru.misprofesores.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/profesores\/[A-Za-z0-9-]+_[0-9]+\/?$/.test(u.pathname);}catch{return false;}});
 if(!sources.length)return '';
 return `<section id="resenas-catalogo" class="prof-public__catalog"><h2>${icon('message-circle')} Reseñas de MisProfesores</h2><p class="prof-public__muted">Fuente externa · Escala de 0 a 10, independiente de Campus.</p><div class="prof-public__summary"><span>${icon('message-circle')}<strong>${catalog.stats.reviewCount}</strong> valoraciones de MisProfesores</span>${catalog.stats.ratingCount?`<span>${icon('star')}<strong>${e(catalog.stats.averageRating)}/10</strong> media de ${catalog.stats.ratingCount} puntuaciones</span>`:''}</div><p class="prof-public__help">${catalog.stats.commentCount??catalog.reviews.filter(r=>r.text).length} comentarios públicos disponibles. Las puntuaciones sin comentario solo se incluyen en la media y el total.</p><div class="prof-public__source-links">${sources.map((url,i)=>`<a href="${e(url)}" target="_blank" rel="noopener noreferrer">Ver fuente en MisProfesores${sources.length>1?` (${i+1})`:''} ${icon('arrow-up-right')}<span class="visually-hidden"> (abre en otra pestaña)</span></a>`).join('')}</div>${(catalog.stats.commentCount??catalog.reviews.filter(r=>r.text).length)>0?`<details class="prof-public__catalog-details" ${data.catalogBefore?'open':''}><summary>Leer comentarios de MisProfesores ${icon('arrow-down')}</summary>${data.catalogBefore?link(`${professorPath(data.professor.slug)}#resenas-catalogo`,`${icon('arrow-left')} Volver a los primeros comentarios`):''}${catalog.reviews.map(catalogReviewCard).join('')}${catalog.nextCursor?link(`${professorPath(data.professor.slug)}?before=${catalog.nextCursor}#resenas-catalogo`,`Leer más comentarios de MisProfesores ${icon('arrow-right')}`,'prof-public__more'):''}</details>`:''}</section>`;
}

export function directoryBody(data){
 const pageURL=n=>`/profes/upc/?${new URLSearchParams({...data.query?{q:data.query}:{},...n>1?{page:String(n)}:{}})}`;
 return `<nav class="prof-public__crumbs">${link('/profes/resenas/','Reseñas de estudiantes')}${icon('arrow-right')}<span>Profesores UPC</span></nav><header><p class="prof-public__eyebrow">${icon('graduation-cap')} Catálogo de profesores</p><h1>Encuentra a tu profesor UPC</h1><p>Busca su ficha, consulta sus cursos y ciclos, y lee opiniones de estudiantes.</p></header><form class="prof-public__search" action="/profes/upc/" method="get"><label for="catalog-query">Nombre del profesor o del curso</label><div><input id="catalog-query" name="q" type="search" maxlength="100" value="${e(data.query)}" placeholder="Ej. Morales o Cálculo"><button class="button">${icon('search')} Buscar</button></div></form><p class="prof-public__muted">${e(data.total.toLocaleString('es-PE'))} ${data.total===1?'profesor':'profesores'}${data.query?(data.total===1?' que coincide con tu búsqueda':' que coinciden con tu búsqueda'):' en el catálogo'}. Opiniones y puntuaciones de todas las fuentes aparecen en una sola ficha.</p><section class="prof-public__directory" aria-label="Profesores encontrados">${data.professors.map(p=>{const count=Number(p.publicRatingSourceCount??0),average=p.publicAverageRating==null?null:Number(p.publicAverageRating);return `<article><span class="prof-public__avatar">${icon('graduation-cap')}</span><div><h2>${link(professorPath(p.slug),e(p.name))}</h2><p>${p.courses.length?e(p.courses.join(' · ')):'Cursos por completar'}</p><small>${count&&average!=null?`${starRow(average)} ${e(displayScore(average))}/10 · ${count} ${count===1?'fuente':'fuentes'}`:'Aún sin puntuaciones públicas'}</small></div>${link(professorPath(p.slug),`${icon('arrow-right')}<span class="visually-hidden">Ver ficha de ${e(p.name)}</span>`)}</article>`;}).join('')||'<p>No encontramos profesores. Prueba con otro apellido o curso.</p>'}</section><nav class="prof-public__pagination" aria-label="Páginas de profesores">${data.page>1?link(pageURL(data.page-1),`${icon('arrow-left')} Anterior`):'<span></span>'}<span>Página ${data.page} de ${data.pages}</span>${data.page<data.pages?link(pageURL(data.page+1),`Siguiente ${icon('arrow-right')}`):'<span></span>'}</nav>`;
}
export function bannerTermLabel(term){
 const match=String(term).match(/^(\d{4})(10|20)$/);
 return match?`${match[1]}-${match[2]==='10'?'1':'2'}`:String(term);
}
export function bannerCoursesSection(bannerCourses,catalogCourses=[]){
 const groups=new Map(),used=new Set();
 for(const course of bannerCourses??[]){
  if(!groups.has(course.term))groups.set(course.term,[]);
  groups.get(course.term).push(course);
  if(course.code)used.add(String(course.code).toLowerCase());
 }
 const content=[...groups].sort(([a],[b])=>String(b).localeCompare(String(a))).map(([term,items])=>
  `<div class="prof-public__banner-term"><h3>${icon('calendar-days')} Ciclo ${e(bannerTermLabel(term))}</h3><ul class="prof-public__courses">${items.map(course=>`<li><strong>${e(course.name)}</strong><small>${e(course.code)}</small></li>`).join('')}</ul></div>`).join('');
 const other=(catalogCourses??[]).filter(course=>!((course.code&&used.has(String(course.code).toLowerCase()))||(!course.code&&(bannerCourses??[]).some(b=>normalizeLabel(b.name)===normalizeLabel(course.name)))));
 const otherHTML=other.length?`<details class="prof-public__catalog-details"><summary>Otros cursos asociados${icon('arrow-down')}</summary><ul class="prof-public__courses">${other.map(course=>`<li><strong>${e(course.name)}</strong>${course.code?`<small>${e(course.code)}</small>`:''}</li>`).join('')}</ul></details>`:'';
 const unavailable=!Array.isArray(bannerCourses);
 const empty=!content&&!otherHTML;
 return `<section id="cursos" class="prof-public__panel prof-public__banner-courses"><h2>${icon('book-open')} Cursos</h2>${content?`<p class="prof-public__help">Cursos organizados por ciclo; cada ficha muestra el código registrado.</p>${content}`:''}${otherHTML}${empty?`<p class="prof-public__help">${unavailable?'No pudimos cargar los cursos de este profesor.':'Aún no hay cursos asociados a este profesor.'}</p>`:''}</section>`;
}
const normalizeLabel=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

function combinedRating(data,ratings){
 const means=[];
 const campus=data.stats;
 if(Number(campus?.ratingCount)>0&&Number.isFinite(Number(campus.averageRating)))means.push(Number(campus.averageRating));
 const catalog=data.catalogReviews?.stats;
 if(Number(catalog?.ratingCount)>0&&Number.isFinite(Number(catalog.averageRating)))means.push(Number(catalog.averageRating));
 const safe=(ratings??[]).filter(r=>externalRatingsSection([r]));
 const externalCount=safe.reduce((sum,r)=>sum+Number(r.ratingCount),0);
 const externalSum=safe.reduce((sum,r)=>sum+Number(r.score)*2*Number(r.ratingCount),0);
 if(externalCount)means.push(externalSum/externalCount);
 return {average:means.length?means.reduce((sum,value)=>sum+value,0)/means.length:null,sourceCount:means.length};
}

function validReviewSourceURL(url,source){
 try{const value=new URL(url);if(value.username||value.password||value.search||value.hash)return false;
  if(source==='MisProfesores')return value.origin==='https://peru.misprofesores.com'&&/^\/profesores\/[A-Za-z0-9-]+_[0-9]+\/?$/.test(value.pathname);
  if(source==='ProfeMatch')return value.origin==='https://profematchperu.com'&&/^\/u\/upc\/profesor\/[1-9]\d*-[a-z0-9-]+\/?$/.test(value.pathname);
  return false;}catch{return false;}
}
function reviewDateOrder(value,label=''){
 const direct=Date.parse(value??'');if(Number.isFinite(direct))return direct;
 const months={enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11};
 const match=String(label).toLowerCase().match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) de (20\d{2})/);
 return match?Date.UTC(Number(match[2]),months[match[1]],1):0;
}
function publicDate(value){const input=String(value??''),date=new Date(input);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('es-PE',{day:'numeric',month:'short',year:'numeric',timeZone:/^\d{4}-\d{2}-\d{2}$/.test(input)?'UTC':'America/Lima'}).format(date):'';}
function unifiedReviewItems(data,ratings){
 const items=[];
 const sourceUrls=data.catalogReviews?.sourceUrls??[];
 for(const review of data.reviews??[])if(typeof review.text==='string'&&review.text.trim())items.push({source:'Campus',sources:['Campus'],identity:review.id==null?null:`Campus:${review.id}`,rating:review.rating,text:review.text,course:review.course,term:review.term,date:review.createdAt,order:reviewDateOrder(review.createdAt),native:review,urls:[]});
 const catalogComments=(data.catalogReviews?.reviews??[]).filter(review=>typeof review.text==='string'&&review.text.trim());
 for(const review of catalogComments)items.push({source:'MisProfesores',sources:['MisProfesores'],identity:review.id==null?null:`MisProfesores:${review.id}`,rating:review.rating,text:review.text,course:review.course,date:review.date,dateLabel:review.date,order:reviewDateOrder(review.date),urls:sourceUrls.filter(url=>validReviewSourceURL(url,'MisProfesores'))});
 const catalogStats=data.catalogReviews?.stats;
 if(!catalogComments.length&&Number(catalogStats?.ratingCount)>0&&Number.isFinite(Number(catalogStats.averageRating)))items.push({source:'MisProfesores',sources:['MisProfesores'],identity:'MisProfesores:aggregate',rating:Number(catalogStats.averageRating),course:'',summary:true,ratingCount:Number(catalogStats.ratingCount),order:0,urls:sourceUrls.filter(url=>validReviewSourceURL(url,'MisProfesores'))});
 for(const source of (ratings??[]).filter(r=>externalRatingsSection([r]))){
  const comments=(source.comments??[]).filter(comment=>typeof comment.text==='string'&&comment.text.trim()&&Number.isInteger(Number(comment.rating))&&Number(comment.rating)>=1&&Number(comment.rating)<=5);
  if(!comments.length)items.push({source:'ProfeMatch',sources:['ProfeMatch'],identity:`ProfeMatch:aggregate:${source.sourceId}`,rating:Number(source.score)*2,course:source.courseLabel,summary:true,ratingCount:Number(source.ratingCount),date:source.observedAt,order:reviewDateOrder(source.observedAt),url:source.sourceUrl});
  for(const comment of comments){
  items.push({source:'ProfeMatch',sources:['ProfeMatch'],identity:comment.id?`ProfeMatch:${comment.id}`:null,rating:Number(comment.rating)*2,text:comment.text,course:source.courseLabel,dateLabel:comment.dateLabel,order:reviewDateOrder(null,comment.dateLabel),url:source.sourceUrl,comment});
  }
 }
 const unique=[],seen=new Set();
 for(const item of items){
  const key=item.identity;
  if(key&&seen.has(key))continue;
  if(key)seen.add(key);
  unique.push(item);
 }
 return unique.sort((a,b)=>b.order-a.order);
}
function unifiedReviewCard(item){
 const labels=item.sources.join(' · '),sources=`<span class="prof-public__review-source">Fuente: ${e(labels)}</span>`;
 const links=[...(item.urls??[]),...(item.url?[item.url]:[])].filter((url,index,list)=>list.indexOf(url)===index);
 const sourceLinks=links.map(url=>{const source=url.includes('profematchperu.com')?'ProfeMatch':'MisProfesores';if(!validReviewSourceURL(url,source))return '';return `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">Ver fuente en ${e(source)} ${icon('arrow-up-right')}<span class="visually-hidden"> (abre en otra pestaña)</span></a>`;}).join('');
 if(item.native)return reviewCard({...item.native}, {profile:true,sourceLabel:labels,sourceLinks});
 const date=item.dateLabel||item.date?publicDate(item.dateLabel||item.date)||String(item.dateLabel||item.date):'';
 const chips=`<div class="prof-public__chips">${item.course?`<span>${e(item.course)}</span>`:''}${item.term?`<span>Ciclo ${e(item.term)}</span>`:''}${sources}</div>`;
 const replies=item.comment?externalThread(item.comment,item.url):'';
 const summary=item.summary?`<p class="prof-public__help">Media de ${e(item.ratingCount)} ${item.ratingCount===1?'valoración':'valoraciones'}${date?` · Consultada el ${e(date)}`:''}.</p>`:`<p class="prof-public__comment">${e(item.text)}</p>`;
 const replyLink=item.comment&&item.source==='ProfeMatch'&&validReviewSourceURL(item.url,'ProfeMatch')?`<a href="${e(item.url)}" target="_blank" rel="noopener noreferrer">Responder en ProfeMatch ${icon('arrow-up-right')}<span class="visually-hidden"> (abre en otra pestaña)</span></a>`:'';
 return `<article class="prof-public__review" ${item.comment?.id&&/^profematch-\d+-review-\d+$/.test(item.comment.id)?`id="${e(item.comment.id)}"`:''}>${reviewHeader(item.summary?'Puntuación media':'Estudiante',item.rating,10)}${chips}${summary}${date&&!item.summary?`<footer>${e(date)}</footer>`:''}${replies}${sourceLinks||replyLink?`<div class="prof-public__source-links">${sourceLinks}${replyLink}</div>`:''}</article>`;
}
function profileReviewsSection(data,ratings){
 const items=unifiedReviewItems(data,ratings),count=items.filter(item=>!item.summary).length,summaryCount=items.length-count;
 const catalog=data.catalogReviews,returnLink=data.catalogBefore?link(`${professorPath(data.professor.slug)}#resenas`,`${icon('arrow-left')} Volver a las opiniones recientes`):'';
 const more=catalog?.nextCursor?link(`${professorPath(data.professor.slug)}?before=${catalog.nextCursor}#resenas`,`Leer más opiniones ${icon('arrow-right')}`,'prof-public__more'):'';
 const references=[...(catalog?.sourceUrls??[]).filter(url=>validReviewSourceURL(url,'MisProfesores')).map(url=>({url,source:'MisProfesores'})),...(ratings??[]).filter(r=>externalRatingsSection([r])).map(r=>({url:r.sourceUrl,source:'ProfeMatch'}))];
 const referenceHTML=references.filter((item,index)=>references.findIndex(other=>other.url===item.url)===index).map(item=>`<a href="${e(item.url)}" target="_blank" rel="noopener noreferrer">Ver fuente en ${e(item.source)} ${icon('arrow-up-right')}<span class="visually-hidden"> (abre en otra pestaña)</span></a>`).join('');
 const unavailable=(ratings??[]).filter(r=>externalRatingsSection([r])&&r.commentsStatus==='unavailable').map(r=>`<p class="prof-public__help">No pudimos mostrar los comentarios de ProfeMatch. ${validReviewSourceURL(r.sourceUrl,'ProfeMatch')?`<a href="${e(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">Ver la fuente ${icon('arrow-up-right')}</a>`:''}</p>`).join('');
 const visibleLabel=`${count} ${count===1?'opinión':'opiniones'}${summaryCount?` · ${summaryCount} ${summaryCount===1?'puntuación agregada':'puntuaciones agregadas'}`:''}`;
 return `<section id="resenas" class="prof-public__native"><div class="prof-public__section-heading"><h2>Opiniones y puntuaciones</h2><span class="prof-public__help">${visibleLabel}</span></div><p class="prof-public__muted">Reunimos comentarios de Campus, MisProfesores y ProfeMatch en una sola lista. Las puntuaciones se muestran en una escala común de 0 a 10 y cada opinión conserva su fuente.</p>${referenceHTML?`<div class="prof-public__source-links">${referenceHTML}</div>`:''}<a class="prof-public__compose" href="${writingURL(data.professor.slug)}"><span class="prof-public__review-avatar">${icon('user')}</span><span>¿Cómo te fue con este profesor?</span>${icon('arrow-right')}</a>${returnLink}<div class="prof-public__unified-reviews" data-profile-reviews data-professor-id="${data.professor.id}">${items.map(unifiedReviewCard).join('')||`<div class="prof-public__empty"><h3>Esta ficha aún no tiene comentarios públicos</h3><p>Tu experiencia puede ayudar a quien está por matricularse.</p>${link(writingURL(data.professor.slug),'Escribir la primera reseña','button')}</div>`}</div>${data.nextCursor?`<button class="prof-public__more" data-profile-more data-cursor="${data.nextCursor}">Leer más opiniones de Campus</button><p data-profile-status role="status"></p>`:''}${more}${unavailable}</section>`;
}
export function profileBody(data){
 const p=data.professor,ratings=withProfeMatchSnapshots(data.externalRatings,p),score=combinedRating(data,ratings);
 return `<div class="prof-public__profile" data-professor-profile>
 <nav class="prof-public__crumbs" aria-label="Ruta de navegación">${link('/profes/upc/',`${icon('arrow-left')} Profesores UPC`)}<span>/</span><span>${e(p.name)}</span></nav>
 <header class="prof-public__profile-header"><div><p class="prof-public__eyebrow">Profesor · UPC</p><h1>${e(p.name)}</h1><p class="prof-public__muted">Experiencias de estudiantes para elegir mejor.</p><div class="prof-public__summary"><span>${score.average===null?icon('star'):`${starRow(score.average)} <strong>${e(displayScore(score.average))}/10</strong>`}${score.average===null?'Sin puntuaciones públicas':'promedio conjunto de fuentes'}</span><span>${score.sourceCount} ${score.sourceCount===1?'fuente':'fuentes'} con puntuaciones</span></div></div><div class="prof-public__header-actions">${link(writingURL(p.slug),`${icon('file-text')} Escribir una reseña`,'button')}<span class="prof-public__help">Tu nombre no se muestra.</span></div></header>
 <nav class="prof-public__section-nav" aria-label="En esta ficha">${link('#resenas','Opiniones y puntuaciones')}${link('#cursos','Cursos')}</nav>
 <div class="prof-public__columns"><div class="prof-public__feed">${profileReviewsSection(data,ratings)}</div>
 <aside class="prof-public__sidebar" aria-label="Información del profesor">${bannerCoursesSection(data.bannerCourses,data.courses)}<section class="prof-public__panel prof-public__about"><h2>Sobre estas opiniones</h2><p>Las reseñas y respuestas de Campus se escriben con una cuenta. El nombre del estudiante es privado.</p><p class="prof-public__muted">El promedio combina las fuentes en escala de 0 a 10; las notas de 1 a 5 se convierten proporcionalmente. Cada opinión indica su fuente.</p></section>
 </aside></div></div>`;
}
export function formBody(data,{preview=false}={}){
 const p=data.professor,path=professorPath(p.slug);
 return `<nav class="prof-public__crumbs">${link(path,e(p.name))}${icon('arrow-right')}<span>Escribir una reseña</span></nav><header><p class="prof-public__eyebrow">${icon('file-text')} Reseña de estudiante</p><h1>Cuenta cómo te fue</h1><p>Tu experiencia con <strong>${e(p.name)}</strong> puede ayudar a otro estudiante.</p></header><div class="prof-public__form-layout" data-review-form-root data-professor-id="${p.id}" data-professor-slug="${e(p.slug)}" ${preview?'data-preview="true"':''}>${preview?'<p class="prof-public__preview" role="note">Vista previa interactiva · Puedes recorrer el formulario completo. El envío se simula y no guarda reseñas.</p>':''}<ol class="prof-public__progress" aria-label="Pasos de la reseña"><li data-review-step="1"><span>1</span>Profesor</li><li data-review-step="2"><span>2</span>Tu experiencia</li><li data-review-step="3"><span>3</span>Revisar</li></ol><div class="prof-public__panel" data-review-gate><p role="status">Comprobando tu cuenta…</p></div><form class="prof-public__panel prof-public__form" data-review-editor hidden><div class="prof-public__chosen">${icon('graduation-cap')}<div><small>Profesor elegido · UPC</small><strong>${e(p.name)}</strong></div>${link('/profes/upc/','Cambiar')}</div><label for="review-course">Curso <small>(opcional)</small></label><select id="review-course" name="courseId"><option value="">Selecciona el curso que llevaste</option>${data.courses.map(c=>`<option value="${c.id}">${e(c.name)}${c.code?` (${e(c.code)})`:''}</option>`).join('')}</select><p class="prof-public__help">Si no aparece tu curso, puedes mencionarlo en el texto.</p><label for="review-experience">Tu experiencia <span aria-hidden="true">*</span></label><textarea id="review-experience" name="text" required minlength="10" maxlength="1500" rows="6" aria-describedby="review-text-help" placeholder="¿Cómo explica? ¿Cómo evalúa? ¿Qué te sirvió para aprender?"></textarea><p class="prof-public__help" id="review-text-help">De 10 a 1500 caracteres. Cuenta una experiencia propia y evita insultos, correos o teléfonos.</p><div class="prof-public__form-two"><div><label for="review-rating">Valoración al profesor <small>(opcional)</small></label><input id="review-rating" name="rating" type="number" min="0" max="10" step="0.5" placeholder="De 0 a 10" aria-describedby="rating-help"></div><div><label for="review-term">Ciclo <small>(opcional)</small></label><input id="review-term" name="term" pattern="20[0-9]{2}-[0123]" maxlength="6" placeholder="Ej. 2026-2"></div></div><p class="prof-public__help" id="rating-help">0 = muy mala experiencia · 10 = excelente. No es tu nota del curso.</p><p class="prof-public__privacy">${icon('lock-keyhole')} Publicamos tu reseña sin mostrar tu nombre, correo o teléfono de la cuenta.</p><button class="button" type="submit">${icon('eye')} Revisar mi reseña</button></form><section class="prof-public__panel" data-review-confirm hidden><h2>Revisa antes de enviar</h2><p class="prof-public__muted">Comprueba el profesor, el curso y lo que quieres compartir.</p><h3>${e(p.name)}</h3><p data-review-context></p><blockquote data-review-text></blockquote><p data-review-score></p><p>Al confirmar, compartes esta experiencia para que otros estudiantes puedan leerla en Campus. Tu nombre no se muestra públicamente.</p><div class="prof-public__form-actions"><button type="button" data-review-edit>${icon('arrow-left')} Editar</button><button class="button" data-review-submit type="button">${icon('check')} Confirmar y enviar</button></div></section><section class="prof-public__panel" data-review-done hidden><span class="prof-public__success">${icon('check')}</span><h2 data-review-done-title>Reseña recibida</h2><p data-review-done-message></p>${link(path,`Volver a la ficha del profesor ${icon('arrow-right')}`,'button')}</section><p class="prof-public__error" data-review-error role="alert" hidden></p><p class="prof-public__muted">La cuenta identifica a quien escribe. Cada estudiante declara qué curso llevó.</p></div>`;
}
export function renderPublicPage(template,{body,title,description,canonical,noindex=false}){
 return template.replaceAll('__CAMPUS_PUBLIC_BODY__',body).replaceAll('__CAMPUS_PUBLIC_TITLE__',e(title)).replaceAll('__CAMPUS_PUBLIC_DESCRIPTION__',e(description)).replaceAll('__CAMPUS_PUBLIC_CANONICAL__',e(canonical)).replace('index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',noindex?'noindex,follow':'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
}
