import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnitinLoginReturn } from '../src/scripts/turnitin-login.ts';
test('email login returns to its order and discards unrelated or malformed fragments', () => {
  const hash='#ti-order-49a3999c-0ce1-4ea6-ab68-afcd6dc2e794';
  assert.equal(turnitinLoginReturn('/app/turnitin/',hash),'/app/turnitin/'+hash);
  assert.equal(turnitinLoginReturn('/turnitin/',hash),'/app/turnitin/');
  assert.equal(turnitinLoginReturn('/app/turnitin/','#other'),'/app/turnitin/');
  assert.equal(turnitinLoginReturn('/app/turnitin/',hash+'/files/ai'),'/app/turnitin/');
  assert.equal(turnitinLoginReturn('/app/turnitin/',''),'/app/turnitin/');
});
