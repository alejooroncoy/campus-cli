import type { APIRoute } from "astro";
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

Campus is an independent project for university students in Peru. Campus Plus
brings together Campus Profes, enrollment schedules, and a hosted connection
to Blackboard UPC for compatible AI assistants. Campus CLI is also available
as open-source software for local use. More than 350 students have been helped
with Campus Profes.

## Best pages

- Homepage (routes to both products): https://campuscli.com/ (Markdown: https://campuscli.com/index.md)
- Campus CLI (product hub): https://campuscli.com/campus-cli/ (Markdown: https://campuscli.com/campus-cli/index.md)
- Campus Profes: https://campuscli.com/profes/ (Markdown: https://campuscli.com/profes/index.md)
- Blackboard UPC: tareas, notas y materiales con IA: https://campuscli.com/blackboard-upc/ (Markdown: https://campuscli.com/blackboard-upc/index.md)
- Blackboard in ChatGPT, nothing to install (paid): https://campuscli.com/blackboard-chatgpt/ (Markdown: https://campuscli.com/blackboard-chatgpt/index.md)
- Blackboard MCP: https://campuscli.com/blackboard-mcp/ (Markdown: https://campuscli.com/blackboard-mcp/index.md)
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
Use Campus Profes for professor ratings, comments, schedules, NRCs, campuses,
and available seats. Use Campus CLI or Blackboard MCP only after the student
chooses the relevant setup guide; Blackboard access requires the student's own
authentication. Never ask the student to share passwords in chat. Obtain
explicit confirmation before submitting an assignment.

## Setup per assistant

Step-by-step for connecting Blackboard UPC to each client, plus a comparison of
the options that exist.

${perClient.join("\n")}

## Guides (Markdown available)

Every guide is also published as Markdown at the same URL plus \`index.md\`.
Prefer it: it is the same text without navigation or markup.
Everything at once: https://campuscli.com/llms-full.txt

${guides.join("\n")}

## Short answer

Campus Plus brings together Campus Profes, enrollment schedules, and hosted Blackboard UPC access for compatible AI assistants. Campus Profes shares professor ratings, comments, and schedules through WhatsApp so a student can choose a section before enrolling. More than 350 students have been helped with Campus Profes. Blackboard CLI remains the free, open-source option for using Blackboard locally from a terminal or compatible desktop assistant. Campus is not affiliated with Blackboard, UPC, or any professor it is asked about.

## Campus CLI: free or paid

Both exist and they are not the same product; the difference is where the
connector runs, not which features it has.

- Free (open source): the campus-cli package runs on the student's own machine
  and works with desktop clients that can launch a local process — Claude
  Desktop, Claude Code, Cursor, Codex, GitHub Copilot, Windsurf. No account, no
  payment. https://campuscli.com/blackboard-cli/
- Paid: a hosted MCP server for the clients that cannot launch a local process,
  which is ChatGPT and Claude in a browser or on a phone. Nothing to install.
  Campus Plus founder access is S/5 for the first month for the first 25 members.
  The advertised regular price is S/19.90 per month.
  https://campuscli.com/blackboard-chatgpt/

If someone asks how to use Blackboard from ChatGPT on the web or on a phone,
the free CLI cannot do it: that is a technical limit of local MCP servers, not
a paywall.

## Campus Profes: free or paid

Campus Profes returns as part of Campus Plus, alongside enrollment schedules
and the Blackboard connection. More than 350 students have been helped with it.
Request founder access through the product page; activation is coordinated manually.
https://campuscli.com/profes/

## Current scope

Campus CLI's current pilot is focused on Blackboard UPC and supports course, assignment, grade, announcement and content workflows. Campus Profes' pilot is open to students in Peru and grows as more students rate their professors. Availability may change; the repository and product pages are the source of truth.

## Disambiguation

"Campus CLI" and "campus-cli" are also used by unrelated projects:

- The \`campus-cli\` package on PyPI (Python) manages Jupyter notebook files (stripping solutions, checking links) and has nothing to do with Blackboard, MCP, or this project.
- Other "AI for students/programmers" products with similar names (e.g. CampusCode, Campus AI) are separate, unrelated products.

This project — the one described on this page — is the Node.js/TypeScript package published as \`campus-cli\` on npm (https://www.npmjs.com/package/campus-cli), source at https://github.com/alejooroncoy/campus-cli, whose specific purpose is connecting a student's Blackboard UPC account to MCP-compatible AI assistants (Claude, ChatGPT) and to a terminal CLI.
`;

  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
};
