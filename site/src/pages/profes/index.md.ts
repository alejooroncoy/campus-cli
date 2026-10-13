import type { APIRoute } from "astro";
import body from "../../html/profes/index.html?raw";
import { htmlToMarkdown } from "../../lib/html-to-markdown";

/**
 * The Markdown twin of the Campus page. See the homepage's endpoint
 * for why the pillar pages carry one.
 */
export const GET: APIRoute = () => {
  const markdown = [
    "# Opiniones de profesores en Campus",
    "",
    "> Consulta y comparte opiniones de profesores desde Campus. El asistente web y el conector MCP comparten cuenta y plan. También disponible por WhatsApp.",
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
