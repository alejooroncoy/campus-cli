import corpus from '../data/recomiendaprofe-reviews.json' with {type:'json'};
export const RECOMIENDA_PROFE_LABEL='Recomienda Profe';
const ORIGIN='https://recomienda-profe-upc-frontend.vercel.app';

/** Solo se aceptan enlaces a la ficha pública de un profesor en Recomienda Profe UPC. */
export function validRecomiendaProfeURL(url){
 try{const value=new URL(url);return value.origin===ORIGIN&&!value.username&&!value.password&&!value.search&&!value.hash&&/^\/profesores\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(value.pathname);}catch{return false;}
}
function validReview(r){
 return r&&/^[a-f0-9]{24}$/.test(r.id)&&typeof r.text==='string'&&r.text.trim()&&Number.isInteger(r.rating)&&r.rating>=1&&r.rating<=10&&Number.isFinite(Date.parse(r.createdAt));
}
/** Reseñas vinculadas a esta ficha. El id y el slug de Campus deben coincidir: el nombre no basta. */
export function recomiendaProfeReviews(professor,profiles=corpus.profiles){
 if(!professor)return null;
 const record=profiles.find(p=>p.professorId===professor.id&&p.professorSlug===professor.slug);
 if(!record||!validRecomiendaProfeURL(record.sourceUrl)||!Array.isArray(record.reviews))return null;
 const seen=new Set();
 const reviews=record.reviews.filter(r=>{if(!validReview(r)||seen.has(r.id))return false;seen.add(r.id);return true;});
 return reviews.length?{...record,reviews}:null;
}
/** Comentarios por slug para decidir el sitemap sin abrir cada ficha. */
export function recomiendaProfeCommentCounts(minChars=0,profiles=corpus.profiles){
 const counts=new Map();
 for(const record of profiles){
  if(!record||typeof record.professorSlug!=='string'||!validRecomiendaProfeURL(record.sourceUrl)||!Array.isArray(record.reviews))continue;
  const seen=new Set();
  for(const r of record.reviews){
   if(!validReview(r)||r.text.trim().length<minChars||seen.has(r.id))continue;
   seen.add(r.id);counts.set(record.professorSlug,(counts.get(record.professorSlug)??0)+1);
  }
 }
 return counts;
}
