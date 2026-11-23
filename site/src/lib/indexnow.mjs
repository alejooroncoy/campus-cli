// IndexNow: avisa a Bing (y a los demás buscadores que comparten el protocolo)
// qué URLs cambiaron, en vez de esperar a que vuelvan a rastrear el sitio.
// La clave es pública por diseño: el buscador la verifica en /<clave>.txt, que
// solo prueba que el aviso viene de quien controla el dominio.
export const INDEXNOW_KEY = 'e71f05ec72c0817558dbdc3cb3a706ed';
export const SITE_HOST = 'campuscli.com';
const SITE_ORIGIN = `https://${SITE_HOST}`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
// Límite del protocolo por petición.
const MAX_URLS = 10_000;

const unescapeXml = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Entradas <url> de un sitemap: dirección y, si la tiene, fecha (AAAA-MM-DD). */
export function parseUrlset(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].flatMap(([, body]) => {
    const loc = body.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (!loc) return [];
    const lastmod = body.match(/<lastmod>(\d{4}-\d{2}-\d{2})/)?.[1];
    return [{ loc: unescapeXml(loc.trim()), lastmod }];
  });
}

/** Sitemaps que lista un índice. */
export function parseSitemapIndex(xml) {
  return [...xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/g)].map(([, loc]) => unescapeXml(loc.trim()));
}

const ownUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === SITE_HOST;
  } catch {
    return false;
  }
};

/**
 * URLs con lastmod desde `since` (AAAA-MM-DD, inclusive). Las que no tienen
 * fecha no se avisan: sin fecha no hay forma de saber si cambiaron.
 */
export function changedSince(entries, since) {
  const urls = entries.filter(e => e.lastmod && e.lastmod >= since && ownUrl(e.loc)).map(e => e.loc);
  return [...new Set(urls)];
}

/** Todas las URLs del sitio que lista el índice de sitemaps. */
export async function collectEntries({ fetchData = fetch, index = `${SITE_ORIGIN}/sitemap-index.xml` } = {}) {
  const read = async url => {
    const response = await fetchData(url, { headers: { Accept: 'application/xml' }, signal: AbortSignal.timeout(15_000), redirect: 'error' });
    if (!response.ok) throw new Error(`sitemap ${url}: ${response.status}`);
    return response.text();
  };
  const sitemaps = parseSitemapIndex(await read(index)).filter(ownUrl);
  const entries = [];
  for (const sitemap of sitemaps) entries.push(...parseUrlset(await read(sitemap)));
  return entries;
}

/** Envía la lista a IndexNow. 200 y 202 significan recibido. */
export async function submit(urls, { fetchData = fetch } = {}) {
  const urlList = urls.filter(ownUrl).slice(0, MAX_URLS);
  if (!urlList.length) return { submitted: 0, status: null };
  const response = await fetchData(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: SITE_HOST, key: INDEXNOW_KEY, keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`, urlList }),
    signal: AbortSignal.timeout(15_000),
  });
  if (![200, 202].includes(response.status)) throw new Error(`IndexNow respondió ${response.status}`);
  return { submitted: urlList.length, status: response.status };
}

/** Fecha AAAA-MM-DD de hace `days` días, en hora de Lima. */
export function limaDate(days = 0, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(now.getTime() - days * 86_400_000));
}
