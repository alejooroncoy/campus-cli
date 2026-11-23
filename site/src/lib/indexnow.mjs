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
// Identifica el aviso en los registros y reglas del firewall de Vercel.
const USER_AGENT = 'campuscli-indexnow (+https://campuscli.com)';
const RETRY_MS = [2_000, 8_000];
// Tope de archivos de sitemap por corrida (hoy se leen 6).
const MAX_SITEMAPS = 50;
const RETRIES = RETRY_MS.length;

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
 * URLs con lastmod entre `since` y `until` (AAAA-MM-DD, ambos inclusive). Las
 * que no tienen fecha no se avisan: sin fecha no hay forma de saber si
 * cambiaron. El tope evita repetir cada día una URL con fecha futura.
 */
export function changedSince(entries, since, until = '9999-12-31') {
  const urls = entries.filter(e => e.lastmod && e.lastmod >= since && e.lastmod <= until && ownUrl(e.loc)).map(e => e.loc);
  return [...new Set(urls)];
}

/** Sitemaps que declara robots.txt (líneas `Sitemap:`). */
export function parseRobotsSitemaps(text) {
  return [...text.matchAll(/^[ \t]*sitemap:[ \t]*(\S+)/gim)].map(([, url]) => url);
}

/**
 * Todas las URLs del sitio: las de cada sitemap que declara robots.txt. Así
 * entra también la biblioteca, que publica su propio índice fuera de
 * sitemap-index.xml (un índice no puede contener otro). Si un sitemap falla
 * (por ejemplo el de profes, que depende de otro servicio), se siguen leyendo
 * los demás y el fallo queda en `errors`.
 */
export async function collectEntries({ fetchData = fetch, robots = `${SITE_ORIGIN}/robots.txt`, wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  // El sitemap de profes sale de una función que depende de otro servicio: un
  // 5xx o un corte pasajero se reintenta antes de darlo por caído.
  const read = async url => {
    for (let attempt = 0; ; attempt++) {
      let response;
      try {
        response = await fetchData(url, { headers: { Accept: 'application/xml', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000), redirect: 'error' });
      } catch (error) {
        if (attempt < RETRIES) { await wait(RETRY_MS[attempt]); continue; }
        throw new Error(`sitemap ${url}: ${error?.message ?? error}`);
      }
      if (response.ok) return response.text();
      if ((response.status === 429 || response.status >= 500) && attempt < RETRIES) { await wait(RETRY_MS[attempt]); continue; }
      throw new Error(`sitemap ${url}: ${response.status}`);
    }
  };
  const entries = [];
  const errors = [];
  // El índice principal se lee siempre, aunque robots.txt no responda o no lo declare.
  const roots = new Set([`${SITE_ORIGIN}/sitemap-index.xml`]);
  try {
    for (const url of parseRobotsSitemaps(await read(robots))) {
      if (ownUrl(url)) roots.add(url);
      else errors.push(`robots.txt: sitemap ajeno o no https, se ignora: ${url}`);
    }
  } catch (error) {
    errors.push(String(error?.message ?? error));
  }
  const seen = new Set();
  // depth 0: lo que declara robots.txt (índice o sitemap). depth 1: lo que lista
  // un índice. Más abajo no se baja: el protocolo no admite índices anidados.
  const visit = async (url, depth) => {
    if (seen.has(url)) return;
    // Un tope por si un índice lista miles de archivos por un conteo errado.
    if (seen.size >= MAX_SITEMAPS) {
      errors.push(`sitemap ${url}: se superó el tope de ${MAX_SITEMAPS} sitemaps`);
      return;
    }
    seen.add(url);
    let xml;
    try {
      xml = await read(url);
    } catch (error) {
      errors.push(String(error?.message ?? error));
      return;
    }
    if (/<urlset[\s>]/.test(xml)) {
      const found = parseUrlset(xml);
      if (!found.length) errors.push(`sitemap ${url}: no lista ninguna URL`);
      entries.push(...found);
      return;
    }
    if (!/<sitemapindex[\s>]/.test(xml)) {
      // Por ejemplo una página HTML servida con 200 en lugar del XML.
      errors.push(`sitemap ${url}: no es un sitemap`);
      return;
    }
    if (depth > 0) {
      errors.push(`sitemap ${url}: índice dentro de otro índice`);
      return;
    }
    // Un hijo que también es raíz se lee como raíz: si el índice principal
    // llegara a listar el de la biblioteca, no se pierde por el orden de lectura.
    for (const child of parseSitemapIndex(xml).filter(ownUrl)) {
      if (!roots.has(child)) await visit(child, depth + 1);
    }
  };
  for (const root of roots) await visit(root, 0);
  return { entries, errors };
}

/** Envía la lista a IndexNow. 200 y 202 significan recibido. */
export async function submit(urls, { fetchData = fetch } = {}) {
  const urlList = urls.filter(ownUrl).slice(0, MAX_URLS);
  if (!urlList.length) return { submitted: 0, status: null };
  const response = await fetchData(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': USER_AGENT },
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

// Días hacia atrás que cubre cada aviso. Un cambio fechado el día D que se
// publica uno o dos días después todavía entra; repetir una URL en avisos de
// días seguidos está permitido por el protocolo.
export const WINDOW_DAYS = 3;

/**
 * Lee el sitemap en vivo y avisa a IndexNow las URLs con lastmod dentro de la
 * ventana (hora de Lima), o todas con `all`. Un sitemap caído no frena el aviso
 * de los demás: queda en `errors`.
 */
export async function notifyChanged({ all = false, dryRun = false, fetchData = fetch, now = new Date(), wait } = {}) {
  const since = limaDate(WINDOW_DAYS - 1, now);
  // Un día de margen arriba: la fecha de un commit va en la zona de quien lo hizo.
  const until = limaDate(-1, now);
  const { entries, errors } = await collectEntries({ fetchData, wait });
  const urls = all ? [...new Set(entries.map(e => e.loc).filter(ownUrl))] : changedSince(entries, since, until);
  if (urls.length > MAX_URLS) errors.push(`${urls.length} URLs: IndexNow acepta ${MAX_URLS} por aviso y el resto no se envía`);
  let result = { submitted: 0, status: null };
  if (!dryRun) {
    try {
      result = await submit(urls, { fetchData });
    } catch (error) {
      // Un rechazo de IndexNow no debe esconder los sitemaps que tampoco se leyeron.
      error.sitemapErrors = errors;
      throw error;
    }
  }
  return { since, until, urls, errors, ...result };
}
