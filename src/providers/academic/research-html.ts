import { createHash } from 'node:crypto';
import { decodeHTML } from 'entities';
import { publicHttpsUrl, researchDownload, type ResearchDownload } from './research-http.js';

type PdfLink = { url: string; via: 'metadata' | 'embedded_pdf' | 'alternate'; read: false };
type HtmlNavigation = {
  role: 'html_document' | 'embedded_document_viewer';
  links: PdfLink[];
  wrapperUrl: string;
  wrapperSha256: string;
  embeddedPdfCount: number;
  linkedDocument?: { url: string; status: 'retrieved' | 'not_read'; reason?: string };
};
export type NavigatedResearchDownload = ResearchDownload & { htmlNavigation?: HtmlNavigation };

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/\s+([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    const key = match[1].toLowerCase();
    if (!(key in result)) result[key] = decodeHTML(match[2] ?? match[3] ?? match[4]);
  }
  return result;
}

/** Links are discovery leads. Never execute scripts or treat a viewer as the
 * study itself. Only an otherwise empty, single-PDF viewer is followed. */
export function researchHtmlNavigation(downloaded: ResearchDownload): HtmlNavigation | undefined {
  if (downloaded.bytes.subarray(0, 5).toString() === '%PDF-') return undefined;
  const html = downloaded.bytes.toString('utf8');
  if (!/html/i.test(downloaded.contentType) && !/^\s*(?:<!doctype html|<html\b)/i.test(html)) return undefined;
  const clean = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const body = clean.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1]
    ?? clean.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, '');
  const visibleText = decodeHTML(body.replace(/<[^>]*>/g, '')).replace(/\s+/g, '').trim();
  const links: PdfLink[] = [];
  let embeddedCount = 0;
  for (const match of clean.matchAll(/<(meta|link|iframe|embed|object)\b[^>]*>/gi)) {
    const tag = match[1].toLowerCase();
    const attr = attributes(match[0]);
    let value: string | undefined;
    let via: PdfLink['via'];
    if (tag === 'meta' && attr.name?.toLowerCase() === 'citation_pdf_url') {
      value = attr.content; via = 'metadata';
    } else if (tag === 'link' && attr.rel?.toLowerCase().split(/\s+/).includes('alternate') && attr.type?.toLowerCase() === 'application/pdf') {
      value = attr.href; via = 'alternate';
    } else if (['iframe', 'embed', 'object'].includes(tag)) {
      value = tag === 'object' ? attr.data : attr.src; via = 'embedded_pdf';
    } else continue;
    if (!value || value.length > 4000) continue;
    let url: URL;
    try { url = new URL(value, downloaded.url); } catch { continue; }
    if (via === 'embedded_pdf' && attr.type?.toLowerCase() !== 'application/pdf' && !/\.pdf$/i.test(url.pathname)) continue;
    if (via === 'embedded_pdf') embeddedCount++;
    try { url = publicHttpsUrl(url.toString()); } catch { continue; }
    if (url.toString() === downloaded.url) continue;
    const existing = links.find(link => link.url === url.toString());
    if (existing && via === 'embedded_pdf') existing.via = via;
    else if (!existing && links.length < 5) links.push({ url: url.toString(), via, read: false });
  }
  const viewer = visibleText.length === 0 && embeddedCount > 0;
  return { role: viewer ? 'embedded_document_viewer' : 'html_document', links,
    wrapperUrl: downloaded.url, wrapperSha256: createHash('sha256').update(downloaded.bytes).digest('hex'), embeddedPdfCount: embeddedCount };
}

/** Reuse the already fetched HTML. Follow at most one explicit PDF frame,
 * through the same bounded downloader and its DNS/redirect checks. */
export async function resolveResearchHtmlPdf(
  downloaded: ResearchDownload,
  options: Parameters<typeof researchDownload>[1],
  download: typeof researchDownload = researchDownload,
): Promise<NavigatedResearchDownload> {
  const htmlNavigation = researchHtmlNavigation(downloaded);
  if (!htmlNavigation) return downloaded;
  const candidate = htmlNavigation.role === 'embedded_document_viewer' && htmlNavigation.embeddedPdfCount === 1
    ? htmlNavigation.links.find(link => link.via === 'embedded_pdf') : undefined;
  if (!candidate) return { ...downloaded, htmlNavigation };
  try {
    const linked = await download(candidate.url, options);
    if (linked.bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('El documento embebido no devolvió un PDF válido.');
    return { ...linked, htmlNavigation: { ...htmlNavigation,
      linkedDocument: { url: linked.url, status: 'retrieved' } } };
  } catch (error) {
    return { ...downloaded, htmlNavigation: { ...htmlNavigation,
      linkedDocument: { url: candidate.url, status: 'not_read', reason: error instanceof Error ? error.message : 'No se pudo leer el PDF embebido.' } } };
  }
}
