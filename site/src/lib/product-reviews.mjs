export const productReviewUrl = "https://campuscli.com/blackboard-chatgpt/";
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const jsonForHtml = value => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

export function validPublicReviews(data) {
  return data && Number.isSafeInteger(data.reviewCount) && data.reviewCount >= 0
    && Number.isSafeInteger(data.page) && data.page >= 1 && data.page <= 999999
    && data.pageSize === 10 && Array.isArray(data.reviews) && data.reviews.length <= 10
    && data.reviews.length <= data.reviewCount
    && (data.reviewCount === 0 ? data.ratingValue === null && data.reviews.length === 0
      : typeof data.ratingValue === "number" && Number.isFinite(data.ratingValue) && data.ratingValue >= 1 && data.ratingValue <= 5)
    && data.reviews.every(r => /^\d+$/.test(r.id) && typeof r.publicName === "string" && r.publicName.length >= 2 && r.publicName.length <= 80
      && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5
      && typeof r.text === "string" && r.text.length >= 10 && r.text.length <= 1500
      && Number.isFinite(Date.parse(r.createdAt)) && Number.isFinite(Date.parse(r.updatedAt)));
}

export function renderProductReviews(data) {
  const header = `<section data-campus-product-reviews id="resenas" class="product-reviews" aria-labelledby="product-reviews-title">
    <div class="product-reviews__heading"><div><h2 id="product-reviews-title">Opiniones sobre Campus</h2><p>Lo que cuentan quienes usan Campus.</p></div><a class="opinion-button" href="/opiniones-campus/#compartir">Escribir una opinión</a></div>`;
  if (!data) return `${header}<div class="product-reviews__empty"><p>No pudimos cargar las opiniones.</p><p>Inténtalo de nuevo en unos momentos.</p></div></section>`;
  if (!data.reviewCount) return `${header}<div class="product-reviews__empty"><span class="product-reviews__empty-star" aria-hidden="true">☆</span><h3>La primera opinión puede ser la tuya</h3><p>¿Ya probaste Campus? Cuéntanos qué te pareció.</p></div></section>`;
  const average = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(data.ratingValue);
  const totalPages = Math.ceil(data.reviewCount / data.pageSize);
  const items = data.reviews.map(r => {
    const date = new Date(r.createdAt);
    const dateText = new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeZone: "America/Lima" }).format(date);
    return `<article id="review-${escapeHtml(r.id)}" class="product-reviews__item">
      <header><strong>${escapeHtml(r.publicName)}</strong><span aria-label="${r.rating} de 5 estrellas">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)} <span class="product-reviews__score">${r.rating}/5</span></span></header>
      <p class="product-reviews__text">${escapeHtml(r.text)}</p>
      <time datetime="${date.toISOString()}">${dateText}</time>
    </article>`;
  }).join("");
  const pageLink = (page, text) => `<a href="?page=${page}#resenas">${text}</a>`;
  const pagination = totalPages > 1 ? `<nav class="product-reviews__pages" aria-label="Páginas de reseñas">
    ${data.page > 1 ? pageLink(Math.min(data.page - 1, totalPages), "← Anteriores") : ""}
    <span>Página ${data.page} de ${totalPages}</span>
    ${data.page < totalPages ? pageLink(data.page + 1, "Siguientes →") : ""}
  </nav>` : "";
  return `${header}<p class="product-reviews__summary"><strong>${average} de 5</strong> · ${data.reviewCount} ${data.reviewCount === 1 ? "reseña" : "reseñas"}</p>
    ${items || "<p>No hay opiniones en esta página.</p>"}${pagination}</section>`;
}

export function renderBlackboardReviewsPage(template, data, requireProduct = true) {
  if (data !== null && !validPublicReviews(data)) throw new Error("Invalid public reviews");
  const marker = /<section data-campus-product-reviews\b[\s\S]*?<\/section>/;
  if (!marker.test(template)) throw new Error("Missing reviews section");
  let foundProduct = false;
  const html = template.replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g, (script, json) => {
    const schema = JSON.parse(json);
    if (schema["@type"] !== "Product" || schema.url !== productReviewUrl) return script;
    foundProduct = true;
    schema["@id"] = `${productReviewUrl}#product`;
    delete schema.review;
    delete schema.aggregateRating;
    if (data?.reviewCount) {
      schema.aggregateRating = { "@type": "AggregateRating", ratingValue: data.ratingValue, reviewCount: data.reviewCount, bestRating: 5, worstRating: 1 };
      if (data.reviews.length) schema.review = data.reviews.map(r => ({
        "@type": "Review", "@id": `${productReviewUrl}#review-${r.id}`,
        author: { "@type": "Person", name: r.publicName },
        reviewBody: r.text, datePublished: new Date(r.createdAt).toISOString(), dateModified: new Date(r.updatedAt).toISOString(),
        reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
      }));
    }
    return `<script type="application/ld+json">${jsonForHtml(schema)}</script>`;
  });
  if (requireProduct && !foundProduct) throw new Error("Missing Blackboard product");
  // A callback keeps user-authored $& and $' literal in String.replace.
  const section = renderProductReviews(data);
  const publicSection = section.replace('<a class="opinion-button" href="/opiniones-campus/#compartir">Escribir una opinión</a>', '<button class="opinion-button" type="button" data-opinion-open>Escribir una opinión</button>');
  return html.replace(marker, () => requireProduct ? section : publicSection.replace('<h2 id="product-reviews-title">', '<h1 id="product-reviews-title">').replace("</h2>", "</h1>"));
}
