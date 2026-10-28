import { readFile } from "node:fs/promises";
import { renderBlackboardReviewsPage, validPublicReviews } from "../src/lib/product-reviews.mjs";

export async function blackboardPage(request, { fetchReviews = fetch, loadTemplate = view => readFile(new URL(view === "opiniones" ? "../.generated/opiniones-campus.html" : "../.generated/blackboard-chatgpt.html", import.meta.url), "utf8") } = {}) {
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Método no permitido", { status: 405, headers: { Allow: "GET, HEAD" } });
  const url = new URL(request.url);
  const page = url.searchParams.get("page") ?? "1";
  if (!/^[1-9]\d{0,5}$/.test(page)) return new Response("Página inválida", { status: 400, headers: { "Cache-Control": "no-store" } });
  const view = url.searchParams.get("view");
  const template = await loadTemplate(view);
  let data = null;
  try {
    // Server-configured upstream only; never forward visitors' cookies or auth.
    const upstream = new URL("/api/app/blackboard-reviews", process.env.CAMPUS_REVIEWS_API_ORIGIN || "https://profes.campuscli.com");
    upstream.searchParams.set("page", page);
    if (view !== "opiniones") upstream.searchParams.set("scope", "blackboard");
    const response = await fetchReviews(upstream, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!response.ok) throw new Error("Reviews unavailable");
    const body = await response.json();
    if (!validPublicReviews(body) || body.page !== Number(page)) throw new Error("Invalid reviews response");
    data = body;
  } catch { /* Keep the product page available without inventing reviews. */ }
  const html = renderBlackboardReviewsPage(template, data, view !== "opiniones");
  return new Response(request.method === "HEAD" ? null : html, { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": data ? "public, max-age=0, s-maxage=60" : "no-store",
    "Vary": "Accept, Accept-Encoding",
  } });
}

export default { fetch: blackboardPage };
