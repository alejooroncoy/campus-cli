import {load} from 'cheerio';
import {createHash} from 'node:crypto';
export const sourceURL = value => {
 const u = new URL(value);
 if(u.origin !== 'https://profematchperu.com' || u.username || u.password || u.search || u.hash || !/^\/u\/upc\/profesor\/[1-9]\d*-[a-z0-9-]+$/.test(u.pathname)) throw new Error('Invalid public UPC source URL');
 return u.href;
};
const normalized=s=>String(s??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const nameKey=s=>normalized(s).split(' ').sort().join(' ');
export function parseComments(html,match,observedAt=new Date().toISOString()){
 const url=sourceURL(match.source_url),id=new URL(url).pathname.match(/profesor\/(\d+)-/)[1];
 if(id!==String(match.source_id)||!Number.isSafeInteger(match.professor_id)||match.professor_id<1||!/^([a-z0-9]+-)*[a-z0-9]+$/.test(match.professor_slug))throw new Error('Invalid identity mapping');
 const $=load(html);
 if($('link[rel=canonical]').attr('href')!==url)throw new Error('Canonical changed');
 const person=$("script[type='application/ld+json']").toArray().map(n=>JSON.parse($(n).text())).find(p=>p['@type']==='Person');
 if(person?.worksFor?.name!=='Universidad Peruana de Ciencias Aplicadas'||nameKey(person?.name)!==nameKey(match.source_name))throw new Error('Source identity changed');
 const course=$('.lead').first().text().split(' en Universidad Peruana de Ciencias Aplicadas · ')[0].trim();
 if(normalized(course)!==normalized(match.raw_course))throw new Error('Source course changed');
 const stats=person.aggregateRating;
 const score=Number(stats?.ratingValue),count=Number(stats?.ratingCount);
 if(Number(stats?.bestRating)!==5||score<1||score>5||!Number.isFinite(score)||!Number.isSafeInteger(count)||count<1)throw new Error('Invalid ratings');
 const comments=[],seen=new Set();let emptyCount=0,withheldCount=0;
 for(const node of $('.cmt').toArray()){
  const raw=$(node).find('p').text().replace(/\s+/g,' ').trim();
  if(!raw||/^\[comentario esperando revisi[oó]n\]$/i.test(raw)){emptyCount++;continue;}
  // Do not make a public copy of contact details or executable/instruction content.
  if(/[^\s@]+@[^\s@]+\.[^\s@]+|(?:\+51[\s.-]*)?9(?:[\s.-]*\d){8}\b|<\/?script\b/i.test(raw)){withheldCount++;continue;}
  const meta=$(node).find('.fecha').text().trim(),rating=Number(meta.match(/^([1-5])★/)?.[1]);
  if(!Number.isInteger(rating))throw new Error('Unrecognized individual rating');
  const author=$(node).find('b').first().text().trim();
  const dateLabel=meta.split(' · ').at(-1);
  if(!dateLabel||dateLabel.length>80||!author||author.length>100)throw new Error('Unrecognized public review metadata');
  const key=createHash('sha256').update([id,author,meta,raw].join('\n')).digest('hex').slice(0,20);
  if(seen.has(key))continue;seen.add(key);
  comments.push({id:key,author,dateLabel,rating,recommends:!meta.includes('no lo recomienda'),text:raw,truncated:false,sourceUrl:url});
 }
 if(comments.length>count)throw new Error('More comments than ratings');
 return {sourceId:id,sourceUrl:url,professorId:match.professor_id,professorSlug:match.professor_slug,courseLabel:course,score,ratingCount:count,observedAt,comments,emptyCount,withheldCount};
}
