import type { APIRoute } from "astro";
import body from "../../html/campus-cli/index.html?raw";
import { htmlToMarkdown } from "../../lib/html-to-markdown";

/**
 * The Markdown twin of the Campus CLI product page. See the homepage's
 * endpoint for why the pillar pages carry one.
 */
export const GET: APIRoute = () => {
  const markdown = [
    "# Campus CLI",
    "",
    "> Conecta tu IA a Campus por MCP: Blackboard UPC, transcripciones de clases, tu Mendeley y lectura experimental de fuentes académicas accesibles. Campus Free y Campus Plus.",
    "",
    "Fuente: https://campuscli.com/campus-cli/",
    "Texto completo del sitio: https://campuscli.com/llms-full.txt",
    "",
    "---",
    "",
    htmlToMarkdown(body),
  ].join("\n");

  return new Response(`${markdown.trimEnd()}\n`, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};
