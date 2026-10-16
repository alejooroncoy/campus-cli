import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[new URL('../src/scripts/assistant-account.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
const {assistantAccountView}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const free={authenticated:true,aiReady:true,plan:'free',usage:{remaining:7,limit:25,period:'trial'}};
const plus={...free,plan:'plus',usage:{remaining:63,limit:100,period:'day'}};
assert.equal(assistantAccountView(free).label,'Campus Free');
assert.equal(assistantAccountView(free).balance,'7 de 25 consultas de bienvenida');
assert.equal(assistantAccountView(plus).label,'Campus Plus');
assert.equal(assistantAccountView({...plus,usage:{...plus.usage,remaining:62}}).balance,'62 de 100 consultas web hoy','Use the latest stream balance rather than a cached session count');
const empty=assistantAccountView({...plus,usage:{...plus.usage,remaining:0}});
assert.equal(empty.label,'Campus Plus');assert.match(empty.balance,/0 de 100/);
const guest=assistantAccountView({...free,authenticated:false,plan:'anon',usage:{remaining:3,limit:5,period:'trial'}});
assert.equal(guest.label,'Prueba gratis');assert.equal(guest.available,'3 consultas disponibles');assert.equal(assistantAccountView({...free,usage:{...free.usage,remaining:1}}).available,'1 consulta disponible');assert.equal(assistantAccountView(plus).available,'63 consultas disponibles hoy');assert.equal(guest.balance,'3 de 5 consultas de prueba');
for(const session of ['error',{...plus,accessUnavailable:true},{...free,plan:undefined},{...free,plan:'unknown'}]){
 const view=assistantAccountView(session);assert.equal(view.state,'unavailable');assert.equal(view.label,'Cuenta por comprobar');assert.equal(view.balance,'Saldo no disponible');assert.equal(view.retry,true);
}
for(const usage of [undefined,{remaining:NaN,limit:25},{remaining:-1,limit:25},{remaining:26,limit:25}]){
 const view=assistantAccountView({...free,usage});assert.equal(view.label,'Campus Free');assert.equal(view.balance,'Saldo no disponible');assert.equal(view.retry,true);
}
assert.equal(assistantAccountView('loading').balance,'');
assert.equal(assistantAccountView({...plus,accessBlocked:true}).state,'blocked');
console.log('Assistant account: verified Free/Plus/guest, live stream balance, zero quota, blocked/unknown/unavailable and missing quota passed.');
