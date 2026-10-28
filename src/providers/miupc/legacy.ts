import {parse,type DefaultTreeAdapterMap} from 'parse5';
import {MiupcPortalError,type MiupcCookie,type MiupcFetch} from './auth.js';
const PORTAL='https://mistramites.upc.edu.pe';
const AUTHORITY='https://login.microsoftonline.com';
const TENANT='0e0cb060-09ad-49f5-a005-68b9b49aa1f6';
type Node=DefaultTreeAdapterMap['node'];
type Element=DefaultTreeAdapterMap['element'];
const elements=(node:Node):Element[]=>{const result:Element[]=[];if('tagName'in node)result.push(node);if('childNodes'in node)for(const child of node.childNodes)result.push(...elements(child));return result;};
const attr=(node:Element,name:string)=>node.attrs.find(a=>a.name===name)?.value??'';
const content=(node:Node):string=>'value'in node?node.value:'childNodes'in node?node.childNodes.map(content).join(''):'';
const clean=(s:string)=>s.replace(/[\u200b-\u200f\ufeff]/g,'').replace(/\s+/g,' ').trim();
const invalid=()=>new MiupcPortalError('MIUPC_INVALID_RESPONSE','La bandeja de Mis Trámites cambió o no pudo verificarse.');
const reconnect=()=>new MiupcPortalError('MIUPC_RECONNECT_REQUIRED','Mis Trámites requiere renovar el acceso UPC de esta misma cuenta.');
const unavailable=()=>new MiupcPortalError('MIUPC_UNAVAILABLE','Mis Trámites no respondió correctamente.');

/** Only the authenticated inbox document: no detail form, download or request
 * creation endpoint is followed. Hidden pagination rows are all in this HTML. */
export function parseMiupcLegacyInbox(html:string,expectedStudentCode:string){
  if(!/^U\d{9}$/i.test(expectedStudentCode)||html.length>4*1024*1024)throw invalid();
  const nodes=elements(parse(html));const identity=nodes.find(e=>attr(e,'id')==='img-user');
  // The server renders the owner photo as a literal in its page script;
  // the browser copies it into the avatar style. Parse that literal, never run JS.
  const script=nodes.filter(e=>e.tagName==='script').map(content).find(s=>s.includes("document.getElementById('img-user')")&&s.includes('objeto.style.backgroundImage'));
  const photo=(identity&&attr(identity,'style').match(/url\(\s*['"]?([^'"\)]+)/i)?.[1])??script?.match(/\bvar url = '(https:\/\/intranet\.upc\.edu\.pe\/programas\/Imagen\/Fotos\/Upc\/\d+\.jpg)'/i)?.[1];
  let photoUrl:URL;try{photoUrl=new URL(photo??'',PORTAL);}catch{throw reconnect();}
  const own=expectedStudentCode.slice(1);
  if(photoUrl.origin!=='https://intranet.upc.edu.pe'||!photoUrl.pathname.startsWith('/programas/Imagen/Fotos/Upc/')||!new RegExp('^\\d*'+own+'\\.jpg$','i').test(photoUrl.pathname.split('/').at(-1)??''))throw reconnect();
  const pageSize=nodes.find(e=>attr(e,'id')==='hdPaginaTamanio');
  if(!pageSize||!/^\d{1,4}$/.test(attr(pageSize,'value')))throw invalid();
  const rows=nodes.filter(e=>e.tagName==='ul'&&attr(e,'class').split(/\s+/).includes('panel-table-row'));
  const requests=rows.map(row=>{
    const cells=row.childNodes.filter((n):n is Element=>'tagName'in n&&n.tagName==='li');
    if(cells.length!==5)throw invalid();const values=cells.map(c=>clean(content(c)));
    values[0]=values[0].replace(/^No\. Solicitud:\s*/i,'');values[2]=values[2].replace(/^Fecha de Solicitud:\s*/i,'');values[3]=values[3].replace(/^TIEMPO MÁXIMO DE ATENCIÓN:\s*/i,'');
    if(!/^\d{1,12}$/.test(values[0])||!values[1]||!/^\d{2}\/\d{2}\/\d{4}$/.test(values[2])||!values[4])throw invalid();
    return{requestId:values[0],title:values[1],requestedAt:values[2],publishedMaxAttentionTime:values[3],status:values[4]};
  });
  return{system:'mis_tramites_upc',sourceUrl:PORTAL+'/Bandeja/Index',count:requests.length,requests,coverage:'all_inbox_rows_in_document',completeHistory:'not_certified',pageSize:Number(attr(pageSize,'value'))};
}
type Cookie={name:string;value:string;domain:string;path:string;expires:number};
class CookieJar{
  private cookies=new Map<string,Cookie>();
  constructor(initial:MiupcCookie[]){for(const c of initial){const domain=c.domain.replace(/^\./,'').toLowerCase();if(!['login.microsoftonline.com','microsoftonline.com','mistramites.upc.edu.pe'].includes(domain))continue;
    if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(c.name)||/[;\r\n]/.test(c.value))continue;const cookie={...c,domain,path:c.path??'/',expires:c.expires===undefined||c.expires===-1?Infinity:c.expires*1000};this.put(cookie);}}
  private put(c:Cookie){this.cookies.set(c.domain+'\n'+c.path+'\n'+c.name,c);if(this.cookies.size>200)throw invalid();}
  header(u:URL){return[...this.cookies.values()].filter(c=>(u.hostname===c.domain||u.hostname.endsWith('.'+c.domain))&&u.pathname.startsWith(c.path)&&c.expires>Date.now()).sort((a,b)=>b.path.length-a.path.length).map(c=>c.name+'='+c.value).join('; ');}
  receive(u:URL,headers:Headers){for(const line of headers.getSetCookie()){
    const parts=line.split(';').map(p=>p.trim());const split=parts[0].indexOf('=');if(split<=0)continue;
    const cookie:Cookie={name:parts[0].slice(0,split),value:parts[0].slice(split+1),domain:u.hostname,path:'/',expires:Infinity};
    if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(cookie.name)||/[\r\n;]/.test(cookie.value))throw invalid();
    for(const part of parts.slice(1)){const i=part.indexOf('=');const key=(i<0?part:part.slice(0,i)).toLowerCase();const value=i<0?'':part.slice(i+1);
      if(key==='domain')cookie.domain=value.replace(/^\./,'').toLowerCase();else if(key==='path')cookie.path=value.startsWith('/')?value:'/';else if(key==='max-age'&&/^-?\d+$/.test(value))cookie.expires=Date.now()+Number(value)*1000;else if(key==='expires'&&cookie.expires===Infinity){const date=Date.parse(value);if(Number.isFinite(date))cookie.expires=date;}}
    if(!(u.hostname===cookie.domain||u.hostname.endsWith('.'+cookie.domain)))throw invalid();this.put(cookie);
  }}
}
const authPaths=new Set(['/','/Autenticar/LoginUPC','/Autenticar/LoginUPCSAML','/Saml2/SignIn','/Saml2/Acs','/Home/Index','/Bandeja/Index']);
function allowed(u:URL){return u.protocol==='https:'&&!u.username&&!u.password&&((u.origin===PORTAL&&authPaths.has(u.pathname))||(u.origin===AUTHORITY&&u.pathname==='/'+TENANT+'/saml2'));}
async function htmlBody(r:Response){if(!r.body)throw invalid();const reader=r.body.getReader();let length=0;const chunks:Uint8Array[]=[];try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>4*1024*1024){await reader.cancel();throw invalid();}chunks.push(part.value);}}finally{reader.releaseLock();}return Buffer.concat(chunks).toString('utf8');}

/** Memory-only SAML session. The sole permitted POST is Microsoft's auth
 * assertion to the institution's observed ACS, never an application form. */
export class MiupcLegacyClient{
  private readonly jar:CookieJar;
  constructor(input:{universityId:string;cookies:MiupcCookie[];expectedStudentCode:string},private readonly fetcher:MiupcFetch=fetch){
    if(input.universityId!=='upc-pe')throw new MiupcPortalError('MIUPC_WRONG_UNIVERSITY','Esta consulta requiere una sesión UPC.');
    if(!/^U\d{9}$/i.test(input.expectedStudentCode))throw reconnect();this.expected=input.expectedStudentCode.toUpperCase();this.jar=new CookieJar(input.cookies);
  }
  private readonly expected:string;
  async read(){
    let u=new URL('/Autenticar/LoginUPC',PORTAL);let method='GET';let form:URLSearchParams|undefined;
    for(let hops=0;hops<12;hops++){
      if(!allowed(u)||(method==='POST'&&(u.origin!==PORTAL||u.pathname!=='/Saml2/Acs')))throw invalid();
      let response:Response;try{response=await this.fetcher(u,{method,redirect:'manual',headers:{'user-agent':'Mozilla/5.0',cookie:this.jar.header(u),...(method==='POST'?{'content-type':'application/x-www-form-urlencoded',origin:AUTHORITY,referer:AUTHORITY+'/'}:{})},...(form?{body:form}:{}),signal:AbortSignal.timeout(20000)});}catch{throw unavailable();}
      this.jar.receive(u,response.headers);
      if([301,302,303,307,308].includes(response.status)){
        const location=response.headers.get('location');if(!location)throw invalid();const next=new URL(location,u);if(!allowed(next))throw reconnect();
        if(method==='POST'&&[307,308].includes(response.status))throw invalid();u=next;method='GET';form=undefined;continue;
      }
      if(response.status===401||response.status===403)throw reconnect();if(!response.ok)throw unavailable();const html=await htmlBody(response);
      if(u.origin===PORTAL&&u.pathname==='/Bandeja/Index')return parseMiupcLegacyInbox(html,this.expected);
      if(u.origin===PORTAL&&(u.pathname==='/Home/Index'||u.pathname==='/')){u=new URL('/Bandeja/Index',PORTAL);method='GET';form=undefined;continue;}
      if(u.origin!==AUTHORITY)throw reconnect();
      const forms=elements(parse(html)).filter(n=>n.tagName==='form');const authForm=forms.find(f=>{try{return new URL(attr(f,'action'),u).href===PORTAL+'/Saml2/Acs'&&attr(f,'method').toLowerCase()==='post';}catch{return false;}});
      if(!authForm)throw reconnect();const inputs=elements(authForm).filter(e=>e.tagName==='input');form=new URLSearchParams();
      for(const input of inputs){const name=attr(input,'name');if(!['SAMLResponse','RelayState'].includes(name)||form.has(name))throw invalid();form.set(name,attr(input,'value'));}
      const assertion=form.get('SAMLResponse');if(!assertion||assertion.length>2_000_000||!form.get('RelayState'))throw invalid();
      // The institution validates the assertion signature and request binding.
      // A positive identity hint plus the server-rendered owner photo below
      // independently prevents following a different student's account.
      const xml=Buffer.from(assertion,'base64').toString('utf8');if(!xml.toLowerCase().includes(this.expected.toLowerCase()+'@upc.edu.pe'))throw reconnect();
      u=new URL('/Saml2/Acs',PORTAL);method='POST';
    }
    throw reconnect();
  }
}
