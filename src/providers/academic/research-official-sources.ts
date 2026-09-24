/** Verified public routes published by the same organizations as blocked landing pages.
 * Keep this list narrow: a catalog preview must never be presented as full text. */
export function officialResearchAlternate(value: string): { url: string; scope: 'full_report' | 'public_catalog' } | null {
  let source: URL;
  try { source = new URL(value); } catch { return null; }
  if (source.protocol !== 'https:' || source.username || source.password || source.search || source.hash) return null;
  if (source.hostname === 'www.weforum.org'
    && /^\/publications\/the-future-of-jobs-report-2025\/?$/.test(source.pathname)) {
    return { url: 'https://reports.weforum.org/docs/WEF_Future_of_Jobs_Report_2025.pdf', scope: 'full_report' };
  }
  if (source.hostname === 'www.iso.org' && source.pathname === '/standard/78176.html') {
    return { url: 'https://committee.iso.org/es/sites/isoorg/contents/data/standard/07/81/78176.html', scope: 'public_catalog' };
  }
  return null;
}

export function officialResearchPdf(value: string): string | null {
  const alternate = officialResearchAlternate(value);
  return alternate?.scope === 'full_report' ? alternate.url : null;
}
