// @ts-check
import { readFileSync, readdirSync, statSync } from "node:fs";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

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

// Everything else is rendered from a body of html, so the file's own mtime is
// the honest answer to "when did this page last change".
const fromFile = (route, path) => {
  try {
    lastmod.set(route, statSync(path).mtime.toISOString().slice(0, 10));
  } catch {
    // A page whose source moved simply goes without a date, which is the same
    // state the whole sitemap was in before.
  }
};

fromFile("/", "./src/html/index.html");
fromFile("/campus-cli/", "./src/html/campus-cli/index.html");
fromFile("/profes/", "./src/html/profes/index.html");
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

// The legal pages keep their body inside the .astro itself, so that file is
// the source whose date matters. It is also the date the page prints as its
// own "última actualización", so the two cannot disagree.
for (const slug of ["terminos", "privacidad", "no-afiliacion"]) {
  fromFile(`/${slug}/`, `./src/pages/${slug}/index.astro`);
}

export default defineConfig({
  site: "https://campuscli.com",
  // The live URLs all end in a slash and are already indexed. Anything else
  // here would silently change every canonical on the site.
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [
    sitemap({
      // A sitemap has no line breaks, so a browser shows one unreadable run of
      // text and the file looks broken even when it validates. Crawlers ignore
      // the stylesheet; it is there so a person can check the list.
      xslURL: "/sitemap.xsl",
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
