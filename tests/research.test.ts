import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResearchService, normalizeDoi, scholarSearchLinks } from '../src/providers/academic/research-service.js';
import { assertPublicAddress, publicHttpsUrl, ResearchHttpError } from '../src/providers/academic/research-http.js';
import { detectPdfVisualSignals, extractPdfBytes, extractPdfIndexBytes, readResearchPdfBytes, readResearchSourceFile } from '../src/providers/academic/research-pdf.js';
import { ResearchPdfIndex, pdfIndexQuoteBatchInput } from '../src/providers/academic/research-pdf-index.js';
import { registerResearchTools as actualRegisterResearchTools } from '../src/providers/academic/research-mcp-tools.js';
import { verifyResearchEvidence, verifyResearchDocumentIdentity } from '../src/providers/academic/research-evidence.js';
import { readResearchDocument, extractDocumentBytes } from '../src/providers/academic/research-document.js';
import { officialResearchAlternate } from '../src/providers/academic/research-official-sources.js';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { verifyResearchQuote } from '../src/providers/academic/research-quote.js';

const work = { DOI: '10.1234/ABC', title: ['Evidence'], type: 'journal-article',
  author: [{ given: 'Ana', family: 'Perez' }], issued: { 'date-parts': [[2024]] },
  'container-title': ['Journal of Evidence'], volume: '12', issue: '3', page: '41-52',
  'article-number': 'e123' };

const collection = (items: unknown[], total = items.length) => ({ message: { items, 'total-results': total } });

const acceptTestResourceUrl = async (value: string) => publicHttpsUrl(value);
const registerResearchTools: typeof actualRegisterResearchTools = (server, options) => actualRegisterResearchTools(server, { validateResourceUrl: acceptTestResourceUrl, ...options });

test('PDF visual leads survive unstable text-line reconstruction', () => {
  assert.deepEqual(detectPdfVisualSignals('la evidencia continúa (figure 9.1) y table P1.1'),
    ['figure_or_table_marker']);
  assert.deepEqual(detectPdfVisualSignals('See Box 2.3 for the case study.'), ['box_marker']);
  assert.deepEqual(detectPdfVisualSignals('No visual label appears here.'), []);
});

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
    assert.equal(new URL(url).searchParams.get('api_key'), null);
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
    assert.equal(parsed.searchParams.get('publishTimeSpan'), null);
    assert.match(parsed.searchParams.get('q')!, /PY=\(2024-2026\)/);
    assert.match(parsed.searchParams.get('q')!, /TS=\("education"\)/);
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
  assert.deepEqual(result.citationRecord?.authors, [
    { name: 'Ana Perez', role: 'author', given: 'Ana', family: 'Perez' },
  ]);
  assert.equal(result.citationRecord?.venue, 'Journal of Evidence');
  assert.equal(result.citationRecord?.volume, '12');
  assert.equal(result.citationRecord?.issue, '3');
  assert.equal(result.citationRecord?.pages, '41-52');
  assert.equal(result.citationRecord?.articleNumber, 'e123');
  assert.equal(result.proof.registry, 'crossref');
  assert.equal(result.claimEvidence, 'bibliographic_only');

  const onlinePrint = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, issued: { 'date-parts': [[2023]] },
      'published-online': { 'date-parts': [[2024, 2, 1]] },
      'published-print': { 'date-parts': [[2025, 3, 1]] } } } : collection([]));
  const onlineYear = await onlinePrint.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence', expectedYear: 2024 });
  assert.equal(onlineYear.status, 'verified');
  assert.deepEqual(onlineYear.citationRecord?.publicationYears, [2023, 2024, 2025]);
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
  assert.deepEqual(partial.missingFields, ['type', 'authors', 'year']);

  const journalWithoutVenue = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, 'container-title': undefined } } : collection([]));
  const missingVenue = await journalWithoutVenue.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(missingVenue.citeAllowed, false);
  assert.deepEqual(missingVenue.missingFields, ['venue']);

  for (const type of ['book', 'book-series', 'book-set', 'proceedings-series', 'report-series']) {
    const bookWithoutPublisher = new ResearchService(async url => url.includes('/works/')
      ? { message: { ...work, type, publisher: undefined } } : collection([]));
    const missingPublisher = await bookWithoutPublisher.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
    assert.equal(missingPublisher.citeAllowed, false, type);
    assert.deepEqual(missingPublisher.missingFields, ['publisher'], type);
  }

  const blankAuthor = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, author: [{}] } } : collection([]));
  const missingAuthor = await blankAuthor.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.deepEqual(missingAuthor.citationRecord?.authors, []);
  assert.deepEqual(missingAuthor.missingFields, ['authors']);

  const datasetWithoutSource = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'dataset', publisher: undefined, 'group-title': undefined } } : collection([]));
  const incompleteDataset = await datasetWithoutSource.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(incompleteDataset.citeAllowed, false);
  assert.deepEqual(incompleteDataset.missingFields, ['source']);

  const datasetWithRepository = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'dataset', publisher: undefined, 'group-title': 'Evidence Repository' } } : collection([]));
  assert.equal((await datasetWithRepository.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' })).status, 'verified');
});

test('authorless journal articles and editor-led journal issues retain valid creators', async () => {
  const unsignedArticle = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, author: undefined } } : collection([]));
  const article = await unsignedArticle.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(article.status, 'verified');
  assert.deepEqual(article.citationRecord?.authors, []);

  const editedIssue = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'journal-issue', author: undefined,
      editor: [{ given: 'Ema', family: 'Editor' }] } } : collection([]));
  const issue = await editedIssue.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(issue.status, 'verified');
  assert.deepEqual(issue.citationRecord?.editors.map(editor => editor.name), ['Ema Editor']);

  const issueWithoutJournal = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'journal-issue', author: undefined,
      editor: [{ name: 'Ema Editor' }], 'container-title': undefined } } : collection([]));
  const partialIssue = await issueWithoutJournal.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.deepEqual(partialIssue.missingFields, ['venue']);

  const issueWithoutPeriodicalMetadata = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'journal-issue', author: undefined,
      editor: [{ name: 'Ema Editor' }], 'container-title': undefined, volume: undefined, issue: undefined } }
    : collection([]));
  const incompleteIssue = await issueWithoutPeriodicalMetadata.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.deepEqual(incompleteIssue.missingFields, ['venue', 'volume', 'issue']);

  const journalVolume = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'journal-volume', issue: undefined } } : collection([]));
  assert.equal((await journalVolume.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' })).status, 'verified');
  const incompleteVolume = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'journal-volume', issue: undefined,
      'container-title': undefined, volume: undefined } } : collection([]));
  assert.deepEqual((await incompleteVolume.verifyCitation({ doi: work.DOI,
    expectedTitle: 'Evidence' })).missingFields, ['venue', 'volume']);
});

test('citation verification compares rendered Crossref titles rather than markup tags', async () => {
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, title: ['Effects of <i>X</i><sup>2</sup> &amp; Y'] } } : collection([]));
  const result = await service.verifyCitation({ doi: work.DOI, expectedTitle: 'Effects of X2 & Y' });
  assert.equal(result.status, 'verified');
  assert.equal(result.citationRecord?.title, 'Effects of X2 & Y');

  const inequality = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, title: ['Results for p &lt; 0.05 and age &gt; 65'] } } : collection([]));
  const inequalityResult = await inequality.verifyCitation({ doi: work.DOI,
    expectedTitle: 'Results for p < 0.05 and age > 65' });
  assert.equal(inequalityResult.status, 'verified');
  assert.equal(inequalityResult.citationRecord?.title, 'Results for p < 0.05 and age > 65');
});

test('citation records decode Crossref venue and publisher markup', async () => {
  const journal = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, 'container-title': ['Research &amp; <i>Development</i>'] } } : collection([]));
  const journalResult = await journal.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(journalResult.status, 'verified');
  assert.equal(journalResult.citationRecord?.venue, 'Research & Development');

  const book = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'book', publisher: 'Evidence &amp; <i>Press</i>' } } : collection([]));
  const bookResult = await book.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(bookResult.status, 'verified');
  assert.equal(bookResult.citationRecord?.publisher, 'Evidence & Press');
});

test('edited books preserve editors and reference entries require their containing work', async () => {
  const editedBook = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'edited-book', author: undefined,
      editor: [{ given: 'Ema', family: 'Editor' }], publisher: 'Evidence Press' } } : collection([]));
  const edited = await editedBook.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(edited.status, 'verified');
  assert.deepEqual(edited.citationRecord?.authors, []);
  assert.deepEqual(edited.citationRecord?.editors, [
    { name: 'Ema Editor', role: 'editor', given: 'Ema', family: 'Editor' },
  ]);

  const referenceEntry = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'reference-entry', 'container-title': undefined,
      editor: [{ name: 'Ema Editor' }], publisher: 'Evidence Press' } } : collection([]));
  const entry = await referenceEntry.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(entry.citeAllowed, false);
  assert.deepEqual(entry.missingFields, ['venue']);
});

test('citation records retain Crossref suffix, subtitle, edition and chapter locator requirements', async () => {
  const completeBook = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'book', author: [{ given: 'Ana', family: 'Perez', suffix: 'Jr.' }],
      subtitle: ['Methods'], publisher: 'Evidence Press', 'edition-number': '2' } } : collection([]));
  const book = await completeBook.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence: Methods' });
  assert.equal(book.status, 'verified');
  assert.deepEqual(book.citationRecord?.authors, [
    { name: 'Ana Perez Jr.', role: 'author', given: 'Ana', family: 'Perez', suffix: 'Jr.' },
  ]);
  assert.equal(book.citationRecord?.subtitle, 'Methods');
  assert.equal(book.citationRecord?.title, 'Evidence');
  assert.equal(book.citationRecord?.edition, '2');

  const chapterWithoutPages = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'book-chapter', page: undefined, 'article-number': undefined,
      editor: [{ name: 'Ema Editor' }], publisher: 'Evidence Press' } } : collection([]));
  const chapter = await chapterWithoutPages.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(chapter.citeAllowed, false);
  assert.deepEqual(chapter.missingFields, ['pages']);
});

test('editor-led books and dissertation metadata remain valid canonical creators', async () => {
  const referenceBook = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'reference-book', author: undefined,
      editor: [{ name: 'Ema Editor' }], publisher: 'Evidence Press' } } : collection([]));
  const book = await referenceBook.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(book.status, 'verified');
  assert.deepEqual(book.citationRecord?.editors, [
    { name: 'Ema Editor', role: 'editor', literalName: 'Ema Editor' },
  ]);

  const dissertation = (institution?: unknown[], degree?: string[]) => new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'dissertation', institution, degree } } : collection([]));
  const incomplete = await dissertation().verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(incomplete.citeAllowed, false);
  assert.deepEqual(incomplete.missingFields, ['institution', 'degree']);
  const complete = await dissertation([{ name: 'Evidence University' }], ['Doctor of Philosophy'])
    .verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(complete.status, 'verified');
  assert.deepEqual(complete.citationRecord?.institutions, ['Evidence University']);
  assert.deepEqual(complete.citationRecord?.degrees, ['Doctor of Philosophy']);
});

test('proceedings, preprints and reports retain their type-specific canonical metadata', async () => {
  const proceedings = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'proceedings', author: undefined,
      editor: [{ name: 'Ema Editor' }], publisher: 'Evidence Press' } } : collection([]));
  const proceedingsResult = await proceedings.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(proceedingsResult.status, 'verified');

  const preprint = (repository?: string) => new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'posted-content', 'group-title': repository,
      subtype: 'preprint' } } : collection([]));
  const incompletePreprint = await preprint().verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.deepEqual(incompletePreprint.missingFields, ['repository']);
  const completePreprint = await preprint('Evidence Archive')
    .verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(completePreprint.status, 'verified');
  assert.equal(completePreprint.citationRecord?.repository, 'Evidence Archive');
  assert.equal(completePreprint.citationRecord?.subtype, 'preprint');

  const report = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'report', publisher: 'Evidence Agency', number: 'TR-42' } } : collection([]));
  const reportResult = await report.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(reportResult.status, 'verified');
  assert.equal(reportResult.citationRecord?.reportNumber, 'TR-42');

  const translated = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'book', publisher: 'Evidence Press',
      translator: [{ given: 'Tara', family: 'Translator' }] } } : collection([]));
  const translatedResult = await translated.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.deepEqual(translatedResult.citationRecord?.translators, [
    { name: 'Tara Translator', role: 'translator', given: 'Tara', family: 'Translator' },
  ]);

  const component = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, type: 'component', 'container-title': undefined } } : collection([]));
  const componentResult = await component.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.deepEqual(componentResult.missingFields, ['venue']);
});

test('grant citations use registered project funding, investigators and duration', async () => {
  const grantRecord = {
    DOI: work.DOI, type: 'grant', title: null, author: null, issued: { 'date-parts': [[null]] },
    award: null, project: [{
      'project-title': [{ title: 'Evidence Project' }],
      'lead-investigator': [{ given: 'Ana', family: 'Perez' }],
      investigator: [{ given: 'Ben', family: 'Rios' }],
      funding: [{ funder: { name: 'Evidence Foundation' }, award: ['GRANT-42'] }],
      'award-start': { 'date-parts': [[2024, 1, 15]] },
      'award-end': { 'date-parts': [[2026, 12, 31]] },
    }],
  };
  const grant = new ResearchService(async url => url.includes('/works/')
    ? { message: grantRecord } : collection([]));
  const result = await grant.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence Project' });
  assert.equal(result.status, 'verified');
  assert.equal(result.citeAllowed, true);
  assert.deepEqual(result.citationRecord?.authors.map(person => person.name), ['Ana Perez', 'Ben Rios']);
  assert.deepEqual(result.citationRecord?.funders, ['Evidence Foundation']);
  assert.deepEqual(result.citationRecord?.awardNumbers, ['GRANT-42']);
  assert.deepEqual(result.citationRecord?.awardStart, [2024, 1, 15]);
  assert.deepEqual(result.citationRecord?.awardEnd, [2026, 12, 31]);
  assert.equal(result.citationRecord?.year, 2024);

  const grantYear = await grant.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence Project', expectedYear: 2024 });
  assert.equal(grantYear.status, 'verified');
  assert.deepEqual(grantYear.citationRecord?.publicationYears, [2024]);

  const incomplete = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...grantRecord, award: null,
      project: [{ ...grantRecord.project[0], funding: null, 'award-end': null }] } } : collection([]));
  const partial = await incomplete.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence Project' });
  assert.equal(partial.citeAllowed, false);
  assert.deepEqual(partial.missingFields, ['funder', 'awardNumber', 'awardDuration']);

  const equalProjects = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...grantRecord, project: [grantRecord.project[0], {
      ...grantRecord.project[0], 'project-title': [{ title: 'Second Evidence Project' }],
      'lead-investigator': [{ name: 'Bea Rios' }],
      funding: [{ funder: { name: 'Second Foundation' }, award: ['GRANT-84'] }],
    }] } } : collection([]));
  const selectedLaterProject = await equalProjects.verifyCitation({ doi: work.DOI, expectedTitle: 'Second Evidence Project' });
  assert.equal(selectedLaterProject.status, 'verified');
  assert.deepEqual(selectedLaterProject.citationRecord?.authors.map(person => person.name), ['Bea Rios', 'Ben Rios']);
  assert.deepEqual(selectedLaterProject.citationRecord?.funders, ['Second Foundation']);
  assert.deepEqual(selectedLaterProject.citationRecord?.awardNumbers, ['GRANT-84']);
});

test('grant citation dates are never combined across different projects', async () => {
  const grantRecord = { DOI: work.DOI, type: 'grant', title: null, author: null,
    award: 'GRANT-42', issued: { 'date-parts': [[2024]] }, project: [
      { 'project-title': [{ title: 'First project' }],
        'lead-investigator': [{ name: 'Ana Perez' }],
        funding: [{ funder: { name: 'Evidence Foundation' } }],
        'award-start': { 'date-parts': [[2024, 1, 1]] }, 'award-end': null },
      { 'project-title': [{ title: 'Second project' }],
        'lead-investigator': [{ name: 'Ben Rios' }],
        funding: [{ funder: { name: 'Other Foundation' } }],
        'award-start': null, 'award-end': { 'date-parts': [[2026, 12, 31]] } },
    ] };
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: grantRecord } : collection([]));
  const result = await service.verifyCitation({ doi: work.DOI, expectedTitle: 'First project' });
  assert.equal(result.citeAllowed, false);
  assert.ok(result.missingFields.includes('awardDuration'));
  assert.deepEqual(result.citationRecord?.awardStart, [2024, 1, 1]);
  assert.equal(result.citationRecord?.awardEnd, null);
  assert.deepEqual(result.citationRecord?.grantProjects.map(project => ({
    title: project.titles[0], start: project.awardStart, end: project.awardEnd,
  })), [
    { title: 'First project', start: [2024, 1, 1], end: null },
    { title: 'Second project', start: null, end: [2026, 12, 31] },
  ]);

  const partialTopLevel = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...grantRecord, 'award-start': { 'date-parts': [[2023, 6, 1]] },
      project: [{ ...grantRecord.project[0], 'award-start': null,
        'award-end': { 'date-parts': [[2026, 12, 31]] } }] } } : collection([]));
  const topLevelResult = await partialTopLevel.verifyCitation({ doi: work.DOI, expectedTitle: 'First project' });
  assert.ok(topLevelResult.missingFields.includes('awardDuration'));
  assert.deepEqual(topLevelResult.citationRecord?.awardStart, [2023, 6, 1]);
  assert.equal(topLevelResult.citationRecord?.awardEnd, null);

  const laterCompleteProject = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...grantRecord, award: null, project: [
      { ...grantRecord.project[0], funding: null,
        'award-start': { 'date-parts': [[2024, 1, 1]] }, 'award-end': { 'date-parts': [[2025, 1, 1]] } },
      { ...grantRecord.project[1], 'project-title': [{ title: 'Complete project' }],
        funding: [{ funder: { name: 'Complete Foundation' }, award: ['COMPLETE-7'] }],
        'award-start': { 'date-parts': [[2025, 2, 1]] }, 'award-end': { 'date-parts': [[2026, 2, 1]] } },
    ] } } : collection([]));
  const complete = await laterCompleteProject.verifyCitation({ doi: work.DOI, expectedTitle: 'Complete project' });
  assert.equal(complete.status, 'verified');
  assert.deepEqual(complete.citationRecord?.funders, ['Complete Foundation']);
  assert.deepEqual(complete.citationRecord?.awardNumbers, ['COMPLETE-7']);
  assert.deepEqual(complete.citationRecord?.awardStart, [2025, 2, 1]);
  assert.deepEqual(complete.citationRecord?.awardEnd, [2026, 2, 1]);
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
  assert.equal((await missing.verifyDoi(work.DOI)).status, 'not_found_in_crossref_or_datacite');
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
    assert.equal(handlers.size, 18);
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

test('public source access denial is distinct from an API key failure', () => {
  assert.match(new ResearchHttpError(401).message, /iniciar sesión/);
  assert.match(new ResearchHttpError(403).message, /lectura automática/);
  assert.match(new ResearchHttpError(401, true).message, /clave/);
  assert.match(new ResearchHttpError(403, true).message, /clave/);
});

test('a blocked public document is handed to the client without claiming it was read', async () => {
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true,
    validateResourceUrl: acceptTestResourceUrl,
    readDocument: async () => { throw new ResearchHttpError(403); } });
  const result = await handlers.get('campus_research_read_document')({ url: 'https://repository.example.edu/article.html' });
  assert.equal(result.isError, undefined);
  assert.equal(JSON.parse(result.content[0].text).reason, 'source_access_denied');
  assert.match(result.content[0].text, /No se leyó el archivo/);
  assert.equal(result.content[1].type, 'resource_link');
  assert.equal(result.content[1].uri, 'https://repository.example.edu/article.html');
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

function pdfFixture(content = 'Academic evidence on page one.') {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1200 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1200 800] /Resources << >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const escaped = content.replace(/\r?\n/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = `BT /F1 12 Tf 20 700 Td (${escaped}) Tj ET`;
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

function longPdfFixture(pageCount: number) {
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${i + 3} 0 R`).join(' ')}] /Count ${pageCount} >>`,
  ];
  const fontId = pageCount + 3;
  for (let page = 1; page <= pageCount; page++) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${fontId + page} 0 R >>`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (let page = 1; page <= pageCount; page++) {
    const line = `Page ${page} contains a distinct research finding.`;
    const stream = `BT /F1 12 Tf 20 700 Td (${line}) Tj ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return Buffer.from(`${pdf}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
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

test('a blocked WEF landing page reads its verified official full PDF', async () => {
  const landing = 'https://www.weforum.org/publications/the-future-of-jobs-report-2025/';
  const pdf = 'https://reports.weforum.org/docs/WEF_Future_of_Jobs_Report_2025.pdf';
  const result = await readResearchDocument({ url: landing, format: 'html', sectionCount: 1 }, {
    download: async url => {
      assert.equal(url, pdf);
      return { bytes: pdfFixture(), url, contentType: 'application/pdf' };
    },
  });
  assert.equal(result.requestedUrl, landing);
  assert.equal(result.resolvedUrl, pdf);
  assert.equal(result.accessScope, 'full_report');
  assert.ok('pages' in result);
  if ('pages' in result) assert.match(result.pages[0].text, /Academic evidence/);
  assert.equal(officialResearchAlternate(landing.slice(0, -1))?.url, pdf);
  assert.equal(officialResearchAlternate('https://evil.example/publications/the-future-of-jobs-report-2025/'), null);
  assert.equal(officialResearchAlternate(`${landing}?token=private`), null);
});

test('the ISO alternate exposes only the public catalog, not the paid standard', async () => {
  const landing = 'https://www.iso.org/standard/78176.html';
  const alternate = 'https://committee.iso.org/es/sites/isoorg/contents/data/standard/07/81/78176.html';
  const result = await readResearchDocument({ url: landing, format: 'html' }, {
    download: async url => {
      assert.equal(url, alternate);
      return { bytes: Buffer.from('<html><nav>Unrelated links.</nav><div itemprop="description"><p>Public ISO catalog abstract.</p></div></html>'),
        url, contentType: 'text/html' };
    },
  });
  assert.equal(result.resolvedUrl, alternate);
  assert.equal(result.accessScope, 'public_catalog');
  assert.match(result.sections[0].text, /Public ISO catalog abstract/);
  assert.doesNotMatch(result.sections[0].text, /Unrelated links/);
  assert.match(result.guidance.join(' '), /texto íntegro.*requiere acceso autorizado/);
});

test('the intermittently blocked journal gets one bounded retry', async () => {
  let calls = 0;
  const url = 'https://revistas.uh.cu/revflacso/article/view/8000';
  const result = await readResearchDocument({ url, format: 'html' }, {
    download: async requested => {
      assert.equal(requested, url);
      if (++calls === 1) throw new ResearchHttpError(403, false, true);
      return { bytes: Buffer.from('<html><article><p>Verified article abstract.</p></article></html>'),
        url, contentType: 'text/html' };
    },
  });
  assert.equal(calls, 2);
  assert.match(result.sections[0].text, /Verified article abstract/);
});

test('the verified journal article route reads its full editorial PDF', async () => {
  const landing = 'https://revistas.uh.cu/revflacso/article/view/7514';
  const pdf = 'https://revistas.uh.cu/revflacso/article/download/7514/6400/9026';
  const result = await readResearchDocument({ url: landing, format: 'auto', sectionCount: 1 }, {
    download: async requested => {
      assert.equal(requested, pdf);
      return { bytes: pdfFixture(), url: requested, contentType: 'application/pdf' };
    },
  });
  assert.equal(result.requestedUrl, landing);
  assert.equal(result.resolvedUrl, pdf);
  assert.equal(result.accessScope, 'full_article');
  assert.ok('pages' in result);
  assert.equal(officialResearchAlternate(`${landing}?source=other`), null);
  assert.equal(officialResearchAlternate('https://example.com/revflacso/article/view/7514'), null);
});

test('the full-report PDF index resolves the official source before downloading', async () => {
  const landing = 'https://www.weforum.org/publications/the-future-of-jobs-report-2025/';
  const pdf = 'https://reports.weforum.org/docs/WEF_Future_of_Jobs_Report_2025.pdf';
  const index = new ResearchPdfIndex({ download: async url => {
    assert.equal(url, pdf);
    return { bytes: pdfFixture(), url, contentType: 'application/pdf' };
  } });
  const started = index.start('wef-reader', { url: landing });
  let result = index.status('wef-reader', { documentId: started.documentId });
  for (let attempt = 0; attempt < 100 && result.status !== 'ready'; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    result = index.status('wef-reader', { documentId: started.documentId });
  }
  assert.equal(result.status, 'ready');
  assert.equal(result.requestedUrl, landing);
  assert.equal(result.resolvedUrl, pdf);
});

test('PDF index parser extracts every page once and reports OCR gaps', async () => {
  const events: any[] = [];
  await extractPdfIndexBytes(pdfFixture(), event => events.push(event));
  assert.equal(events[0].metadata.totalPages, 2);
  assert.equal(events.flatMap(event => event.batch ?? []).length, 2);
  assert.equal(events.flatMap(event => event.batch ?? [])[1].needsOcr, true);
  assert.deepEqual(events.flatMap(event => event.batch ?? [])[0].visualSignals, []);
});

test('PDF index processes a 300-page text fixture with exact coverage', async () => {
  const batches: any[] = [];
  const metadata: any[] = [];
  await extractPdfIndexBytes(longPdfFixture(300), event => {
    if (event.metadata) metadata.push(event.metadata);
    if (event.batch) batches.push(...event.batch);
  });
  assert.equal(metadata[0].totalPages, 300);
  assert.equal(batches.length, 300);
  assert.match(batches[299].text, /Page 300 contains/);
});

test('long PDF index reuses one download, limits account access, and keeps page evidence', async () => {
  let downloads = 0;
  const index = new ResearchPdfIndex({
    download: async () => {
      downloads++;
      return { bytes: pdfFixture(), url: 'https://repository.example.edu/final.pdf', contentType: 'application/pdf' };
    },
  });
  const started = index.start('student-a', { url: 'https://repository.example.edu/article.pdf' });
  assert.equal(started.status, 'downloading');
  assert.equal(index.start('student-a', { url: 'https://repository.example.edu/article.pdf' }).documentId, started.documentId);
  assert.throws(() => index.status('student-b', { documentId: started.documentId }), /no está disponible/);
  let result = index.status('student-a', { documentId: started.documentId });
  for (let attempt = 0; attempt < 100 && result.status !== 'ready'; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    result = index.status('student-a', { documentId: started.documentId });
  }
  assert.equal(result.status, 'ready');
  assert.equal(result.coverage, '2/2');
  assert.deepEqual(result.needsOcrPages, [2]);
  assert.match(result.sha256!, /^[a-f0-9]{64}$/);
  const found = index.search('student-a', { documentId: started.documentId, query: 'academic evidence' });
  assert.deepEqual(found.matches.map(match => match.page), [1]);
  const read = index.read('student-a', { documentId: started.documentId, startPage: 1, pageCount: 2 });
  assert.match(read.pages[0].text, /Academic evidence/);
  assert.equal(read.pages[1].needsOcr, true);
  assert.equal(downloads, 1);
});

test('indexed PDF verification reuses the parsed page and reports actual reading separately from indexing', async () => {
  const url = 'https://repository.example.edu/article.pdf';
  let downloads = 0;
  const index = new ResearchPdfIndex({ download: async () => {
    downloads++;
    return { bytes: pdfFixture(), url, contentType: 'application/pdf' };
  } });
  const started = index.start('student-a', { url });
  let status = index.status('student-a', { documentId: started.documentId });
  for (let attempt = 0; attempt < 100 && status.status !== 'ready'; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    status = index.status('student-a', { documentId: started.documentId });
  }
  assert.equal(status.status, 'ready');
  assert.equal(status.indexedPages, 2);
  assert.deepEqual(status.readPages, []);
  assert.deepEqual(status.verifiedEvidence, []);
  assert.deepEqual(status.coverageAudit.counts, {
    text_ready: 1, text_truncated: 0, no_extractable_text: 1, visualReviewRecommended: 0,
  });
  assert.equal(status.coverageAudit.pages, undefined);
  assert.match(status.coverageAudit.meaning, /No demuestra que la página esté en blanco/);
  const otherAnalysis = index.start('student-a', { url });
  assert.equal(otherAnalysis.documentId, started.documentId);
  assert.notEqual(otherAnalysis.analysisId, started.analysisId);

  index.read('student-a', { documentId: started.documentId, analysisId: started.analysisId,
    startPage: 1, pageCount: 1 });
  const verified = await index.verify('student-a', { documentId: started.documentId,
    analysisId: started.analysisId, url, page: 1,
    excerpt: 'Academic evidence on page one.', expectedSha256: status.sha256! });
  assert.equal(verified.status, 'verified');
  assert.equal(verified.verificationSource, 'prepared_pdf_index');
  assert.equal(downloads, 1);
  status = index.status('student-a', { documentId: started.documentId, analysisId: started.analysisId });
  assert.deepEqual(status.readPages, [1]);
  assert.deepEqual(status.verifiedEvidence, [{ page: 1, evidenceId: verified.evidenceId }]);
  const untouched = index.status('student-a', { documentId: started.documentId,
    analysisId: otherAnalysis.analysisId });
  assert.deepEqual(untouched.readPages, []);
  assert.deepEqual(untouched.verifiedEvidence, []);
  assert.equal(untouched.ledgerScope, 'analysis');
  assert.equal(index.status('student-a', { documentId: started.documentId }).ledgerScope, 'document_lifetime');
  assert.throws(() => index.status('student-a', { documentId: started.documentId,
    analysisId: '00000000-0000-4000-8000-000000000001' }), /analysisId no está disponible/);

  const handlers = new Map<string, any>();
  const configs = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, config: unknown, handler: unknown) {
    configs.set(name, config);
    handlers.set(name, handler);
  } } as any, { authorize: () => true, pdfIndex: index, indexScope: 'student-a',
    validateResourceUrl: acceptTestResourceUrl });
  assert.ok(configs.get('campus_research_read_indexed_pdf').inputSchema.analysisId);
  assert.ok(configs.get('campus_research_verify_evidence').inputSchema.analysisId);
  assert.ok(configs.get('campus_research_verify_quotes').inputSchema.citations);
  assert.ok(configs.get('campus_research_audit_indexed_pdf').inputSchema.includePages);
  const audit = await handlers.get('campus_research_audit_indexed_pdf')({
    documentId: started.documentId, analysisId: started.analysisId,
  });
  const manifest = JSON.parse(audit.content[0].text);
  assert.deepEqual(manifest.audit.counts, {
    text_ready: 1, text_truncated: 0, no_extractable_text: 1, visualReviewRecommended: 0,
  });
  assert.equal(manifest.audit.pages[1].textStatus, 'no_extractable_text');
  assert.match(manifest.audit.meaning, /No demuestra que la página esté en blanco/);
  const toolResult = await handlers.get('campus_research_verify_evidence')({
    documentId: started.documentId, analysisId: started.analysisId,
    url, page: 1, excerpt: 'Academic evidence on page one.',
    expectedSha256: status.sha256,
  });
  assert.equal(JSON.parse(toolResult.content[0].text).verificationSource, 'prepared_pdf_index');
  assert.equal(downloads, 1);
  const batch = await handlers.get('campus_research_verify_quotes')({
    documentId: started.documentId, analysisId: started.analysisId,
    url, expectedSha256: status.sha256,
    citations: [
      { page: 1, excerpt: 'Academic evidence on page one.' },
      { page: 1, excerpt: 'A made-up quotation about page one.' },
      { page: 999, excerpt: 'A quote assigned to a nonexistent page.' },
    ],
  });
  const checked = JSON.parse(batch.content[0].text);
  assert.equal(checked.allExcerptsLocated, false);
  assert.deepEqual(checked.results.map((item: any) => item.status), ['verified', 'rejected', 'rejected']);
  assert.equal(checked.results[1].reason, 'excerpt_not_found_at_locator');
  assert.equal(checked.results[2].reason, 'page_out_of_range');
  assert.deepEqual(checked.readPages, [1]);
  assert.equal(downloads, 1);

  const wrongHash = await index.verify('student-a', { documentId: started.documentId, url, page: 1,
    excerpt: 'Academic evidence on page one.', expectedSha256: '0'.repeat(64) });
  assert.equal(wrongHash.status, 'rejected');
  assert.equal(wrongHash.reason, 'document_hash_mismatch');
  assert.equal(downloads, 1);
  assert.rejects(index.verify('student-b', { documentId: started.documentId, url, page: 1,
    excerpt: 'Academic evidence on page one.' }), /no está disponible/);
  assert.rejects(index.verify('student-a', { documentId: started.documentId,
    url: 'https://repository.example.edu/other.pdf', page: 1,
    excerpt: 'Academic evidence on page one.' }), /no corresponde/);
});

test('one account cannot evict another account PDF index when cache capacity is full', async () => {
  const index = new ResearchPdfIndex({
    download: async url => ({ bytes: pdfFixture(), url, contentType: 'application/pdf' }),
    extract: async (_bytes, onEvent) => {
      onEvent({ metadata: { totalPages: 1, outline: [] } });
      onEvent({ batch: [{ page: 1, text: 'Evidence from source.', truncated: false, needsOcr: false, visualSignals: [] }] });
    },
  });
  const ids: string[] = [];
  for (let account = 0; account < 8; account++) {
    const started = index.start(`student-${account}`, { url: `https://example.edu/thesis-${account}.pdf` });
    ids.push(started.documentId);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(index.status(`student-${account}`, { documentId: started.documentId }).status, 'ready');
  }
  assert.throws(() => index.start('student-8', { url: 'https://example.edu/another.pdf' }), /ocupados/);
  assert.equal(index.status('student-0', { documentId: ids[0] }).status, 'ready');
});

test('PDF parser rejects HTML login pages, malformed PDFs, and invalid page ranges', async () => {
  await assert.rejects(extractPdfBytes(Buffer.from('<html>login</html>')), /PDF válido/);
  await assert.rejects(extractPdfBytes(Buffer.from('%PDF-broken')), /No se pudo leer/);
  await assert.rejects(extractPdfBytes(pdfFixture(), 3, 1), /página inicial supera/);
  await assert.rejects(extractPdfBytes(pdfFixture(), 0, 30));
});

test('an attached source file becomes page evidence without exposing its signed URL', async () => {
  const signedUrl = 'https://files.example.edu/document.pdf?token=private';
  const result = await readResearchSourceFile({
    source_file: { download_url: signedUrl, file_id: 'file_123', mime_type: 'application/pdf', file_name: 'article.pdf' },
    sourceUrl: 'https://revistas.uh.cu/revflacso/article/view/7514',
    pageCount: 2,
  }, { download: async (url, options) => {
    assert.equal(url, signedUrl);
    assert.equal(options.maxBytes, 20 * 1024 * 1024);
    return { bytes: pdfFixture(), url, contentType: 'application/pdf' };
  } });
  assert.equal(result.sourceKind, 'client_file');
  assert.equal(result.sourceIdentityVerified, false);
  assert.equal(result.totalPages, 2);
  assert.equal(result.pages.length, 2);
  assert.equal(result.nextPage, null);
  assert.doesNotMatch(JSON.stringify(result), /token=private|file_123/);
});

test('long-PDF page reads expose their limited coverage and the indexed workflow', async () => {
  const bytes = longPdfFixture(25);
  const publicResult = await readResearchPdfBytes(bytes, {
    requestedUrl: 'https://example.edu/report.pdf', resolvedUrl: 'https://example.edu/report.pdf',
  }, 1, 2);
  assert.equal(publicResult.totalPages, 25);
  assert.deepEqual(publicResult.pages.map(page => page.page), [1, 2]);
  assert.match(publicResult.guidance.join(' '), /25 páginas.*campus_research_index_pdf.*descarga y procesa/);

  const attachedResult = await readResearchSourceFile({
    source_file: { download_url: 'https://files.example.edu/report.pdf', file_id: 'file_long' },
    startPage: 23, pageCount: 2,
  }, { download: async url => ({ bytes, url, contentType: 'application/pdf' }) });
  assert.deepEqual(attachedResult.pages.map(page => page.page), [23, 24]);
  assert.match(attachedResult.guidance.join(' '), /25 páginas.*solo leyó 2 páginas.*cobertura real/);
});

test('the source-file reader advertises a client file parameter and returns only page evidence', async () => {
  const handlers = new Map<string, any>();
  const configs = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, config: unknown, handler: unknown) {
    configs.set(name, config);
    handlers.set(name, handler);
  } } as any, { authorize: () => true,
    readSourceFile: async () => ({ sourceKind: 'client_file', totalPages: 1,
      pages: [{ page: 1, text: 'Evidence', truncated: false, needsOcr: false }], nextPage: null }) as any });
  assert.deepEqual(configs.get('campus_research_read_source_file')._meta['openai/fileParams'], ['source_file']);
  const result = await handlers.get('campus_research_read_source_file')({
    source_file: { download_url: 'https://files.example.edu/document.pdf', file_id: 'file_123' },
  });
  assert.equal(result.content.length, 1);
  assert.match(result.content[0].text, /Evidence/);
});

test('MCP SDK client discovers and reads an attached research PDF end to end', async () => {
  const server = new McpServer({ name: 'campus-research-test', version: '1.0.0' });
  const client = new Client({ name: 'research-test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const signedUrl = 'https://files.example.edu/article.pdf?opaque=private';
  const bytes = pdfFixture();
  let authorized = 0;
  registerResearchTools(server, {
    authorize: () => { authorized++; return true; },
    readSourceFile: input => readResearchSourceFile(input, { download: async (url, options) => {
      assert.equal(url, signedUrl);
      assert.equal(options.maxBytes, 20 * 1024 * 1024);
      return { bytes, url, contentType: 'application/pdf' };
    } }),
  });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const listed = await client.listTools();
    const fileTool = listed.tools.find(tool => tool.name === 'campus_research_read_source_file');
    assert.ok(fileTool);
    assert.deepEqual(fileTool._meta?.['openai/fileParams'], ['source_file']);
    assert.deepEqual(fileTool.inputSchema.properties?.source_file?.required, ['download_url', 'file_id']);

    const response = await client.callTool({ name: 'campus_research_read_source_file', arguments: {
      source_file: { download_url: signedUrl, file_id: 'file_private', mime_type: 'application/pdf' },
      sourceUrl: 'https://revistas.uh.cu/revflacso/article/view/7514',
      pageCount: 2,
    } });
    assert.equal(response.isError, undefined);
    assert.equal(response.content.length, 1);
    assert.equal(response.content[0].type, 'text');
    const value = JSON.parse(response.content[0].text);
    assert.equal(value.sourceKind, 'client_file');
    assert.equal(value.totalPages, 2);
    assert.match(value.pages[0].text, /Academic evidence on page one/);
    assert.equal(value.sourceIdentityVerified, false);
    assert.ok(authorized > 0);
    assert.doesNotMatch(JSON.stringify(response), /opaque=private|file_private/);
  } finally {
    await client.close();
    await server.close();
  }
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
  assert.equal(result.content[1].mimeType, 'application/octet-stream');
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

test('temporary publisher outage hands the verified PDF to the client without claiming a read', async () => {
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true,
    validateResourceUrl: acceptTestResourceUrl,
    readDocument: async () => { throw new ResearchHttpError(502); } });
  const result = await handlers.get('campus_research_read_document')({
    url: 'https://revistas.uh.cu/revflacso/article/view/7514', format: 'auto',
  });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /source_temporarily_unavailable/);
  assert.match(result.content[0].text, /no leyó el contenido/i);
  assert.equal(JSON.parse(result.content[0].text).downloadUrl,
    'https://revistas.uh.cu/revflacso/article/download/7514/6400/9026');
  assert.equal(result.content[1].uri, 'https://revistas.uh.cu/revflacso/article/download/7514/6400/9026');
  assert.equal(result.content[1].mimeType, 'application/pdf');
  assert.equal(result.content[1].name, 'Descargar PDF editorial');
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
      { URL: 'https://arxiv.org/pdf/1234.5678', 'content-type': 'application/pdf' },
      { URL: 'https://arxiv.org/html/1234.5678', 'content-type': 'text/html' },
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
  assert.equal(links[0].uri, 'https://arxiv.org/pdf/1234.5678');
  assert.equal(links[1].uri, 'https://api.crossref.org/works/10.1234%2Fabc');
  assert.equal(links[2].uri, 'https://arxiv.org/html/1234.5678');
  assert.equal(validations, 2, 'DNS validation is cached by hostname');
});

test('academic searches retain a valid landing page when a PDF candidate is unsafe', async () => {
  const handlers = new Map<string, any>();
  const service = { search: async () => ({ results: [{ title: 'Safe landing page', locations: [{
    pdf_url: 'https://private.example.edu/article.pdf',
    landing_page_url: 'https://arxiv.org/abs/1234.5678',
  }] }] }) };
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service: service as any, validateResourceUrl: async value => {
    if (new URL(value).hostname === 'private.example.edu') throw new Error('private address');
    return publicHttpsUrl(value);
  } });
  const result = await handlers.get('campus_research_search')({ query: 'evidence' });
  const links = result.content.filter((part: any) => part.type === 'resource_link');
  assert.deepEqual(links.map((part: any) => part.uri), ['https://arxiv.org/abs/1234.5678']);
});

test('academic searches do not emit provider-controlled resource links from untrusted hosts', async () => {
  const handlers = new Map<string, any>();
  const service = { search: async () => ({ results: [{ title: 'Untrusted host',
    url: 'https://catalog-controlled.example/article', doi: null }] }) };
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service: service as any, validateResourceUrl: acceptTestResourceUrl });
  const result = await handlers.get('campus_research_search')({ query: 'evidence' });
  assert.deepEqual(result.content.filter((part: any) => part.type === 'resource_link'), []);
});

test('academic searches retain a non-resolver Crossref fallback when the record URL is unsafe', async () => {
  const handlers = new Map<string, any>();
  const service = { search: async () => ({ results: [{ title: 'DOI fallback',
    url: 'https://private.example.edu/article', doi: '10.1234/fallback', indexedIn: 'crossref' }] }) };
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service: service as any, validateResourceUrl: async value => {
    if (new URL(value).hostname === 'private.example.edu') throw new Error('private address');
    return publicHttpsUrl(value);
  } });
  const result = await handlers.get('campus_research_search')({ query: 'evidence' });
  const links = result.content.filter((part: any) => part.type === 'resource_link');
  assert.deepEqual(links.map((part: any) => part.uri), ['https://api.crossref.org/works/10.1234%2Ffallback']);
});

test('academic searches do not invent Crossref fallbacks for non-Crossref DOI providers', async () => {
  const handlers = new Map<string, any>();
  const service = { search: async () => ({ results: [{ title: 'DataCite result',
    url: 'https://private.example.edu/article', doi: '10.5555/datacite', indexedIn: 'openalex' }] }) };
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service: service as any, validateResourceUrl: acceptTestResourceUrl });
  const result = await handlers.get('campus_research_search')({ query: 'evidence' });
  assert.deepEqual(result.content.filter((part: any) => part.type === 'resource_link'), []);
});

test('duplicate OpenAlex locations cannot consume the bounded candidate budget', async () => {
  const handlers = new Map<string, any>();
  const repeatedLocations = Array.from({ length: 60 }, (_, index) => ({
    pdf_url: `https://private-${index}.example.edu/article.pdf`,
  }));
  const service = { search: async () => ({ results: [
    { title: 'Replicated source', repositoryLocations: repeatedLocations, locations: repeatedLocations },
    { title: 'Later source', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/' },
  ] }) };
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service: service as any, validateResourceUrl: async value => {
    if (new URL(value).hostname.startsWith('private-')) throw new Error('unavailable host');
    return publicHttpsUrl(value);
  } });
  const result = await handlers.get('campus_research_search')({ query: 'evidence' });
  const links = result.content.filter((part: any) => part.type === 'resource_link');
  assert.deepEqual(links.map((part: any) => part.uri), ['https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/']);
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

  const alteredNumber = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    excerpt: 'The intervention improved learning outcomes by 1' }, { readPdf: readPdf as any });
  assert.equal(alteredNumber.status, 'rejected');
  assert.equal(alteredNumber.reason, 'excerpt_not_found_at_locator');

  const alteredDecimal = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    excerpt: 'The intervention improved learning outcomes by 12.' }, { readPdf: (async () => ({
      ...(await readPdf()), pages: [{ page: 4, text: 'The intervention improved learning outcomes by 12.5 percent.', truncated: false, needsOcr: false }],
    })) as any });
  assert.equal(alteredDecimal.status, 'rejected');
  assert.equal(alteredDecimal.reason, 'excerpt_not_found_at_locator');

  const alteredPolarity = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    excerpt: 'The result was significant in both groups.' }, { readPdf: (async () => ({
      ...(await readPdf()), pages: [{ page: 4, text: 'The result was non-significant in both groups.', truncated: false, needsOcr: false }],
    })) as any });
  assert.equal(alteredPolarity.status, 'rejected');

  const alteredSign = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    excerpt: 'The change was 10 percent.' }, { readPdf: (async () => ({
      ...(await readPdf()), pages: [{ page: 4, text: 'The change was -10 percent.', truncated: false, needsOcr: false }],
    })) as any });
  assert.equal(alteredSign.status, 'rejected');

  const alteredOperator = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    excerpt: 'The change was 10 percent.' }, { readPdf: (async () => ({
      ...(await readPdf()), pages: [{ page: 4, text: 'The change was ≤10 percent.', truncated: false, needsOcr: false }],
    })) as any });
  assert.equal(alteredOperator.status, 'rejected');

  const alteredRange = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    excerpt: 'The result was 10' }, { readPdf: (async () => ({
      ...(await readPdf()), pages: [{ page: 4, text: 'The result was 10–20 participants.', truncated: false, needsOcr: false }],
    })) as any });
  assert.equal(alteredRange.status, 'rejected');

  const alteredSpacedOperator = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    excerpt: 'The result was 10 percent.' }, { readPdf: (async () => ({
      ...(await readPdf()), pages: [{ page: 4, text: 'The result was < 10 percent.', truncated: false, needsOcr: false }],
    })) as any });
  assert.equal(alteredSpacedOperator.status, 'rejected');

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

  const alteredSuperscript = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    excerpt: 'The dose was 102 mg.' }, { readPdf: (async () => ({
      ...(await readPdf()),
      pages: [{ page: 4, text: 'The dose was 10² mg.', truncated: false, needsOcr: false }],
    })) as any });
  assert.equal(alteredSuperscript.status, 'rejected');

  const alteredUnit = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    excerpt: 'The dose was 10 mg' }, { readPdf: (async () => ({
      ...(await readPdf()),
      pages: [{ page: 4, text: 'The dose was 10 mg/kg.', truncated: false, needsOcr: false }],
    })) as any });
  assert.equal(alteredUnit.status, 'rejected');
});

test('evidence verification includes the section heading in the exact locator text', async () => {
  const readDocument = async () => ({ requestedUrl: 'https://repository.example.edu/article.html',
    resolvedUrl: 'https://repository.example.edu/article.html', retrievedAt: '2026-09-14T00:00:00.000Z',
    sha256: 'c'.repeat(64), format: 'html', totalSections: 1,
    sections: [{ section: 1, heading: 'Methods', text: 'Participants completed the survey.', truncated: false }],
    nextSection: null, guidance: [] });
  const result = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.html', section: 1,
    format: 'html', excerpt: 'Methods Participants completed the survey.' }, { readDocument: readDocument as any });
  assert.equal(result.status, 'verified');
  assert.equal(result.evidenceAllowed, true);
  assert.equal(result.proof.heading, 'Methods');
});

test('Crossref and ACM DOI queries use exact DOI filters and fail closed on mismatches', async () => {
  const doi = '10.1145/3459043.3459060';
  const exactWork = { ...work, DOI: doi,
    title: ['The Trends and Challenges of Emerging Technologies in Higher Education'] };
  for (const provider of ['crossref', 'acm_dl'] as const) {
    const service = new ResearchService(async url => {
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get('query.bibliographic'), null);
      assert.equal(parsed.searchParams.get('filter'), `doi:${doi}`);
      assert.match(parsed.pathname, provider === 'crossref' ? /\/works$/ : /\/prefixes\/10\.1145\/works$/);
      return collection([exactWork]);
    });
    for (const query of [doi, `doi:${doi}`, `https://doi.org/${doi}`]) {
      const result = await service.search({ query, provider });
      assert.equal(result.total, 1, `${provider} query: ${query}`);
      assert.equal(result.results.length, 1, `${provider} query: ${query}`);
      assert.equal((result.results[0] as any).doi, doi);
      if (provider === 'acm_dl') assert.equal((result.results[0] as any).url, `https://dl.acm.org/doi/${doi}`);
    }
    const inconsistent = new ResearchService(async () => collection([{ ...exactWork,
      DOI: '10.1145/9999999.9999999' }]));
    await assert.rejects(inconsistent.search({ query: doi, provider }), /DOI distinto al filtro exacto/);
  }
});

test('Crossref treats a DOI PDF path as an unverified file candidate even without a PDF MIME type', async () => {
  const candidate = 'https://dl.acm.org/doi/pdf/10.1145/3430263.3452445';
  const service = new ResearchService(async () => collection([{ ...work,
    link: [{ URL: candidate, 'content-type': 'text/html' }] }]));
  const result = await service.search({ query: 'online learning', provider: 'crossref' });
  assert.equal((result.results[0] as any).documentUrl, candidate);
  assert.equal((result.results[0] as any).documentAccess, 'pdf_candidate_unverified');
});

test('catalog JSON omits private Crossref and OpenAlex file URLs, not only MCP resource links', async () => {
  const crossref = new ResearchService(async () => collection([{ ...work, link: [
    { URL: 'https://127.0.0.1/private.pdf', 'content-type': 'application/pdf' },
    { URL: 'http://publisher.example.edu/insecure.pdf', 'content-type': 'application/pdf' },
    { URL: 'https://publisher.example.edu/public.pdf', 'content-type': 'application/pdf' },
  ] }]));
  const crossrefSource = (await crossref.search({ query: 'education' })).results[0] as any;
  assert.deepEqual(crossrefSource.fullTextLinks.map((link: any) => link.URL),
    ['https://publisher.example.edu/public.pdf']);
  assert.equal(crossrefSource.documentUrl, 'https://publisher.example.edu/public.pdf');
  assert.ok(!JSON.stringify(crossrefSource).includes('127.0.0.1'));
  const openalex = new ResearchService(async () => ({ meta: { count: 1 }, results: [{
    id: 'https://openalex.org/W123', display_name: 'Evidence', locations: [
      { source: { type: 'repository' }, pdf_url: 'https://127.0.0.1/private.pdf',
        landing_page_url: 'http://repository.example.edu/insecure' },
      { source: { type: 'repository' }, pdf_url: 'https://repository.example.edu/public.pdf' },
    ],
  }] }));
  const openalexSource = (await openalex.search({ query: 'education', provider: 'openalex', repositoriesOnly: true })).results[0] as any;
  assert.equal(openalexSource.locations[0].pdf_url, null);
  assert.equal(openalexSource.repositoryLocations[0].landing_page_url, null);
  assert.equal(openalexSource.documentUrl, 'https://repository.example.edu/public.pdf');
  assert.ok(!JSON.stringify(openalexSource).includes('127.0.0.1'));
});

test('OpenAlex treats DOI-shaped queries as exact filters and fails closed on mismatched records', async () => {
  const expectedDoi = '10.1145/3459043.3459060';
  const service = new ResearchService(async url => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('search'), null);
    assert.equal(parsed.searchParams.get('filter'), `doi:https://doi.org/${expectedDoi}`);
    return { meta: { count: 1 }, results: [{ id: 'https://openalex.org/WRIGHT',
      doi: `https://doi.org/${expectedDoi}`,
      display_name: 'The Trends and Challenges of Emerging Technologies in Higher Education' }] };
  });
  for (const query of [expectedDoi, `doi: ${expectedDoi}`, `https://doi.org/${expectedDoi}`]) {
    const result = await service.search({ query, provider: 'openalex', limit: 5 });
    assert.equal(result.total, 1, `query: ${query}`);
    assert.equal(result.results.length, 1, `query: ${query}`);
    assert.equal((result.results[0] as any).doi, expectedDoi);
    assert.equal((result.results[0] as any).title,
      'The Trends and Challenges of Emerging Technologies in Higher Education');
  }
  const inconsistent = new ResearchService(async () => ({ meta: { count: 2 }, results: [
    { id: 'https://openalex.org/WRIGHT', doi: `https://doi.org/${expectedDoi}`,
      display_name: 'The Trends and Challenges of Emerging Technologies in Higher Education' },
    { id: 'https://openalex.org/WRONG', doi: 'https://doi.org/10.1145/9999999.9999999',
      display_name: 'Unrelated work returned by an inconsistent exact-filter response' },
  ] }));
  await assert.rejects(inconsistent.search({ query: expectedDoi, provider: 'openalex' }),
    /DOI distinto al filtro exacto/);
});

test('PubMed search preserves PMID, DOI, source URL and explicit empty pages', async () => {
  const urls: string[] = [];
  const service = new ResearchService(async url => {
    urls.push(url);
    if (url.includes('/esearch.fcgi')) return { esearchresult: { count: '2', idlist: ['123', '456'] } };
    return { result: { uids: ['123', '456'], '123': {
      uid: '123', title: 'A PubMed study', pubdate: '2024 Jan', fulljournalname: 'Journal of Testing',
      authors: [{ name: 'Perez A' }], articleids: [{ idtype: 'doi', value: '10.1234/PUBMED' }],
    }, '456': { uid: '456', title: 'A study without DOI', pubdate: '2023', authors: [] } } };
  });
  const result = await service.search({ query: 'online learning', provider: 'pubmed', yearFrom: 2023, yearTo: 2024 });
  assert.equal(result.total, 2);
  assert.equal(result.results[0].id, 'pubmed:123');
  assert.equal((result.results[0] as any).doi, '10.1234/pubmed');
  assert.equal((result.results[0] as any).url, 'https://pubmed.ncbi.nlm.nih.gov/123/');
  assert.equal((result.results[0] as any).year, 2024);
  assert.equal((result.results[1] as any).doi, null);
  assert.equal((result.results[1] as any).sourceUrlAvailable, true);
  assert.match(new URL(urls[0]).searchParams.get('term')!, /\d{4}:\d{4}\[dp\]/);
  const empty = new ResearchService(async () => ({ esearchresult: { count: '0', idlist: [] } }));
  assert.deepEqual((await empty.search({ query: 'no result', provider: 'pubmed' })).results, []);
  const failed = new ResearchService(async () => ({ esearchresult: { ERROR: 'Search backend unavailable' } }));
  await assert.rejects(failed.search({ query: 'temporary failure', provider: 'pubmed' }), /PubMed no pudo completar/);
});

test('PubMed DOI searches use the identifier field and reject a different returned DOI', async () => {
  const doi = '10.3389/fpsyg.2021.616059';
  for (const query of [doi, `doi:${doi}`, `https://doi.org/${doi}`]) {
    const service = new ResearchService(async url => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/esearch.fcgi')) {
        assert.equal(parsed.searchParams.get('term'), `${doi}[aid]`);
        return { esearchresult: { count: '1', idlist: ['33643144'] } };
      }
      return { result: { uids: ['33643144'], '33643144': { uid: '33643144',
        title: 'The Transformation of Higher Education After the COVID Disruption',
        articleids: [{ idtype: 'doi', value: doi }] } } };
    });
    const result = await service.search({ query, provider: 'pubmed' });
    assert.equal(result.total, 1, query);
    assert.equal((result.results[0] as any).doi, doi, query);
  }
  const inconsistent = new ResearchService(async url => new URL(url).pathname.endsWith('/esearch.fcgi')
    ? { esearchresult: { count: '1', idlist: ['456'] } }
    : { result: { uids: ['456'], '456': { uid: '456', title: 'Unrelated PubMed record',
      articleids: [{ idtype: 'doi', value: '10.1234/unrelated' }] } } });
  await assert.rejects(inconsistent.search({ query: doi, provider: 'pubmed' }), /DOI distinto/);
});

test('PubMed retries a long title with explicit Title field terms when automatic mapping finds nothing', async () => {
  const requestedTerms: string[] = [];
  const title = 'The Transformation of Higher Education and Research After the COVID Disruption: Emerging Challenges in an Online Learning Scenario';
  const service = new ResearchService(async url => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/esearch.fcgi')) {
      const term = parsed.searchParams.get('term')!;
      requestedTerms.push(term);
      if (requestedTerms.length === 1) return { esearchresult: { count: '0', idlist: [] } };
      assert.equal(term, 'Transformation[Title] AND Higher[Title] AND Education[Title] AND Research[Title] AND After[Title] AND COVID[Title] AND Disruption[Title] AND Emerging[Title] AND Challenges[Title] AND Online[Title] AND Learning[Title] AND Scenario[Title] AND (2021:2024[dp])');
      return { esearchresult: { count: '1', idlist: ['33643144'] } };
    }
    return { result: { uids: ['33643144'], '33643144': { uid: '33643144',
      title: `${title}.`, articleids: [{ idtype: 'doi', value: '10.3389/fpsyg.2021.616059' }] } } };
  });
  const result = await service.search({ query: title, provider: 'pubmed', yearFrom: 2021, yearTo: 2024 });
  assert.equal(requestedTerms.length, 2);
  assert.equal(result.total, 1);
  assert.equal((result.results[0] as any).doi, '10.3389/fpsyg.2021.616059');
  assert.match(result.requestUrl, /Transformation%5BTitle%5D/);
});

test('PubMed serializes concurrent E-utilities requests and keeps an optional API key out of results', async () => {
  const requestedUrls: string[] = [];
  const delays: number[] = [];
  const service = new ResearchService(async url => {
    requestedUrls.push(url);
    return { esearchresult: { count: '0', idlist: [] } };
  }, { NCBI_API_KEY: 'private-ncbi-key' }, undefined, async milliseconds => {
    delays.push(milliseconds);
  });
  const results = await Promise.all([
    service.search({ query: 'online learning', provider: 'pubmed' }),
    service.search({ query: 'accessible education', provider: 'pubmed' }),
  ]);
  assert.equal(requestedUrls.length, 2);
  assert.ok(requestedUrls.every(url => new URL(url).searchParams.get('api_key') === 'private-ncbi-key'));
  assert.ok(delays.some(milliseconds => milliseconds > 0), 'concurrent requests should be paced');
  assert.deepEqual(results.map(result => result.total), [0, 0]);
  assert.ok(!JSON.stringify(results).includes('private-ncbi-key'));
});

test('Europe PMC search preserves biomedical IDs, DOI and public record URL', async () => {
  const service = new ResearchService(async url => {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, 'www.ebi.ac.uk');
    assert.match(parsed.searchParams.get('query')!, /FIRST_PDATE:\[2021-01-01 TO 2024-12-31\]/);
    return { hitCount: 1, resultList: { result: [{ id: '999', pmid: '999', pmcid: 'PMC999',
      title: 'An evidence study', authorString: 'Perez A, Smith B', pubYear: '2024',
      journalTitle: 'Evidence Journal', pubType: 'research-article', doi: '10.1234/EPMC', isOpenAccess: 'Y' }] } };
  });
  const result = await service.search({ query: 'online learning', provider: 'europe_pmc', yearFrom: 2021, yearTo: 2024 });
  const source = result.results[0] as any;
  assert.equal(source.id, 'europe_pmc:999');
  assert.equal(source.pmid, '999');
  assert.equal(source.pmcid, 'PMC999');
  assert.equal(source.doi, '10.1234/epmc');
  assert.deepEqual(source.authors, ['Perez A', 'Smith B']);
  assert.equal(source.url, 'https://europepmc.org/article/MED/999');
  assert.equal(source.openAccess, true);
  assert.equal(source.documentUrl, 'https://www.ebi.ac.uk/europepmc/webservices/rest/PMC999/fullTextXML');
  assert.equal(source.documentAccess, 'document_candidate_unverified');
});

test('Europe PMC rejects malformed identifiers and falls back to a canonical DOI URL', async () => {
  const service = new ResearchService(async () => ({ hitCount: 2, resultList: { result: [
    { id: 'not-a-pmid', pmid: 'abc', pmcid: 'PMC-nope', title: 'DOI only', doi: '10.1234/doi-only' },
    { id: 'PMC777', pmcid: 'pmc777', title: 'PMCID only', authorString: '' },
  ] } }));
  const results = (await service.search({ query: 'edge case', provider: 'europe_pmc' })).results as any[];
  assert.equal(results[0].id, 'europe_pmc:10.1234/doi-only');
  assert.equal(results[0].url, 'https://doi.org/10.1234/doi-only');
  assert.equal(results[0].pmid, null);
  assert.equal(results[0].pmcid, null);
  assert.equal(results[0].documentUrl, null);
  assert.equal(results[1].id, 'europe_pmc:PMC777');
  assert.equal(results[1].url, 'https://europepmc.org/articles/PMC777');
  assert.equal(results[1].pmcid, 'PMC777');
  assert.equal(results[1].documentUrl, 'https://www.ebi.ac.uk/europepmc/webservices/rest/PMC777/fullTextXML');
});

test('Semantic Scholar preserves source identity, open PDF candidates, date bounds and API-key privacy', async () => {
  let requested = '';
  let headers: Record<string, string> | undefined;
  const service = new ResearchService(async (url, requestHeaders) => {
    requested = url;
    headers = requestHeaders as Record<string, string> | undefined;
    return { total: 1, offset: 0, next: null, data: [{ paperId: 'paper/id',
      title: 'Semantic Scholar study', year: 2024, authors: [{ name: 'Perez, Ana' }, { name: null }],
      externalIds: { DOI: '10.1234/S2', PubMed: '12345', CorpusId: 999 },
      url: 'https://semanticscholar.org/paper/wrong', abstract: 'Public abstract',
      publicationVenue: { name: 'Test Journal' }, publicationTypes: ['JournalArticle'],
      openAccessPdf: { url: 'https://repository.example.edu/s2.pdf', status: 'GREEN', license: 'CC-BY' } }] };
  }, { SEMANTIC_SCHOLAR_API_KEY: 'must-not-appear' });
  const result = await service.search({ query: 'online learning', provider: 'semantic_scholar',
    yearFrom: 2022, yearTo: 2024, limit: 5 });
  const source = result.results[0] as any;
  assert.equal(new URL(requested).searchParams.get('year'), '2022-2024');
  assert.equal(new URL(requested).searchParams.get('offset'), '0');
  assert.equal(headers?.['x-api-key'], 'must-not-appear');
  assert.equal(source.id, 'semantic_scholar:paper/id');
  assert.equal(source.doi, '10.1234/s2');
  assert.equal(source.pubmedId, '12345');
  assert.deepEqual(source.authors, ['Perez, Ana']);
  assert.equal(source.url, 'https://www.semanticscholar.org/paper/paper%2Fid');
  assert.equal(source.documentUrl, 'https://repository.example.edu/s2.pdf');
  assert.equal(source.documentAccess, 'pdf_candidate_unverified');
  assert.equal(source.documentLicense, 'CC-BY');
  assert.equal(source.peerReview, 'unknown');
  assert.ok(!JSON.stringify(result).includes('must-not-appear'));
});

test('Semantic Scholar caps pagination at the 1000 relevance-search result ceiling', async () => {
  const service = new ResearchService(async url => ({ total: 20_000,
    offset: Number(new URL(url).searchParams.get('offset')), next: null, data: [] }));
  const lastPage = await service.search({ query: 'research', provider: 'semantic_scholar', limit: 25, page: 40 });
  assert.equal(lastPage.nextPage, null);
  assert.equal((lastPage as any).paginationLimited, true);
  const beforeLast = await service.search({ query: 'research', provider: 'semantic_scholar', limit: 25, page: 39 });
  assert.equal(beforeLast.nextPage, 40);
});

test('Semantic Scholar can be called without a key and propagates public API rate limits', async () => {
  let headers: Record<string, string> | undefined;
  const service = new ResearchService(async (_url, requestHeaders) => {
    headers = requestHeaders as Record<string, string> | undefined;
    return { total: 0, offset: 0, next: null, data: [] };
  }, {});
  assert.equal((await service.search({ query: 'no results', provider: 'semantic_scholar' })).total, 0);
  assert.equal(headers, undefined);
  const limited = new ResearchService(async () => { throw new ResearchHttpError(429); });
  await assert.rejects(limited.search({ query: 'rate limited', provider: 'semantic_scholar' }), /límite/);
});

test('Semantic Scholar MCP results expose the catalog page and unverified PDF candidate', async () => {
  const service = new ResearchService(async () => ({ total: 1, offset: 0, next: null,
    data: [{ paperId: 's2-paper', title: 'A Semantic Scholar study', year: 2024,
      externalIds: { DOI: '10.1234/s2-paper' }, authors: [{ name: 'Ana Perez' }],
      openAccessPdf: { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12345/pdf/s2-paper.pdf', status: 'GREEN' } }] }));
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service });
  const result = await handlers.get('campus_research_search')({
    query: 'semantic scholar study', provider: 'semantic_scholar' });
  assert.notEqual(result.isError, true);
  const record = JSON.parse(result.content[0].text).results[0];
  const links = result.content.filter((part: any) => part.type === 'resource_link');
  assert.equal(record.documentAccess, 'pdf_candidate_unverified');
  assert.ok(links.some((part: any) => part.uri === record.url));
  assert.ok(links.some((part: any) => part.uri === record.documentUrl && part.mimeType === 'application/pdf'));
});

test('OpenAIRE preserves DOI, identifiers, record instances and public file candidates', async () => {
  let requested = '';
  const service = new ResearchService(async url => {
    requested = url;
    return { header: { numFound: 10_001 }, results: [{ id: 'openaire-record-1', type: 'publication',
      mainTitle: 'An OpenAIRE study', publicationDate: '2022-11-30',
      pids: [{ scheme: 'doi', value: '10.1234/OPENAIRE' }, { scheme: 'pmid', value: '98765' },
        { scheme: 'pmc', value: 'PMC12345' }],
      authors: [{ fullName: 'Ana Perez' }, { fullName: 'Luis Gomez' }],
      container: { name: 'Journal of Open Research' }, bestAccessRight: { label: 'OPEN' },
      instances: [{ urls: ['https://doi.org/10.1234/openaire'], refereed: 'peerReviewed',
        accessRight: { label: 'OPEN', openAccessRoute: 'gold' } },
      { urls: ['https://repository.example.edu/openaire-study.pdf'], refereed: 'nonPeerReviewed',
        accessRight: { label: 'OPEN', openAccessRoute: 'green' }, hostedBy: { value: 'Example Repository' } }] }] };
  });
  const result = await service.search({ query: 'open science study', provider: 'openaire',
    yearFrom: 2021, yearTo: 2023, page: 1, limit: 5 });
  const source = result.results[0] as any;
  assert.equal(new URL(requested).searchParams.get('fromPublicationYear'), '2021');
  assert.equal(new URL(requested).searchParams.get('toPublicationYear'), '2023');
  assert.equal(new URL(requested).searchParams.get('pageSize'), '5');
  assert.equal(source.doi, '10.1234/openaire');
  assert.equal(source.pmid, '98765');
  assert.equal(source.pmcid, 'PMC12345');
  assert.equal(source.year, 2022);
  assert.equal(source.venue, 'Journal of Open Research');
  assert.equal(source.peerReview, 'unknown');
  assert.equal(source.openAccess, true);
  assert.equal(source.url, 'https://explore.openaire.eu/search/publication?pid=openaire-record-1');
  assert.equal(source.documentUrl, 'https://repository.example.edu/openaire-study.pdf');
  assert.equal(source.documentAccess, 'pdf_candidate_unverified');
  assert.deepEqual(source.instancePeerReview.map((item: any) => item.refereed), ['peerReviewed', 'nonPeerReviewed']);
  assert.equal(result.nextPage, 2);
  assert.equal((result as any).paginationLimited, true);
});

test('OpenAIRE exact DOI searches use pid and reject any mismatched record', async () => {
  const doi = '10.3389/fpubh.2023.1166120';
  let requested = '';
  const makeRecord = (recordDoi: string) => ({ header: { numFound: 1 }, results: [{
    id: 'openaire-exact-doi', mainTitle: 'ChatGPT and the rise of large language models',
    pids: [{ scheme: 'doi', value: recordDoi }], instances: [],
  }] });
  const service = new ResearchService(async url => { requested = url; return makeRecord(doi); });
  const result = await service.search({ query: doi, provider: 'openaire' });
  const request = new URL(requested);
  assert.equal(request.searchParams.get('pid'), doi);
  assert.equal(request.searchParams.has('search'), false);
  assert.equal((result.results[0] as any).doi, doi);

  const mismatched = new ResearchService(async () => makeRecord('10.63544/ijss.v5i3.301'));
  await assert.rejects(mismatched.search({ query: doi, provider: 'openaire' }), /DOI distinto a la búsqueda exacta/);
});

test('OpenAIRE MCP exposes its record and candidate file resources', async () => {
  const service = new ResearchService(async () => ({ header: { numFound: 1 }, results: [{
    id: 'openaire-mcp-record', mainTitle: 'OpenAIRE MCP record', pids: [],
    instances: [{ urls: ['https://pmc.ncbi.nlm.nih.gov/open.pdf'] }],
  }] }));
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service });
  const response = await handlers.get('campus_research_search')({ query: 'open science', provider: 'openaire' });
  assert.notEqual(response.isError, true);
  const record = JSON.parse(response.content[0].text).results[0];
  const links = response.content.filter((part: any) => part.type === 'resource_link');
  assert.equal(record.documentAccess, 'pdf_candidate_unverified');
  assert.ok(links.some((part: any) => part.uri === record.url));
  assert.ok(links.some((part: any) => part.uri === record.documentUrl && part.mimeType === 'application/pdf'));
});

test('OpenAIRE avoids invented URLs and falls back to a registered DOI when record ID is missing', async () => {
  const service = new ResearchService(async () => ({ header: { numFound: 2 }, results: [
    { mainTitle: 'A malformed record without a source identifier', pids: [], instances: [] },
    { mainTitle: 'A DOI-only record', pids: [{ scheme: 'doi', value: '10.1234/DOI-ONLY' }], instances: [] },
  ] }));
  const result = await service.search({ query: 'open science', provider: 'openaire' });
  const source = result.results[0] as any;
  assert.equal(source.url, null);
  assert.equal(source.sourceUrlAvailable, false);
  assert.equal(source.documentUrl, null);
  assert.equal(source.documentAccess, 'not_provided_by_catalog');
  assert.equal((result.results[1] as any).url, 'https://doi.org/10.1234/doi-only');
});

const arxivFeed = (id = '2505.01648v1', pdfId = id) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <opensearch:totalResults>42</opensearch:totalResults>
  <entry><id>http://arxiv.org/abs/${id}</id><published>2025-05-02T10:00:00Z</published>
    <updated>2025-05-03T11:00:00Z</updated><title>A &amp; B: robust research systems</title>
    <summary>First line of abstract. Second line of abstract.</summary>
    <author><name>Ada Lovelace</name></author><author><name>Grace Hopper</name></author>
    <arxiv:doi>10.1145/3757486</arxiv:doi><arxiv:journal_ref>ACM Conference</arxiv:journal_ref>
    <arxiv:primary_category term="cs.HC"/><category term="cs.AI"/>
    <link href="http://arxiv.org/abs/${id}" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/${pdfId}" rel="related" type="application/pdf"/>
  </entry>
</feed>`;

test('arXiv Atom search preserves the e-print ID, DOI, version and matching PDF candidate', async () => {
  let requested = '';
  const service = new ResearchService(async () => ({}), process.env,
    async url => { requested = url; return arxivFeed(); }, async () => {});
  const result = await service.search({ query: 'human AI interaction', provider: 'arxiv',
    yearFrom: 2024, yearTo: 2025, page: 2, limit: 10 });
  const source = result.results[0] as any;
  const params = new URL(requested).searchParams;
  assert.equal(params.get('start'), '10');
  assert.equal(params.get('max_results'), '10');
  assert.match(params.get('search_query')!, /submittedDate:\[202401010000 TO 202512312359\]/);
  assert.equal(source.id, 'arxiv:2505.01648v1');
  assert.equal(source.arxivId, '2505.01648v1');
  assert.equal(source.doi, '10.1145/3757486');
  assert.equal(source.title, 'A & B: robust research systems');
  assert.deepEqual(source.authors, ['Ada Lovelace', 'Grace Hopper']);
  assert.equal(source.year, 2025);
  assert.equal(source.venue, 'ACM Conference');
  assert.deepEqual(source.categories, ['cs.HC', 'cs.AI']);
  assert.equal(source.url, 'https://arxiv.org/abs/2505.01648v1');
  assert.equal(source.documentUrl, 'https://arxiv.org/pdf/2505.01648v1');
  assert.equal(source.documentVersion, 'v1');
  assert.equal(source.peerReview, 'unknown');
  assert.equal(source.documentAccess, 'pdf_candidate_unverified');
  assert.equal(result.nextPage, 3);
  assert.equal((result as any).paginationLimited, false);
});

test('arXiv rejects error Atom feeds and refuses a PDF link for a different e-print', async () => {
  const wrongPdf = arxivFeed('2505.01648v1', '2505.09999v1');
  const service = new ResearchService(async () => ({}), process.env,
    async () => wrongPdf, async () => {});
  const result = await service.search({ query: 'unrelated record', provider: 'arxiv' });
  assert.equal((result.results[0] as any).documentUrl, null);
  const errorFeed = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><opensearch:totalResults>1</opensearch:totalResults><entry><id>http://arxiv.org/api/errors#bad</id><summary>incorrect id format</summary></entry></feed>`;
  const errorService = new ResearchService(async () => ({}), process.env,
    async () => errorFeed, async () => {});
  await assert.rejects(errorService.search({ query: 'bad input', provider: 'arxiv' }), /incorrect id format/);
});

test('arXiv leaves malformed entries without a source URL and exposes valid record and PDF resources', async () => {
  const noIdFeed = arxivFeed().replace('<id>http://arxiv.org/abs/2505.01648v1</id>', '<id>urn:untrusted:entry</id>');
  const service = new ResearchService(async () => ({}), process.env,
    async () => noIdFeed, async () => {});
  const results = (await service.search({ query: 'source integrity', provider: 'arxiv' })).results as any[];
  assert.equal(results[0].url, null);
  assert.equal(results[0].sourceUrlAvailable, false);
  assert.equal(results[0].documentUrl, null);

  const validService = new ResearchService(async () => ({}), process.env,
    async () => arxivFeed(), async () => {});
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service: validService });
  const response = await handlers.get('campus_research_search')({ query: 'source integrity', provider: 'arxiv' });
  const record = JSON.parse(response.content[0].text).results[0];
  const links = response.content.filter((part: any) => part.type === 'resource_link');
  assert.equal(record.sourceUrlAvailable, true);
  assert.ok(links.some((part: any) => part.uri === record.url));
  assert.ok(links.some((part: any) => part.uri === record.documentUrl && part.mimeType === 'application/pdf'));
});

test('arXiv serializes requests with the provider recommended delay', async () => {
  const delays: number[] = [];
  const service = new ResearchService(async () => ({}), process.env,
    async () => arxivFeed(), async milliseconds => { delays.push(milliseconds); });
  await Promise.all([
    service.search({ query: 'one study', provider: 'arxiv', limit: 1 }),
    service.search({ query: 'two studies', provider: 'arxiv', limit: 1 }),
  ]);
  assert.equal(delays.length, 1);
  assert.ok(delays[0] >= 2_900 && delays[0] <= 3_000);
});

test('one malformed OpenAlex DOI does not discard other source records', async () => {
  const service = new ResearchService(async () => ({ meta: { count: 2 }, results: [
    { id: 'https://openalex.org/W1', display_name: 'First', doi: 'malformed',
      primary_location: { landing_page_url: 'https://repository.example.edu/first' } },
    { id: 'https://openalex.org/W2', display_name: 'Second', doi: 'https://doi.org/10.1234/second' },
  ] }));
  const results = (await service.search({ query: 'education', provider: 'openalex' })).results as any[];
  assert.equal(results.length, 2);
  assert.equal(results[0].doi, null);
  assert.equal(results[0].url, 'https://repository.example.edu/first');
  assert.equal(results[1].doi, '10.1234/second');
  assert.equal(results[1].url, 'https://doi.org/10.1234/second');
});

test('OpenAlex repository search selects the repository PDF and exposes its version', async () => {
  const service = new ResearchService(async () => ({ meta: { count: 1 }, results: [{
    id: 'https://openalex.org/W9', display_name: 'A study', doi: '10.1234/study', locations: [
      { source: { type: 'journal', display_name: 'Publisher' },
        pdf_url: 'https://publisher.example.edu/study.pdf', version: 'publishedVersion' },
      { source: { type: 'repository', display_name: 'University' },
        pdf_url: 'https://repository.example.edu/study.pdf', version: 'acceptedVersion', license: 'cc-by' },
    ],
  }] }));
  const repository = (await service.search({ query: 'learning', provider: 'openalex', repositoriesOnly: true })).results[0] as any;
  assert.equal(repository.documentUrl, 'https://repository.example.edu/study.pdf');
  assert.equal(repository.documentLocationType, 'repository');
  assert.equal(repository.documentVersion, 'acceptedVersion');
  assert.equal(repository.documentLicense, 'cc-by');
  const unrestricted = (await service.search({ query: 'learning', provider: 'openalex' })).results[0] as any;
  assert.equal(unrestricted.documentUrl, 'https://publisher.example.edu/study.pdf');
  assert.equal(unrestricted.documentVersion, 'publishedVersion');
});

test('OpenAlex search exposes the selected publisher PDF from locations as a resource link', async () => {
  const publisherPdf = 'https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0301214&type=printable';
  const service = new ResearchService(async () => ({ meta: { count: 1 }, results: [{
    id: 'https://openalex.org/W9', display_name: 'Correction: A vaccine study', doi: '10.1371/journal.pone.0301214',
    locations: [
      { source: { type: 'journal', display_name: 'PLOS ONE' }, pdf_url: publisherPdf, version: 'publishedVersion' },
      { source: { type: 'repository', display_name: 'PubMed Central' }, pdf_url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10956798/pdf/pone.0301214.pdf', version: 'submittedVersion' },
      { source: { type: 'repository', display_name: 'arXiv' }, landing_page_url: 'https://arxiv.org/pdf/1706.03762v5', pdf_url: null, version: 'submittedVersion' },
    ],
  }] }));
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service });
  const response = await handlers.get('campus_research_search')({ query: 'correction vaccine study', provider: 'openalex' });
  const record = JSON.parse(response.content.find((part: any) => part.type === 'text').text).results[0];
  const links = response.content.filter((part: any) => part.type === 'resource_link');
  assert.equal(record.documentUrl, publisherPdf);
  assert.ok(links.some((part: any) => part.uri === publisherPdf && part.mimeType === 'application/pdf'));
  assert.ok(links.some((part: any) => part.uri === 'https://arxiv.org/pdf/1706.03762v5'
    && part.mimeType === 'text/html'));
});

test('repository search does not label a publisher PDF as the requested repository file', async () => {
  const service = new ResearchService(async () => ({ meta: { count: 1 }, results: [{
    id: 'https://openalex.org/W10', display_name: 'A study', locations: [
      { source: { type: 'journal' }, pdf_url: 'https://publisher.example.edu/study.pdf' },
      { source: { type: 'repository' }, landing_page_url: 'https://repository.example.edu/study' },
    ],
  }] }));
  const result = (await service.search({ query: 'learning', provider: 'openalex', repositoriesOnly: true })).results[0] as any;
  assert.equal(result.repositoryLocations.length, 1);
  assert.equal(result.documentUrl, null);
  assert.equal(result.documentAccess, 'not_provided_by_catalog');
});

test('exact DOI resolution connects a catalog record to versioned PDF candidates', async () => {
  const calls: string[] = [];
  const service = new ResearchService(async url => {
    calls.push(url);
    if (url.includes('/works/https://doi.org/')) return {
      id: 'https://openalex.org/W123', doi: 'https://doi.org/10.1234/abc', display_name: 'Evidence',
      locations: [
        { pdf_url: 'https://repository.example.edu/evidence.pdf', version: 'acceptedVersion',
          license: 'cc-by', source: { type: 'repository' } },
        { pdf_url: 'https://127.0.0.1/private.pdf', source: { type: 'repository' } },
      ],
    };
    if (url.includes('filter=updates%3A')) return collection([]);
    return { message: { ...work, link: [
      { URL: 'https://publisher.example.edu/evidence.pdf', 'content-type': 'application/pdf',
        'content-version': 'vor' },
    ] } };
  });
  const result = await service.resolveDocument({ doi: 'https://doi.org/10.1234/ABC' });
  assert.equal(result.registryStatus, 'registered_in_crossref');
  assert.equal(result.openalexStatus, 'found');
  assert.equal(result.pdfCandidates, 2);
  assert.deepEqual(result.results.filter(item => item.kind === 'pdf').map(item => item.url), [
    'https://publisher.example.edu/evidence.pdf', 'https://repository.example.edu/evidence.pdf',
  ]);
  assert.equal(result.results[1].version, 'acceptedVersion');
  assert.equal(result.results[1].locationType, 'repository');
  assert.equal(result.results[1].documentAccess, 'candidate_unverified');
  assert.ok(calls.some(url => url.includes('/works/https://doi.org/10.1234%2Fabc')));
});

test('DOI resolution preserves a repository landing page without promoting it to a PDF', async () => {
  const repositoryUrl = 'https://hdl.handle.net/2086/22272';
  const service = new ResearchService(async url => {
    if (url.includes('/works/https://doi.org/')) return {
      id: 'https://openalex.org/W123', doi: work.DOI, display_name: 'Evidence',
      locations: [{ landing_page_url: repositoryUrl, pdf_url: null, version: 'submittedVersion',
        source: { type: 'repository', display_name: 'Institutional Repository' } }],
    };
    if (url.includes('filter=updates%3A')) return collection([]);
    return { message: { ...work, link: [] } };
  });
  const result = await service.resolveDocument({ doi: work.DOI });
  assert.equal(result.openalexStatus, 'found');
  assert.equal(result.pdfCandidates, 0);
  assert.deepEqual(result.results.map(candidate => ({ url: candidate.url, kind: candidate.kind,
    discoveredVia: candidate.discoveredVia, locationType: candidate.locationType,
    version: candidate.version, documentAccess: candidate.documentAccess })), [
    { url: repositoryUrl, kind: 'landing_page', discoveredVia: 'openalex_location',
      locationType: 'repository', version: 'submittedVersion', documentAccess: 'candidate_unverified' },
    { url: `https://doi.org/${work.DOI.toLowerCase()}`, kind: 'landing_page',
      discoveredVia: 'doi_resolver', locationType: null, version: null, documentAccess: 'candidate_unverified' },
  ]);
});

test('DOI resolution preserves registry candidates when OpenAlex fails or returns another DOI', async () => {
  for (const openalexFailure of [new ResearchHttpError(503), {
    id: 'https://openalex.org/W999', doi: '10.1234/wrong', display_name: 'Wrong',
    locations: [{ pdf_url: 'https://wrong.example.edu/file.pdf' }],
  }]) {
    const service = new ResearchService(async url => {
      if (url.includes('/works/https://doi.org/')) {
        if (openalexFailure instanceof Error) throw openalexFailure;
        return openalexFailure;
      }
      if (url.includes('filter=updates%3A')) return collection([]);
      return { message: { ...work, link: [{ URL: 'https://publisher.example.edu/real.pdf',
        'content-type': 'application/pdf' }] } };
    });
    const result = await service.resolveDocument({ doi: work.DOI });
    assert.equal(result.openalexStatus, 'unavailable');
    assert.equal(result.pdfCandidates, 1);
    assert.equal(result.results[0].url, 'https://publisher.example.edu/real.pdf');
  }
});

test('DOI resolution upgrades a shared generic link to an explicit PDF candidate', async () => {
  const shared = 'https://publisher.example.edu/articles/10.1234/abc/fulltext';
  const service = new ResearchService(async url => {
    if (url.includes('/works/https://doi.org/')) return {
      id: 'https://openalex.org/W123', doi: '10.1234/abc', display_name: 'Evidence',
      locations: [{ pdf_url: shared, version: 'publishedVersion', license: 'cc-by',
        source: { type: 'journal' } }],
    };
    if (url.includes('filter=updates%3A')) return collection([]);
    return { message: { ...work, link: [{ URL: shared, 'content-type': 'text/html' }] } };
  });
  const result = await service.resolveDocument({ doi: work.DOI });
  assert.equal(result.pdfCandidates, 1);
  assert.equal(result.results.filter(candidate => candidate.url === shared).length, 1);
  const candidate = result.results.find(candidate => candidate.url === shared)!;
  assert.equal(candidate.kind, 'pdf');
  assert.equal(candidate.discoveredVia, 'openalex_location');
  assert.equal(candidate.version, 'publishedVersion');
});

test('DOI resolution exposes each public file candidate as an MCP resource link', async () => {
  const handlers = new Map<string, any>();
  const service = new ResearchService(async url => {
    if (url.includes('/works/https://doi.org/')) throw new ResearchHttpError(404);
    if (url.includes('filter=updates%3A')) return collection([]);
    return { message: { ...work, link: [{ URL: 'https://link.springer.com/real.pdf',
      'content-type': 'application/pdf' }] } };
  });
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service });
  const response = await handlers.get('campus_research_resolve_document')({ doi: work.DOI });
  assert.equal(response.isError, undefined);
  assert.ok(response.content.some((item: any) => item.type === 'resource_link'
    && item.uri === 'https://link.springer.com/real.pdf'));
  assert.equal(JSON.parse(response.content[0].text).pdfCandidates, 1);
});

test('DataCite arXiv DOI resolves its alternate identifier to a candidate PDF', async () => {
  const doi = '10.48550/arxiv.1706.03762';
  const arxivPdf = 'https://arxiv.org/pdf/1706.03762';
  const service = new ResearchService(async url => {
    if (url.includes('crossref.org')) throw new ResearchHttpError(404);
    if (url.includes('api.datacite.org')) return { data: { id: doi, attributes: { doi,
      titles: [{ title: 'Attention Is All You Need' }], creators: [
        { name: 'Vaswani, Ashish', nameType: 'Personal', givenName: 'Ashish', familyName: 'Vaswani' },
      ], publicationYear: 2017, publisher: 'arXiv', types: { resourceTypeGeneral: 'Preprint' }, url: 'https://arxiv.org/abs/1706.03762', alternateIdentifiers: [
        { alternateIdentifierType: 'arXiv', alternateIdentifier: '1706.03762' },
        { alternateIdentifierType: 'arXiv', alternateIdentifier: 'https://evil.example/file.pdf' },
      ] } } };
    if (url.includes('api.openalex.org')) throw new ResearchHttpError(404);
    assert.fail(`Unexpected URL: ${url}`);
  });
  const citation = await service.verifyCitation({ doi, expectedTitle: 'Attention Is All You Need',
    expectedAuthors: ['Ashish Vaswani'], expectedYear: 2017 });
  assert.equal(citation.citeAllowed, true);
  const result = await service.resolveDocument({ doi });
  assert.equal(result.registryStatus, 'registered_in_datacite');
  assert.equal(result.openalexStatus, 'not_found');
  assert.ok(result.results.some(candidate => candidate.url === arxivPdf && candidate.kind === 'pdf'
    && candidate.discoveredVia === 'datacite_arxiv_identifier' && candidate.version === null));
  assert.equal(result.results.some(candidate => candidate.url.includes('evil.example')), false);
});

test('DataCite Zenodo DOI resolves only files from the matching public record', async () => {
  const doi = '10.5281/zenodo.11188804';
  const pdf = 'https://zenodo.org/api/records/11188804/files/study.pdf/content';
  const makeService = (recordDoi: string) => new ResearchService(async (url, headers) => {
    if (url.includes('crossref.org')) throw new ResearchHttpError(404);
    if (url.includes('api.datacite.org')) return { data: { id: doi, attributes: { doi,
      titles: [{ title: 'Smart Community Access' }], creators: [{ name: 'Chan Ka Ying' }],
      publicationYear: 2024, url: 'https://zenodo.org/doi/10.5281/zenodo.11188804' } } };
    if (url.includes('zenodo.org/api/records/')) {
      assert.equal(headers?.Accept, 'application/json');
      return { id: 11188804, metadata: { doi: recordDoi }, files: [
        { key: 'study.pdf', mimetype: 'application/pdf', links: { self: pdf } },
        { key: 'foreign.pdf', mimetype: 'application/pdf',
          links: { self: 'https://other.example.edu/private.pdf' } },
        { key: 'notes.txt', mimetype: 'text/plain',
          links: { self: 'https://zenodo.org/api/records/11188804/files/notes.txt/content' } },
        { key: 'draft.docx', mimetype: 'application/octet-stream',
          links: { self: 'https://zenodo.org/api/records/11188804/files/draft.docx/content' } },
        { key: 'book.epub', mimetype: 'application/octet-stream',
          links: { self: 'https://zenodo.org/api/records/11188804/files/book.epub/content' } },
        { key: 'data.csv', mimetype: 'text/csv',
          links: { self: 'https://zenodo.org/api/records/11188804/files/data.csv/content' } },
        { key: 'table.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          links: { self: 'https://zenodo.org/api/records/11188804/files/table.xlsx/content' } },
      ] };
    }
    if (url.includes('api.openalex.org')) throw new ResearchHttpError(404);
    assert.fail(`Unexpected URL: ${url}`);
  });
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service: makeService(doi) });
  const response = await handlers.get('campus_research_resolve_document')({ doi });
  const value = JSON.parse(response.content[0].text);
  assert.equal(value.zenodoStatus, 'found');
  assert.equal(value.pdfCandidates, 1);
  assert.equal(value.documentCandidates, 5);
  assert.ok(value.results.some((candidate: any) => candidate.url === pdf
    && candidate.kind === 'pdf' && candidate.discoveredVia === 'zenodo_record_file'));
  assert.ok(value.results.some((candidate: any) => candidate.kind === 'document'
    && candidate.formatHint === 'text'));
  assert.ok(value.results.some((candidate: any) => candidate.kind === 'document'
    && candidate.formatHint === 'docx'));
  assert.ok(value.results.some((candidate: any) => candidate.kind === 'document'
    && candidate.formatHint === 'epub'));
  assert.ok(value.results.some((candidate: any) => candidate.kind === 'document'
    && candidate.formatHint === 'csv'));
  assert.ok(value.results.some((candidate: any) => candidate.kind === 'document'
    && candidate.formatHint === 'xlsx'));
  assert.ok(response.content.some((item: any) => item.type === 'resource_link'
    && item.uri === pdf && item.mimeType === 'application/pdf'));
  assert.ok(response.content.some((item: any) => item.type === 'resource_link'
    && item.uri.endsWith('/notes.txt/content') && item.mimeType === 'text/plain'));
  assert.ok(response.content.some((item: any) => item.type === 'resource_link'
    && item.uri.endsWith('/draft.docx/content')
    && item.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
  assert.ok(response.content.some((item: any) => item.type === 'resource_link'
    && item.uri.endsWith('/data.csv/content') && item.mimeType === 'text/csv'));
  assert.ok(response.content.some((item: any) => item.type === 'resource_link'
    && item.uri.endsWith('/table.xlsx/content')
    && item.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
  assert.ok(!JSON.stringify(value).includes('other.example.edu'));
  const mismatched = await makeService('10.5281/zenodo.99999999').resolveDocument({ doi });
  assert.equal(mismatched.zenodoStatus, 'unavailable');
  assert.equal(mismatched.pdfCandidates, 0);
});

test('Scopus DOI queries use DOI() and reject mismatched result identifiers', async () => {
  const doi = '10.1145/3459043.3459060';
  const service = new ResearchService(async url => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('query'), `DOI("${doi}")`);
    return { 'search-results': { 'opensearch:totalResults': '1', entry: [{
      'dc:identifier': 'SCOPUS_ID:123', 'dc:title': 'The Trends and Challenges of Emerging Technologies in Higher Education',
      'prism:doi': doi, link: [{ '@ref': 'scopus', '@href': 'https://www.scopus.com/record/display.uri?eid=123' }],
    }] } };
  }, { SCOPUS_API_KEY: 'scopus-secret' });
  for (const query of [doi, `doi:${doi}`, `https://doi.org/${doi}`]) {
    const result = await service.search({ query, provider: 'scopus' });
    assert.equal(result.total, 1, query);
    assert.equal((result.results[0] as any).doi, doi, query);
    assert.equal((result.results[0] as any).title,
      'The Trends and Challenges of Emerging Technologies in Higher Education', query);
  }

  const inconsistent = new ResearchService(async () => ({ 'search-results': {
    'opensearch:totalResults': '1', entry: [{ 'dc:identifier': 'SCOPUS_ID:124',
      'prism:doi': '10.1145/9999999.9999999' }],
  } }), { SCOPUS_API_KEY: 'scopus-secret' });
  await assert.rejects(inconsistent.search({ query: doi, provider: 'scopus' }), /DOI distinto/);
});

test('Scopus preserves the provider record URL and falls back to a registered DOI URL', async () => {
  const service = new ResearchService(async () => ({ 'search-results': {
    'opensearch:totalResults': '2', entry: [
      { 'dc:identifier': 'SCOPUS_ID:1', 'dc:title': 'First', 'prism:doi': '10.1234/First',
        link: [{ '@ref': 'scopus', '@href': 'https://www.scopus.com/record/display.uri?eid=first' }] },
      { 'dc:identifier': 'SCOPUS_ID:2', 'dc:title': 'Second', 'prism:doi': '10.1234/Second' },
    ],
  } }), { SCOPUS_API_KEY: 'secret' });
  const results = (await service.search({ query: 'education', provider: 'scopus' })).results as any[];
  assert.equal(results[0].url, 'https://www.scopus.com/record/display.uri?eid=first');
  assert.equal(results[1].url, 'https://doi.org/10.1234/second');
  assert.equal(results[1].documentUrl, null);
  assert.equal(results[1].sourceUrlAvailable, true);
  assert.equal(results[1].documentAccess, 'not_provided_by_catalog');
});

test('Scopus upgrades only its official HTTP record host to HTTPS', async () => {
  const service = new ResearchService(async () => ({ 'search-results': {
    'opensearch:totalResults': '2', entry: [
      { 'dc:identifier': 'SCOPUS_ID:1', 'dc:title': 'Official',
        link: [{ '@ref': 'scopus', '@href': 'http://www.scopus.com/inward/record.url?eid=1' }] },
      { 'dc:identifier': 'SCOPUS_ID:2', 'dc:title': 'Impersonator',
        link: [{ '@ref': 'scopus', '@href': 'http://scopus.com.attacker.example/record' }] },
    ],
  } }), { SCOPUS_API_KEY: 'secret' });
  const results = (await service.search({ query: 'education', provider: 'scopus' })).results as any[];
  assert.equal(results[0].url, 'https://www.scopus.com/inward/record.url?eid=1');
  assert.equal(results[1].url, null);
});

test('Scopus uses a later public record link when an earlier candidate is unsafe', async () => {
  const service = new ResearchService(async () => ({ 'search-results': {
    'opensearch:totalResults': '1', entry: [{ 'dc:identifier': 'SCOPUS_ID:9', 'dc:title': 'Study', link: [
      { '@ref': 'scopus', '@href': 'https://127.0.0.1/private' },
      { '@ref': 'scopus', '@href': 'https://www.scopus.com/record/display.uri?eid=9' },
    ] }],
  } }), { SCOPUS_API_KEY: 'secret' });
  const result = (await service.search({ query: 'education', provider: 'scopus' })).results[0] as any;
  assert.equal(result.url, 'https://www.scopus.com/record/display.uri?eid=9');
  assert.equal(result.sourceUrlAvailable, true);
});

test('a catalog record without a trustworthy link is marked unavailable', async () => {
  const service = new ResearchService(async () => ({ 'search-results': {
    'opensearch:totalResults': '3', entry: [
      { 'dc:identifier': 'SCOPUS_ID:3', 'dc:title': 'Unlinked',
        link: [{ '@ref': 'scopus', '@href': 'http://example.edu/insecure' }] },
      { 'dc:identifier': 'SCOPUS_ID:4', 'dc:title': 'Local IP',
        link: [{ '@ref': 'scopus', '@href': 'https://127.0.0.1/private' }] },
      { 'dc:identifier': 'SCOPUS_ID:5', 'dc:title': 'Local host',
        link: [{ '@ref': 'scopus', '@href': 'https://localhost/private' }] },
    ],
  } }), { SCOPUS_API_KEY: 'secret' });
  const sources = (await service.search({ query: 'education', provider: 'scopus' })).results as any[];
  for (const source of sources) {
    assert.equal(source.url, null);
    assert.equal(source.sourceUrlAvailable, false);
  }
});

test('ACM prefix search filters unrelated Crossref candidates while preserving the broad provider total', async () => {
  const relevant = { ...work, DOI: '10.1145/123.456', title: ['Learning Accessibility in Online Education'] };
  const unrelated = { ...work, DOI: '10.1145/999.888', title: ['IPAS: protection against silent output corruption in scientific applications'] };
  const service = new ResearchService(async () => collection([unrelated, relevant], 193));
  const result = await service.search({ query: 'online learning accessibility', provider: 'acm_dl' });
  assert.equal(result.total, 193);
  assert.equal(result.queryMatchFilteredCount, 1);
  assert.equal(result.results.length, 1);
  assert.equal((result.results[0] as any).doi, relevant.DOI);
  assert.equal((result.results[0] as any).queryTitleMatch.assessment, 'title_terms_overlap');
});

test('ACM short topical queries retain candidates but expose weak title overlap', async () => {
  const candidate = { ...work, DOI: '10.1145/123.789', title: ['Graph Neural Networks for Molecular Discovery'] };
  const service = new ResearchService(async () => collection([candidate], 18));
  const result = await service.search({ query: 'AI', provider: 'acm_dl' });
  assert.equal(result.results.length, 1);
  assert.equal(result.queryMatchFilteredCount, 0);
  assert.deepEqual((result.results[0] as any).queryTitleMatch,
    { matchedTerms: 0, totalTerms: 1, score: 0, assessment: 'query_too_broad_to_filter' });
});

test('multi-database search preserves ACM relevance filtering diagnostics', async () => {
  const relevant = { ...work, DOI: '10.1145/123.456', title: ['Learning Accessibility in Online Education'] };
  const unrelated = { ...work, DOI: '10.1145/999.888', title: ['IPAS: silent output corruption in scientific applications'] };
  const service = new ResearchService(async () => collection([unrelated, relevant], 193));
  const result = await service.searchDatabases({ query: 'online learning accessibility',
    providers: ['acm_dl'], yearFrom: 2016, yearTo: 2016 });
  assert.equal(result.databases[0].status, 'ok');
  assert.equal(result.databases[0].total, 193);
  assert.equal((result.databases[0] as any).queryMatchFilteredCount, 1);
  assert.equal(result.databases[0].results.length, 1);
  assert.equal((result.databases[0].results[0] as any).doi, relevant.DOI);
});

test('Web of Science DOI queries use DO= and reject mismatched hits', async () => {
  const doi = '10.1145/3459043.3459060';
  const service = new ResearchService(async url => {
    assert.equal(new URL(url).searchParams.get('q'), `DO=${doi}`);
    return { metadata: { total: 1 }, hits: [{ uid: 'WOS:3459043',
      title: 'The Trends and Challenges of Emerging Technologies in Higher Education',
      identifiers: { doi } }] };
  }, { WOS_API_KEY: 'wos-secret' });
  for (const query of [doi, `doi:${doi}`, `https://doi.org/${doi}`]) {
    const result = await service.search({ query, provider: 'web_of_science' });
    assert.equal(result.total, 1, query);
    assert.equal((result.results[0] as any).doi, doi, query);
  }

  const inconsistent = new ResearchService(async () => ({ metadata: { total: 1 }, hits: [{
    uid: 'WOS:wrong', identifiers: { doi: '10.1145/9999999.9999999' },
  }] }), { WOS_API_KEY: 'wos-secret' });
  await assert.rejects(inconsistent.search({ query: doi, provider: 'web_of_science' }), /DOI distinto/);
});

test('Web of Science places one-sided year bounds in the supported PY search field', async () => {
  const queries: string[] = [];
  const service = new ResearchService(async url => {
    queries.push(new URL(url).searchParams.get('q')!);
    return { metadata: { total: 0 }, hits: [] };
  }, { WOS_API_KEY: 'wos-secret' });
  await service.search({ query: 'education', provider: 'web_of_science', yearFrom: 2024 });
  await service.search({ query: 'education', provider: 'web_of_science', yearTo: 2020 });
  assert.equal(queries[0], `TS=("education") AND PY=(2024-${new Date().getUTCFullYear()})`);
  assert.equal(queries[1], 'TS=("education") AND PY=(1500-2020)');
});

test('Web of Science accepts omitted hits only for an empty result page', async () => {
  const empty = new ResearchService(async () => ({ metadata: { total: 0 } }), { WOS_API_KEY: 'wos-secret' });
  const result = await empty.search({ query: 'education', provider: 'web_of_science' });
  assert.equal(result.total, 0);
  assert.deepEqual(result.results, []);
  const pastLastPage = new ResearchService(async () => ({ metadata: { total: 1 } }), { WOS_API_KEY: 'wos-secret' });
  assert.deepEqual((await pastLastPage.search({ query: 'education', provider: 'web_of_science', page: 2 })).results, []);
  const inconsistent = new ResearchService(async () => ({ metadata: { total: 1 } }), { WOS_API_KEY: 'wos-secret' });
  await assert.rejects(inconsistent.search({ query: 'education', provider: 'web_of_science' }),
    /informó resultados pero no devolvió/);
});

test('multi-database search accepts every implemented provider in one request', async () => {
  const providers = ['crossref', 'openalex', 'pubmed', 'europe_pmc', 'openaire', 'semantic_scholar',
    'arxiv', 'acm_dl', 'scopus', 'web_of_science'] as const;
  const called: string[] = [];
  const service = new ResearchService();
  (service as any).search = async (input: any) => {
    called.push(input.provider);
    return { provider: input.provider, total: 0, results: [] };
  };
  const result = await service.searchDatabases({ query: 'education', providers: [...providers], recentYears: 3 });
  assert.deepEqual(called, providers);
  assert.deepEqual(result.databases.map(item => item.provider), providers);
  assert.ok(result.databases.every(item => item.status === 'ok' && item.total === 0));
});

test('citation verification normalizes inline HTML and entities in discovered titles', async () => {
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: work } : collection([]));
  for (const expectedTitle of ['<i>Evidence</i>', 'Evi<em>dence</em>', 'Evid&#101;nce']) {
    const result = await service.verifyCitation({ doi: work.DOI, expectedTitle });
    assert.equal(result.status, 'verified', expectedTitle);
    assert.equal(result.citeAllowed, true, expectedTitle);
    assert.equal(result.comparisons.title, 'match', expectedTitle);
  }
  const wrongTitle = await service.verifyCitation({ doi: work.DOI,
    expectedTitle: '<i>Unrelated</i> evidence' });
  assert.equal(wrongTitle.status, 'rejected');
  assert.equal(wrongTitle.citeAllowed, false);
  assert.equal(wrongTitle.comparisons.title, 'mismatch');
});

test('citation verification tolerates middle initials absent from Crossref while preserving author order and count', async () => {
  const doi = '10.3998/tia.3168';
  const article = { ...work, DOI: doi,
    title: ['A collaborative model for faculty development: Helping faculty develop inclusive teaching practices'],
    issued: { 'date-parts': [[2023]] },
    author: [{ given: 'Christina', family: 'Bifulco' }, { given: 'Christopher', family: 'Drue' }] };
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: article } : collection([]));
  const title = article.title[0];
  const matching = await service.verifyCitation({ doi, expectedTitle: title,
    expectedAuthors: ['Christina A. Bifulco', 'Christopher R. Drue'], expectedYear: 2023 });
  assert.equal(matching.citeAllowed, true);
  assert.equal(matching.comparisons.authors, 'match');
  const wrongOrder = await service.verifyCitation({ doi, expectedTitle: title,
    expectedAuthors: ['Christopher R. Drue', 'Christina A. Bifulco'] });
  assert.equal(wrongOrder.comparisons.authors, 'mismatch');
  const incomplete = await service.verifyCitation({ doi, expectedTitle: title,
    expectedAuthors: ['Christina A. Bifulco'] });
  assert.equal(incomplete.comparisons.authors, 'mismatch');
});

test('a Crossref retraction blocks automated citation support and exposes its notice', async () => {
  const notice = { DOI: '10.1234/retraction', title: ['Retraction notice'],
    'update-to': [{ DOI: 'malformed-doi', type: 'retraction' },
      { DOI: work.DOI, type: 'retraction' }] };
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: work } : collection([notice]));
  const result = await service.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence',
    expectedAuthors: ['Ana Perez'], expectedYear: 2024 });
  assert.equal(result.status, 'retracted');
  assert.equal(result.citeAllowed, false);
  assert.equal(result.retractionStatus, 'flagged_by_crossref');
  assert.equal(result.claimEvidence, 'retracted_source_not_for_scientific_support');
  assert.deepEqual(result.retractionNotices, [{ doi: '10.1234/retraction',
    title: 'Retraction notice', url: 'https://doi.org/10.1234/retraction' }]);
  const quote = await verifyResearchQuote({ doi: work.DOI, expectedTitle: 'Evidence',
    url: 'https://publisher.example.edu/article.pdf', expectedSha256: 'a'.repeat(64),
    page: 1, quote: 'A complete sentence from the article.' }, {
    service,
    verifyIdentity: (async () => { assert.fail('retracted quote must stop before reading the file'); }) as any,
  });
  assert.equal(quote.verbatimCitationAllowed, false);
  assert.equal(quote.stage, 'bibliography');
});

test('a malformed update record cannot hide a separate valid retraction', async () => {
  const service = new ResearchService(async url => url.includes('/works/') ? { message: work }
    : collection([
      { DOI: 'not-a-doi', 'update-to': [{ DOI: work.DOI, type: 'correction' }] },
      { DOI: '10.1234/notice', title: ['Retraction notice'],
        'update-to': [{ DOI: work.DOI, type: 'retraction' }] },
    ]));
  const result = await service.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(result.status, 'retracted');
  assert.equal(result.citeAllowed, false);
  assert.deepEqual(result.retractionNotices?.map(notice => notice.doi), ['10.1234/notice']);
});

test('an exact correction notice pauses automated quotation until the notice is reviewed', async () => {
  const correction = { DOI: '10.1234/correction', title: ['Correction to Evidence'],
    'update-to': [{ DOI: work.DOI, type: 'correction' }] };
  const service = new ResearchService(async url => url.includes('/works/') ? { message: work }
    : collection([correction]));
  const citation = await service.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(citation.status, 'updated');
  assert.equal(citation.citeAllowed, false);
  assert.equal(citation.retractionStatus, 'no_notice_found_in_crossref');
  assert.equal(citation.claimEvidence, 'editorial_update_requires_review');
  assert.deepEqual(citation.editorialNotices, [{ doi: '10.1234/correction',
    title: 'Correction to Evidence', url: 'https://doi.org/10.1234/correction', type: 'correction' }]);
  const quote = await verifyResearchQuote({ doi: work.DOI, expectedTitle: 'Evidence',
    url: 'https://publisher.example.edu/article.pdf', expectedSha256: 'a'.repeat(64),
    page: 1, quote: 'A complete sentence from the article.' }, {
    service,
    verifyIdentity: (async () => { assert.fail('correction must be reviewed before reading the file'); }) as any,
  });
  assert.equal(quote.verbatimCitationAllowed, false);
  assert.equal(quote.reason, 'updated');
});

test('an original Crossref record with a correction relation blocks citation when update search is empty', async () => {
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, relation: { correction: [
      { 'id-type': 'doi', id: '10.1234/correction' },
    ] } } } : collection([]));
  const citation = await service.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(citation.status, 'updated');
  assert.equal(citation.citeAllowed, false);
  assert.deepEqual(citation.editorialNotices, [{ doi: '10.1234/correction', title: null,
    url: 'https://doi.org/10.1234/correction', type: 'correction' }]);
});

test('a known retraction remains explicit when the original record lacks authors and year', async () => {
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: { DOI: work.DOI, title: ['Evidence'], relation: { retraction: [
      { 'id-type': 'doi', id: '10.1234/retraction' },
    ] } } } : collection([]));
  const citation = await service.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(citation.status, 'retracted');
  assert.equal(citation.citeAllowed, false);
  assert.deepEqual(citation.missingFields, ['type', 'authors', 'year']);
  assert.equal(citation.claimEvidence, 'retracted_source_not_for_scientific_support');
  assert.deepEqual(citation.retractionNotices, [{ doi: '10.1234/retraction',
    title: null, url: 'https://doi.org/10.1234/retraction' }]);
});

test('failed or incomplete Crossref update searches cannot approve automated citation', async () => {
  for (const truncated of [false, true]) {
    const service = new ResearchService(async url => {
      if (url.includes('/works/')) return { message: work };
      if (!truncated) throw new ResearchHttpError(429);
      return collection([], 101);
    });
    const citation = await service.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
    assert.equal(citation.status, 'partial');
    assert.equal(citation.citeAllowed, false);
  }
});

test('strict citation verification rejects invented title, author or year', async () => {
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: work } : collection([]));
  const result = await service.verifyCitation({ doi: work.DOI, expectedTitle: 'Invented title',
    expectedAuthors: ['Other Author'], expectedYear: 2025 });
  assert.equal(result.status, 'rejected');
  assert.equal(result.citeAllowed, false);
  assert.deepEqual(result.mismatches, ['title', 'year', 'authors']);
  assert.equal(result.citationRecord?.title, 'Evidence');
});

test('empty normalized titles and author names fail before registry or document reads', async () => {
  let reads = 0;
  const never = async () => { reads++; assert.fail('External read must not run'); };
  const service = new ResearchService(never);
  await assert.rejects(service.verifyCitation({ doi: work.DOI, expectedTitle: '..........' }));
  await assert.rejects(service.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence',
    expectedAuthors: ['...'] }));
  await assert.rejects(verifyResearchDocumentIdentity({
    url: 'https://repository.example.edu/article.pdf', format: 'pdf',
    expectedSha256: 'a'.repeat(64), expectedTitle: '..........',
    expectedDoi: '10.1234/abc',
  }, { readPdf: never as any }));
  assert.equal(reads, 0);
});

test('strict citation verification fails closed for incomplete or absent registry metadata', async () => {
  const incomplete = new ResearchService(async url => url.includes('/works/')
    ? { message: { DOI: work.DOI, title: ['Evidence'] } } : collection([]));
  const partial = await incomplete.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.citeAllowed, false);
  assert.deepEqual(partial.missingFields, ['type', 'authors', 'year']);

  const absent = new ResearchService(async () => { throw new ResearchHttpError(404); });
  const unverified = await absent.verifyCitation({ doi: work.DOI, expectedTitle: 'Evidence' });
  assert.equal(unverified.status, 'unverified');
  assert.equal(unverified.citeAllowed, false);
  assert.equal(unverified.citationRecord, null);
});

test('DataCite DOI fallback verifies canonical metadata only after Crossref 404', async () => {
  const calls: string[] = [];
  const service = new ResearchService(async url => {
    calls.push(url);
    if (url.includes('crossref.org/works/')) throw new ResearchHttpError(404);
    if (url.includes('api.datacite.org/dois/')) return { data: { id: '10.14454/qdd3-ps68',
      attributes: { doi: '10.14454/qdd3-ps68', titles: [{ title: 'Metadata Schema Documentation' }],
        creators: [{ name: 'DataCite Metadata Working Group' }], publicationYear: 2026,
        publisher: 'DataCite', types: { resourceTypeGeneral: 'Text' },
        url: 'https://example.edu/document' } } };
    assert.fail(`Unexpected URL: ${url}`);
  });
  const result = await service.verifyCitation({ doi: '10.14454/qdd3-ps68',
    expectedTitle: 'Metadata Schema Documentation',
    expectedAuthors: ['DataCite Metadata Working Group'], expectedYear: 2026 });
  assert.equal(result.status, 'verified');
  assert.equal(result.citeAllowed, true);
  assert.equal(result.proof.registry, 'datacite');
  assert.equal(result.citationRecord?.url, 'https://doi.org/10.14454/qdd3-ps68');
  assert.equal(calls.length, 2);
});

test('DataCite personal creators prefer structured given and family names over inverted name strings', async () => {
  const doi = '10.48550/arXiv.1706.03762';
  const service = new ResearchService(async url => {
    if (url.includes('crossref.org/works/')) throw new ResearchHttpError(404);
    return { data: { id: doi.toLowerCase(), attributes: { doi: doi.toLowerCase(),
      titles: [{ title: 'Attention Is All You Need' }], creators: [
        { name: 'Vaswani, Ashish', nameType: 'Personal', givenName: 'Ashish', familyName: 'Vaswani' },
        { name: 'Gomez, Aidan N.', nameType: 'Personal', givenName: 'Aidan N.', familyName: 'Gomez' },
      ], publicationYear: 2017, publisher: 'arXiv', types: { resourceTypeGeneral: 'Preprint' },
      url: 'https://arxiv.org/abs/1706.03762' } } };
  });
  const result = await service.verifyCitation({ doi, expectedTitle: 'Attention Is All You Need',
    expectedAuthors: ['Ashish Vaswani', 'Aidan N. Gomez'], expectedYear: 2017 });
  assert.equal(result.status, 'verified');
  assert.equal(result.citeAllowed, true);
  assert.deepEqual(result.citationRecord?.authors.map(author => author.name), ['Ashish Vaswani', 'Aidan N. Gomez']);
});

test('DataCite can verify its DOI when Crossref is rate limited without masking dual failure', async () => {
  const doi = '10.5281/zenodo.11521555';
  const service = new ResearchService(async url => {
    if (url.includes('crossref.org')) throw new ResearchHttpError(429);
    return { data: { id: doi, attributes: { doi,
      titles: [{ title: 'The use of digital technologies in the educational process: advantages and problems of implementation' }],
      creators: [{ name: 'Sobirov Muslimjon Mukhsinjon ugli' }], publicationYear: 2024,
      publisher: 'LLC Fer-Teach', types: { resourceTypeGeneral: 'Text' },
      url: 'https://zenodo.org/doi/10.5281/zenodo.11521555' } } };
  });
  const result = await service.verifyCitation({ doi,
    expectedTitle: 'The use of digital technologies in the educational process: advantages and problems of implementation',
    expectedAuthors: ['Sobirov Muslimjon Mukhsinjon ugli'], expectedYear: 2024 });
  assert.equal(result.status, 'verified');
  assert.equal(result.proof.registry, 'datacite');
  const dualFailure = new ResearchService(async url => {
    throw new ResearchHttpError(url.includes('crossref.org') ? 429 : 404);
  });
  await assert.rejects(dualFailure.verifyDoi(doi), /límite de consultas/);
});

test('DataCite title entities are decoded once before bibliography and file identity checks', async () => {
  const doi = '10.5281/zenodo.5944022';
  const service = new ResearchService(async url => {
    if (url.includes('crossref.org')) throw new ResearchHttpError(404);
    return { data: { id: doi, attributes: { doi,
      titles: [{ title: 'Mallinella pseudokunmingensis Yu &amp; Zhang 2019, sp. n.' }],
      creators: [{ name: 'Yu Zhang' }], publicationYear: 2019, publisher: 'Zenodo', types: { resourceTypeGeneral: 'Text' } } } };
  });
  const citation = await service.verifyCitation({ doi,
    expectedTitle: 'Mallinella pseudokunmingensis Yu & Zhang 2019, sp. n.' });
  assert.equal(citation.status, 'verified');
  assert.equal(citation.citationRecord?.title,
    'Mallinella pseudokunmingensis Yu & Zhang 2019, sp. n.');
});

test('DataCite fallback rejects a mismatched DOI and incomplete citation metadata', async () => {
  const mismatched = new ResearchService(async url => {
    if (url.includes('crossref.org')) throw new ResearchHttpError(404);
    return { data: { id: '10.1234/wrong', attributes: { doi: '10.1234/wrong' } } };
  });
  await assert.rejects(mismatched.verifyDoi('10.1234/right'), /no coincide/);
  const incomplete = new ResearchService(async url => {
    if (url.includes('crossref.org')) throw new ResearchHttpError(404);
    return { data: { id: '10.1234/right', attributes: { doi: '10.1234/right',
      titles: [{ title: 'Real title' }] } } };
  });
  const result = await incomplete.verifyCitation({ doi: '10.1234/right', expectedTitle: 'Real title' });
  assert.equal(result.status, 'partial');
  assert.equal(result.citeAllowed, false);
  assert.deepEqual(result.missingFields, ['type', 'authors', 'year']);
  const unavailable = new ResearchService(async url => {
    if (url.includes('crossref.org')) throw new ResearchHttpError(404);
    throw new ResearchHttpError(503);
  });
  await assert.rejects(unavailable.verifyDoi('10.1234/right'), /503/);
});

test('absence from both registries is not labelled fake, while upstream failure is not absence', async () => {
  const missing = new ResearchService(async () => { throw new ResearchHttpError(404); });
  assert.equal((await missing.verifyDoi(work.DOI)).status, 'not_found_in_crossref_or_datacite');
  const failed = new ResearchService(async () => { throw new ResearchHttpError(503); });
  await assert.rejects(failed.verifyDoi(work.DOI), /503/);
  const mismatch = new ResearchService(async () => ({ message: { DOI: '10.9999/other' } }));
  await assert.rejects(mismatch.verifyDoi(work.DOI), /no coincide/);
});

test('Scholar exposes only public source links and distinguishes a PDF candidate from verified content', async () => {
  const service = new ResearchService(async () => ({ search_metadata: { status: 'Success' },
    organic_results: [
      { result_id: 'first', title: 'First study', link: 'http://example.edu/article', resources: [
        { title: 'PDF', link: 'https://repository.example.edu/article.pdf', file_format: 'PDF' },
        { title: 'Private', link: 'https://127.0.0.1/private.pdf', file_format: 'PDF' },
      ] },
      { result_id: 'second', title: 'No public link', link: 'https://127.0.0.1/private' },
    ] }), { SERPAPI_API_KEY: 'test-key' });
  const results = (await service.googleScholar({ query: 'education' }) as any).results;
  assert.equal(results[0].url, 'https://repository.example.edu/article.pdf');
  assert.equal(results[0].documentUrl, results[0].url);
  assert.equal(results[0].documentAccess, 'pdf_candidate_unverified');
  assert.equal(results[0].resources.length, 1);
  assert.equal(results[1].sourceUrlAvailable, false);
  assert.equal(results[1].documentUrl, null);
});

test('Scholar skips null resource links returned by SerpApi without losing other results', async () => {
  const service = new ResearchService(async () => ({ search_metadata: { status: 'Success' },
    organic_results: [
      { result_id: 'first', title: 'First study', link: null, resources: [
        { title: 'Unavailable PDF', link: null, file_format: 'PDF' },
        { title: 'Public PDF', link: 'https://repository.example.edu/article.pdf', file_format: 'PDF' },
      ] },
      { result_id: 'second', title: 'Second study', link: 'https://journal.example.edu/study',
        publication_info: { summary: null }, resources: null },
    ] }), { SERPAPI_API_KEY: 'test-key' });
  const results = (await service.googleScholar({ query: 'education' }) as any).results;
  assert.equal(results.length, 2);
  assert.equal(results[0].url, 'https://repository.example.edu/article.pdf');
  assert.equal(results[0].documentUrl, results[0].url);
  assert.equal(results[0].resources.length, 1);
  assert.equal(results[1].url, 'https://journal.example.edu/study');
});

test('Scopus, Web of Science, Semantic Scholar and arXiv access failures are errors, not empty searches', async () => {
  const handlers = new Map<string, any>();
  const service = new ResearchService(async url => {
    if (url.includes('api.elsevier.com')) throw new ResearchHttpError(401);
    if (url.includes('api.clarivate.com') || url.includes('api.semanticscholar.org')) throw new ResearchHttpError(429);
    assert.match(url, /api\.crossref\.org\/prefixes\/10\.1145\/works/);
    return collection([{ ...work, DOI: '10.1145/123.456' }]);
  }, { SCOPUS_API_KEY: 'scopus-secret', WOS_API_KEY: 'wos-secret' },
  async url => { assert.match(url, /export\.arxiv\.org\/api\/query/); throw new ResearchHttpError(429); },
  async () => {});
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service });

  for (const [provider, message] of [['scopus', /requiere iniciar sesión/], ['web_of_science', /límite/],
    ['semantic_scholar', /límite/], ['arxiv', /límite/]] as const) {
    const response = await handlers.get('campus_research_search')({ query: 'education', provider });
    assert.equal(response.isError, true);
    assert.match(response.content[0].text, message);
    assert.ok(!JSON.stringify(response).includes('secret'));
  }

  const response = await handlers.get('campus_research_search_databases')({ query: 'education', recentYears: 3 });
  assert.notEqual(response.isError, true);
  const result = JSON.parse(response.content[0].text);
  assert.equal(result.databases.find((item: any) => item.provider === 'acm_dl').status, 'ok');
  for (const provider of ['scopus', 'web_of_science']) {
    const database = result.databases.find((item: any) => item.provider === provider);
    assert.equal(database.status, 'unavailable');
    assert.equal(database.results, undefined);
    assert.equal(database.total, undefined);
  }
  assert.ok(!JSON.stringify(response).includes('secret'));
});

test('PDF parser works when the MCP host starts in ESM mode', () => {
  const script = `import { extractPdfBytes } from './src/providers/academic/research-pdf.ts';
    const result = await extractPdfBytes(Buffer.from(process.argv[1], 'base64'), 1, 1);
    console.log(JSON.stringify({ page: result.pages[0].page, text: result.pages[0].text }));`;
  const output = execFileSync(process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', script, pdfFixture().toString('base64')],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 15_000 });
  const page = JSON.parse(output);
  assert.equal(page.page, 1);
  assert.match(page.text, /Academic evidence on page one/);
});

test('indexed quote batches reject overflow, verify every submitted entry, and isolate evidence by analysis', async () => {
  const url = 'https://repository.example.edu/article.pdf';
  const index = new ResearchPdfIndex({
    download: async () => ({ bytes: pdfFixture(), url, contentType: 'application/pdf' }),
    extract: async (_bytes, onEvent) => {
      onEvent({ metadata: { totalPages: 1, outline: [] } });
      onEvent({ batch: [{ page: 1, text: 'A fully verified sentence for the academic citation test.',
        truncated: false, needsOcr: false }] });
    },
  });
  const { documentId, analysisId } = index.start('student-a', { url });
  const otherAnalysisId = index.start('student-a', { url }).analysisId;
  let state = index.status('student-a', { documentId });
  for (let attempt = 0; attempt < 100 && state.status !== 'ready'; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5));
    state = index.status('student-a', { documentId });
  }
  assert.equal(state.status, 'ready');
  const excerpts = ['A fully verified sentence for the academic citation test.', 'A fabricated conclusion absent from this page.'];
  const result = await index.verifyQuotes('student-a', { documentId, analysisId, url,
    expectedSha256: state.sha256!, citations: excerpts.map(excerpt => ({ page: 1, excerpt })) });
  assert.equal(result.processedCount, 2);
  assert.equal(result.allExcerptsLocated, false);
  assert.deepEqual(result.results.map(match => match.status), ['verified', 'rejected']);
  assert.equal(result.results[1].reason, 'excerpt_not_found_at_locator');
  assert.equal(index.status('student-a', { documentId, analysisId }).verifiedEvidence?.length, 1);
  assert.equal(index.status('student-a', { documentId, analysisId: otherAnalysisId }).verifiedEvidence?.length, 0);
  assert.throws(() => pdfIndexQuoteBatchInput.parse({ documentId, analysisId, url,
    expectedSha256: state.sha256, citations: Array.from({ length: 9 }, () => ({ page: 1, excerpt: excerpts[0] })) }),
  /hasta ocho citas/);
  await assert.rejects(index.verifyQuotes('student-a', { documentId, analysisId,
    url: 'https://repository.example.edu/alias.pdf', expectedSha256: state.sha256!,
    citations: [{ page: 1, excerpt: excerpts[0] }] }), /URL no corresponde/);
});

test('PDF index never marks duplicate pages as complete coverage', async () => {
  const index = new ResearchPdfIndex({
    download: async () => ({ bytes: pdfFixture(), url: 'https://repository.example.edu/study.pdf', contentType: 'application/pdf' }),
    extract: async (_bytes, onEvent) => {
      onEvent({ metadata: { totalPages: 2, outline: [] } });
      onEvent({ batch: [
        { page: 1, text: 'First page.', truncated: false, needsOcr: false },
        { page: 1, text: 'Repeated first page.', truncated: false, needsOcr: false },
      ] });
    },
  });
  const { documentId } = index.start('student-a', { url: 'https://repository.example.edu/study.pdf' });
  let status = index.status('student-a', { documentId });
  for (let attempt = 0; attempt < 20 && status.status !== 'failed'; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5));
    status = index.status('student-a', { documentId });
  }
  assert.equal(status.status, 'failed');
  assert.equal(status.indexedPages, 0);
  assert.match(status.error!, /duplicadas/);
  assert.deepEqual(index.search('student-a', { documentId, query: 'first page' }).matches, []);
});

test('PDF index refresh fetches changed bytes at the same URL and returns a new hash', async () => {
  let downloads = 0;
  const url = 'https://repository.example.edu/changing-study.pdf';
  const index = new ResearchPdfIndex({ download: async () => ({
    bytes: pdfFixture(`Version ${++downloads} reports a different finding.`), url,
    contentType: 'application/pdf',
  }) });
  const ready = async (documentId: string) => {
    let state = index.status('student-a', { documentId });
    for (let attempt = 0; attempt < 100 && state.status !== 'ready' && state.status !== 'failed'; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      state = index.status('student-a', { documentId });
    }
    assert.equal(state.status, 'ready');
    return state;
  };
  const first = await ready(index.start('student-a', { url }).documentId);
  assert.equal(index.start('student-a', { url }).documentId, first.documentId);
  assert.equal(downloads, 1);
  const second = await ready(index.start('student-a', { url, refresh: true }).documentId);
  assert.notEqual(second.documentId, first.documentId);
  assert.notEqual(second.sha256, first.sha256);
  assert.equal(downloads, 2);
  assert.match(index.read('student-a', { documentId: second.documentId, startPage: 1 }).pages[0].text, /Version 2/);
  assert.equal(index.start('student-a', { url }).documentId, second.documentId);
});

test('an over-capacity refresh preserves completed PDF indexes', async () => {
  const base = 'https://repository.example.edu/';
  const index = new ResearchPdfIndex({
    download: async url => {
      if (url.includes('hold-')) await new Promise<never>(() => {});
      return { bytes: pdfFixture(), url, contentType: 'application/pdf' };
    },
    extract: async (_bytes, onEvent) => {
      onEvent({ metadata: { totalPages: 1, outline: [] } });
      onEvent({ batch: [{ page: 1, text: 'A completed source.', truncated: false, needsOcr: false }] });
    },
  });
  const first = index.start('student-a', { url: `${base}ready-1.pdf` }).documentId;
  const second = index.start('student-a', { url: `${base}ready-2.pdf` }).documentId;
  for (let attempt = 0; attempt < 20 && index.status('student-a', { documentId: second }).status !== 'ready'; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(index.status('student-a', { documentId: first }).status, 'ready');
  assert.equal(index.status('student-a', { documentId: second }).status, 'ready');
  index.start('student-a', { url: `${base}hold-1.pdf` });
  index.start('student-a', { url: `${base}hold-2.pdf` });
  assert.throws(() => index.start('student-a', { url: `${base}ready-1.pdf`, refresh: true }), /ocupados/);
  assert.equal(index.status('student-a', { documentId: first }).status, 'ready');
  assert.equal(index.status('student-a', { documentId: second }).status, 'ready');
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
  assert.equal(result.content[1].mimeType, 'application/octet-stream');
  const unsafe = await handlers.get('campus_research_read_pdf')({ url: 'https://127.0.0.1/private.pdf' });
  assert.equal(unsafe.isError, true);
  assert.equal(unsafe.content.some((part: any) => part.type === 'resource_link'), false);
});

test('PDF parser failure returns a candidate link without claiming citation evidence', async () => {
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true,
    readPdf: async () => { throw new Error('El proceso lector del PDF falló antes de devolver evidencia.'); } });
  const result = await handlers.get('campus_research_read_pdf')({ url: 'https://publisher.example.edu/article.pdf' });
  const status = JSON.parse(result.content[0].text);
  assert.equal(status.reason, 'document_reader_unavailable');
  assert.equal(status.evidenceAllowed, false);
  assert.equal(result.content[1].uri, 'https://publisher.example.edu/article.pdf');
  assert.equal(result.content[1].mimeType, 'application/octet-stream');
});

test('a publisher-denied document read returns an explicitly unprocessed source link', async () => {
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true,
    readDocument: async () => { throw new ResearchHttpError(403); } });
  const result = await handlers.get('campus_research_read_document')({
    url: 'https://repository.example.edu/supplement.docx', format: 'docx',
  });
  assert.equal(result.isError, undefined);
  const status = JSON.parse(result.content[0].text);
  assert.equal(status.status, 'resource_link');
  assert.equal(status.reason, 'source_access_denied');
  assert.equal(status.httpStatus, 403);
  assert.equal(status.evidenceAllowed, false);
  assert.match(status.guidance, /No se leyó el archivo/);
  assert.equal(result.content[1].uri, 'https://repository.example.edu/supplement.docx');
});

test('a removed source URL is distinguishable from a format or parser failure', async () => {
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true,
    readDocument: async () => { throw new ResearchHttpError(404); } });
  const result = await handlers.get('campus_research_read_document')({
    url: 'https://repository.example.edu/old-file.docx', format: 'docx',
  });
  const status = JSON.parse(result.content[0].text);
  assert.equal(status.reason, 'source_not_found');
  assert.equal(status.evidenceAllowed, false);
  assert.equal(result.content[1].uri, 'https://repository.example.edu/old-file.docx');
});

test('an unprocessed PDF candidate does not get a verified PDF MIME type', async () => {
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true,
    readPdf: async () => ({ status: 'client_processing_required', reason: 'server_processing_unavailable',
      url: 'https://example.com/', guidance: 'Use the original link in the client.' }) as any });
  const result = await handlers.get('campus_research_read_pdf')({ url: 'https://example.com/' });
  assert.equal(result.content[1].uri, 'https://example.com/');
  assert.equal(result.content[1].mimeType, 'application/octet-stream');
  assert.match(result.content[0].text, /client_processing_required/);
});

test('HTML document reads expose a text/html resource even when the source URL lacks an extension', async () => {
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true,
    readDocument: (async () => ({ requestedUrl: 'https://publisher.example.edu/article?id=123',
      resolvedUrl: 'https://publisher.example.edu/article?id=123', retrievedAt: '2026-09-28T00:00:00.000Z',
      sha256: 'c'.repeat(64), format: 'html', totalSections: 1,
      sections: [{ section: 1, heading: null, text: 'Article text', truncated: false }],
      nextSection: null, textCoverage: 'complete', guidance: [] })) as any });
  const result = await handlers.get('campus_research_read_document')({
    url: 'https://publisher.example.edu/article?id=123', format: 'auto' });
  assert.equal(result.content[1].uri, 'https://publisher.example.edu/article?id=123');
  assert.equal(result.content[1].mimeType, 'text/html');
});

test('evidence receipts expose the final resolved document URL as their resource link', async () => {
  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true,
    verifyEvidence: (async () => ({ status: 'verified', evidenceAllowed: true,
      proof: { resolvedUrl: 'https://cdn.example.edu/final.pdf', documentSha256: 'a'.repeat(64) } })) as any });
  const result = await handlers.get('campus_research_verify_evidence')({
    url: 'https://repository.example.edu/redirect', page: 1, claim: 'A claim',
    excerpt: 'A sufficiently long excerpt.', expectedSha256: 'a'.repeat(64),
  });
  assert.equal(result.content[1].uri, 'https://cdn.example.edu/final.pdf');
});

test('MCP evidence validation explains missing or ambiguous locators before reading a source', async () => {
  const handlers = new Map<string, any>();
  let verificationCalls = 0;
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true,
    verifyEvidence: (async () => { verificationCalls++; return { status: 'verified' }; }) as any });
  const base = { url: 'https://repository.example.edu/article.pdf',
    excerpt: 'A sufficiently long excerpt.', claim: 'The claim being checked.',
    expectedSha256: 'a'.repeat(64) };
  for (const args of [base, { ...base, page: 1, section: 1 }]) {
    const result = await handlers.get('campus_research_verify_evidence')(args);
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Indica exactamente page o section\./);
  }
  assert.equal(verificationCalls, 0);
});

test('Crossref full-text PDF links infer MIME from the URL when the catalog says unspecified', async () => {
  const pdfUrl = 'https://dl.acm.org/doi/pdf/10.1145/3430263.3452445';
  const handlers = new Map<string, any>();
  const service = new ResearchService(async () => collection([{ ...work,
    link: [{ URL: pdfUrl, 'content-type': 'unspecified' }] }]));
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service });
  const result = await handlers.get('campus_research_search')({ query: 'Evidence', provider: 'acm_dl' });
  const pdf = result.content.find((part: any) => part.type === 'resource_link' && part.uri === pdfUrl);
  assert.ok(pdf);
  assert.equal(pdf.mimeType, 'application/pdf');
});

test('MCP exposes the verified DOI and correction notice as usable source links', async () => {
  const handlers = new Map<string, any>();
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, relation: { correction: [
      { 'id-type': 'doi', id: '10.1234/correction' },
    ] } } } : collection([]));
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service });
  const result = await handlers.get('campus_research_verify_citation')({
    doi: work.DOI, expectedTitle: 'Evidence',
  });
  const links = result.content.filter((part: any) => part.type === 'resource_link');
  assert.deepEqual(links.map((link: any) => link.uri), [
    'https://api.crossref.org/works/10.1234%2Fabc',
    'https://api.crossref.org/works/10.1234%2Fcorrection',
  ]);
  const doiLookup = await handlers.get('campus_research_verify_doi')({ doi: work.DOI });
  assert.deepEqual(doiLookup.content.filter((part: any) => part.type === 'resource_link')
    .map((link: any) => link.uri), [
    'https://api.crossref.org/works/10.1234%2Fabc',
  ]);
  const scholar = await handlers.get('campus_research_google_scholar')({
    query: 'online learning', mode: 'link',
  });
  assert.ok(scholar.content.some((part: any) => part.type === 'resource_link'
    && part.uri.startsWith('https://scholar.google.com/scholar?')));
});

test('many files for one result do not hide another result resource link', async () => {
  const handlers = new Map<string, any>();
  const firstLinks = Array.from({ length: 40 }, (_, index) => ({
    URL: `https://pmc.ncbi.nlm.nih.gov/first-${index}.pdf`, 'content-type': 'application/pdf',
  }));
  const service = new ResearchService(async () => collection([
    { ...work, title: ['First'], link: firstLinks },
    { ...work, DOI: '10.1234/second', title: ['Second'] },
  ]));
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service });
  const result = await handlers.get('campus_research_search')({ query: 'evidence' });
  const links = result.content.filter((part: any) => part.type === 'resource_link');
  assert.ok(links.some((part: any) => part.uri === 'https://pmc.ncbi.nlm.nih.gov/first-0.pdf'));
  assert.ok(links.some((part: any) => part.uri === 'https://api.crossref.org/works/10.1234%2Fsecond'));
  assert.ok(links.length <= 25);
});

test('actual MCP protocol exposes research schemas and returns source links', async () => {
  const server = new McpServer({ name: 'research-test', version: '1.0.0' });
  const client = new Client({ name: 'research-client-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const service = new ResearchService(async () => collection([{ ...work,
    link: [{ URL: 'https://pmc.ncbi.nlm.nih.gov/article.pdf', 'content-type': 'application/pdf' }] }]));
  registerResearchTools(server, { authorize: () => true, service,
    verifyQuote: (async () => ({ status: 'verified', verbatimCitationAllowed: true,
      resolvedUrl: 'https://pmc.ncbi.nlm.nih.gov/article.pdf' })) as any });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = await client.listTools();
    for (const name of ['campus_research_search', 'campus_research_verify_citation',
      'campus_research_verify_document_identity', 'campus_research_verify_evidence',
      'campus_research_verify_quote', 'campus_research_verify_quotes', 'campus_research_index_pdf']) {
      assert.ok(tools.tools.some(tool => tool.name === name));
    }
    const batchSchema = tools.tools.find(tool => tool.name === 'campus_research_verify_quotes')?.inputSchema as any;
    assert.equal(batchSchema.properties.citations.maxItems, 8);
    const documentSchema = tools.tools.find(tool => tool.name === 'campus_research_read_document')?.inputSchema as any;
    assert.ok(documentSchema.properties.format.enum.includes('csv'));
    assert.ok(documentSchema.properties.format.enum.includes('xlsx'));
    assert.ok((tools.tools.find(tool => tool.name === 'campus_research_index_pdf')?.inputSchema as any)
      .properties.refresh);
    const result = await client.callTool({ name: 'campus_research_search',
      arguments: { query: 'academic evidence' } });
    assert.equal(result.isError, undefined);
    assert.ok(result.content.some(part => part.type === 'resource_link'
      && part.uri === 'https://pmc.ncbi.nlm.nih.gov/article.pdf'));
    const invalid = await client.callTool({ name: 'campus_research_verify_evidence',
      arguments: { url: 'https://example.edu/article.pdf', page: 1,
        excerpt: 'A sufficient excerpt.', expectedSha256: 'a'.repeat(64) } });
    assert.equal(JSON.parse((invalid.content.find(part => part.type === 'text') as any).text).evidenceAllowed, false);
    const invalidIdentity = await client.callTool({ name: 'campus_research_verify_document_identity',
      arguments: { url: 'https://example.edu/article.pdf', expectedTitle: 'A real article title' } });
    assert.equal(invalidIdentity.isError, true);
    const quote = await client.callTool({ name: 'campus_research_verify_quote',
      arguments: { doi: '10.1234/abc', expectedTitle: 'Academic Evidence Study',
        url: 'https://pmc.ncbi.nlm.nih.gov/article.pdf', expectedSha256: 'a'.repeat(64),
        page: 1, quote: 'A verified direct quote.' } });
    assert.equal(quote.isError, undefined);
    assert.ok(quote.content.some(part => part.type === 'resource_link'
      && part.uri === 'https://pmc.ncbi.nlm.nih.gov/article.pdf'));
  } finally {
    await client.close();
    await server.close();
  }
});

test('Scopus and Web of Science records complete the MCP DOI-to-PDF-to-quote chain with fixed provider responses', async () => {
  for (const provider of ['scopus', 'web_of_science'] as const) {
    const doi = `10.1234/${provider}`;
    const title = provider === 'scopus' ? 'Scopus Evidence' : 'WOS Evidence';
    const pdfUrl = `https://link.springer.com/${provider}.pdf`;
    const unrelatedPdfUrl = `https://link.springer.com/unrelated-${provider}.pdf`;
    const quote = 'The intervention did not improve scores.';
    const bytes = pdfFixture(`${title} DOI: ${doi} Abstract ${quote}`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const unrelatedBytes = pdfFixture(`Another Article DOI: 10.1234/other Abstract ${quote}`);
    const unrelatedSha256 = createHash('sha256').update(unrelatedBytes).digest('hex');
    const service = new ResearchService(async (url, headers) => {
      const parsed = new URL(url);
      if (parsed.hostname === 'api.elsevier.com') {
        assert.equal(headers?.['X-ELS-APIKey'], 'scopus-test-key');
        return { 'search-results': { 'opensearch:totalResults': '1', entry: [{
          'dc:identifier': 'SCOPUS_ID:123', 'dc:title': title, 'prism:doi': doi,
          link: [{ '@ref': 'scopus', '@href': 'https://www.scopus.com/record/display.uri?eid=123' }],
        }] } };
      }
      if (parsed.hostname === 'api.clarivate.com') {
        assert.equal(headers?.['X-ApiKey'], 'wos-test-key');
        return { metadata: { total: 1 }, hits: [{ uid: 'WOS:123', title,
          identifiers: { doi }, links: { record: 'https://www.webofscience.com/record/123' } }] };
      }
      if (parsed.hostname === 'api.openalex.org') throw new ResearchHttpError(404);
      if (parsed.pathname.startsWith('/works/')) return { message: {
        DOI: doi, title: [title], type: 'journal-article', 'container-title': ['Journal of Evidence'], author: [{ given: 'Ana', family: 'Perez' }],
        issued: { 'date-parts': [[2024]] },
        link: [{ URL: pdfUrl, 'content-type': 'application/pdf' }],
      } };
      if (parsed.pathname === '/works') return collection([]);
      assert.fail(`Unexpected metadata host: ${parsed.hostname}`);
    }, { SCOPUS_API_KEY: 'scopus-test-key', WOS_API_KEY: 'wos-test-key' });
    const readPdf = (async ({ url, startPage, pageCount }: { url: string; startPage: number; pageCount: number }) => {
      assert.ok(url === pdfUrl || url === unrelatedPdfUrl);
      const selectedBytes = url === pdfUrl ? bytes : unrelatedBytes;
      return { requestedUrl: url, resolvedUrl: url, retrievedAt: '2026-09-26T00:00:00.000Z',
        sha256: url === pdfUrl ? sha256 : unrelatedSha256,
        ...await extractPdfBytes(selectedBytes, startPage, pageCount), guidance: [] };
    }) as any;
    const server = new McpServer({ name: 'provider-chain-test', version: '1.0.0' });
    const client = new Client({ name: 'provider-chain-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    registerResearchTools(server, { authorize: () => true, service, readPdf,
      verifyQuote: ((raw: any) => verifyResearchQuote(raw, { service,
        verifyIdentity: ((input: any) => verifyResearchDocumentIdentity(input, { readPdf })) as any,
        verifyEvidence: ((input: any) => verifyResearchEvidence(input, { readPdf })) as any,
      })) as any });
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const call = async (name: string, args: Record<string, unknown>) => {
        const response = await client.callTool({ name, arguments: args });
        assert.equal(response.isError, undefined);
        return { value: JSON.parse((response.content.find(part => part.type === 'text') as any).text),
          links: response.content.filter(part => part.type === 'resource_link').map(part => part.uri) };
      };
      const searched = await call('campus_research_search', { query: 'academic evidence', provider });
      const found = searched.value.results[0];
      assert.equal(found.doi, doi);
      assert.equal(found.indexedIn, provider === 'scopus'
        ? 'scopus' : 'web_of_science_core_collection');
      assert.equal(found.url, provider === 'scopus'
        ? 'https://www.scopus.com/record/display.uri?eid=123'
        : 'https://www.webofscience.com/record/123');
      assert.equal(found.documentUrl, null);
      assert.ok(searched.links.includes(found.url));
      const resolved = await call('campus_research_resolve_document', { doi: found.doi });
      const pdf = resolved.value.results.find((item: any) => item.kind === 'pdf');
      assert.equal(pdf.url, pdfUrl);
      assert.ok(resolved.links.includes(pdfUrl));
      const read = await call('campus_research_read_pdf', { url: pdfUrl, startPage: 1, pageCount: 1 });
      assert.equal(read.value.sha256, sha256);
      assert.match(read.value.pages[0].text, /did not improve scores/);
      assert.ok(read.value.pages[0].text.includes(quote), JSON.stringify(read.value.pages[0].text));
      const verified = await call('campus_research_verify_quote', { doi: found.doi,
        expectedTitle: found.title, url: pdfUrl, expectedSha256: sha256, page: 1, quote });
      assert.equal(verified.value.verbatimCitationAllowed, true,
        JSON.stringify({ status: verified.value.status, stage: verified.value.stage,
          reason: verified.value.reason }));
      assert.ok(verified.links.includes(pdfUrl));
      const altered = await call('campus_research_verify_quote', { doi: found.doi,
        expectedTitle: found.title, url: pdfUrl, expectedSha256: sha256, page: 1,
        quote: 'The intervention improved scores.' });
      assert.equal(altered.value.verbatimCitationAllowed, false);
      const unrelated = await call('campus_research_read_pdf', {
        url: unrelatedPdfUrl, startPage: 1, pageCount: 1,
      });
      assert.match(unrelated.value.pages[0].text, /did not improve scores/);
      const wrongFile = await call('campus_research_verify_quote', { doi: found.doi,
        expectedTitle: found.title, url: unrelatedPdfUrl,
        expectedSha256: unrelated.value.sha256, page: 1, quote });
      assert.equal(wrongFile.value.verbatimCitationAllowed, false);
      assert.equal(wrongFile.value.stage, 'document_identity');
    } finally {
      await client.close();
      await server.close();
    }
  }
});

test('evidence verification accepts only excerpts found at the exact locator and stable document hash', async () => {
  const readPdf = async (input: { startPage: number; pageCount?: number }) => ({ requestedUrl: 'https://repository.example.edu/article.pdf',
    resolvedUrl: 'https://cdn.example.edu/article.pdf', retrievedAt: '2026-09-14T00:00:00.000Z',
    sha256: 'a'.repeat(64), totalPages: 10,
    pages: input.startPage === 1 && input.pageCount === 3
      ? [1, 2, 3].map(page => ({ page, text: `Body page ${page}.`, truncated: false, needsOcr: false }))
      : [{ page: 4, text: 'The intervention improved learning outcomes by 12 percent.', truncated: false, needsOcr: false }],
    nextPage: input.startPage + (input.pageCount ?? 1), guidance: [] });
  const verified = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    format: 'pdf', excerpt: 'The intervention improved learning outcomes\nby 12 percent.',
    claim: 'The intervention improved learning outcomes.', expectedSha256: 'a'.repeat(64) },
  { readPdf: readPdf as any });
  assert.equal(verified.status, 'partial');
  assert.equal(verified.evidenceAllowed, true);
  assert.equal(verified.excerptVerified, true);
  assert.equal(verified.claimVerified, false);
  assert.equal(verified.semanticSupport, 'client_assessment_required');
  assert.equal(verified.citationReady, false);
  assert.match(verified.surroundingText!, /improved learning outcomes by 12 percent/);
  assert.equal(verified.proof.locator, 4);
  assert.match(verified.evidenceId!, /^[a-f0-9]{64}$/);

  const missing = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    excerpt: 'An invented result that does not occur.', claim: 'An invented result occurred.',
    expectedSha256: 'a'.repeat(64) }, { readPdf: readPdf as any });
  assert.equal(missing.status, 'rejected');
  assert.equal(missing.reason, 'excerpt_not_found_at_locator');

  const changed = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 4,
    excerpt: 'The intervention improved learning outcomes.', claim: 'The intervention improved learning outcomes.',
    expectedSha256: 'b'.repeat(64) },
  { readPdf: readPdf as any });
  assert.equal(changed.status, 'rejected');
  assert.equal(changed.reason, 'document_hash_mismatch');

  const wrongPage = await verifyResearchEvidence({ url: 'https://repository.example.edu/article.pdf', page: 3,
    excerpt: 'The intervention improved learning outcomes.', claim: 'The intervention improved learning outcomes.',
    expectedSha256: 'a'.repeat(64) },
  { readPdf: readPdf as any });
  assert.equal(wrongPage.reason, 'locator_mismatch');
});

test('evidence verification rejects ambiguous locators and pages without extractable text', async () => {
  await assert.rejects(verifyResearchEvidence({ url: 'https://example.edu/article.pdf',
    excerpt: 'A sufficiently long excerpt.', claim: 'A sufficiently long claim.',
    expectedSha256: 'c'.repeat(64) } as any), /page|section/);
  const rejected = await verifyResearchEvidence({ url: 'https://example.edu/article.pdf', page: 2,
    excerpt: 'A sufficiently long excerpt.', claim: 'A sufficiently long claim.',
    expectedSha256: 'c'.repeat(64) }, { readPdf: (async () => ({
      requestedUrl: 'https://example.edu/article.pdf', resolvedUrl: 'https://example.edu/article.pdf',
      retrievedAt: '2026-09-14T00:00:00.000Z', sha256: 'c'.repeat(64), totalPages: 2,
      pages: [{ page: 2, text: '', truncated: false, needsOcr: true }], nextPage: null, guidance: [],
    })) as any });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.reason, 'page_requires_ocr');

  const wrongLocator = await verifyResearchEvidence({ url: 'https://example.edu/article', section: 2,
    excerpt: 'A sufficiently long excerpt.', claim: 'A sufficiently long claim.',
    expectedSha256: 'd'.repeat(64) }, { readDocument: (async () => ({
      requestedUrl: 'https://example.edu/article', resolvedUrl: 'https://example.edu/article.pdf',
      retrievedAt: '2026-09-14T00:00:00.000Z', sha256: 'd'.repeat(64), totalPages: 2,
      pages: [{ page: 2, text: 'A sufficiently long excerpt.', truncated: false, needsOcr: false }],
      nextPage: null, guidance: [],
    })) as any });
  assert.equal(wrongLocator.status, 'rejected');
  assert.equal(wrongLocator.reason, 'pdf_requires_page_locator');
});

test('document evidence marks bibliography sections as references', async () => {
  const readDocument = async () => ({ requestedUrl: 'https://example.edu/article.xml',
    resolvedUrl: 'https://cdn.example.edu/article.xml', retrievedAt: '2026-09-14T00:00:00.000Z',
    sha256: 'c'.repeat(64), format: 'xml' as const, totalSections: 1,
    sections: [{ section: 1, heading: 'References',
      text: 'Smith, J. (2024). A quoted title.', truncated: false }],
    nextSection: null, textCoverage: 'complete' as const });
  const result = await verifyResearchEvidence({ url: 'https://example.edu/article.xml', format: 'xml', section: 1,
    excerpt: 'Smith, J. (2024). A quoted title.', claim: 'Smith, J. (2024). A quoted title.',
    expectedSha256: 'c'.repeat(64) }, { readDocument: readDocument as any });
  assert.equal(result.evidenceAllowed, true);
  assert.equal(result.sourceRegion, 'references');

  const manySections = Array.from({ length: 22 }, (_, index) => ({ section: index + 1,
    heading: index === 0 ? 'References' : null,
    text: index === 21 ? 'A sentence that could be mistaken for article content.'
      : index === 0 ? 'References begin before the inspected context window.' : `Section ${index + 1} text.`,
    truncated: false }));
  const distant = await verifyResearchEvidence({ url: 'https://example.edu/long-article.xml',
    format: 'xml', section: 22,
    excerpt: 'A sentence that could be mistaken for article content.',
    claim: 'A sentence that could be mistaken for article content.',
    expectedSha256: 'c'.repeat(64) }, { readDocument: (async (input: any) => ({
    requestedUrl: 'https://example.edu/long-article.xml', resolvedUrl: 'https://example.edu/long-article.xml',
    retrievedAt: '2026-09-14T00:00:00.000Z', sha256: 'c'.repeat(64), format: 'xml',
    totalSections: 22, sections: manySections.slice(input.startSection - 1,
      input.startSection - 1 + input.sectionCount), nextSection: null, textCoverage: 'complete',
  })) as any });
  assert.equal(distant.sourceRegion, 'references_continuation_possible');
  assert.equal(distant.precedingSectionsCoverageStart, 2);

  const punctuationArtifact = await verifyResearchEvidence({
    url: 'https://example.edu/article.pdf', page: 6, format: 'pdf',
    excerpt: 'Virtual Learning Could Mean for the Future of Higher Education. Harvard Business Review.',
    claim: 'Virtual Learning Could Mean for the Future of Higher Education. Harvard Business Review.',
    expectedSha256: 'b'.repeat(64),
  }, { readPdf: (async () => ({ requestedUrl: 'https://example.edu/article.pdf',
    resolvedUrl: 'https://example.edu/article.pdf', retrievedAt: '2026-09-27T00:00:00.000Z',
    sha256: 'b'.repeat(64), totalPages: 6,
    pages: [{ page: 6, text: 'REFERENCES\nGovindarajan, V. (2020). What the Shift to Virtual Learning Could Mean for the Future of Higher Education . Harvard Business Review.', truncated: false, needsOcr: false }],
    nextPage: null, guidance: [] })) as any });
  assert.equal(punctuationArtifact.evidenceAllowed, false);
  assert.equal(punctuationArtifact.reason, 'excerpt_not_found_at_locator');

  const priorReferences = await verifyResearchEvidence({ url: 'https://example.edu/article.pdf',
    page: 14, format: 'pdf', inspectPreviousPage: true,
    excerpt: 'Vaccines against Toxoplasma gondii: challenges and opportunities.',
    claim: 'Vaccines against Toxoplasma gondii: challenges and opportunities.',
    expectedSha256: 'd'.repeat(64),
  }, { readPdf: (async (input: { startPage: number; pageCount?: number }) => ({
    requestedUrl: 'https://example.edu/article.pdf', resolvedUrl: 'https://example.edu/article.pdf',
    retrievedAt: '2026-09-27T00:00:00.000Z', sha256: 'd'.repeat(64), totalPages: 14,
    pages: input.startPage === 14
      ? [{ page: 14, text: 'Vaccines against Toxoplasma gondii: challenges and opportunities.', truncated: false, needsOcr: false }]
      : Array.from({ length: input.pageCount ?? 1 }, (_, index) => ({
        page: input.startPage + index,
        text: input.startPage + index === 12 ? 'References\nEarlier citation.' : `Body page ${input.startPage + index}.`,
        truncated: false, needsOcr: false,
      })),
    nextPage: null, guidance: [],
  })) as any });
  assert.equal(priorReferences.evidenceAllowed, true);
  assert.equal(priorReferences.sourceRegion, 'references_continuation_possible');
  assert.ok(priorReferences.precedingPagesInspected.includes(12));
});

test('document evidence recognizes bibliography headings in common source languages', async () => {
  for (const heading of ['Literaturverzeichnis', 'Références bibliographiques', 'Referências',
    'Список литературы', '参考文献', '참고문헌', 'Kaynakça', 'المراجع']) {
    const readPdf = async () => ({ requestedUrl: 'https://example.edu/article.pdf',
      resolvedUrl: 'https://example.edu/article.pdf', retrievedAt: '2026-09-27T00:00:00.000Z',
      sha256: 'd'.repeat(64), totalPages: 1,
      pages: [{ page: 1, text: `Article body sentence.\n${heading}\nSmith (2024). A cited source title.`,
        truncated: false, needsOcr: false }], nextPage: null, guidance: [] });
    const result = await verifyResearchEvidence({ url: 'https://example.edu/article.pdf', page: 1,
      expectedSha256: 'd'.repeat(64), excerpt: 'Smith (2024). A cited source title.',
      claim: 'Smith (2024). A cited source title.' }, { readPdf: readPdf as any });
    assert.equal(result.sourceRegion, 'references', `heading: ${heading}`);
  }
});

test('document evidence recognizes numbered, paginated, and continued reference headings', async () => {
  const referenceLine = 'Smith (2024). A cited source title.';
  const variants = ['7. References', 'References 34', 'References (continued)', '2.3 Bibliografía 12'];
  for (const heading of variants) {
    const readPdf = async () => ({ requestedUrl: 'https://example.edu/article.pdf',
      resolvedUrl: 'https://example.edu/article.pdf', retrievedAt: '2026-09-27T00:00:00.000Z',
      sha256: 'e'.repeat(64), totalPages: 1,
      pages: [{ page: 1, text: `Article body sentence.\n${heading}\n${referenceLine}`,
        truncated: false, needsOcr: false }], nextPage: null, guidance: [] });
    const result = await verifyResearchEvidence({ url: 'https://example.edu/article.pdf', page: 1,
      expectedSha256: 'e'.repeat(64), excerpt: referenceLine, claim: referenceLine },
    { readPdf: readPdf as any });
    assert.equal(result.sourceRegion, 'references', `PDF heading: ${heading}`);

    const readDocument = async () => ({ requestedUrl: 'https://example.edu/article.xml',
      resolvedUrl: 'https://example.edu/article.xml', retrievedAt: '2026-09-27T00:00:00.000Z',
      sha256: 'f'.repeat(64), format: 'xml' as const, totalSections: 1,
      sections: [{ section: 1, heading, text: referenceLine, truncated: false }],
      nextSection: null, textCoverage: 'complete' as const });
    const structured = await verifyResearchEvidence({ url: 'https://example.edu/article.xml', format: 'xml', section: 1,
      expectedSha256: 'f'.repeat(64), excerpt: referenceLine, claim: referenceLine },
    { readDocument: readDocument as any });
    assert.equal(structured.sourceRegion, 'references', `document heading: ${heading}`);
  }

  const inlineReference = `Article body sentence.\nReferences 34 ${referenceLine}`;
  const inline = await verifyResearchEvidence({ url: 'https://example.edu/article.pdf', page: 1,
    expectedSha256: 'e'.repeat(64), excerpt: referenceLine, claim: referenceLine },
  { readPdf: (async () => ({ requestedUrl: 'https://example.edu/article.pdf',
    resolvedUrl: 'https://example.edu/article.pdf', retrievedAt: '2026-09-27T00:00:00.000Z',
    sha256: 'e'.repeat(64), totalPages: 1,
    pages: [{ page: 1, text: inlineReference, truncated: false, needsOcr: false }],
    nextPage: null, guidance: [] })) as any });
  assert.equal(inline.sourceRegion, 'references', 'heading, page number, and first entry on one PDF line');

  const prose = 'References to prior studies remain useful. References 34 studies support this point.';
  const ordinaryProse = await verifyResearchEvidence({ url: 'https://example.edu/article.pdf', page: 1,
    expectedSha256: 'e'.repeat(64), excerpt: 'References to prior studies remain useful.',
    claim: 'References to prior studies remain useful.' },
  { readPdf: (async () => ({ requestedUrl: 'https://example.edu/article.pdf',
    resolvedUrl: 'https://example.edu/article.pdf', retrievedAt: '2026-09-27T00:00:00.000Z',
    sha256: 'e'.repeat(64), totalPages: 1,
    pages: [{ page: 1, text: prose, truncated: false, needsOcr: false }],
    nextPage: null, guidance: [] })) as any });
  assert.equal(ordinaryProse.sourceRegion, 'body_or_unknown', 'prose mentioning references stays in the body');
});

test('document evidence detects an unheaded numbered bibliography and leaves ordinary lists alone', async () => {
  const text = `Online content\nAny methods, additional references, Nature Research reporting summaries, source data, extended data, supplementary information, acknowledgements, peer review information; details of author contributions and competing interests; and statements of data and code availability are available at https://doi.org/10.1038/s41586-021-03828-1.\n1. SWISS-MODEL. Homo sapiens (human). https://swissmodel.expasy.org/repository/species/9606 (2021).\n2. Jumper, J. et al. Highly accurate protein structure prediction with AlphaFold. Nature https://doi.org/10.1038/s41586-021-03819-2 (2021).\n3. International Human Genome Sequencing Consortium. Initial sequencing and analysis of the human genome. Nature 409, 860–921 (2001).\n4. Another Author. Another cited paper. Science 300, 100–105 (2003).`;
  const readPdf = async () => ({ requestedUrl: 'https://www.nature.com/articles/s41586-021-03828-1.pdf',
    resolvedUrl: 'https://www.nature.com/articles/s41586-021-03828-1.pdf', retrievedAt: '2026-09-28T00:00:00.000Z',
    sha256: '1'.repeat(64), totalPages: 21,
    pages: [{ page: 7, text, truncated: false, needsOcr: false }], nextPage: null, guidance: [] });
  const reference = await verifyResearchEvidence({ url: 'https://www.nature.com/articles/s41586-021-03828-1.pdf',
    format: 'pdf', page: 7, expectedSha256: '1'.repeat(64),
    excerpt: 'Highly accurate protein structure prediction with AlphaFold.',
    claim: 'Highly accurate protein structure prediction with AlphaFold.' }, { readPdf: readPdf as any });
  assert.equal(reference.sourceRegion, 'references');

  const ordinary = await verifyResearchEvidence({ url: 'https://example.edu/article.pdf', format: 'pdf', page: 1,
    expectedSha256: '1'.repeat(64), excerpt: 'Participants completed the three listed steps.',
    claim: 'Participants completed the three listed steps.' }, { readPdf: (async () => ({ ...await readPdf(),
      requestedUrl: 'https://example.edu/article.pdf', resolvedUrl: 'https://example.edu/article.pdf',
      pages: [{ page: 1, text: 'Participants completed the three listed steps.\n1. Wash the sample.\n2. Measure its mass.\n3. Record the result.', truncated: false, needsOcr: false }] })) as any });
  assert.equal(ordinary.sourceRegion, 'body_or_unknown');
});

test('document identity binds a catalog title and DOI to the processed file', async () => {
  const readPdf = async () => ({ requestedUrl: 'https://repository.example.edu/article.pdf',
    resolvedUrl: 'https://cdn.example.edu/article.pdf', retrievedAt: '2026-09-26T00:00:00.000Z',
    sha256: 'a'.repeat(64), totalPages: 6,
    pages: [{ page: 1, text: 'A Reliable Study of Learning\nDOI: 10.1234/LEARN.2024\nMethods and results.',
      truncated: false, needsOcr: false }], nextPage: 2, guidance: [] });
  const base = { url: 'https://repository.example.edu/article.pdf', format: 'pdf' as const,
    expectedSha256: 'a'.repeat(64), expectedTitle: 'A reliable study of learning',
    expectedDoi: '10.1234/learn.2024' };
  const verified = await verifyResearchDocumentIdentity(base, { readPdf: readPdf as any });
  assert.equal(verified.status, 'verified');
  assert.equal(verified.identityAllowed, true);
  assert.equal(verified.identityBasis, 'title_doi_and_hash');
  assert.deepEqual(verified.proof.inspected.locators, [1]);
  const markupTitle = await verifyResearchDocumentIdentity({ ...base,
    expectedTitle: 'A <i>Reliable</i> Study of Learning' }, { readPdf: readPdf as any });
  assert.equal(markupTitle.identityAllowed, true);
  const unrelatedMarkupTitle = await verifyResearchDocumentIdentity({ ...base,
    expectedTitle: 'A <i>Different</i> Scientific Study' }, { readPdf: readPdf as any });
  assert.equal(unrelatedMarkupTitle.identityAllowed, false);
  assert.equal(unrelatedMarkupTitle.reason, 'title_not_found_in_document');

  const wrongFile = await verifyResearchDocumentIdentity({ ...base, expectedSha256: 'b'.repeat(64) },
    { readPdf: readPdf as any });
  assert.equal(wrongFile.reason, 'document_hash_mismatch');
  const wrongTitle = await verifyResearchDocumentIdentity({ ...base, expectedTitle: 'An unrelated scientific study' },
    { readPdf: readPdf as any });
  assert.equal(wrongTitle.reason, 'title_not_found_in_document');
  const wrongDoi = await verifyResearchDocumentIdentity({ ...base, expectedDoi: '10.1234/other.2024' },
    { readPdf: readPdf as any });
  assert.equal(wrongDoi.status, 'partial');
  assert.equal(wrongDoi.identityAllowed, false);
  const doiPrefixOnly = await verifyResearchDocumentIdentity(base, { readPdf: (async () => ({
    ...await readPdf(), pages: [{ page: 1,
      text: 'A Reliable Study of Learning\nDOI: 10.1234/LEARN.2024-REV\nMethods and results.',
      truncated: false, needsOcr: false }],
  })) as any });
  assert.equal(doiPrefixOnly.identityAllowed, false);
  assert.equal(doiPrefixOnly.reason, 'doi_not_found_in_document');
  const wrappedDoi = await verifyResearchDocumentIdentity(base, { readPdf: (async () => ({
    ...await readPdf(), pages: [{ page: 1,
      text: 'A Reliable Study of Learning\nDOI: 10.1234/\nLEARN.2024.\nMethods and results.',
      truncated: false, needsOcr: false }],
  })) as any });
  assert.equal(wrappedDoi.identityAllowed, true);
  const separated = await verifyResearchDocumentIdentity(base, { readPdf: (async () => ({
    ...await readPdf(), pages: [
      { page: 1, text: 'A Reliable Study of Learning', truncated: false, needsOcr: false },
      { page: 2, text: 'DOI: 10.1234/LEARN.2024', truncated: false, needsOcr: false },
    ],
  })) as any });
  assert.equal(separated.status, 'partial');
  assert.deepEqual(separated.titleLocators, [1]);
  const citedInReferences = await verifyResearchDocumentIdentity(base, { readPdf: (async () => ({
    ...await readPdf(), pages: [
      { page: 1, text: 'An unrelated study about another subject.', truncated: false, needsOcr: false },
      { page: 2, text: 'References: A Reliable Study of Learning. DOI: 10.1234/LEARN.2024',
        truncated: false, needsOcr: false },
    ],
  })) as any });
  assert.equal(citedInReferences.status, 'partial');
  assert.equal(citedInReferences.reason, 'title_only_after_first_pdf_page');
  assert.equal(citedInReferences.identityAllowed, false);
  const citedOnFirstPage = await verifyResearchDocumentIdentity(base, { readPdf: (async () => ({
    ...await readPdf(), pages: [
      { page: 1, text: 'An unrelated study about cognition.\nMethods and results.\nReferences\nA Reliable Study of Learning. DOI: 10.1234/LEARN.2024',
        truncated: false, needsOcr: false },
    ],
  })) as any });
  assert.equal(citedOnFirstPage.status, 'partial');
  assert.equal(citedOnFirstPage.identityAllowed, false);
  assert.equal(citedOnFirstPage.reason, 'title_only_in_pdf_references');
  const citedInFirstPageBody = await verifyResearchDocumentIdentity(base, { readPdf: (async () => ({
    ...await readPdf(), pages: [
      { page: 1, text: 'An unrelated study about cognition\nOther Authors\nAbstract\nThis article discusses A Reliable Study of Learning (DOI: 10.1234/LEARN.2024) as prior work.',
        truncated: false, needsOcr: false },
    ],
  })) as any });
  assert.equal(citedInFirstPageBody.status, 'partial');
  assert.equal(citedInFirstPageBody.identityAllowed, false);
  assert.equal(citedInFirstPageBody.reason, 'title_only_in_pdf_body');
  const citedInFrontMatterBox = await verifyResearchDocumentIdentity(base, { readPdf: (async () => ({
    ...await readPdf(), pages: [
      { page: 1, text: 'An unrelated study about cognition\nOther Authors\nRecommended citation:\nA Reliable Study of Learning. DOI: 10.1234/LEARN.2024\nAbstract\nThis article concerns another topic.',
        truncated: false, needsOcr: false },
    ],
  })) as any });
  assert.equal(citedInFrontMatterBox.status, 'partial');
  assert.equal(citedInFrontMatterBox.identityAllowed, false);
  assert.equal(citedInFrontMatterBox.reason, 'title_only_in_pdf_citation_box');
  const doiInFrontMatterBox = await verifyResearchDocumentIdentity(base, { readPdf: (async () => ({
    ...await readPdf(), pages: [
      { page: 1, text: 'A Reliable Study of Learning\nOther Authors\nCitation:\nA Reliable Study of Learning. DOI: 10.1234/LEARN.2024\nAbstract\nThe work concerns another topic.',
        truncated: false, needsOcr: false },
    ],
  })) as any });
  assert.equal(doiInFrontMatterBox.status, 'partial');
  assert.equal(doiInFrontMatterBox.identityAllowed, false);
  assert.equal(doiInFrontMatterBox.reason, 'doi_only_in_pdf_citation_box');
  const doiInFirstPageReferences = await verifyResearchDocumentIdentity(base, { readPdf: (async () => ({
    ...await readPdf(), pages: [
      { page: 1, text: 'A Reliable Study of Learning\nMethods and results.\nReferences\nAnother study. DOI: 10.1234/LEARN.2024',
        truncated: false, needsOcr: false },
    ],
  })) as any });
  assert.equal(doiInFirstPageReferences.status, 'partial');
  assert.equal(doiInFirstPageReferences.identityAllowed, false);
  assert.equal(doiInFirstPageReferences.reason, 'doi_not_found_in_document');
  const doiOnlyInReference = await verifyResearchDocumentIdentity(base, { readPdf: (async () => ({
    ...await readPdf(), pages: [
      { page: 1, text: 'A Reliable Study of Learning', truncated: false, needsOcr: false },
      { page: 2, text: 'References: A Reliable Study of Learning. DOI: 10.1234/LEARN.2024',
        truncated: false, needsOcr: false },
    ],
  })) as any });
  assert.equal(doiOnlyInReference.status, 'partial');
  assert.equal(doiOnlyInReference.reason, 'doi_not_found_in_document');
  assert.equal(doiOnlyInReference.identityAllowed, false);
});

test('DataCite arXiv DOI matches the arXiv identifier printed on a versioned PDF', async () => {
  const url = 'https://arxiv.org/pdf/1706.03762';
  const readPdf = async () => ({ requestedUrl: url, resolvedUrl: url,
    retrievedAt: '2026-09-28T00:00:00.000Z', sha256: 'c'.repeat(64), totalPages: 15,
    pages: [{ page: 1, text: 'Attention Is All You Need\nAshish Vaswani\nAbstract\nTransformer architecture.\narXiv:1706.03762v7 [cs.CL] 2 Aug 2023',
      truncated: false, needsOcr: false }], nextPage: 2, guidance: [] });
  const base = { url, format: 'pdf' as const, expectedSha256: 'c'.repeat(64),
    expectedTitle: 'Attention Is All You Need', expectedDoi: '10.48550/arXiv.1706.03762' };
  const verified = await verifyResearchDocumentIdentity(base, { readPdf: readPdf as any });
  assert.equal(verified.identityAllowed, true);
  assert.equal(verified.identityBasis, 'title_doi_and_hash');
  const wrongArxivId = await verifyResearchDocumentIdentity({ ...base,
    expectedDoi: '10.48550/arXiv.2102.05095' }, { readPdf: readPdf as any });
  assert.equal(wrongArxivId.identityAllowed, false);
  assert.equal(wrongArxivId.reason, 'doi_not_found_in_document');
});

test('post-abstract self-citation can identify its own PDF only with title, authors and year', async () => {
  const base = { url: 'https://journal.example.edu/article.pdf', format: 'pdf' as const,
    expectedSha256: 'a'.repeat(64), expectedTitle: 'A Reliable Study of Learning',
    expectedDoi: '10.1234/learn.2024', expectedAuthors: ['Ana Perez', 'Ben Ortiz'], expectedYear: 2024 };
  const page = 'A Reliable Study of Learning\nAna Perez and Ben Ortiz\nAbstract\nThe study concerns learning.\nKeywords: learning\nPerez, A., & Ortiz, B. (2024). A Reliable Study of Learning. Journal, 1. https://doi.org/10.1234/learn.2024';
  const readPdf = (async () => ({ requestedUrl: base.url, resolvedUrl: base.url,
    retrievedAt: '2026-09-26T00:00:00.000Z', sha256: 'a'.repeat(64), totalPages: 1,
    pages: [{ page: 1, text: page, truncated: false, needsOcr: false }], nextPage: null, guidance: [] })) as any;
  const verified = await verifyResearchDocumentIdentity(base, { readPdf });
  assert.equal(verified.identityAllowed, true);
  assert.equal(verified.identityBasis, 'title_authors_year_self_citation_doi_and_hash');
  const missingAuthors = await verifyResearchDocumentIdentity({ ...base, expectedAuthors: undefined }, { readPdf });
  assert.equal(missingAuthors.identityAllowed, false);
  assert.equal(missingAuthors.reason, 'doi_not_found_in_document');
  const wrongAuthors = await verifyResearchDocumentIdentity({ ...base, expectedAuthors: ['Ana Perez', 'Ben Smith'] }, { readPdf });
  assert.equal(wrongAuthors.identityAllowed, false);
  const wrongYear = await verifyResearchDocumentIdentity({ ...base, expectedYear: 2023 }, { readPdf });
  assert.equal(wrongYear.identityAllowed, false);
  const citedOtherWork = await verifyResearchDocumentIdentity(base, { readPdf: (async () => ({
    ...await readPdf(), pages: [{ page: 1,
      text: 'A Reliable Study of Learning\nAna Perez and Ben Ortiz\nAbstract\nThe study concerns learning.\nKeywords: learning\nPerez, A., & Ortiz, B. (2024). An Unrelated Study. Journal, 1. https://doi.org/10.1234/learn.2024',
      truncated: false, needsOcr: false }],
  })) as any });
  assert.equal(citedOtherWork.identityAllowed, false);
  const citedInReferences = await verifyResearchDocumentIdentity(base, { readPdf: (async () => ({
    ...await readPdf(), pages: [{ page: 1, text: page.replace('Keywords: learning', 'Keywords: learning\nReferences'),
      truncated: false, needsOcr: false }],
  })) as any });
  assert.equal(citedInReferences.identityAllowed, false);
});

test('document identity handles HTML without DOI and fails closed on an unrelated page', async () => {
  const readDocument = async () => ({ requestedUrl: 'https://journal.example.edu/article',
    resolvedUrl: 'https://journal.example.edu/article', retrievedAt: '2026-09-26T00:00:00.000Z',
    sha256: 'f'.repeat(64), format: 'html', totalSections: 2,
    sections: [{ section: 1, heading: 'A Study of Learning Outcomes',
      text: 'The study enrolled 20 students.', truncated: false }], nextSection: 2, guidance: [] });
  const base = { url: 'https://journal.example.edu/article', expectedSha256: 'f'.repeat(64),
    expectedTitle: 'A Study of Learning Outcomes' };
  const verified = await verifyResearchDocumentIdentity(base, { readDocument: readDocument as any });
  assert.equal(verified.identityAllowed, true);
  assert.equal(verified.identityBasis, 'title_and_hash');
  const unrelated = await verifyResearchDocumentIdentity({ ...base, expectedTitle: 'A Different Article' },
    { readDocument: readDocument as any });
  assert.equal(unrelated.identityAllowed, false);
  assert.equal(unrelated.reason, 'title_not_found_in_document');
  const doiMissing = await verifyResearchDocumentIdentity({ ...base, expectedDoi: '10.1234/study' },
    { readDocument: readDocument as any });
  assert.equal(doiMissing.status, 'partial');
  assert.equal(doiMissing.identityAllowed, false);
  const withDoi = { ...base, expectedDoi: '10.1234/study' };
  const nearbyMetadata = await verifyResearchDocumentIdentity(withDoi, { readDocument: (async () => ({
    ...await readDocument(), sections: [
      { section: 1, heading: null, text: 'DOI: 10.1234/study', truncated: false },
      { section: 2, heading: 'A Study of Learning Outcomes', text: 'By the authors', truncated: false },
    ],
  })) as any });
  assert.equal(nearbyMetadata.identityAllowed, true);
  const distantDoi = await verifyResearchDocumentIdentity(withDoi, { readDocument: (async () => ({
    ...await readDocument(), sections: [
      { section: 1, heading: 'A Study of Learning Outcomes', text: 'By the authors', truncated: false },
      ...[2, 3, 4, 5].map(section => ({ section, heading: null, text: 'Other metadata', truncated: false })),
      { section: 6, heading: null, text: 'DOI: 10.1234/study', truncated: false },
    ],
  })) as any });
  assert.equal(distantDoi.identityAllowed, false);
  assert.equal(distantDoi.reason, 'doi_not_found_in_document');
  const splitPublisherFrontMatter = await verifyResearchDocumentIdentity({ ...withDoi,
    expectedAuthors: ['Ana Perez', 'Ben Smith'], expectedYear: 2024 }, { readDocument: (async () => ({
    ...await readDocument(), sections: [
      { section: 1, heading: null, text: 'A Study of Learning Outcomes', truncated: false },
      { section: 2, heading: null, text: 'Ana Perez', truncated: false },
      { section: 3, heading: null, text: 'Ben Smith', truncated: false },
      { section: 4, heading: null, text: 'Published: 2024', truncated: false },
      { section: 5, heading: null, text: 'Affiliations', truncated: false },
      { section: 6, heading: null, text: 'License: CC-BY', truncated: false },
      { section: 7, heading: null, text: 'DOI: 10.1234/study', truncated: false },
      { section: 8, heading: null, text: 'Abstract\nStudy details.', truncated: false },
    ],
  })) as any });
  assert.equal(splitPublisherFrontMatter.identityAllowed, true);
  assert.equal(splitPublisherFrontMatter.identityBasis, 'title_doi_and_hash');
  const titleOnlyInReferences = await verifyResearchDocumentIdentity(withDoi, { readDocument: (async () => ({
    ...await readDocument(), sections: [
      { section: 1, heading: null, text: 'An unrelated article', truncated: false },
      { section: 2, heading: 'References', text: '', truncated: false },
      { section: 3, heading: null, text: 'A Study of Learning Outcomes. DOI: 10.1234/study', truncated: false },
    ],
  })) as any });
  assert.equal(titleOnlyInReferences.identityAllowed, false);
  assert.equal(titleOnlyInReferences.reason, 'title_only_in_document_body');
});

test('a verified excerpt does not automatically prove a contradictory claim', async () => {
  const readPdf = async () => ({ requestedUrl: 'https://example.edu/study.pdf',
    resolvedUrl: 'https://example.edu/study.pdf', retrievedAt: '2026-09-26T00:00:00.000Z',
    sha256: 'e'.repeat(64), totalPages: 1,
    pages: [{ page: 1, text: 'The intervention did not improve scores.', truncated: false, needsOcr: false }],
    nextPage: null, guidance: [] });
  const result = await verifyResearchEvidence({ url: 'https://example.edu/study.pdf', page: 1,
    expectedSha256: 'e'.repeat(64), excerpt: 'The intervention did not improve scores.',
    claim: 'The intervention improved scores.' },
  { readPdf: readPdf as any });
  assert.equal(result.evidenceAllowed, true);
  assert.equal(result.status, 'partial');
  assert.equal(result.claimVerified, false);
  assert.equal(result.semanticSupport, 'client_assessment_required');
  assert.equal(result.citationReady, false);
  assert.equal(result.claim, 'The intervention improved scores.');
  assert.match(result.surroundingText!, /did not improve/);
  const accurateQuote = await verifyResearchEvidence({ url: 'https://example.edu/study.pdf', page: 1,
    expectedSha256: 'e'.repeat(64), excerpt: 'The intervention did not improve scores.',
    claim: 'The intervention did not improve scores.' }, { readPdf: readPdf as any });
  assert.equal(accurateQuote.semanticSupport, 'exact_text_only');
  assert.equal(accurateQuote.status, 'verified');
  assert.equal(accurateQuote.claimVerified, false);
  assert.notEqual(result.evidenceId, accurateQuote.evidenceId);
});

test('direct quote receipt requires bibliography, PDF identity, hash and page text together', async () => {
  const fullTitle = 'Academic Evidence Study';
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, title: [fullTitle] } } : collection([]));
  const readPdf = (async ({ startPage }: { startPage: number }) => ({
    requestedUrl: 'https://example.edu/study.pdf', resolvedUrl: 'https://example.edu/study.pdf',
    retrievedAt: '2026-09-26T00:00:00.000Z', sha256: 'a'.repeat(64), totalPages: 2,
    pages: startPage === 1
      ? [{ page: 1, text: `${fullTitle}\nDOI: 10.1234/ABC`, truncated: false, needsOcr: false }]
      : [{ page: 2, text: 'Earlier findings were mixed. The intervention did not improve scores.', truncated: false, needsOcr: false }],
    nextPage: null, guidance: [],
  })) as any;
  const dependencies = { service,
    verifyIdentity: ((raw: any) => verifyResearchDocumentIdentity(raw, { readPdf })) as any,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf })) as any };
  const base = { doi: work.DOI, expectedTitle: fullTitle, url: 'https://example.edu/study.pdf',
    expectedSha256: 'a'.repeat(64), page: 2, quote: 'The intervention did not improve scores.' };
  const verified = await verifyResearchQuote(base, dependencies);
  assert.equal(verified.status, 'verified');
  assert.equal(verified.verbatimCitationAllowed, true);
  assert.equal(verified.scope, 'complete_sentence_direct_quotation_text_only');
  assert.equal(verified.evidence?.proof.locator, 2);
  assert.equal(verified.documentSha256, 'a'.repeat(64));

  const wrongTitle = await verifyResearchQuote({ ...base, expectedTitle: 'An unrelated study' }, dependencies);
  assert.equal(wrongTitle.stage, 'bibliography');
  assert.equal(wrongTitle.verbatimCitationAllowed, false);
  const changedFile = await verifyResearchQuote({ ...base, expectedSha256: 'b'.repeat(64) }, dependencies);
  assert.equal(changedFile.stage, 'document_identity');
  const inventedQuote = await verifyResearchQuote({ ...base, quote: 'The intervention strongly improved scores.' }, dependencies);
  assert.equal(inventedQuote.stage, 'quote');
  const readPdfWithReferences = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text = 'References\nSmith (2020). The intervention did not improve scores.';
    return result;
  }) as any;
  const quotedFromReferences = await verifyResearchQuote(base, {
    ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfWithReferences })) as any,
  });
  assert.equal(quotedFromReferences.status, 'partial');
  assert.equal(quotedFromReferences.verbatimCitationAllowed, false);
  assert.equal(quotedFromReferences.reason, 'quote_in_references');
  const captionSentence = 'M denotes DNA marker and lane 1 indicates amplified PCR product.';
  const readPdfWithReferencesThenFigure = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text =
      'References\nSmith (2016). Prior research.\n\nFig 1. Construction of pFastBac vectors. '
      + '(A) Toxoplasma gondii IMC gene was PCR-amplified from cDNA synthesized using total RNA extracted from T. gondii RH. '
      + captionSentence;
    return result;
  }) as any;
  const quoteFromFigureAfterReferences = await verifyResearchQuote({ ...base,
    quote: captionSentence }, {
    ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw,
      { readPdf: readPdfWithReferencesThenFigure })) as any,
  });
  assert.equal(quoteFromFigureAfterReferences.status, 'verified');
  assert.equal(quoteFromFigureAfterReferences.verbatimCitationAllowed, true);
  assert.equal(quoteFromFigureAfterReferences.evidence?.sourceRegion, 'caption_after_references');
  for (const heading of ['7. References', 'References 34', 'References (continued)', '2.3 Bibliografía 12']) {
    const readPdfWithVariantHeading = (async (input: { startPage: number }) => {
      const result = await readPdf(input);
      if (input.startPage === 2) result.pages[0].text = `${heading}\nSmith (2020). The intervention did not improve scores.`;
      return result;
    }) as any;
    const variantQuote = await verifyResearchQuote(base, {
      ...dependencies,
      verifyEvidence: ((raw: any) => verifyResearchEvidence(raw,
        { readPdf: readPdfWithVariantHeading })) as any,
    });
    assert.equal(variantQuote.verbatimCitationAllowed, false, `heading: ${heading}`);
    assert.equal(variantQuote.reason, 'quote_in_references', `heading: ${heading}`);
  }
  const readPdfWithInlineReference = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text =
      'References 34 Smith (2020). The intervention did not improve scores.';
    return result;
  }) as any;
  const inlineReferenceQuote = await verifyResearchQuote(base, {
    ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw,
      { readPdf: readPdfWithInlineReference })) as any,
  });
  assert.equal(inlineReferenceQuote.verbatimCitationAllowed, false);
  assert.equal(inlineReferenceQuote.reason, 'quote_in_references');
  const readPdfBeforeReferences = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text = 'Earlier findings were mixed. The intervention did not improve scores.\nReferences\nSmith (2020).';
    return result;
  }) as any;
  const quotedBeforeReferences = await verifyResearchQuote(base, {
    ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfBeforeReferences })) as any,
  });
  assert.equal(quotedBeforeReferences.status, 'verified');
  assert.equal(quotedBeforeReferences.evidence?.sourceRegion, 'body_or_unknown');
  const readPdfWithPriorReferences = (async (input: { startPage: number; pageCount?: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text = 'Discussion ended.\nReferences\nSmith (2020). Prior research.';
    if (input.startPage === 1 && input.pageCount === 2) result.pages.push({
      page: 2, text: 'Discussion ended.\nReferences\nSmith (2020). Prior research.',
      truncated: false, needsOcr: false });
    if (input.startPage === 3) {
      result.pages[0].page = 3;
      result.pages[0].text = 'Earlier findings were mixed. The intervention did not improve scores.';
    }
    return result;
  }) as any;
  const quotedAfterPriorReferences = await verifyResearchQuote({ ...base, page: 3 }, {
    ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfWithPriorReferences })) as any,
  });
  assert.equal(quotedAfterPriorReferences.status, 'partial');
  assert.equal(quotedAfterPriorReferences.verbatimCitationAllowed, false);
  assert.equal(quotedAfterPriorReferences.reason, 'quote_may_continue_references');
  assert.equal(quotedAfterPriorReferences.evidence?.previousPageInspected, 2);
  const readPdfWithClippedContext = (async (input: { startPage: number; pageCount?: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text = `${'Context without sentence boundary '.repeat(20)} Earlier findings were mixed. The intervention did not improve scores.`;
    return result;
  }) as any;
  const clippedContext = await verifyResearchQuote(base, {
    ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfWithClippedContext })) as any,
  });
  assert.equal(clippedContext.status, 'verified');
  assert.equal(clippedContext.verbatimCitationAllowed, true);
  assert.equal(clippedContext.evidence?.surroundingTextTruncatedBefore, true);
  const readPdfWithDistantReferences = (async (input: { startPage: number; pageCount?: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 1) result.pages[0].text = 'Academic Evidence Study\nDOI: 10.1234/ABC\nReferences\nSmith (2020).';
    if (input.startPage === 1 && input.pageCount === 2) result.pages.push({
      page: 2, text: 'Smith (2020). Prior research.', truncated: false, needsOcr: false });
    if (input.startPage === 2) result.pages[0].text = 'Smith (2020). Prior research.';
    if (input.startPage === 3) {
      result.pages[0].page = 3;
      result.pages[0].text = 'Earlier findings were mixed. The intervention did not improve scores.';
    }
    return result;
  }) as any;
  const quotedAfterDistantReferences = await verifyResearchQuote({ ...base, page: 3 }, {
    ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfWithDistantReferences })) as any,
  });
  assert.equal(quotedAfterDistantReferences.status, 'partial');
  assert.equal(quotedAfterDistantReferences.reason, 'quote_may_continue_references');
  assert.deepEqual(quotedAfterDistantReferences.evidence?.precedingPagesInspected, [1]);
  assert.equal(quotedAfterDistantReferences.evidence?.previousPageInspected, null);
  const readPdfBeyondPrecedingLimit = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 22) {
      result.pages[0].page = 22;
      result.pages[0].text = 'Earlier findings were mixed. The intervention did not improve scores.';
    }
    return result;
  }) as any;
  const quotedBeyondPrecedingLimit = await verifyResearchQuote({ ...base, page: 22 }, {
    ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfBeyondPrecedingLimit })) as any,
  });
  assert.equal(quotedBeyondPrecedingLimit.status, 'rejected');
  assert.equal(quotedBeyondPrecedingLimit.stage, 'quote');
  assert.equal(quotedBeyondPrecedingLimit.reason, 'preceding_pages_not_fully_checked');
  const omittedNegation = await verifyResearchQuote({ ...base, quote: 'improve scores.' }, dependencies);
  assert.equal(omittedNegation.stage, 'quote');
  assert.equal(omittedNegation.reason, 'excerpt_not_found_at_locator');
  assert.equal(omittedNegation.verbatimCitationAllowed, false);

  const readPdfWithOmittedNever = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text =
      'Earlier findings were mixed. Traditional faculty never used technology tools in this study.';
    return result;
  }) as any;
  const neverDependencies = {
    ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfWithOmittedNever })) as any,
  };
  const fullNeverSentence = await verifyResearchQuote({ ...base,
    quote: 'Traditional faculty never used technology tools in this study.' }, neverDependencies);
  assert.equal(fullNeverSentence.status, 'verified');
  const excerptAfterNever = await verifyResearchQuote({ ...base,
    quote: 'used technology tools in this study.' }, neverDependencies);
  assert.equal(excerptAfterNever.status, 'partial');
  assert.equal(excerptAfterNever.reason, 'quote_not_full_sentence');
  assert.equal(excerptAfterNever.verbatimCitationAllowed, false);

  const readPdfWithContinuation = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text = 'Earlier findings were mixed. The intervention did not improve scores... and further analysis followed.';
    return result;
  }) as any;
  const prefixOfEllipsis = await verifyResearchQuote(base, {
    ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfWithContinuation })) as any,
  });
  assert.equal(prefixOfEllipsis.stage, 'context');
  assert.equal(prefixOfEllipsis.verbatimCitationAllowed, false);

  const readPdfWithAbbreviation = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text = 'Earlier findings were mixed. He consulted Dr. Smith before the study ended.';
    return result;
  }) as any;
  const abbreviationDependencies = {
    ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfWithAbbreviation })) as any,
  };
  const abbreviationPrefix = await verifyResearchQuote({ ...base, quote: 'He consulted Dr.' }, abbreviationDependencies);
  assert.equal(abbreviationPrefix.status, 'partial');
  assert.equal(abbreviationPrefix.verbatimCitationAllowed, false);
  const completeAfterAbbreviation = await verifyResearchQuote({ ...base,
    quote: 'He consulted Dr. Smith before the study ended.' }, abbreviationDependencies);
  assert.equal(completeAfterAbbreviation.status, 'verified');
  assert.equal(completeAfterAbbreviation.verbatimCitationAllowed, true);
  const afterAbbreviation = await verifyResearchQuote({ ...base,
    quote: 'Smith before the study ended.' }, abbreviationDependencies);
  assert.equal(afterAbbreviation.status, 'partial');
  assert.equal(afterAbbreviation.verbatimCitationAllowed, false);

  const readPdfWithInitialism = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text = 'Earlier work was reviewed. The U.K. Smith continued the study.';
    return result;
  }) as any;
  const initialismDependencies = { ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfWithInitialism })) as any };
  const quoteAfterInitialism = await verifyResearchQuote({ ...base,
    quote: 'Smith continued the study.' }, initialismDependencies);
  assert.equal(quoteAfterInitialism.status, 'partial');
  assert.equal(quoteAfterInitialism.reason, 'quote_not_full_sentence');
  assert.equal(quoteAfterInitialism.verbatimCitationAllowed, false);
  const wholeInitialismSentence = await verifyResearchQuote({ ...base,
    quote: 'The U.K. Smith continued the study.' }, initialismDependencies);
  assert.equal(wholeInitialismSentence.status, 'verified');
  assert.equal(wholeInitialismSentence.verbatimCitationAllowed, true);
  const readPdfWithFrenchTitle = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text = 'The letter was addressed to Mme. Martin at the event.';
    return result;
  }) as any;
  const frenchTitleDependencies = { ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfWithFrenchTitle })) as any };
  const quoteAfterFrenchTitle = await verifyResearchQuote({ ...base, quote: 'Martin at the event.' }, frenchTitleDependencies);
  assert.equal(quoteAfterFrenchTitle.status, 'partial');
  assert.equal(quoteAfterFrenchTitle.reason, 'quote_not_full_sentence');
  assert.equal(quoteAfterFrenchTitle.verbatimCitationAllowed, false);
  const readPdfWithEquationAbbreviation = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text = 'The authors refer to Eq. 3 for the final derivation.';
    return result;
  }) as any;
  const equationDependencies = { ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfWithEquationAbbreviation })) as any };
  const quoteAfterEquation = await verifyResearchQuote({ ...base, quote: '3 for the final derivation.' }, equationDependencies);
  assert.equal(quoteAfterEquation.status, 'partial');
  assert.equal(quoteAfterEquation.reason, 'quote_not_full_sentence');
  assert.equal(quoteAfterEquation.verbatimCitationAllowed, false);
  const readPdfWithUnicodeSentenceTerminals = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text =
      'Earlier findings were mixed. هذه نتيجة مهمة؟ परिणाम स्पष्ट था।';
    return result;
  }) as any;
  const unicodeTerminalDependencies = { ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw,
      { readPdf: readPdfWithUnicodeSentenceTerminals })) as any };
  for (const quote of ['هذه نتيجة مهمة؟', 'परिणाम स्पष्ट था।']) {
    const complete = await verifyResearchQuote({ ...base, quote }, unicodeTerminalDependencies);
    assert.equal(complete.status, 'verified', `complete sentence should accept ${quote}`);
    assert.equal(complete.verbatimCitationAllowed, true);
  }
  const missingArabicTerminator = await verifyResearchQuote({ ...base,
    quote: 'هذه نتيجة مهمة' }, unicodeTerminalDependencies);
  assert.equal(missingArabicTerminator.status, 'partial');
  assert.equal(missingArabicTerminator.reason, 'quote_not_full_sentence');
  assert.equal(missingArabicTerminator.verbatimCitationAllowed, false);
  const readPdfWithAuthorInitial = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text = 'Earlier work was reviewed. J. Smith continued the study.';
    return result;
  }) as any;
  const initialDependencies = { ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfWithAuthorInitial })) as any };
  const quoteAfterInitial = await verifyResearchQuote({ ...base,
    quote: 'Smith continued the study.' }, initialDependencies);
  assert.equal(quoteAfterInitial.status, 'partial');
  assert.equal(quoteAfterInitial.verbatimCitationAllowed, false);

  const readPdfWithAuthorAbbreviation = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text = 'Earlier findings were mixed. Smith et al. reported a limited effect.';
    return result;
  }) as any;
  const authorDependencies = { ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfWithAuthorAbbreviation })) as any };
  const authorFragment = await verifyResearchQuote({ ...base, quote: 'reported a limited effect.' }, authorDependencies);
  assert.equal(authorFragment.status, 'partial');
  const authorFullSentence = await verifyResearchQuote({ ...base,
    quote: 'Smith et al. reported a limited effect.' }, authorDependencies);
  assert.equal(authorFullSentence.status, 'verified');

  const readPdfTruncated = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].truncated = true;
    return result;
  }) as any;
  const incompletePage = await verifyResearchQuote(base, {
    ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfTruncated })) as any,
  });
  assert.equal(incompletePage.status, 'partial');
  assert.equal(incompletePage.reason, 'page_text_truncated');
  assert.equal(incompletePage.verbatimCitationAllowed, false);

  const readPdfAtPageBoundary = (async (input: { startPage: number }) => {
    const result = await readPdf(input);
    if (input.startPage === 2) result.pages[0].text = 'The intervention did not improve scores.';
    return result;
  }) as any;
  const boundary = await verifyResearchQuote(base, {
    ...dependencies,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf: readPdfAtPageBoundary })) as any,
  });
  assert.equal(boundary.status, 'partial');
  assert.equal(boundary.reason, 'page_boundary_context_unverified');
  assert.equal(boundary.verbatimCitationAllowed, false);
});

test('direct quote receipt rejects a correction DOI paired with the original article PDF', async () => {
  const correctionDoi = '10.1371/journal.pone.0301214';
  const correctionTitle = 'Correction: Virus-Like Nanoparticle Vaccine Confers Protection against Toxoplasma gondii';
  const originalTitle = 'Virus-Like Nanoparticle Vaccine Confers Protection against Toxoplasma gondii';
  const originalDoi = '10.1371/journal.pone.0161231';
  const service = new ResearchService(async providerUrl => providerUrl.includes('/works/')
    ? { message: { DOI: correctionDoi, title: [correctionTitle], type: 'journal-article', 'container-title': ['PLOS ONE'],
      author: [{ given: 'Dong Hun', family: 'Lee' }, { given: 'Su Hwa', family: 'Lee' },
        { given: 'Ah Ra', family: 'Kim' }, { given: 'Fu Shi', family: 'Quan' }],
      issued: { 'date-parts': [[2024]] } } } : collection([]));
  const readPdf = (async () => ({ requestedUrl: 'https://publisher.example.edu/original.pdf',
    resolvedUrl: 'https://publisher.example.edu/original.pdf', retrievedAt: '2026-09-28T00:00:00.000Z',
    sha256: 'f'.repeat(64), totalPages: 14,
    pages: [{ page: 1, text: `${originalTitle}\nDong Hun Lee; Su Hwa Lee; Ah Ra Kim; Fu Shi Quan\nDOI: ${originalDoi}\nPublished 2016.`,
      truncated: false, needsOcr: false }], nextPage: 2, guidance: [] })) as any;
  const result = await verifyResearchQuote({ doi: correctionDoi, expectedTitle: correctionTitle,
    expectedAuthors: ['Dong Hun Lee', 'Su Hwa Lee', 'Ah Ra Kim', 'Fu Shi Quan'], expectedYear: 2024,
    url: 'https://publisher.example.edu/original.pdf', expectedSha256: 'f'.repeat(64),
    page: 1, quote: 'All vaccinated mice survived whereas all control mice died.' }, {
    service,
    verifyIdentity: ((raw: any) => verifyResearchDocumentIdentity(raw, { readPdf })) as any,
    verifyEvidence: ((raw: any) => { assert.fail('mismatched file must stop before quote matching'); }) as any,
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.stage, 'document_identity');
  assert.equal(result.reason, 'title_not_found_in_document');
  assert.equal(result.verbatimCitationAllowed, false);
});

test('direct quote receipt works through the real PDF parser on fixed bytes', async () => {
  const bytes = pdfFixture('Academic Evidence Study DOI: 10.1234/ABC Abstract\nThe intervention did not improve scores for the full cohort.');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, title: ['Academic Evidence Study'] } } : collection([]));
  const readPdf = (async ({ url, startPage, pageCount }: { url: string; startPage: number; pageCount: number }) => ({
    requestedUrl: url, resolvedUrl: url, retrievedAt: '2026-09-26T00:00:00.000Z', sha256,
    ...await extractPdfBytes(bytes, startPage, pageCount), guidance: [],
  })) as any;
  const result = await verifyResearchQuote({ doi: work.DOI, expectedTitle: 'Academic Evidence Study',
    url: 'https://example.edu/study.pdf', expectedSha256: sha256, page: 1,
    quote: 'The intervention did not improve scores for the full cohort.' }, {
    service,
    verifyIdentity: ((raw: any) => verifyResearchDocumentIdentity(raw, { readPdf })) as any,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf })) as any,
  });
  assert.equal(result.status, 'verified', JSON.stringify(result));
  assert.equal(result.verbatimCitationAllowed, true);
  assert.equal(result.evidence?.proof.documentSha256, sha256);

  const dependencies = {
    service,
    verifyIdentity: ((raw: any) => verifyResearchDocumentIdentity(raw, { readPdf })) as any,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf })) as any,
  };
  const base = { doi: work.DOI, expectedTitle: 'Academic Evidence Study',
    url: 'https://example.edu/study.pdf', expectedSha256: sha256, page: 1 };
  for (const quote of [
    'The intervention improved scores for the full cohort.',
    'The intervention did not improve scores for the subgroup.',
    'The intervention did not improve scores.',
  ]) {
    const rejected = await verifyResearchQuote({ ...base, quote }, dependencies);
    assert.equal(rejected.verbatimCitationAllowed, false, `must reject altered quotation: ${quote}`);
    assert.equal(rejected.stage, 'quote');
    assert.equal(rejected.reason, 'excerpt_not_found_at_locator');
  }
  const truncated = await verifyResearchQuote({ ...base,
    quote: 'The intervention did not improve scores for the full cohort' }, dependencies);
  assert.equal(truncated.verbatimCitationAllowed, false);
  assert.equal(truncated.reason, 'quote_not_full_sentence');
});

test('direct quote receipt accepts the first full sentence after a verified title and author block', async () => {
  const title = 'Academic Evidence Study';
  const fullSentence = 'The intervention did not improve scores for the full cohort.';
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, title: [title] } } : collection([]));
  const readPdf = (async () => ({ requestedUrl: 'https://example.edu/study.pdf',
    resolvedUrl: 'https://example.edu/study.pdf', retrievedAt: '2026-09-28T00:00:00.000Z',
    sha256: 'c'.repeat(64), totalPages: 1, pages: [{ page: 1,
      text: `${title}\nDOI: 10.1234/ABC\nAna Perez\n${fullSentence}`, truncated: false, needsOcr: false }],
    nextPage: null, guidance: [] })) as any;
  const dependencies = { service,
    verifyIdentity: ((raw: any) => verifyResearchDocumentIdentity(raw, { readPdf })) as any,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf })) as any };
  const base = { doi: work.DOI, expectedTitle: title, expectedAuthors: ['Ana Perez'], expectedYear: 2024,
    url: 'https://example.edu/study.pdf', expectedSha256: 'c'.repeat(64), format: 'pdf' as const, page: 1 };
  const complete = await verifyResearchQuote({ ...base, quote: fullSentence }, dependencies);
  assert.equal(complete.status, 'verified', JSON.stringify(complete));
  assert.equal(complete.verbatimCitationAllowed, true);
  const fragment = await verifyResearchQuote({ ...base,
    quote: 'did not improve scores for the full cohort.' }, dependencies);
  assert.equal(fragment.status, 'partial');
  assert.equal(fragment.verbatimCitationAllowed, false);
  assert.equal(fragment.reason, 'quote_not_full_sentence');
});

test('direct quote receipt verifies XML/JATS section, DOI identity, hash and exact sentence', async () => {
  const title = 'A Verifiable XML Research Study';
  const quote = 'The intervention did not improve scores.';
  const sha256 = 'd'.repeat(64);
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, title: [title] } } : collection([]));
  const readDocument = async ({ startSection }: { startSection: number }) => ({
    requestedUrl: 'https://repository.example.edu/article.xml',
    resolvedUrl: 'https://repository.example.edu/article.xml', retrievedAt: '2026-09-27T00:00:00.000Z',
    sha256, format: 'xml' as const, totalSections: 4,
    sections: Array.from({ length: Math.min(8, 5 - startSection) }, (_, index) => {
      const section = startSection + index;
      return section === 1
        ? { section, heading: null, text: `${title}\nDOI: 10.1234/ABC\nAbstract\nSummary.`, truncated: false }
        : section === 4
          ? { section, heading: 'References', text: `Smith (2020). ${quote}`, truncated: false }
          : { section, heading: section === 2 ? 'Results' : null,
            text: `Earlier studies differed. ${quote}`, truncated: false };
    }),
    nextSection: null, textCoverage: 'complete' as const,
  });
  const dependencies = { service,
    verifyIdentity: ((raw: any) => verifyResearchDocumentIdentity(raw, { readDocument: readDocument as any })) as any,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readDocument: readDocument as any })) as any };
  const base = { doi: work.DOI, expectedTitle: title, url: 'https://repository.example.edu/article.xml',
    expectedSha256: sha256, format: 'xml' as const, section: 2, quote };
  const verified = await verifyResearchQuote(base, dependencies);
  assert.equal(verified.status, 'verified');
  assert.equal(verified.verbatimCitationAllowed, true);
  assert.equal(verified.scope, 'complete_sentence_direct_quotation_document_section');
  assert.equal(verified.evidence?.proof.locatorType, 'section');
  assert.equal(verified.identity?.identityAllowed, true);

  const handlers = new Map<string, any>();
  registerResearchTools({ registerTool(name: string, _config: unknown, handler: unknown) {
    handlers.set(name, handler);
  } } as any, { authorize: () => true, service,
    verifyQuote: ((raw: any) => verifyResearchQuote(raw, dependencies)) as any });
  const mcpResult = await handlers.get('campus_research_verify_quote')(base);
  assert.equal(JSON.parse(mcpResult.content[0].text).verbatimCitationAllowed, true);
  assert.ok(mcpResult.content.some((part: any) => part.type === 'resource_link'
    && part.uri === 'https://repository.example.edu/article.xml'
    && part.mimeType === 'application/xml'));

  const altered = await verifyResearchQuote({ ...base, quote: 'The intervention improved scores.' }, dependencies);
  assert.equal(altered.verbatimCitationAllowed, false);
  assert.equal(altered.stage, 'quote');

  const fromReferences = await verifyResearchQuote({ ...base, section: 4 }, dependencies);
  assert.equal(fromReferences.verbatimCitationAllowed, false);
  assert.equal(fromReferences.reason, 'quote_in_references');
});

test('direct quote receipt checks the preceding context at unheaded document section boundaries', async () => {
  const title = 'A Section Boundary Verification Study';
  const doi = '10.1234/SECTION-BOUNDARY';
  const quote = 'The treatment did not improve outcomes in this sample.';
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, DOI: doi, title: [title] } } : collection([]));
  const verifyWithBoundaryText = async (boundaryText: string) => {
    const bytes = Buffer.from(`${title}\nDOI: ${doi}\n\n${boundaryText}${boundaryText ? '\n' : ''}${quote}`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const readDocument = async (input: { startSection: number; sectionCount: number }) => {
      return { requestedUrl: 'https://repository.example.edu/study.html',
        resolvedUrl: 'https://repository.example.edu/study.html',
        retrievedAt: '2026-09-27T00:00:00.000Z', sha256,
        ...extractDocumentBytes(bytes, 'text', input.startSection, input.sectionCount, 'text/plain'),
        guidance: [] };
    };
    return verifyResearchQuote({ doi, expectedTitle: title, url: 'https://repository.example.edu/study.html',
      expectedSha256: sha256, format: 'text', section: 2, quote }, {
      service,
      verifyIdentity: ((raw: any) => verifyResearchDocumentIdentity(raw,
        { readDocument: readDocument as any })) as any,
      verifyEvidence: ((raw: any) => verifyResearchEvidence(raw,
        { readDocument: readDocument as any })) as any,
    });
  };

      const ambiguousStart = await verifyWithBoundaryText('');
  assert.equal(ambiguousStart.status, 'partial');
  assert.equal(ambiguousStart.verbatimCitationAllowed, false);
  assert.equal(ambiguousStart.reason, 'section_boundary_context_unverified');
  const guessedHeading = await verifyWithBoundaryText('Prior words without ending');
  assert.equal(guessedHeading.status, 'partial');
  assert.equal(guessedHeading.verbatimCitationAllowed, false);
  assert.equal(guessedHeading.identity?.status, 'verified');
  const structuralHeading = await verifyWithBoundaryText('Results');
  assert.equal(structuralHeading.status, 'verified', JSON.stringify(structuralHeading));
  assert.equal(structuralHeading.verbatimCitationAllowed, true);
});

test('direct quote receipt verifies exact HTML, text, Markdown, DOCX and EPUB passages', async () => {
  const title = 'A Cross-Format Verifiable Research Study';
  const quote = 'The treatment did not improve outcomes in this sample.';
  const formats = [
    { format: 'html', contentType: 'text/html', bytes: Buffer.from(`<html><main><h1>${title}</h1>
      <p>DOI: 10.1234/QUOTE-HTML</p><h2>Abstract</h2><p>Summary of the study.</p>
      <p>Earlier studies varied. ${quote}</p></main></html>`) },
    { format: 'text', contentType: 'text/plain', bytes: Buffer.from(`${title}\nDOI: 10.1234/QUOTE-TEXT\nAbstract\nSummary of the study.\n\nEarlier studies varied. ${quote}`) },
    { format: 'markdown', contentType: 'text/markdown', bytes: Buffer.from(`# ${title}\n\nDOI: 10.1234/QUOTE-MARKDOWN\n\nAbstract\n\nSummary of the study.\n\nEarlier studies varied. ${quote}`) },
    { format: 'docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bytes: zipSync({ 'word/document.xml': strToU8(`<w:document><w:body>
        <w:p><w:r><w:t>${title}</w:t></w:r><w:br/><w:br/></w:p>
        <w:p><w:r><w:t>DOI: 10.1234/QUOTE-DOCX</w:t></w:r><w:br/><w:br/></w:p>
        <w:p><w:r><w:t>Abstract</w:t></w:r><w:br/><w:br/></w:p>
        <w:p><w:r><w:t>Summary of the study.</w:t></w:r><w:br/><w:br/></w:p>
        <w:p><w:r><w:t>Earlier studies varied. ${quote}</w:t></w:r></w:p>
      </w:body></w:document>`) }) },
    { format: 'epub', contentType: 'application/epub+zip',
      bytes: zipSync({ 'OEBPS/chapter.xhtml': strToU8(`<html><body><h1>${title}</h1>
        <p>DOI: 10.1234/QUOTE-EPUB</p><h2>Abstract</h2><p>Summary of the study.</p>
        <p>Earlier studies varied. ${quote}</p></body></html>`) }) },
  ] as const;
  for (const item of formats) {
    const doi = `10.1234/QUOTE-${item.format}`;
    const url = `https://repository.example.edu/study.${item.format}`;
    const sha256 = createHash('sha256').update(item.bytes).digest('hex');
    const all = extractDocumentBytes(item.bytes, item.format, 1, 30, item.contentType);
    assert.notEqual(all.format, 'pdf');
    const section = all.sections.find(value => value.text.includes(quote))?.section;
    assert.ok(section, `${item.format} fixture should contain the target sentence`);
    const readDocument = async (input: { startSection: number; sectionCount: number }) => ({
      requestedUrl: url, resolvedUrl: url, retrievedAt: '2026-09-27T00:00:00.000Z', sha256,
      ...extractDocumentBytes(item.bytes, item.format, input.startSection, input.sectionCount, item.contentType),
      guidance: [],
    });
    const service = new ResearchService(async requestUrl => requestUrl.includes('/works/')
      ? { message: { ...work, DOI: doi, title: [title] } } : collection([]));
    const dependencies = { service,
      verifyIdentity: ((raw: any) => verifyResearchDocumentIdentity(raw,
        { readDocument: readDocument as any })) as any,
      verifyEvidence: ((raw: any) => verifyResearchEvidence(raw,
        { readDocument: readDocument as any })) as any };
    const args = { doi, expectedTitle: title, url, expectedSha256: sha256,
      format: item.format, section: section!, quote };
    const exact = await verifyResearchQuote(args, dependencies);
    assert.equal(exact.status, 'verified', `${item.format} exact sentence should verify`);
    assert.equal(exact.verbatimCitationAllowed, true);
    assert.equal(exact.evidence?.proof.documentSha256, sha256);
    const altered = await verifyResearchQuote({ ...args,
      quote: 'The treatment did improve outcomes in this sample.' }, dependencies);
    assert.equal(altered.verbatimCitationAllowed, false, `${item.format} altered sentence must fail`);
    assert.equal(altered.stage, 'quote');
  }
});

test('PLOS style HTML binds a complete quote to its article and rejects the adjacent reference section', async () => {
  const doi = '10.1371/journal.pone.0301214';
  const title = 'Correction: Virus-Like Nanoparticle Vaccine Confers Protection against Toxoplasma gondii';
  const url = `https://journals.plos.org/plosone/article?id=${doi}`;
  const html = Buffer.from(`<html><body><nav>Site navigation must not become article text</nav>
    <div class="title-authors"><h1>${title}</h1><ul class="author-list">
      <li>Dong Hun Lee</li><li>Su Hwa Lee</li><li>Ah Ra Kim</li><li>Fu Shi Quan</li>
    </ul></div><ul class="date-doi"><li>Published: March 21, 2024</li>
      <li><a href="https://doi.org/${doi}">${doi}</a></li></ul>
    <div id="artText"><div class="section"><p>In Fig 1, the images for Fig 1B and Fig 1C are incorrectly switched.</p></div>
      <div class="section"><h2>References</h2><p>Lee DH, Lee SH, Kim AR, Quan FS (2016) Virus-Like Nanoparticle Vaccine Confers Protection against Toxoplasma gondii.</p></div>
    </div></body></html>`);
  const sha256 = createHash('sha256').update(html).digest('hex');
  const service = new ResearchService(async providerUrl => providerUrl.includes('/works/')
    ? { message: { DOI: doi, title: [title], type: 'journal-article', 'container-title': ['PLOS ONE'],
      author: [{ given: 'Dong Hun', family: 'Lee' }, { given: 'Su Hwa', family: 'Lee' },
        { given: 'Ah Ra', family: 'Kim' }, { given: 'Fu Shi', family: 'Quan' }],
      issued: { 'date-parts': [[2024]] } } } : collection([]));
  const readDocument = async (input: { startSection: number; sectionCount: number }) => ({
    requestedUrl: url, resolvedUrl: url, retrievedAt: '2026-09-28T00:00:00.000Z', sha256,
    ...extractDocumentBytes(html, 'html', input.startSection, input.sectionCount, 'text/html'), guidance: [],
  });
  const all = await readDocument({ startSection: 1, sectionCount: 30 });
  const correctionSection = all.sections.find(section => section.text.includes('incorrectly switched'))!.section;
  const referenceSection = all.sections.find(section => section.text.includes('Lee DH, Lee SH'))!.section;
  const dependencies = { service,
    verifyIdentity: ((raw: any) => verifyResearchDocumentIdentity(raw,
      { readDocument: readDocument as any })) as any,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw,
      { readDocument: readDocument as any })) as any };
  const quote = await verifyResearchQuote({ doi, expectedTitle: title, url, expectedSha256: sha256,
    format: 'html', section: correctionSection,
    quote: 'In Fig 1, the images for Fig 1B and Fig 1C are incorrectly switched.' }, dependencies);
  assert.equal(quote.status, 'verified', JSON.stringify(quote));
  assert.equal(quote.verbatimCitationAllowed, true);
  assert.equal(quote.evidence?.proof.documentSha256, sha256);
  const reference = await verifyResearchQuote({ doi, expectedTitle: title, url, expectedSha256: sha256,
    format: 'html', section: referenceSection,
    quote: 'Lee DH, Lee SH, Kim AR, Quan FS (2016) Virus-Like Nanoparticle Vaccine Confers Protection against Toxoplasma gondii.' }, dependencies);
  assert.equal(reference.verbatimCitationAllowed, false);
  assert.equal(reference.reason, 'quote_in_references');
  assert.equal(reference.evidence?.sourceRegion, 'references');
});

test('citation verifiers reject private source URLs before metadata or document reads', async () => {
  const unsafeUrl = 'https://127.0.0.1/private.pdf';
  const never = async () => { assert.fail('External operation must not run'); };
  await assert.rejects(verifyResearchEvidence({ url: unsafeUrl, page: 1,
    claim: 'A documented claim.', excerpt: 'A documented excerpt.', expectedSha256: 'a'.repeat(64) },
  { readPdf: never as any }), /privadas/);
  await assert.rejects(verifyResearchDocumentIdentity({ url: unsafeUrl, format: 'pdf',
    expectedTitle: 'Academic Evidence Study', expectedSha256: 'a'.repeat(64) },
  { readPdf: never as any }), /privadas/);
  const service = { verifyCitation: never } as any;
  await assert.rejects(verifyResearchQuote({ doi: work.DOI, expectedTitle: 'Academic Evidence Study',
    url: unsafeUrl, expectedSha256: 'a'.repeat(64), page: 1, quote: 'A documented excerpt.' },
  { service }), /privadas/);
});

test('publisher self-citation box and abstract paragraph bind an exact quote to the same article', async () => {
  const doi = '10.1371/journal.pone.0000001';
  const title = 'Neural Substrate of Cold-Seeking Behavior in Endotoxin Shock';
  const quote = 'Systemic inflammation is a leading cause of hospital death.';
  const page = `${title}\nMaria C. Almeida, Alexandre A. Steiner, Luiz G. S. Branco, Andrej A. Romanovsky\n\n${quote} Mild inflammation differs from shock.\n\nCitation: Almeida MC, Steiner AA, Branco LGS, Romanovsky AA (2006) ${title}. PLoS ONE 1(1): e1. doi:${doi}\n\nINTRODUCTION\nFurther details.`;
  const sha256 = createHash('sha256').update(page).digest('hex');
  const service = new ResearchService(async url => url.includes('/works/')
    ? { message: { ...work, DOI: doi, title: [title], 'container-title': ['PLOS ONE'],
      author: [{ given: 'Maria C', family: 'Almeida' }, { given: 'Alexandre A', family: 'Steiner' },
        { given: 'Luiz G S', family: 'Branco' }, { given: 'Andrej A', family: 'Romanovsky' }],
      issued: { 'date-parts': [[2006]] } } } : collection([]));
  const readPdf = (async () => ({ requestedUrl: 'https://journals.plos.org/article.pdf',
    resolvedUrl: 'https://journals.plos.org/article.pdf', retrievedAt: '2026-09-29T00:00:00.000Z', sha256,
    totalPages: 1, pages: [{ page: 1, text: page, truncated: false, needsOcr: false }],
    nextPage: null, guidance: [] })) as any;
  const dependencies = { service,
    verifyIdentity: ((raw: any) => verifyResearchDocumentIdentity(raw, { readPdf })) as any,
    verifyEvidence: ((raw: any) => verifyResearchEvidence(raw, { readPdf })) as any };
  const input = { doi, expectedTitle: title, url: 'https://journals.plos.org/article.pdf',
    expectedSha256: sha256, page: 1, quote };
  const accepted = await verifyResearchQuote(input, dependencies);
  assert.equal(accepted.verbatimCitationAllowed, true, JSON.stringify(accepted));
  assert.equal(accepted.evidence?.proof.documentSha256, sha256);
  const fabricated = await verifyResearchQuote({ ...input,
    quote: 'The best translation results came from 200 patients.' }, dependencies);
  assert.equal(fabricated.verbatimCitationAllowed, false);
  assert.equal(fabricated.reason, 'excerpt_not_found_at_locator');
});
