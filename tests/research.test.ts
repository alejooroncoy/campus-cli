import assert from 'node:assert/strict';
import test from 'node:test';
import { ResearchService, normalizeDoi, scholarSearchLinks } from '../src/providers/academic/research-service.js';
import { assertPublicAddress, publicHttpsUrl, ResearchHttpError } from '../src/providers/academic/research-http.js';
import { extractPdfBytes, extractPdfIndexBytes } from '../src/providers/academic/research-pdf.js';
import { ResearchPdfIndex } from '../src/providers/academic/research-pdf-index.js';
import { registerResearchTools } from '../src/providers/academic/research-mcp-tools.js';
import { verifyResearchEvidence } from '../src/providers/academic/research-evidence.js';
import { readResearchDocument } from '../src/providers/academic/research-document.js';
import { officialResearchAlternate } from '../src/providers/academic/research-official-sources.js';

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
    assert.equal(handlers.size, 12);
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
  assert.match(result.content[0].text, /No se leyó el contenido/);
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

test('one account cannot evict another account PDF index when cache capacity is full', async () => {
  const index = new ResearchPdfIndex({
    download: async url => ({ bytes: pdfFixture(), url, contentType: 'application/pdf' }),
    extract: async (_bytes, onEvent) => {
      onEvent({ metadata: { totalPages: 1, outline: [] } });
      onEvent({ batch: [{ page: 1, text: 'Evidence from source.', truncated: false, needsOcr: false }] });
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
