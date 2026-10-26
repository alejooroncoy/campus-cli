import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAcademicTools } from '../src/providers/academic/apa7-mcp-tools.js';
import { parseApa7ReviewCorpus as parseCorpus } from '../src/providers/academic/apa7-review-skill.js';

const considerations = JSON.parse(readFileSync('.agents/skills/apa7-review-campus/references/upc-considerations.json', 'utf8'));
function parseApa7ReviewCorpus(book: unknown, audit: unknown, semantic: unknown) {
  return parseCorpus(book, audit, semantic, considerations);
}

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
    assert.ok(guidance.inputSchema.properties?.reviewSectionId);

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
    assert.equal(review.reviewSkill.considerations.summary.dispositions, 1105);
    assert.equal(review.reviewSkill.considerations.summary.normativeUnits, considerations.considerations.length);
    assert.equal(review.reviewSkill.considerations.items, undefined, 'section detail is retrieved progressively');
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

test('new safeguards reach the relevant MCP sections with their actual source evidence', async () => {
  const { client, close } = await connectAcademicClient(() => true);
  try {
    const expected = new Map([
      ['figures', ['observation-52', 'observation-53']],
      ['legal-arbitration', ['observation-54']],
      ['video', ['observation-55']],
      ['conferences', ['observation-56']],
      ['citation-faq', ['observation-57', 'observation-64']],
      ['reference-faq', ['observation-58']],
      ['references', ['observation-59']],
      ['secondary-citations', ['observation-60']],
      ['audio', ['observation-61', 'observation-62']],
      ['personal-communications', ['observation-63']],
    ]);
    for (const [sectionId, ids] of expected) {
      const response = await client.callTool({ name: 'campus_apa7_guidance', arguments: { topic: 'review', reviewSectionId: sectionId } });
      assert.ok(!response.isError);
      const skill = JSON.parse((response.content as Array<{ text: string }>)[0].text).reviewSkill;
      for (const id of ids) {
        const warning = skill.considerations.warnings.find((item: { id: string }) => item.id === id);
        assert.ok(warning, `${sectionId}: ${id}`);
        if (['observation-56', 'observation-57', 'observation-58', 'observation-59', 'observation-60', 'observation-61', 'observation-62', 'observation-63', 'observation-64'].includes(id)) {
          assert.equal(warning.classification, 'client-evidence-mismatch', 'client failures must not be reported as UPC source errors');
        }
        for (const unitId of warning.sourceUnitIds) {
          assert.ok(skill.semanticAudit.units.some((unit: { unitId: string }) => unit.unitId === unitId));
        }
        for (const imageId of warning.sourceImageIds) {
          assert.ok(skill.sourceAudit.images.some((image: { id: string }) => image.id === imageId));
        }
        assert.ok(warning.criterionRefs.every((ref: string) => skill.semanticAudit.criteria.some((criterion: { criterionRef: string }) => criterion.criterionRef === ref)));
      }
      const otherIds = [...expected].filter(([id]) => id !== sectionId).flatMap(([, values]) => values);
      assert.ok(skill.considerations.warnings.every((item: { id: string }) => !otherIds.includes(item.id)));
      assert.equal(skill.execution, 'client-agent');
      assert.equal(skill.findings, undefined);
    }
  } finally { await close(); }
});

test('source audit fails closed on missing notes or falsely complete coverage', async () => {
  const book = JSON.parse(await readFile('.agents/skills/apa7-review-campus/references/upc-review-rules.json', 'utf8'));
  const audit = JSON.parse(await readFile('.agents/skills/apa7-review-campus/references/upc-source-audit.json', 'utf8'));
  const semantic = JSON.parse(await readFile('.agents/skills/apa7-review-campus/references/upc-semantic-coverage.json', 'utf8'));
  assert.doesNotThrow(() => parseApa7ReviewCorpus(book, audit, semantic));
  const missingNote = structuredClone(audit);
  missingNote.pages.find((page: { sectionId: string }) => page.sectionId === 'figures').blocks.pop();
  assert.throws(() => parseApa7ReviewCorpus(book, missingNote, semantic), /declared coverage/);
  const falseComplete = structuredClone(book);
  falseComplete.normativeSources.find((source: { id: string }) => source.id === 'manual-catalog').requiredForRequestedScope = true;
  falseComplete.coverageSummary.pendingSourceIds = ['manual-catalog'];
  falseComplete.coverageSummary.supportingPendingSourceIds = [];
  assert.throws(() => parseApa7ReviewCorpus(falseComplete, audit, semantic), /pending normative/);
  const unmappedImage = structuredClone(audit);
  unmappedImage.images[0].sourceBlocks.push('missing-block');
  assert.throws(() => parseApa7ReviewCorpus(book, unmappedImage, semantic), /unresolved source/);
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

test('npm relay client excludes the local academic loader and its library export', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.ok(!pkg.files.includes('dist'));
  assert.ok(!pkg.files.some((entry: string) => entry.startsWith('dist/providers/academic')));
  assert.equal(pkg.exports['./apa7-mcp-tools'], undefined);
});

test('semantic coverage rejects omissions, stale rules, unsupported mappings and pending review', async () => {
  const prefix = '.agents/skills/apa7-review-campus/references/';
  const book = JSON.parse(await readFile(`${prefix}upc-review-rules.json`, 'utf8'));
  const audit = JSON.parse(await readFile(`${prefix}upc-source-audit.json`, 'utf8'));
  const semantic = JSON.parse(await readFile(`${prefix}upc-semantic-coverage.json`, 'utf8'));
  assert.doesNotThrow(() => parseApa7ReviewCorpus(book, audit, semantic));
  const missingUnit = structuredClone(semantic);
  missingUnit.units.pop();
  assert.throws(() => parseApa7ReviewCorpus(book, audit, missingUnit), /semantic coverage/);
  const staleUnit = structuredClone(semantic);
  staleUnit.units[0].sha256 = '0'.repeat(64);
  assert.throws(() => parseApa7ReviewCorpus(book, audit, staleUnit), /changed or unresolved unit/);
  const wrongRule = structuredClone(book);
  wrongRule.sections.find((section: { id: string }) => section.id === 'presentation').criteria[1] = 'Usar 2025 como fecha bibliográfica.';
  assert.throws(() => parseApa7ReviewCorpus(wrongRule, audit, semantic), /no matching evidence/);
  const unsupportedRule = structuredClone(semantic);
  unsupportedRule.units.find((unit: { kind: string }) => unit.kind === 'rule').criterionRefs = [];
  assert.throws(() => parseApa7ReviewCorpus(book, audit, unsupportedRule), /unresolved criteria/);
  const unresolvedReference = structuredClone(semantic);
  unresolvedReference.units[0].criterionRefs = ['unknown:1'];
  assert.throws(() => parseApa7ReviewCorpus(book, audit, unresolvedReference), /unresolved criteria/);
  const missingLabel = structuredClone(semantic);
  missingLabel.labels.pop();
  assert.throws(() => parseApa7ReviewCorpus(book, audit, missingLabel), /semantic coverage/);
  const pending = structuredClone(semantic);
  pending.units[0].status = 'pending';
  assert.throws(() => parseApa7ReviewCorpus(book, audit, pending));
  const inventedEvidence = structuredClone(semantic);
  inventedEvidence.criterionEvidence[0].sourceUnitIds = ['missing-note'];
  assert.throws(() => parseApa7ReviewCorpus(book, audit, inventedEvidence), /no matching evidence/);
});

test('every UPC section is retrievable with complete semantic evidence and resolved cross-section criteria', async () => {
  const { client, close } = await connectAcademicClient(() => true);
  try {
    const prefix = '.agents/skills/apa7-review-campus/references/';
    const corpus = JSON.parse(await readFile(`${prefix}upc-semantic-coverage.json`, 'utf8'));
    const book = JSON.parse(await readFile(`${prefix}upc-review-rules.json`, 'utf8'));
    for (const section of book.sections) {
      const result = await client.callTool({ name: 'campus_apa7_guidance', arguments: { topic: 'review', reviewSectionId: section.id } });
      assert.ok(!result.isError, section.id);
      const review = JSON.parse((result.content as Array<{ text: string }>)[0].text).reviewSkill;
      assert.equal(review.semanticAudit.status, 'complete');
      assert.deepEqual(review.semanticAudit.units, corpus.units.filter((unit: { sectionId: string }) => unit.sectionId === section.id));
      assert.deepEqual(review.semanticAudit.labels, corpus.labels.filter((label: { sectionId: string }) => label.sectionId === section.id));
      assert.deepEqual(review.considerations.items, considerations.considerations.filter((item: { sectionId: string }) => item.sectionId === section.id));
      assert.deepEqual(review.considerations.warnings, considerations.warnings.filter((item: { sectionId: string }) => item.sectionId === section.id));
      for (const evidence of [...review.semanticAudit.units, ...review.semanticAudit.labels, ...review.semanticAudit.images, ...review.considerations.items, ...review.considerations.warnings]) {
        assert.ok(evidence.criterionRefs.every((ref: string) => review.semanticAudit.criteria.some((criterion: { criterionRef: string }) => criterion.criterionRef === ref)));
      }
      if (section.id === 'ai-references') {
        assert.ok(review.semanticAudit.criteria.some((criterion: { criterionRef: string }) => criterion.criterionRef === 'ai-content:1'), 'method disclosure must be available even when stored in a related section');
        assert.ok(review.relatedSectionIds.includes('ai-content'), 'related considerations must be discoverable');
      }
    }
  } finally { await close(); }
});

test('considerations reject a dropped condition, changed evidence and unresolved warning', async () => {
  const prefix = '.agents/skills/apa7-review-campus/references/';
  const book = JSON.parse(await readFile(`${prefix}upc-review-rules.json`, 'utf8'));
  const audit = JSON.parse(await readFile(`${prefix}upc-source-audit.json`, 'utf8'));
  const semantic = JSON.parse(await readFile(`${prefix}upc-semantic-coverage.json`, 'utf8'));
  const missing = structuredClone(considerations);
  missing.considerations.pop();
  assert.throws(() => parseCorpus(book, audit, semantic, missing), /every source unit/);
  const hiddenRule = structuredClone(considerations);
  const ruleId = semantic.units.find((unit: { kind: string }) => unit.kind === 'rule').unitId;
  hiddenRule.considerations = hiddenRule.considerations.filter((item: { sourceUnitId: string }) => item.sourceUnitId !== ruleId);
  hiddenRule.nonNormativeUnitIds.push(ruleId);
  assert.throws(() => parseCorpus(book, audit, semantic, hiddenRule), /explicit rule/);
  const changed = structuredClone(considerations);
  changed.considerations[0].sha256 = '0'.repeat(64);
  assert.throws(() => parseCorpus(book, audit, semantic, changed), /changed or unresolved/);
  const unsupported = structuredClone(considerations);
  unsupported.warnings[0].sourceUnitIds = ['missing-unit'];
  assert.throws(() => parseCorpus(book, audit, semantic, unsupported), /warning has unresolved/);
  const unsupportedImage = structuredClone(considerations);
  unsupportedImage.warnings.find((item: { id: string }) => item.id === 'observation-59').sourceImageIds = ['missing-image'];
  assert.throws(() => parseCorpus(book, audit, semantic, unsupportedImage), /warning has unresolved/);
  const empty = structuredClone(considerations);
  empty.considerations[0].guidance = [];
  assert.throws(() => parseCorpus(book, audit, semantic, empty));
});
