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
 * Only a GET for a page URL (trailing slash) that asks for Markdown and whose
 * index.md really exists is rewritten. Anything else, including a page without
 * a Markdown twin such as /app/, goes through untouched.
 */
const wantsMarkdown = (accept: string) =>
  accept
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .some((part) => part === "text/markdown" || part.startsWith("text/markdown;"));

export default async function proxy(request: Request) {
  if (request.method !== "GET" || !wantsMarkdown(request.headers.get("accept") ?? "")) return next();

  const url = new URL(request.url);
  if (!url.pathname.endsWith("/")) return next();

  const twin = new URL(`${url.pathname}index.md`, url.origin);
  try {
    const probe = await fetch(twin, { method: "HEAD" });
    if (probe.ok) return rewrite(twin);
  } catch {
    // If the probe fails, serve the page as HTML: a normal answer beats an error.
  }
  return next();
}
