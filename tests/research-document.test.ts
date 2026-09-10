import assert from 'node:assert/strict';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { extractDocumentBytes } from '../src/providers/academic/research-document.js';
import { documentInput } from '../src/providers/academic/research-document.js';

function text(result: ReturnType<typeof extractDocumentBytes>) {
  assert.notEqual(result.format, 'pdf');
  return result;
}

test('academic document reader extracts bounded HTML sections without scripts', () => {
  const result = text(extractDocumentBytes(Buffer.from(`<!doctype html><html><body><h1>Method</h1><p>Sample: 42 students.</p><script>ignore()</script ><style>also-ignore</style\n><p>Result: improved fluency.</p></body></html>`), 'auto', 1, 4, 'text/html'));
  assert.equal(result.format, 'html');
  assert.match(result.sections.map(section => section.text).join(' '), /42 students/);
  assert.doesNotMatch(result.sections.map(section => section.text).join(' '), /ignore|also-ignore/);
});

test('academic document reader decodes named and numeric character references', () => {
  const result = text(extractDocumentBytes(Buffer.from('<p>Garc&iacute;a &ndash; \u03b1 &#8212; &#x3B2;</p>'), 'html'));
  assert.match(result.sections.map(section => section.text).join(' '), /García – α — β/);
});

test('academic document reader preserves literal entities in archive text', () => {
  const docx = zipSync({ 'word/document.xml': strToU8('<w:document><w:body><w:p><w:t>&amp;lt;</w:t></w:p></w:body></w:document>') });
  const result = text(extractDocumentBytes(docx, 'docx'));
  assert.equal(result.sections[0]?.text, '&lt;');
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

test('academic document reader pages long DOCX files by paragraph', () => {
  const docx = zipSync({ 'word/document.xml': strToU8(`<w:document><w:body>
    <w:p><w:t>${'a'.repeat(12_001)}</w:t></w:p><w:p><w:t>Methods remain available.</w:t></w:p>
    </w:body></w:document>`) });
  const result = text(extractDocumentBytes(docx, 'docx', 3, 1));
  assert.equal(result.totalSections, 3);
  assert.match(result.sections[0].text, /Methods remain available/);
  assert.equal(result.nextSection, null);
});

test('academic document reader follows namespace-prefixed EPUB spine order', () => {
  const epub = zipSync({
    'META-INF/container.xml': strToU8('<container><rootfiles><ocf:rootfile full-path="OPS/book.opf"/></rootfiles></container>'),
    'OPS/book.opf': strToU8('<opf:package><opf:manifest><opf:item id="two" href="two.xhtml"/><opf:item id="one" href="one.xhtml"/></opf:manifest><opf:spine><opf:itemref idref="two"/><opf:itemref idref="one"/></opf:spine></opf:package>'),
    'OPS/one.xhtml': strToU8('<html><body><p>First by spine.</p></body></html>'),
    'OPS/two.xhtml': strToU8('<html><body><p>Second by spine.</p></body></html>'),
  });
  const result = text(extractDocumentBytes(epub, 'epub'));
  assert.deepEqual(result.sections.map(section => section.text), ['Second by spine.', 'First by spine.']);
});

test('academic document reader follows EPUB spine order', () => {
  const epub = zipSync({
    'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'),
    'OPS/book.opf': strToU8('<package><manifest><item id="one" href="chapter-1.xhtml"/><item id="two" href="chapter-2.xhtml"/><item id="ten" href="chapter-10.xhtml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/><itemref idref="ten"/></spine></package>'),
    'OPS/chapter-1.xhtml': strToU8('<html><body><p>First chapter.</p></body></html>'),
    'OPS/chapter-2.xhtml': strToU8('<html><body><p>Second chapter.</p></body></html>'),
    'OPS/chapter-10.xhtml': strToU8('<html><body><p>Tenth chapter.</p></body></html>'),
    'OPS/nav.xhtml': strToU8('<html><body><p>Navigation that is not evidence.</p></body></html>'),
  });
  const result = text(extractDocumentBytes(epub, 'epub', 1, 3));
  assert.deepEqual(result.sections.map(section => section.text), ['First chapter.', 'Second chapter.', 'Tenth chapter.']);
});

test('academic document reader decodes escaped EPUB spine paths', () => {
  const epub = zipSync({
    'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'),
    'OPS/book.opf': strToU8('<package><manifest><item id="chapter" href="chapter%201.xhtml"/></manifest><spine><itemref idref="chapter"/></spine></package>'),
    'OPS/chapter 1.xhtml': strToU8('<html><body><p>Escaped chapter is included.</p></body></html>'),
  });
  const result = text(extractDocumentBytes(epub, 'epub'));
  assert.deepEqual(result.sections.map(section => section.text), ['Escaped chapter is included.']);
});

test('academic document reader bounds all ZIP entries before selecting content', () => {
  const files = Object.fromEntries(Array.from({ length: 201 }, (_, index) => [`ignored/${index}.bin`, strToU8('x')]));
  assert.throws(() => extractDocumentBytes(zipSync(files), 'epub'), /límite de análisis seguro/);
});

test('academic document reader delegates PDFs to the page reader', () => {
  assert.deepEqual(extractDocumentBytes(Buffer.from('%PDF-1.4\n'), 'auto'), { format: 'pdf', delegated: true });
});

test('academic document reader keeps later sections available after a large prefix', () => {
  const prefix = 'a'.repeat(100_001);
  const result = text(extractDocumentBytes(Buffer.from(`${prefix}\n\nMethods\nParticipants were surveyed.`), 'text', 10, 1));
  assert.equal(result.totalSections, 10);
  assert.equal(result.sections[0].heading, 'Methods');
  assert.match(result.sections[0].text, /Participants/);
});

test('academic document reader pages long JATS paragraphs without losing later evidence', () => {
  const jats = `<article><body><sec><p>${'a'.repeat(12_001)}</p><p>Results remain available.</p></sec></body></article>`;
  const result = text(extractDocumentBytes(Buffer.from(jats), 'jats', 3, 1));
  assert.equal(result.totalSections, 3);
  assert.match(result.sections[0].text, /Results remain available/);
});

test('academic document reader uses the PDF reader page limit', () => {
  assert.throws(() => documentInput.parse({ url: 'https://example.edu/study.pdf', sectionCount: 21 }));
});


test('academic document reader preserves literal entities in plain text', () => {
  const result = text(extractDocumentBytes(Buffer.from('&lt;tag&gt; &#8212;'), 'text'));
  assert.equal(result.sections[0]?.text, '&lt;tag&gt; &#8212;');
});

test('academic document reader detects UTF-16 markup without a content type', () => {
  const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<html><body><p>UTF sixteen.</p></body></html>', 'utf16le')]);
  const result = text(extractDocumentBytes(bytes, 'auto'));
  assert.equal(result.format, 'html');
  assert.match(result.sections[0]!.text, /UTF sixteen/);
});

test('academic document reader gives a UTF-16 BOM precedence over a stale charset', () => {
  const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<html><body><p>BOM wins.</p></body></html>', 'utf16le')]);
  const result = text(extractDocumentBytes(bytes, 'auto', 1, 1, 'text/html; charset=utf-8'));
  assert.equal(result.format, 'html');
  assert.match(result.sections[0]!.text, /BOM wins/);
});

test('academic document reader honors declared public text encodings', () => {
  const latin = text(extractDocumentBytes(Buffer.from([0x43, 0x61, 0x66, 0xe9]), 'text', 1, 1, 'text/plain; charset=windows-1252'));
  assert.equal(latin.sections[0].text, 'Café');
  const xml = text(extractDocumentBytes(Buffer.from('<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?><article><p>Perú</p></article>', 'latin1'), 'xml'));
  assert.match(xml.sections[0].text, /Perú/);
  assert.throws(() => extractDocumentBytes(Buffer.from('text'), 'text', 1, 1, 'text/plain; charset=shift_jis'), /codificación no compatible/);
});


test('academic document reader honors HTML meta charset declarations', () => {
  const html = Buffer.from('<html><head><meta http-equiv=\"Content-Type\" content=\"text/html; charset=windows-1252\"></head><body><p>Café</p></body></html>', 'latin1');
  const result = text(extractDocumentBytes(html, 'html'));
  assert.match(result.sections[0]!.text, /Café/);
});

test('academic document reader limits pathological section counts without materializing them', () => {
  assert.throws(() => extractDocumentBytes(Buffer.from('x\n\n'.repeat(50_001)), 'text'), /demasiadas secciones/);
});
