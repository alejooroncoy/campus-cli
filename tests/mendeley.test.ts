import assert from 'node:assert/strict';
import test from 'node:test';
import { MendeleyService, type MendeleyTokens } from '../src/providers/academic/mendeley-service.js';
import { registerMendeleyTools } from '../src/providers/academic/mendeley-mcp-tools.js';
const doi='10.1234/test';
function store(expired=false) {let t:MendeleyTokens={access_token:'private',refresh_token:'refresh',expires_at:expired?0:Date.now()+3600000};return {load:async()=>t,save:async(n:MendeleyTokens)=>{t=n;}};}
const json=(data:unknown,headers?:Record<string,string>,status=200)=>new Response(JSON.stringify(data),{status,headers});
const metadata=async()=>({message:{DOI:doi,title:['Verified title'],type:'journal-article',author:[{given:'Ana',family:'Perez'}],issued:{'date-parts':[[2024]]}}});
test('save verifies metadata, stores once and returns existing reference on repeat',async()=>{
 let docs:any[]=[];let writes=0;
 const s=new MendeleyService(store(),{},async(_u,init)=>{
  if(init?.method==='POST'){writes++;const d={id:'id1',...JSON.parse(init.body as string)};docs.push(d);return json(d,{},201);}
  return json(docs);
 },metadata);
 assert.equal((await s.saveDoi(doi)).status,'saved');
 assert.equal((await s.saveDoi(doi)).status,'already_saved');
 assert.equal(writes,1);assert.equal(docs[0].authors[0].last_name,'Perez');assert.equal(docs[0].title,'Verified title');
});
test('checks second page for duplicates',async()=>{
 let calls=0;const s=new MendeleyService(store(),{},async()=>++calls===1?json([],{link:'<https://api.mendeley.com/documents?limit=1&marker=next>; rel="next"'}):json([{id:'existing',identifiers:{doi}}]),metadata);
 assert.equal((await s.saveDoi(doi)).status,'already_saved');assert.equal(calls,2);
});
test('rejects a group continuation cursor in personal Mendeley listings',async()=>{
 const s=new MendeleyService(store(),{},async()=>json([]));
 const cursor=Buffer.from('https://api.mendeley.com/documents?group_id=123e4567-e89b-12d3-a456-426614174000&marker=next').toString('base64url');
 await assert.rejects(s.list(1,cursor),/Cursor Mendeley no permitido/);
});

test('lists every Mendeley page with an opaque, route-bound continuation cursor',async()=>{
 let calls=0;const s=new MendeleyService(store(),{},async u=>++calls===1?json([{id:'first'}],{link:'<https://api.mendeley.com/documents?limit=1&marker=next>; rel="next"'}):json([{id:'second'}]));
 const first=await s.list(1);
 assert.equal(first.hasMore,true);assert.ok(first.nextCursor);assert.doesNotMatch(first.nextCursor!,/api\.mendeley\.com/);
 const second=await s.list(1,first.nextCursor!);
 assert.equal(second.documents[0].id,'second');assert.equal(second.nextCursor,null);
 await assert.rejects(s.list(1,Buffer.from('https://api.mendeley.com/groups?marker=next').toString('base64url')),/Cursor Mendeley no permitido/);
});
test('lists groups and saves a DOI to a writable group without duplicating it',async()=>{
 const groupId='ec47684d-4e4b-3f12-ba38-01509619c415';let docs:any[]=[];let payload:any;let writeUrl='';
 const s=new MendeleyService(store(),{},async(u,init)=>{
  const url=String(u);
  if(url.includes('/groups?'))return json([{id:groupId,name:'Shared research',role:'normal'}]);
  if(init?.method==='POST'){writeUrl=url;payload=JSON.parse(init.body as string);const d={id:'group-doc',...payload};docs.push(d);return json(d,{},201);}
  if(url.includes('group_id='))return json(docs);
  return json([]);
 },metadata);
 assert.equal((await s.listGroups()).groups[0].name,'Shared research');
 assert.equal((await s.saveDoi(doi,groupId)).status,'saved');
 assert.equal(new URL(writeUrl).searchParams.get('group_id'),groupId);assert.equal(payload.group_id,undefined);
 assert.equal((await s.saveDoi(doi,groupId)).status,'already_saved');
});
test('saves metadata whose Crossref publication date has an unknown component', async () => {
 const s=new MendeleyService(store(),{},async(_u,init)=>init?.method==='POST' ? json({id:'id1'}, {}, 201) : json([]),
  async()=>({message:{DOI:doi,title:['Verified title'],type:'journal-article',issued:{'date-parts':[[2024,null]]}}}));
 assert.equal((await s.saveDoi(doi)).status,'saved');
});
test('does not write to an inaccessible or read-only group',async()=>{
 const groupId='ec47684d-4e4b-3f12-ba38-01509619c415';let writes=0;
 const s=new MendeleyService(store(),{},async(_u,init)=>{if(init?.method==='POST')writes++;return json([{id:groupId,name:'Read only',role:'follower'}]);},metadata);
 await assert.rejects(s.saveDoi(doi,groupId),/solo lectura/);assert.equal(writes,0);
});
test('does not send a token to a malicious pagination origin',async()=>{
 let calls=0;const s=new MendeleyService(store(),{},async()=>{calls++;return json([],{link:'<https://evil.example/documents>; rel="next"'});},metadata);
 await assert.rejects(s.saveDoi(doi),/Ruta Mendeley/);assert.equal(calls,1);
});
test('mismatched DOI stops before writing',async()=>{
 let writes=0;const s=new MendeleyService(store(),{},async(_u,init)=>{if(init?.method==='POST')writes++;return json([]);},async()=>({message:{DOI:'10.1234/other',title:['wrong'],type:'journal-article'}}));
 await assert.rejects(s.saveDoi(doi),/no coincide/);assert.equal(writes,0);
});
test('refreshes and persists rotated tokens before API request',async()=>{
 const st=store(true);const s=new MendeleyService(st,{MENDELEY_CLIENT_ID:'id',MENDELEY_CLIENT_SECRET:'secret'},async(u,init)=>{
  if(String(u).endsWith('/oauth/token'))return json({access_token:'new',refresh_token:'rotated',expires_in:3600});
  assert.equal((init?.headers as any).Authorization,'Bearer new');return json([]);
 });
 await s.list();assert.equal((await st.load()).refresh_token,'rotated');
});
test('concurrent expired-token reads share one rotating-token refresh',async()=>{
 const token:MendeleyTokens={access_token:'old',refresh_token:'refresh',expires_at:0};
 let loads=0,refreshes=0;
 const st={load:async()=>{loads++;await Promise.resolve();return token;},save:async(n:MendeleyTokens)=>Object.assign(token,n)};
 const s=new MendeleyService(st,{MENDELEY_CLIENT_ID:'id',MENDELEY_CLIENT_SECRET:'secret'},async(u)=>{
  if(String(u).endsWith('/oauth/token')){refreshes++;return json({access_token:'new',refresh_token:'rotated',expires_in:3600});}
  return json([]);
 });
 await Promise.all([s.list(),s.list()]);
 // The refresher reloads inside the lock so another process cannot rotate the
 // token between the preflight check and the OAuth exchange.
 assert.equal(loads,3);assert.equal(refreshes,1);
});
test('authorization fails before library operations and save is annotated as a write',async()=>{
 const tools=new Map<string,any>();registerMendeleyTools({registerTool:(n:any,s:any,h:any)=>tools.set(n,{s,h})} as any,{authorize:()=>false,service:{} as any});
 assert.equal(tools.get('campus_mendeley_save_doi').s.annotations.readOnlyHint,false);
 assert.equal(tools.get('campus_mendeley_list_groups').s.annotations.readOnlyHint,true);
 await assert.rejects(tools.get('campus_mendeley_save_doi').h({doi}),/No autorizado/);
});
