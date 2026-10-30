// Funciones puras para recolectar repos públicos de las organizaciones de cursos UPC en GitHub.
import {createHash} from 'node:crypto';

export const TEMPLATE_MIN_ORGS = 3;

// upc-pre-<ciclo>-<curso><nrc>-<equipo>, tolerante a mayúsculas y typos (1asiO730, 1asii0729).
export function parseOrgLogin(login){
 const m=/^upc-pre-(\d{6})-(.+)$/i.exec(String(login||''));
 if(!m)return null;
 const [head,...tail]=m[2].split('-');
 const c=/^1?([a-z]+?)([0-9o]*\d[0-9o]*)$/i.exec(head);
 if(!c)return null;
 const letters=c[1].toLowerCase().replace(/^a(?=si|cc)/,'').replace(/^(si)i+$/,'$1');
 const digits=c[2].replace(/o/gi,'0').replace(/^0+(?=\d)/,'');
 let nrc=null;let team=null;
 if(tail.length&&/^\d{4,6}$/.test(tail[0])){nrc=tail[0];team=tail.slice(1).join('-')||null;}
 else team=tail.join('-')||null;
 return {cycle:m[1],course:`${letters}${digits}`.toUpperCase(),nrc,team};
}

export const sha256=text=>createHash('sha256').update(text).digest('hex');

export function classifyRepo({name},orgsWithName=1){
 if(/report|informe/i.test(name))return 'report';
 return orgsWithName>=TEMPLATE_MIN_ORGS?'template':'project';
}

export function readmeTitle(markdown,fallback){
 const h=/^#\s+(.+?)\s*#*\s*$/m.exec(markdown||'');
 return (h?.[1]||fallback).trim();
}

export function buildRecord({org,repo,meta,readme,now}){
 const info=parseOrgLogin(org);
 return {
  source_url:`https://github.com/${org}/${repo.name}`,
  org,repo:repo.name,
  cycle:info?.cycle??null,course_code:info?.course??null,nrc:info?.nrc??null,team:info?.team??null,
  title:repo.description?.trim()||readmeTitle(readme,repo.name),
  summary:repo.description??null,
  readme_markdown:readme,
  readme_sha256:sha256(readme),
  pushed_at:repo.pushed_at??null,
  fetched_at:now,
  ...meta,
 };
}

// Clasifica con la frecuencia del nombre entre organizaciones y guarda cada plantilla una vez por README.
export function classifyAndDedupe(records){
 const orgsByName=new Map();
 for(const r of records){(orgsByName.get(r.repo)??orgsByName.set(r.repo,new Set()).get(r.repo)).add(r.org);}
 const out=[];const templates=new Map();
 for(const r of records){
  const kind=classifyRepo({name:r.repo},orgsByName.get(r.repo).size);
  if(kind!=='template'){out.push({...r,kind});continue;}
  const key=`${r.repo}:${r.readme_sha256}`;
  const t=templates.get(key);
  if(t)t.orgs.push(r.org);
  else templates.set(key,{...r,kind,orgs:[r.org]});
 }
 return [...out,...templates.values()];
}

export class RateLimitError extends Error{}

// Cliente mínimo; fetchImpl y sleep se inyectan para probarlo sin red.
export function createClient({token,fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),pauseMs=150,base='https://api.github.com'}){
 async function get(path,{raw=false}={}){
  await sleep(pauseMs);
  const res=await fetchImpl(`${base}${path}`,{signal:AbortSignal.timeout(20000),headers:{
   'User-Agent':'Campus-source-research/1.0 (+https://campuscli.com)',
   Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json',
   ...(token?{Authorization:`Bearer ${token}`}:{}),
  }});
  if(res.status===403||res.status===429)throw new RateLimitError(`HTTP ${res.status} en ${path} (reinicia después de ${res.headers.get('x-ratelimit-reset')||'?'})`);
  if(res.status===404)return null;
  if(!res.ok)throw new Error(`HTTP ${res.status} en ${path}`);
  return raw?res.text():res.json();
 }
 async function paginate(path,pick=x=>x){
  const items=[];
  for(let page=1;page<=10;page++){
   const data=await get(`${path}${path.includes('?')?'&':'?'}per_page=100&page=${page}`);
   const batch=pick(data)||[];
   items.push(...batch);
   if(batch.length<100)break;
  }
  return items;
 }
 return {
  get,
  searchOrgs:cycle=>paginate(`/search/users?q=${encodeURIComponent(`upc-pre-${cycle} type:org`)}`,d=>d.items).then(i=>i.map(o=>o.login)),
  listRepos:org=>paginate(`/orgs/${org}/repos?type=public`),
  readme:(org,repo)=>get(`/repos/${org}/${repo}/readme`,{raw:true}),
 };
}
