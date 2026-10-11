import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAcademicTools } from '../src/providers/academic/apa7-mcp-tools.js';
import { parseApa7ReviewCorpus } from '../src/providers/academic/apa7-review-skill.js';

async function connectAcademicClient(authorize: () => boolean | Promise<boolean>) {
  const server = new McpServer({ name: 'apa7-review-test', version: '1.0.0' });
  registerAcademicTools(server, { authorize });
  const client = new Client({ name: 'review-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

test('review skill is discoverable and retrievable through the real MCP protocol', async () => {
  const { client, close } = await connectAcademicClient(() => true);
  try {
    const tools = await client.listTools();
    const guidance = tools.tools.find(tool => tool.name === 'campus_apa7_guidance');
    assert.ok(guidance);
    assert.equal(guidance.annotations?.readOnlyHint, true);
    assert.ok((guidance.inputSchema.properties?.topic as { enum: string[] }).enum.includes('review'));

    const result = await client.callTool({ name: 'campus_apa7_guidance', arguments: { topic: 'review' } });
    assert.ok(!result.isError);
    const content = result.content as Array<{ type: string; text?: string }>;
    const review = JSON.parse(content.find(item => item.type === 'text')!.text!);
    assert.equal(review.sourceGuide, 'https://biblioteca.upc.edu.pe/citas-referencias-APA7/citas');
    assert.equal(review.reviewSkill.name, 'apa7-review-campus');
    assert.equal(review.reviewSkill.execution, 'client-agent');
    assert.equal(review.reviewSkill.instructions, await readFile('.agents/skills/apa7-review-campus/SKILL.md', 'utf8'));
    assert.deepEqual(review.reviewSkill.rulebook, JSON.parse(await readFile('.agents/skills/apa7-review-campus/references/upc-review-rules.json', 'utf8')));
    assert.equal(review.findings, undefined, 'loading instructions must not claim the document has been reviewed');
    assert.equal(review.reviewSkill.rulebook.checkedTimezone, 'America/Lima');
    assert.notEqual(review.reviewSkill.rulebook.checkedOn, review.reviewSkill.rulebook.guideLastUpdatedOn);

    const ids = review.reviewSkill.rulebook.sections.map((section: { id: string }) => section.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, 45);
    assert.equal(review.reviewSkill.rulebook.coverageSummary.requestedScope, 'upc-guide');
    assert.equal(review.reviewSkill.rulebook.coverageSummary.allRequestedSourcesComplete, true);
    assert.deepEqual(review.reviewSkill.rulebook.coverageSummary.pendingSourceIds, []);
    assert.deepEqual(review.reviewSkill.rulebook.coverageSummary.supportingPendingSourceIds, ['manual-catalog']);
    assert.equal(review.reviewSkill.rulebook.normativeSources.find((s: { id: string }) => s.id === 'apa-chatgpt-archived').status, 'superseded');
    for (const id of ['direct-quotes', 'paraphrases', 'secondary-citations', 'personal-communications', 'interviews', 'ai-content', 'reference-faq', 'tables', 'figures']) {
      assert.ok(ids.includes(id), `missing source coverage: ${id}`);
    }
    for (const section of review.reviewSkill.rulebook.sections) {
      assert.equal(new URL(section.url).hostname, 'biblioteca.upc.edu.pe');
      assert.ok(section.locator && section.criteria.length);
    }
  } finally {
    await close();
  }
});

test('MCP retrieves all notes and visual evidence for a selected UPC section', async () => {
  const { client, close } = await connectAcademicClient(() => true);
  try {
    const result = await client.callTool({ name: 'campus_apa7_guidance', arguments: { topic: 'review', reviewSectionId: 'figures' } });
    assert.ok(!result.isError);
    const review = JSON.parse((result.content as Array<{ text: string }>)[0].text).reviewSkill;
    assert.equal(review.selection, 'figures');
    assert.equal(review.catalog.length, 45);
    assert.equal(review.rulebook.sections.length, 1);
    assert.equal(review.sourceAudit.pages[0].blocks.length, 13);
    assert.equal(review.sourceAudit.images.length, 6);
    assert.ok(review.sourceAudit.images.every((image: { reviewStatus: string }) => image.reviewStatus === 'visually-reviewed'));
    assert.ok(review.sourceAudit.pages[0].blocks.some((block: { blockId: string }) => block.blockId === 's-lg-content-75564250'));
    assert.ok(review.rulebook.sourceIssues.some((issue: { id: string }) => issue.id === 'figure-title'));
    const missing = await client.callTool({ name: 'campus_apa7_guidance', arguments: { topic: 'review', reviewSectionId: '../../other-file' } });
    assert.equal(missing.isError, true);
    const incompatible = await client.callTool({ name: 'campus_apa7_guidance', arguments: { topic: 'citation', reviewSectionId: 'figures' } });
    assert.equal(incompatible.isError, true);
  } finally { await close(); }
});

test('source audit fails closed on missing notes or falsely complete coverage', async () => {
  const book = JSON.parse(await readFile('.agents/skills/apa7-review-campus/references/upc-review-rules.json', 'utf8'));
  const audit = JSON.parse(await readFile('.agents/skills/apa7-review-campus/references/upc-source-audit.json', 'utf8'));
  assert.doesNotThrow(() => parseApa7ReviewCorpus(book, audit));
  const missingNote = structuredClone(audit);
  missingNote.pages.find((page: { sectionId: string }) => page.sectionId === 'figures').blocks.pop();
  assert.throws(() => parseApa7ReviewCorpus(book, missingNote), /declared coverage/);
  const falseComplete = structuredClone(book);
  falseComplete.normativeSources.find((source: { id: string }) => source.id === 'manual-catalog').requiredForRequestedScope = true;
  falseComplete.coverageSummary.pendingSourceIds = ['manual-catalog'];
  falseComplete.coverageSummary.supportingPendingSourceIds = [];
  assert.throws(() => parseApa7ReviewCorpus(falseComplete, audit), /pending normative/);
  const unmappedImage = structuredClone(audit);
  unmappedImage.images[0].sourceBlocks.push('missing-block');
  assert.throws(() => parseApa7ReviewCorpus(book, unmappedImage), /unresolved source/);
});

test('review retains entitlement enforcement and validates incompatible selectors over MCP', async () => {
  let entitled = false;
  const { client, close } = await connectAcademicClient(() => entitled);
  try {
    const denied = await client.callTool({ name: 'campus_apa7_guidance', arguments: { topic: 'review' } });
    assert.equal(denied.isError, true);
    assert.ok(!JSON.stringify(denied).includes('upc-review-rules'));
    entitled = true;
    const incompatible = await client.callTool({ name: 'campus_apa7_guidance', arguments: { topic: 'review', citationRuleId: 'short-quote' } });
    assert.equal(incompatible.isError, true);
    const reference = await client.callTool({ name: 'campus_apa7_guidance', arguments: { topic: 'reference', sourceType: 'book' } });
    assert.ok(!reference.isError);
    const referenceText = (reference.content as Array<{ text: string }>)[0].text;
    assert.equal(JSON.parse(referenceText).reviewSkill, undefined, 'other topics should not load the review skill');
  } finally {
    await close();
  }
});

test('npm publishes the resources that the compiled MCP review loader needs', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.ok(pkg.files.includes('.agents/skills/apa7-review-campus'));
});
