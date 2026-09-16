import { createHash } from 'node:crypto';
import { z } from 'zod';
import { documentFormat, readResearchDocument } from './research-document.js';
import { readResearchPdf } from './research-pdf.js';

const evidenceFormat = z.enum(['auto', 'pdf', ...documentFormat.options.filter(format => format !== 'auto')]);

export const evidenceVerificationInput = z.object({
  url: z.string().url().max(4000),
  excerpt: z.string().trim().min(10).max(4000)
    .describe('Fragmento atribuido a la fuente. Campus comprueba que aparezca en el texto extraído de la página o sección indicada.'),
  format: evidenceFormat.default('auto'),
  page: z.number().int().min(1).optional()
    .describe('Página PDF exacta donde el cliente encontró el fragmento.'),
  section: z.number().int().min(1).optional()
    .describe('Número de sección exacto devuelto por campus_research_read_document.'),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional()
    .describe('SHA-256 devuelto por la lectura anterior. Si el documento cambió, la evidencia se rechaza.'),
}).superRefine((input, context) => {
  if ((input.page === undefined) === (input.section === undefined)) {
    context.addIssue({ code: 'custom', message: 'Indica exactamente page o section.' });
  }
  if (input.page !== undefined && input.format !== 'auto' && input.format !== 'pdf') {
    context.addIssue({ code: 'custom', message: 'page requiere format=pdf o auto.' });
  }
  if (input.section !== undefined && input.format === 'pdf') {
    context.addIssue({ code: 'custom', message: 'format=pdf requiere page.' });
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
  return /^[\s]*[-−–—+×*/<>≤≥±≈~^⁺⁻]/u.test(value)
    || /^[\s]*(?:%|‰|°(?:[CFK])?)/u.test(value)
    || /^[\s]*(?:kg|g|mg|µg|lb|oz|km|m|cm|mm|mi|ft|in|ms|s|min|h|Hz|kHz|MHz|GHz)\b/iu.test(value);
}

function endsWithNumericExpression(value: string): boolean {
  return /\p{N}\s*(?:[\p{L}\p{M}µμ]{1,6}|[%‰°](?:[CFK])?)?\s*$/u.test(value);
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
      && /(?:^|\s)(?:no|not)\s*$/iu.test(beforeCharacters.slice(0, prefixIndex + 1).join(''));
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

export async function verifyResearchEvidence(
  raw: z.input<typeof evidenceVerificationInput>,
  dependencies: EvidenceDependencies = {},
) {
  const input = evidenceVerificationInput.parse(raw);
  const readPdf = dependencies.readPdf ?? readResearchPdf;
  const readDocument = dependencies.readDocument ?? readResearchDocument;
  const document = input.page !== undefined
    ? await readPdf({ url: input.url, startPage: input.page, pageCount: 1 })
    : await readDocument({
      url: input.url,
      format: input.format === 'pdf' ? 'auto' : input.format,
      startSection: input.section!,
      sectionCount: 1,
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
    : { locatorType: 'section' as const, locator: document.sections[0]?.section ?? input.section!,
      heading: document.sections[0]?.heading ?? null, text: document.sections[0]?.text ?? '',
      truncated: document.sections[0]?.truncated ?? false, needsOcr: false };

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
  if (source.needsOcr) {
    return { status: 'rejected', evidenceAllowed: false, reason: 'page_requires_ocr', proof,
      semanticSupport: 'not_evaluated',
      guidance: 'Campus no obtuvo texto verificable de esta página. No inventes ni reconstruyas el fragmento.' };
  }

  const normalizedExcerpt = normalizedLiteral(input.excerpt);
  const textAtLocator = 'heading' in source && source.heading
    ? `${source.heading}\n${source.text}` : source.text;
  const found = hasBoundedLiteral(normalizedLiteral(textAtLocator), normalizedExcerpt);
  if (!found) {
    if (source.truncated) {
      return { status: 'inconclusive', evidenceAllowed: false, reason: 'locator_text_truncated', proof,
        semanticSupport: 'not_evaluated',
        matchMode: 'unicode_nfc_and_whitespace',
        guidance: 'El texto extraído de esta página o sección fue truncado. Campus no puede confirmar ni descartar el fragmento; vuelve a leerlo con una extracción completa o verifícalo en el recurso original.' };
    }
    return { status: 'rejected', evidenceAllowed: false, reason: 'excerpt_not_found_at_locator', proof,
      semanticSupport: 'not_evaluated',
      matchMode: 'unicode_nfc_and_whitespace',
      guidance: 'El fragmento no aparece en la página o sección indicada. Corrige el localizador o descarta la atribución.' };
  }

  const evidenceId = createHash('sha256')
    .update(`${documentSha256}\n${source.locatorType}:${source.locator}\n${normalizedExcerpt}`)
    .digest('hex');
  return {
    status: 'verified',
    evidenceAllowed: true,
    evidenceIntegrity: 'excerpt_found_in_extracted_source',
    evidenceId,
    excerpt: input.excerpt,
    proof,
    matchMode: 'unicode_nfc_and_whitespace',
    truncatedAtLocator: source.truncated,
    semanticSupport: 'client_assessment_required',
    guidance: [
      'Campus verificó que el fragmento aparece en el texto extraído y que corresponde a esta huella del documento.',
      'La IA cliente debe decidir si el fragmento respalda total o parcialmente su afirmación; esta herramienta no evalúa inferencias ni validez científica.',
      'Conserva evidenceId, URL, SHA-256 y página o sección junto a la afirmación.',
    ],
  };
}
