import type { APIRoute } from "astro";
import rawBody from "../../html/profes/index.html?raw";
import { includeCampusFeedback } from "../../lib/campus-feedback";
const body = includeCampusFeedback(rawBody);
import { htmlToMarkdown } from "../../lib/html-to-markdown";

/**
 * The Markdown twin of the Campus page. See the homepage's endpoint
 * for why the pillar pages carry one.
 */
export const GET: APIRoute = () => {
  const markdown = [
    "# Opiniones de profesores UPC por curso",
    "",
    "> Consulta calificaciones y comentarios de estudiantes UPC. Busca por profesor o curso en el catálogo de Campus.",
    "",
    "Fuente: https://campuscli.com/profes/",
    "",
    "---",
    "",
    htmlToMarkdown(body),
  ].join("\n");

  return new Response(`${markdown.trimEnd()}\n`, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};
