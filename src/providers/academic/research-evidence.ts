import { createHash } from 'node:crypto';
import { z } from 'zod';
import { documentFormat, readResearchDocument } from './research-document.js';
import { readResearchPdf } from './research-pdf.js';
import { normalizeDoi } from './research-service.js';
import { publicHttpsUrl } from './research-http.js';

const evidenceFormat = z.enum(['auto', 'pdf', ...documentFormat.options.filter(format => format !== 'auto')]);

export const evidenceVerificationInput = z.object({
  url: z.string().url().max(4000),
  documentId: z.string().uuid().optional()
    .describe('ID de un índice PDF preparado. Reutiliza sus páginas y su SHA-256 sin descargar el PDF otra vez.'),
  analysisId: z.string().uuid().optional()
    .describe('ID de la consulta devuelto al iniciar el índice; registra lecturas y verificaciones de este análisis por separado.'),
  excerpt: z.string().trim().min(10).max(4000)
    .describe('Fragmento atribuido a la fuente. Campus comprueba que aparezca en el texto extraído de la página o sección indicada.'),
  claim: z.string().trim().min(5).max(4000)
    .optional().describe('Afirmación concreta que se quiere respaldar con este fragmento. El comprobante queda vinculado a ella; una paráfrasis requiere evaluación semántica del cliente.'),
  format: evidenceFormat.default('auto'),
  page: z.number().int().min(1).optional()
    .describe('Página PDF exacta donde el cliente encontró el fragmento.'),
  section: z.number().int().min(1).optional()
    .describe('Número de sección exacto devuelto por campus_research_read_document.'),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional()
    .describe('SHA-256 devuelto por la lectura anterior. Si el documento cambió, la evidencia se rechaza.'),
  inspectPreviousPage: z.boolean().default(false)
    .describe('En citas textuales PDF, comprueba si las referencias empezaron en alguna página anterior; páginas muy lejanas quedan sin aprobación automática.'),
}).superRefine((input, context) => {
  if (input.documentId && input.page === undefined) {
    context.addIssue({ code: 'custom', message: 'documentId requiere page.' });
  }
  if (input.analysisId && !input.documentId) {
    context.addIssue({ code: 'custom', message: 'analysisId requiere documentId.' });
  }
  if ((input.page === undefined) === (input.section === undefined)) {
    context.addIssue({ code: 'custom', message: 'Indica exactamente page o section.' });
  }
  if (input.page !== undefined && input.format !== 'auto' && input.format !== 'pdf') {
    context.addIssue({ code: 'custom', message: 'page requiere format=pdf o auto.' });
  }
  if (input.section !== undefined && input.format === 'pdf') {
    context.addIssue({ code: 'custom', message: 'format=pdf requiere page.' });
  }
  if (input.inspectPreviousPage && input.page === undefined) {
    context.addIssue({ code: 'custom', message: 'inspectPreviousPage requiere page.' });
  }
});

type EvidenceDependencies = {
  readPdf?: typeof readResearchPdf;
  readDocument?: typeof readResearchDocument;
};

function normalizedLiteral(value: string): string {
  return value.normalize('NFC').replace(/\r/g, '').replace(/\s+/g, ' ').trim();
}

function isTokenCharacter(value: string | undefined): boolean {
  return Boolean(value && /^[\p{L}\p{N}\p{M}_]$/u.test(value));
}

function isDigit(value: string | undefined): boolean {
  return Boolean(value && /^\p{N}$/u.test(value));
}

function hasNumericSuffixContinuation(value: string): boolean {
  return /^[\s]*[-−–—+×*/<>≤≥±≈~^⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹]/u.test(value)
    || /^[\s]*(?:%|‰|°(?:[CFK])?)/u.test(value)
    || /^[\s]*(?:kg|g|mg|µg|lb|oz|km|m|cm|mm|mi|ft|in|ms|s|min|h|Hz|kHz|MHz|GHz)\b/iu.test(value);
}

function endsWithNumericExpression(value: string): boolean {
  return /\p{N}\s*(?:(?:kg|g|mg|µg|ng|pg|lb|oz|km|m|cm|mm|µm|mi|ft|in|ms|s|min|h|Hz|kHz|MHz|GHz|mol|mmol|µmol|L|mL|dL|Pa|kPa|MPa|W|kW|J|kJ|V|mV|A|mA)\b|[%‰°](?:[CFK])?)?\s*$/iu.test(value);
}

function hasBoundedLiteral(text: string, excerpt: string): boolean {
  const first = excerpt[0];
  const last = excerpt.at(-1);
  const excerptCharacters = Array.from(excerpt);
  for (let index = text.indexOf(excerpt); index !== -1; index = text.indexOf(excerpt, index + 1)) {
    const beforeCharacters = Array.from(text.slice(0, index));
    const afterCharacters = Array.from(text.slice(index + excerpt.length));
    const before = beforeCharacters.at(-1);
    const after = afterCharacters[0];
    let prefixIndex = beforeCharacters.length - 1;
    while (prefixIndex >= 0 && /\s/u.test(beforeCharacters[prefixIndex]!)) prefixIndex -= 1;
    const semanticPrefix = beforeCharacters[prefixIndex];
    const startsAfterNumericOperator = isDigit(first) && /^[+\-−–<>≤≥±≈~]$/.test(semanticPrefix ?? '');
    const startsAfterStandaloneNegation = isTokenCharacter(first)
      && /(?:^|\s)(?:no|not|minus|negative|less\s+than|greater\s+than|approximately|about|around|nearly|at\s+least|at\s+most)\s*$/iu.test(beforeCharacters.slice(0, prefixIndex + 1).join(''));
    const startsAfterHyphenatedPrefix = /^[\-−–]$/.test(semanticPrefix ?? '')
      && isTokenCharacter(first) && isTokenCharacter(beforeCharacters[prefixIndex - 1]);
    const startsInsideDecimal = (isDigit(first) && /^[.,]$/.test(before ?? '')
      && isDigit(beforeCharacters.at(-2)))
      || (/^[.,]$/.test(first ?? '') && isDigit(before) && isDigit(excerptCharacters[1]));
    const endsInsideDecimal = (isDigit(last) && /^[.,]$/.test(after ?? '') && isDigit(afterCharacters[1]))
      || (/^[.,]$/.test(last ?? '') && isDigit(excerptCharacters.at(-2)) && isDigit(after));
    const endsBeforeNumericContinuation = endsWithNumericExpression(excerpt)
      && hasNumericSuffixContinuation(afterCharacters.join(''));
    if (!(isTokenCharacter(first) && isTokenCharacter(before))
      && !(isTokenCharacter(last) && isTokenCharacter(after))
      && !startsAfterNumericOperator && !startsAfterHyphenatedPrefix
      && !startsAfterStandaloneNegation
      && !startsInsideDecimal && !endsInsideDecimal && !endsBeforeNumericContinuation) return true;
  }
  return false;
}

export const documentIdentityInput = z.object({
  url: z.string().url().max(4000),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  expectedTitle: z.string().trim().min(8).max(1000)
    .refine(value => normalizedIdentityText(value).length > 0,
      'El título debe contener letras o números verificables.'),
  expectedDoi: z.string().trim().min(6).max(350).optional(),
  expectedAuthors: z.array(z.string().trim().min(2).max(300)).min(2).max(100).optional(),
  expectedYear: z.number().int().min(1000).max(3000).optional(),
  format: evidenceFormat.default('auto'),
});

function normalizedIdentityText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function normalizedExpectedTitle(value: string): string {
  return normalizedIdentityText(value.replace(/<\/?(?:i|em|b|strong|sub|sup)\b[^>]*>/gi, ''));
}

function doiAppearsInText(text: string, doi: string): boolean {
  const literal = [...doi].map(character => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s{0,4}');
  // Permit line wraps inside a DOI and punctuation after it, but never accept a
  // longer DOI whose suffix merely starts with the expected value.
  return new RegExp(`(?:^|[^a-z0-9])${literal}(?=$|\\s|[.,;:!?)](?:\\s|$))`, 'i').test(text);
}

const REFERENCE_SECTION_NAME = '(?:references?(?:\\s+(?:and|&)\\s+(?:notes|sources))?|bibliograph(?:y|ies|ie)|bibliograf[ií]as?|bibliograf[ií]es?|bibliografie|bibliografija|referencias?|referências?|riferimenti(?:\\s+bibliografici)?|literaturverzeichnis|works cited|cited works|literature cited|список\\s+литературы|библиограф(?:ия|ический\\s+список)|références bibliographiques|références|引用文献|参考文献|参考资料|參考文獻|참고문헌|kaynakça|lähdeluettelo|literaturliste|المراجع|संदर्भ)';

function pdfReferencesHeading(text: string): RegExpExecArray | null {
  const headingPattern = `(?:^|\\r?\\n)[ \\t]*(?:\\d+(?:\\.\\d+)*[.)]?[ \\t]+)?${REFERENCE_SECTION_NAME}`;
  const explicit = new RegExp(`${headingPattern}(?:[ \\t]*:[ \\t]*|[ \\t]+\\d{1,4}|[ \\t]+\\(?continued\\)?)?[ \\t]*(?=\\r?$)`, 'imu').exec(text)
    ?? new RegExp(`${headingPattern}[ \\t]+\\d{1,4}[ \\t]+(?=(?:\\[\\d+\\]|\\d+[.)][ \\t]+|\\p{Lu}[\\p{L}'’.-]+(?:,[ \\t]*\\p{Lu}|[ \\t]*\\(\\d{4})))`, 'imu').exec(text)
    ?? new RegExp(`(?:^|[.!?]\\s+)${REFERENCE_SECTION_NAME}\\s*:`, 'imu').exec(text);
  if (explicit) return explicit;

  // Some publisher PDFs omit a References heading (for example Nature's
  // “Online content” page) and begin the bibliography with numbered entries.
  // Require a sequential run and citation-like metadata to avoid ordinary lists.
  const entries = [...text.matchAll(/(?:^|\r?\n)[ \t]*(\d{1,3})[.)][ \t]+/g)];
  for (let start = 0; start < entries.length; start++) {
    let end = start + 1;
    while (end < entries.length && Number(entries[end][1]) === Number(entries[end - 1][1]) + 1) end++;
    if (end - start < 3) continue;
    const block = text.slice(entries[start].index ?? 0, entries[end]?.index ?? text.length);
    const citationEntries = block.split(/(?:^|\r?\n)[ \t]*\d{1,3}[.)][ \t]+/).slice(1);
    const citationLike = citationEntries.filter(entry => /\b(?:19|20)\d{2}\b|doi\s*:|https?:\/\/|\b(?:Nature|Science|Journal|Proceedings|Cell|PLOS)\b/i.test(entry)).length;
    if (citationLike >= Math.max(2, Math.ceil(citationEntries.length * 0.6))) {
      const match = /(?:^|\r?\n)[ \t]*\d{1,3}[.)][ \t]+/.exec(text.slice(entries[start].index ?? 0));
      if (match) {
        const synthetic = [match[0]] as unknown as RegExpExecArray;
        synthetic.index = entries[start].index ?? 0;
        return synthetic;
      }
    }
  }
  return null;
}

function pdfCaptionAfterReferences(text: string): number | null {
  const references = pdfReferencesHeading(text);
  if (!references) return null;
  const afterReferences = text.slice(references.index + references[0].length);
  const caption = /(?:^|\r?\n)[ \t]*(?:fig(?:ure)?\.?|table|scheme)[ \t]+(?:[A-Z]?\d+)(?:[A-Z])?(?=[.: \t])/imu.exec(afterReferences);
  return caption ? references.index + references[0].length + caption.index : null;
}

function pdfTextBeforeReferences(text: string): string {
  const heading = pdfReferencesHeading(text);
  return heading ? text.slice(0, heading.index) : text;
}

function isReferenceHeadingLine(value: string): boolean {
  const heading = `^[ \\t]*(?:\\d+(?:\\.\\d+)*[.)]?[ \\t]+)?${REFERENCE_SECTION_NAME}`;
  return new RegExp(`${heading}(?:[ \\t]*:[ \\t]*|[ \\t]+\\d{1,4}|[ \\t]+\\(?continued\\)?)?[ \\t]*$`, 'iu').test(value)
    || new RegExp(`${heading}[ \\t]+\\d{1,4}[ \\t]+(?=(?:\\[\\d+\\]|\\d+[.)][ \\t]+|\\p{Lu}[\\p{L}'’.-]+(?:,[ \\t]*\\p{Lu}|[ \\t]*\\(\\d{4})))`, 'iu').test(value);
}

function documentIsReferencesSection(heading: string | null, text: string): boolean {
  const value = `${heading ?? ''}\n${text}`;
  return value.split(/\r?\n/).some(line => isReferenceHeadingLine(line.trim()));
}

function pdfFrontMatter(text: string): string {
  const beforeReferences = pdfTextBeforeReferences(text);
  const heading = /(?:^|\r?\n)\s*(?:abstract|resumen|introduction|introducci[oó]n|background|antecedentes)\s*(?::|\r?\n|$)/im.exec(beforeReferences);
  return heading ? beforeReferences.slice(0, heading.index) : beforeReferences;
}

function documentFrontMatter(segments: Array<{ locator: number; text: string }>) {
  const front: Array<{ locator: number; text: string }> = [];
  for (const segment of segments) {
    const text = pdfFrontMatter(segment.text);
    if (text.trim()) front.push({ locator: segment.locator, text });
    if (text.length < segment.text.length) break;
  }
  return front;
}

function citationBoxStart(text: string): number | null {
  const heading = /^\s*(?:recommended citation|suggested citation|how to cite|cite as|citation|cita recomendada|c[oó]mo citar)\s*(?::|\r?\n)/im.exec(text);
  return heading ? heading.index : null;
}

function pdfCitationBoxIssue(text: string, expectedTitle: string, doi: string | null,
  authors?: string[], year?: number) {
  const frontMatter = pdfFrontMatter(text);
  const boxStart = citationBoxStart(frontMatter);
  if (boxStart === null) return null;
  const title = normalizedExpectedTitle(expectedTitle);
  const beforeBox = frontMatter.slice(0, boxStart);
  const occurrences = normalizedIdentityText(frontMatter).split(title).length - 1;
  if (!normalizedIdentityText(beforeBox).includes(title) && occurrences < 2) {
    return 'title_only_in_pdf_citation_box';
  }
  if (doi && !doiAppearsInText(beforeBox, doi)) {
    const citation = frontMatter.slice(boxStart);
    const normalizedCitation = normalizedIdentityText(citation);
    const selfCitation = authors && authors.length >= 2 && year !== undefined
      && normalizedCitation.includes(title)
      && doiAppearsInText(citation, doi)
      && new RegExp(`(?:^|\\D)${year}(?:\\D|$)`).test(citation)
      && authors.every(author => {
        const surname = normalizedIdentityText(author).split(' ').at(-1);
        return surname && normalizedCitation.split(' ').includes(surname);
      });
    if (selfCitation) return null;
    return 'doi_only_in_pdf_citation_box';
  }
  return null;
}

function pdfSelfCitationAfterAbstract(text: string, title: string, doi: string,
  authors: string[] | undefined, year: number | undefined): boolean {
  // Only the common short author-list + Keywords + self-citation layout is accepted.
  // Other post-abstract DOI layouts remain partial rather than borrowing a DOI from prior work.
  if (!authors || authors.length < 2 || authors.length > 4 || year === undefined) return false;
  const beforeReferences = pdfTextBeforeReferences(text);
  const keywords = [...beforeReferences.matchAll(/(?:^|\r?\n)\s*(?:keywords|palabras clave)\s*:/gim)];
  const marker = keywords.at(-1);
  if (!marker || marker.index === undefined) return false;
  const afterKeywords = beforeReferences.slice(marker.index + marker[0].length);
  const doiAt = afterKeywords.toLowerCase().lastIndexOf(doi);
  if (doiAt < 0 || !doiAppearsInText(afterKeywords.slice(doiAt), doi)) return false;
  const snippet = afterKeywords.slice(Math.max(0, doiAt - 500), doiAt + doi.length);
  const normalized = normalizedIdentityText(snippet);
  const stem = (value: string) => normalizedIdentityText(value).split(' ')
    .map(word => word.length > 4 ? word.replace(/s$/, '') : word).join(' ');
  if (!stem(snippet).includes(stem(title))) return false;
  if (!new RegExp(`\\(${year}\\)`).test(snippet)) return false;
  return authors.every(author => {
    const surname = normalizedIdentityText(author).split(' ').at(-1);
    return surname && normalized.split(' ').includes(surname);
  });
}

export async function verifyResearchDocumentIdentity(
  raw: z.input<typeof documentIdentityInput>,
  dependencies: EvidenceDependencies = {},
) {
  const input = documentIdentityInput.parse(raw);
  publicHttpsUrl(input.url);
  const doi = input.expectedDoi ? normalizeDoi(input.expectedDoi) : null;
  const readPdf = dependencies.readPdf ?? readResearchPdf;
  const readDocument = dependencies.readDocument ?? readResearchDocument;
  const document = input.format === 'pdf'
    ? await readPdf({ url: input.url, startPage: 1, pageCount: 3 })
    : await readDocument({ url: input.url, format: input.format,
      startSection: 1, sectionCount: 8 });
  const proof = { requestedUrl: input.url, resolvedUrl: document.resolvedUrl,
    retrievedAt: document.retrievedAt, documentSha256: document.sha256,
    inspected: 'pages' in document
      ? { type: 'pdf_pages', locators: document.pages.map(page => page.page) }
      : { type: 'document_sections', locators: document.sections.map(section => section.section) } };
  if (input.expectedSha256.toLowerCase() !== document.sha256.toLowerCase()) {
    return { status: 'rejected', identityAllowed: false, reason: 'document_hash_mismatch', proof };
  }
  if (doi) {
    const resolved = new URL(document.resolvedUrl);
    const arxivPdfId = ['arxiv.org', 'www.arxiv.org'].includes(resolved.hostname.toLowerCase())
      ? /^\/pdf\/((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7}))(?:v\d+)?(?:\.pdf)?$/i
        .exec(resolved.pathname.replace(/%2f/ig, '/'))?.[1]?.toLowerCase() : null;
    if (arxivPdfId && doi !== `10.48550/arxiv.${arxivPdfId}`) {
      return { status: 'partial', identityAllowed: false,
        reason: 'doi_does_not_identify_arxiv_file', proof,
        guidance: 'Este PDF es un preprint arXiv. El DOI solicitado identifica otra versión o publicación; verifica el DOI del preprint o lee el archivo editorial correspondiente.' };
    }
  }
  const segments = 'pages' in document
    ? document.pages.map(page => ({ locator: page.page, text: page.text }))
    : document.sections.map(section => ({ locator: section.section,
      text: `${section.heading ?? ''}\n${section.text}` }));
  const matchingTitleSegments = segments.filter(segment =>
    normalizedIdentityText(segment.text).includes(normalizedExpectedTitle(input.expectedTitle)));
  const titleFound = matchingTitleSegments.length > 0;
  if (!titleFound) {
    return { status: 'rejected', identityAllowed: false, reason: 'title_not_found_in_document', proof,
      titleFound: false, doiFound: false,
      guidance: 'El título bibliográfico no aparece en las primeras páginas o secciones extraídas. Comprueba visualmente la identidad; no asocies este archivo al registro automáticamente.' };
  }
  if ('pages' in document && !matchingTitleSegments.some(segment => segment.locator === 1)) {
    return { status: 'partial', identityAllowed: false, reason: 'title_only_after_first_pdf_page', proof,
      titleFound: true, doiFound: false, titleLocators: matchingTitleSegments.map(segment => segment.locator),
      guidance: 'El título solo aparece después de la primera página PDF; puede ser una referencia a otro artículo o existir una portada. Comprueba visualmente la identidad antes de citar.' };
  }
  if ('pages' in document && !document.pages.some(page => page.page === 1 &&
    normalizedIdentityText(pdfTextBeforeReferences(page.text))
      .includes(normalizedExpectedTitle(input.expectedTitle)))) {
    return { status: 'partial', identityAllowed: false, reason: 'title_only_in_pdf_references', proof,
      titleFound: true, doiFound: false, titleLocators: matchingTitleSegments.map(segment => segment.locator),
      guidance: 'El título esperado solo aparece en las referencias de la primera página PDF. Puede tratarse de otro artículo; comprueba visualmente su identidad.' };
  }
  if ('pages' in document && !document.pages.some(page => page.page === 1 &&
    normalizedIdentityText(pdfFrontMatter(page.text))
      .includes(normalizedExpectedTitle(input.expectedTitle)))) {
    return { status: 'partial', identityAllowed: false, reason: 'title_only_in_pdf_body', proof,
      titleFound: true, doiFound: false, titleLocators: matchingTitleSegments.map(segment => segment.locator),
      guidance: 'El título esperado aparece después del resumen o de la introducción, no en la portada bibliográfica extraída. Puede citar otro artículo; comprueba visualmente la identidad.' };
  }
  const textFrontMatter = 'pages' in document ? [] : documentFrontMatter(segments);
  const frontTitleSegments = textFrontMatter.filter(segment =>
    normalizedIdentityText(segment.text).includes(normalizedExpectedTitle(input.expectedTitle)));
  if (!('pages' in document) && !frontTitleSegments.length) {
    return { status: 'partial', identityAllowed: false, reason: 'title_only_in_document_body', proof,
      titleFound: true, doiFound: false, titleLocators: matchingTitleSegments.map(segment => segment.locator),
      guidance: 'El título aparece después del resumen, introducción o referencias del documento. Puede ser una cita de otra obra; comprueba el archivo original.' };
  }
  const citationBoxIssue = 'pages' in document
    ? document.pages.filter(page => page.page === 1)
      .map(page => pdfCitationBoxIssue(page.text, input.expectedTitle, doi,
        input.expectedAuthors, input.expectedYear)).find(Boolean) : null;
  if (citationBoxIssue) {
    return { status: 'partial', identityAllowed: false, reason: citationBoxIssue, proof,
      titleFound: true, doiFound: false, titleLocators: matchingTitleSegments.map(segment => segment.locator),
      guidance: 'El título o DOI esperado solo está acreditado dentro de un recuadro de cómo citar en la portada PDF. Puede referirse a otro trabajo; comprueba visualmente la identidad principal.' };
  }
  const doiSegments = 'pages' in document
    ? matchingTitleSegments.filter(segment => segment.locator === 1)
      .map(segment => ({ ...segment, text: pdfFrontMatter(segment.text) }))
    : textFrontMatter.filter(segment => frontTitleSegments.some(title => {
      const distance = Math.abs(segment.locator - title.locator);
      if (distance <= 3) return true;
      // Publisher HTML can split title, authors, date and DOI into separate
      // front-matter sections. Allow a wider span only when the remaining
      // bibliographic fields independently tie those sections together.
      const frontText = textFrontMatter.map(item => item.text).join('\n');
      const authorsMatch = input.expectedAuthors?.length
        && input.expectedAuthors.every(author => normalizedIdentityText(frontText)
          .includes(normalizedIdentityText(author)));
      const yearMatch = input.expectedYear === undefined
        || new RegExp(`(?:^|\\D)${input.expectedYear}(?:\\D|$)`).test(frontText);
      return distance <= 8 && Boolean(authorsMatch) && yearMatch;
    }));
  const arxivId = doi?.match(/^10\.48550\/arxiv\.((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7}))$/i)?.[1];
  const escapedArxivId = arxivId?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const arxivUrlMatches = arxivId && (() => {
    const parsed = new URL(document.resolvedUrl);
    return parsed.hostname === 'arxiv.org'
      && new RegExp(`^/pdf/${escapedArxivId}v?\\d*(?:\\.pdf)?$`, 'i')
        .test(parsed.pathname.replace(/%2f/ig, '/'));
  })();
  const arxivDoiOnFirstPage = doi !== null && arxivId && arxivUrlMatches && 'pages' in document
    && document.pages.some(page => page.page === 1
      && !page.text.toLowerCase().includes(doi)
      && new RegExp(`\\barxiv\\s*:\\s*${escapedArxivId}v?\\d*\\b`, 'i').test(page.text));
  const doiInFrontMatter = doi === null || doiSegments.some(segment => doiAppearsInText(segment.text, doi))
    || arxivDoiOnFirstPage;
  const doiInSelfCitation = !doiInFrontMatter && doi !== null && 'pages' in document
    && document.pages.some(page => page.page === 1 && pdfSelfCitationAfterAbstract(page.text,
      input.expectedTitle, doi, input.expectedAuthors, input.expectedYear));
  const doiFound = doiInFrontMatter || doiInSelfCitation;
  if (!doiFound) {
    return { status: 'partial', identityAllowed: false, reason: 'doi_not_found_in_document', proof,
      titleFound: true, doiFound: false, titleLocators: matchingTitleSegments.map(segment => segment.locator),
      guidance: 'El título coincide, pero no se encontró el DOI esperado en la primera página PDF o en las primeras secciones del documento. Revisa el archivo original antes de asociarlo al registro.' };
  }
  return { status: 'verified', identityAllowed: true, proof,
    titleFound: true, doiFound: doi !== null,
    titleLocators: matchingTitleSegments.map(segment => segment.locator),
    identityBasis: doi === null ? 'title_and_hash'
      : doiInSelfCitation ? 'title_authors_year_self_citation_doi_and_hash'
        : arxivDoiOnFirstPage ? 'title_arxiv_identifier_and_hash' : 'title_doi_and_hash',
    guidance: doiInSelfCitation
      ? 'El DOI aparece en la cita sugerida tras el resumen, vinculada por título, autores y año a la portada. Revisa visualmente esta disposición editorial antes de atribuir una afirmación.'
      : 'La coincidencia de título y DOI es textual en la primera página PDF o en las primeras secciones. Revisa la versión editorial y la página de evidencia antes de citar una afirmación.' };
}


export async function verifyResearchEvidence(
  raw: z.input<typeof evidenceVerificationInput>,
  dependencies: EvidenceDependencies = {},
) {
  const input = evidenceVerificationInput.parse(raw);
  publicHttpsUrl(input.url);
  const readPdf = dependencies.readPdf ?? readResearchPdf;
  const readDocument = dependencies.readDocument ?? readResearchDocument;
  const document = input.page !== undefined
    ? await readPdf({ url: input.url, startPage: input.page, pageCount: 1 })
    : await readDocument({
      url: input.url,
      format: input.format === 'pdf' ? 'auto' : input.format,
      // Include nearby sections so a heading such as "References" and sentence
      // boundaries are not lost merely because the caller selected one section.
      startSection: Math.max(1, input.section! - 20),
      sectionCount: input.section! - Math.max(1, input.section! - 20) + 1,
    });

  const documentSha256 = document.sha256;
  if (input.section !== undefined && 'pages' in document) {
    return {
      status: 'rejected', evidenceAllowed: false, reason: 'pdf_requires_page_locator',
      proof: { requestedUrl: input.url, resolvedUrl: document.resolvedUrl,
        retrievedAt: document.retrievedAt, documentSha256 },
      semanticSupport: 'not_evaluated',
      guidance: 'La URL resolvió a un PDF. Vuelve a verificar indicando page en lugar de section.',
    };
  }
  const source = 'pages' in document
    ? { locatorType: 'page' as const, locator: document.pages[0]?.page ?? input.page!,
      text: document.pages[0]?.text ?? '', truncated: document.pages[0]?.truncated ?? false,
      needsOcr: document.pages[0]?.needsOcr ?? false }
    : { locatorType: 'section' as const,
      locator: document.sections.find(section => section.section === input.section)?.section ?? input.section!,
      heading: document.sections.find(section => section.section === input.section)?.heading ?? null,
      text: (() => { const section = document.sections.find(section => section.section === input.section);
        return section?.heading && !section.text.startsWith(section.heading) ? `${section.heading}\n${section.text}` : section?.text ?? ''; })(),
      truncated: document.sections.find(section => section.section === input.section)?.truncated ?? false,
      needsOcr: false };
  const targetSection = input.section;
  const precedingSections = 'sections' in document && targetSection !== undefined
    ? document.sections.filter(section => section.section < targetSection) : [];

  const proof = {
    requestedUrl: input.url,
    resolvedUrl: document.resolvedUrl,
    retrievedAt: document.retrievedAt,
    documentSha256,
    locatorType: source.locatorType,
    locator: source.locator,
    ...('heading' in source ? { heading: source.heading } : {}),
  };
  if (input.expectedSha256 && input.expectedSha256.toLowerCase() !== documentSha256.toLowerCase()) {
    return { status: 'rejected', evidenceAllowed: false, reason: 'document_hash_mismatch', proof,
      semanticSupport: 'not_evaluated',
      guidance: 'El documento cambió desde la lectura anterior. Vuelve a leerlo y no uses el fragmento anterior.' };
  }
  if (source.locator !== (input.page ?? input.section)) {
    return { status: 'rejected', evidenceAllowed: false, reason: 'locator_mismatch', proof,
      semanticSupport: 'not_evaluated',
      guidance: 'El lector no devolvió la página o sección solicitada. No atribuyas el fragmento a ese localizador.' };
  }
  if (source.needsOcr) {
    return { status: 'rejected', evidenceAllowed: false, reason: 'page_requires_ocr', proof,
      semanticSupport: 'not_evaluated',
      guidance: 'Campus no obtuvo texto verificable de esta página. No inventes ni reconstruyas el fragmento.' };
  }
  if (source.truncated && !normalizedLiteral(source.text).includes(normalizedLiteral(input.excerpt))) {
    return { status: 'inconclusive', evidenceAllowed: false, reason: 'locator_text_truncated', proof,
      semanticSupport: 'not_evaluated', guidance: 'El texto del localizador está truncado; lee el archivo completo antes de descartar o usar la cita.' };
  }

  const normalizedExcerpt = normalizedLiteral(input.excerpt);
  const normalizedSource = normalizedLiteral(source.text);
  const openingWords = input.excerpt.trim().split(/\s+/u).slice(0, 6)
    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const paragraphBoundaryBeforeExcerpt = source.locatorType === 'page'
    && new RegExp(`(?:^|\\n\\s*\\n)\\s*${openingWords}`, 'u').test(source.text);
  const matchAt = normalizedSource.indexOf(normalizedExcerpt);
  if (matchAt < 0 || !hasBoundedLiteral(normalizedSource, normalizedExcerpt)) {
    return { status: 'rejected', evidenceAllowed: false, reason: 'excerpt_not_found_at_locator', proof,
      semanticSupport: 'not_evaluated',
      matchMode: 'unicode_nfc_and_whitespace',
      guidance: 'El fragmento no aparece en la página o sección indicada. Corrige el localizador o descarta la atribución.' };
  }

  let previousPageReferencesHeading = false;
  const precedingPagesInspected: number[] = [];
  const referencesHeadingOnSourcePage = input.page !== undefined
    ? pdfReferencesHeading(source.text) : null;
  const sourcePageQuoteIsInReferences = referencesHeadingOnSourcePage !== null
    && matchAt >= referencesHeadingOnSourcePage.index;
  // Page-boundary and bibliography context affects every evidence receipt. Do
  // this automatically so MCP clients cannot accidentally skip the check.
  if (input.inspectPreviousPage && input.page !== undefined && input.page > 1
    && !sourcePageQuoteIsInReferences) {
    // A references heading can start several pages before the quoted page. Do not
    // approve a quote on a later page merely because the immediately prior page lacks it.
    if (input.page > 21) {
      return { status: 'partial', evidenceAllowed: false, reason: 'preceding_pages_not_fully_checked', proof,
        semanticSupport: 'not_evaluated',
        guidance: 'La cita está después del límite de 20 páginas previas. Revisa el índice o el PDF completo para descartar que pertenezca a la bibliografía.' };
    }
    let previous;
    try {
      previous = await readPdf({ url: input.url, startPage: 1, pageCount: input.page - 1 });
    } catch {
      return { status: 'partial', evidenceAllowed: false, reason: 'previous_page_unavailable', proof,
        semanticSupport: 'not_evaluated', precedingPagesInspected,
        guidance: 'No se pudieron comprobar las páginas anteriores. Revisa el PDF antes de atribuir esta cita.' };
    }
    if (previous.sha256.toLowerCase() !== documentSha256.toLowerCase()) {
      return { status: 'rejected', evidenceAllowed: false, reason: 'document_hash_mismatch', proof,
        semanticSupport: 'not_evaluated', precedingPagesInspected,
        guidance: 'El archivo cambió al revisar las páginas anteriores. Vuelve a leerlo antes de citar.' };
    }
    for (let pageNumber = 1; pageNumber < input.page; pageNumber++) {
      const previousPage = previous.pages.find(page => page.page === pageNumber);
      if (!previousPage || previousPage.truncated || previousPage.needsOcr) {
        return { status: 'partial', evidenceAllowed: false, reason: 'previous_page_unverified', proof,
          semanticSupport: 'not_evaluated', precedingPagesInspected,
          guidance: 'Una página anterior no tiene texto completo verificable. Revisa visualmente si comenzó allí la bibliografía.' };
      }
      precedingPagesInspected.push(pageNumber);
      if (pdfReferencesHeading(previousPage.text) && pdfCaptionAfterReferences(previousPage.text) === null) {
        previousPageReferencesHeading = true;
        break;
      }
    }
  }
  const beforeReferences = source.locatorType === 'page'
    ? pdfTextBeforeReferences(source.text) : source.text;
  const postReferencesCaptionAt = source.locatorType === 'page'
    ? pdfCaptionAfterReferences(source.text) : null;
  const excerptInCaptionAfterReferences = postReferencesCaptionAt !== null
    && matchAt >= normalizedLiteral(source.text.slice(0, postReferencesCaptionAt)).length;
  const precedingReferencesHeading = precedingSections.some(section =>
    documentIsReferencesSection(section.heading ?? null, section.text));
  const precedingWindowIncomplete = input.section !== undefined && input.section > 21;
  const sourceRegion = source.locatorType === 'section' && (documentIsReferencesSection(source.heading ?? null, source.text)
    || precedingReferencesHeading)
    ? 'references'
    : excerptInCaptionAfterReferences ? 'caption_after_references'
      : beforeReferences.length < source.text.length
      && matchAt >= normalizedLiteral(beforeReferences).length ? 'references'
        : previousPageReferencesHeading || precedingWindowIncomplete
          ? 'references_continuation_possible' : 'body_or_unknown';

  const contextText = normalizedLiteral([...precedingSections.map(section =>
    `${section.heading ?? ''}\n${section.text}`), normalizedSource].filter(Boolean).join('\n'));
  const contextMatchAt = contextText.lastIndexOf(normalizedExcerpt);

  const evidenceId = createHash('sha256')
    .update(`${documentSha256}\n${source.locatorType}:${source.locator}\n${normalizedExcerpt}\n${normalizedLiteral(input.claim ?? input.excerpt)}`)
    .digest('hex');
  const exactTextOnly = normalizedLiteral(input.claim ?? input.excerpt) === normalizedExcerpt;
  return {
    status: !input.claim || exactTextOnly ? 'verified' : 'partial',
    evidenceAllowed: true,
    excerptVerified: true,
    claimVerified: false,
    evidenceIntegrity: 'excerpt_found_in_extracted_source',
    evidenceId,
    excerpt: input.excerpt,
    claim: input.claim,
    paragraphBoundaryBeforeExcerpt,
    sectionStartsWithExcerpt: source.locatorType === 'section' && (() => {
      const section = 'sections' in document ? document.sections.find(item => item.section === input.section) : null;
      if (!section) return false;
      const body = normalizedLiteral(section.text);
      const heading = normalizedLiteral(section.heading ?? '');
      return body.startsWith(normalizedExcerpt)
        || !!heading && body.startsWith(`${heading} ${normalizedExcerpt}`);
    })(),
    sourceRegion,
    previousPageInspected: input.inspectPreviousPage && input.page !== undefined && input.page > 1
      && precedingPagesInspected.includes(input.page - 1) ? input.page - 1 : null,
    precedingPagesInspected,
    surroundingText: contextText.slice(Math.max(0, contextMatchAt - 300),
      Math.min(contextText.length, contextMatchAt + normalizedExcerpt.length + 300)),
    precedingSections: precedingSections.map(section => ({ section: section.section,
      heading: section.heading, text: section.text, truncated: section.truncated })),
    precedingSectionsInspected: precedingSections.map(section => section.section),
    precedingSectionsCoverageStart: precedingSections[0]?.section ?? null,
    surroundingTextTruncatedBefore: contextMatchAt > 300,
    surroundingTextTruncatedAfter: contextMatchAt + normalizedExcerpt.length + 300 < contextText.length,
    proof,
    matchMode: 'unicode_nfc_and_whitespace',
    truncatedAtLocator: source.truncated,
    semanticSupport: input.claim && exactTextOnly ? 'exact_text_only' : 'client_assessment_required',
    citationReady: false,
    guidance: [
      'Campus verificó que el fragmento aparece en el texto extraído y que corresponde a esta huella del documento.',
      'El comprobante está vinculado a la afirmación proporcionada, pero Campus no determina si una paráfrasis está respaldada ni si la cita omite contexto decisivo.',
      'citationReady=false hasta comprobar identidad bibliográfica del archivo y evaluar el respaldo semántico de la afirmación.',
      'Conserva evidenceId, URL, SHA-256 y página o sección junto a la afirmación.',
    ],
  };
}
