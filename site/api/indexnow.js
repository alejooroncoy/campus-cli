import { changedSince, collectEntries, limaDate, submit } from '../src/lib/indexnow.mjs';

// Días hacia atrás que cubre cada corrida. Un cambio fechado el día D que se
// publica uno o dos días después (promote manual) todavía entra; repetir una
// URL en avisos de días seguidos está permitido por el protocolo.
export const WINDOW_DAYS = 3;

// Cron diario de Vercel (vercel.json → crons, ruta con barra final porque el
// sitio usa trailingSlash y el cron no sigue redirecciones): avisa a IndexNow
// de las URLs del sitemap con lastmod dentro de la ventana (hora de Lima).
export async function indexNow(request, { fetchData = fetch, env = process.env, now = new Date() } = {}) {
  if (request.method !== 'GET') return new Response('Método no permitido', { status: 405, headers: { Allow: 'GET' } });
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  // Vercel manda CRON_SECRET como Bearer en cada corrida del cron. Sin la
  // variable no se avisa nada: el User-Agent del cron se puede falsificar, y
  // avisos repetidos de terceros podrían hacer que IndexNow limite al dominio.
  const secret = env.CRON_SECRET;
  if (!secret) {
    console.error('indexnow: falta CRON_SECRET en el entorno');
    return new Response(JSON.stringify({ error: 'Falta CRON_SECRET' }), { status: 503, headers });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return new Response('No autorizado', { status: 401 });
  try {
    const since = limaDate(WINDOW_DAYS - 1, now);
    // Un día de margen arriba: la fecha de un commit va en la zona de quien lo hizo.
    const until = limaDate(-1, now);
    const { entries, errors } = await collectEntries({ fetchData });
    const urls = changedSince(entries, since, until);
    const result = await submit(urls, { fetchData });
    // Un sitemap caído no frena el aviso de los demás, pero no queda en silencio.
    if (errors.length) console.error('indexnow: sitemaps sin leer', errors);
    return new Response(JSON.stringify({ since, until, ...result, urls, errors }), { status: errors.length ? 207 : 200, headers });
  } catch (error) {
    console.error('indexnow:', error);
    return new Response(JSON.stringify({ error: String(error?.message ?? error) }), { status: 502, headers });
  }
}

export default { fetch: indexNow };
