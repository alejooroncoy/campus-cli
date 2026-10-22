import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { ResearchService } from '../src/providers/academic/research-service.js';
import { publicHttpsUrl } from '../src/providers/academic/research-http.js';
import { ResearchBrowserReading, type BrowserReadingOpen, MAX_BROWSER_PDF_BYTES } from '../src/providers/academic/research-browser-reading.js';
import { registerBrowserResearchTools } from '../src/providers/academic/research-browser-mcp-tools.js';
import { registerResearchTools } from '../src/providers/academic/research-mcp-tools.js';
import { localResearchBrowser } from '../src/providers/academic/research-browser.js';

const doi = '10.1234/browser-reading';
const title = 'Verified Browser Reading Study';
const excerpt = 'The intervention did not improve scores for the full cohort.';
const url = 'https://publisher.example/article?temporary=private-token';
const work = { DOI: doi, title: [title], type: 'journal-article',
  author: [{ given: 'Ana', family: 'Perez' }, { given: 'Sam', family: 'Lee' }],
  issued: { 'date-parts': [[2025]] }, 'container-title': ['Journal of Evidence'] };
const registry = new ResearchService(async value => value.includes('filter=')
  ? { message: { items: [], 'total-results': 0 } } : { message: work });

function pdfFixture(content = `${title}. Ana Perez; Sam Lee. 2025. Journal of Evidence. DOI: ${doi}. Abstract: ${excerpt}`) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1200 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1200 800] /Resources << >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const escaped = content.replace(/[\\()]/g, '\\$&');
  const stream = `BT /F1 12 Tf 20 700 Td (${escaped}) Tj ET`;
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return Buffer.from(`${pdf}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}

function harness(extra: Record<string, any> = {}) {
  let callbacks: Parameters<BrowserReadingOpen>[0]; let closes = 0; const saved: Buffer[] = [];
  const reader = new ResearchBrowserReading({
    validateUrl: async value => publicHttpsUrl(value), verifyDoi: registry.verifyDoi.bind(registry),
    openBrowser: async value => { callbacks = value; return { close: async () => { closes++; } }; },
    savePdf: async (_name, bytes) => { saved.push(Buffer.from(bytes)); return '/local/campus/research/verified.pdf'; },
    ...extra,
  });
  return { reader, saved, capture: (bytes = pdfFixture()) => callbacks.onPdf(bytes), closeBrowser: () => callbacks.onClosed(), closes: () => closes };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('human handoff automatically captures, verifies and reads the requested pages on the same bytes', async () => {
  const h = harness();
  try {
    const started = await h.reader.start({ doi, url, startPage: 2, pageCount: 1 }); await tick();
    assert.equal(h.reader.status(started).status, 'awaiting_user');
    assert.equal('document' in h.reader.status(started), false);
    await h.capture();
    const ready = h.reader.status(started);
    assert.equal(ready.status, 'ready'); assert.equal(ready.identityAllowed, true);
    assert.equal(ready.document?.pages[0].page, 2); assert.equal(ready.document?.nextPage, null);
    assert.equal(ready.sha256, createHash('sha256').update(pdfFixture()).digest('hex'));
    assert.equal(h.saved.length, 1); assert.deepEqual(h.saved[0], pdfFixture());
    assert.doesNotMatch(JSON.stringify(ready), /private-token|temporary=/);
    assert.equal(ready.citationReady, false); assert.ok(h.closes() >= 1);
    const first = await h.reader.read({ jobId: started.jobId, startPage: 1, pageCount: 1, expectedSha256: ready.sha256! });
    assert.match(first.document.pages[0].text, /did not improve/);
    const evidence = await h.reader.verify({ jobId: started.jobId, page: 1, excerpt, expectedSha256: ready.sha256! });
    assert.equal(evidence.evidenceAllowed, true); assert.equal(evidence.claimVerified, false);
    await assert.rejects(h.reader.read({ jobId: started.jobId, startPage: 1, expectedSha256: '0'.repeat(64) }), /huella/);
    await h.capture(); assert.equal(h.saved.length, 1);
  } finally { await h.reader.dispose(); }
});

test('HTML, oversized files and a PDF with another identity are never saved or returned as read evidence', async () => {
  for (const [bytes, reason] of [[Buffer.from('<html>Are you a robot?</html>'), 'invalid_or_oversized_pdf'],
    [Buffer.alloc(MAX_BROWSER_PDF_BYTES + 1), 'invalid_or_oversized_pdf'],
    [pdfFixture('Another Paper. DOI: 10.1234/other. Abstract: unrelated.'), 'downloaded_pdf_identity_mismatch']] as const) {
    const h = harness();
    try {
      const job = await h.reader.start({ doi, url }); await tick(); await h.capture(bytes);
      const state = h.reader.status(job);
      assert.equal(state.status, 'failed'); assert.equal(state.reason, reason);
      assert.equal(state.identityAllowed, false); assert.equal('document' in state, false); assert.equal(h.saved.length, 0);
    } finally { await h.reader.dispose(); }
  }
});

test('canonical identity and public URL are checked before opening a browser', async () => {
  let opens = 0;
  const h = harness({ openBrowser: async () => { opens++; throw new Error('should not open'); },
    verifyDoi: async () => { throw new Error('registry unavailable secret'); } });
  try {
    await assert.rejects(h.reader.start({ doi, url: 'https://127.0.0.1/file' }));
    const job = await h.reader.start({ doi, url });
    assert.equal(job.status, 'failed'); assert.equal(opens, 0);
    assert.doesNotMatch(JSON.stringify(job), /secret/);
  } finally { await h.reader.dispose(); }
});

test('concurrent starts are bounded and a duplicate does not open another session', async () => {
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const h = harness({ verifyDoi: async () => { await gate; return registry.verifyDoi(doi); } });
  try {
    const a = h.reader.start({ doi, url }); await tick();
    const duplicate = await h.reader.start({ doi, url });
    const b = h.reader.start({ doi, url: 'https://publisher.example/second' }); await tick();
    await assert.rejects(h.reader.start({ doi, url: 'https://publisher.example/third' }), /dos lecturas/);
    finish(); const first = await a; await b;
    assert.equal(first.jobId, duplicate.jobId);
  } finally { finish(); await h.reader.dispose(); }
});

test('cancellation, window closing and expiry release bytes and do not continue reading', async () => {
  const h = harness();
  const job = await h.reader.start({ doi, url }); await tick();
  h.closeBrowser(); await tick(); assert.throws(() => h.reader.status(job), /no existe/);
  await h.capture(); assert.equal(h.saved.length, 0); await h.reader.dispose();
  const expiring = harness({ ttlMs: 10 });
  const expired = await expiring.reader.start({ doi, url }); await tick();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(expiring.reader.status(expired).status, 'expired');
  await expiring.capture(); assert.equal(expiring.saved.length, 0); await expiring.reader.dispose();
});

test('MCP authorization fails before opening and browser tools are not exposed by hosted registration', async () => {
  const handlers = new Map<string, any>(); let allowed = false; const h = harness();
  const server = { registerTool(name: string, _config: any, handler: any) { handlers.set(name, handler); } } as any;
  registerBrowserResearchTools(server, { reader: h.reader, authorize: () => allowed });
  await assert.rejects(handlers.get('campus_research_start_browser_reading')({ doi, url }), /No autorizado/);
  allowed = true;
  const job = JSON.parse((await handlers.get('campus_research_start_browser_reading')({ doi, url })).content[0].text);
  await tick(); await h.capture();
  const result = await handlers.get('campus_research_browser_reading_status')(job);
  assert.equal(JSON.parse(result.content[0].text).status, 'ready'); await h.reader.dispose();
  handlers.clear(); registerResearchTools(server, { authorize: () => true });
  assert.equal([...handlers.keys()].some(name => name.includes('browser_reading')), false);
});

for (const manualPopup of [false, true]) test(`real Chromium resumes after the demo user action (${manualPopup ? 'manual popup' : 'automatic PDF link'})`,
  { skip: process.env.CAMPUS_BROWSER_TESTS !== '1', timeout: 30_000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'campus-browser-reading-test-'));
    const bytes = pdfFixture(); let pdfRequests = 0; let browser: Browser | undefined;
    const server = createServer((request, response) => {
      if (request.url === '/paper.pdf') {
        pdfRequests++; response.writeHead(200, { 'Content-Type': 'application/pdf' });
        // Deliberately chunked, so a Content-Length header is not required for bounded capture.
        response.write(bytes.subarray(0, 100)); response.end(bytes.subarray(100)); return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<title>Publisher demo</title><h1>Local verification flow test</h1><button onclick="this.outerHTML=\'<a target=_blank href=/paper.pdf>View PDF</a>\'">Continue demo</button>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const fixtureUrl = `http://127.0.0.1:${address.port}/article`;
    const validateFixture = async (value: string) => { const parsed = new URL(value); assert.equal(parsed.origin, new URL(fixtureUrl).origin); return parsed; };
    const reader = new ResearchBrowserReading({
      validateUrl: validateFixture, verifyDoi: registry.verifyDoi.bind(registry),
      openBrowser: localResearchBrowser({ validateUrl: validateFixture, launch: async () => {
        browser = await chromium.launch({ headless: true }); return browser;
      } }),
      savePdf: async (name, body) => { const file = join(directory, name); const { writeFile } = await import('node:fs/promises'); await writeFile(file, body, { flag: 'wx' }); return file; },
    });
    try {
      const job = await reader.start({ doi, url: fixtureUrl, pageCount: 1 });
      const waitFor = async (predicate: () => boolean) => { for (let i = 0; i < 150; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('local browser flow timed out '+JSON.stringify({state:reader.status(job).status,pdfRequests,pages:browser?.contexts()[0]?.pages().map(p=>p.url())})); };
      await waitFor(() => !!browser?.contexts()[0]?.pages()[0]);
      const page = browser!.contexts()[0].pages()[0];
      await page.getByRole('button', { name: 'Continue demo' }).waitFor();
      assert.equal(pdfRequests, 0); assert.notEqual(reader.status(job).status, 'ready');
      // Test fixture only: represents the human completing the provider's own UI. No real CAPTCHA is automated.
      await page.getByRole('button', { name: 'Continue demo' }).click();
      if (manualPopup) await page.getByRole('link', { name: 'View PDF' }).click();
      await waitFor(() => ['ready', 'failed'].includes(reader.status(job).status));
      const ready = reader.status(job);
      assert.equal(ready.status, 'ready', JSON.stringify(ready)); assert.equal(pdfRequests, 1);
      assert.deepEqual(await readFile(ready.localFile!), bytes);
      assert.match(ready.document!.pages[0].text, /did not improve/);
      assert.equal(ready.document!.nextPage, 2);
      const next = await reader.read({ jobId: job.jobId, expectedSha256: ready.sha256!, startPage: 2, pageCount: 1 });
      assert.equal(next.document.pages[0].page, 2); assert.equal(pdfRequests, 1);
    } finally {
      await reader.dispose(); await browser?.close().catch(() => {});
      await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true });
    }
  });
