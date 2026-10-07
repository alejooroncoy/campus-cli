/** Verified public routes published by the same organizations as blocked landing pages.
 * Keep this list narrow: a catalog preview must never be presented as full text. */
export function officialResearchAlternate(value: string): { url: string; scope: 'full_report' | 'full_article' | 'public_catalog' } | null {
  let source: URL;
  try { source = new URL(value); } catch { return null; }
  if (source.protocol !== 'https:' || source.username || source.password || source.port || source.search || source.hash) return null;
  if (source.hostname === 'www.weforum.org'
    && /^\/publications\/the-future-of-jobs-report-2025\/?$/.test(source.pathname)) {
    return { url: 'https://reports.weforum.org/docs/WEF_Future_of_Jobs_Report_2025.pdf', scope: 'full_report' };
  }
  if (source.hostname === 'www.iso.org' && source.pathname === '/standard/78176.html') {
    return { url: 'https://committee.iso.org/es/sites/isoorg/contents/data/standard/07/81/78176.html', scope: 'public_catalog' };
  }
  if (source.hostname === 'revistas.uh.cu'
    && /^\/revflacso\/article\/view\/7514\/?$/.test(source.pathname)) {
    return { url: 'https://revistas.uh.cu/revflacso/article/download/7514/6400/9026', scope: 'full_article' };
  }
  return null;
}

export function officialResearchPdf(value: string): string | null {
  const alternate = officialResearchAlternate(value);
  if (alternate?.scope === 'full_report' || alternate?.scope === 'full_article') return alternate.url;
  let source: URL;
  try { source = new URL(value); } catch { return null; }
  if (source.origin !== 'https://dspace.mit.edu' || source.username || source.password || source.search || source.hash) return null;
  const bitstream = /^\/bitstreams\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/download\/?$/i.exec(source.pathname);
  // MIT publishes this content endpoint in the bitstream metadata. Keep the
  // exact asset ID, rather than searching for an unverified replacement PDF.
  return bitstream ? `${source.origin}/server/api/core/bitstreams/${bitstream[1]}/content` : null;
}

/** This legacy UPCH redirect advertises HTTP despite supporting the same
 * asset over HTTPS. Upgrade only its verified same-host bitstream route;
 * the downloader still validates DNS and never makes an HTTP request. */
export function officialResearchHttpsRedirect(source: URL, target: URL): URL {
  if (source.origin === 'https://repositorio.upch.edu.pe'
    && target.origin === 'http://repositorio.upch.edu.pe' && !target.username && !target.password
    && !target.search && !target.hash
    && /^\/bitstreams\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/download\/?$/i.test(target.pathname)) {
    const secure = new URL(target.toString());
    secure.protocol = 'https:';
    return secure;
  }
  return target;
}
