// Exact editorial copies whose first pages were read and matched to their DOI.
// Unknown MDPI records must still go through discovery and identity verification.
const verifiedMdpiArticles = [
  { path: '/2227-9709/13/2/19', file: 'informatics/informatics-13-00019', doi: '10.3390/informatics13020019' },
  { path: '/2076-3417/16/18/8936', file: 'applsci/applsci-16-08936', doi: '10.3390/app16188936' },
  { path: '/2076-3417/15/11/6335', file: 'applsci/applsci-15-06335', doi: '10.3390/app15116335' },
  { path: '/2079-9292/12/9/2055', file: 'electronics/electronics-12-02055', doi: '10.3390/electronics12092055' },
  { path: '/2411-5134/10/4/46', file: 'inventions/inventions-10-00046', doi: '10.3390/inventions10040046' },
  { path: '/2079-9292/12/8/1775', file: 'electronics/electronics-12-01775', doi: '10.3390/electronics12081775' },
] as const;

/** Verified public routes published by the same organizations as blocked landing pages.
 * Keep this list narrow: a catalog preview must never be presented as full text. */
export function officialResearchAlternate(value: string): { url: string; scope: 'full_report' | 'full_article' | 'public_catalog' } | null {
  let source: URL;
  try { source = new URL(value); } catch { return null; }
  if (source.protocol !== 'https:' || source.username || source.password || source.port || source.search || source.hash) return null;
  // Do not manufacture a CDN path or replace a version-specific URL with
  // today's file. DOI aliases use the same exact verified article allowlist.
  if (source.hostname === 'www.mdpi.com' || source.hostname === 'doi.org' || source.hostname === 'dx.doi.org') {
    let doi: string;
    try { doi = decodeURIComponent(source.pathname.slice(1)).toLowerCase(); } catch { return null; }
    const article = source.hostname === 'www.mdpi.com'
      ? verifiedMdpiArticles.find(item => item.path === source.pathname.replace(/\/(?:pdf\/?)?$/, ''))
      : verifiedMdpiArticles.find(item => item.doi === doi);
    if (article) {
      const filename = article.file.split('/')[1];
      return { url: `https://mdpi-res.com/d_attachment/${article.file}/article_deploy/${filename}.pdf`,
        scope: 'full_article' };
    }
  }
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
  // ALICIA links article 22535 to this DOI; SciELO's citation_doi and
  // citation_pdf_url publish the same article. The PDF's first page was read
  // and matched by title, authors, year and the printed DOI. Do not generalize
  // the route to other UNMSM articles or construct unverified SciELO filenames.
  if ((source.hostname === 'revistasinvestigacion.unmsm.edu.pe'
      && /^\/index.php\/lenguaysociedad\/article\/view\/22535(?:\/18891)?\/?$/.test(source.pathname))
    || (['doi.org', 'dx.doi.org'].includes(source.hostname)
      && source.pathname.toLowerCase() === '/10.15381/lengsoc.v21i2.22535')) {
    return { url: 'https://www.scielo.org.pe/pdf/lys/v21n2/2413-2659-lys-21-02-373.pdf', scope: 'full_article' };
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
