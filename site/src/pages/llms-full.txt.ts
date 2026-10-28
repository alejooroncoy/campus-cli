import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import clients from "../data/mcp-clients.json";
import { htmlToMarkdown } from "../lib/html-to-markdown";
import rawHomeBody from "../html/index.html?raw";
import { publicHomeHtml, turnitinServiceEnabled } from "../../feature-flags.mjs";
const homeBody = publicHomeHtml(rawHomeBody);
import campusCliBody from "../html/campus-cli/index.html?raw";
import profesBody from "../html/profes/index.html?raw";
import turnitinBody from "../html/turnitin/index.html?raw";
import blackboardUpcBody from "../html/blackboard-upc/index.html?raw";
import chatgptBody from "../html/blackboard-chatgpt/index.html?raw";
import mcpBody from "../html/blackboard-mcp/index.html?raw";
import cliBody from "../html/blackboard-cli/index.html?raw";

/**
 * Every page of the site, end to end, in one plain-text file.
 *
 * An assistant answering "how do I connect Blackboard UPC to Cursor" can read
 * this in one request instead of crawling eighteen pages and hoping it found
 * them all. Cheap for us to serve, and it is the difference between being
 * summarised from a snippet and being quoted from the source.
 *
 * It used to carry only the blog, which left out both product pages, the seven
 * per-client setup guides and everything legal: more than half the site, and
 * the half that answers the question people actually ask.
 */

/** Read from the same html the pages render, so the two cannot drift. */
const bodies = import.meta.glob("../html/blackboard-mcp/clients/*.html", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const RULE = "=".repeat(72);

const section = (title: string, description: string, url: string, text: string) =>
  [RULE, `# ${title}`, "", `> ${description}`, "", `Fuente: ${url}`, "", text.trim()].join("\n");

export const GET: APIRoute = async () => {
  const products = [
    {
      title: "Turnitin: informes de similitud y escritura con IA",
      description: "IA o similitud S/10; ambos S/15 por documento. Procesamiento mediante Turnitin API. Entrega de 10 minutos a 1 hora tras validar el pago. Consulta disponibilidad en la app.",
      url: "https://campuscli.com/turnitin/",
      body: turnitinBody,
    },
    {
      title: "Campus: tu universidad en una conversación",
      description: "Asistente web y conector MCP con una sola cuenta, plan y saldo.",
      url: "https://campuscli.com/",
      body: homeBody,
    },
    {
      title: "Campus CLI: Blackboard UPC en tu asistente de IA o en la terminal",
      description: "Conexión MCP de Campus y alternativa CLI local de código abierto.",
      url: "https://campuscli.com/campus-cli/",
      body: campusCliBody,
    },
    {
      title: "Opiniones de profesores en Campus",
      description: "Función de Campus para consultar y compartir experiencias con profesores. Disponible desde la app web de Campus.",
      url: "https://campuscli.com/profes/",
      body: profesBody,
    },
    {
      title: "Blackboard UPC: tareas, notas y materiales con IA",
      description: "Consulta tu Aula Virtual UPC desde ChatGPT o Claude con Campus.",
      url: "https://campuscli.com/blackboard-upc/",
      body: blackboardUpcBody,
    },
    {
      title: "Blackboard UPC en ChatGPT, sin instalar nada",
      description:
        "El servicio de pago: un servidor que mantiene la conexión viva para ChatGPT y Claude en el navegador y en el móvil.",
      url: "https://campuscli.com/blackboard-chatgpt/",
      body: chatgptBody,
    },
    {
      title: "Blackboard MCP: el Aula Virtual UPC dentro de tu asistente de IA",
      description:
        "Qué puede consultar el conector, cómo trata la sesión de la universidad y qué límites tiene.",
      url: "https://campuscli.com/blackboard-mcp/",
      body: mcpBody,
    },
    {
      title: "Blackboard CLI: cursos, tareas y notas desde la terminal",
      description: "El mismo campus consultado por comandos, sin abrir el navegador.",
      url: "https://campuscli.com/blackboard-cli/",
      body: cliBody,
    },
  ].filter((page) => turnitinServiceEnabled || page.body !== turnitinBody).map((page) => section(page.title, page.description, page.url, htmlToMarkdown(page.body)));

  const perClient = Object.entries(clients).flatMap(([slug, data]) => {
    const body = bodies[`../html/blackboard-mcp/clients/${slug}.html`];
    if (!body) return [];
    return [section(data.title.split("|")[0].trim(), data.description, data.canonical, htmlToMarkdown(body))];
  });

  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort((a, b) =>
    b.data.published.localeCompare(a.data.published),
  );

  const guides = posts.map((post) => {
    const url = `https://campuscli.com/blog/${post.id}/`;
    const summary = post.data.summary?.length
      ? ["## En resumen", "", ...post.data.summary.map((line) => `- ${line.replace(/<[^>]+>/g, "")}`), ""]
      : [];
    const faq = post.data.faq?.length
      ? ["", "## Preguntas frecuentes", "", ...post.data.faq.flatMap((item) => [`### ${item.q}`, "", item.a, ""])]
      : [];
    return [
      RULE,
      `# ${post.data.title}`,
      "",
      `> ${post.data.description}`,
      "",
      `Fuente: ${url}`,
      `Actualizado: ${post.data.updated}`,
      ...(post.data.author ? [`Autor: ${post.data.author}`] : []),
      "",
      ...summary,
      post.body?.trim() ?? "",
      ...faq,
    ].join("\n");
  });

  const body = [
    "# Campus — el sitio completo en texto plano",
    "",
    "Campus es un asistente universitario independiente para estudiantes en Perú.",
    "El asistente web y el conector MCP usan la misma cuenta Campus. Free incluye 25 consultas de bienvenida en la web; Plus incluye 100 consultas diarias en la web e ilimitadas por MCP.",
    "Conecta cursos, tareas, materiales, notas de Mi UPC y opiniones de profesores.",
    "Calcula proyecciones para aprobar con notas y pesos oficiales publicados.",
    "Campus Plus por MCP permite guardar referencias elegidas en la cuenta personal de Mendeley autorizada por el estudiante. La lectura de fuentes es experimental: analiza texto completo accesible con evidencia de páginas o secciones; depende del proveedor y debe distinguir lectura parcial de revisión integral.",
    "Campus CLI ofrece además una alternativa local de código abierto.",
    "La consulta de profesores se usa desde la app web de Campus; es una función de Campus.",
    "Campus no está afiliado a UPC, Blackboard ni a los profesores que se califican.",
    "",
    "Este archivo reúne las funciones de Campus, las guías de conexión y el blog.",
    "Índice y enlaces: https://campuscli.com/llms.txt",
    "Aviso de no afiliación: https://campuscli.com/no-afiliacion/",
    "",
    "## Qué contiene",
    "",
    "1. Campus: asistente web, conector MCP y opiniones de profesores, con cuenta y plan comunes.",
    "   Campus CLI: alternativa local de código abierto." + (turnitinServiceEnabled ? " Turnitin: servicio por documento." : ""),
    "2. Conexión por asistente: Cursor, Claude Code, Claude Desktop, Codex,",
    "   GitHub Copilot, Windsurf, y la comparativa de servidores MCP.",
    "3. Guías del blog.",
    "",
    ...products,
    ...perClient,
    ...guides,
    // Listed rather than inlined. Their bodies live inside .astro files with
    // template expressions, so there is no raw html to convert, and a legal
    // text half-transcribed by a converter is worse than a link to the real
    // one. The URLs are here so a model knows they exist and where to look.
    RULE,
    "# Páginas legales",
    "",
    "El texto completo vive en cada página. Se enlazan aquí para que quede",
    "constancia de que existen y de qué cubre cada una.",
    "",
    "- Términos y condiciones: https://campuscli.com/terminos/",
    "  Qué es el servicio, cómo accede al campus, qué se guarda y por cuánto tiempo.",
    "- Política de privacidad: https://campuscli.com/privacidad/",
    "  Datos tratados y finalidad, bajo la Ley N.º 29733 de protección de datos personales (Perú).",
    "- Aviso de no afiliación: https://campuscli.com/no-afiliacion/",
    "  Campus es un proyecto independiente, sin relación con UPC, Anthology/Blackboard,",
    "  Microsoft, Anthropic, OpenAI ni Google, y no está registrado en el programa de",
    "  integraciones REST de Anthology.",
  ].join("\n");

  return new Response(`${body}\n`, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
