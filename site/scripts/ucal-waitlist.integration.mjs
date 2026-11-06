import assert from 'node:assert/strict';
import postgres from 'postgres';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {ucalWaitlistStore} from '../api/ucal-waitlist.js';
import {dispatchUcalNotice} from './notify-ucal-waitlist.mjs';
import {waitlistKey,waitlistHash,encryptWaitlistEmail,tokenHash} from '../src/lib/ucal-waitlist.mjs';

if(!process.env.CAMPUS_UCAL_TEST_DATABASE_URL)throw Error('An isolated test database is required.');
const sql=postgres(process.env.CAMPUS_UCAL_TEST_DATABASE_URL,{max:1,prepare:false,connect_timeout:8,onnotice:()=>{}});
const key=waitlistKey('22'.repeat(32));
try{
  await sql.unsafe(await readFile(new URL('../sql/ucal-waitlist.sql',import.meta.url),'utf8'));
  const store=ucalWaitlistStore(sql),prefix=randomUUID();
  async function signup(n){const email=`${prefix}-${n}@example.invalid`,lease=randomUUID(),token=randomBytes(32).toString('base64url');const input={emailKey:waitlistHash(key,'email',email),encryptedEmail:encryptWaitlistEmail(email,key),bucket:waitlistHash(key,'request',`${prefix}-${n}`),hash:tokenHash(token),lease};const row=await store.request(input);assert.equal(row.outcome,'send');return {...row,input,token};}
  const active=await signup('active');
  assert.equal((await store.request({...active.input,lease:randomUUID()})).outcome,'busy');
  assert.equal(await store.delivery(active.signup_id,active.input.lease,false),true);
  const retry=await store.request({...active.input,lease:randomUUID()});assert.equal(retry.outcome,'send');
  assert.equal(await store.delivery(retry.signup_id,(await sql`select confirmation_lease from campus_growth.ucal_waitlist where id=${retry.signup_id}::uuid`)[0].confirmation_lease,true),true);
  assert.equal((await store.request({...active.input,lease:randomUUID()})).outcome,'accepted');
  assert.equal(await store.confirm(tokenHash(active.token)),true);
  assert.equal(await store.confirm(tokenHash(active.token)),true);
  assert.equal(await store.confirm(tokenHash('invalid')),false);
  const pending=await signup('pending'),cancelled=await signup('cancelled'),expired=await signup('expired');
  await store.confirm(tokenHash(cancelled.token));await store.remove(cancelled.signup_id);
  await sql`update campus_growth.ucal_waitlist set confirmation_expires_at=now()-interval '1 second' where id=${expired.signup_id}::uuid`;
  assert.equal(await store.confirm(tokenHash(expired.token)),false);
  const notices=[];
  assert.equal(await dispatchUcalNotice(sql,key,async(message,id)=>notices.push({message,id})),true);
  assert.equal(notices.length,1);assert.equal(notices[0].message.to[0],`${prefix}-active@example.invalid`);
  assert.equal(await dispatchUcalNotice(sql,key,async()=>assert.fail('pending/expired/cancelled must not receive notice')),false);
  const [sent]=await sql`select state,encrypted_email from campus_growth.ucal_waitlist where id=${active.signup_id}::uuid`;
  assert.equal(sent.state,'notified');assert.equal(sent.encrypted_email,null);
  let limited=false;
  for(let n=0;n<6;n++){const result=await store.request({...pending.input,lease:randomUUID()});if(result.outcome==='limited')limited=true;}
  assert(limited);
  console.log('Isolated database: migration, delivery retry, duplicate suppression, rate limits, explicit confirmation, deletion and confirmed-only dispatch pass. No real emails sent.');
}finally{await sql.end({timeout:5});}
