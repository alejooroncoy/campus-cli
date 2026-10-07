import assert from 'node:assert/strict';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { extractDocumentBytes, documentInput, readResearchDocument } from '../src/providers/academic/research-document.js';
import { createHash } from 'node:crypto';
import dns from 'node:dns/promises';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

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

test('academic document reader keeps ordinary PK-prefixed text', () => {
  const result = text(extractDocumentBytes(Buffer.from('PK modeling is ordinary text.'), 'auto', 1, 1, 'text/plain'));
  assert.equal(result.format, 'text');
  assert.match(result.sections[0]!.text, /PK modeling/);
});

test('academic document reader identifies DOCX contents automatically without trusting a format hint', () => {
  const zip = zipSync({ 'word/document.xml': strToU8('<w:document><w:p><w:t>Document evidence.</w:t></w:p></w:document>') });
  for (const hint of ['auto', 'epub', 'xlsx'] as const) {
    const result = text(extractDocumentBytes(zip, hint));
    assert.equal(result.format, 'docx');
    assert.match(result.sections[0].text, /Document evidence/);
  }
  assert.throws(() => extractDocumentBytes(zipSync({ 'data.bin': strToU8('unknown') }), 'auto'), /no identifica.*DOCX, EPUB o XLSX/);
  assert.throws(() => extractDocumentBytes(zipSync({ 'word/document.xml': strToU8('<w:document/>'), 'xl/workbook.xml': strToU8('<workbook/>') }), 'auto'), /varios tipos de documento/);
});

test('academic document reader extracts DOCX footnotes and endnotes', () => {
  const docx = zipSync({
    'word/document.xml': strToU8('<w:document><w:body><w:p><w:t>Body evidence.</w:t></w:p></w:body></w:document>'),
    'word/footnotes.xml': strToU8('<w:footnotes><w:footnote><w:p><w:t>Footnote citation.</w:t></w:p></w:footnote></w:footnotes>'),
    'word/endnotes.xml': strToU8('<w:endnotes><w:endnote><w:p><w:t>Endnote evidence.</w:t></w:p></w:endnote></w:endnotes>'),
  });
  const result = text(extractDocumentBytes(docx, 'docx', 1, 8));
  assert.match(result.sections.map(section => section.text).join(' '), /Body evidence.*Footnote citation.*Endnote evidence/);
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

test('academic document reader rejects declared formats that contradict binary signatures', () => {
  assert.throws(
    () => extractDocumentBytes(Buffer.from('%PDF-1.4\n'), 'html'),
    /archivo es PDF.*format="auto"/,
  );
  const zip = zipSync({ 'word/document.xml': strToU8('<w:document/>') });
  assert.throws(() => extractDocumentBytes(zip, 'html'), /archivo es ZIP.*format="docx"/);
  assert.throws(
    () => extractDocumentBytes(Buffer.from('<html><body>Evidence</body></html>'), 'docx'),
    /no es un contenedor DOCX v[aá]lido/,
  );
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

test('academic document reader auto-detects XML roots beyond the sniff prefix', () => {
  const result = text(extractDocumentBytes(Buffer.from(`<TEI><p>${'x'.repeat(600)}Repository evidence.</p></TEI >`), 'auto'));
  assert.equal(result.format, 'xml');
  assert.match(result.sections[0]!.text, /Repository evidence/);
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

test('HTML reader accepts a public repository file served only for wildcard Accept', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  t.mock.method(https, 'request', ((_url: URL, options: any, callback: (response: any) => void) => {
    const accepted = options.headers.Accept.includes('*/*;q=0.1');
    const request = new EventEmitter() as any;
    request.end = () => {
      const body = Readable.from([Buffer.from('<main><h1>Repository article</h1><p>Verified text in the file.</p></main>')]) as any;
      body.statusCode = accepted ? 200 : 406;
      body.headers = { 'content-type': 'text/plain; charset=utf-8' };
      queueMicrotask(() => callback(body));
    };
    return request;
  }) as any);
  const result = await readResearchDocument({ url: 'https://repository.example.edu/article.html/content',
    format: 'html' });
  assert.equal(result.format, 'html');
  assert.match(result.sections[0].text, /Repository article/);
});

test('document reader negotiates public JSON API responses instead of receiving an unsupported-media error', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  let requests = 0;
  t.mock.method(https, 'request', ((_url: URL, options: any, callback: (response: any) => void) => {
    requests++;
    const accepted = options.headers.Accept.split(',').some((value: string) => value.trim() === 'application/json');
    const request = new EventEmitter() as any;
    request.end = () => {
      const response = Readable.from([Buffer.from('{"files":[{"key":"data.csv"}]}')]) as any;
      response.statusCode = accepted ? 200 : 415;
      response.headers = { 'content-type': 'application/json' };
      queueMicrotask(() => callback(response));
    };
    return request;
  }) as typeof https.request);
  const result = await readResearchDocument({ url: 'https://repository.example.edu/api/record' });
  assert.equal(result.format, 'text');
  assert.match(result.sections[0].text, /data\.csv/);
  assert.equal(requests, 1);
});

test('document reader keeps explicit text and markdown requests from preferring a JSON representation', async () => {
  for (const format of ['text', 'markdown'] as const) {
    const result = await readResearchDocument({ url: 'https://repository.example.edu/article', format }, {
      download: async (url, options) => {
        assert.doesNotMatch(options.headers!.Accept, /application\/json/);
        return { url, bytes: Buffer.from('Document evidence.'), contentType: format === 'text' ? 'text/plain' : 'text/markdown' };
      },
    });
    assert.equal(result.format, format);
    assert.equal(result.sections[0].text, 'Document evidence.');
  }
});

test('HTML reader prioritizes the article main element over repeated site navigation', () => {
  const markup = `<html><body><nav>${'<p>Site navigation</p>'.repeat(300)}</nav><main>
    <h1>A documented study of learning</h1><p>The study included 42 students and measured reading outcomes.</p>
    <p>The reported effect was limited to the observed cohort and did not prove a broader causal claim.</p>
    </main></body></html>`;
  const result = text(extractDocumentBytes(Buffer.from(markup), 'html'));
  const content = result.sections.map(section => `${section.heading ?? ''} ${section.text}`).join(' ');
  assert.match(content, /42 students/);
  assert.match(content, /did not prove/);
  assert.doesNotMatch(content, /Site navigation/);
  assert.ok(result.totalSections < 10);
});

test('PLOS HTML extraction joins editorial identity to article body and removes site navigation', () => {
  const markup = `<html><body><main id="main-content"><div class="site-nav">${'<p>Publish Submissions</p>'.repeat(30)}</div>
    <div class="title-authors"><h1 id="artTitle">A Correction with a DOI</h1><ul class="author-list"><li>Ana Lee</li><li>Bo Quan</li></ul></div>
    <ul class="date-doi"><li>Published: March 21, 2024</li><li id="artDoi"><a href="https://doi.org/10.1234/correction">10.1234/correction</a></li></ul>
    <div id="artText"><div class="section"><p>The images are incorrectly switched.</p></div>
      <div class="section"><h2>References</h2><p>Lee et al. (2016). Earlier work.</p></div></div></main></body></html>`;
  const result = text(extractDocumentBytes(Buffer.from(markup), 'html'));
  const content = result.sections.map(section => `${section.heading ?? ''} ${section.text}`).join('\n');
  assert.match(content, /A Correction with a DOI/);
  assert.match(content, /Ana Lee/);
  assert.match(content, /10\.1234\/correction/);
  assert.match(content, /The images are incorrectly switched/);
  assert.match(content, /References/);
  assert.doesNotMatch(content, /Publish Submissions/);
  assert.ok(result.totalSections < 10);
});

test('HTML reader decodes common named and numeric entities before excerpt checks', () => {
  const markup = '<html><main><h1>Evidence &mdash; Results</h1>'
    + '<p>Authors&#8217; estimates were 42&nbsp;percent &ndash; not 24&#x25;.</p>'
    + '<p>Literal &amp;mdash; stays escaped once.</p></main></html>';
  const result = text(extractDocumentBytes(Buffer.from(markup), 'html'));
  const content = result.sections.map(section => `${section.heading ?? ''} ${section.text}`).join(' ');
  assert.match(content, /Evidence — Results/);
  assert.match(content, /Authors’ estimates were 42 percent – not 24%\./);
  assert.match(content, /Literal &mdash; stays escaped once/);
});

test('PubMed XML separates citation identity, abstract, and references into bounded sections', () => {
  const xml = `<?xml version="1.0"?><PubmedArticleSet><PubmedArticle><MedlineCitation>
    <PMID Version="1">34265844</PMID><Article><Journal><Title>Nature</Title><JournalIssue><PubDate><Year>2021</Year></PubDate><Volume>596</Volume><Issue>7873</Issue></JournalIssue></Journal>
    <ArticleTitle>Highly accurate protein structure prediction with <i>AlphaFold</i></ArticleTitle>
    <AuthorList><Author><ForeName>John</ForeName><LastName>Jumper</LastName></Author></AuthorList>
    <Abstract><AbstractText>Proteins are essential to life, and understanding their structure can facilitate a mechanistic understanding of their function.</AbstractText></Abstract>
    </Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="pubmed">34265844</ArticleId><ArticleId IdType="doi">10.1038/s41586-021-03819-2</ArticleId></ArticleIdList>
    <ReferenceList><Reference><Citation>Tunyasuvunakool K. Highly accurate protein structure prediction for the human proteome. Nature (2021).</Citation><ArticleIdList><ArticleId IdType="doi">10.1038/s41586-021-03828-1</ArticleId></ArticleIdList></Reference></ReferenceList></PubmedData></PubmedArticle></PubmedArticleSet>`;
  const result = text(extractDocumentBytes(Buffer.from(xml), 'xml', 1, 10, 'application/xml'));
  assert.equal(result.format, 'xml');
  assert.equal(result.totalSections, 3);
  assert.match(result.sections[0].text, /Highly accurate protein structure prediction with AlphaFold/);
  assert.match(result.sections[0].text, /10\.1038\/s41586-021-03819-2/);
  assert.equal(result.sections[1].heading, 'Abstract');
  assert.match(result.sections[1].text, /Proteins are essential to life/);
  assert.equal(result.sections[2].heading, 'References');
  assert.match(result.sections[2].text, /10\.1038\/s41586-021-03828-1/);
  assert.equal(result.sections[2].truncated, false);
});

test('PubMed XML rejects multi-record payloads that cannot provide one DOI-to-document identity', () => {
  assert.throws(() => extractDocumentBytes(Buffer.from('<PubmedArticleSet><PubmedArticle/><PubmedArticle/></PubmedArticleSet>'),
    'xml'), /varios registros PubMed/);
});

test('text reader permits pagination through a long document', () => {
  const longText = Array.from({ length: 1200 }, (_, index) => `Section ${index + 1}\n${'Evidence sentence. '.repeat(6)}`).join('\n\n');
  const first = text(extractDocumentBytes(Buffer.from(longText), 'text', 1, 1));
  assert.equal(first.textCoverage, 'complete');
  const last = text(extractDocumentBytes(Buffer.from(longText), 'text', first.totalSections, 1));
  assert.equal(last.nextSection, null);
  assert.equal(last.sections[0].truncated, false);
  assert.equal(last.textCoverage, 'complete');
});

test('CSV reading keeps each row and quoted cell together, including semicolon and embedded newline', () => {
  const csv = 'Country;Year;Population;Note\r\nPeru;2023;33845617;"Observed\r\nvalue"\r\n';
  const result = text(extractDocumentBytes(Buffer.from(csv), 'csv'));
  const content = result.sections.map(section => section.text).join('\n');
  assert.equal(result.format, 'csv');
  assert.match(content, /Row 1: Country="Country"; Year="Year"; Population="Population"/);
  assert.match(content, /Row 2: Country="Peru"; Year="2023"; Population="33845617"; Note="Observed\\nvalue"/);
  assert.throws(() => extractDocumentBytes(Buffer.from('a,b\n"unfinished,x'), 'csv'), /entrecomillada/);
});

test('XLSX reading detects actual workbook contents, preserving coordinates even with a DOCX hint', async () => {
  const xlsx = zipSync({
    'xl/workbook.xml': strToU8('<workbook xmlns:r="x"><sheets><sheet name="World Bank data" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="worksheet"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8('<sst><si><t>Country</t></si><si><t>Year</t></si><si><t>Population</t></si><si><t>Peru</t></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>2023</v></c><c r="C2"><v>33845617</v></c></row></sheetData></worksheet>'),
  });
  for (const hint of ['auto', 'docx', 'epub'] as const) {
    const detected = text(extractDocumentBytes(xlsx, hint));
    assert.equal(detected.format, 'xlsx');
    assert.match(detected.sections.map(section => section.text).join(' '), /C2="33845617"/);
  }
  const result = text(extractDocumentBytes(xlsx, 'xlsx'));
  const content = result.sections.map(section => `${section.heading ?? ''} ${section.text}`).join('\n');
  assert.equal(result.format, 'xlsx');
  assert.match(content, /Sheet "World Bank data", row 1: A1="Country"; B1="Year"; C1="Population"/);
  assert.match(content, /Sheet "World Bank data", row 2: A2="Peru"; B2="2023"; C2="33845617"/);
  const downloaded = await readResearchDocument({ url: 'https://repository.example.edu/table.docx', format: 'docx' }, {
    download: async () => ({ bytes: Buffer.from(xlsx), url: 'https://repository.example.edu/table.docx', contentType: 'application/octet-stream' }),
  });
  assert.equal(downloaded.format, 'xlsx');
  assert.equal((downloaded as { requestedFormat?: string }).requestedFormat, 'docx');
  assert.equal(downloaded.sha256, createHash('sha256').update(xlsx).digest('hex'));
});

test('redirected PDF is downloaded once and its exact bytes become the citation hash', async t => {
  const stream = 'BT /F1 12 Tf 20 700 Td (A verified source sentence.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  const bytes = Buffer.from(`${pdf}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  t.mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  const responses = [
    { status: 302, location: 'https://cdn.example.edu/article.pdf', body: Buffer.alloc(0) },
    { status: 200, location: undefined, body: bytes },
  ];
  let requests = 0;
  t.mock.method(https, 'request', ((_url: URL, _options: unknown, callback: (response: any) => void) => {
    const response = responses.shift();
    assert.ok(response, 'unexpected second PDF download');
    requests++;
    const request = new EventEmitter() as any;
    request.end = () => {
      const body = Readable.from([response.body]) as any;
      body.statusCode = response.status;
      body.headers = { location: response.location, 'content-type': response.status === 200 ? 'application/pdf' : '' };
      queueMicrotask(() => callback(body));
    };
    return request;
  }) as any);
  const result = await readResearchDocument({ url: 'https://publisher.example.edu/article', format: 'auto' });
  assert.ok('pages' in result);
  assert.equal(requests, 2);
  assert.equal(result.resolvedUrl, 'https://cdn.example.edu/article.pdf');
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.match(result.pages[0].text, /verified source sentence/);
});
