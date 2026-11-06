import test from 'node:test';
import assert from 'node:assert/strict';
import {handleUcalWaitlist} from '../api/ucal-waitlist.js';
import {UCAL_CONSENT,waitlistKey,encryptWaitlistEmail,decryptWaitlistEmail,unsubscribeToken,unsubscribeId} from '../src/lib/ucal-waitlist.mjs';
import {registrySnapshot,renderRegistry,registryHandler} from './ucal-waitlist-registry.mjs';
const secret='11'.repeat(32),key=waitlistKey(secret),id='11111111-1111-4111-8111-111111111111';
const env={CAMPUS_UCAL_SECRET:secret,RESEND_API_KEY:'test-only'};
const input={action:'subscribe',email:' Student@example.invalid ',consent:UCAL_CONSENT,website:''};
function req(body=input,headers={},method='POST'){return new Request('https://campuscli.com/api/ucal-waitlist',{method,headers:{origin:'https://campuscli.com','content-type':'application/json','x-vercel-forwarded-for':'203.0.113.5',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});}
function fixture(overrides={}){const calls=[];const store={request:async value=>{calls.push(['request',value]);return {outcome:'send',signup_id:id};},delivery:async(...args)=>{calls.push(['delivery',...args]);return true;},confirm:async hash=>{calls.push(['confirm',hash]);return true;},remove:async value=>{calls.push(['remove',value]);},...overrides};return {calls,store};}

test('subscription encrypts the address, sends confirmation and does not disclose registration identity',async()=>{
 const f=fixture(),sent=[];
 const r=await handleUcalWaitlist(req(),{env,store:f.store,send:async(...args)=>sent.push(args)});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});
 assert.equal(decryptWaitlistEmail(f.calls[0][1].encryptedEmail,key),'student@example.invalid');
 assert(!JSON.stringify(f.calls).includes('student@example.invalid'));
 assert.equal(sent[0][0].to[0],'student@example.invalid');
 assert(sent[0][0].text.includes('/ucal/avisos/?action=confirm&token='));
 assert(sent[0][0].headers['List-Unsubscribe-Post']);assert.equal(f.calls.at(-1)[3],true);
});
test('invalid email, consent, honeypot, origin and oversized body do not write or send',async()=>{
 for(const [body,headers,status] of [[{...input,consent:false},{},400],[{...input,email:'not-an-email'},{},400],[{...input,website:'bot'},{},400],[input,{origin:'https://other.invalid'},403],[{...input,email:'a'.repeat(5000)},{},400]]){
  const f=fixture();const r=await handleUcalWaitlist(req(body,headers),{env,store:f.store,send:async()=>assert.fail('must not send')});assert.equal(r.status,status);assert.equal(f.calls.length,0);
 }
});
test('existing registrations use the same response without sending another message',async()=>{
 const f=fixture({request:async()=>({outcome:'accepted',signup_id:id})});
 const r=await handleUcalWaitlist(req(),{env,store:f.store,send:async()=>assert.fail('must not resend')});assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});
});
test('delivery failure is not presented as a successful registration',async()=>{
 const f=fixture();const r=await handleUcalWaitlist(req(),{env,store:f.store,send:async()=>{throw Error('provider body with private data');}});assert.equal(r.status,503);assert.equal(f.calls.at(-1)[3],false);assert(!(await r.text()).includes('private data'));
});
test('rate limit and delivery leases prevent repeated sends',async()=>{
 for(const outcome of ['limited','busy']){const f=fixture({request:async()=>({outcome})});const r=await handleUcalWaitlist(req(),{env,store:f.store,send:async()=>assert.fail('must not send')});assert.equal(r.status,429);}
});
test('confirmation needs an explicit POST and a valid, unexpired token',async()=>{
 const token='A'.repeat(43),f=fixture();assert.equal((await handleUcalWaitlist(req({}, {},'GET'),{env,store:f.store})).status,405);assert.equal(f.calls.length,0);
 assert.equal((await handleUcalWaitlist(req({action:'confirm',token}),{env,store:f.store})).status,200);
 const expired=fixture({confirm:async()=>false});assert.equal((await handleUcalWaitlist(req({action:'confirm',token}),{env,store:expired.store})).status,400);
});
test('unsubscribe is a signed deletion, including provider one-click POSTs',async()=>{
 const token=unsubscribeToken(id,key),f=fixture();assert.equal(unsubscribeId(token,key),id);assert.equal(unsubscribeId(token.slice(0,-1)+'x',key),null);
 assert.equal((await handleUcalWaitlist(req({action:'unsubscribe',token}),{env,store:f.store})).status,200);assert.deepEqual(f.calls,[['remove',id]]);
 const request=new Request(`https://campuscli.com/api/ucal-waitlist?token=${token}`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'});
 assert.equal((await handleUcalWaitlist(request,{env,store:f.store})).status,200);
});
test('encrypted emails reject tampering; public handlers fail closed without configuration',async()=>{
 const cipher=encryptWaitlistEmail('student@example.invalid',key);const bytes=Buffer.from(cipher,'base64url');bytes[bytes.length-1]^=1;assert.throws(()=>decryptWaitlistEmail(bytes.toString('base64url'),key));
 assert.equal((await handleUcalWaitlist(req(),{env:{},store:fixture().store})).status,503);
});
test('private registry reads in a read-only transaction and safely displays decrypted records',async()=>{
 const email='student@example.invalid',cipher=encryptWaitlistEmail(email,key),calls=[];
 const sql={begin:async(mode,fn)=>{assert.equal(mode,'read only');return fn(async(strings,...values)=>{calls.push([strings.join('?'),values]);return calls.length===1?[{total:1,pending:1,confirmed:0,notified:0,expired:0}]:[{encrypted_email:cipher,state:'pending',requested_at:new Date(),expired:false}];});}};
 const data=await registrySnapshot(sql,key,2);assert.equal(data.rows[0].email,email);assert.equal(data.rows[0].encrypted_email,undefined);assert.equal(calls[1][1][0],100);
 const html=renderRegistry({...data,rows:[{...data.rows[0],email:'<script>alert(1)</script>'}]});assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(!html.includes(cipher));
});
test('local registry rejects anonymous, invalid-host and cross-origin requests before reading data',async()=>{
 let reads=0;const token='a'.repeat(64),handler=registryHandler({origin:'http://127.0.0.1:4877',token,snapshot:async()=>{reads++;return {counts:{total:0,pending:0,confirmed:0,notified:0,expired:0},rows:[],page:0};}});
 async function call(url,headers={},method='GET'){const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};await handler({url,headers:{host:'127.0.0.1:4877',...headers},method},res);return res;}
 assert.equal((await call('/')).status,403);assert.equal((await call('/',{host:'other.invalid'})).status,404);assert.equal((await call('/',{},'POST')).status,404);assert.equal((await call('/?access='+'é'.repeat(64))).status,403);assert.equal(reads,0);
 const access=await call('/?access='+token);assert.equal(access.status,303);assert.equal(access.headers.location,'/');assert.match(access.headers['set-cookie'],/HttpOnly; SameSite=Strict/);assert.equal(reads,0);
 const allowed=await call('/',{cookie:'campus_ucal_registry='+token});assert.equal(allowed.status,200);assert.equal(reads,1);assert.match(allowed.headers['cache-control'],/no-store/);assert.match(allowed.body,/Todavía no hay inscripciones/);
});
