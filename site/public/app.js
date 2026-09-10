document.documentElement.classList.add("js");

const dialog = document.querySelector(".founder-dialog");
const openFounder = document.querySelectorAll("[data-open-founder]");
const closeFounder = document.querySelector("[data-close-founder]");
const founderForm = document.querySelector("#founder-form");
const localPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const founderApi = localPreview
  ? "http://127.0.0.1:8787/v1/founders"
  : document.querySelector('meta[name="campus-founder-api"]')?.content || `${window.location.origin}/v1/founders`;
const turnstileSiteKey = document.querySelector('meta[name="campus-turnstile-site-key"]')?.content;
const turnstileSlot = document.querySelector(".turnstile-slot");
const formStatus = document.querySelector("#form-status");
const founderToast = document.querySelector("#founder-toast");
const submitButton = founderForm.querySelector('button[type="submit"]');
let turnstileToken = "";
let toastTimeout;
let turnstileLoading = false;
let turnstileWidgetId;

const siteHeader = document.querySelector(".site-header");

let headerFrame;
let headerCompact = false;
/* The pill is 24px shorter than the full header, so collapsing it shifts the
   page up. With a single threshold that shift can push the scroll back below
   the trigger and the header oscillates, so grow and shrink use separate
   marks and the gap between them is wider than the height it reclaims. */
const syncHeader = () => {
  const y = window.scrollY;
  if (!headerCompact && y > 96) headerCompact = true;
  else if (headerCompact && y < 40) headerCompact = false;
  siteHeader?.classList.toggle("is-scrolled", headerCompact);
  headerFrame = undefined;
};

window.addEventListener("scroll", () => {
  if (headerFrame) return;
  headerFrame = window.requestAnimationFrame(syncHeader);
}, { passive: true });
syncHeader();

const revealItems = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.14 });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const renderTurnstile = () => {
  if (!window.turnstile || turnstileWidgetId !== undefined) return;
  turnstileSlot.dataset.state = "";
  turnstileWidgetId = window.turnstile.render(turnstileSlot, {
    sitekey: turnstileSiteKey,
    callback: (token) => { turnstileToken = token; },
    "expired-callback": () => { turnstileToken = ""; },
    "error-callback": () => { turnstileToken = ""; },
  });
};

const loadTurnstile = () => {
  if (!turnstileSiteKey || !turnstileSlot || turnstileWidgetId !== undefined) return;
  if (window.turnstile) {
    renderTurnstile();
    return;
  }
  if (turnstileLoading) return;

  turnstileLoading = true;
  turnstileSlot.dataset.state = "loading";
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.onload = renderTurnstile;
  script.onerror = () => {
    turnstileSlot.dataset.state = "";
    formStatus.dataset.state = "error";
    formStatus.textContent = "No pudimos cargar la verificaci\u00f3n. Intenta de nuevo.";
  };
  document.head.append(script);
};

openFounder.forEach((button) => button.addEventListener("click", () => {
  const intent = button.dataset.founderIntent;
  const intentSelect = founderForm.elements.namedItem("intent");
  if (intent && intentSelect instanceof HTMLSelectElement) intentSelect.value = intent;
  dialog.showModal();
  loadTurnstile();
}));
closeFounder.addEventListener("click", () => dialog.close());

const showFounderToast = () => {
  window.clearTimeout(toastTimeout);
  founderToast.hidden = false;
  toastTimeout = window.setTimeout(() => { founderToast.hidden = true; }, 6000);
};

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

founderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(founderForm);
  formStatus.textContent = "";
  formStatus.dataset.state = "";
  submitButton.disabled = true;
  submitButton.textContent = "Enviando...";
  try {
    const response = await fetch(founderApi, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        whatsapp: data.get("whatsapp"),
        career: data.get("career"),
        cycle: data.get("cycle"),
        intent: data.get("intent"),
        website: data.get("website"),
        turnstileToken,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "No pudimos enviar tu solicitud.");
    founderForm.reset();
    turnstileToken = "";
    dialog.close();
    showFounderToast();
  } catch (error) {
    formStatus.dataset.state = "error";
    formStatus.textContent = error instanceof Error ? error.message : "No pudimos enviar tu solicitud.";
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Quiero mi acceso fundador <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><use href="assets/lucide.svg#arrow-right"></use></svg>';
  }
});

/* Star count next to the GitHub icon. Cached for an hour so a visitor
   browsing several pages spends one call against the anonymous API quota,
   and hidden entirely if the request fails — the icon still links out. */
const starsSlot = document.querySelector("[data-github-stars]");
if (starsSlot) {
  const githubLink = starsSlot.closest(".header-github");
  const cacheKey = "campus:github-stars";
  const cacheTtl = 3600000;
  // Compact notation so a five-figure count never widens the header: 1.2K, 107.5K.
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

  const renderStars = (stars) => {
    if (!Number.isFinite(stars)) return;
    starsSlot.textContent = compact.format(stars);
    starsSlot.hidden = false;
    githubLink.classList.add("has-stars");
    githubLink.setAttribute("aria-label", `Ver Campus en GitHub, ${stars} estrellas`);
  };

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached && Date.now() - cached.at < cacheTtl) renderStars(cached.stars);
  } catch { /* localStorage unavailable or corrupt: just refetch. */ }

  fetch("https://api.github.com/repos/alejooroncoy/campus-cli")
    .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
    .then((repo) => {
      renderStars(repo.stargazers_count);
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ stars: repo.stargazers_count, at: Date.now() }));
      } catch { /* Quota or private mode: the count still shows this visit. */ }
    })
    .catch(() => { /* Rate limited or offline: leave the plain icon. */ });
}

/**
 * Reading aids for long guides: a progress bar and a table of contents built
 * from the article's own headings.
 *
 * Both exist for the same reason. A student landing from Google on a 7-minute
 * guide has no idea how long it is or whether the part they need is in it, and
 * bounces. The contents list answers that before they scroll, and doubles as
 * SEO: the h2 ids it links are what Google reads to offer jump links straight
 * to a section in the results page.
 *
 * Generated rather than written into each article so the list can never drift
 * from the headings it describes.
 */
function setUpArticleReading() {
  const main = document.querySelector("main");
  // An explicit opt-in. This used to sniff for a `.byline`, which meant a page
  // could only have an index if it also had an author line — fine for a blog
  // post, wrong for the product and legal pages, which have headings worth
  // navigating and nobody to credit.
  if (!main || main.dataset.toc === undefined) return;

  const headings = [...main.querySelectorAll("h2[id]")].filter(
    // The summary box and the closing call to action are not places to jump to.
    (heading) => heading.id !== "resumen-title" && !heading.closest(".summary, .cta, .related"),
  );
  if (headings.length < 3) return;

  const progress = document.createElement("div");
  progress.className = "read-progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.prepend(progress);

  const nav = document.createElement("nav");
  nav.className = "toc";
  nav.setAttribute("aria-label", "Contenido de la guía");
  nav.innerHTML =
    // "En esta guía" is right for a blog post and wrong for the terms page, so
    // a page can name its own index.
    `<p class="toc__title">${main.dataset.tocTitle || "En esta guía"}</p><ol class="toc__list">` +
    // A single bar that travels between entries instead of one accent per
    // entry blinking on and off. It rides inside the list so it keeps its
    // place when the list itself scrolls, and it is an <li> because that is
    // the only element an <ol> may contain.
    '<li class="toc__marker" aria-hidden="true"></li>' +
    headings
      .map(
        (heading) =>
          `<li><a href="#${heading.id}">${heading.textContent.trim()}</a></li>`,
      )
      .join("") +
    "</ol>";

  // After the summary box where there is one, otherwise immediately above the
  // first section. Sitting straight under the h1 would cut the title off from
  // the sentence that introduces it, which is the one thing a reader needs
  // before deciding whether the index is worth using.
  const summary = main.querySelector(".summary");
  if (summary) summary.after(nav);
  else headings[0].before(nav);

  const links = new Map(
    [...nav.querySelectorAll("a")].map((link) => [link.getAttribute("href").slice(1), link]),
  );

  const marker = nav.querySelector(".toc__marker");

  /**
   * Scaled rather than resized: `height` is a layout property, and animating
   * it on every section change makes the browser lay the list out again mid
   * transition. A one-pixel bar stretched by transform costs nothing.
   */
  const placeMarker = () => {
    const current = nav.querySelector(".toc__list a.is-active");
    if (!current || !marker) return;
    const item = current.parentElement;
    marker.style.transform = `translateY(${item.offsetTop}px) scaleY(${item.offsetHeight})`;
  };

  let active;
  const setActive = (id) => {
    if (id === active) return;
    active = id;
    links.forEach((link, key) => link.classList.toggle("is-active", key === id));
    placeMarker();
  };

  // Mark the last heading that has passed the top of the screen — the section
  // being read — rather than the next one scrolling into view. An observer
  // reports only headings that cross its band, which leaves nothing marked
  // while reading a long section, so the position is computed on scroll.
  const markCurrent = () => {
    const line = 140;

    // Once the page bottoms out there is nothing left to scroll, so the last
    // headings can never cross the line and the closing sections would never
    // light up — you finish reading "Contacto" while the list still points at
    // whatever crossed the line last. At the end, the last heading on screen
    // is the one being read.
    const scrolled = window.scrollY + window.innerHeight;
    if (scrolled >= document.documentElement.scrollHeight - 4) {
      const reached = headings.filter(
        (heading) => heading.getBoundingClientRect().top < window.innerHeight,
      );
      setActive((reached[reached.length - 1] ?? headings[0]).id);
      return;
    }

    let current = headings[0];
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= line) current = heading;
    }
    setActive(current.id);
  };

  const onScroll = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
    progress.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
    markCurrent();
  };
  onScroll();
  // Placed before the transition is allowed, so the bar starts where it
  // belongs instead of flying in from the top of the list on load.
  placeMarker();
  requestAnimationFrame(() => nav.classList.add("toc--ready"));

  const reposition = () => {
    onScroll();
    placeMarker();
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  // Scrolling is not the only thing that moves a heading past the line: a
  // rotated phone reflows every one of them, and a page that arrives already
  // scrolled — a deep link, or coming back through history — settles after
  // this runs and then never fires a scroll event to correct itself.
  window.addEventListener("resize", reposition, { passive: true });
  window.addEventListener("load", reposition);
  // And the page itself can grow after the last scroll event — a lazy image
  // below the fold lands, the document gets taller, and the position computed
  // a moment ago no longer describes where the reader is.
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(reposition).observe(document.body);
  }

  addPageActions();
}

/**
 * "Copiar página", the way documentation sites do it.
 *
 * Same idea as the docs of the assistants our students already use: one button
 * by the title that hands the article over as Markdown, plus a way to open it
 * straight in ChatGPT or Claude. Pasting a rendered page makes the model guess
 * which parts were the article; handing it the Markdown we already publish
 * means the answer it gives is built from our text, credited to our url.
 */
function addPageActions() {
  const declared = document.querySelector('link[rel="alternate"][type="text/markdown"]');
  const heading = document.querySelector("main h1");
  if (!declared || !heading) return;

  // Resolve against the page being read so this also works on a preview build.
  const source = new URL(declared.href.split("/").pop(), location.href);
  const svg = (path) =>
    `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const copyIcon = svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>');
  const checkIcon = svg('<path d="M20 6 9 17l-5-5"/>');
  const caret = svg('<path d="m6 9 6 6 6-6"/>');

  const ask = encodeURIComponent(
    `Lee ${source.href} y respóndeme sobre esta guía de Blackboard UPC.`,
  );

  const actions = document.createElement("div");
  actions.className = "page-actions";
  actions.innerHTML = `
    <button type="button" class="page-actions__main" data-copy>${copyIcon}<span>Copiar página</span></button>
    <button type="button" class="page-actions__toggle" aria-expanded="false" aria-label="Más opciones">${caret}</button>
    <div class="page-actions__menu" hidden>
      <button type="button" data-copy>${copyIcon}<span><strong>Copiar como Markdown</strong>Para pegarlo en cualquier asistente</span></button>
      <a href="${source.href}"><span><strong>Ver como Markdown</strong>Abre el texto plano de esta guía</span></a>
      <a href="https://chatgpt.com/?q=${ask}" target="_blank" rel="noreferrer"><span><strong>Abrir en ChatGPT</strong>Pregunta sobre esta guía</span></a>
      <a href="https://claude.ai/new?q=${ask}" target="_blank" rel="noreferrer"><span><strong>Abrir en Claude</strong>Pregunta sobre esta guía</span></a>
    </div>`;
  // Same row as the category label, pushed right — sitting above the title
  // shoved the h1 down and read as part of the article.
  const eyebrow = document.querySelector("main .eyebrow");
  if (eyebrow) {
    const row = document.createElement("div");
    row.className = "article-head";
    eyebrow.before(row);
    row.append(eyebrow, actions);
  } else {
    heading.before(actions);
  }

  const menu = actions.querySelector(".page-actions__menu");
  const toggle = actions.querySelector(".page-actions__toggle");
  const setOpen = (open) => {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => setOpen(menu.hidden));
  // Any click outside closes it, including one on the article itself.
  document.addEventListener("click", (event) => {
    if (!actions.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });

  const label = actions.querySelector(".page-actions__main span");
  let resetAt;
  const copy = async () => {
    setOpen(false);
    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error(String(response.status));
      await navigator.clipboard.writeText(await response.text());
      actions.classList.add("is-done");
      label.textContent = "Copiado";
    } catch {
      // Say so rather than pretend: a silent failure leaves the student
      // pasting whatever was in the clipboard before.
      label.textContent = "No se pudo copiar";
    }
    clearTimeout(resetAt);
    resetAt = setTimeout(() => {
      actions.classList.remove("is-done");
      label.textContent = "Copiar página";
    }, 2200);
  };
  actions.querySelectorAll("[data-copy]").forEach((button) => button.addEventListener("click", copy));
}

setUpArticleReading();

// WebMCP is progressive enhancement: browsers without the experimental API get
// exactly the same site, while an agent-enabled browser can discover the two
// safe actions that a visitor can already perform from the navigation.
function provideWebMcpContext() {
  const modelContext = navigator.modelContext;
  if (!modelContext) return;

  const sections = {
    inicio: { href: "/", label: "Campus Plus" },
    profesores: { href: "/profes/", label: "Campus Profes" },
    blackboard: { href: "/blackboard-mcp/", label: "Blackboard MCP" },
  };

  const tools = [
      {
        name: "campus_get_overview",
        description: "Obtiene una descripción breve de Campus Plus, Campus Profes y Blackboard MCP para UPC.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: () => ({
          content: [{
            type: "text",
            text: "Campus reúne Campus Profes para comparar docentes y horarios antes de matricularte, y Blackboard MCP para consultar cursos, tareas, notas y materiales con la propia sesión universitaria del estudiante.",
          }],
        }),
      },
      {
        name: "campus_open_section",
        description: "Abre una sección pública de Campus en la pestaña actual.",
        inputSchema: {
          type: "object",
          properties: {
            section: {
              type: "string",
              enum: Object.keys(sections),
              description: "La sección pública que se quiere abrir.",
            },
          },
          required: ["section"],
          additionalProperties: false,
        },
        execute: ({ section }) => {
          const destination = sections[section];
          if (!destination) {
            return { content: [{ type: "text", text: "La sección solicitada no existe." }], isError: true };
          }
          window.location.assign(destination.href);
          return { content: [{ type: "text", text: `Abriendo ${destination.label}.` }] };
        },
      },
  ];

  // `registerTool` is the imperative API exposed by current WebMCP browsers.
  // Keep the earlier `provideContext` shape as a fallback for proposal builds
  // that have not yet adopted the imperative method.
  if (typeof modelContext.registerTool === "function") {
    tools.forEach((tool) => modelContext.registerTool(tool));
  } else if (typeof modelContext.provideContext === "function") {
    modelContext.provideContext({ tools });
  }
}

provideWebMcpContext();
