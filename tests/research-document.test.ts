import assert from 'node:assert/strict';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { extractDocumentBytes } from '../src/providers/academic/research-document.js';

function text(result: ReturnType<typeof extractDocumentBytes>) {
  assert.notEqual(result.format, 'pdf');
  return result;
}

test('academic document reader extracts bounded HTML sections without scripts', () => {
  const result = text(extractDocumentBytes(Buffer.from(`<!doctype html><html><body><h1>Method</h1><p>Sample: 42 students.</p><script>ignore()</script><p>Result: improved fluency.</p></body></html>`), 'auto', 1, 4, 'text/html'));
  assert.equal(result.format, 'html');
  assert.match(result.sections.map(section => section.text).join(' '), /42 students/);
  assert.doesNotMatch(result.sections.map(section => section.text).join(' '), /ignore/);
});

test('academic document reader requires an explicit format for ZIP containers', () => {
  const zip = zipSync({ 'word/document.xml': strToU8('<w:document/>') });
  assert.throws(() => extractDocumentBytes(zip, 'auto'), /format="docx"/);
});

test('academic document reader extracts DOCX paragraphs and EPUB chapters', () => {
  const docx = zipSync({ 'word/document.xml': strToU8('<w:document><w:body><w:p><w:t>Objective</w:t></w:p><w:p><w:t>Study with 80 students.</w:t></w:p></w:body></w:document>') });
  const docxResult = text(extractDocumentBytes(docx, 'docx'));
  assert.equal(docxResult.format, 'docx');
  assert.match(docxResult.sections.map(section => section.text).join(' '), /80 students/);
  const epub = zipSync({ 'OPS/chapter-1.xhtml': strToU8('<html><body><h1>Results</h1><p>Feedback improved delivery.</p></body></html>') });
  const epubResult = text(extractDocumentBytes(epub, 'epub'));
  assert.equal(epubResult.format, 'epub');
  assert.match(epubResult.sections.map(section => section.text).join(' '), /improved delivery/);
});

test('academic document reader delegates PDFs to the page reader', () => {
  assert.deepEqual(extractDocumentBytes(Buffer.from('%PDF-1.4\n'), 'auto'), { format: 'pdf', delegated: true });
});
