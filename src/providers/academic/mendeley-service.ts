import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { normalizeDoi } from './research-service.js';
import { researchJson } from './research-http.js';

const origin = 'https://api.mendeley.com';
const mime = 'application/vnd.mendeley-document.1+json';
const groupMime = 'application/vnd.mendeley-group.1+json';
const tokensSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), expires_at: z.number() });
export type MendeleyTokens = z.infer<typeof tokensSchema>;
export interface MendeleyTokenStore { load(): Promise<MendeleyTokens>; save(tokens: MendeleyTokens): Promise<void> }
/** For a local single-user process only. Hosted callers must inject a user-specific store. */
export class LocalMendeleyTokenStore implements MendeleyTokenStore {
  constructor(private file = process.env.MENDELEY_TOKEN_FILE || join(homedir(), '.campus-cli', 'mendeley-tokens.json')) {}
  async load() { try { return tokensSchema.parse(JSON.parse(await readFile(this.file, 'utf8'))); } catch { throw new Error('Conecta primero tu cuenta Mendeley con scripts/mendeley-connect.cjs.'); } }
  async save(tokens: MendeleyTokens) {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = this.file + '.' + randomUUID() + '.tmp';
    await writeFile(temp, JSON.stringify(tokensSchema.parse(tokens)), { mode: 0o600, flag: 'wx' });
    await rename(temp, this.file);
  }
}
const documentSchema = z.object({ id:z.string(), title:z.string().optional(), identifiers:z.object({doi:z.string().optional()}).passthrough().optional() }).passthrough();
const groupSchema = z.object({ id:z.string().uuid(), name:z.string().min(1), role:z.string().optional() }).passthrough();
const crossrefSchema = z.object({message:z.object({DOI:z.string(),title:z.array(z.string()).min(1),type:z.string(),author:z.array(z.object({given:z.string().optional(),family:z.string().optional(),name:z.string().optional()})).optional(),issued:z.object({'date-parts':z.array(z.array(z.number()))}).optional(),'container-title':z.array(z.string()).optional(),volume:z.string().optional(),issue:z.string().optional(),page:z.string().optional()})});
export class MendeleyService {
  private queue: Promise<unknown> = Promise.resolve();
  private refresh?: Promise<string>;
  constructor(private store:MendeleyTokenStore, private env:NodeJS.ProcessEnv=process.env,
    private request:typeof fetch=fetch, private metadata:typeof researchJson=researchJson) {}
  private async accessToken(force=false):Promise<string> {
    if(this.refresh) return this.refresh;
    const t=await this.store.load();
    if(!force && t.expires_at>Date.now()+60000) return t.access_token;
    this.refresh=(async()=>{
      const id=this.env.MENDELEY_CLIENT_ID,secret=this.env.MENDELEY_CLIENT_SECRET;
      if(!id||!secret) throw new Error('Faltan credenciales de la aplicación Mendeley.');
      let r:Response;
      try { r=await this.request(origin+'/oauth/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Basic '+Buffer.from(id+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:t.refresh_token,redirect_uri:this.env.MENDELEY_REDIRECT_URI||'http://localhost:8765/mendeley/callback'})}); } catch { throw new Error('No se pudo renovar la conexión Mendeley.'); }
      if(!r.ok) throw new Error('Mendeley OAuth HTTP '+r.status+'; reconecta tu cuenta.');
      const n=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1).optional(),expires_in:z.number().positive()}).parse(await r.json());
      await this.store.save({access_token:n.access_token,refresh_token:n.refresh_token||t.refresh_token,expires_at:Date.now()+n.expires_in*1000});
      return n.access_token;
    })();
    try {return await this.refresh;} finally {this.refresh=undefined;}
  }
  private async api(url:string,method='GET',body?:unknown,retry=true):Promise<{data:unknown,next:string|null}> {
    const parsed=new URL(url,origin);
    const documents=/^\/documents(?:\/|$)/.test(parsed.pathname);
    const groups=method==='GET' && /^\/groups(?:\/|$)/.test(parsed.pathname);
    if(parsed.origin!==origin || (!documents&&!groups)) throw new Error('Ruta Mendeley no permitida.');
    const token=await this.accessToken();
    let r:Response;
    const responseMime=groups?groupMime:mime;
    try {r=await this.request(parsed.toString(),{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,Accept:responseMime,...(body?{'Content-Type':mime}:{})},...(body?{body:JSON.stringify(body)}:{})});} catch {throw new Error('Error de conexión Mendeley; comprueba la biblioteca antes de reintentar guardar.');}
    if(r.status===401&&retry){await this.accessToken(true);return this.api(url,method,body,false);}
    if(!r.ok) throw new Error('Mendeley HTTP '+r.status+(r.status===429?'; espera antes de reintentar.':'.'));
    const next=r.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1]||null;
    return {data:await r.json(),next};
  }
  async list(limit=20) {z.number().int().min(1).max(100).parse(limit);const r=await this.api('/documents?limit='+limit);return {documents:z.array(documentSchema).parse(r.data),hasMore:!!r.next};}
  async listGroups(limit=20) {z.number().int().min(1).max(100).parse(limit);const r=await this.api('/groups?limit='+limit);return {groups:z.array(groupSchema).parse(r.data),hasMore:!!r.next};}
  async listGroupDocuments(groupId:string,limit=20) {
    const id=z.string().uuid().parse(groupId);z.number().int().min(1).max(100).parse(limit);
    const r=await this.api('/documents?'+new URLSearchParams({group_id:id,limit:String(limit)}));
    return {documents:z.array(documentSchema).parse(r.data),hasMore:!!r.next,groupId:id};
  }
  async get(id:string){z.string().uuid().parse(id);return documentSchema.parse((await this.api('/documents/'+id)).data);}
  saveDoi(doi:string,groupId?:string) {
    const result=this.queue.then(()=>this.saveVerified(doi,groupId));this.queue=result.catch(()=>undefined);return result;
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
      if(existing) return {status:'already_saved',document:existing,doi};
      url=r.next;
    }
    if(url) throw new Error('Biblioteca demasiado grande para comprobar duplicados; no se guardó.');
    const w=crossrefSchema.parse(await this.metadata('https://api.crossref.org/works/'+encodeURIComponent(doi))).message;
    if(normalizeDoi(w.DOI)!==doi) throw new Error('El DOI recibido no coincide; no se guardó.');
    const year=w.issued?.['date-parts']?.[0]?.[0];
    const type:Record<string,string>={'journal-article':'journal','proceedings-article':'conference_proceedings',book:'book','book-chapter':'book_section',dissertation:'thesis',report:'report'};
    const payload={...(targetGroup?{group_id:targetGroup}:{}),title:w.title[0],type:type[w.type]||'generic',identifiers:{doi},...(year?{year}:{}),source:w['container-title']?.[0],authors:w.author?.map(a=>({first_name:a.given||'',last_name:a.family||a.name||''})),volume:w.volume,issue:w.issue,pages:w.page,websites:['https://doi.org/'+doi]};
    const document=documentSchema.parse((await this.api('/documents','POST',payload)).data);
    return {status:'saved',doi,document,groupId:targetGroup,verifiedVia:'crossref',peerReview:'unknown'};
  }
}
