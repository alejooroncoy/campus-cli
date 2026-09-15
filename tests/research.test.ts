import assert from 'node:assert/strict';
import test from 'node:test';
import { ResearchService, normalizeDoi, scholarSearchLinks } from '../src/providers/academic/research-service.js';
import { assertPublicAddress, publicHttpsUrl, ResearchHttpError } from '../src/providers/academic/research-http.js';
import { extractPdfBytes } from '../src/providers/academic/research-pdf.js';
import { registerResearchTools } from '../src/providers/academic/research-mcp-tools.js';
import { verifyResearchEvidence } from '../src/providers/academic/research-evidence.js';

const work = { DOI: '10.1234/ABC', title: ['Evidence'], type: 'journal-article',
  author: [{ given: 'Ana', family: 'Perez' }], issued: { 'date-parts': [[2024]] },
  'container-title': ['Journal of Evidence'], volume: '12', issue: '3', page: '41-52',
  'article-number': 'e123' };
const collection = (items: unknown[], total = items.length) => ({ message: { items, 'total-results': total } });
const acceptTestResourceUrl = async (value: string) => publicHttpsUrl(value);

test('Crossref search preserves provenance, encodes query and does not invent peer review', async () => {
  const service = new ResearchService(async url => {
    const u = new URL(url);
    assert.equal(u.searchParams.get('query.bibliographic'), 'educación & salud');
    assert.equal(u.searchParams.get('offset'), '10');
    assert.equal(u.searchParams.get('filter'), 'from-pub-date:2020-01-01,until-pub-date:2025-12-31');
    return collection([work], 40);
  });
  const result = await service.search({ query: 'educación & salud', yearFrom: 2020, yearTo: 2025, page: 2 });
  const source = result.results[0] as any;
  assert.equal(source.doi, '10.1234/abc');
  assert.deepEqual(source.authors, ['Ana Perez']);
  assert.equal(source.peerReview, 'unknown');
  assert.equal(source.retractionStatus, 'not_checked');
  assert.equal(result.nextPage, 3);
  assert.ok(result.retrievedAt);
});

test('OpenAlex returns repository version and license separately from peer review', async () => {
  const service = new ResearchService(async url => {
    assert.equal(new URL(url).searchParams.get('filter'), 'locations.source.type:repository');
    assert.equal(new URL(url).searchParams.get('api_key'), 'secret');
    return { meta: { count: 1 }, results: [{ id: 'https://openalex.org/W123', display_name: 'Thesis',
      type: 'dissertation', doi: null, is_retracted: false,
      locations: [{ source: { type: 'repository', display_name: 'University repository' },
        is_oa: true, version: 'submittedVersion', license: 'cc-by', pdf_url: 'https://example.edu/paper.pdf' }] }] };
  }, { OPENALEX_API_KEY: 'secret' });
  const result = await service.search({ query: 'education', provider: 'openalex', repositoriesOnly: true });
  const source = result.results[0] as any;
  assert.equal(source.repositoryLocations[0].version, 'submittedVersion');
  assert.equal(source.peerReview, 'unknown');
  assert.equal(source.doi, null);
  assert.equal(source.retractionStatus, 'not_flagged_by_openalex');
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.equal(new URL(result.requestUrl).searchParams.get('api_key'), null);
});

test('Scopus fails explicitly without credentials and never calls the API', async () => {
  const service = new ResearchService(async () => { assert.fail('network must not run'); }, {});
  await assert.rejects(service.search({ query: 'education', provider: 'scopus' }), /SCOPUS_API_KEY/);
});

test('Scopus headers and literal search preserve missing author information', async () => {
  const service = new ResearchService(async (url, headers) => {
    assert.equal(headers?.['X-ELS-APIKey'], 'secret');
    assert.equal(headers?.['X-ELS-Insttoken'], 'institution');
    assert.equal(new URL(url).searchParams.get('query'), 'TITLE-ABS-KEY({education}) AND PUBYEAR > 2019');
    return { 'search-results': { 'opensearch:totalResults': '1', entry: [
      { 'dc:identifier': 'SCOPUS_ID:123', 'dc:title': 'Education', 'dc:creator': 'Perez A' },
    ] } };
  }, { SCOPUS_API_KEY: 'secret', SCOPUS_INSTTOKEN: 'institution' });
  const result = await service.search({ query: 'education', provider: 'scopus', yearFrom: 2020 });
  assert.equal((result.results[0] as any).authorsComplete, false);
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('Scopus no-results entry is not presented as a publication', async () => {
  const service = new ResearchService(async () => ({ 'search-results': {
    'opensearch:totalResults': '0', entry: [{ error: 'Result set was empty' }],
  } }), { SCOPUS_API_KEY: 'secret' });
  assert.deepEqual((await service.search({ query: 'education', provider: 'scopus' })).results, []);
});

test('ACM search is constrained to the ACM DOI prefix and labels Crossref provenance', async () => {
  const acmWork = { ...work, DOI: '10.1145/123.456' };
  const service = new ResearchService(async url => {
    const parsed = new URL(url);
    assert.match(parsed.pathname, /\/prefixes\/10\.1145\/works$/);
    assert.equal(parsed.searchParams.get('filter'), 'from-pub-date:2024-01-01,until-pub-date:2026-12-31');
    return collection([acmWork]);
  });
  const result = await service.search({ query: 'education', provider: 'acm_dl', yearFrom: 2024, yearTo: 2026 });
  assert.equal((result.results[0] as any).discoveredVia, 'crossref_acm_prefix_10.1145');
  assert.equal((result.results[0] as any).url, 'https://dl.acm.org/doi/10.1145/123.456');
});

test('Web of Science uses Core Collection, exact time span and key header', async () => {
  const service = new ResearchService(async (url, headers) => {
    const parsed = new URL(url);
    assert.equal(headers?.['X-ApiKey'], 'wos-secret');
    assert.equal(parsed.searchParams.get('db'), 'WOS');
    assert.equal(parsed.searchParams.get('publishTimeSpan'), '2024-01-01 2026-12-31');
    assert.equal(parsed.searchParams.get('q'), 'TS=("education")');
    return { metadata: { total: 1 }, hits: [{ uid: 'WOS:123', title: 'WOS study',
      source: { sourceTitle: 'Journal', publishYear: 2025 }, names: { authors: [{ displayName: 'Perez, A' }] },
      identifiers: { doi: '10.1234/WOS' }, links: { record: 'https://www.webofscience.com/record/123' },
      citations: [{ db: 'WOS', count: 2 }] }] };
  }, { WOS_API_KEY: 'wos-secret' });
  const result = await service.search({ query: 'education', provider: 'web_of_science', yearFrom: 2024, yearTo: 2026 });
  assert.equal((result.results[0] as any).indexedIn, 'web_of_science_core_collection');
  assert.ok(!JSON.stringify(result).includes('wos-secret'));
});

test('three-database search uses the student requested recent years and preserves partial failures', async () => {
  const year = new Date().getUTCFullYear();
  const service = new ResearchService(async url => {
    assert.match(url, /api\.crossref\.org\/prefixes\/10\.1145\/works/);
    assert.equal(new URL(url).searchParams.get('filter'), `from-pub-date:${year - 2}-01-01,until-pub-date:${year}-12-31`);
    return collection([{ ...work, DOI: '10.1145/123.456' }]);
  }, {});
  const result = await service.searchDatabases({ query: 'education', recentYears: 3 });
  assert.equal(result.yearFrom, year - 2);
  assert.equal(result.yearTo, year);
  assert.equal(result.periodMode, 'recent_calendar_years');
  assert.equal(result.databases.length, 3);
  assert.deepEqual(result.databases.map(item => item.provider),
    ['acm_dl', 'scopus', 'web_of_science']);
  assert.equal(result.databases.find(item => item.provider === 'acm_dl')?.status, 'ok');
  assert.equal(result.databases.filter(item => item.status === 'unavailable').length, 2);
});

test('three-database search accepts an explicit student range and rejects ambiguous periods', async () => {
  const service = new ResearchService(async url => {
    assert.equal(new URL(url).searchParams.get('filter'), 'from-pub-date:2020-01-01,until-pub-date:2022-12-31');
    return collection([]);
  }, {});
  const result = await service.searchDatabases({ query: 'education', providers: ['acm_dl'], yearFrom: 2020, yearTo: 2022 });
  assert.equal(result.periodMode, 'explicit_year_range');
  assert.equal(result.recentYears, null);
  await assert.rejects(service.searchDatabases({ query: 'education' }), /Indica recentYears/);
  await assert.rejects(service.searchDatabases({ query: 'education', recentYears: 3, yearFrom: 2020, yearTo: 2022 }), /pero no ambos/);
  await assert.rejects(service.searchDatabases({ query: 'education', yearFrom: 2023, yearTo: 2022 }), /yearFrom/);
});

test('invalid date range, limits and repository provider fail before the request', async () => {
  const service = new ResearchService(async () => { assert.fail('network must not run'); });
  await assert.rejects(service.search({ query: 'xx', yearFrom: 2025, yearTo: 2020 }), /yearFrom/);
  await assert.rejects(service.search({ query: 'xx', limit: 100 }));
  await assert.rejects(service.search({ query: 'xx', repositoriesOnly: true }), /openalex/);
  await assert.rejects(service.search({ query: 'xx', provider: 'ieee_xplore' as any }));
  await assert.rejects(service.search({ query: 'xx', provider: 'science_direct' as any }));
});

test('Crossref records with an unknown issued date remain usable without inventing a year', async () => {
  const service = new ResearchService(async () => collection([{ ...work, issued: { 'date-parts': [[null]] } }]));
  assert.equal(((await service.search({ query: 'education' })).results[0] as any).year, null);
});

test('DOI lookup checks exact incoming update relationships', async () => {
  const service = new ResearchService(async url => {
    if (url.includes('/works/')) return { message: work };
    assert.equal(new URL(url).searchParams.get('filter'), 'updates:10.1234/abc');
    return collection([{ DOI: '10.1234/notice', 'update-to': [{ DOI: '10.1234/ABC', type: 'retraction' }] }]);
  });
  const result = await service.verifyDoi('https://doi.org/10.1234/ABC');
  assert.equal(result.status, 'registered_in_crossref');
  assert.equal(result.retractionStatus, 'flagged_by_crossref');
});

test('strict citation verification returns only canonical registry fields with a proof receipt', async () => {
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: work } : collection([]));
  const result = await service.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence',
    expectedAuthors: ['Ana Perez'], expectedYear: 2024 });
  assert.equal(result.status, 'verified');
  assert.equal(result.citeAllowed, true);
  assert.deepEqual(result.mismatches, []);
  assert.deepEqual(result.missingFields, []);
  assert.deepEqual(result.citationRecord?.authors, ['Ana Perez']);
  assert.equal(result.citationRecord?.venue, 'Journal of Evidence');
  assert.equal(result.citationRecord?.volume, '12');
  assert.equal(result.citationRecord?.issue, '3');
  assert.equal(result.citationRecord?.pages, '41-52');
  assert.equal(result.citationRecord?.articleNumber, 'e123');
  assert.equal(result.proof.registry, 'crossref');
  assert.equal(result.claimEvidence, 'bibliographic_only');
});

test('strict citation verification rejects invented or incomplete metadata', async () => {
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: work } : collection([]));
  const rejected = await service.verifyCitation({ doi: work.DOI, expectedTitle: 'Invented title',
    expectedAuthors: ['Other Author'], expectedYear: 2025 });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.citeAllowed, false);
  assert.deepEqual(rejected.mismatches, ['title', 'year', 'authors']);

  const incomplete = new ResearchService(async url => url.includes('/works/')
    ? { message: { DOI: work.DOI, title: ['Evidence'] } } : collection([]));
  const partial = await incomplete.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.citeAllowed, false);
  assert.deepEqual(partial.missingFields, ['authors', 'year']);

  const journalWithoutVenue = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, 'container-title': undefined } } : collection([]));
  const missingVenue = await journalWithoutVenue.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(missingVenue.citeAllowed, false);
  assert.deepEqual(missingVenue.missingFields, ['venue']);

  for (const type of ['book', 'book-series', 'book-set']) {
    const bookWithoutPublisher = new ResearchService(async url => url.includes('/works/')
      ? { message: { ...work, type, publisher: undefined } } : collection([]));
    const missingPublisher = await bookWithoutPublisher.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
    assert.equal(missingPublisher.citeAllowed, false, type);
    assert.deepEqual(missingPublisher.missingFields, ['publisher'], type);
  }
});

test('a notice retracting another DOI does not retract the notice itself', async () => {
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, 'update-to': [{ DOI: '10.1234/other', type: 'retraction' }] } } : collection([]));
  assert.equal((await service.verifyDoi(work.DOI)).retractionStatus, 'no_notice_found_in_crossref');
});

test('retraction checks retain uncertainty on failure or truncated updates', async () => {
  for (const truncated of [false, true]) {
    const service = new ResearchService(async url => {
      if (url.includes('/works/')) return { message: work };
      if (!truncated) throw new ResearchHttpError(429);
      return collection([], 101);
    });
    const result = await service.verifyDoi(work.DOI);
    assert.match(result.retractionStatus!, /^unknown/);
  }
});

test('Crossref absence is not labelled fake, while upstream failure is not absence', async () => {
  const missing = new ResearchService(async () => { throw new ResearchHttpError(404); });
  assert.equal((await missing.verifyDoi(work.DOI)).status, 'not_found_in_crossref');
  const failed = new ResearchService(async () => { throw new ResearchHttpError(503); });
  await assert.rejects(failed.verifyDoi(work.DOI), /503/);
  const mismatch = new ResearchService(async () => ({ message: { DOI: '10.9999/other' } }));
  await assert.rejects(mismatch.verifyDoi(work.DOI), /no coincide/);
});

test('DOI normalization rejects URLs and malformed values without guessing', () => {
  assert.equal(normalizeDoi('doi:10.1234/ABC'), '10.1234/abc');
  for (const value of ['https://evil.example/10.1234/abc', 'not a doi', '10.1234/a?query=yes']) {
    assert.throws(() => normalizeDoi(value));
  }
});

test('Google Scholar fallback is explicitly a link without retrieved results', async () => {
  const service = new ResearchService(async () => { assert.fail('must not scrape'); }, {});
  const result = await service.googleScholar({ query: 'educación & salud', yearFrom: 2020 });
  assert.equal(result.resultsRetrieved, false);
  assert.equal(result.mode, 'manual_search_link');
  assert.equal(new URL(result.url).searchParams.get('q'), 'educación & salud');
  assert.throws(() => scholarSearchLinks('education', 2025, 2020));
});

test('SerpApi Scholar results remain unverified candidates and never expose API keys', async () => {
  const service = new ResearchService(async url => {
    const u = new URL(url);
    assert.equal(u.hostname, 'serpapi.com');
    assert.equal(u.searchParams.get('api_key'), 'secret-key');
    assert.equal(u.searchParams.get('start'), '10');
    return { search_metadata: { status: 'Success' }, organic_results: [
      { result_id: '123', title: 'A study', publication_info: { summary: 'A Perez - 2024' } },
    ] };
  }, { SERPAPI_API_KEY: 'secret-key' });
  const result = await service.googleScholar({ query: 'education', page: 2 });
  assert.equal(result.mode, 'third_party_search');
  assert.equal((result as any).results[0].verification, 'discovery_only');
  assert.ok(!JSON.stringify(result).includes('secret-key'));
});

test('research tools fail closed before all external operations', async () => {
  for (const authorize of [undefined, () => false, async () => { throw new Error('auth unavailable'); }]) {
    const handlers = new Map<string, any>();
    registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
      handlers.set(name, handler);
    } } as any, { authorize } as any);
    assert.equal(handlers.size, 8);
    for (const handler of handlers.values()) await assert.rejects(handler({}), /autorizado|auth unavailable/);
  }
});

test('authorization is rechecked each call, and provider errors are MCP errors', async () => {
  let entitled = true;
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => entitled,
    service: new ResearchService(async () => { throw new ResearchHttpError(429); }) });
  const result = await handlers.get('campus_research_search')({ query: 'education' });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /límite/);
  entitled = false;
  await assert.rejects(handlers.get('campus_research_search')({ query: 'education' }), /autorizado/);
});

test('public URL validation blocks local, reserved, mapped and credentialed targets', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.0.1', '100.64.0.1',
    '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '224.0.0.1', '2001:db8::1']) {
    assert.throws(() => assertPublicAddress(address), address);
  }
  for (const url of ['file:///etc/passwd', 'http://example.edu/x', 'https://user:pass@example.edu/x',
    'https://example.edu:1234/x', 'https://2130706433/x', 'https://[::ffff:127.0.0.1]/x']) {
    assert.throws(() => publicHttpsUrl(url), url);
  }
  assertPublicAddress('8.8.8.8');
  assert.equal(publicHttpsUrl('https://example.edu/paper.pdf').hostname, 'example.edu');
});

// A minimal deterministic PDF fixture, generated in memory with correct xref offsets.
function pdfFixture() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = 'BT /F1 12 Tf 20 700 Td (Academic evidence on page one.) Tj ET';
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

test('real PDF parser returns page evidence, continuation, and explicit OCR need', async () => {
  const first = await extractPdfBytes(pdfFixture(), 1, 1);
  assert.equal(first.totalPages, 2);
  assert.match(first.pages[0].text, /Academic evidence on page one/);
  assert.equal(first.pages[0].page, 1);
  assert.equal(first.nextPage, 2);
  const second = await extractPdfBytes(pdfFixture(), 2, 1);
  assert.equal(second.pages[0].needsOcr, true);
  assert.equal(second.nextPage, null);
});

test('PDF parser rejects HTML login pages, malformed PDFs, and invalid page ranges', async () => {
  await assert.rejects(extractPdfBytes(Buffer.from('<html>login</html>')), /PDF válido/);
  await assert.rejects(extractPdfBytes(Buffer.from('%PDF-broken')), /No se pudo leer/);
  await assert.rejects(extractPdfBytes(pdfFixture(), 3, 1), /página inicial supera/);
  await assert.rejects(extractPdfBytes(pdfFixture(), 0, 30));
});

test('an invalid PDF page range stays an input error instead of a client handoff', async () => {
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true,
    readPdf: async () => { throw new Error('La página inicial supera el documento.'); } });
  const result = await handlers.get('campus_research_read_pdf')({ url: 'https://publisher.example.edu/article.pdf' });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /página inicial supera/);
});

test('sources Campus cannot process return their original link for client handling', async () => {
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true,
    validateResourceUrl: acceptTestResourceUrl,
    readPdf: async () => { throw new Error('El documento supera el tamaño permitido.'); } });
  const result = await handlers.get('campus_research_read_pdf')({ url: 'https://publisher.example.edu/article.pdf' });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /client_processing_required/);
  assert.equal(result.content[1].type, 'resource_link');
  assert.equal(result.content[1].uri, 'https://publisher.example.edu/article.pdf');
  assert.equal(result.content[1].mimeType, 'application/pdf');
});

test('safe document-processing failures return a client resource link', async () => {
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true,
    validateResourceUrl: acceptTestResourceUrl,
    readDocument: async () => { throw new Error('El contenido descomprimido supera el límite de análisis seguro.'); } });
  const result = await handlers.get('campus_research_read_document')({ url: 'https://repository.example.edu/thesis.docx', format: 'docx' });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /server_processing_unavailable/);
  assert.equal(result.content[1].type, 'resource_link');
  assert.equal(result.content[1].uri, 'https://repository.example.edu/thesis.docx');
});

test('successful academic reads always return the resolved document as a resource link', async () => {
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true,
    validateResourceUrl: acceptTestResourceUrl,
    readPdf: async () => ({ requestedUrl: 'https://repository.example.edu/redirect',
      resolvedUrl: 'https://repository.example.edu/article.pdf', retrievedAt: '2026-09-14T00:00:00.000Z',
      sha256: 'a'.repeat(64), totalPages: 1, pages: [], nextPage: null, guidance: [] }) });
  const result = await handlers.get('campus_research_read_pdf')({ url: 'https://repository.example.edu/redirect' });
  assert.equal(result.content[1].type, 'resource_link');
  assert.equal(result.content[1].uri, 'https://repository.example.edu/article.pdf');
  assert.equal(result.content[1].mimeType, 'application/pdf');
});

test('academic searches expose discovered source URLs as deduplicated resource links', async () => {
  const handlers = new Map<string, any>();
  let validations = 0;
  const service = new ResearchService(async () => collection([{ ...work,
    link: [
      { URL: 'https://repository.example.edu/article.pdf', 'content-type': 'application/pdf' },
      { URL: 'https://repository.example.edu/supplement.pdf', 'content-type': 'application/pdf' },
    ] }]));
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service, validateResourceUrl: async value => {
    validations += 1;
    return acceptTestResourceUrl(value);
  } });
  const result = await handlers.get('campus_research_search')({ query: 'evidence' });
  const links = result.content.filter((part: any) => part.type === 'resource_link');
  assert.equal(links.length, 3);
  assert.equal(links[0].uri, 'https://repository.example.edu/article.pdf');
  assert.equal(links[1].uri, 'https://repository.example.edu/supplement.pdf');
  assert.equal(links[2].uri, 'https://doi.org/10.1234/abc');
  assert.equal(validations, 2, 'DNS validation is cached by hostname');
});

test('evidence verification requires an exact locator and stable document hash', async () => {
  const readPdf = async () => ({ requestedUrl: 'https://repository.example.edu/article.pdf',
    resolvedUrl: 'https://cdn.example.edu/article.pdf', retrievedAt: '2026-09-14T00:00:00.000Z',
    sha256: 'a'.repeat(64), totalPages: 10,
    pages: [{ page: 4, text: 'The intervention improved learning outcomes by 12 percent.', truncated: false, needsOcr: false }],
    nextPage: 5, guidance: [] });
  const verified = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    format: 'pdf', excerpt: 'The intervention improved learning outcomes\nby 12 percent.', expectedSha256: 'a'.repeat(64) },
  { readPdf: readPdf as any });
  assert.equal(verified.status, 'verified');
  assert.equal(verified.evidenceAllowed, true);
  assert.equal(verified.semanticSupport, 'client_assessment_required');
  assert.match(verified.evidenceId!, /^[a-f0-9]{64}$/);

  const missing = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    excerpt: 'An invented result that does not occur.' }, { readPdf: readPdf as any });
  assert.equal(missing.status, 'rejected');
  assert.equal(missing.reason, 'excerpt_not_found_at_locator');

  const truncated = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    excerpt: 'A possibly valid result beyond the extraction prefix.' }, { readPdf: (async () => ({
      ...(await readPdf()), pages: [{ page: 4, text: 'Only the bounded prefix.', truncated: true, needsOcr: false }],
    })) as any });
  assert.equal(truncated.status, 'inconclusive');
  assert.equal(truncated.evidenceAllowed, false);
  assert.equal(truncated.reason, 'locator_text_truncated');

  const changed = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    excerpt: 'The intervention improved learning outcomes.', expectedSha256: 'b'.repeat(64) },
  { readPdf: readPdf as any });
  assert.equal(changed.status, 'rejected');
  assert.equal(changed.reason, 'document_hash_mismatch');
});
