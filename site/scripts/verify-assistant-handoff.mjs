import assert from 'node:assert/strict';
import {assistantReturnPath,connectAiHref,assistantLoginHref} from '../src/scripts/assistant-handoff.ts';
const path='/app/asistente/c/118adac7-9134-4f9e-b751-a145605de41c/';
assert.equal(assistantReturnPath(path),path);
assert.equal(assistantReturnPath('/app/profes/c/118adac7-9134-4f9e-b751-a145605de41c/'),'/app/profes/c/118adac7-9134-4f9e-b751-a145605de41c/');
assert.equal(assistantReturnPath('/app/asistente/?modal=review'),'/app/asistente/?modal=review');
assert.equal(assistantReturnPath('/app/profes/?modal=review'),'/app/profes/?modal=review');
assert.equal(assistantReturnPath(`${path}?modal=review`),`${path}?modal=review`);
assert.equal(new URL(connectAiHref(path),'http://localhost').searchParams.get('return'),path);
for(const value of ['https://evil.test/','//evil.test/','javascript:alert(1)','/app/perfil/','/app/asistente/c/not-a-uuid/','/app/asistente/?return=https://evil.test','/app/asistente/?modal=invalid'])assert.equal(assistantReturnPath(value),null);
assert.equal(connectAiHref('/app/copilot/'),'/app/copilot/');
console.log('Assistant handoff preserves only valid local conversation paths.');

assert.equal(new URL(assistantLoginHref(path),'http://localhost').searchParams.get('return'),path);
assert.equal(new URL(assistantLoginHref(path,'?modal=review'),'http://localhost').searchParams.get('return'),`${path}?modal=review`);
assert.equal(new URL(assistantLoginHref('/app/profes/?modal=review'),'http://localhost').searchParams.get('return'),'/app/asistente/?modal=review');
assert.equal(new URL(assistantLoginHref('https://evil.test/'),'http://localhost').searchParams.get('return'),'/app/asistente/');
console.log('Guest login retains the current conversation through a confined return path.');
