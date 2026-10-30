import type { APIRoute } from "astro";
import { normasMarkdown } from "../../../lib/apa-tool-content";

/** Versión en Markdown de la página, para asistentes que la leen en vez de renderizarla. */
export const GET: APIRoute = () => {
  const markdown = [
    "# Normas APA 7.ª edición: lo esencial y qué cambió",
    "",
    "> Las normas APA 7.ª edición que más se usan en trabajos universitarios y qué cambió desde la 6.ª.",
    "",
    "Fuente: https://campuscli.com/herramientas/normas-apa-7ma-edicion/",
    "",
    "---",
    "",
    normasMarkdown(),
  ].join("\n");

  return new Response(`${markdown.trimEnd()}\n`, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};
