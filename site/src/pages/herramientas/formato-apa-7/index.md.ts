import type { APIRoute } from "astro";
import { formatMarkdown } from "../../../lib/apa-tool-content";

/** Versión en Markdown de la página, para asistentes que la leen en vez de renderizarla. */
export const GET: APIRoute = () => {
  const markdown = [
    "# Formato APA 7.ª edición: revisa tu trabajo",
    "",
    "> Copia un texto, pégalo en tu IA y revisa interlineado, sangrías, márgenes, citas y referencias en APA 7.",
    "",
    "Fuente: https://campuscli.com/herramientas/formato-apa-7/",
    "",
    "---",
    "",
    formatMarkdown(),
  ].join("\n");

  return new Response(`${markdown.trimEnd()}\n`, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};
