import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { researchHtmlNavigation, resolveResearchHtmlPdf } from '../src/providers/academic/research-html.js';
import { readResearchDocument } from '../src/providers/academic/research-document.js';
import { ResearchPdfIndex } from '../src/providers/academic/research-pdf-index.js';

const wrapperUrl = 'https://publisher.example.edu/viewer';
const pdfUrl = 'https://publisher.example.edu/article.pdf?part=1&version=2';
function html(body: string) {
  return { bytes: Buffer.from(body), url: wrapperUrl, contentType: 'text/html;charset=UTF-8' };
}
const viewer = html(`<html><head><title>Full text PDF</title></head><body><iframe src="/article.pdf?part=1&amp;version=2"></iframe></body></html>`);

test('HTML navigation reads escaped relative PDF frames without mistaking scripts for documents', () => {
  const navigation = researchHtmlNavigation(html(`<html><head><meta name="citation_pdf_url" content="${pdfUrl}">
    <script>"<iframe src='https://attacker.example/fake.pdf'>"</script></head><body><iframe src='/article.pdf?part=1&amp;version=2'></iframe></body></html>`))!;
  assert.equal(navigation.role, 'embedded_document_viewer');
  assert.equal(navigation.embeddedPdfCount, 1);
  assert.deepEqual(navigation.links, [{ url: pdfUrl, via: 'embedded_pdf', read: false }]);
});

test('HTML documents expose PDF discovery leads and keep their own text without fetching other versions', async () => {
  let requests = 0;
  const source = html(`<html><head><meta name='citation_pdf_url' content='/article.pdf'></head><body><main>
    <h1>Methods</h1><p>A study included 42 students.</p></main><iframe src='/article.pdf'></iframe></body></html>`);
  const result = await readResearchDocument({ url: wrapperUrl }, { download: async () => { requests++; return source; } });
  assert.equal(requests, 1);
  assert.ok('sections' in result);
  assert.match(result.sections.map(section => section.text).join(' '), /42 students/);
  assert.equal(result.sourceNavigation?.role, 'html_document');
  assert.equal(result.sourceNavigation?.links[0].read, false);
});

test('document reading parses an embedded PDF once and preserves actual page evidence', async () => {
  const stream = 'BT /F1 12 Tf 20 700 Td (Verified embedded document.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let source = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) source += `${String(offset).padStart(10, '0')} 00000 n \n`;
  const bytes = Buffer.from(`${source}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const calls: string[] = [];
  const result = await readResearchDocument({ url: wrapperUrl, format: 'html' }, { download: async url => {
    calls.push(url);
    return url === wrapperUrl ? viewer : { bytes, url, contentType: 'application/pdf' };
  } });
  assert.deepEqual(calls, [wrapperUrl, pdfUrl]);
  assert.ok('pages' in result);
  assert.equal(result.pages[0].page, 1);
  assert.match(result.pages[0].text, /Verified embedded document/);
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(result.sourceNavigation?.wrapperSha256, createHash('sha256').update(viewer.bytes).digest('hex'));
});

test('single-PDF viewers reuse the wrapper and fetch only the explicit public PDF', async () => {
  const calls: string[] = [];
  const pdf = Buffer.from('%PDF-1.7\nsource');
  const result = await resolveResearchHtmlPdf(viewer, { maxBytes: 20 * 1024 * 1024, redirects: 4 }, async (url, options) => {
    calls.push(url);
    assert.equal(options?.maxBytes, 20 * 1024 * 1024);
    assert.equal(options?.redirects, 4);
    return { bytes: pdf, url, contentType: 'application/pdf' };
  });
  assert.deepEqual(calls, [pdfUrl]);
  assert.equal(result.bytes, pdf);
  assert.equal(result.htmlNavigation?.wrapperSha256, createHash('sha256').update(viewer.bytes).digest('hex'));
  assert.equal(result.htmlNavigation?.linkedDocument?.status, 'retrieved');
});

test('HTML navigation refuses unsafe URLs, ambiguous frames and recursive HTML viewers', async () => {
  let calls = 0;
  const download = async (url: string) => { calls++; return { ...viewer, url }; };
  for (const source of [html('<html><body><iframe src="http://127.0.0.1/file.pdf"></iframe></body></html>'),
    html('<html><body><iframe src="https://127.0.0.1/file.pdf"></iframe></body></html>'),
    html('<html><body><iframe src="https://example.internal/file.pdf"></iframe></body></html>'),
    html('<html><body><iframe src="/a.pdf"></iframe><iframe src="/b.pdf"></iframe></body></html>')]) {
    await resolveResearchHtmlPdf(source, {}, download);
  }
  assert.equal(calls, 0);
  const result = await resolveResearchHtmlPdf(viewer, {}, download);
  assert.equal(calls, 1);
  assert.equal(result.htmlNavigation?.linkedDocument?.status, 'not_read');
  assert.match(result.htmlNavigation!.linkedDocument!.reason!, /no devolvió un PDF/);
});

test('a failed embedded PDF returns viewer coverage without inventing article evidence', async () => {
  const calls: string[] = [];
  const result = await readResearchDocument({ url: wrapperUrl }, { download: async url => {
    calls.push(url);
    if (url === wrapperUrl) return viewer;
    throw new Error('El proveedor respondió HTTP 403.');
  } });
  assert.deepEqual(calls, [wrapperUrl, pdfUrl]);
  assert.ok('sections' in result);
  assert.equal(result.accessScope, 'viewer_only');
  assert.equal(result.evidenceAllowed, false);
  assert.deepEqual(result.sections, []);
  assert.match(result.sourceNavigation!.linkedDocument!.reason!, /403/);
});

test('PDF indexing follows an HTML viewer and hashes only the actual PDF bytes', async () => {
  const calls: string[] = [];
  const pdf = Buffer.from('%PDF-1.7\nsource');
  const index = new ResearchPdfIndex({
    download: async url => { calls.push(url); return url === wrapperUrl ? viewer : { bytes: pdf, url, contentType: 'application/pdf' }; },
    extract: async (bytes, onEvent) => {
      assert.equal(bytes, pdf);
      onEvent({ metadata: { totalPages: 1, outline: [] } });
      onEvent({ batch: [{ page: 1, text: 'Study results', truncated: false, needsOcr: false }] });
    },
  });
  const started = index.start('student-a', { url: wrapperUrl });
  let status;
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setImmediate(resolve));
    status = index.status('student-a', { documentId: started.documentId, analysisId: started.analysisId });
    if (status.status === 'ready') break;
  }
  assert.equal(status!.status, 'ready');
  assert.equal(status!.requestedUrl, wrapperUrl);
  assert.equal(status!.resolvedUrl, pdfUrl);
  assert.equal(status!.sha256, createHash('sha256').update(pdf).digest('hex'));
  assert.deepEqual(calls, [wrapperUrl, pdfUrl]);
});
