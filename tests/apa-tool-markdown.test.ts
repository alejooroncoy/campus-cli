import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatChecks, formatFaq, formatMarkdown, normasChanges, normasEssentials, normasFaq, normasMarkdown,
} from '../site/src/lib/apa-tool-content.ts';

test('the format twin carries the sections of the HTML page, so no reference dangles', () => {
  const md = formatMarkdown();
  for (const heading of ['Cómo se usa', 'Qué revisa', 'Hacerlo a mano en Word', 'Preguntas frecuentes', 'Dentro de Word o Google Docs', 'Fuentes y alcance']) {
    assert.ok(md.includes(`## ${heading}`), heading);
  }
  assert.match(md, /### Claude para Word/);
  assert.match(md, /### Claude en Google Docs/);
  assert.match(md, /no lo actives/);
  assert.match(md, /Lo que no hemos probado/);
  assert.match(md, /manda este orden: lo que pida tu docente, la guía de Biblioteca UPC y el manual APA 7/);
  assert.match(md, /Puede equivocarse/);
});

test('the essentials twin links the format guide and keeps the caveats', () => {
  const md = normasMarkdown();
  for (const heading of ['Lo esencial', 'De la 6.ª a la 7.ª edición', 'Preguntas frecuentes', 'Fuentes y alcance']) {
    assert.ok(md.includes(`## ${heading}`), heading);
  }
  assert.match(md, /https:\/\/campuscli\.com\/herramientas\/formato-apa-7\//);
  assert.match(md, /No es el manual oficial/);
  assert.match(md, /Puede equivocarse/);
});

test('table cells cannot split a Markdown row and every row has three cells', () => {
  for (const row of normasChanges) {
    assert.equal(row.length, 3);
    for (const cell of row) assert.doesNotMatch(cell, /[|\n]/, cell);
  }
  const rows = normasMarkdown().split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| Elemento'));
  for (const row of rows) assert.equal(row.split(/(?<!\\)\|/).length, 5, row);
});

test('shared lists are well formed pairs', () => {
  for (const list of [formatChecks, formatFaq, normasEssentials, normasFaq]) {
    for (const pair of list) {
      assert.equal(pair.length, 2);
      assert.ok(pair[0].length > 0 && pair[1].length > 0);
    }
  }
});
