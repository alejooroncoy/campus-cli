import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[new URL('../src/scripts/profile-account.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
const {profileAccountView,renderProfileAccount}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const free={authenticated:true,aiReady:true,plan:'free',usage:{remaining:7,limit:25,period:'trial'}};
const plus={...free,plan:'plus',usage:{remaining:63,limit:100,period:'day'}};
assert.equal(profileAccountView(free).label,'Campus Free');
assert.match(profileAccountView(free).usage,/7 de 25/);
assert.match(profileAccountView(free).note,/no se renuevan cada mes/);
assert.equal(profileAccountView(plus).label,'Campus Plus');
assert.match(profileAccountView(plus).usage,/63 de 100.*hoy/);
assert.match(profileAccountView(plus).note,/cada día/);
assert.match(profileAccountView(plus).mcp,/independientes de tu cuota web/);
const exhausted=profileAccountView({...plus,usage:{...plus.usage,remaining:0}});
assert.equal(exhausted.label,'Campus Plus');assert.match(exhausted.usage,/0 de 100/);assert.match(exhausted.note,/Has usado/);
for(const session of ['error',{...plus,accessUnavailable:true},{...free,plan:'unknown'},{...plus,plan:undefined}]){
 const view=profileAccountView(session);assert.equal(view.state,'unavailable');assert.equal(view.usage,undefined);assert.equal(view.upgrade,false);
}
for(const usage of [undefined,{remaining:NaN,limit:100},{remaining:-1,limit:100},{remaining:101,limit:100}]){
 const view=profileAccountView({...plus,usage});assert.equal(view.label,'Campus Plus');assert.equal(view.usage,undefined);assert.match(view.note,/No pudimos comprobar/);
}
assert.equal(profileAccountView({...free,authenticated:false,plan:'anon'}).state,'guest');
assert.equal(profileAccountView({...plus,accessBlocked:true}).state,'blocked');
const fields=new Map(['label','usage','note','mcp','upgrade','refresh'].map(name=>[name,{textContent:'',hidden:false,setAttribute(){}}]));
const root={dataset:{},querySelector(selector){return fields.get(selector.match(/data-profile-(.*)\]/)[1]);}};
renderProfileAccount(root,free);assert.equal(fields.get('upgrade').hidden,false);
renderProfileAccount(root,plus);assert.equal(fields.get('upgrade').hidden,true);assert.equal(fields.get('mcp').hidden,false);
renderProfileAccount(root,'error');assert.equal(fields.get('usage').textContent,'');assert.equal(fields.get('usage').hidden,true);assert.equal(fields.get('mcp').hidden,true);
renderProfileAccount(root,'loading');assert.equal(fields.get('refresh').disabled,true);
renderProfileAccount(root,free);assert.equal(fields.get('refresh').disabled,false);assert.equal(fields.get('label').textContent,'Campus Free');
console.log('Profile account: Free/Plus, daily/welcome balances, exhausted quota, blocked/unknown/unavailable, invalid quota and state transitions passed.');
