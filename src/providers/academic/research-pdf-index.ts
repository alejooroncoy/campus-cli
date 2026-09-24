import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { publicHttpsUrl, researchDownload } from './research-http.js';
import { officialResearchPdf } from './research-official-sources.js';
import { extractPdfIndexBytes, type IndexedPdfPage } from './research-pdf.js';
import { evidenceVerificationInput, verifyResearchEvidence } from './research-evidence.js';

const MAX_DOCUMENTS = 8;
const MAX_DOCUMENTS_PER_SCOPE = 2;
const MAX_ACTIVE = 2;
const IDLE_MS = 60 * 60 * 1000;

export const pdfIndexInput = z.object({ url: z.string().url().max(4000) });
export const pdfIndexStatusInput = z.object({ documentId: z.string().uuid(),
  analysisId: z.string().uuid().optional() });
export const pdfIndexSearchInput = pdfIndexStatusInput.extend({
  query: z.string().trim().min(2).max(500),
  limit: z.number().int().min(1).max(10).default(5),
});
export const pdfIndexReadInput = pdfIndexStatusInput.extend({
  startPage: z.number().int().min(1),
  pageCount: z.number().int().min(1).max(5).default(3),
});
export const pdfIndexQuotesInput = z.object({
  documentId: z.string().uuid(),
  analysisId: z.string().uuid(),
  url: z.string().url().max(4000),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  citations: z.array(z.object({
    page: z.number().int().min(1),
    excerpt: z.string().trim().min(10).max(1000),
  })).min(1).max(8),
});

type OutlineEntry = { title: string; page: number; depth: number };
type EvidenceLedger = { readPages: Set<number>; verifiedEvidence: Array<{ page: number; evidenceId: string }> };
type IndexRecord = {
  id: string;
  scope: string;
  requestedUrl: string;
  resolvedUrl?: string;
  sha256?: string;
  retrievedAt?: string;
  status: 'downloading' | 'indexing' | 'ready' | 'failed';
  totalPages: number | null;
  indexedPages: number;
  pages: IndexedPdfPage[];
  readPages: Set<number>;
  verifiedEvidence: Array<{ page: number; evidenceId: string }>;
  analyses: Map<string, EvidenceLedger>;
  outline: OutlineEntry[];
  error?: string;
  lastAccess: number;
};

export type PdfIndexDependencies = {
  download?: typeof researchDownload;
  extract?: typeof extractPdfIndexBytes;
};

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const STOP_WORDS = new Set('de la el los las un una unos unas y o en con por para que del al se su sus es fue son the a an and or of to in for is are was were by with on'.split(' '));

export class ResearchPdfIndex {
  private readonly records = new Map<string, IndexRecord>();

  constructor(private readonly dependencies: PdfIndexDependencies = {}) {}

  private prune() {
    const now = Date.now();
    for (const [id, record] of this.records) {
      if ((record.status === 'ready' || record.status === 'failed') && now - record.lastAccess > IDLE_MS) {
        this.records.delete(id);
      }
    }
  }

  private makeRoom(scope: string) {
    while (this.records.size >= MAX_DOCUMENTS
      || [...this.records.values()].filter(record => record.scope === scope).length >= MAX_DOCUMENTS_PER_SCOPE) {
      const evictable = [...this.records.values()]
        .filter(record => record.scope === scope && (record.status === 'ready' || record.status === 'failed'))
        .sort((a, b) => a.lastAccess - b.lastAccess)[0];
      if (!evictable) break;
      this.records.delete(evictable.id);
    }
  }

  private find(scope: string, documentId: string): IndexRecord {
    const input = pdfIndexStatusInput.parse({ documentId });
    this.prune();
    const record = this.records.get(input.documentId);
    if (!record || record.scope !== scope) {
      throw new Error('El índice no está disponible en este proceso o expiró. Vuelve a iniciar su preparación.');
    }
    record.lastAccess = Date.now();
    return record;
  }

  private analysis(record: IndexRecord, analysisId?: string): EvidenceLedger {
    if (!analysisId) return record;
    const ledger = record.analyses.get(analysisId);
    if (!ledger) throw new Error('El analysisId no está disponible para este índice. Inicia un nuevo análisis.');
    return ledger;
  }

  private newAnalysis(record: IndexRecord): string {
    const analysisId = randomUUID();
    record.analyses.set(analysisId, { readPages: new Set(), verifiedEvidence: [] });
    if (record.analyses.size > 32) record.analyses.delete(record.analyses.keys().next().value!);
    return analysisId;
  }

  private summary(record: IndexRecord, analysisId?: string) {
    const ledger = this.analysis(record, analysisId);
    const needsOcrPages = record.pages.filter(page => page.needsOcr).map(page => page.page);
    const truncatedPages = record.pages.filter(page => page.truncated).map(page => page.page);
    return {
      documentId: record.id, status: record.status,
      requestedUrl: record.requestedUrl, resolvedUrl: record.resolvedUrl ?? null,
      retrievedAt: record.retrievedAt ?? null, sha256: record.sha256 ?? null,
      totalPages: record.totalPages, indexedPages: record.indexedPages,
      coverage: record.totalPages === null ? 'unknown' : `${record.indexedPages}/${record.totalPages}`,
      needsOcrPages, truncatedPages, outline: record.outline,
      ...(analysisId ? { analysisId } : {}),
      ledgerScope: analysisId ? 'analysis' : 'document_lifetime',
      readPages: [...ledger.readPages].sort((a, b) => a - b),
      verifiedEvidence: ledger.verifiedEvidence,
      ...(record.error ? { error: record.error } : {}),
      guidance: record.status === 'ready'
        ? 'El índice localiza páginas, pero no interpreta resultados. Lee las páginas originales y verifica los fragmentos antes de citar; OCR, tablas, fórmulas e imágenes requieren revisión adicional.'
        : 'Consulta de nuevo el estado con documentId. Solo las páginas indexedPages se han extraído; no afirmes cobertura completa todavía.',
    };
  }

  start(scope: string, raw: z.input<typeof pdfIndexInput>) {
    const { url } = pdfIndexInput.parse(raw);
    publicHttpsUrl(url);
    this.prune();
    const existing = [...this.records.values()].find(record => record.scope === scope
      && record.requestedUrl === url && record.status !== 'failed');
    if (existing) {
      existing.lastAccess = Date.now();
      return this.summary(existing, this.newAnalysis(existing));
    }
    this.makeRoom(scope);
    if (this.records.size >= MAX_DOCUMENTS
      || [...this.records.values()].filter(record => record.status === 'downloading' || record.status === 'indexing').length >= MAX_ACTIVE) {
      throw new Error('Los lectores de documentos extensos están ocupados. Intenta de nuevo en unos minutos.');
    }
    const record: IndexRecord = {
      id: randomUUID(), scope, requestedUrl: url, status: 'downloading', totalPages: null,
      indexedPages: 0, pages: [], readPages: new Set(), verifiedEvidence: [], analyses: new Map(),
      outline: [], lastAccess: Date.now(),
    };
    this.records.set(record.id, record);
    void this.prepare(record);
    return this.summary(record, this.newAnalysis(record));
  }

  private async prepare(record: IndexRecord): Promise<void> {
    try {
      const downloaded = await (this.dependencies.download ?? researchDownload)(officialResearchPdf(record.requestedUrl) ?? record.requestedUrl,
        { maxBytes: 20 * 1024 * 1024, redirects: 4 });
      record.resolvedUrl = downloaded.url;
      record.retrievedAt = new Date().toISOString();
      record.sha256 = createHash('sha256').update(downloaded.bytes).digest('hex');
      record.status = 'indexing';
      await (this.dependencies.extract ?? extractPdfIndexBytes)(downloaded.bytes, event => {
        if (event.metadata) {
          record.totalPages = event.metadata.totalPages;
          record.outline = event.metadata.outline;
        }
        if (event.batch) {
          record.pages.push(...event.batch);
          record.indexedPages = record.pages.length;
        }
      });
      if (!record.totalPages || record.indexedPages !== record.totalPages) {
        throw new Error('El índice terminó sin cubrir todas las páginas del PDF.');
      }
      record.status = 'ready';
    } catch (error) {
      record.status = 'failed';
      record.pages = [];
      record.indexedPages = 0;
      record.error = error instanceof Error ? error.message : 'No se pudo preparar el índice PDF.';
    }
  }

  status(scope: string, raw: z.input<typeof pdfIndexStatusInput>) {
    const { documentId, analysisId } = pdfIndexStatusInput.parse(raw);
    return this.summary(this.find(scope, documentId), analysisId);
  }

  search(scope: string, raw: z.input<typeof pdfIndexSearchInput>) {
    const input = pdfIndexSearchInput.parse(raw);
    const record = this.find(scope, input.documentId);
    if (record.status !== 'ready') return { ...this.summary(record, input.analysisId), matches: [] };
    const query = normalize(input.query);
    const terms = [...new Set(query.match(/[\p{L}\p{N}]{2,}/gu)?.filter(term => !STOP_WORDS.has(term)) ?? [])];
    if (!terms.length) throw new Error('La búsqueda necesita palabras significativas.');
    const matches = record.pages.map(page => {
      if (page.needsOcr) return null;
      const haystack = normalize(page.text);
      let score = 0;
      let first = -1;
      for (const term of terms) {
        let pos = haystack.indexOf(term);
        let occurrences = 0;
        if (pos >= 0 && first < 0) first = pos;
        while (pos >= 0 && occurrences < 20) {
          occurrences++;
          pos = haystack.indexOf(term, pos + term.length);
        }
        score += occurrences;
      }
      if (!score) return null;
      if (haystack.includes(query)) score += 8;
      if (terms.every(term => haystack.includes(term))) score += 5;
      const start = Math.max(0, first - 180);
      const snippet = page.text.slice(start, Math.min(page.text.length, start + 650));
      return { page: page.page, score, snippet, truncated: page.truncated };
    }).filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((a, b) => b.score - a.score || a.page - b.page)
      .slice(0, input.limit);
    return { ...this.summary(record, input.analysisId), query: input.query, matches,
      matchMeaning: 'Coincidencia léxica aproximada; no demuestra que la página respalde una afirmación.' };
  }

  read(scope: string, raw: z.input<typeof pdfIndexReadInput>) {
    const input = pdfIndexReadInput.parse(raw);
    const record = this.find(scope, input.documentId);
    if (record.status !== 'ready') return { ...this.summary(record, input.analysisId), pages: [] };
    if (input.startPage > record.totalPages!) throw new Error('La página inicial supera el documento.');
    const pages = record.pages.slice(input.startPage - 1, input.startPage - 1 + input.pageCount);
    const ledger = this.analysis(record, input.analysisId);
    for (const page of pages) {
      record.readPages.add(page.page);
      ledger.readPages.add(page.page);
    }
    return { ...this.summary(record, input.analysisId), pages,
      nextPage: pages.at(-1)!.page < record.totalPages! ? pages.at(-1)!.page + 1 : null };
  }

  async verify(scope: string, raw: z.input<typeof evidenceVerificationInput>) {
    const input = evidenceVerificationInput.parse(raw);
    if (!input.documentId || input.page === undefined) throw new Error('Indica documentId y page para verificar desde el índice.');
    const record = this.find(scope, input.documentId);
    const ledger = this.analysis(record, input.analysisId);
    if (record.status !== 'ready') throw new Error('El índice PDF aún no está listo para verificar citas.');
    if (input.url !== record.requestedUrl) throw new Error('La URL no corresponde al documentId de este índice.');
    if (input.page > record.totalPages!) throw new Error('La página indicada supera el documento.');
    const page = record.pages[input.page - 1]!;
    const { documentId: _documentId, analysisId: _analysisId, ...verification } = input;
    const result = await verifyResearchEvidence(verification, {
      readPdf: async () => ({
        requestedUrl: record.requestedUrl,
        resolvedUrl: record.resolvedUrl!,
        retrievedAt: record.retrievedAt!,
        sha256: record.sha256!,
        totalPages: record.totalPages!,
        pages: [page],
        nextPage: page.page < record.totalPages! ? page.page + 1 : null,
        guidance: [],
      }),
    });
    if (result.status === 'verified' && result.evidenceId
      && !record.verifiedEvidence.some(item => item.evidenceId === result.evidenceId)) {
      record.verifiedEvidence.push({ page: input.page, evidenceId: result.evidenceId });
      if (record.verifiedEvidence.length > 100) record.verifiedEvidence.shift();
    }
    if (result.status === 'verified' && result.evidenceId
      && !ledger.verifiedEvidence.some(item => item.evidenceId === result.evidenceId)) {
      ledger.verifiedEvidence.push({ page: input.page, evidenceId: result.evidenceId });
      if (ledger.verifiedEvidence.length > 100) ledger.verifiedEvidence.shift();
    }
    return { ...result, verificationSource: 'prepared_pdf_index', documentId: record.id,
      ...(input.analysisId ? { analysisId: input.analysisId } : {}) };
  }

  async verifyQuotes(scope: string, raw: z.input<typeof pdfIndexQuotesInput>) {
    const input = pdfIndexQuotesInput.parse(raw);
    const record = this.find(scope, input.documentId);
    this.analysis(record, input.analysisId);
    if (record.status !== 'ready') throw new Error('El índice PDF aún no está listo para verificar citas.');
    if (input.url !== record.requestedUrl) throw new Error('La URL no corresponde al documentId de este índice.');
    const results = [];
    for (const citation of input.citations) {
      if (citation.page > record.totalPages!) {
        results.push({ page: citation.page, excerpt: citation.excerpt,
          status: 'rejected', evidenceAllowed: false, reason: 'page_out_of_range' });
        continue;
      }
      const result = await this.verify(scope, { documentId: input.documentId,
        analysisId: input.analysisId, url: input.url, expectedSha256: input.expectedSha256,
        page: citation.page, excerpt: citation.excerpt });
      results.push({ page: citation.page, excerpt: citation.excerpt,
        status: result.status, evidenceAllowed: result.evidenceAllowed,
        ...('evidenceId' in result ? { evidenceId: result.evidenceId } : {}),
        ...('reason' in result ? { reason: result.reason } : {}) });
    }
    return { documentId: input.documentId, analysisId: input.analysisId,
      documentSha256: record.sha256,
      allExcerptsLocated: results.every(result => result.status === 'verified'),
      results, readPages: this.summary(record, input.analysisId).readPages,
      semanticSupport: 'client_assessment_required',
      guidance: 'Solo los fragmentos con status=verified aparecieron en las páginas indicadas. Eso no demuestra que respalden la afirmación ni autoriza ampliar una cita más allá del fragmento verificado.',
    };
  }
}

export const researchPdfIndex = new ResearchPdfIndex();
