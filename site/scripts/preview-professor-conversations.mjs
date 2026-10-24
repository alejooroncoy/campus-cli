/** Local preview. Reads public profiles; all writes stay in memory. */
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {professorsPage} from '../api/professors.js';
const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const port=Number(process.env.PORT||4397);let origin=`http://127.0.0.1:${port}`;
const fixture=process.env.PROFESSOR_PREVIEW_FIXTURE?JSON.parse(await readFile(process.env.PROFESSOR_PREVIEW_FIXTURE,'utf8')):null;
// Fixture mode must stay offline even if a future route accidentally calls fetch.
if(fixture)globalThis.fetch=async()=>{console.error('Blocked outbound fetch in fixture preview');throw new Error('Fixture preview is offline');};
const replies=new Map(Object.entries(fixture?.repliesByReview??{})),keys=new Map();let serial=Math.max(0,...Array.from(replies.values()).flat().map(reply=>reply.id));
const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.html':'text/html'};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,origin),path=url.pathname;
 const json=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
 try{
  if(path==='/api/app/session/')return json(200,{authenticated:true,universityConfirmed:true,university:{shortName:'UPC'}});
  const match=path.match(/^\/api\/app\/profes\/reviews\/(\d+)\/replies\/$/);
  if(match){
   const id=match[1],items=replies.get(id)||[];
   if(req.method==='GET'){const after=Number(url.searchParams.get('after')||0),page=items.filter(r=>r.id>after);return json(200,{count:items.length,replies:page.slice(0,20),nextCursor:page.length>20?page[19].id:null});}
   if(req.method==='POST'){
    if(req.headers.origin!==origin)return json(403,{error:'Origen inválido.'});
    let body='';for await(const chunk of req){body+=chunk;if(body.length>6500)return json(413,{error:'Respuesta demasiado larga.'});}
    const input=JSON.parse(body);if(typeof input.text!=='string'||input.text.trim().length<2||input.text.length>1000||typeof input.requestId!=='string')return json(400,{error:'Respuesta inválida.'});
    if(/@|9(?:[\s-]*\d){8}/.test(input.text))return json(422,{error:'Quita correos y teléfonos antes de publicar.'});
    if(!keys.has(input.requestId)){const reply={id:++serial,text:input.text,authorLabel:'Estudiante de Campus',createdAt:new Date().toISOString()};items.push(reply);replies.set(id,items);keys.set(input.requestId,reply.id);}
    return json(201,{replyId:keys.get(input.requestId),heldForModeration:false,message:'Respuesta de prueba guardada solo en memoria.'});
   }
  }
  if(path.startsWith('/api/'))return json(404,{error:'Esta vista previa no permite otras operaciones.'});
  if(req.method!=='GET')return json(405,{error:'Método no permitido.'});
  if(path.startsWith('/profes/upc/')){
   const response=await professorsPage(new Request(url),{preview:true,fetchData:async(target,options)=>{
    if(fixture)return Response.json(structuredClone(fixture.profile));
    const response=await fetch(target,options);if(!response.ok)return response;
    const data=await response.json();
    if(Array.isArray(data.externalRatings)){
     let snapshot={};try{snapshot=JSON.parse(await readFile(process.env.PROFEMATCH_PREVIEW_FILE||new URL('../../output/professor-conversations/profematch-preview.json',import.meta.url),'utf8'));}catch{}
     data.externalRatings=data.externalRatings.map(r=>({...r,...snapshot[r.sourceUrl]}));
    }
    return Response.json(data);
   }});
   let html=await response.text();
   html=html.replace('<main id="professor-content"',`<div style="max-width:1120px;margin:12px auto;padding:10px 16px;background:#fff8df;color:#665523;font:13px/1.5 sans-serif;border-radius:8px">${fixture?'PRUEBA LOCAL · Todos los comentarios y respuestas son ficticios. Los envíos se guardan solo en memoria.':'Vista previa local · Las respuestas de prueba se guardan solo en memoria. No se publica nada en Campus.'}</div><main id="professor-content"`);
   res.writeHead(response.status,{...Object.fromEntries(response.headers),'cache-control':'no-store','x-robots-tag':'noindex'});res.end(html);return;
  }
  let file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep))return json(404,{});
  if((await stat(file)).isDirectory())file=resolve(file,'index.html');
  res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(await readFile(file));
 }catch{json(503,{error:'No pudimos cargar la vista previa.'});}
});
server.listen(port,'127.0.0.1',()=>{origin=`http://127.0.0.1:${server.address().port}`;console.log(`${origin}/profes/upc/${fixture?.profile.professor.slug??'juan-carlos-morales-arevalo'}/`);});
