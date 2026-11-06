import postgres from 'postgres';
import {isIP} from 'node:net';
import {randomBytes,randomUUID} from 'node:crypto';
import {
  UCAL_CONSENT,waitlistKey,normalizeWaitlistEmail,tokenHash,waitlistHash,
  encryptWaitlistEmail,unsubscribeId,confirmationEmail,deliverWaitlistEmail,
} from '../src/lib/ucal-waitlist.mjs';

let connection;
export function ucalWaitlistStore(sql){
  return {
    async request(input){const [row]=await sql`select * from campus_growth.request_ucal(${input.emailKey},${input.encryptedEmail},${input.bucket},${input.hash},${input.lease}::uuid)`;return row;},
    async delivery(id,lease,sent){const [row]=await sql`select campus_growth.ucal_confirmation_delivery(${id}::uuid,${lease}::uuid,${sent}) as ok`;return row.ok;},
    async confirm(hash){const [row]=await sql`select campus_growth.confirm_ucal(${hash}) as ok`;return row.ok;},
    async remove(id){await sql`select campus_growth.remove_ucal(${id}::uuid)`;},
  };
}
async function readBody(request){
  const reader=request.body?.getReader();
  if(!reader)throw Error('invalid_body');
  const chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw Error('invalid_body');}chunks.push(value);}}
  finally{reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
}
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex'}});
export async function handleUcalWaitlist(request,{env=process.env,store,send=deliverWaitlistEmail}={}){
  if(request.method!=='POST')return new Response(null,{status:405,headers:{allow:'POST','cache-control':'no-store'}});
  const url=new URL(request.url),type=request.headers.get('content-type')??'';
  const oneClick=/^application\/x-www-form-urlencoded(?:;|$)/i.test(type);
  if(!oneClick&&request.headers.get('origin')!==url.origin)return reply(403,{error:'Abre el formulario de Campus para continuar.'});
  if(!oneClick&&!/^application\/json(?:;|$)/i.test(type))return reply(415,{error:'Envía los datos desde el formulario de Campus.'});
  let input;
  try{
    const raw=await readBody(request);
    if(oneClick){const form=new URLSearchParams(raw);if(form.get('List-Unsubscribe')!=='One-Click')throw Error();input={action:'unsubscribe',token:url.searchParams.get('token')};}
    else input=JSON.parse(raw);
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error();
  }catch{return reply(400,{error:'Revisa los datos e inténtalo nuevamente.'});}
  let key;
  try{key=waitlistKey(env.CAMPUS_UCAL_SECRET);}catch{return reply(503,{error:'El registro está temporalmente fuera de servicio. Inténtalo más tarde.'});}
  if(!store){
    if(!env.CAMPUS_UCAL_DATABASE_URL)return reply(503,{error:'El registro está temporalmente fuera de servicio. Inténtalo más tarde.'});
    connection??=postgres(env.CAMPUS_UCAL_DATABASE_URL,{max:1,prepare:false,connect_timeout:5,idle_timeout:15,onnotice:()=>{}});
    store=ucalWaitlistStore(connection);
  }
  try{
    if(input.action==='confirm'){
      if(typeof input.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(input.token))return reply(400,{error:'El enlace no es válido. Solicita uno nuevo desde la página de UCAL.'});
      if(!await store.confirm(tokenHash(input.token)))return reply(400,{error:'El enlace venció o no es válido. Solicita uno nuevo desde la página de UCAL.'});
      return reply(200,{ok:true});
    }
    if(input.action==='unsubscribe'){
      const id=unsubscribeId(input.token,key);
      if(!id)return reply(400,{error:'El enlace no es válido. Puedes escribir a info@campuscli.com para retirar tu inscripción.'});
      await store.remove(id);
      return reply(200,{ok:true});
    }
    if(oneClick||input.action!=='subscribe')return reply(400,{error:'Solicitud no válida.'});
    const email=normalizeWaitlistEmail(input.email);
    if(!email||input.consent!==UCAL_CONSENT||input.website!=='')return reply(400,{error:'Revisa tu correo y autoriza el aviso para continuar.'});
    if(!env.RESEND_API_KEY)return reply(503,{error:'No podemos enviar la confirmación ahora. Inténtalo más tarde.'});
    const ip=request.headers.get('x-vercel-forwarded-for')?.trim();
    if(!ip||!isIP(ip))return reply(503,{error:'No pudimos procesar la solicitud. Inténtalo más tarde.'});
    const token=randomBytes(32).toString('base64url'),lease=randomUUID();
    const row=await store.request({emailKey:waitlistHash(key,'email',email),encryptedEmail:encryptWaitlistEmail(email,key),bucket:waitlistHash(key,'request',ip),hash:tokenHash(token),lease});
    if(!row||['limited','busy'].includes(row.outcome))return reply(429,{error:'Espera unos minutos antes de intentarlo otra vez.'});
    if(row.outcome==='send'){
      try{
        await send(confirmationEmail(email,token,row.signup_id,key),`ucal-confirm/${row.signup_id}/${tokenHash(token)}`,{apiKey:env.RESEND_API_KEY});
        if(!await store.delivery(row.signup_id,lease,true))throw Error('delivery_not_recorded');
      }catch{
        await store.delivery(row.signup_id,lease,false).catch(()=>{});
        return reply(503,{error:'No pudimos confirmar el envío. Inténtalo nuevamente en unos minutos.'});
      }
    }else if(row.outcome!=='accepted')throw Error('invalid_registry_response');
    // Same response for a new request and an existing registration.
    return reply(200,{ok:true});
  }catch{
    console.warn('[ucal-waitlist] Registration could not be completed.');
    return reply(503,{error:'No pudimos guardar tu solicitud. Inténtalo más tarde.'});
  }
}
export default {fetch:request=>handleUcalWaitlist(request)};
