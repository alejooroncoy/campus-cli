import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[new URL('../src/scripts/university-onboarding.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
const {universityReturnPath,universitySetupHref,universityDoneHref}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const chat='/app/asistente/c/118adac7-9134-4f9e-b751-a145605de41c/';
const legacyChat='/app/profes/c/118adac7-9134-4f9e-b751-a145605de41c/';
const setup=new URL(universitySetupHref(chat),'https://local.test');
assert.equal(setup.pathname,'/app/perfil/');assert.equal(setup.searchParams.get('universidad'),'pendiente');
assert.equal(universityDoneHref(setup.search),chat,'Return to the same saved conversation after choosing a university');
assert.equal(universityDoneHref(`?universidad=pendiente&return=${encodeURIComponent(legacyChat)}`),legacyChat);
const connector=`/app/copilot/?return=${encodeURIComponent(chat)}`;
const guideSetup=new URL(universitySetupHref('/app/copilot/',new URL(connector,'https://local.test').search),'https://local.test');
assert.equal(universityDoneHref(guideSetup.search),connector,'Preserve the connector guide and its own return to the conversation');
assert.equal(universityDoneHref('?universidad=pendiente'),'/app/asistente/');
const modalSetup=new URL(universitySetupHref('/app/asistente/','?modal=review'),'https://local.test');
assert.equal(modalSetup.searchParams.get('return'),'/app/asistente/?modal=review');
assert.equal(universityDoneHref(modalSetup.search),'/app/asistente/?modal=review','Preserve review modal when returning from university onboarding');
assert.equal(universityDoneHref(''),'/app/perfil/');
assert.equal(universityReturnPath('/app/'),'/app/asistente/');
for(const value of ['https://evil.test/','//evil.test/','javascript:alert(1)','/app/asistente/c/not-a-uuid/','/api/app/logout','/app/copilot/../perfil/']){
 assert.equal(universityReturnPath(value),null);assert.equal(universityDoneHref(`?universidad=pendiente&return=${encodeURIComponent(value)}`),'/app/asistente/');
}
assert.equal(universityReturnPath('/app/copilot/?return=https%3A%2F%2Fevil.test'),'/app/copilot/');
console.log('University onboarding: preserves chat and connector destinations, profile edits and legacy links; external/malformed returns fail closed.');
