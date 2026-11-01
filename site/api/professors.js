import {readFile} from 'node:fs/promises';
import {validSlug,professorPath,directoryBody,profileBody,formBody,renderPublicPage,reviewCard,isIndexableProfile,profileSEO,INDEXABLE_MIN_COMMENTS,SUBSTANTIVE_COMMENT_CHARS} from '../src/lib/professor-pages.mjs';
import {profeMatchCommentCounts} from '../src/lib/profematch-excerpts.mjs';
const origin='https://campuscli.com';
export async function professorsPage(request,{fetchData=fetch,loadTemplate=()=>readFile(new URL('../.generated/professors.html',import.meta.url),'utf8'),preview=false}={}){
 const url=new URL(request.url),path=(url.searchParams.get('route')||url.pathname).replace(/\/?$/,url.pathname.endsWith('.xml')||url.searchParams.get('route')?.endsWith('.xml')?'':'/');
 if(!['GET','HEAD'].includes(request.method))return new Response('Método no permitido',{status:405,headers:{Allow:'GET, HEAD'}});
 const match=path.match(/^\/profes\/upc\/([a-z0-9-]+)\/(escribir\/)?$/);
 const community=path==='/profes/resenas/';
 const legacy=community&&url.searchParams.has('professorId');
 const sitemap=path==='/profes/sitemap.xml';
 const directory=path==='/profes/upc/';
 if(!directory&&!sitemap&&!community&&(!match||!validSlug(match[1])))return new Response('Página no encontrada',{status:404});
 const params=new URLSearchParams();
 if(community&&!legacy){
  try{const upstream=new URL('/api/app/profes/community/',process.env.CAMPUS_REVIEWS_API_ORIGIN||'https://profes.campuscli.com');upstream.searchParams.set('q',url.searchParams.get('q')??'');
   const result=await fetchData(upstream,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'error'});if(!result.ok)throw new Error();const data=await result.json();
   let html=await readFile(new URL('../.generated/community.html',import.meta.url),'utf8');
   html=html.replace('</head>','<link rel="stylesheet" href="/native-professor-pages.css"></head>').replace(/(<div[^>]*data-native-list[^>]*>)(<\/div>)/,'$1<div class="prof-public" style="padding:0">'+data.reviews.map(reviewCard).join('')+'</div>$2');
   if(url.searchParams.get('q'))html=html.replace('index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1','noindex,follow');
   return new Response(request.method==='HEAD'?null:html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=30'}});
  }catch{return new Response('No pudimos cargar las reseñas. Vuelve a intentarlo.',{status:503,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});}
 }
 if(legacy){const id=url.searchParams.get('professorId');if(!/^[1-9]\d{0,8}$/.test(id??''))return new Response('Profesor no encontrado',{status:404});params.set('id',id);}
 else if(match){params.set('slug',match[1]);if(url.searchParams.has('before'))params.set('before',url.searchParams.get('before'));}
 else if(sitemap)params.set('view','sitemap');
 else{params.set('q',url.searchParams.get('q')??'');params.set('page',url.searchParams.get('page')??'1');}
 try{
  const api=new URL('/api/app/profes/public/',process.env.CAMPUS_REVIEWS_API_ORIGIN||'https://profes.campuscli.com');api.search=params.toString();
  const result=await fetchData(api,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!result.ok)return new Response(result.status===404?'Profesor o página no encontrados':'No pudimos cargar esta página. Vuelve a intentarlo.',{status:[400,404].includes(result.status)?result.status:503,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
  const data=await result.json();
  if(legacy)return new Response(null,{status:308,headers:{Location:professorPath(data.professor.slug)}});
  if(sitemap){
   const xml=`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/profes/upc/</loc></url>${indexableProfessors(data.professors).map(p=>`<url><loc>${origin}${professorPath(p.slug)}</loc>${/^\d{4}-\d{2}-\d{2}$/.test(p.modified??'')?`<lastmod>${p.modified}</lastmod>`:''}</url>`).join('')}</urlset>`;
   return new Response(request.method==='HEAD'?null:xml,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300'}});
  }
  const write=!!match?.[2];
  if(match)data.catalogBefore=url.searchParams.has('before');
  if(match&&(!data.professor||!validSlug(data.professor.slug)||data.professor.slug!==match[1]||!Array.isArray(data.reviews)||!Array.isArray(data.courses)))throw new Error('invalid profile');
  if(directory&&!Array.isArray(data.professors))throw new Error('invalid directory');
  const canonical=directory?`${origin}/profes/upc/${data.page>1?`?page=${data.page}`:''}`:`${origin}${professorPath(data.professor.slug)}${write?'escribir/':''}`;
  const seo=match&&!write?profileSEO(data):null;
  const title=directory?'Profesores UPC: cursos y reseñas de estudiantes | Campus':write?`Escribe tu reseña de ${data.professor.name} | Campus`:seo.title;
  const description=directory?'Busca profesores UPC por nombre o curso. Lee reseñas de estudiantes y comparte tu experiencia en Campus.':write?`Cuenta cómo te fue con ${data.professor.name}, profesor UPC. Tu nombre no se muestra.`:seo.description;
  let html=renderPublicPage(await loadTemplate(),{title,description,canonical,body:directory?directoryBody(data):write?formBody(data,{preview}):profileBody(data),noindex:write||url.searchParams.has('before')||!!url.searchParams.get('q')||(!directory&&!write&&!isIndexableProfile(data))});
  if(match&&!write){
   const schema={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
    {'@type':'ListItem',position:1,name:'Profesores UPC',item:origin+'/profes/upc/'},
    {'@type':'ListItem',position:2,name:data.professor.name,item:canonical}]};
   // ProfilePage + Person: describe quién es la ficha sin marcar reseñas ni valoraciones, que Google restringe.
   const profile={'@context':'https://schema.org','@type':'ProfilePage',url:canonical,name:seo.title,description:seo.description,
    mainEntity:{'@type':'Person',name:data.professor.name,jobTitle:'Profesor',worksFor:{'@type':'CollegeOrUniversity',name:'Universidad Peruana de Ciencias Aplicadas (UPC)'}}};
   const blocks=[schema,...(isIndexableProfile(data)?[profile]:[])].map(item=>`<script type="application/ld+json">${JSON.stringify(item).replaceAll('<','\\u003c')}</script>`).join('');
   html=html.replace('</head>',`${blocks}</head>`);
  }
  return new Response(request.method==='HEAD'?null:html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':write?'no-store':'public, max-age=30','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response('No pudimos cargar esta página. Vuelve a intentarlo.',{status:503,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});}
}
export default {fetch:professorsPage};

/** Fichas que el sitio indexaría: comentarios del backend más los del snapshot de ProfeMatch, si su ficha está vinculada. */
export function indexableProfessors(rows=[],{minComments=INDEXABLE_MIN_COMMENTS,counts=profeMatchCommentCounts(SUBSTANTIVE_COMMENT_CHARS)}={}){
 return rows.filter(p=>validSlug(p.slug)&&Number(p.comments??0)+(p.profematch?counts.get(p.slug)??0:0)>=minComments);
}
