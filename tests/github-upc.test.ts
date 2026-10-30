import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error módulo .mjs sin tipos
import {parseOrgLogin,classifyAndDedupe,createClient,RateLimitError,buildRecord} from '../scripts/lib/github-upc.mjs';

test('parseOrgLogin lee el patrón normal y los typos', () => {
  assert.deepEqual(parseOrgLogin('upc-pre-202620-si728-16365-thropic'), {cycle:'202620',course:'SI728',nrc:'16365',team:'thropic'});
  assert.deepEqual(parseOrgLogin('upc-pre-202620-1asi0730-ahsp'), {cycle:'202620',course:'SI730',nrc:null,team:'ahsp'});
  assert.equal(parseOrgLogin('upc-pre-202620-1asiO730-8155')?.course, 'SI730');
  assert.equal(parseOrgLogin('upc-pre-202620-1asii0729-1')?.course, 'SI729');
  assert.equal(parseOrgLogin('otra-org'), null);
  assert.equal(parseOrgLogin('upc-pre-202620'), null);
});

const rec=(org:string,repo:string,readme:string)=>buildRecord({org,repo:{name:repo,description:null},readme,now:'t'});

test('classifyAndDedupe guarda plantillas una vez y conserva informes', () => {
  const rows=[
    ...['a','b','c'].map(t=>rec(`upc-pre-202620-1asi0730-${t}`,'catch-up','# Catch up')),
    rec('upc-pre-202620-si728-16365-thropic','talki-project-report','# Talki'),
    rec('upc-pre-202620-si728-16365-thropic','mi-app','# App'),
  ];
  const out=classifyAndDedupe(rows);
  assert.equal(out.length,3);
  const tpl=out.find((r:any)=>r.kind==='template');
  assert.deepEqual(tpl.orgs.length,3);
  assert.equal(out.find((r:any)=>r.repo==='talki-project-report').kind,'report');
  assert.equal(out.find((r:any)=>r.repo==='mi-app').kind,'project');
});

test('el cliente corta en 403/429 y devuelve null en 404', async () => {
  const mk=(status:number)=>createClient({token:'x',sleep:async()=>{},fetchImpl:(async()=>new Response('{}',{status,headers:{'x-ratelimit-reset':'1'}})) as any});
  await assert.rejects(()=>mk(429).readme('o','r'),RateLimitError);
  await assert.rejects(()=>mk(403).listRepos('o'),RateLimitError);
  assert.equal(await mk(404).readme('o','r'),null);
});

test('el cliente pagina hasta una página incompleta', async () => {
  const pages=[Array.from({length:100},(_,i)=>({name:`r${i}`})),[{name:'last'}]];
  let n=0;
  const c=createClient({token:'x',sleep:async()=>{},fetchImpl:(async()=>Response.json(pages[n++])) as any});
  assert.equal((await c.listRepos('o')).length,101);
});
