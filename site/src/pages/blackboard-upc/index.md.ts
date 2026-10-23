import type { APIRoute } from "astro";
import body from "../../html/blackboard-upc/index.html?raw";
import { htmlToMarkdown } from "../../lib/html-to-markdown";

/** A plain-text version lets assistants and readers use the same landing copy. */
export const GET: APIRoute = () => {
  // Native disclosure headings remain useful in text; decorative step numbers
  // must not duplicate the ordered list's own numbering.
  const readableBody = body
    .replace(/<span class="bb-guide__step-number"[^>]*>.*?<\/span>/g, "")
    .replace(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g, "<h3>$1</h3>")
    .replace(/<p\b/g, " <p");
  const markdown = [
    "# Blackboard UPC: acceso, tareas y notas",
    "",
    "> Acceso oficial al Aula Virtual UPC, guía de cursos, tareas y notas, y conexión opcional con IA mediante Campus.",
    "",
    "Fuente: https://campuscli.com/blackboard-upc/",
    "Alternativa gratuita para clientes de escritorio: https://campuscli.com/blackboard-cli/",
    "",
    "---",
    "",
    htmlToMarkdown(readableBody),
  ].join("\n");

  return new Response(`${markdown.trimEnd()}\n`, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};
