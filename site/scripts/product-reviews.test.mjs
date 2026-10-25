import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { renderBlackboardReviewsPage, validPublicReviews, productReviewUrl } from "../src/lib/product-reviews.mjs";
import { blackboardPage } from "../api/blackboard-chatgpt.js";

const template = `<html><head><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: "Campus para Blackboard UPC", url: productReviewUrl, offers: { "@type": "Offer", price: 5, priceCurrency: "PEN" } })}</script></head><body><section data-campus-product-reviews id="resenas">Fallback</section></body></html>`;
const review = { id: "3", publicName: "Ana P.", rating: 2, text: "Experiencia sintética: tarda, pero ayuda con mis tareas.", createdAt: "2026-10-21T12:00:00Z", updatedAt: "2026-10-21T13:00:00Z" };
const data = { reviews: [review], reviewCount: 1, ratingValue: 2, page: 1, pageSize: 10 };
const schemaOf = html => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

test("visible reviews and Google JSON-LD use the same rating, author, text and dates", () => {
  const html = renderBlackboardReviewsPage(template, data);
  const schema = schemaOf(html);
  assert.match(html, /2 de 5<\/strong> · 1 reseña/);
  assert.ok(html.includes(review.text));
  assert.equal(schema["@id"], `${productReviewUrl}#product`);
  assert.equal(schema.aggregateRating.ratingValue, 2);
  assert.equal(schema.aggregateRating.reviewCount, 1);
  assert.equal(schema.review[0].author.name, review.publicName);
  assert.equal(schema.review[0].reviewBody, review.text);
  assert.equal(schema.review[0].reviewRating.ratingValue, review.rating);
  assert.equal(schema.review[0].datePublished, new Date(review.createdAt).toISOString());
  assert.equal(schema.offers.price, 5);
});

test("empty and unavailable feeds never invent ratings or retain stale markup", () => {
  const populated = renderBlackboardReviewsPage(template, data);
  for (const empty of [null, { reviews: [], reviewCount: 0, ratingValue: null, page: 1, pageSize: 10 }]) {
    const html = renderBlackboardReviewsPage(populated, empty);
    assert.equal(schemaOf(html).aggregateRating, undefined);
    assert.equal(schemaOf(html).review, undefined);
    assert.ok(!html.includes(review.text));
    assert.match(html, empty === null ? /No pudimos cargar/ : /Todavía no hay reseñas/);
  }
});

test("untrusted review text cannot escape HTML or JSON-LD, including replacement tokens", () => {
  const text = `Texto de prueba </script><img src=x onerror=alert(1)> & $& $' $\u0060`;
  const html = renderBlackboardReviewsPage(template, { ...data, reviews: [{ ...review, text }] });
  assert.equal(schemaOf(html).review[0].reviewBody, text);
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("</script><img"));
  assert.match(html, /&lt;\/script&gt;&lt;img/);
  assert.equal((html.match(/data-campus-product-reviews/g) ?? []).length, 1);
  assert.equal((html.match(/<script /g) ?? []).length, 1);
});

test("pagination keeps total aggregate and provides links to remaining reviews", () => {
  const html = renderBlackboardReviewsPage(template, { ...data, reviewCount: 23, ratingValue: 3.27, page: 2 });
  assert.match(html, /23 reseñas/); assert.match(html, /Página 2 de 3/);
  assert.match(html, /\?page=1#resenas/); assert.match(html, /\?page=3#resenas/);
  assert.equal(schemaOf(html).aggregateRating.reviewCount, 23);
  assert.equal(schemaOf(html).review.length, 1);
  assert.equal(validPublicReviews({ ...data, ratingValue: 6 }), false);
  assert.equal(validPublicReviews({ ...data, reviews: [{ ...review, rating: 0 }] }), false);
});

test("server rendering forwards no credentials and handles upstream failure without caching a false empty state", async () => {
  const loadTemplate = async () => template;
  let called = false;
  const response = await blackboardPage(new Request(productReviewUrl, { headers: { cookie: "private=secret", authorization: "Bearer private" } }), {
    loadTemplate,
    fetchReviews: async (url, options) => {
      called = true;
      assert.equal(url.pathname, "/api/app/blackboard-reviews");
      assert.equal(url.searchParams.get("page"), "1");
      assert.deepEqual(options.headers, { Accept: "application/json" });
      return Response.json(data);
    },
  });
  assert.equal(called, true); assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /s-maxage=60/);
  assert.equal(schemaOf(await response.text()).aggregateRating.reviewCount, 1);
  for (const upstream of [async () => { throw new Error("offline"); }, async () => Response.json({ error: "unavailable" }, { status: 503 }), async () => Response.json({ ...data, page: 99 })]) {
    const fallback = await blackboardPage(new Request(productReviewUrl), { loadTemplate, fetchReviews: upstream });
    assert.equal(fallback.headers.get("cache-control"), "no-store");
    const html = await fallback.text();
    assert.equal(schemaOf(html).aggregateRating, undefined);
    assert.match(html, /No pudimos cargar/);
  }
  assert.equal((await blackboardPage(new Request(`${productReviewUrl}?page=0`), { loadTemplate })).status, 400);
  assert.equal((await blackboardPage(new Request(productReviewUrl, { method: "POST" }), { loadTemplate })).status, 405);
});

test("built page contains the SSR template marker and deployment routes render HTML before the static fallback", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.functions["api/blackboard-chatgpt.js"].includeFiles, ".generated/{blackboard-chatgpt,opiniones-campus}.html");
  const routes = config.rewrites.filter(r => r.source === "/blackboard-chatgpt/");
  assert.equal(routes[0].destination, "/api/markdown-not-found");
  assert.equal(routes[1].destination, "/api/blackboard-chatgpt");
  await assert.rejects(access(new URL("../dist/blackboard-chatgpt/index.html", import.meta.url)), { code: "ENOENT" });
  const built = await readFile(new URL("../.generated/blackboard-chatgpt.html", import.meta.url), "utf8");
  const html = renderBlackboardReviewsPage(built, data);
  assert.ok(html.includes(review.text));
  const product = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1])).find(s => s["@type"] === "Product");
  assert.equal(product.review[0].reviewRating.ratingValue, 2);
});

test("public opinions render without app shell or requiring a Product schema", async () => { const template = await readFile(new URL("../.generated/opiniones-campus.html", import.meta.url), "utf8"); const html = renderBlackboardReviewsPage(template, data, false); assert.ok(html.includes(review.text)); assert.ok(html.includes("Comparte tu opinión sobre Campus")); assert.ok(!html.includes("Navegación principal</aside>")); });
