import { z } from 'zod';
import { ResearchService, citationVerificationInput } from './research-service.js';
import { verifyResearchDocumentIdentity, verifyResearchEvidence } from './research-evidence.js';
import { publicHttpsUrl } from './research-http.js';

export const quoteVerificationInput = z.object({
  doi: citationVerificationInput.shape.doi,
  expectedTitle: citationVerificationInput.shape.expectedTitle,
  expectedAuthors: citationVerificationInput.shape.expectedAuthors,
  expectedYear: citationVerificationInput.shape.expectedYear,
  url: z.string().url().max(4000),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  format: z.enum(['pdf', 'html', 'text', 'markdown', 'xml', 'jats', 'docx', 'epub']).default('pdf'),
  page: z.number().int().min(1).optional(),
  section: z.number().int().min(1).optional(),
  quote: z.string().trim().min(10).max(4000),
}).superRefine((input, context) => {
  const isPdf = input.format === 'pdf';
  if (isPdf && (input.page === undefined || input.section !== undefined)) {
    context.addIssue({ code: 'custom', message: 'format=pdf requiere page y no acepta section.' });
  }
  if (!isPdf && (input.section === undefined || input.page !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Los documentos requieren format y section, no page.' });
  }
});

type QuoteDependencies = {
  service?: ResearchService;
  verifyIdentity?: typeof verifyResearchDocumentIdentity;
  verifyEvidence?: typeof verifyResearchEvidence;
};

function normalizedQuote(value: string): string {
  return value.normalize('NFKC').replace(/\r/g, '').replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?،؛。！？])/gu, '$1').trim();
}

function endsSentence(value: string): boolean {
  return /\p{Sentence_Terminal}$/u.test(value);
}

function endsWithAbbreviation(value: string): boolean {
  return /(?:^|\s)(?:dr|dra|mr|mrs|ms|mme|mlle|dña|doña|prof|sr|sra|srta|fig|vol|no|núm|num|etc|vs|cf|pp?|et\s+al|jr|st|inc|ltd|corp|dept|approx|eq|sec|ch|chap|ref|tab|ph\.d|m\.d|b\.a|m\.a|b\.s|m\.s)\.$/i.test(value)
    || /(?:^|\s)(?:e\.g|i\.e|p\.ej|u\.s)\.$/i.test(value)
    // An uppercase initialism such as U.K. may end inside a sentence. Keep the
    // quotation unapproved unless its full sentence includes that context.
    || /(?:^|\s)(?:[A-Z]\.){2,}$/u.test(value)
    || /(?:^|\s)[A-Z]\.$/u.test(value);
}

function isStructuralSectionHeading(value: string | null | undefined): boolean {
  if (!value) return false;
  const heading = value.normalize('NFKC').trim().replace(/^\d+(?:\.\d+)*[.)]?\s*/, '')
    .replace(/:$/, '').trim().toLocaleLowerCase();
  return /^(?:abstract|resumen|summary|introduction|introducci[oó]n|background|antecedentes|literature review|revisi[oó]n de literatura|related work|trabajos relacionados|materials and methods|methods|methodology|m[eé]todos|metodolog[ií]a|results|resultados|findings|hallazgos|discussion|discusi[oó]n|conclusion|conclusions|conclusi[oó]n|conclusiones|limitations|limitaciones|future work|trabajo futuro|data availability|disponibilidad de datos|acknowledg(?:e)?ments|agradecimientos|keywords|palabras clave|references|referencias|bibliography|bibliograf[ií]a)$/u.test(heading);
}

function completeSentenceInContext(quote: string, surroundingText: string): boolean {
  const text = normalizedQuote(surroundingText);
  const exact = normalizedQuote(quote);
  const at = text.indexOf(exact);
  if (at < 0 || !endsSentence(exact)) return false;
  if (endsWithAbbreviation(exact)) return false;
  const before = text.slice(0, at).trimEnd();
  const after = text.slice(at + exact.length);
  // A matching prefix of an ellipsis or another token is not a complete sentence.
  if (after && !/^[\s”’"'»）\)\]]/.test(after)) return false;
  // A quote beginning after "Dr." or "et al." starts inside that sentence.
  if (endsWithAbbreviation(before)) return false;
  return !before || endsSentence(before)
    || /\b(?:abstract|resumen|summary|introduction|introducci[oó]n)\s*:?$/i.test(before);
}

function startsAfterVerifiedFirstPageAuthorBlock(quote: string, surroundingText: string,
  title: string, authors: string[]): boolean {
  const text = normalizedQuote(surroundingText);
  const exact = normalizedQuote(quote);
  const at = text.indexOf(exact);
  const lastAuthor = authors.at(-1);
  if (at < 0 || !lastAuthor) return false;
  const before = text.slice(0, at).trimEnd();
  return before.includes(normalizedQuote(title)) && before.endsWith(normalizedQuote(lastAuthor));
}

function startsAfterVerifiedDocumentFrontMatter(quote: string, evidence: any,
  title: string, doi: string, authors: string[], year: number | null) {
  if (!evidence.sectionStartsWithExcerpt || !Array.isArray(evidence.precedingSections)
    || evidence.precedingSections.length === 0 || !endsSentence(normalizedQuote(quote))
    || endsWithAbbreviation(normalizedQuote(quote))) return false;
  const frontMatter = normalizedQuote(evidence.precedingSections.map((section: any) =>
    `${section.heading ?? ''} ${section.text}`).join(' ')).toLocaleLowerCase();
  const lastPriorSection = normalizedQuote(evidence.precedingSections.at(-1)?.text ?? '').toLocaleLowerCase();
  const expectedDoi = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').toLocaleLowerCase();
  const escapedDoi = expectedDoi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const doiOnlyBoundary = new RegExp(`^(?:(?:doi)\\s*:\\s*)?(?:https?:\\/\\/(?:dx\\.)?doi\\.org\\/)?${escapedDoi}[.)]?\\s*$`, 'i')
    .test(lastPriorSection);
  return frontMatter.includes(normalizedQuote(title).toLocaleLowerCase())
    && frontMatter.includes(expectedDoi)
    && authors.every(author => frontMatter.includes(normalizedQuote(author).toLocaleLowerCase()))
    && doiOnlyBoundary
    && (year === null || new RegExp(`(?:^|\\D)${year}(?:\\D|$)`).test(frontMatter));
}

/** A single fail-closed receipt for a direct quotation, not for a paraphrase or scientific inference. */
export async function verifyResearchQuote(raw: z.input<typeof quoteVerificationInput>,
  dependencies: QuoteDependencies = {}) {
  const input = quoteVerificationInput.parse(raw);
  publicHttpsUrl(input.url);
  const service = dependencies.service ?? new ResearchService();
  const bibliography = await service.verifyCitation({ doi: input.doi,
    expectedTitle: input.expectedTitle, expectedAuthors: input.expectedAuthors,
    expectedYear: input.expectedYear });
  if (!bibliography.citeAllowed || !bibliography.citationRecord) {
    return { status: 'rejected', verbatimCitationAllowed: false, stage: 'bibliography',
      reason: bibliography.status, bibliography };
  }
  const identity = await (dependencies.verifyIdentity ?? verifyResearchDocumentIdentity)({
    url: input.url, format: input.format, expectedSha256: input.expectedSha256,
    expectedTitle: bibliography.citationRecord.title!, expectedDoi: bibliography.citationRecord.doi,
    ...(bibliography.citationRecord.authors.map(author => author.name).length >= 2 && bibliography.citationRecord.authors.map(author => author.name).length <= 4
      ? { expectedAuthors: bibliography.citationRecord.authors.map(author => author.name) } : {}),
    ...(bibliography.citationRecord.year !== null
      ? { expectedYear: bibliography.citationRecord.year } : {}),
  });
  if (!identity.identityAllowed) {
    return { status: 'rejected', verbatimCitationAllowed: false, stage: 'document_identity',
      reason: identity.reason, bibliography, identity };
  }
  const evidence = await (dependencies.verifyEvidence ?? verifyResearchEvidence)({
    url: input.url, format: input.format,
    ...(input.page === undefined ? { section: input.section } : { page: input.page }),
    expectedSha256: input.expectedSha256,
    excerpt: input.quote, claim: input.quote, inspectPreviousPage: input.page !== undefined,
  });
  if (!evidence.evidenceAllowed) {
    return { status: 'rejected', verbatimCitationAllowed: false, stage: 'quote',
      reason: evidence.reason, bibliography, identity, evidence };
  }
  if (evidence.sourceRegion === 'references') {
    return { status: 'partial', verbatimCitationAllowed: false, stage: 'context',
      reason: 'quote_in_references', bibliography, identity, evidence,
      guidance: 'La oración aparece en la sección de referencias de esa página. No la atribuyas como resultado o argumento del artículo sin revisar la fuente original.' };
  }
  if (evidence.sourceRegion === 'references_continuation_possible') {
    return { status: 'partial', verbatimCitationAllowed: false, stage: 'context',
      reason: 'quote_may_continue_references', bibliography, identity, evidence,
      guidance: 'Las referencias empezaron en la página anterior. Comprueba visualmente esta oración y la fuente original antes de atribuirla al artículo.' };
  }
  if (evidence.truncatedAtLocator) {
    return { status: 'partial', verbatimCitationAllowed: false, stage: 'context',
      reason: 'page_text_truncated', bibliography, identity, evidence,
      guidance: 'La página tiene texto omitido por el límite de extracción. Revisa el PDF completo antes de aprobar la cita.' };
  }
  if (input.page !== undefined && input.page > 1
    && normalizedQuote(evidence.surroundingText ?? '').startsWith(normalizedQuote(input.quote))) {
    return { status: 'partial', verbatimCitationAllowed: false, stage: 'context',
      reason: 'page_boundary_context_unverified', bibliography, identity, evidence,
      guidance: 'La cita comienza al inicio de una página posterior a la primera. Revisa la página anterior para confirmar que la oración no empezó allí.' };
  }
  const evidenceHeading = 'heading' in evidence.proof ? evidence.proof.heading : null;
  const verifiedFrontMatterBoundary = startsAfterVerifiedDocumentFrontMatter(input.quote, evidence,
    bibliography.citationRecord.title!, bibliography.citationRecord.doi,
    bibliography.citationRecord.authors.map(author => author.name), bibliography.citationRecord.year);
  if (input.section !== undefined && input.section > 1
    && evidence.sectionStartsWithExcerpt && !verifiedFrontMatterBoundary
    && !isStructuralSectionHeading(evidenceHeading)) {
    return { status: 'partial', verbatimCitationAllowed: false, stage: 'context',
      reason: 'section_boundary_context_unverified', bibliography, identity, evidence,
      guidance: 'La cita empieza al inicio de una sección sin encabezado. Comprueba la sección anterior para confirmar que la oración no comenzó antes del corte.' };
  }
  const sentenceBoundaryConfirmed = completeSentenceInContext(input.quote, evidence.surroundingText ?? '')
    || (evidence.paragraphBoundaryBeforeExcerpt && endsSentence(normalizedQuote(input.quote))
      && !endsWithAbbreviation(normalizedQuote(input.quote)))
    || verifiedFrontMatterBoundary
    || (input.section !== undefined && evidence.sectionStartsWithExcerpt
      && isStructuralSectionHeading(evidenceHeading) && endsSentence(normalizedQuote(input.quote))
      && !endsWithAbbreviation(normalizedQuote(input.quote)))
    || (input.page === 1 && startsAfterVerifiedFirstPageAuthorBlock(input.quote,
      evidence.surroundingText ?? '', bibliography.citationRecord.title!,
      bibliography.citationRecord.authors.map(author => author.name)));
  if (!sentenceBoundaryConfirmed) {
    return { status: 'partial', verbatimCitationAllowed: false, stage: 'context',
      reason: 'quote_not_full_sentence', bibliography, identity, evidence,
      guidance: 'El texto existe, pero es un fragmento de una oración o no se pudo confirmar el límite de la oración. Revisa la oración completa antes de citar.' };
  }
  return { status: 'verified', verbatimCitationAllowed: true,
    scope: input.format === 'pdf' ? 'complete_sentence_direct_quotation_text_only'
      : 'complete_sentence_direct_quotation_document_section',
    requestedUrl: input.url, resolvedUrl: evidence.proof.resolvedUrl,
    documentSha256: evidence.proof.documentSha256,
    bibliography, identity, evidence,
    guidance: 'El texto citado aparece en la página del mismo archivo asociado al DOI. Revisa el contexto, la numeración impresa y la versión editorial; no reutilices el comprobante para una paráfrasis o conclusión diferente.' };
}
