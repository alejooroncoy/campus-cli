import assert from 'node:assert/strict';
import {assistantReturnPath,connectAiHref} from '../src/scripts/assistant-handoff.ts';
const path='/app/profes/c/118adac7-9134-4f9e-b751-a145605de41c/';
assert.equal(assistantReturnPath(path),path);
assert.equal(new URL(connectAiHref(path),'http://localhost').searchParams.get('return'),path);
for(const value of ['https://evil.test/','//evil.test/','javascript:alert(1)','/app/perfil/','/app/profes/c/not-a-uuid/','/app/profes/?return=https://evil.test'])assert.equal(assistantReturnPath(value),null);
assert.equal(connectAiHref('/app/copilot/'),'/app/copilot/');
console.log('Assistant handoff preserves only valid local conversation paths.');
