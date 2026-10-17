import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const scratch=await mkdtemp(new URL('.markdown-test-',import.meta.url).pathname);
try {
const {outputFiles}=await build({stdin:{contents:`import {renderToStaticMarkup} from 'react-dom/server'; import {createElement} from 'react'; import ChatMarkdown from './src/components/ChatMarkdown'; import {ProfessorCard} from './src/components/ProfesChat'; export const render = text => renderToStaticMarkup(createElement(ChatMarkdown,{text})); export const renderProfessor = data => renderToStaticMarkup(createElement(ProfessorCard,{data,onAskAbout:()=>{}}));`,resolveDir:new URL('..',import.meta.url).pathname,loader:'tsx'},bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',write:false});
const modulePath=scratch+'/render.mjs';
await writeFile(modulePath,outputFiles[0].text);
const {render,renderProfessor}=await import(pathToFileURL(modulePath).href);
const html=render('**Curso (TEST101)**\n| Evaluación | Nota | Peso |\n| :--- | ---: | ---: |\n| Práctica | 0 | 10% |\n| Final | Pendiente | 20% |\n\n### Recomendaciones\n1. Revisa el [portal](https://estudiante.upc.edu.pe/).\n2. Consulta tus notas.');
assert.match(html,/<section class="app-chat-table-section">/);
assert.match(html,/<h3><strong>Curso \(TEST101\)<\/strong><\/h3>/);
assert.match(html,/<th scope="col" style="text-align:right">Nota<\/th>/);
assert.match(html,/<td style="text-align:right">0<\/td>/);
assert.match(html,/<td[^>]+class="is-pending">Pendiente<\/td>/);
assert.match(html,/<ol>/);assert.match(html,/<a href="https:\/\/estudiante.upc.edu.pe\/">/);
assert.match(render('• Primer curso\n• Segundo curso'),/<ul>\n<li>Primer curso<\/li>\n<li>Segundo curso<\/li>\n<\/ul>/);
assert.match(render('• Parent\n    • Child'),/<li>Parent\n<ul>\n<li>Child<\/li>/);
assert.match(render('- Parent\n    • Child'),/<li>Parent\n<ul>\n<li>Child<\/li>/);
assert.match(render('• Parent\n\n    ```text\n    • Literal\n    ```\n\n    • Child'),/• Literal/);
assert.match(render('    • Literal code'),/<pre><code>• Literal code/);
assert.match(render('```text\n• Mantener literal\n```'),/• Mantener literal/);
assert.match(render('Curso: X\nProfesor: Y'),/Curso: X<br\/>\nProfesor: Y/);
const escaped=render('<script>alert(1)</script>\n\n[link](javascript:alert(1))\n![alt](https://example.invalid/private.png)');
assert.doesNotMatch(escaped,/<script|<img|href="javascript:/);
assert.match(render('| Nombre | Detalle |\n| --- | --- |\n| A \\| B | **Texto** |'),/A \| B/);
for(const difficulty of [0,7.13,10]){
 const card=renderProfessor({name:'Profesor de prueba',score:3.13,difficulty,reviews:134});
 assert.match(card,/title="Dificultad \(de 0 a 10\)"/);
 assert.ok(card.includes(`${difficulty.toFixed(1)} / 10</strong>`),'The card keeps the catalog value on its native ten-point scale');
 assert.doesNotMatch(card,/\/ 5|de 1 a 5/);
}
assert.doesNotMatch(renderProfessor({name:'Sin puntuación',reviews:0}),/Dificultad:|app-prof-score__value/);
console.log('Chat Markdown: adjacent course table, accessible columns, zero, pending, lists, links and safe output passed.');

} finally { await rm(scratch,{recursive:true,force:true}); }
