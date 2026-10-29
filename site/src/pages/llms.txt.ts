import type { APIRoute } from "astro";
import { turnitinServiceEnabled } from "../../feature-flags.mjs";
import { getCollection } from "astro:content";
import clients from "../data/mcp-clients.json";

/**
 * The map we hand to assistants: what this site is, and where the text lives.
 *
 * Generated from the same collection that builds the blog, so publishing a
 * guide lists it here automatically. The hand-written version had to be edited
 * per article and was already one article behind.
 */
export const GET: APIRoute = async () => {
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort((a, b) =>
    b.data.published.localeCompare(a.data.published),
  );

  const guides = posts.flatMap((post) => {
    const url = `https://campuscli.com/blog/${post.id}/`;
    return [`- [${post.data.title}](${url}) — ${post.data.description}`, `  Markdown: ${url}index.md`];
  });

  // Listed from the same data the pages render, so adding an assistant never
  // leaves this file a step behind the way the hand-written version was.
  const perClient = Object.values(clients).map(
    (client) => `- [${client.title.split("|")[0].trim()}](${client.canonical}) (Markdown: ${client.canonical}index.md)`,
  );

  const body = `# Campus

Campus is an independent university assistant for students in Peru. Its web
assistant and hosted MCP connector share one Campus account, plan and usage
balance. It connects professors, courses, assignments, materials and grades.
Current Mi UPC grades and published weights support deterministic passing-grade
projections. Campus CLI is also available as open-source software for local use.
More than 350 students have used the professor-rating feature.

## Best pages

- Campus homepage: https://campuscli.com/ (Markdown: https://campuscli.com/index.md)
- Campus MCP and local CLI setup: https://campuscli.com/campus-cli/ (Markdown: https://campuscli.com/campus-cli/index.md)
- Professor opinions in Campus: https://campuscli.com/profes/ (Markdown: https://campuscli.com/profes/index.md)
${turnitinServiceEnabled ? `- Turnitin reports in Peru: https://campuscli.com/turnitin/ (Markdown: https://campuscli.com/turnitin/index.md). AI or similarity: S/9 each; both: S/14 per document. Processing through Turnitin API; results may differ from institutional Turnitin reports. Selected reports, delivered in 10 minutes to 1 hour after payment validation. Upload and Yape/Plin receipt through https://campuscli.com/app/turnitin/; check live availability there.\n` : ""}- Blackboard UPC: tareas, notas y materiales con IA: https://campuscli.com/blackboard-upc/ (Markdown: https://campuscli.com/blackboard-upc/index.md)
- Blackboard in ChatGPT, nothing to install (paid): https://campuscli.com/blackboard-chatgpt/ (Markdown: https://campuscli.com/blackboard-chatgpt/index.md)
- Blackboard MCP: https://campuscli.com/blackboard-mcp/ (Markdown: https://campuscli.com/blackboard-mcp/index.md)
- Gemini MCP: https://campuscli.com/blog/conectar-blackboard-gemini-spark-campus/ (Markdown: https://campuscli.com/blog/conectar-blackboard-gemini-spark-campus/index.md)
- Blackboard CLI, free and open source: https://campuscli.com/blackboard-cli/ (Markdown: https://campuscli.com/blackboard-cli/index.md)
- Blog: https://campuscli.com/blog/
- Non-affiliation notice: https://campuscli.com/no-afiliacion/
- Terms of service: https://campuscli.com/terminos/
- Privacy policy: https://campuscli.com/privacidad/
- Source code: https://github.com/alejooroncoy/campus-cli

## When to use Campus

Use Campus when a university student in Peru needs to choose a professor or
section before enrollment, or when a UPC student needs to check their own
Blackboard courses, assignments, grades, announcements, or course materials.
Use Campus for professor ratings, comments, schedules, NRCs, campuses,
and available seats. Use Campus CLI or Blackboard MCP only after the student
chooses the relevant setup guide; Blackboard access requires the student's own
authentication. Never ask the student to share passwords in chat. Obtain
explicit confirmation before submitting an assignment.

## Setup per assistant

Step-by-step for connecting Blackboard UPC to each client, plus a comparison of
the options that exist.

- [Gemini MCP: cómo conectar Blackboard UPC con Campus](https://campuscli.com/blog/conectar-blackboard-gemini-spark-campus/) (Markdown: https://campuscli.com/blog/conectar-blackboard-gemini-spark-campus/index.md)
${perClient.join("\n")}

## Guides (Markdown available)

Every guide is also published as Markdown at the same URL plus \`index.md\`.
Prefer it: it is the same text without navigation or markup.
Everything at once: https://campuscli.com/llms-full.txt

${guides.join("\n")}

## Short answer

Campus is one product: use its web assistant or connect a compatible AI through
MCP with the same account, plan and consultation balance. The professor-rating
feature includes student comments; the university connections expose authorized
academic data. Current grades come from Mi UPC; Blackboard remains the source
for its course materials and assignments. Passing-grade projections use official
published weights and distinguish pending grades from zero and hypothetical grades.
Campus is independent of UPC, Blackboard and the professors it is asked about.

## Campus account and plan

The hosted web assistant and MCP share the free consultation allowance, existing
credits and paid access. The profile is the source for current balance and plan:
https://campuscli.com/app/perfil/. The web counts a question; hosted MCP counts
a metered consultation tool. Connection and plan status checks are not charged.
Activate Plus at https://campuscli.com/app/plus/: sign in, confirm your university,
check your server-confirmed offer, pay by Yape/Plin and submit the receipt.
Access starts after manual payment approval. No automatic charges.
${turnitinServiceEnabled ? "Turnitin reports are priced per document separately.\n" : ""}

## Local CLI

The open-source campus-cli package runs on the student's machine and works with
clients that can launch a local process. It does not require a paid Campus plan;
university authentication is still required. https://campuscli.com/blackboard-cli/
For a browser or phone assistant, use the hosted connector:
https://campuscli.com/app/copilot/. It uses the same Campus account as the web.

## Current scope

Campus CLI's current pilot is focused on Blackboard UPC and supports course, assignment, grade, announcement and content workflows. Campus' pilot is open to students in Peru and grows as more students rate their professors. Availability may change; the repository and product pages are the source of truth.

## Disambiguation

"Campus CLI" and "campus-cli" are also used by unrelated projects:

- The \`campus-cli\` package on PyPI (Python) manages Jupyter notebook files (stripping solutions, checking links) and has nothing to do with Blackboard, MCP, or this project.
- Other "AI for students/programmers" products with similar names (e.g. CampusCode, Campus AI) are separate, unrelated products.

This project — the one described on this page — is the Node.js/TypeScript package published as \`campus-cli\` on npm (https://www.npmjs.com/package/campus-cli), source at https://github.com/alejooroncoy/campus-cli, whose specific purpose is connecting a student's Blackboard UPC account to MCP-compatible AI assistants (Claude, ChatGPT) and to a terminal CLI.
`;

  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
};
