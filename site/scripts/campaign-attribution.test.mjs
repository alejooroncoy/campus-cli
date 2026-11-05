import assert from 'node:assert/strict';
import { build } from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/scripts/campaign-attribution.ts'],bundle:true,format:'esm',write:false});
const {rememberCampaign,syncCampaign,clearCampaign}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

const values=new Map(),cookies=[],requests=[],key='campus_campaign_v1';
globalThis.localStorage={getItem:name=>values.get('local:'+name)??null};
globalThis.sessionStorage={getItem:name=>values.get(name)??null,setItem:(name,value)=>values.set(name,value),removeItem:name=>values.delete(name)};
globalThis.location={protocol:'https:',search:'?utm_source=email&utm_campaign=2026110501'};
globalThis.document={set cookie(value){cookies.push(value);}};
globalThis.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return new Response(null,{status:204});};

values.set(key,'{corrupt');
rememberCampaign('fixture');
const first=JSON.parse(values.get(key));
assert.equal(first.source,'email');assert.equal(first.id,'2026110501');
location.search='';rememberCampaign('fixture');
assert.deepEqual(JSON.parse(values.get(key)),first,'Internal/direct navigation preserves the pending campaign');
await syncCampaign('fixture');assert.ok(values.has(key),'Guest response retains the touch for login');

// Never send arbitrary properties recovered from browser storage to the API.
values.set(key,JSON.stringify({...first,email:'private@example.test',url:'private-url'}));
await syncCampaign('fixture');assert.deepEqual(requests.at(-1).body,first);
assert.equal(JSON.stringify(requests).includes('private'),false);

let finish;
globalThis.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return new Promise(resolve=>{finish=resolve;});};
const pending=syncCampaign('fixture');
location.search='?utm_source=email&utm_campaign=2026110502';rememberCampaign('fixture');
finish(new Response(null,{status:200}));await pending;
assert.equal(JSON.parse(values.get(key)).id,'2026110502','Acknowledging an old touch cannot erase a new click');
globalThis.fetch=async()=>new Response(null,{status:200});
await syncCampaign('fixture');assert.equal(values.has(key),false);
assert.match(cookies.at(-1),/Max-Age=0; Path=\/api\/app\/; SameSite=Lax; Secure/);

values.set(key,JSON.stringify({...first,observedAt:Date.now()-31*86400_000}));
await syncCampaign('fixture');assert.equal(values.has(key),false,'Expired tracking is removed');
values.set('local:__ph_opt_in_out_fixture','0');rememberCampaign('fixture');
assert.equal(values.has(key),false,'Opted-out visits cannot capture new campaigns');
values.delete('local:__ph_opt_in_out_fixture');rememberCampaign('fixture');clearCampaign();
assert.equal(values.has(key),false,'Logout can clear pending attribution');
console.log('Campaign browser contract: guest/login acknowledgement, direct visits, corrupt/private storage, racing clicks, expiry, opt-out and logout passed; no remote requests.');
