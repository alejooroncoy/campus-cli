import type { APIRoute } from "astro";
import body from "../../html/blackboard-upc/index.html?raw";
import { htmlToMarkdown } from "../../lib/html-to-markdown";

/** A plain-text version lets assistants and readers use the same landing copy. */
export const GET: APIRoute = () => {
  const markdown = [
    "# Blackboard UPC: tareas, notas y materiales con IA",
    "",
    "> Consulta tu Aula Virtual UPC desde ChatGPT o Claude con Campus.",
    "",
    "Fuente: https://campuscli.com/blackboard-upc/",
    "Alternativa gratuita para clientes de escritorio: https://campuscli.com/blackboard-cli/",
    "",
    "---",
    "",
    htmlToMarkdown(body),
  ].join("\n");

  return new Response(`${markdown.trimEnd()}\n`, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};
