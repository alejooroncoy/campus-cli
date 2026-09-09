import assert from 'node:assert/strict';
import test from 'node:test';
import { ResearchService, normalizeDoi, scholarSearchLinks } from '../src/providers/academic/research-service.js';
import { assertPublicAddress, publicHttpsUrl, ResearchHttpError } from '../src/providers/academic/research-http.js';
import { extractPdfBytes } from '../src/providers/academic/research-pdf.js';
import { registerResearchTools } from '../src/providers/academic/research-mcp-tools.js';

const work = { DOI: '10.1234/ABC', title: ['Evidence'], type: 'journal-article',
  author: [{ given: 'Ana', family: 'Perez' }], issued: { 'date-parts': [[2024]] } };
const collection = (items: unknown[], total = items.length) => ({ message: { items, 'total-results': total } });

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
  const service = new ResearchService(async (url, headers) => {
    assert.equal(new URL(url).searchParams.get('filter'), 'locations.source.type:repository');
    assert.equal(headers?.Authorization, 'Bearer secret');
    assert.ok(!url.includes('secret'));
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

test('IEEE Xplore uses official date filters and never returns its API key', async () => {
  const service = new ResearchService(async url => {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, 'ieeexploreapi.ieee.org');
    assert.equal(parsed.searchParams.get('apikey'), 'ieee-secret');
    assert.equal(parsed.searchParams.get('start_year'), '2024');
    assert.equal(parsed.searchParams.get('end_year'), '2026');
    return { total_records: 1, articles: [{ article_number: '123', title: 'IEEE study', doi: '10.1109/ABC.2025.1',
      publication_year: '2025', authors: { authors: [{ full_name: 'Ana Perez' }] }, html_url: 'https://ieeexplore.ieee.org/document/123' }] };
  }, { IEEE_XPLORE_API_KEY: 'ieee-secret' });
  const result = await service.search({ query: 'education', provider: 'ieee_xplore', yearFrom: 2024, yearTo: 2026 });
  assert.equal((result.results[0] as any).indexedIn, 'ieee_xplore');
  assert.equal((result.results[0] as any).year, 2025);
  assert.ok(!JSON.stringify(result).includes('ieee-secret'));
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

test('ScienceDirect uses Elsevier credentials, date range and supported page size', async () => {
  const service = new ResearchService(async (url, headers) => {
    const parsed = new URL(url);
    assert.equal(headers?.['X-ELS-APIKey'], 'elsevier-secret');
    assert.equal(parsed.searchParams.get('date'), '2024-2026');
    assert.equal(parsed.searchParams.get('count'), '10');
    assert.equal(parsed.searchParams.get('start'), '10');
    return { 'search-results': { 'opensearch:totalResults': '11', entry: [{ 'dc:identifier': 'SD:1',
      'dc:title': 'ScienceDirect study', 'prism:doi': '10.1016/J.TEST.2025.1', 'dc:creator': 'Perez A',
      link: [{ '@ref': 'scidir', '@href': 'https://www.sciencedirect.com/science/article/pii/1' }] }] } };
  }, { ELSEVIER_API_KEY: 'elsevier-secret' });
  const result = await service.search({ query: 'education', provider: 'science_direct', yearFrom: 2024, yearTo: 2026,
    limit: 5, page: 2 });
  assert.equal((result.results[0] as any).indexedIn, 'science_direct');
  assert.equal((result.results[0] as any).authorsComplete, false);
  assert.ok(!JSON.stringify(result).includes('elsevier-secret'));
});

test('five-database search uses the student requested recent years and preserves partial failures', async () => {
  const service = new ResearchService(async url => {
    assert.match(url, /api\.crossref\.org\/prefixes\/10\.1145\/works/);
    assert.equal(new URL(url).searchParams.get('filter'), 'from-pub-date:2024-01-01,until-pub-date:2026-12-31');
    return collection([{ ...work, DOI: '10.1145/123.456' }]);
  }, {});
  const result = await service.searchDatabases({ query: 'education', recentYears: 3 });
  assert.equal(result.yearFrom, 2024);
  assert.equal(result.yearTo, 2026);
  assert.equal(result.periodMode, 'recent_calendar_years');
  assert.equal(result.databases.length, 5);
  assert.deepEqual(result.databases.map(item => item.provider),
    ['ieee_xplore', 'acm_dl', 'scopus', 'web_of_science', 'science_direct']);
  assert.equal(result.databases.find(item => item.provider === 'acm_dl')?.status, 'ok');
  assert.equal(result.databases.filter(item => item.status === 'unavailable').length, 4);
});

test('five-database search accepts an explicit student range and rejects ambiguous periods', async () => {
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
    assert.equal(handlers.size, 6);
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
  await assert.rejects(extractPdfBytes(pdfFixture(), 3, 1), /No se pudo leer/);
  await assert.rejects(extractPdfBytes(pdfFixture(), 0, 30));
});

test('oversized academic PDFs return a resource link for the MCP client', async () => {
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true,
    readPdf: async () => { throw new Error('El documento supera el tamaño permitido.'); } });
  const result = await handlers.get('campus_research_read_pdf')({ url: 'https://publisher.example.edu/article.pdf' });
  assert.equal(result.isError, undefined);
  assert.equal(result.content[1].type, 'resource_link');
  assert.equal(result.content[1].uri, 'https://publisher.example.edu/article.pdf');
  assert.equal(result.content[1].mimeType, 'application/pdf');
});
