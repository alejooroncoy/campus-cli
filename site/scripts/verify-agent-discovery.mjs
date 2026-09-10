import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";

const publicPath = new URL("../public/", import.meta.url);
const read = (path) => readFile(new URL(path, publicPath), "utf8");

const robots = await read("robots.txt");
assert.match(robots, /^Content-Signal: ai-train=no, search=yes, ai-input=yes$/m);
assert.match(robots, /^Agentmap: https:\/\/campuscli\.com\/.well-known\/ard\.json$/m);

const did = JSON.parse(await read(".well-known/did.json"));
assert.deepEqual(did["@context"], ["https://www.w3.org/ns/did/v1"]);
assert.equal(did.id, "did:web:campuscli.com");

const protectedResource = JSON.parse(await read(".well-known/oauth-protected-resource"));
assert.equal(protectedResource.resource, "https://mcp.campuscli.com/mcp");
assert.deepEqual(protectedResource.authorization_servers, ["https://mcp.campuscli.com"]);
assert.deepEqual(protectedResource.scopes_supported, ["campus.read", "campus.identity"]);

const card = JSON.parse(await read(".well-known/mcp-server-card.json"));
assert.equal(card.name, "com.campuscli/blackboard");
assert.equal(card.remotes?.[0]?.url, "https://mcp.campuscli.com/mcp");

const standardCard = JSON.parse(await read(".well-known/mcp/server-card.json"));
assert.deepEqual(standardCard, card);

for (const catalogPath of [".well-known/ard.json", ".well-known/ai-catalog.json"]) {
  const catalog = JSON.parse(await read(catalogPath));
  assert.equal(catalog.specVersion, "1.0");
  assert.equal(catalog.host?.identifier, "did:web:campuscli.com");
  assert.equal(catalog.entries?.[0]?.type, "application/mcp-server-card+json");
  assert.equal(catalog.entries?.[0]?.url, "https://campuscli.com/.well-known/mcp/server-card.json");
}

const auth = await read("auth.md");
assert.match(auth, /^# Auth\.md$/m);

const skills = JSON.parse(await read(".well-known/agent-skills/index.json"));
const skill = skills.skills?.[0];
const source = await read(".well-known/agent-skills/campus-blackboard/SKILL.md");
const digest = createHash("sha256").update(source).digest("hex");
assert.equal(skill?.digest, `sha256:${digest}`);
assert.match(source, /^name: campus-blackboard$/m);

const fallback = await read("404.md");
assert.match(fallback, /^# Página no encontrada \| Campus$/m);

const vercelConfig = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const markdownFallback = vercelConfig.rewrites.find(
  (rewrite) => rewrite.source === "/:path*" && rewrite.destination === "/api/markdown-not-found",
);
assert.ok(markdownFallback, "Markdown requests must be routed through the Markdown resolver.");
assert.equal(vercelConfig.functions["api/markdown-not-found.js"].includeFiles, "dist/**/*.md");

const markdownNotFound = await readFile(new URL("../api/markdown-not-found.js", import.meta.url), "utf8");
assert.match(markdownNotFound, /status:\s*404/);
assert.match(markdownNotFound, /text\/markdown; charset=utf-8/);

const { default: markdownNotFoundHandler } = await import(new URL("../api/markdown-not-found.js", import.meta.url));
const response = await markdownNotFoundHandler.fetch(new Request("https://campuscli.com/a-path-that-does-not-exist"));
assert.equal(response.status, 404);
assert.equal(response.headers.get("content-type"), "text/markdown; charset=utf-8");
assert.match(await response.text(), /^# Página no encontrada \| Campus$/m);

for (const path of ["/auth.md/missing", "/auth.md/missing.md"]) {
  const nestedResponse = await markdownNotFoundHandler.fetch(new Request(`https://campuscli.com${path}`));
  assert.equal(nestedResponse.status, 404);
  assert.match(await nestedResponse.text(), /^# Página no encontrada \| Campus$/m);
}

const clientScript = await read("app.js");
assert.match(clientScript, /navigator\.modelContext/);
assert.match(clientScript, /modelContext\.registerTool/);
assert.match(clientScript, /provideContext\(\{/);
assert.match(clientScript, /campus_get_overview/);
assert.match(clientScript, /campus_open_section/);

console.log("Agent discovery metadata is internally consistent.");
