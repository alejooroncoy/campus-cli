import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import postgres from 'postgres';
import {waitlistKey,decryptWaitlistEmail} from '../src/lib/ucal-waitlist.mjs';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const date=value=>value?new Date(value).toLocaleString('es-PE',{timeZone:'America/Lima'}):'—';
export async function registrySnapshot(sql,key,page=0){
  return sql.begin('read only',async tx=>{
    const [counts]=await tx`select count(*)::int as total,
      count(*) filter(where state='pending' and expires_at>now())::int as pending,
      count(*) filter(where state='confirmed' and expires_at>now())::int as confirmed,
      count(*) filter(where state='notified' and expires_at>now())::int as notified,
      count(*) filter(where expires_at<=now())::int as expired
      from campus_growth.ucal_waitlist`;
    const rows=await tx`select encrypted_email,state,requested_at,confirmed_at,notified_at,expires_at,
      expires_at<=now() as expired from campus_growth.ucal_waitlist order by requested_at desc,id desc limit 50 offset ${page*50}`;
    return {counts,page,rows:rows.map(row=>({...row,encrypted_email:undefined,
      email:row.expired?'Autorización vencida':row.encrypted_email?decryptWaitlistEmail(row.encrypted_email,key):'Correo eliminado tras el aviso'}))};
  });
}
export function renderRegistry({counts,rows,page}){
  const state={pending:'Pendiente de confirmación',confirmed:'Confirmado · listo para avisar',notified:'Avisado'};
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow"><title>Inscripciones UCAL · Campus privado</title>
  <style>body{margin:0;background:#f3f8f9;color:#16303e;font:16px system-ui,sans-serif}main{max-width:1200px;margin:64px auto;padding:0 24px}header{display:flex;justify-content:space-between;gap:24px;align-items:center}h1{font-size:32px;margin:8px 0}small,p{color:#536b78}a{color:inherit}.stats{display:flex;flex-wrap:wrap;gap:16px;margin:32px 0}.stat{background:white;border:1px solid #d4e1e5;border-radius:14px;padding:20px;flex:1;min-width:140px}.stat strong{display:block;font-size:36px}.table{overflow:auto;background:white;border:1px solid #d4e1e5;border-radius:14px}table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}th,td{padding:18px;border-bottom:1px solid #e5edef}th{font-size:13px;color:#536b78}nav{display:flex;gap:24px;margin:24px 0}.refresh{background:#16303e;color:white;text-decoration:none;padding:12px 18px;border-radius:10px}</style>
  <main><header><div><small>CAMPUS · VISTA PRIVADA LOCAL</small><h1>Inscripciones UCAL</h1><p>Solo los correos confirmados y vigentes pueden recibir el aviso.</p></div><a class="refresh" href="/?page=${page}">Actualizar lista</a></header>
  <section class="stats">${[['pending','Por confirmar'],['confirmed','Listos para avisar'],['notified','Ya avisados'],['expired','Autorización vencida']].map(([key,label])=>`<div class="stat"><strong>${escape(counts[key])}</strong>${label}</div>`).join('')}</section>
  <div class="table"><table><thead><tr><th>Correo</th><th>Estado</th><th>Registro · Lima</th><th>Confirmación · Lima</th><th>Aviso · Lima</th></tr></thead><tbody>${rows.length?rows.map(row=>`<tr><td>${escape(row.email)}</td><td>${escape(row.expired?'Vencido':state[row.state]??row.state)}</td><td>${escape(date(row.requested_at))}</td><td>${escape(date(row.confirmed_at))}</td><td>${escape(date(row.notified_at))}</td></tr>`).join(''):'<tr><td colspan="5">Todavía no hay inscripciones.</td></tr>'}</tbody></table></div>
  <nav>${page?`<a href="/?page=${page-1}">← Anterior</a>`:''}<span>Página ${page+1} · ${escape(counts.total)} registros</span>${(page+1)*50<counts.total?`<a href="/?page=${page+1}">Siguiente →</a>`:''}</nav>
  <p>Esta vista solo consulta la lista. No envía correos ni modifica inscripciones. Usa el envío operativo cuando hayas verificado que el acceso está habilitado.</p><small>Actualizado: ${escape(date(new Date()))}. Sin analítica ni servicios externos. Cierra el proceso para revocar el acceso local.</small></main></html>`;
}
export function registryHandler({origin,token,snapshot}){
  const headers={'cache-control':'private, no-store','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
  const valid=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&timingSafeEqual(Buffer.from(value),Buffer.from(token));
  return async(req,res)=>{
    if(req.headers.host!==new URL(origin).host||req.method!=='GET'){res.writeHead(404,headers);res.end();return;}
    const url=new URL(req.url,origin);
    if(url.pathname!=='/'){res.writeHead(404,headers);res.end();return;}
    if(valid(url.searchParams.get('access'))){res.writeHead(303,{...headers,location:'/', 'set-cookie':`campus_ucal_registry=${token}; Path=/; HttpOnly; SameSite=Strict`});res.end();return;}
    const cookie=req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('campus_ucal_registry='))?.slice('campus_ucal_registry='.length);
    if(!valid(cookie)){res.writeHead(403,{...headers,'content-type':'text/plain; charset=utf-8'});res.end('Abre el enlace privado generado al iniciar el visor.');return;}
    const page=Number(url.searchParams.get('page')??0);
    if(!Number.isSafeInteger(page)||page<0||page>100000){res.writeHead(400,headers);res.end();return;}
    try{const html=renderRegistry(await snapshot(page));res.writeHead(200,{...headers,'content-type':'text/html; charset=utf-8'});res.end(html);}
    catch{res.writeHead(503,{...headers,'content-type':'text/plain; charset=utf-8'});res.end('No se pudo consultar la lista. Revisa la conexión y la clave privadas.');}
  };
}
async function main(){
  const url=process.env.CAMPUS_UCAL_ADMIN_DATABASE_URL??process.env.DATABASE_URL_UNPOOLED??process.env.DATABASE_URL;
  if(!url)throw Error('missing_configuration');
  const key=waitlistKey(process.env.CAMPUS_UCAL_SECRET),port=Number(process.env.CAMPUS_UCAL_REGISTRY_PORT??4877);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('invalid_port');
  const sql=postgres(url,{max:1,prepare:false,connect_timeout:5,idle_timeout:15,onnotice:()=>{}});
  try{await registrySnapshot(sql,key);}catch(error){await sql.end();throw error;}
  const origin=`http://127.0.0.1:${port}`,token=randomBytes(32).toString('hex');
  const server=http.createServer(registryHandler({origin,token,snapshot:page=>registrySnapshot(sql,key,page)}));
  server.on('error',()=>{console.error('No se pudo abrir el visor local.');sql.end().finally(()=>process.exit(1));});
  server.listen(port,'127.0.0.1',()=>console.log(`${origin}/?access=${token}`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close();sql.end().finally(()=>process.exit(0));});
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('No se pudo abrir el visor. Revisa la conexión y la clave privadas; no se imprimieron datos de inscritos.');process.exitCode=1;});
