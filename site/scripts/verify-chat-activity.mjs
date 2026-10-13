import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const scratch=await mkdtemp(new URL('.activity-test-',import.meta.url).pathname);
try {
  const {outputFiles}=await build({stdin:{contents:`import {renderToStaticMarkup} from 'react-dom/server'; import {createElement} from 'react'; import ChatActivity from './src/components/ChatActivity'; export {appendActivity} from './src/components/ChatActivity'; export const render = props => renderToStaticMarkup(createElement(ChatActivity,props));`,resolveDir:new URL('..',import.meta.url).pathname,loader:'tsx'},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',write:false});
  const modulePath=scratch+'/render.mjs';
  await writeFile(modulePath,outputFiles[0].text);
  const {render,appendActivity}=await import(pathToFileURL(modulePath).href);
  let steps=['connecting'];
  assert.equal(appendActivity(steps,'connecting'),steps);
  assert.equal(appendActivity(steps,'__proto__'),steps);
  assert.equal(appendActivity(steps,'untrusted server text'),steps);
  steps=appendActivity(steps,'grades');
  steps=appendActivity(steps,'answer');
  assert.deepEqual(steps,['connecting','grades','answer']);
  const pending=render({steps,busy:true});
  assert.match(pending,/<details[^>]*aria-label="Actividad de Campus"/);
  assert.match(pending,/<summary>/);
  assert.match(pending,/role="status">Preparando respuesta/);
  assert.match(pending,/Mi UPC mediante el MCP de Campus/);
  assert.equal((pending.match(/aria-current="step"/g)??[]).length,1);
  const complete=render({steps,busy:false});
  assert.match(complete,/Consulta finalizada/);
  assert.doesNotMatch(complete,/En curso|aria-current/);
  assert.match(render({steps,busy:false,interrupted:true}),/Consulta interrumpida/);
  for(let index=0;index<100;index++)steps=appendActivity(steps,index%2?'answer':'reviews');
  assert.equal(steps.length,30);
  console.log('Chat activity: allowlist, bounded ordered steps, duplicate events, native disclosure, completion and interruption passed.');
} finally {await rm(scratch,{recursive:true,force:true});}
