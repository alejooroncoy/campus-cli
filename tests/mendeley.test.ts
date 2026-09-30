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

test('lists group folders and paginates folder document IDs without crossing groups or folders',async()=>{
 const groupId='ec47684d-4e4b-3f12-ba38-01509619c415';
 const folderId='123e4567-e89b-12d3-a456-426614174000';
 const childId='123e4567-e89b-12d3-a456-426614174001';
 const documentId='123e4567-e89b-12d3-a456-426614174002';
 const urls:string[]=[];
 const s=new MendeleyService(store(),{},async(u,init)=>{
  const url=String(u);urls.push(url);
  if(url.includes('/folders?')){
   assert.equal((init?.headers as any).Accept,'application/vnd.mendeley-folder.1+json');
   return json([{id:folderId,name:'Pregunta 1',group_id:groupId},{id:childId,name:'Subcarpeta',parent_id:folderId,group_id:groupId}]);
  }
  assert.equal((init?.headers as any).Accept,'application/vnd.mendeley-document.1+json');
  return url.includes('marker=next')?json([documentId]):json([{id:documentId}],{link:`<https://api.mendeley.com/folders/${folderId}/documents?limit=1&marker=next>; rel="next"`});
 });
 const folders=await s.listFolders(groupId,100);
 assert.equal(new URL(urls[0]).searchParams.get('group_id'),groupId);
 assert.equal(folders.folders[1].parent_id,folderId);
 const first=await s.listFolderDocuments(folderId,1);
 assert.equal(first.hasMore,true);
 assert.deepEqual(first.documentIds,[documentId]);
 const second=await s.listFolderDocuments(folderId,1,first.nextCursor!);
 assert.deepEqual(second.documentIds,[documentId]);
 await assert.rejects(s.listFolderDocuments(childId,1,first.nextCursor!),/Cursor Mendeley no permitido/);
 await assert.rejects(s.listFolders(undefined,1,Buffer.from(`https://api.mendeley.com/folders?group_id=${groupId}&limit=1`).toString('base64url')),/Cursor Mendeley no permitido/);
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

test('saves a reference without DOI to a writable group and detects its URL on a later page',async()=>{
 const groupId='ec47684d-4e4b-3f12-ba38-01509619c415';
 const url='https://revistas.uh.cu/revflacso/article/view/7514';
 let docs:any[]=[];let writes=0;
 const s=new MendeleyService(store(),{},async(u,init)=>{
  const requestUrl=String(u);
  if(requestUrl.includes('/groups?'))return json([{id:groupId,name:'Research',role:'normal'}]);
  if(init?.method==='POST'){writes++;assert.equal(new URL(requestUrl).searchParams.get('group_id'),groupId);const d={id:'saved',...JSON.parse(init.body as string)};docs=[d];return json(d,{},201);}
  if(requestUrl.includes('marker=next'))return json(docs);
  if(requestUrl.includes('/documents?')){assert.equal(new URL(requestUrl).searchParams.get('view'),'bib');return json([],{link:'<https://api.mendeley.com/documents?marker=next>; rel="next"'});}
  return json([]);
 });
 const reference={url:url+'/',title:'Artículo verificado',source:'Revista de la Universidad de La Habana',groupId};
 assert.equal((await s.saveReference(reference)).status,'saved');
 assert.equal((await s.saveReference(reference)).status,'already_saved');
 assert.equal(writes,1);assert.equal(docs[0].websites[0],url);assert.equal(docs[0].group_id,undefined);
 assert.equal(docs[0].identifiers,undefined);
});

test('rejects unsafe reference URLs before writing',async()=>{
 let writes=0;const s=new MendeleyService(store(),{},async(_u,init)=>{if(init?.method==='POST')writes++;return json([]);});
 await assert.rejects(s.saveReference({url:'http://example.org/article',title:'Article'}),/HTTPS/);
 await assert.rejects(s.saveReference({url:'https://person:secret@example.org/article',title:'Article'}),/credenciales/);
 assert.equal(writes,0);
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
 assert.equal(tools.get('campus_mendeley_save_reference').s.annotations.readOnlyHint,false);
 assert.equal(tools.get('campus_mendeley_list_groups').s.annotations.readOnlyHint,true);
 assert.equal(tools.get('campus_mendeley_list_folders').s.annotations.readOnlyHint,true);
 assert.equal(tools.get('campus_mendeley_list_folder_documents').s.annotations.readOnlyHint,true);
 await assert.rejects(tools.get('campus_mendeley_save_doi').h({doi}),/No autorizado/);
 await assert.rejects(tools.get('campus_mendeley_save_reference').h({url:'https://example.org',title:'Article',type:'journal'}),/No autorizado/);
});

test('library listings identify records as metadata without processed document evidence',async()=>{
 const s=new MendeleyService(store(),{},async()=>json([{id:'record-1',title:'Catalog record'}]));
 const listed=await s.list();
 assert.equal(listed.documents.length,1);
 assert.equal(listed.documentRead,false);
 assert.equal(listed.citationReady,false);
});

test('Mendeley lists only safe source URL candidates and exposes them as MCP links',async()=>{
 const s=new MendeleyService(store(),{},async()=>json([
  {id:'doi-record',title:'DOI record',identifiers:{doi:'10.1234/ABC'},websites:['http://example.org/unsafe']},
  {id:'website-record',title:'Website record',websites:['https://127.0.0.1/private','https://journal.example.edu/article']},
  {id:'invalid-record',title:'Invalid record',identifiers:{doi:'not-a-doi'},websites:['https://localhost/private']},
 ]));
 const listed=await s.list();
 assert.equal(listed.documents[0].sourceUrlCandidate,'https://doi.org/10.1234/abc');
 assert.equal(listed.documents[0].sourceUrlBasis,'unverified_library_doi');
 assert.deepEqual(listed.documents[0].websites,[]);
 assert.equal(listed.documents[1].sourceUrlCandidate,'https://journal.example.edu/article');
 assert.equal(listed.documents[1].sourceUrlBasis,'unverified_library_website');
 assert.deepEqual(listed.documents[1].websites,['https://journal.example.edu/article']);
 assert.equal(listed.documents[2].sourceUrlCandidate,null);
 assert.deepEqual(listed.documents[2].websites,[]);
 assert.equal(listed.documents[2].sourceUrlVerified,false);
 assert.equal(listed.citationReady,false);
 const tools=new Map<string,any>();
 registerMendeleyTools({registerTool:(n:any,_schema:any,h:any)=>tools.set(n,h)} as any,
  {authorize:()=>true,service:s});
 const response=await tools.get('campus_mendeley_list')({limit:3});
 const links=response.content.filter((item:any)=>item.type==='resource_link').map((item:any)=>item.uri);
 assert.deepEqual(links,['https://doi.org/10.1234/abc','https://journal.example.edu/article']);
 assert.equal(response.content[0].type,'text');
 assert.equal(JSON.parse(response.content[0].text).citationReady,false);
});

test('raw API adds a document to a folder with the connected account and returns the provider status',async()=>{
 const folderId='123e4567-e89b-12d3-a456-426614174000';
 const documentId='123e4567-e89b-12d3-a456-426614174001';
 let calls=0;
 const s=new MendeleyService(store(),{},async(u,init)=>{
  calls++;assert.equal(String(u),`https://api.mendeley.com/folders/${folderId}/documents`);
  assert.equal(init?.method,'POST');
  assert.equal((init?.headers as any).Authorization,'Bearer private');
  assert.equal((init?.headers as any)['content-type'],'application/vnd.mendeley-document.1+json');
  assert.equal(Buffer.from(init?.body as Uint8Array).toString(),JSON.stringify({id:documentId}));
  return new Response(null,{status:201});
 });
 const result=await s.rawApi({method:'POST',path:`/folders/${folderId}/documents`,body:JSON.stringify({id:documentId})});
 assert.equal(result.status,201);assert.equal(calls,1);
});

test('raw API returns a reusable, same-host pagination path and query',async()=>{
 const s=new MendeleyService(store(),{},async()=>new Response('[]',{status:200,headers:{
  'content-type':'application/vnd.mendeley-folder.1+json',
  link:'<https://api.mendeley.com/folders?limit=2&marker=next>; rel="next"',
 }}));
 const result=await s.rawApi({method:'GET',path:'/folders',query:'limit=2'});
 assert.equal(result.nextPath,'/folders');
 assert.equal(result.nextQuery,'limit=2&marker=next');
 assert.deepEqual(result.data,[]);
});

test('raw API sends PDF bytes, returns a signed download redirect, and rejects unsafe routes',async()=>{
 let calls=0;
 const s=new MendeleyService(store(),{},async(u,init)=>{
  calls++;
  if(init?.method==='GET') {
   assert.equal(String(u),'https://api.mendeley.com/files/file-id');
   return new Response(null,{status:303,headers:{location:'https://files.example.org/document.pdf?signature=temporary'}});
  }
  assert.equal(String(u),'https://api.mendeley.com/files');
  assert.equal((init?.headers as any)['content-type'],'application/pdf');
  assert.equal(Buffer.from(init?.body as Uint8Array).toString(),'%PDF-1.7\nexample');
  return new Response(null,{status:201,headers:{location:'https://api.mendeley.com/files/file-id'}});
 });
 const result=await s.rawApi({method:'POST',path:'/files',bodyBase64:Buffer.from('%PDF-1.7\nexample').toString('base64'),contentType:'application/pdf'});
 assert.equal(result.status,201);
 assert.equal(result.location,'https://api.mendeley.com/files/file-id');
 const downloaded=await s.rawApi({method:'GET',path:'/files/file-id'});
 assert.equal(downloaded.location,'https://files.example.org/document.pdf?signature=temporary');
 await assert.rejects(s.rawApi({method:'GET',path:'//evil.example/files'}),/Ruta Mendeley/);
 await assert.rejects(s.rawApi({method:'POST',path:'/oauth/token',body:'x'}),/OAuth/);
 await assert.rejects(s.rawApi({method:'GET',path:'/documents',headers:{Authorization:'stolen'}}),/Cabecera Mendeley no permitida/);
 await assert.rejects(s.rawApi({method:'POST',path:'/files',bodyBase64:Buffer.from('not a PDF').toString('base64'),contentType:'application/pdf'}),/cabecera PDF/);
 assert.equal(calls,2);
});

test('raw API writes work without MCP elicitation and still require account authorization',async()=>{
 const tools=new Map<string,any>();let invoked=0;let annotations:any;
 registerMendeleyTools({registerTool:(name:any,config:any,handler:any)=>{tools.set(name,handler);if(name==='campus_mendeley_raw_api')annotations=config.annotations;}} as any,{
  authorize:()=>true,
  service:{rawApi:async()=>{invoked++;return {status:204};}} as any,
 });
 const raw=tools.get('campus_mendeley_raw_api');
 assert.notEqual((await raw({method:'GET',path:'/folders'})).isError,true);
 assert.equal(annotations.destructiveHint,true);
 assert.notEqual((await raw({method:'POST',path:'/files',bodyBase64:'JVBERi0=',contentType:'application/pdf'})).isError,true);
 assert.notEqual((await raw({method:'DELETE',path:'/folders/123e4567-e89b-12d3-a456-426614174000'})).isError,true);
 assert.equal(invoked,3);
 const denied=new Map<string,any>();
 registerMendeleyTools({registerTool:(name:any,_config:any,handler:any)=>denied.set(name,handler)} as any,{
  authorize:()=>false,service:{rawApi:async()=>{throw new Error('must not run');}} as any,
 });
 await assert.rejects(denied.get('campus_mendeley_raw_api')({method:'POST',path:'/folders',body:'{}'}),/No autorizado/);
});
