import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

const fallback = `# Página no encontrada | Campus

La ruta solicitada no existe.

- [Inicio](https://campuscli.com/)
- [Opiniones de profesores en Campus](https://campuscli.com/profes/)
- [Blackboard MCP](https://campuscli.com/blackboard-mcp/)
- [Mapa del sitio](https://campuscli.com/sitemap.xml)
- [Índice para agentes](https://campuscli.com/.well-known/ard.json)
`;

const outputDirectory = resolve(process.cwd(), "dist");

function markdownFileFor(pathname) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const cleanPath = decodedPath.replace(/^\/+|\/+$/g, "");
  const relativePath = decodedPath.endsWith(".md")
    ? decodedPath.slice(1)
    : cleanPath ? `${cleanPath}/index.md` : "index.md";
  const file = resolve(outputDirectory, relativePath);

  return file.startsWith(`${outputDirectory}${sep}`) ? file : null;
}

export default {
  async fetch(request) {
    const file = markdownFileFor(new URL(request.url).pathname);

    if (file) {
      try {
        const markdown = await readFile(file, "utf8");
        return new Response(markdown, {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
            Vary: "Accept, Accept-Encoding",
          },
        });
      } catch (error) {
        if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
      }
    }

    return new Response(fallback, {
      status: 404,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
        Vary: "Accept, Accept-Encoding",
      },
    });
  },
};
