import { changedSince, collectEntries, limaDate, submit } from '../src/lib/indexnow.mjs';

// Cron diario de Vercel (vercel.json → crons): avisa a IndexNow de las URLs del
// sitemap con lastmod de ayer u hoy (hora de Lima). La ventana de dos días cubre
// un despliegue que cae justo después de la corrida anterior; repetir una URL en
// dos avisos seguidos está permitido.
export async function indexNow(request, { fetchData = fetch, env = process.env, now = new Date() } = {}) {
  if (request.method !== 'GET') return new Response('Método no permitido', { status: 405, headers: { Allow: 'GET' } });
  // Con CRON_SECRET, Vercel lo manda como Bearer. Sin él, solo se acepta la
  // llamada del propio cron de Vercel.
  const secret = env.CRON_SECRET;
  const authorized = secret
    ? request.headers.get('authorization') === `Bearer ${secret}`
    : (request.headers.get('user-agent') ?? '').startsWith('vercel-cron/');
  if (!authorized) return new Response('No autorizado', { status: 401 });
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  try {
    const since = limaDate(1, now);
    const urls = changedSince(await collectEntries({ fetchData }), since);
    const result = await submit(urls, { fetchData });
    return new Response(JSON.stringify({ since, ...result, urls }), { headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error?.message ?? error) }), { status: 502, headers });
  }
}

export default { fetch: indexNow };
