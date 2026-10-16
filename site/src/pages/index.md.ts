import type { APIRoute } from "astro";
import body from "../html/index.html?raw";
import { htmlToMarkdown } from "../lib/html-to-markdown";

/**
 * The Markdown twin of the homepage.
 *
 * It is the page most likely to be fetched when someone asks an assistant what
 * Campus is, and it was the last one without a plain-text version: the answer
 * came from whatever the crawler managed to pull out of a page built around a
 * diagram and a pricing block.
 */
export const GET: APIRoute = () => {
  const markdown = [
    "# Campus",
    "",
    "> Campus para UPC: Campus Free (S/0) y Campus Plus. Los primeros 25 usuarios de pago: S/5 el primer mes, luego S/10 al mes. Nuevas suscripciones después de ese grupo: S/15 al mes desde el primer mes.",
    "",
    "Fuente: https://campuscli.com/",
    "Campus CLI: https://campuscli.com/campus-cli/",
    "Opiniones de profesores: https://campuscli.com/profes/",
    "Texto completo del sitio: https://campuscli.com/llms-full.txt",
    "",
    "---",
    "",
    htmlToMarkdown(body),
  ].join("\n");

  return new Response(`${markdown.trimEnd()}\n`, {
    headers: {
      // Without an explicit type the file downloads instead of being read, and
      // the site sends X-Content-Type-Options: nosniff, so nothing recovers it.
      "content-type": "text/markdown; charset=utf-8",
    },
  });
};
