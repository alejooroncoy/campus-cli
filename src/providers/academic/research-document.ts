import { createHash, randomUUID } from 'node:crypto';
import { decodeHTML } from 'entities';
import { unzipSync } from 'fflate';
import { z } from 'zod';
import { researchDownload, ResearchHttpError } from './research-http.js';
import { readResearchPdfBytes } from './research-pdf.js';
import { officialResearchAlternate, officialResearchPdf } from './research-official-sources.js';
import { resolveResearchHtmlPdf, type NavigatedResearchDownload } from './research-html.js';

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 200;
const MAX_ARCHIVE_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_DOCUMENT_SECTIONS = 50_000;

export const documentFormat = z.enum(['auto', 'html', 'text', 'markdown', 'xml', 'jats', 'docx', 'epub', 'csv', 'xlsx']);
export const documentInput = z.object({
  url: z.string().url().max(4000),
  format: documentFormat.default('auto').describe('Use auto to detect PDF, HTML, text, XML, CSV and supported DOCX, EPUB or XLSX containers from their contents. Archive format hints never override the detected document type.'),
  startSection: z.number().int().min(1).default(1),
  sectionCount: z.number().int().min(1).max(20).default(8),
});

type Section = { section: number; heading: string | null; text: string; truncated: boolean };
type TextDocument = { format: Exclude<z.infer<typeof documentFormat>, 'auto'>; totalSections: number;
  sections: Section[]; nextSection: number | null;
  textCoverage: 'complete' | 'first_100000_characters_only' };

function decodeEntities(value: string): string {
  return decodeHTML(value).replace(/\u00a0/g, ' ');
}

function normalizeText(value: string): string {
  return normalizeWhitespace(decodeEntities(value));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r/g, '').replace(/[\t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractHtmlElement(value: string, tagName: string, matchesOpeningTag: (tag: string) => boolean): string | null {
  const tags = new RegExp(`</${tagName}\\s*>|<${tagName}\\b[^>]*>`, 'gi');
  let opening: RegExpExecArray | null;
  while ((opening = tags.exec(value))) {
    if (opening[0][1] === '/' || !matchesOpeningTag(opening[0])) continue;
    let depth = 1;
    let next: RegExpExecArray | null;
    while ((next = tags.exec(value))) {
      if (next[0][1] === '/') depth--;
      else if (!/\/\s*>$/.test(next[0])) depth++;
      if (depth === 0) return value.slice(opening.index, tags.lastIndex);
    }
    return null;
  }
  return null;
}

function plosArticleText(value: string): string | null {
  const clean = value.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const titleAndAuthors = extractHtmlElement(clean, 'div', tag =>
    /\bclass\s*=\s*["'][^"']*\btitle-authors\b[^"']*["']/i.test(tag));
  const dateAndDoi = extractHtmlElement(clean, 'ul', tag =>
    /\bclass\s*=\s*["'][^"']*\bdate-doi\b[^"']*["']/i.test(tag));
  const articleBody = extractHtmlElement(clean, 'div', tag =>
    /\bid\s*=\s*["']artText["']/i.test(tag));
  return titleAndAuthors && dateAndDoi && articleBody
    ? [titleAndAuthors, dateAndDoi, articleBody].join('\n\n') : null;
}

function htmlText(value: string): string {
  const plos = plosArticleText(value);
  if (plos) return normalizeText(plos.replace(/<\/?(?:article|section|div|p|br|li|h[1-6]|table|tr|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '));
  const main = value.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  const content = main && main.length >= 100 ? main : value;
  const superscriptDigits = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const clean = content.replace(/<!--[\s\S]*?-->/g, '').replace(/<sup\b[^>]*>([0-9]+)<\/sup>/gi, (_match, digits: string) =>
    [...digits].map(digit => superscriptDigits[Number(digit)]).join(''))
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(?:article|section|div|p|br|li|h[1-6]|table|tr|blockquote)\b[^>]*>/gi, '\n');
  return normalizeText(clean.replace(/<[^>]+>/g, ''));
}

function xmlText(value: string): string {
  if (/<PubmedArticle\b/i.test(value)) return pubmedXmlText(value);
  const articleDois = [...value.matchAll(/<article-id\b(?=[^>]*\bpub-id-type=["']doi["'])[^>]*>([\s\S]*?)<\/article-id>/gi)]
    .map(match => normalizeText(match[1]!.replace(/<[^>]+>/g, ' ')))
    .filter(Boolean);
  const cdata: string[] = [];
  const marker = `__CAMPUS_CDATA_${randomUUID()}_`;
  const protectedText = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_match, payload: string) => {
    const index = cdata.push(payload) - 1;
    return `${marker}${index}__`;
  });
  const text = htmlText(protectedText.replace(/<[^>]+(?:\/|)>/g, tag => /<(?:p|title|sec|abstract|body|article-title|chapter)\b/i.test(tag) ? '\n\n' : ' '))
    .replace(new RegExp(`${marker}(\\d+)__`, 'g'), (_match, index: string) => cdata[Number(index)] ?? '');
  const doiMetadata = [...new Set(articleDois)].map(doi => `DOI: ${doi}`).join('\n');
  return doiMetadata ? `${doiMetadata}\n\n${text}` : text;
}

function archiveXmlText(bytes: Uint8Array): string {
  return decodeTextDocument(bytes, 'application/xml');
}

function xmlElementText(value: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}\\s*>`, 'gi');
  return [...value.matchAll(pattern)]
    .map(match => normalizeText(match[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')).filter(Boolean);
}

function xmlElements(value: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}\\s*>`, 'gi');
  return [...value.matchAll(pattern)].map(match => match[0]);
}

/** Keep PubMed citation metadata, abstract and references in separate source regions. */
function pubmedXmlText(value: string): string {
  const records = xmlElements(value, 'PubmedArticle');
  if (records.length !== 1) {
    throw new Error('El XML contiene varios registros PubMed. Lee un PMID por URL para mantener la identidad de la fuente.');
  }
  const record = records[0];
  const article = xmlElements(record, 'Article')[0] ?? record;
  const title = xmlElementText(article, 'ArticleTitle')[0];
  const journal = xmlElementText(article, 'Title')[0];
  const volume = xmlElementText(article, 'Volume')[0];
  const issue = xmlElementText(article, 'Issue')[0];
  const pages = xmlElementText(article, 'MedlinePgn')[0];
  const pubDate = xmlElements(article, 'PubDate')[0] ?? article;
  const year = xmlElementText(pubDate, 'Year')[0]
    ?? /\b(19|20)\d{2}\b/.exec(xmlElementText(pubDate, 'MedlineDate')[0] ?? '')?.[0];
  const articleIds = xmlElements(record, 'ArticleIdList')[0] ?? '';
  const doiBlock = [...articleIds.matchAll(/<ArticleId\b([^>]*)>([\s\S]*?)<\/ArticleId\s*>/gi)]
    .find(match => /\bIdType\s*=\s*["']doi["']/i.test(match[1]));
  const doi = doiBlock ? normalizeText(doiBlock[2].replace(/<[^>]+>/g, ' ')) : null;
  const pmid = xmlElementText(record, 'PMID')[0];
  const authors = xmlElements(xmlElements(article, 'AuthorList')[0] ?? '', 'Author')
    .map(author => {
      const collective = xmlElementText(author, 'CollectiveName')[0];
      const given = xmlElementText(author, 'ForeName')[0] ?? xmlElementText(author, 'Initials')[0];
      const family = xmlElementText(author, 'LastName')[0];
      return collective ?? [given, family].filter(Boolean).join(' ');
    }).filter(Boolean);

  const sections: string[] = [];
  if (title || journal || doi || pmid || authors.length) {
    sections.push(['Bibliographic record', title ? `Title: ${title}` : '',
      authors.length ? `Authors: ${authors.join('; ')}` : '',
      journal ? `Journal: ${journal}${year ? ` (${year})` : ''}${volume ? `; ${volume}` : ''}${issue ? `(${issue})` : ''}${pages ? `:${pages}` : ''}` : '',
      doi ? `DOI: ${doi}` : '', pmid ? `PMID: ${pmid}` : ''].filter(Boolean).join('\n'));
  }

  const abstract = xmlElements(article, 'Abstract')[0];
  if (abstract) {
    const abstractParts = [...abstract.matchAll(/<AbstractText\b([^>]*)>([\s\S]*?)<\/AbstractText\s*>/gi)]
      .map(match => {
        const label = /\bLabel\s*=\s*["']([^"']+)["']/i.exec(match[1])?.[1];
        const text = normalizeText(match[2].replace(/<[^>]+>/g, ' '));
        return text ? `${label ? `${normalizeText(label)}: ` : ''}${text}` : '';
      }).filter(Boolean);
    if (abstractParts.length) sections.push(`Abstract\n${abstractParts.join('\n\n')}`);
  }

  const referenceList = xmlElements(record, 'ReferenceList')[0];
  if (referenceList) {
    const references = xmlElements(referenceList, 'Reference').map(reference => {
      const citation = xmlElementText(reference, 'Citation')[0];
      const ids = [...reference.matchAll(/<ArticleId\b([^>]*)>([\s\S]*?)<\/ArticleId\s*>/gi)]
        .map(match => normalizeText(match[2].replace(/<[^>]+>/g, ' ')));
      return [citation, ...ids].filter(Boolean).join('\n');
    }).filter(Boolean);
    if (references.length) sections.push(`References\n${references.join('\n\n')}`);
  }
  return sections.length ? sections.join('\n\n').trim() : htmlText(value.replace(/<[^>]+(?:\/|)>/g, ' '));
}

function docxText(files: Record<string, Uint8Array>): string {
  const names = ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'].filter(name => files[name]);
  if (!names.includes('word/document.xml')) throw new Error('El DOCX no contiene word/document.xml.');
  return normalizeText(names.map(name => {
    const xml = archiveXmlText(files[name]!).replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/gi, '').replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/gi, '');
    return xml.replace(/<w:p\b[^>]*>/g, '\n\n').replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<w:br\b[^>]*\/>/g, '\n').replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, '$1')
      .replace(/<[^>]+>/g, '');
  }).join('\n\n'));
}

function xmlAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function epubSpineNames(files: Record<string, Uint8Array>): string[] {
  const container = files['META-INF/container.xml'];
  if (!container) return [];
  const containerXml = archiveXmlText(container);
  const rawRootfile = xmlAttribute(containerXml.match(/<(?:[a-z][\w.-]*:)?rootfile\b[^>]*>/i)?.[0] ?? '', 'full-path');
  let rootfile:string|null;
  try { rootfile=rawRootfile?decodeURIComponent(decodeEntities(rawRootfile)).replace(/\\/g,'/'):null; } catch { return []; }
  if (!rootfile || !files[rootfile]) return [];
  const opf = archiveXmlText(files[rootfile]);
  const manifest = new Map<string, { href: string; mediaType: string | null }>();
  for (const tag of opf.match(/<(?:[a-z][\w.-]*:)?item\b[^>]*>/gi) ?? []) {
    const id = xmlAttribute(tag, 'id');
    const href = xmlAttribute(tag, 'href');
    if (id && href) manifest.set(id, { href, mediaType: xmlAttribute(tag, 'media-type') });
  }
  const directory = rootfile.slice(0, rootfile.lastIndexOf('/') + 1);
  return (opf.match(/<(?:[a-z][\w.-]*:)?itemref\b[^>]*>/gi) ?? []).flatMap(tag => {
    const item = manifest.get(xmlAttribute(tag, 'idref') ?? '');
    const href = item?.href;
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return [];
    let relative:string;
    try { relative = decodeURIComponent(decodeEntities(href.split(/[?#]/, 1)[0])); } catch { return []; }
    const path = `${directory}${relative}`.replace(/\\/g, '/');
    const parts: string[] = [];
    for (const part of path.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') { if (!parts.length) return []; parts.pop(); continue; }
      parts.push(part);
    }
    const name = parts.join('/');
    return (item?.mediaType === 'application/xhtml+xml' || /\.(?:xhtml|html|htm)$/i.test(name)) && files[name] ? [name] : [];
  });
}

function epubText(files: Record<string, Uint8Array>): string {
  const names = epubSpineNames(files);
  const chapterNames = names.length ? names : Object.keys(files).filter(name => /\.(?:xhtml|html|htm)$/i.test(name)).sort();
  const metadataNames = Object.keys(files).filter(name => name === 'META-INF/container.xml' || /\.opf$/i.test(name));
  const evidenceNames = [...new Set([...metadataNames, ...chapterNames])];
  if (evidenceNames.reduce((size, name) => size + (files[name]?.byteLength ?? 0), 0) > MAX_ARCHIVE_TEXT_BYTES)
    throw new Error('El contenido descomprimido supera el límite de análisis seguro.');
  if (!chapterNames.length) throw new Error('El EPUB no contiene capítulos HTML legibles.');
  return chapterNames.map(name => htmlText(archiveXmlText(files[name]))).filter(Boolean).join('\n\n');
}


function xlsxText(files: Record<string, Uint8Array>): string {
  const workbookBytes = files['xl/workbook.xml'];
  const relationBytes = files['xl/_rels/workbook.xml.rels'];
  if (!workbookBytes || !relationBytes) throw new Error('El XLSX no contiene un libro OOXML válido.');
  const workbook = archiveXmlText(workbookBytes);
  const relations = archiveXmlText(relationBytes);
  const targets = new Map<string, string>();
  for (const match of relations.matchAll(/<Relationship\b([^>]*?)(?:\/>|>)/gi)) {
    const id = xmlAttribute(match[0], 'Id');
    const target = xmlAttribute(match[0], 'Target');
    if (id && target) targets.set(id, target.replace(/^\//, '').startsWith('xl/')
      ? target.replace(/^\//, '') : `xl/${target.replace(/^\//, '')}`);
  }
  const strings = files['xl/sharedStrings.xml']
    ? [...archiveXmlText(files['xl/sharedStrings.xml']).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si\s*>/gi)]
      .map(item => [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t\s*>/gi)]
        .map(token => decodeEntities(token[1])).join(''))
    : [];
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*\/?\s*>/gi)];
  if (!sheets.length) throw new Error('El XLSX no contiene hojas legibles.');
  const output: string[] = [];
  for (const sheet of sheets) {
    const name = decodeEntities(xmlAttribute(sheet[0], 'name') ?? 'Unnamed');
    const target = targets.get(xmlAttribute(sheet[0], 'r:id') ?? '');
    if (!target || target.split('/').includes('..')) throw new Error('El XLSX contiene una relación de hoja no válida.');
    const bytes = files[target];
    if (!bytes) throw new Error(`El XLSX no contiene la hoja ${name}.`);
    const xml = archiveXmlText(bytes);
    for (const row of xml.matchAll(/<row\b[^>]*>[\s\S]*?<\/row\s*>/gi)) {
      const rowTag = /^<row\b[^>]*>/i.exec(row[0])?.[0] ?? '';
      const rowNumber = xmlAttribute(rowTag, 'r') ?? '?';
      const cells = [...row[0].matchAll(/<c\b([^>]*?)(?:>([\s\S]*?)<\/c\s*>|\/>)/gi)]
        .flatMap(cell => {
          const attributes = cell[1];
          const ref = xmlAttribute(`<c ${attributes}>`, 'r');
          if (!ref) return [];
          const type = xmlAttribute(`<c ${attributes}>`, 't');
          const body = cell[2] ?? '';
          const rawValue = type === 'inlineStr'
            ? [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t\s*>/gi)].map(token => decodeEntities(token[1])).join('')
            : /<v\b[^>]*>([\s\S]*?)<\/v\s*>/i.exec(body)?.[1] ?? '';
          const formula = /<f\b[^>]*>[\s\S]*?<\/f\s*>/i.test(body);
          if (!rawValue && !formula) return [];
          if (!rawValue && formula) return [`${ref}="[formula result unavailable]"`];
          let value = decodeEntities(rawValue);
          if (type === 's') {
            const index = Number(rawValue);
            value = Number.isInteger(index) && index >= 0 && index < strings.length
              ? strings[index] : '[shared string missing]';
          } else if (type === 'b') value = rawValue === '1' ? 'TRUE' : 'FALSE';
          else if (type === 'e') value = `[spreadsheet error: ${rawValue}]`;
          return [`${ref}${formula ? ' (cached formula result)' : ''}=${JSON.stringify(value)}`];
        });
      if (cells.length) output.push(`Sheet ${JSON.stringify(name)}, row ${rowNumber}: ${cells.join('; ')}`);
    }
  }
  if (!output.length) throw new Error('El XLSX no contiene celdas con valores legibles.');
  return output.join('\n\n');
}

function csvText(bytes: Uint8Array): string {
  let input: string;
  try { input = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('El CSV no está codificado en UTF-8 válido. Convierte el archivo conservando los datos antes de citarlo.'); }
  input = input.replace(/^\uFEFF/, '');
  const firstLine = input.split(/\r?\n/, 1)[0];
  let delimiter = ',';
  let bestCount = -1;
  for (const candidate of [',', ';', '\t', '|']) {
    let quoted = false;
    let count = 0;
    for (let index = 0; index < firstLine.length; index++) {
      if (firstLine[index] === '"' && quoted && firstLine[index + 1] === '"') index++;
      else if (firstLine[index] === '"') quoted = !quoted;
      else if (!quoted && firstLine[index] === candidate) count++;
    }
    if (count > bestCount) { bestCount = count; delimiter = candidate; }
  }
  if (bestCount < 1) throw new Error('No se pudo detectar la separación de columnas del CSV.');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) { row.push(cell); cell = ''; }
    else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && input[index + 1] === '\n') index++;
      row.push(cell); cell = '';
      if (row.some(value => value.length)) rows.push(row);
      row = [];
    } else {
      cell += character === '\r' ? '\n' : character;
      if (quoted && character === '\r' && input[index + 1] === '\n') index++;
    }
  }
  if (quoted) throw new Error('El CSV termina dentro de una celda entrecomillada.');
  row.push(cell);
  if (row.some(value => value.length)) rows.push(row);
  if (!rows.length) throw new Error('El CSV no contiene filas legibles.');
  const headers = rows[0].map((value, index) => value.trim() || `column ${index + 1}`);
  return rows.map((values, index) => `Row ${index + 1}: ${values.map((value, column) =>
    `${headers[column] ?? `column ${column + 1}`}=${JSON.stringify(value)}`).join('; ')}`).join('\n\n');
}

function archiveText(bytes: Uint8Array, format: 'docx' | 'epub' | 'xlsx'): string {
  let selected = 0;
  let entries = 0;
  let originalBytes = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: file => {
      if (file.name.includes('..') || file.name.length > 500) throw new Error('El archivo contiene una ruta no permitida.');
      entries++;
      if (entries > MAX_ARCHIVE_FILES) throw new Error('El contenido descomprimido supera el límite de análisis seguro.');
      const wanted = format === 'docx' ? /^(?:word\/(?:document|footnotes|endnotes)\.xml)$/.test(file.name)
        : format === 'xlsx' ? file.name === 'xl/workbook.xml' || file.name === 'xl/_rels/workbook.xml.rels'
            || file.name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/i.test(file.name) : !file.name.endsWith('/');
      if (!wanted) return false;
      if (format === 'epub' && file.originalSize > MAX_ARCHIVE_TEXT_BYTES)
        throw new Error('El contenido descomprimido supera el límite de análisis seguro.');
      selected++;
      originalBytes += file.originalSize;
      if (originalBytes > MAX_ARCHIVE_TEXT_BYTES) {
        throw new Error('El contenido descomprimido supera el límite de análisis seguro.');
      }
      return true;
    } });
  } catch (error) {
    if (error instanceof Error && /ruta no permitida|límite de análisis seguro/.test(error.message)) throw error;
    throw new Error('No se pudo abrir el archivo ZIP. Puede estar dañado o protegido.');
  }
  return format === 'docx' ? docxText(files) : format === 'epub' ? epubText(files) : xlsxText(files);
}

function splitSections(text: string, startSection: number, sectionCount: number): Pick<TextDocument, 'totalSections' | 'sections' | 'nextSection'> {
  let totalSections = 0;
  const sections: Section[] = [];

  const addChunk = (value: string) => {
    const chunk = normalizeWhitespace(value);
    if (!chunk) return;
    const lines = chunk.split('\n');
    const first = lines[0]!;
    const heading = first.length <= 160 && (lines.length > 1 || /^\d+(?:\.\d+)*\s+/.test(first)) ? first : null;
    const content = heading ? lines.slice(1).join('\n').trim() : chunk;
    const pieces = Math.ceil(content.length / 12_000) || 1;
    for (let index = 0; index < pieces; index++) {
      totalSections++;
      if (totalSections > MAX_DOCUMENT_SECTIONS) {
        throw new Error('El documento contiene demasiadas secciones para analizarlo de forma segura.');
      }
      if (totalSections >= startSection && sections.length < sectionCount) {
        sections.push({ section: totalSections, heading: index === 0 ? heading : null,
          text: content.slice(index * 12_000, (index + 1) * 12_000),
          truncated: content.length > (index + 1) * 12_000 });
      }
    }
  };

  // Stream chunks from the source string. Do not materialize every paragraph
  // and fragment before selecting the requested page.
  const separators = /\n{2,}/g;
  let cursor = 0;
  for (let match = separators.exec(text); match; match = separators.exec(text)) {
    addChunk(text.slice(cursor, match.index));
    cursor = match.index + match[0].length;
  }
  addChunk(text.slice(cursor));
  if (!totalSections) throw new Error('El documento no contiene texto legible. Puede requerir OCR o un formato compatible.');
  if (startSection > totalSections) throw new Error('La sección inicial supera el contenido disponible.');
  const last = sections.at(-1)!.section;
  return { totalSections, sections, nextSection: last < totalSections ? last + 1 : null };
}

function declaredEncoding(bytes: Uint8Array, contentType: string): string {
  // A byte-order mark is part of the document bytes and takes precedence over
  // stale transport metadata, especially for UTF-16 markup.
  if (bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0 && bytes[3] === 0) return 'utf-32le';
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff) return 'utf-32be';
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  const charset = contentType.match(/(?:^|;)\s*charset\s*=\s*[\"']?([^;\s\"']+)/i)?.[1];
  if (charset) return charset.toLowerCase();
  // XML declarations are ASCII-compatible at their beginning, so this probe
  // is safe before decoding the complete document with its declared charset.
  const prefix = Buffer.from(bytes.subarray(0, 1000)).toString('latin1');
  const xmlEncoding = prefix.match(/<\?xml\s+[^>]*encoding\s*=\s*[\"']([^\"']+)[\"']/i)?.[1];
  if (xmlEncoding) return xmlEncoding.toLowerCase();
  // Only real metadata attributes select an HTML charset. Values inside a
  // description (or a comment) must remain ordinary document evidence.
  const htmlPrefix = prefix.replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of htmlPrefix.match(/<meta\b[^>]*>/gi) ?? []) {
    const direct = xmlAttribute(tag, 'charset');
    if (direct) return direct.toLowerCase();
    if (xmlAttribute(tag, 'http-equiv')?.toLowerCase() === 'content-type') {
      const content = xmlAttribute(tag, 'content');
      const metaEncoding = content?.match(/(?:^|;)\s*charset\s*=\s*["']?([^;\s"']+)/i)?.[1];
      if (metaEncoding) return metaEncoding.toLowerCase();
    }
  }
  return 'utf-8';
}

function decodeTextDocument(bytes: Uint8Array, contentType: string): string {
  const declared = declaredEncoding(bytes, contentType).replace(/_/g, '-');
  const aliases: Record<string, string> = {
    'utf8': 'utf-8', 'utf-8': 'utf-8',
    'utf16': 'utf-16le', 'utf-16le': 'utf-16le', 'utf-16be': 'utf-16be',
    'latin1': 'iso-8859-1', 'iso-8859-1': 'iso-8859-1', 'windows-1252': 'windows-1252',
  };
  const encoding = aliases[declared];
  if (!encoding) throw new Error(`El documento declara una codificación no compatible (${declared}).`);
  return new TextDecoder(encoding).decode(bytes);
}

/** Inspect ZIP names without inflating any entry. The parser applies its
 * existing decompression limits after one unambiguous document type is found. */
function detectedArchiveFormat(bytes: Uint8Array): 'docx' | 'epub' | 'xlsx' | undefined {
  const names = new Set<string>();
  let entries = 0;
  try {
    unzipSync(bytes, { filter: file => {
      if (file.name.includes('..') || file.name.length > 500) throw new Error('El archivo contiene una ruta no permitida.');
      if (++entries > MAX_ARCHIVE_FILES) throw new Error('El contenido descomprimido supera el límite de análisis seguro.');
      names.add(file.name);
      return false;
    } });
  } catch (error) {
    if (error instanceof Error && /ruta no permitida|límite de análisis seguro/.test(error.message)) throw error;
    throw new Error('No se pudo abrir el archivo ZIP. Puede estar dañado o protegido.');
  }
  const candidates = [
    ...(names.has('word/document.xml') ? ['docx' as const] : []),
    ...(names.has('xl/workbook.xml') ? ['xlsx' as const] : []),
    ...(names.has('META-INF/container.xml') ? ['epub' as const] : []),
  ];
  if (candidates.length > 1) throw new Error('Formato inválido: el ZIP contiene varios tipos de documento y no puede identificarse de forma inequívoca.');
  return candidates[0];
}

function detectedFormat(bytes: Uint8Array, contentType: string, requested: z.infer<typeof documentFormat>) {
  const binaryPrefix = Buffer.from(bytes.subarray(0, 8)).toString('utf8');
  if (binaryPrefix.startsWith('%PDF-')) {
    if (requested !== 'auto') {
      throw new Error('Formato inválido: el archivo es PDF. Usa format="auto" o campus_research_read_pdf.');
    }
    return 'pdf' as const;
  }
  const zipSignature = bytes[0] === 0x50 && bytes[1] === 0x4b && ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06) || (bytes[2] === 0x07 && bytes[3] === 0x08));
  if (zipSignature) {
    if (requested !== 'auto' && requested !== 'docx' && requested !== 'epub' && requested !== 'xlsx') {
      throw new Error('Formato inválido: el archivo es ZIP. Indica format="docx" o format="epub" o format="xlsx".');
    }
    const detected = detectedArchiveFormat(bytes);
    if (detected) return detected;
    if (requested === 'auto') throw new Error('El archivo ZIP no identifica un DOCX, EPUB o XLSX compatible. Indica format="docx" o format="epub" o format="xlsx" solo si corresponde a su contenido.');
    return requested;
  }
  if (requested === 'docx' || requested === 'epub' || requested === 'xlsx') {
    throw new Error(`Formato inválido: el archivo no es un contenedor ${requested.toUpperCase()} válido.`);
  }
  if (requested !== 'auto') return requested;
  // Sniff the decoded text so a UTF-16 BOM does not turn markup into a plain
  // text document merely because its byte prefix contains NUL characters.
  const decoded = decodeTextDocument(bytes, contentType);
  const prefix = decoded.slice(0, 500);
  const type = contentType.toLowerCase();
  if (type.includes('csv')) return 'csv' as const;
  if (type.includes('html') || /^\s*<!doctype html|^\s*<html\b/i.test(prefix)) return 'html' as const;
  const root = prefix.match(/^\s*<([A-Za-z_][\w.:-]*)(?:\s[^>]*)?>/);
  const hasClosingRoot = root && new RegExp(`</${root[1]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*>`, 'i').test(decoded);
  if (type.includes('xml') || /^\s*<\?xml|^\s*<article\b/i.test(prefix) || hasClosingRoot) return 'xml' as const;
  return 'text' as const;
}

export function extractDocumentBytes(bytes: Uint8Array, requested: z.infer<typeof documentFormat>, startSection = 1, sectionCount = 8, contentType = ''): TextDocument | { format: 'pdf'; delegated: true } {
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error('El documento supera el tamaño permitido (20 MB).');
  const format = detectedFormat(bytes, contentType, requested);
  if (format === 'pdf') return { format: 'pdf', delegated: true };
  const raw = format === 'docx' || format === 'epub' || format === 'xlsx' ? archiveText(bytes, format) : format === 'csv' ? csvText(bytes) : decodeTextDocument(bytes, contentType);
  const text = format === 'docx' || format === 'epub' || format === 'xlsx' ? normalizeWhitespace(raw)
    : format === 'html' ? htmlText(raw) : format === 'xml' || format === 'jats' ? xmlText(raw) : normalizeWhitespace(raw);
  // Preserve the full section index so a later request can reach material
  // after the response-size boundary (for example, methods or references).
  // Each returned section remains bounded in splitSections.
  const result = splitSections(text, startSection, sectionCount);
  return { format, ...result, textCoverage: 'complete' as const };
}

export async function readResearchDocument(raw: z.input<typeof documentInput>, dependencies: {
  download?: typeof researchDownload;
} = {}) {
  const input = documentInput.parse(raw);
  const alternate = (input.format === 'auto' || input.format === 'html')
    ? officialResearchAlternate(input.url) : null;
  const sourceUrl = alternate?.url ?? (input.format === 'auto' || input.format === 'html'
    ? officialResearchPdf(input.url) : null) ?? input.url;
  const download = dependencies.download ?? researchDownload;
  const options = { maxBytes: MAX_DOCUMENT_BYTES, redirects: 4,
    headers: { Accept: 'application/pdf, application/epub+zip, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv, application/csv, text/html, application/xhtml+xml, application/xml, '
      + (input.format === 'auto' ? 'application/json, ' : '') + 'text/plain, text/markdown;q=0.9, */*;q=0.1' } };
  let downloaded: NavigatedResearchDownload;
  try {
    downloaded = await download(sourceUrl, options);
  } catch (error) {
    // The journal occasionally responds with a temporary request limit under HTTP 403.
    // Retry only when its bounded response explicitly identifies that condition.
    if (!(error instanceof ResearchHttpError && error.rateLimited
      && new URL(sourceUrl).hostname === 'revistas.uh.cu')) throw error;
    await new Promise(resolve => setTimeout(resolve, 1_500));
    downloaded = await download(sourceUrl, options);
  }
  downloaded = await resolveResearchHtmlPdf(downloaded, options, download);
  const navigation = downloaded.htmlNavigation ? { sourceNavigation: downloaded.htmlNavigation } : {};
  if (alternate?.scope === 'full_report' || alternate?.scope === 'full_article') {
    if (!downloaded.bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('La ruta oficial del informe no devolvió un PDF válido.');
    }
    return { ...await readResearchPdfBytes(downloaded.bytes,
      { requestedUrl: input.url, resolvedUrl: downloaded.url }, input.startSection, input.sectionCount),
      accessScope: alternate.scope, sourceRoute: 'official_alternate' as const, ...navigation };
  }
  if (downloaded.htmlNavigation?.role === 'embedded_document_viewer'
    && downloaded.htmlNavigation.linkedDocument?.status !== 'retrieved') {
    return { requestedUrl: input.url, resolvedUrl: downloaded.url, retrievedAt: new Date().toISOString(),
      sha256: createHash('sha256').update(downloaded.bytes).digest('hex'), format: 'html' as const,
      totalSections: 0, sections: [], nextSection: null, textCoverage: 'complete' as const,
      accessScope: 'viewer_only' as const, evidenceAllowed: false, ...navigation,
      guidance: ['Solo se obtuvo el visor HTML; no se leyó el documento embebido. Conserva el fallo de sourceNavigation y no atribuyas métodos o resultados a este visor.'] };
  }
  // ISO's catalog has a large navigation shell. Restrict evidence to the
  // published description when its semantic field is present.
  const catalogDescription = alternate?.scope === 'public_catalog'
    ? downloaded.bytes.toString('utf8').match(/<div\s+itemprop="description"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
    : undefined;
  const evidenceBytes = catalogDescription ? Buffer.from(catalogDescription, 'utf8') : downloaded.bytes;
  const extracted = extractDocumentBytes(evidenceBytes, alternate?.scope === 'public_catalog' ? 'html' : downloaded.htmlNavigation?.linkedDocument?.status === 'retrieved' ? 'auto' : input.format,
    input.startSection, input.sectionCount, downloaded.contentType);
  if (extracted.format === 'pdf') {
    return { ...await readResearchPdfBytes(downloaded.bytes, { requestedUrl: input.url, resolvedUrl: downloaded.url }, input.startSection, input.sectionCount), ...navigation };
  }
  return { requestedUrl: input.url, resolvedUrl: downloaded.url, retrievedAt: new Date().toISOString(),
    sha256: createHash('sha256').update(downloaded.bytes).digest('hex'), ...extracted, ...navigation,
    ...(input.format !== 'auto' && input.format !== extracted.format ? { requestedFormat: input.format } : {}),
    ...(alternate?.scope === 'public_catalog' ? { accessScope: 'public_catalog' as const,
      sourceRoute: 'official_alternate' as const } : {}),
    guidance: [
      ...(alternate?.scope === 'public_catalog'
        ? ['Solo se leyó la ficha pública de ISO. El texto íntegro de la norma requiere acceso autorizado; no atribuyas sus cláusulas a esta vista previa.'] : []),
      'Texto extraído de un documento público para análisis; no verifica la identidad bibliográfica ni la revisión por pares.',
      'Cita la URL y el número o encabezado de sección devuelto. No atribuyas resultados a partes no leídas.',
      'HTML dinámico, tablas, imágenes, ecuaciones y diseños complejos pueden perderse. Revisa la fuente original antes de citar.',
      ...(extracted.format === 'csv' || extracted.format === 'xlsx' ? [
        'En CSV/XLSX, cada cita de datos debe conservar la fila, hoja y coordenada o nombre de columna; el texto extraído no valida por sí solo unidades, fórmulas, filtros ni la interpretación estadística. Las fórmulas XLSX no se ejecutan; se muestra el valor almacenado por el archivo.',
      ] : []),
      'Para DOCX y EPUB se procesa solo el texto del archivo público. No se siguen enlaces ni instrucciones incluidas en el documento.',
      'Si el formato no es compatible, comparte una URL pública del texto, una versión HTML/XML o un PDF accesible; Campus no evade paywalls ni inicios de sesión.',
    ] };
}
