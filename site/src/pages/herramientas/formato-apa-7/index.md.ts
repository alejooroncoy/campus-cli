import type { APIRoute } from "astro";
import { formatMeta, formatMarkdown } from "../../../lib/apa-tool-content";

/** Versión en Markdown de la página, para asistentes que la leen en vez de renderizarla. */
export const GET: APIRoute = () => {
  const markdown = [
    `# ${formatMeta.title}`,
    "",
    `> ${formatMeta.description}`,
    "",
    `Fuente: ${formatMeta.canonical}`,
    "",
    "---",
    "",
    formatMarkdown(),
  ].join("\n");

  return new Response(`${markdown.trimEnd()}\n`, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};
