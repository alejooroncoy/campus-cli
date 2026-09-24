import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { publicHttpsUrl, researchDownload } from './research-http.js';
import { extractPdfIndexBytes, type IndexedPdfPage } from './research-pdf.js';

const MAX_DOCUMENTS = 4;
const MAX_ACTIVE = 2;
const IDLE_MS = 60 * 60 * 1000;

export const pdfIndexInput = z.object({ url: z.string().url().max(4000) });
export const pdfIndexStatusInput = z.object({ documentId: z.string().uuid() });
export const pdfIndexSearchInput = pdfIndexStatusInput.extend({
  query: z.string().trim().min(2).max(500),
  limit: z.number().int().min(1).max(10).default(5),
});
export const pdfIndexReadInput = pdfIndexStatusInput.extend({
  startPage: z.number().int().min(1),
  pageCount: z.number().int().min(1).max(5).default(3),
});

type OutlineEntry = { title: string; page: number; depth: number };
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

  private makeRoom() {
    while (this.records.size >= MAX_DOCUMENTS) {
      const evictable = [...this.records.values()]
        .filter(record => record.status === 'ready' || record.status === 'failed')
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

  private summary(record: IndexRecord) {
    const needsOcrPages = record.pages.filter(page => page.needsOcr).map(page => page.page);
    const truncatedPages = record.pages.filter(page => page.truncated).map(page => page.page);
    return {
      documentId: record.id, status: record.status,
      requestedUrl: record.requestedUrl, resolvedUrl: record.resolvedUrl ?? null,
      retrievedAt: record.retrievedAt ?? null, sha256: record.sha256 ?? null,
      totalPages: record.totalPages, indexedPages: record.indexedPages,
      coverage: record.totalPages === null ? 'unknown' : `${record.indexedPages}/${record.totalPages}`,
      needsOcrPages, truncatedPages, outline: record.outline,
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
      return this.summary(existing);
    }
    this.makeRoom();
    if (this.records.size >= MAX_DOCUMENTS
      || [...this.records.values()].filter(record => record.status === 'downloading' || record.status === 'indexing').length >= MAX_ACTIVE) {
      throw new Error('Los lectores de documentos extensos están ocupados. Intenta de nuevo en unos minutos.');
    }
    const record: IndexRecord = {
      id: randomUUID(), scope, requestedUrl: url, status: 'downloading', totalPages: null,
      indexedPages: 0, pages: [], outline: [], lastAccess: Date.now(),
    };
    this.records.set(record.id, record);
    void this.prepare(record);
    return this.summary(record);
  }

  private async prepare(record: IndexRecord): Promise<void> {
    try {
      const downloaded = await (this.dependencies.download ?? researchDownload)(record.requestedUrl,
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
    const { documentId } = pdfIndexStatusInput.parse(raw);
    return this.summary(this.find(scope, documentId));
  }

  search(scope: string, raw: z.input<typeof pdfIndexSearchInput>) {
    const input = pdfIndexSearchInput.parse(raw);
    const record = this.find(scope, input.documentId);
    if (record.status !== 'ready') return { ...this.summary(record), matches: [] };
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
    return { ...this.summary(record), query: input.query, matches,
      matchMeaning: 'Coincidencia léxica aproximada; no demuestra que la página respalde una afirmación.' };
  }

  read(scope: string, raw: z.input<typeof pdfIndexReadInput>) {
    const input = pdfIndexReadInput.parse(raw);
    const record = this.find(scope, input.documentId);
    if (record.status !== 'ready') return { ...this.summary(record), pages: [] };
    if (input.startPage > record.totalPages!) throw new Error('La página inicial supera el documento.');
    const pages = record.pages.slice(input.startPage - 1, input.startPage - 1 + input.pageCount);
    return { ...this.summary(record), pages,
      nextPage: pages.at(-1)!.page < record.totalPages! ? pages.at(-1)!.page + 1 : null };
  }
}

export const researchPdfIndex = new ResearchPdfIndex();
