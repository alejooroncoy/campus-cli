import type { APIRoute } from "astro";
import { normasMeta, normasMarkdown } from "../../../lib/apa-tool-content";

/** Versión en Markdown de la página, para asistentes que la leen en vez de renderizarla. */
export const GET: APIRoute = () => {
  const markdown = [
    `# ${normasMeta.title}`,
    "",
    `> ${normasMeta.description}`,
    "",
    `Fuente: ${normasMeta.canonical}`,
    "",
    "---",
    "",
    normasMarkdown(),
  ].join("\n");

  return new Response(`${markdown.trimEnd()}\n`, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};
