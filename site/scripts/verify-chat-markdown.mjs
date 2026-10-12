import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const scratch=await mkdtemp(new URL('.markdown-test-',import.meta.url).pathname);
try {
const {outputFiles}=await build({stdin:{contents:`import {renderToStaticMarkup} from 'react-dom/server'; import {createElement} from 'react'; import ChatMarkdown from './src/components/ChatMarkdown'; export const render = text => renderToStaticMarkup(createElement(ChatMarkdown,{text}));`,resolveDir:new URL('..',import.meta.url).pathname,loader:'tsx'},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',write:false});
const modulePath=scratch+'/render.mjs';
await writeFile(modulePath,outputFiles[0].text);
const {render}=await import(pathToFileURL(modulePath).href);
const html=render('**Curso (TEST101)**\n| Evaluación | Nota | Peso |\n| :--- | ---: | ---: |\n| Práctica | 0 | 10% |\n| Final | Pendiente | 20% |\n\n### Recomendaciones\n1. Revisa el [portal](https://estudiante.upc.edu.pe/).\n2. Consulta tus notas.');
assert.match(html,/<section class="app-chat-table-section">/);
assert.match(html,/<h3><strong>Curso \(TEST101\)<\/strong><\/h3>/);
assert.match(html,/<th scope="col" style="text-align:right">Nota<\/th>/);
assert.match(html,/<td style="text-align:right">0<\/td>/);
assert.match(html,/<td[^>]+class="is-pending">Pendiente<\/td>/);
assert.match(html,/<ol>/);assert.match(html,/<a href="https:\/\/estudiante.upc.edu.pe\/">/);
const escaped=render('<script>alert(1)</script>\n\n[link](javascript:alert(1))\n![alt](https://example.invalid/private.png)');
assert.doesNotMatch(escaped,/<script|<img|href="javascript:/);
assert.match(render('| Nombre | Detalle |\n| --- | --- |\n| A \\| B | **Texto** |'),/A \| B/);
console.log('Chat Markdown: adjacent course table, accessible columns, zero, pending, lists, links and safe output passed.');

} finally { await rm(scratch,{recursive:true,force:true}); }
