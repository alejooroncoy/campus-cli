import { next, rewrite } from "@vercel/functions";

/**
 * Content negotiation for the Markdown twins.
 *
 * Every page that has an index.md also says so with <link rel="alternate">, and
 * vercel.json already tries to answer `Accept: text/markdown` with a rewrite.
 * That rewrite never fires for a page that exists as a static file, because the
 * filesystem wins over `rewrites`. Routing Middleware runs before the cache and
 * before the filesystem, so it can do what the rewrite was meant to do.
 *
 * Only a GET or HEAD for a plain page path that prefers Markdown over HTML, and
 * whose index.md really exists, is rewritten. Anything else, including a page
 * without a Markdown twin such as /app/, goes through untouched.
 */

/** A page path made only of letter, digit, `_` and `-` segments, each followed by `/`. Rules out `//`, `\`, `%` and `.`. */
const PAGE_PATH = /^\/(?:[a-z0-9_-]+\/)*$/i;

/** The quality value of a media type in an Accept header, or 0 when it is absent. Wildcards are not counted. */
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

/** Markdown is served only when it is explicitly accepted and not ranked below HTML. */
export const prefersMarkdown = (accept: string) => {
  const markdown = quality(accept, "text/markdown");
  return markdown > 0 && markdown >= quality(accept, "text/html");
};

export default async function proxy(request: Request) {
  if ((request.method !== "GET" && request.method !== "HEAD") || !prefersMarkdown(request.headers.get("accept") ?? "")) return next();

  const url = new URL(request.url);
  if (!PAGE_PATH.test(url.pathname)) return next();

  const twin = new URL(url);
  twin.pathname = `${url.pathname}index.md`;
  twin.search = "";
  if (twin.origin !== url.origin) return next();

  try {
    // The probe goes through the same deployment, so a protected preview needs the caller's credentials too.
    const forwarded = new Headers();
    for (const name of ["cookie", "x-vercel-protection-bypass", "x-vercel-set-bypass-cookie"]) {
      const value = request.headers.get(name);
      if (value) forwarded.set(name, value);
    }
    const probe = await fetch(twin, { method: "HEAD", redirect: "manual", headers: forwarded, signal: AbortSignal.timeout(1500) });
    if (probe.status === 200) return rewrite(twin, { headers: { Vary: "Accept" } });
  } catch {
    // If the probe fails or times out, serve the page as HTML: a normal answer beats an error.
  }
  return next();
}
