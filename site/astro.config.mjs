// @ts-check
import { readFileSync, readdirSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import { turnitinServiceEnabled, libraryServiceEnabled } from "./feature-flags.mjs";

/**
 * Real modification dates for the sitemap.
 *
 * The sitemap shipped with only <loc>, so a crawler had no signal about when
 * anything changed and decided on its own when to come back. That is the
 * difference between an updated guide being re-read next week and next month.
 *
 * The dates are real, never the build time. Stamping "today" on eighteen pages
 * every deploy is a claim that everything changed, and a crawler that checks
 * twice learns to ignore the field entirely.
 */
const lastmod = new Map();

// Guides carry the date in their own frontmatter, which is the one the page
// already shows as "Actualizado el ...".
for (const file of readdirSync("./src/content/blog")) {
  if (!file.endsWith(".md")) continue;
  const raw = readFileSync(`./src/content/blog/${file}`, "utf8");
  const updated = raw.match(/^updated:\s*"?(\d{4}-\d{2}-\d{2})"?/m)?.[1];
  const draft = /^draft:\s*true/m.test(raw);
  if (updated && !draft) lastmod.set(`/blog/${file.replace(/\.md$/, "")}/`, updated);
}

// El resto sale de un cuerpo de html: su fecha es la del último commit que lo
// tocó. No se usa el mtime del archivo: en un checkout nuevo (Vercel) es la hora
// del clon, y eso marcaba como cambiadas el día del despliegue a 21 páginas que
// no cambiaron. Con un clon superficial el último commit visible tampoco es
// confiable, así que esas páginas van sin fecha (VERCEL_DEEP_CLONE=true trae la
// historia completa).
const fullHistory = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim() === "false";
  } catch {
    return false;
  }
})();
/** @param {string} route @param {string} path */
const fromFile = (route, path) => {
  if (!fullHistory) return;
  try {
    const date = execFileSync("git", ["log", "-1", "--format=%cs", "--", path], { encoding: "utf8" }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) lastmod.set(route, date);
  } catch {
    // Una página sin fecha es honesta; una fecha inventada no.
  }
};
// Fecha que la propia página declara (const updated = "AAAA-MM-DD"), para que el
// sitemap y la «última actualización» impresa no se contradigan.
/** @param {string} route @param {string} path */
const fromDeclared = (route, path) => {
  try {
    const date = readFileSync(path, "utf8").match(/^const updated = "(\d{4}-\d{2}-\d{2})";/m)?.[1];
    if (date) lastmod.set(route, date);
    else fromFile(route, path);
  } catch {
    fromFile(route, path);
  }
};

fromFile("/", "./src/html/index.html");
fromFile("/upc-compra-ucal/", "./src/data/ucal.ts");
fromFile("/campus-cli/", "./src/html/campus-cli/index.html");
fromFile("/profes/", "./src/html/profes/index.html");
fromFile("/campito/", "./src/html/campito/index.html");
// The service page's content revision, preserved across unrelated deploys.
lastmod.set("/turnitin/", "2026-10-15");
// The tools are .astro pages (their text lives in the page and in src/lib/apa-tool-content.ts), so there is
// no html body to stat, and a file's mtime on a fresh checkout is the checkout time. These are the dates
// of the last real content change; bump one when its page changes.
lastmod.set("/herramientas/formato-apa-7/", "2026-10-30");
lastmod.set("/herramientas/normas-apa-7ma-edicion/", "2026-10-30");
lastmod.set("/herramientas/", "2026-10-30");
fromFile("/blackboard-upc/", "./src/html/blackboard-upc/index.html");
fromFile("/blackboard-chatgpt/", "./src/html/blackboard-chatgpt/index.html");
fromFile("/blackboard-mcp/", "./src/html/blackboard-mcp/index.html");
fromFile("/blackboard-cli/", "./src/html/blackboard-cli/index.html");
fromFile("/blog/", "./src/html/blog/index.html");
for (const file of readdirSync("./src/html/blackboard-mcp/clients")) {
  if (!file.endsWith(".html")) continue;
  const slug = file.replace(/\.html$/, "");
  fromFile(`/blackboard-mcp/${slug}/`, `./src/html/blackboard-mcp/clients/${file}`);
}

// Las páginas legales imprimen su propia «última actualización»; el sitemap usa
// esa misma fecha.
for (const slug of ["terminos", "privacidad", "no-afiliacion", "cancelaciones-y-devoluciones"]) {
  fromDeclared(`/${slug}/`, `./src/pages/${slug}/index.astro`);
}

export default defineConfig({
  site: "https://campuscli.com",
  // The live URLs all end in a slash and are already indexed. Anything else
  // here would silently change every canonical on the site.
  // Local API routes accept the same URLs used by the hosted app.
  trailingSlash: process.env.NODE_ENV === "development" && process.env.CAMPUS_DEV_APP_ORIGIN ? "ignore" : "always",
  vite: {
    build: {
      // The deployed CSP blocks inline JavaScript, including small Astro entries.
      // Keep scripts external while preserving Vite's defaults for other assets.
      assetsInlineLimit: (filePath) => filePath.endsWith(".js") ? false : undefined,
    },
    server: {
      proxy: process.env.CAMPUS_DEV_APP_ORIGIN ? {
        "/api/app": { target: process.env.CAMPUS_DEV_APP_ORIGIN, changeOrigin: true },
      } : undefined,
    },
  },
  build: { format: "directory" },
  integrations: [
    { name: "campus-library-robots", hooks: { "astro:build:done": ({ dir }) => { if (libraryServiceEnabled) appendFileSync(new URL("robots.txt", dir), "\nSitemap: https://campuscli.com/biblioteca/sitemap.xml\n"); } } },
    react(),
    sitemap({
      filter: (page) => !new URL(page).pathname.startsWith("/ucal/avisos/") && !new URL(page).pathname.startsWith("/biblioteca/plantilla/") && !new URL(page).pathname.startsWith("/app/") && !new URL(page).pathname.startsWith("/profes/plantilla/") && (turnitinServiceEnabled || !new URL(page).pathname.startsWith("/turnitin/")),
      // A sitemap has no line breaks, so a browser shows one unreadable run of
      // text and the file looks broken even when it validates. Crawlers ignore
      // the stylesheet; it is there so a person can check the list.
      xslURL: "/sitemap.xsl",
      customSitemaps: ["https://campuscli.com/profes/sitemap.xml"],
      serialize(item) {
        const route = item.url.replace("https://campuscli.com", "");
        const date = lastmod.get(route);
        // No invented date: an entry without lastmod is honest, a wrong one
        // teaches the crawler to distrust the file.
        return date ? { ...item, lastmod: date } : item;
      },
    }),
  ],
});
