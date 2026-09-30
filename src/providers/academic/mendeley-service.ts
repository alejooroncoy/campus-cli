import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
import { z } from 'zod';
import { normalizeDoi } from './research-service.js';
import { publicHttpsUrl, researchDownload, researchJson } from './research-http.js';

const origin = 'https://api.mendeley.com';
const mime = 'application/vnd.mendeley-document.1+json';
const groupMime = 'application/vnd.mendeley-group.1+json';
const folderMime = 'application/vnd.mendeley-folder.1+json';
const rawMaxBytes = 20 * 1024 * 1024;
const rawHeaders = new Set(['accept','content-type','if-match','if-none-match','if-unmodified-since','content-disposition','link']);
const forbiddenQuery = /^(?:access_?token|refresh_?token|client_secret|authorization|password|code)$/i;
export type MendeleyRawRequest = {
  method:'GET'|'HEAD'|'POST'|'PUT'|'PATCH'|'DELETE'; path:string; query?:string;
  body?:string; bodyBase64?:string; sourceUrl?:string; contentType?:string;
  accept?:string; headers?:Record<string,string>;
};
function rawMediaType(pathname:string):string {
  if(/^\/folders\/[^/]+\/documents(?:\/|$)/.test(pathname)) return mime;
  const root=pathname.split('/')[1];
  return ({documents:mime,folders:folderMime,groups:groupMime,annotations:'application/vnd.mendeley-annotation.1+json',files:'application/vnd.mendeley-file.1+json',profiles:'application/vnd.mendeley-profile.1+json'} as Record<string,string>)[root]||'application/json';
}
function rawUrl(path:string,query?:string):URL {
  if(!path.startsWith('/')||path.startsWith('//')||path.length>2048||/[\\?#\r\n]/.test(path)) throw new Error('Ruta Mendeley inválida. Usa una ruta relativa sin query.');
  const segments=path.split('/');
  for(const segment of segments) {
    let decoded:string;
    try{decoded=decodeURIComponent(segment);}catch{throw new Error('Ruta Mendeley inválida.');}
    if(decoded==='.'||decoded==='..'||decoded.includes('/')||decoded.includes('\\')) throw new Error('Ruta Mendeley no permitida.');
  }
  const url=new URL(path,origin);
  if(url.origin!==origin||decodeURIComponent(segments[1]||'').toLowerCase()==='oauth') throw new Error('Ruta Mendeley no permitida; OAuth se administra por separado.');
  if(query){
    if(query.length>8000||query.startsWith('?')||query.includes('#')) throw new Error('Query Mendeley inválida.');
    const params=new URLSearchParams(query);
    for(const key of params.keys()) if(forbiddenQuery.test(key)) throw new Error('No pases credenciales en la query Mendeley.');
    url.search=params.toString();
  }
  return url;
}
function rawHeaderValue(value:string):string {
  if(value.length>1000||/[\r\n\0]/.test(value)) throw new Error('Cabecera Mendeley inválida.');
  return value;
}
async function rawResponseBytes(response:Response):Promise<Buffer> {
  if(Number(response.headers.get('content-length'))>rawMaxBytes) throw new Error('La respuesta Mendeley supera 20 MB.');
  if(!response.body) return Buffer.alloc(0);
  const parts:Buffer[]=[];let size=0;
  for await(const part of response.body){
    const bytes=Buffer.from(part);size+=bytes.length;
    if(size>rawMaxBytes){await response.body.cancel().catch(()=>undefined);throw new Error('La respuesta Mendeley supera 20 MB.');}
    parts.push(bytes);
  }
  return Buffer.concat(parts,size);
}
const tokensSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), expires_at: z.number() });
export type MendeleyTokens = z.infer<typeof tokensSchema>;
export interface MendeleyTokenStore { load(): Promise<MendeleyTokens>; save(tokens: MendeleyTokens): Promise<void>; withRefreshLock?<T>(action:()=>Promise<T>):Promise<T> }
/** For a local single-user process only. Hosted callers must inject a user-specific store. */
export class LocalMendeleyTokenStore implements MendeleyTokenStore {
  constructor(private file = process.env.MENDELEY_TOKEN_FILE || join(homedir(), '.campus-cli', 'mendeley-tokens.json')) {}
  async load() { try { return tokensSchema.parse(JSON.parse(await readFile(this.file, 'utf8'))); } catch { throw new Error('Conecta primero tu cuenta Mendeley con campus-mendeley-connect.'); } }
  async save(tokens: MendeleyTokens) {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = this.file + '.' + randomUUID() + '.tmp';
    await writeFile(temp, JSON.stringify(tokensSchema.parse(tokens)), { mode: 0o600, flag: 'wx' });
    await rename(temp, this.file);
  }
  async withRefreshLock<T>(action:()=>Promise<T>):Promise<T> {
    const release=await lockfile.lock(this.file,{realpath:false,stale:30_000,update:5_000,retries:{retries:40,minTimeout:50,maxTimeout:250,randomize:true}});
    try{return await action();}finally{await release();}
  }
}
const documentSchema = z.object({ id:z.string(), title:z.string().optional(), websites:z.array(z.string()).optional(), identifiers:z.object({doi:z.string().optional()}).passthrough().optional() }).passthrough();
const groupSchema = z.object({ id:z.string().uuid(), name:z.string().min(1), role:z.string().optional() }).passthrough();
const folderSchema = z.object({ id:z.string().uuid(), name:z.string().min(1), parent_id:z.string().nullable().optional(), group_id:z.string().uuid().nullable().optional() }).passthrough();
const documentIdSchema = z.union([z.string().uuid(),z.object({ id:z.string().uuid() }).passthrough()]);
const crossrefSchema = z.object({message:z.object({DOI:z.string(),title:z.array(z.string()).min(1),type:z.string(),author:z.array(z.object({given:z.string().optional(),family:z.string().optional(),name:z.string().optional()})).optional(),issued:z.object({'date-parts':z.array(z.array(z.number().nullable()))}).optional(),'container-title':z.array(z.string()).optional(),volume:z.string().optional(),issue:z.string().optional(),page:z.string().optional()})});
const referenceSchema = z.object({url:z.url().max(5000),title:z.string().trim().min(1).max(500),type:z.enum(['journal','book','generic','book_section','conference_proceedings','working_paper','report','web_page','thesis','magazine_article','newspaper_article']).default('journal'),source:z.string().trim().min(1).max(255).optional(),year:z.number().int().min(1000).max(3000).optional(),authors:z.array(z.object({first_name:z.string().trim().max(255).optional(),last_name:z.string().trim().min(1).max(255)})).max(100).optional(),groupId:z.string().uuid().optional()});
export type MendeleyReference = z.input<typeof referenceSchema>;
function withSourceCandidate(document:z.infer<typeof documentSchema>) {
  let doiUrl:string|null=null;
  if(document.identifiers?.doi) {
    try { doiUrl='https://doi.org/'+normalizeDoi(document.identifiers.doi); } catch { /* Malformed library DOI is not a source URL. */ }
  }
  const websites=(document.websites??[]).map(site=>{
    try{return site.length<=4000?publicHttpsUrl(site).toString():null;}catch{return null;}
  }).filter((site):site is string=>site!==null);
  const website=websites[0]??null;
  return {...document,websites,sourceUrlCandidate:doiUrl??website,
    sourceUrlBasis:doiUrl?'unverified_library_doi':website?'unverified_library_website':null,
    sourceUrlVerified:false};
}
function canonicalUrl(value:string) {
  const url=publicHttpsUrl(value);
  url.hash='';url.searchParams.sort();
  if(url.pathname.length>1) url.pathname=url.pathname.replace(/\/+$/,'');
  return url.toString();
}
function encodeCursor(url:string):string { return Buffer.from(url).toString('base64url'); }
function decodeCursor(cursor:string, pathname:string, groupId?:string):string {
  let url:URL;
  try { url=new URL(Buffer.from(z.string().min(1).max(8000).parse(cursor),'base64url').toString('utf8')); } catch { throw new Error('Cursor Mendeley inválido.'); }
  const limit = Number(url.searchParams.get('limit'));
  if(url.origin!==origin || url.pathname!==pathname || (groupId === undefined ? url.searchParams.has('group_id') : url.searchParams.get('group_id')!==groupId) || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Cursor Mendeley no permitido.');
  return url.toString();
}
export class MendeleyService {
  private queue: Promise<unknown> = Promise.resolve();
  private refresh?: Promise<string>;
  constructor(private store:MendeleyTokenStore, private env:NodeJS.ProcessEnv=process.env,
    private request:typeof fetch=fetch, private metadata:typeof researchJson=researchJson) {}
  private async accessToken(force=false):Promise<string> {
    if(this.refresh) return this.refresh;
    const t=await this.store.load();
    // Another caller may have started the refresh while this caller was loading
    // tokens. Reuse its promise so a rotating refresh token is never spent twice.
    if(this.refresh) return this.refresh;
    if(!force && t.expires_at>Date.now()+60000) return t.access_token;
    const renew=async()=>{
      const current=await this.store.load();
      if(!force && current.expires_at>Date.now()+60000) return current.access_token;
      const id=this.env.MENDELEY_CLIENT_ID,secret=this.env.MENDELEY_CLIENT_SECRET;
      if(!id||!secret) throw new Error('Faltan credenciales de la aplicación Mendeley.');
      let r:Response;
      try { r=await this.request(origin+'/oauth/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Basic '+Buffer.from(id+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:current.refresh_token,redirect_uri:this.env.MENDELEY_REDIRECT_URI||'http://localhost:8765/mendeley/callback'})}); } catch { throw new Error('No se pudo renovar la conexión Mendeley.'); }
      if(!r.ok) throw new Error('Mendeley OAuth HTTP '+r.status+'; reconecta tu cuenta.');
      const n=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1).optional(),expires_in:z.number().positive()}).parse(await r.json());
      await this.store.save({access_token:n.access_token,refresh_token:n.refresh_token||current.refresh_token,expires_at:Date.now()+n.expires_in*1000});
      return n.access_token;
    };
    this.refresh=this.store.withRefreshLock?this.store.withRefreshLock(renew):renew();
    try {return await this.refresh;} finally {this.refresh=undefined;}
  }
  private async api(url:string,method='GET',body?:unknown,retry=true):Promise<{data:unknown,next:string|null}> {
    const parsed=new URL(url,origin);
    const documents=/^\/documents(?:\/|$)/.test(parsed.pathname);
    const groups=method==='GET' && /^\/groups(?:\/|$)/.test(parsed.pathname);
    const folders=method==='GET' && /^\/folders(?:\/|$)/.test(parsed.pathname);
    if(parsed.origin!==origin || (!documents&&!groups&&!folders)) throw new Error('Ruta Mendeley no permitida.');
    const token=await this.accessToken();
    let r:Response;
    const responseMime=groups?groupMime:folders && !parsed.pathname.endsWith('/documents')?folderMime:mime;
    try {r=await this.request(parsed.toString(),{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,Accept:responseMime,...(body?{'Content-Type':mime}:{})},...(body?{body:JSON.stringify(body)}:{})});} catch {throw new Error('Error de conexión Mendeley; comprueba la biblioteca antes de reintentar guardar.');}
    if(r.status===401&&retry){await this.accessToken(true);return this.api(url,method,body,false);}
    if(!r.ok) throw new Error('Mendeley HTTP '+r.status+(r.status===429?'; espera antes de reintentar.':'.'));
    const next=r.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1]||null;
    return {data:await r.json(),next};
  }
  async list(limit=20,cursor?:string) {z.number().int().min(1).max(100).parse(limit);const r=await this.api(cursor?decodeCursor(cursor,'/documents'):'/documents?limit='+limit);return {documents:z.array(documentSchema).parse(r.data).map(withSourceCandidate),documentRead:false,citationReady:false,hasMore:!!r.next,nextCursor:r.next?encodeCursor(r.next):null};}
  async listGroups(limit=20,cursor?:string) {z.number().int().min(1).max(100).parse(limit);const r=await this.api(cursor?decodeCursor(cursor,'/groups'):'/groups?limit='+limit);return {groups:z.array(groupSchema).parse(r.data),hasMore:!!r.next,nextCursor:r.next?encodeCursor(r.next):null};}
  async listFolders(groupId?:string,limit=20,cursor?:string) {
    const id=groupId?z.string().uuid().parse(groupId):undefined;z.number().int().min(1).max(100).parse(limit);
    const r=await this.api(cursor?decodeCursor(cursor,'/folders',id):'/folders?'+new URLSearchParams({...id?{group_id:id}:{},limit:String(limit)}));
    return {folders:z.array(folderSchema).parse(r.data),groupId:id??null,hasMore:!!r.next,nextCursor:r.next?encodeCursor(r.next):null};
  }
  async listFolderDocuments(folderId:string,limit=20,cursor?:string) {
    const id=z.string().uuid().parse(folderId);z.number().int().min(1).max(100).parse(limit);
    const path='/folders/'+id+'/documents';
    const r=await this.api(cursor?decodeCursor(cursor,path):path+'?limit='+limit);
    return {documentIds:z.array(documentIdSchema).parse(r.data).map(d=>typeof d==='string'?d:d.id),folderId:id,hasMore:!!r.next,nextCursor:r.next?encodeCursor(r.next):null};
  }
  async listGroupDocuments(groupId:string,limit=20,cursor?:string) {
    const id=z.string().uuid().parse(groupId);z.number().int().min(1).max(100).parse(limit);
    const r=await this.api(cursor?decodeCursor(cursor,'/documents',id):'/documents?'+new URLSearchParams({group_id:id,limit:String(limit)}));
    return {documents:z.array(documentSchema).parse(r.data).map(withSourceCandidate),documentRead:false,citationReady:false,hasMore:!!r.next,nextCursor:r.next?encodeCursor(r.next):null,groupId:id};
  }
  async get(id:string){z.string().uuid().parse(id);return {...withSourceCandidate(documentSchema.parse((await this.api('/documents/'+id)).data)),documentRead:false,citationReady:false};}
  rawApi(input:MendeleyRawRequest) {
    const run=()=>this.rawRequest(input);
    if(input.method==='GET'||input.method==='HEAD') return run();
    const result=this.queue.then(run);this.queue=result.catch(()=>undefined);return result;
  }
  private async rawRequest(input:MendeleyRawRequest) {
    const method=z.enum(['GET','HEAD','POST','PUT','PATCH','DELETE']).parse(input.method);
    const url=rawUrl(input.path,input.query);
    const sources=[input.body,input.bodyBase64,input.sourceUrl].filter(value=>value!==undefined);
    if(sources.length>1) throw new Error('Elige solo un origen para el cuerpo Mendeley.');
    if((method==='GET'||method==='HEAD')&&sources.length) throw new Error('GET y HEAD no aceptan cuerpo.');
    const headers:Record<string,string>={Accept:rawHeaderValue(input.accept||rawMediaType(url.pathname))};
    for(const [key,value] of Object.entries(input.headers||{})) {
      const lower=key.toLowerCase();
      if(!rawHeaders.has(lower)) throw new Error('Cabecera Mendeley no permitida: '+key);
      headers[lower]=rawHeaderValue(value);
    }
    let bytes:Buffer|undefined;
    if(input.body!==undefined) {
      bytes=Buffer.from(input.body,'utf8');
    } else if(input.bodyBase64!==undefined) {
      if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.bodyBase64)) throw new Error('Cuerpo base64 Mendeley inválido.');
      bytes=Buffer.from(input.bodyBase64,'base64');
    } else if(input.sourceUrl!==undefined) {
      const downloaded=await researchDownload(input.sourceUrl,{maxBytes:rawMaxBytes,redirects:4,accept:'application/pdf, application/octet-stream;q=0.8'});
      bytes=downloaded.bytes;
      if(!input.contentType&&!headers['content-type']) headers['content-type']=rawHeaderValue(downloaded.contentType.split(';')[0]||'application/octet-stream');
    }
    if(bytes && bytes.length>rawMaxBytes) throw new Error('El cuerpo Mendeley supera 20 MB.');
    if(bytes&&!headers['content-type']) headers['content-type']=rawHeaderValue(input.contentType||((input.body!==undefined)?rawMediaType(url.pathname):'application/octet-stream'));
    if(input.contentType) headers['content-type']=rawHeaderValue(input.contentType);
    if(bytes&&/^application\/pdf(?:;|$)/i.test(headers['content-type'])&&bytes.subarray(0,1024).indexOf('%PDF-')<0) throw new Error('El archivo indicado no contiene una cabecera PDF.');
    const request=async(retry:boolean):Promise<Response>=>{
      const token=await this.accessToken();
      let response:Response;
      try {response=await this.request(url,{method,redirect:'manual',signal:AbortSignal.timeout(30_000),headers:{...headers,Authorization:'Bearer '+token},...(bytes?{body:new Uint8Array(bytes)}:{})});}
      catch {throw new Error('Error de conexión Mendeley. Comprueba el resultado antes de reintentar una escritura.');}
      if(response.status===401&&retry){await this.accessToken(true);return request(false);}
      return response;
    };
    const response=await request(true);
    if(response.status===429) throw new Error('Mendeley HTTP 429; espera antes de reintentar.');
    if(!response.ok&&response.status!==303) throw new Error('Mendeley HTTP '+response.status+'.');
    const location=response.headers.get('location');
    const safeLocation=location?publicHttpsUrl(new URL(location,url).toString()).toString():null;
    const type=response.headers.get('content-type')||'';
    const raw=response.status===303?Buffer.alloc(0):await rawResponseBytes(response);
    let data:unknown=null;
    if(raw.length){
      if(/(?:^|\/)\w+(?:[.+-]\w+)*\+json|\/json(?:;|$)/i.test(type)) {
        try{data=JSON.parse(raw.toString('utf8'));}catch{data=raw.toString('utf8');}
      } else if(/^text\//i.test(type)) data=raw.toString('utf8');
      else data={base64:raw.toString('base64'),encoding:'base64'};
    }
    const next=response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
    let nextPath:string|null=null,nextQuery:string|null=null;
    if(next){const nextUrl=new URL(next,url);if(nextUrl.origin===origin){nextPath=nextUrl.pathname;nextQuery=nextUrl.search.slice(1)||null;}}
    return {status:response.status,contentType:type||null,data,location:safeLocation,nextPath,nextQuery,
      etag:response.headers.get('etag'),lastModified:response.headers.get('last-modified')};
  }
  saveDoi(doi:string,groupId?:string) {
    const result=this.queue.then(()=>this.saveVerified(doi,groupId));this.queue=result.catch(()=>undefined);return result;
  }
  saveReference(reference:MendeleyReference) {
    const result=this.queue.then(()=>this.saveReferenceVerified(reference));this.queue=result.catch(()=>undefined);return result;
  }
  private async saveReferenceVerified(value:MendeleyReference) {
    const reference=referenceSchema.parse(value);
    const url=canonicalUrl(reference.url);
    if(reference.groupId) await this.ensureWritableGroup(reference.groupId);
    let pageUrl:string|null='/documents?'+new URLSearchParams({...reference.groupId?{group_id:reference.groupId}:{},limit:'500',view:'bib'});
    const seen=new Set<string>();
    for(let page=0;pageUrl && page<100;page++) {
      if(seen.has(pageUrl)) throw new Error('Paginación Mendeley repetida; no se guardó un duplicado.');seen.add(pageUrl);
      const response=await this.api(pageUrl);
      const existing=z.array(documentSchema).parse(response.data).find(d=>d.websites?.some(site=>{try{return canonicalUrl(site)===url;}catch{return false;}}));
      if(existing) return {documentRead:false,citationReady:false,status:'already_saved',document:existing,url,groupId:reference.groupId};
      pageUrl=response.next;
    }
    if(pageUrl) throw new Error('Biblioteca demasiado grande para comprobar duplicados; no se guardó.');
    const payload={title:reference.title,type:reference.type,websites:[url],...(reference.source?{source:reference.source}:{}),...(reference.year?{year:reference.year}:{}),...(reference.authors?{authors:reference.authors}:{})};
    const destination='/documents'+(reference.groupId?'?'+new URLSearchParams({group_id:reference.groupId}):'');
    const document=documentSchema.parse((await this.api(destination,'POST',payload)).data);
    return {documentRead:false,citationReady:false,status:'saved',document,url,groupId:reference.groupId,metadataSource:'user_provided',doi:'unconfirmed'};
  }
  private async ensureWritableGroup(groupId:string) {
    let url:string|null='/groups?limit=500';const seen=new Set<string>();
    for(let page=0;url && page<100;page++) {
      if(seen.has(url)) throw new Error('Paginación Mendeley repetida; no se pudo verificar el grupo.');seen.add(url);
      const r=await this.api(url);const group=z.array(groupSchema).parse(r.data).find(g=>g.id===groupId);
      if(group) {
        if(group.role==='follower') throw new Error('El grupo Mendeley es de solo lectura para este usuario.');
        return group;
      }
      url=r.next;
    }
    throw new Error('El grupo Mendeley no pertenece al usuario conectado.');
  }
  private async saveVerified(value:string,groupId?:string) {
    const doi=normalizeDoi(value);
    const targetGroup=groupId?z.string().uuid().parse(groupId):undefined;
    if(targetGroup) await this.ensureWritableGroup(targetGroup);
    // Check the full private library, never infer absence from just the first page.
    let url:string|null='/documents?'+new URLSearchParams({...targetGroup?{group_id:targetGroup}:{},limit:'500'});const seen=new Set<string>();
    for(let page=0;url && page<100;page++) {
      if(seen.has(url)) throw new Error('Paginación Mendeley repetida; no se guardó un duplicado.');seen.add(url);
      const r=await this.api(url);
      const existing=z.array(documentSchema).parse(r.data).find(d=>d.identifiers?.doi?.toLowerCase()===doi);
      if(existing) return {status:'already_saved',document:existing,doi,documentRead:false,citationReady:false,retractionStatus:'not_checked'};
      url=r.next;
    }
    if(url) throw new Error('Biblioteca demasiado grande para comprobar duplicados; no se guardó.');
    const w=crossrefSchema.parse(await this.metadata('https://api.crossref.org/works/'+encodeURIComponent(doi))).message;
    if(normalizeDoi(w.DOI)!==doi) throw new Error('El DOI recibido no coincide; no se guardó.');
    const year=w.issued?.['date-parts']?.[0]?.[0];
    const type:Record<string,string>={'journal-article':'journal','proceedings-article':'conference_proceedings',book:'book','book-chapter':'book_section',dissertation:'thesis',report:'report'};
    const payload={title:w.title[0],type:type[w.type]||'generic',identifiers:{doi},...(year?{year}:{}),source:w['container-title']?.[0],authors:w.author?.map(a=>({first_name:a.given||'',last_name:a.family||a.name||''})),volume:w.volume,issue:w.issue,pages:w.page,websites:['https://doi.org/'+doi]};
    const destination='/documents'+(targetGroup?'?'+new URLSearchParams({group_id:targetGroup}):'');
    const document=documentSchema.parse((await this.api(destination,'POST',payload)).data);
    return {documentRead:false,citationReady:false,status:'saved',doi,document,groupId:targetGroup,verifiedVia:'crossref',peerReview:'unknown'};
  }
}
