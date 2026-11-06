import postgres from 'postgres';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {waitlistKey,decryptWaitlistEmail,unsubscribeToken,deliverWaitlistEmail} from '../src/lib/ucal-waitlist.mjs';

export async function dispatchUcalNotice(sql,key,send){
  const lease=randomUUID();
  const rows=await sql`
    update campus_growth.ucal_waitlist set notice_lease=${lease}::uuid,
      notice_lease_until=now()+interval '15 minutes',notice_started_at=coalesce(notice_started_at,now()),notice_attempts=notice_attempts+1
    where id=(select id from campus_growth.ucal_waitlist
      where state='confirmed' and expires_at>now() and encrypted_email is not null
        and (notice_lease_until is null or notice_lease_until<now())
        and notice_attempts<3 and (notice_started_at is null or notice_started_at>now()-interval '23 hours')
      order by confirmed_at,id for update skip locked limit 1)
    returning id,encrypted_email`;
  if(!rows.length)return false;
  const row=rows[0],unsubscribe=unsubscribeToken(row.id,key);
  try{
    const email=decryptWaitlistEmail(row.encrypted_email,key);
    await send({from:'Campus <info@campuscli.com>',to:[email],subject:'Campus para tu nueva etapa en UPC',
      text:`Pediste que te avisemos cuando pudieras empezar en Campus con tu acceso UPC.\n\nCampus está listo para acompañarte en esta etapa. Entra cuando tu universidad haya habilitado tu cuenta UPC compatible:\nhttps://campuscli.com/app/\n\nNo necesitas compartir tu contraseña con nosotros. La universidad confirma tus accesos y condiciones académicas.\n\nEliminar mi inscripción:\nhttps://campuscli.com/ucal/avisos/?action=unsubscribe&token=${unsubscribe}\n\nCampus es un proyecto independiente de UCAL y UPC.`,
      headers:{'List-Unsubscribe':`<https://campuscli.com/api/ucal-waitlist?token=${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'},
    },`ucal-available-v1/${row.id}`);
    const done=await sql`update campus_growth.ucal_waitlist set state='notified',notified_at=now(),encrypted_email=null,notice_lease=null,notice_lease_until=null where id=${row.id}::uuid and notice_lease=${lease}::uuid returning id`;
    if(!done.length)throw Error('notification_not_recorded');
    return true;
  }catch{
    await sql`update campus_growth.ucal_waitlist set notice_lease=null,notice_lease_until=null where id=${row.id}::uuid and notice_lease=${lease}::uuid`.catch(()=>{});
    throw Error('Notification not completed; inspect provider delivery before retrying after 23 hours.');
  }
}
async function main(){
  const args=new Set(process.argv.slice(2)),send=args.has('--send');
  if([...args].some(a=>!['--send','--confirm-ready','--purge-only'].includes(a)))throw Error('Usage: notify-ucal-waitlist.mjs [--send --confirm-ready | --purge-only]');
  if(send&&!args.has('--confirm-ready'))throw Error('Verify that Campus is available for these students, then explicitly pass --confirm-ready.');
  const url=process.env.CAMPUS_UCAL_ADMIN_DATABASE_URL??process.env.DATABASE_URL_UNPOOLED??process.env.DATABASE_URL;
  if(!url)throw Error('Configure the private administrative database connection.');
  const sql=postgres(url,{max:1,prepare:false,connect_timeout:5,onnotice:()=>{}});
  try{
    if(send||args.has('--purge-only'))await sql`delete from campus_growth.ucal_waitlist where expires_at<=now()`;
    const [counts]=await sql`select count(*) filter(where state='pending')::int as pending,count(*) filter(where state='confirmed')::int as confirmed,count(*) filter(where state='notified')::int as notified from campus_growth.ucal_waitlist where expires_at>now()`;
    console.log({mode:send?'send':args.has('--purge-only')?'purge':'dry-run',...counts});
    if(!send)return;
    if(!process.env.RESEND_API_KEY)throw Error('Configure the existing Resend sender.');
    const key=waitlistKey(process.env.CAMPUS_UCAL_SECRET);
    let sent=0;
    while(sent<100&&await dispatchUcalNotice(sql,key,(mail,id)=>deliverWaitlistEmail(mail,id,{apiKey:process.env.RESEND_API_KEY}))){sent++;await new Promise(resolve=>setTimeout(resolve,600));}
    console.log({sent});
  }finally{await sql.end();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('UCAL operation did not complete. Check private configuration and provider delivery; no recipient data was printed.');process.exitCode=1;});
