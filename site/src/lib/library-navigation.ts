/** Public HTML routes only: downloads, XML, account pages and foreign origins stay native. */
export function isLibraryPage(url: URL, origin: string): boolean {
  return url.origin === origin && /^\/biblioteca\/(?:cursos\/[1-9]\d*\/|trabajos\/[a-z0-9-]+\/)?$/.test(url.pathname);
}
export function isSameLibraryDocument(a: URL, b: URL): boolean {
  return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
}
export function librarySearchURL(form: HTMLFormElement, current: string): URL {
  const url = new URL(form.action, current);
  url.search = '';
  for (const [key, value] of new FormData(form)) {
    if (typeof value === 'string' && value.trim()) url.searchParams.set(key, value.trim());
  }
  return url;
}

/** The account workspace is navigable, but other app/auth/API routes stay native. */
export function isLibraryWorkspace(url: URL, origin: string): boolean {
  return url.origin === origin && url.pathname === '/app/biblioteca/';
}
export function isLibraryRoute(url: URL, origin: string): boolean {
  return isLibraryPage(url, origin) || isLibraryWorkspace(url, origin);
}
export function isLibraryWorkspaceViewHash(hash: string): boolean {
  return ['', '#aportes', '#subir', '#revision'].includes(hash);
}
