import corpus from '../data/profematch-excerpts.json' with {type:'json'};
const normalize=s=>String(s??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
/** A snapshot never establishes identity: the live backend must still confirm it. */
export function matchedComments(professor,rating,profiles=corpus.profiles){
 if(!professor||rating.source!=='profematch')return null;
 const record=profiles.find(p=>p.sourceId===String(rating.sourceId)&&p.sourceUrl===rating.sourceUrl&&p.professorId===professor.id&&p.professorSlug===professor.slug&&normalize(p.courseLabel)===normalize(rating.courseLabel));
 if(!record||!Number.isFinite(Date.parse(record.observedAt))||!Array.isArray(record.comments))return null;
 const seen=new Set();
 const comments=record.comments.filter(c=>{
  if(typeof c.text!=='string'||!c.text.trim()||c.truncated!==false||c.sourceUrl!==record.sourceUrl||!/^\w{20}$/.test(c.id)||seen.has(c.id)||!Number.isInteger(c.rating)||c.rating<1||c.rating>5)return false;
  seen.add(c.id);return true;
 });
 return comments.length?{...record,comments}:null;
}
/** Match an existing catalog course exactly; HCI/IHC and other aliases are not guessed. */
export function courseSourceRatings(course,ratings=[]){
 return ratings.filter(r=>r.source==='profematch'&&normalize(r.courseLabel)===normalize(course.name)&&/^\d+$/.test(String(r.sourceId)));
}

/** Comentarios válidos del snapshot por slug, para decidir el sitemap sin abrir cada ficha. */
/** Comentarios del snapshot por ficha y fuente («slug|sourceId»): una fuente ya sincronizada no los usa. */
export function profeMatchSourceCommentCounts(minChars=0,profiles=corpus.profiles){
 const counts=new Map();
 for(const record of profiles){
  if(!record||typeof record.professorSlug!=='string'||!Array.isArray(record.comments)||!Number.isFinite(Date.parse(record.observedAt)))continue;
  const key=`${record.professorSlug}|${record.sourceId}`,seen=new Set();
  for(const c of record.comments){
   if(typeof c.text!=='string'||c.text.trim().length<minChars||c.truncated!==false||c.sourceUrl!==record.sourceUrl||!/^\w{20}$/.test(c.id)||seen.has(c.id)||!Number.isInteger(c.rating)||c.rating<1||c.rating>5)continue;
   seen.add(c.id);counts.set(key,(counts.get(key)??0)+1);
  }
 }
 return counts;
}
export function profeMatchCommentCounts(minChars=0,profiles=corpus.profiles){
 const counts=new Map();
 for(const record of profiles){
  if(!record||typeof record.professorSlug!=='string'||!Array.isArray(record.comments)||!Number.isFinite(Date.parse(record.observedAt)))continue;
  const seen=new Set();
  for(const c of record.comments){
   if(typeof c.text!=='string'||c.text.trim().length<minChars||c.truncated!==false||c.sourceUrl!==record.sourceUrl||!/^\w{20}$/.test(c.id)||seen.has(c.id)||!Number.isInteger(c.rating)||c.rating<1||c.rating>5)continue;
   seen.add(c.id);counts.set(record.professorSlug,(counts.get(record.professorSlug)??0)+1);
  }
 }
 return counts;
}
