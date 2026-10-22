import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyResearchDocumentIdentity } from '../src/providers/academic/research-evidence.js';
import { officialResearchAlternate, officialResearchPdf } from '../src/providers/academic/research-official-sources.js';
import { ResearchPdfIndex } from '../src/providers/academic/research-pdf-index.js';
import { publicHttpsUrl, ResearchHttpError } from '../src/providers/academic/research-http.js';
import { registerResearchTools } from '../src/providers/academic/research-mcp-tools.js';
import { verifyResearchQuote } from '../src/providers/academic/research-quote.js';

const routes = [
  ['https://www.mdpi.com/2227-9709/13/2/19',
    'https://mdpi-res.com/d_attachment/informatics/informatics-13-00019/article_deploy/informatics-13-00019.pdf'],
  ['https://www.mdpi.com/2076-3417/16/18/8936',
    'https://mdpi-res.com/d_attachment/applsci/applsci-16-08936/article_deploy/applsci-16-08936.pdf'],
  ['https://www.mdpi.com/2076-3417/15/11/6335',
    'https://mdpi-res.com/d_attachment/applsci/applsci-15-06335/article_deploy/applsci-15-06335.pdf'],
  ['https://www.mdpi.com/2079-9292/12/9/2055',
    'https://mdpi-res.com/d_attachment/electronics/electronics-12-02055/article_deploy/electronics-12-02055.pdf'],
  ['https://www.mdpi.com/2411-5134/10/4/46',
    'https://mdpi-res.com/d_attachment/inventions/inventions-10-00046/article_deploy/inventions-10-00046.pdf'],
  ['https://www.mdpi.com/2079-9292/12/8/1775',
    'https://mdpi-res.com/d_attachment/electronics/electronics-12-01775/article_deploy/electronics-12-01775.pdf'],
];

test('verified MDPI landing and PDF routes use public editorial files without changing versions', () => {
  for (const [source, pdf] of routes) {
    for (const suffix of ['', '/', '/pdf', '/pdf/']) {
      assert.deepEqual(officialResearchAlternate(source + suffix), { url: pdf, scope: 'full_article' });
      assert.equal(officialResearchPdf(source + suffix), pdf);
    }
    for (const suffix of ['/pdf?version=123', '?token=private', '#section', '/pdf-vor', '/xml', '/supplementary']) {
      assert.equal(officialResearchAlternate(source + suffix), null);
    }
    assert.equal(officialResearchAlternate(source.replace('www.mdpi.com', 'www.mdpi.com.evil.example')), null);
    assert.equal(officialResearchAlternate(source.replace('https://', 'https://secret@')), null);
  }
  assert.equal(officialResearchAlternate('https://www.mdpi.com/2076-3417/16/18/8937'), null);
});

test('only exact verified DOI aliases select the corresponding public editorial PDF', () => {
  const dois = ['10.3390/informatics13020019', '10.3390/app16188936', '10.3390/app15116335',
    '10.3390/electronics12092055', '10.3390/inventions10040046', '10.3390/electronics12081775'];
  for (const [index, doi] of dois.entries()) {
    for (const host of ['doi.org', 'dx.doi.org']) {
      for (const path of [doi, doi.toUpperCase(), encodeURIComponent(doi)]) {
        assert.equal(officialResearchPdf(`https://${host}/${path}`), routes[index][1]);
      }
    }
  }
  for (const url of [
    'https://doi.org/10.3390/app15116336', // Unverified neighboring record.
    'https://doi.org/10.3390/electronics12081775?version=1681024993',
    'https://doi.org/10.3390/electronics12081775#section',
    'https://doi.org:8443/10.3390/electronics12081775',
    'https://user:secret@doi.org/10.3390/electronics12081775',
    'https://doi.org.evil.example/10.3390/electronics12081775',
    'https://doi.org/10.3390%ZZ',
  ]) assert.equal(officialResearchAlternate(url), null, url);
});

test('MDPI aliases also work for background PDF indexing', async () => {
  for (const [source, pdf] of routes) {
    const index = new ResearchPdfIndex({ download: async url => {
      assert.equal(url, pdf);
      return { url, bytes: Buffer.from('%PDF-synthetic-index-test'), contentType: 'application/pdf' };
    }, extract: async (_bytes, emit) => {
      emit({ metadata: { totalPages: 1, outline: [] } });
      emit({ batch: [{ page: 1, text: 'Synthetic evidence.', truncated: false, needsOcr: false }] });
      return { totalPages: 1 };
    } });
    const started = index.start('mdpi-test', { url: source });
    await new Promise<void>(resolve => setImmediate(resolve));
    const status = index.status('mdpi-test', { documentId: started.documentId, analysisId: started.analysisId });
    assert.equal(status.status, 'ready');
    assert.equal(status.requestedUrl, source);
    assert.equal(status.resolvedUrl, pdf);
    assert.equal(status.indexedPages, 1);
    assert.deepEqual(status.readPages, []);
  }
});

// A synthetic first page reproduces the publication-footer layout; it is not
// a copy of the article or evidence of its scientific claims.
const sha256 = 'a'.repeat(64);
const title = 'A synthetic presentation analytics study';
const doi = '10.3390/app16188936';
const front = `Copyright: © 2026 by the authors.\nLicensee MDPI, Basel, Switzerland.\nArticle\n${title}\nAna Perez; Sam Lee\n\nAbstract\nSynthetic study content.`;
const footer = `Appl. Sci. 2026, 16, 8936 https://doi.org/${doi}`;
const input = { url: routes[1][1], format: 'pdf' as const, expectedTitle: title,
  expectedDoi: doi, expectedSha256: sha256, expectedAuthors: ['Ana Perez', 'Sam Lee'],
  expectedYear: 2026, expectedVenue: 'Applied Sciences' };
function document(text = `${front}\n\n${footer}`) {
  return { requestedUrl: input.url, resolvedUrl: input.url, retrievedAt: '2026-10-10T12:00:00Z',
    sha256, totalPages: 18, pages: [{ page: 1, text, truncated: false, needsOcr: false }], nextPage: 2, guidance: [] };
}

test('a MDPI DOI after the abstract requires matching first-page publication metadata', async () => {
  const verify = (args = input, text = `${front}\n\n${footer}`) =>
    verifyResearchDocumentIdentity(args, { readPdf: async () => document(text) });
  const result = await verify();
  assert.equal(result.identityAllowed, true);
  assert.equal(result.identityBasis, 'title_authors_journal_year_publisher_footer_doi_and_hash');
  const rejected = [
    [{ ...input, expectedVenue: undefined }, `${front}\n\n${footer}`],
    [{ ...input, expectedYear: undefined }, `${front}\n\n${footer}`],
    [{ ...input, expectedVenue: 'Informatics' }, `${front}\n\n${footer}`],
    [{ ...input, expectedYear: 2025 }, `${front}\n\n${footer}`],
    [{ ...input, expectedAuthors: ['Ana Perez', 'Ana Perez'] }, `${front}\n\n${footer}`],
    [{ ...input, expectedAuthors: ['Different Author', 'Sam Lee'] }, `${front}\n\n${footer}`],
    [{ ...input, expectedDoi: '10.3390/app16188937' }, `${front}\n\n${footer}`],
    [input, `${front.replace('Licensee MDPI, Basel, Switzerland.', '')}\n\n${footer}`],
    [input, `${front}\n\nReferences\n${footer}`],
    [input, `${front}\n\n${footer}\nReferences\nUnrelated citation.`],
    [input, `${front}\n\n${footer}\nBody continues with unrelated material.`],
  ] as const;
  for (const [args, text] of rejected) assert.equal((await verify(args, text)).identityAllowed, false);
});

test('source HTTP rejection names the effective source, not a Campus account denial', async () => {
  const error = new ResearchHttpError(403, false, false, null, null, 'www.mdpi.com');
  assert.match(error.message, /servidor de www\.mdpi\.com/);
  assert.match(error.message, /HTTP 403/);
  assert.match(error.message, /no especifica la causa/);
  assert.doesNotMatch(error.message, /Campus denegó|cuenta.*permisos/);
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, readDocument: async () => { throw error; },
    validateResourceUrl: async url => publicHttpsUrl(url) });
  const result = await handlers.get('campus_research_read_document')({ url: 'https://doi.org/10.3390/app16188936' });
  const failure = JSON.parse(result.content[0].text);
  assert.equal(failure.httpStatus, 403);
  assert.equal(failure.sourceHost, 'www.mdpi.com');
  assert.equal(failure.failureLayer, 'source_http');
  assert.equal(failure.reason, 'source_access_denied');
  assert.equal(failure.evidenceAllowed, false);
  assert.match(failure.guidance, /No se leyó el archivo/);
});

test('quotation identity receives the canonical journal needed for an MDPI footer', async () => {
  let checked = false;
  await verifyResearchQuote({ doi, url: input.url, expectedTitle: title, expectedSha256: sha256,
    format: 'pdf', page: 1, quote: 'Synthetic study content.' }, {
    service: { verifyCitation: async () => ({ citeAllowed: true, citationRecord: {
      title, doi, authors: input.expectedAuthors.map(name => ({ name })), year: 2026, venue: 'Applied Sciences',
    } }) } as any,
    verifyIdentity: async args => {
      assert.equal(args.expectedVenue, 'Applied Sciences');
      const identity = await verifyResearchDocumentIdentity(args, { readPdf: async () => document() });
      assert.equal(identity.identityAllowed, true);
      checked = true;
      return identity;
    },
    verifyEvidence: async () => ({ evidenceAllowed: false }) as any,
  });
  assert.equal(checked, true);
});
