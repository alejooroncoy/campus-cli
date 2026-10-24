import { readFile } from 'node:fs/promises';
import { renderLibraryShell } from '../src/lib/library-shell.mjs';

export async function libraryPage(request, {
  fetchData = fetch,
  loadTemplate = () => readFile(new URL('../.generated/library.html', import.meta.url), 'utf8'),
  apiOrigin = process.env.CAMPUS_LIBRARY_API_ORIGIN || 'https://profes.campuscli.com',
} = {}) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const fail = (status, text) => new Response(request.method === 'HEAD' ? null : text, { status, headers: { ...headers, 'X-Robots-Tag': 'noindex' } });
  if (!['GET', 'HEAD'].includes(request.method)) return fail(405, 'Método no permitido');
  const url = new URL(request.url);
  const route = url.searchParams.get('route') || url.pathname;
  if (!/^\/biblioteca(?:\/[a-z0-9.-]+)*\/?$/.test(route) || route.includes('..') || route.startsWith('/biblioteca/plantilla')) return fail(404, 'Página no encontrada');
  const upstream = new URL('/api/app/library/pages' + route.slice('/biblioteca'.length), apiOrigin);
  const params = new URLSearchParams(url.searchParams);
  params.delete('route');
  upstream.search = params.toString();
  try {
    // This fetch is public. Account cookies stay between the browser and Campus.
    const result = await fetchData(upstream, { headers: { Accept: 'text/html, application/xml' }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if ([301, 302, 307, 308].includes(result.status)) {
      const location = result.headers.get('location');
      if (!location || !/^\/biblioteca\/[a-z0-9/-]+\/$/.test(location)) return fail(503, 'No pudimos abrir esta página.');
      return new Response(null, { status: result.status, headers: { ...headers, Location: location } });
    }
    if (!result.ok) return fail([400, 404].includes(result.status) ? result.status : 503, result.status === 404 ? 'Material o página no encontrados.' : 'No pudimos cargar la biblioteca. Vuelve a intentarlo.');
    const type = result.headers.get('content-type') || '';
    const source = await result.text();
    if (route.endsWith('.xml') && type.startsWith('application/xml')) return new Response(request.method === 'HEAD' ? null : source, { headers: { ...headers, 'Content-Type': type } });
    if (!type.startsWith('text/html')) return fail(503, 'No pudimos cargar la biblioteca.');
    const html = renderLibraryShell(await loadTemplate(), source);
    return new Response(request.method === 'HEAD' ? null : html, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  } catch {
    return fail(503, 'No pudimos cargar la biblioteca. Vuelve a intentarlo.');
  }
}
export default { fetch: libraryPage };
