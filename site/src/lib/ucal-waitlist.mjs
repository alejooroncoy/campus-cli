import {createHash,createHmac,randomBytes,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
export const UCAL_CONSENT='ucal-availability-v1';
export function waitlistKey(value){if(!/^[a-f0-9]{64}$/i.test(value??''))throw Error('waitlist_unavailable');return Buffer.from(value,'hex');}
export function normalizeWaitlistEmail(value){if(typeof value!=='string')return null;const email=value.trim().toLowerCase();return email.length<=254&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email)&&!email.includes('..')?email:null;}
export const tokenHash=value=>createHash('sha256').update(value).digest('hex');
export const waitlistHash=(key,purpose,value)=>createHmac('sha256',key).update(`${purpose}:`).update(value).digest('hex');
export function encryptWaitlistEmail(email,key){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(email,'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
export function decryptWaitlistEmail(record,key){const bytes=Buffer.from(record,'base64url');const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');}
export function unsubscribeToken(id,key){return `${id}.${createHmac('sha256',key).update('ucal-unsubscribe:').update(id).digest('base64url')}`;}
export function unsubscribeId(token,key){if(typeof token!=='string'||!/^([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\.[A-Za-z0-9_-]{43}$/.test(token))return null;const id=token.slice(0,36),expected=unsubscribeToken(id,key);return timingSafeEqual(Buffer.from(token),Buffer.from(expected))?id:null;}
export function confirmationEmail(email,token,id,key){const cancel=`https://campuscli.com/ucal/avisos/?action=unsubscribe&token=${unsubscribeToken(id,key)}`;return {from:'Campus <info@campuscli.com>',to:[email],subject:'Confirma tu aviso de Campus para UCAL',text:`Pediste que te avisemos cuando puedas usar Campus con tu acceso UPC.\n\nConfirma tu correo (enlace válido por 48 horas):\nhttps://campuscli.com/ucal/avisos/?action=confirm&token=${token}\n\nLa confirmación no crea una cuenta ni conecta tu universidad. Si no lo pediste, ignora este correo o elimina la solicitud:\n${cancel}\n\nSolo recibirás el aviso que autorizaste. Campus es un proyecto independiente.`,headers:{'List-Unsubscribe':`<https://campuscli.com/api/ucal-waitlist?token=${unsubscribeToken(id,key)}>`, 'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};}
export async function deliverWaitlistEmail(message,idempotencyKey,{apiKey,fetcher=fetch}){const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json','idempotency-key':idempotencyKey},body:JSON.stringify(message),signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('mail_unavailable');const data=await response.json();if(typeof data?.id!=='string'||!data.id)throw Error('mail_unavailable');}
