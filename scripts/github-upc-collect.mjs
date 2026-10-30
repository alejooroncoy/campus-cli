// Recolecta repos públicos y README de las organizaciones UPC (upc-pre-<ciclo>-...) para la biblioteca.
// Solo escribe archivos locales en outputs/github-upc/ (ignorado por git: son datos de estudiantes).
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {createClient,parseOrgLogin,buildRecord,classifyAndDedupe,RateLimitError} from './lib/github-upc.mjs';

const {values:o}=parseArgs({options:{
 cycles:{type:'string',default:'202520,202610,202620'},
 org:{type:'string',multiple:true},
 'max-orgs':{type:'string'},
 out:{type:'string',default:'outputs/github-upc'},
}});
const token=process.env.GITHUB_TOKEN||(()=>{try{return execFileSync('gh',['auth','token'],{encoding:'utf8'}).trim();}catch{return '';}})();
if(!token)throw new Error('Falta GITHUB_TOKEN o `gh auth login` (sin token la cuota es de 60 por hora).');
const client=createClient({token});
const cycles=o.cycles.split(',').map(s=>s.trim()).filter(Boolean);
await mkdir(o.out,{recursive:true});

const manifest={schemaVersion:1,generatedAt:new Date().toISOString(),note:'Material público de sus autores; conservar source_url como atribución.',cycles:{},errors:[],complete:true};
for(const cycle of cycles){
 const file=`${o.out}/repos-${cycle}.jsonl`;
 const done=new Set();
 const raw=[];
 try{for(const line of (await readFile(`${file}.raw`,'utf8')).split('\n').filter(Boolean)){const r=JSON.parse(line);raw.push(r);done.add(`${r.org}/${r.repo}`);}}catch{}
 let orgs=o.org?.length?o.org.filter(x=>parseOrgLogin(x)?.cycle===cycle):await client.searchOrgs(cycle);
 orgs=orgs.filter(l=>parseOrgLogin(l)?.cycle===cycle);
 if(o['max-orgs'])orgs=orgs.slice(0,Number(o['max-orgs']));
 try{
  for(const org of orgs){
   for(const repo of await client.listRepos(org)){
    if(done.has(`${org}/${repo.name}`))continue;
    const readme=await client.readme(org,repo.name);
    if(readme==null)continue;
    raw.push(buildRecord({org,repo,readme,now:new Date().toISOString()}));
   }
   await writeFile(`${file}.raw.tmp`,raw.map(r=>JSON.stringify(r)).join('\n')+'\n');await rename(`${file}.raw.tmp`,`${file}.raw`);
  }
 }catch(e){
  manifest.complete=false;manifest.errors.push({cycle,message:e.message});
  if(!(e instanceof RateLimitError))console.error(e.message);
 }
 const records=classifyAndDedupe(raw);
 await writeFile(`${file}.tmp`,records.map(r=>JSON.stringify(r)).join('\n')+(records.length?'\n':''));await rename(`${file}.tmp`,file);
 const kinds={};for(const r of records)kinds[r.kind]=(kinds[r.kind]||0)+1;
 manifest.cycles[cycle]={orgs:orgs.length,records:records.length,kinds};
 console.log(JSON.stringify({cycle,...manifest.cycles[cycle]}));
 if(!manifest.complete)break;
}
await writeFile(`${o.out}/manifest.json.tmp`,JSON.stringify(manifest,null,2)+'\n');await rename(`${o.out}/manifest.json.tmp`,`${o.out}/manifest.json`);
if(!manifest.complete)process.exitCode=1;
