import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

/**
 * The Markdown twin of the blog hub.
 *
 * Built from the collection rather than from the hub's html, because the hub
 * is hand-maintained markup: an article added to the collection but not to the
 * hub would silently be missing here too. This way the index an assistant
 * reads is always the real list of what is published.
 */
export const GET: APIRoute = async () => {
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort((a, b) =>
    b.data.published.localeCompare(a.data.published),
  );

  const entries = posts.flatMap((post) => {
    const url = `https://campuscli.com/blog/${post.id}/`;
    return [
      `## ${post.data.title}`,
      "",
      post.data.description,
      "",
      `- Enlace: ${url}`,
      `- Markdown: ${url}index.md`,
      `- Publicado: ${post.data.published} · Actualizado: ${post.data.updated}`,
      ...(post.data.author ? [`- Autor: ${post.data.author}`] : []),
      "",
    ];
  });

  const markdown = [
    "# Guías para estudiantes UPC: Blackboard y matrícula",
    "",
    "> Guías sobre Blackboard UPC, inteligencia artificial y cómo estudiar con el Aula Virtual.",
    "",
    "Fuente: https://campuscli.com/blog/",
    "Blackboard UPC: acceso, tareas y notas: https://campuscli.com/blackboard-upc/",
    "Opiniones de profesores UPC por curso: https://campuscli.com/profes/",
    "Texto completo de todas las guías: https://campuscli.com/llms-full.txt",
    "",
    "---",
    "",
    ...entries,
  ].join("\n");

  return new Response(`${markdown.trimEnd()}\n`, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};
