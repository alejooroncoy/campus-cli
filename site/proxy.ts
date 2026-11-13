/**
 * Negociación de contenido para las versiones en Markdown.
 *
 * Cada página con index.md lo anuncia con <link rel="alternate">, y vercel.json intenta
 * responder `Accept: text/markdown` con una reescritura. Esa reescritura nunca se aplica a
 * una página que existe como archivo estático, porque el sistema de archivos gana sobre
 * `rewrites`. El Routing Middleware corre antes, así que hace lo que la reescritura no puede.
 *
 * Para que cueste lo mínimo:
 * - El matcher de vercel.json lista solo las rutas que tienen index.md (una prueba lo verifica
 *   contra src/pages). El resto del sitio, incluida /app/, nunca invoca este código.
 * - No consulta la red: como cada ruta del matcher tiene su gemelo, basta reescribir.
 * - Un navegador (que no pide Markdown) sale en la primera comparación.
 */

/** Las dos respuestas posibles del middleware, escritas como lo hacen `next()` y `rewrite()` de @vercel/functions. */
const next = () => new Response(null, { headers: { "x-middleware-next": "1" } });
const rewrite = (destination: URL) =>
  new Response(null, { headers: { Vary: "Accept", "x-middleware-rewrite": destination.href } });

/** Ruta de página hecha solo de segmentos con letras, dígitos, `_` y `-`, cada uno seguido de `/`. */
const PAGE_PATH = /^\/(?:[a-z0-9_-]+\/)*$/i;

/** Calidad de un tipo de medio en un Accept, o 0 si no aparece. Los comodines no cuentan. */
const quality = (accept: string, type: string) => {
  let best = 0;
  for (const raw of accept.split(",")) {
    const [media, ...params] = raw.split(";").map((part) => part.trim().toLowerCase());
    if (media !== type) continue;
    const q = params.find((param) => param.startsWith("q="));
    const value = q === undefined ? 1 : Number.parseFloat(q.slice(2));
    best = Math.max(best, Number.isFinite(value) ? value : 0);
  }
  return best;
};

/** Markdown solo cuando se acepta explícitamente y no queda por debajo de HTML. */
export const prefersMarkdown = (accept: string) => {
  if (!accept.toLowerCase().includes("text/markdown")) return false;
  const markdown = quality(accept, "text/markdown");
  return markdown > 0 && markdown >= quality(accept, "text/html");
};

export default function proxy(request: Request) {
  if ((request.method !== "GET" && request.method !== "HEAD") || !prefersMarkdown(request.headers.get("accept") ?? "")) return next();
  const url = new URL(request.url);
  if (!PAGE_PATH.test(url.pathname)) return next();
  const twin = new URL(url);
  twin.pathname = `${url.pathname}index.md`;
  twin.search = "";
  return twin.origin === url.origin ? rewrite(twin) : next();
}
