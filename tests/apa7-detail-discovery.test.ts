import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAcademicTools } from '../src/providers/academic/apa7-mcp-tools.js';

test('MCP overview examples retrieve actual detailed rules for every topic', async () => {
  const server = new McpServer({ name: 'apa-detail', version: '1' });
  let entitled = true;
  registerAcademicTools(server, { authorize: () => entitled });
  const client = new Client({ name: 'apa-detail-client', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  const call = async (args: Record<string, unknown>) => {
    const result = await client.callTool({ name: 'campus_apa7_guidance', arguments: args });
    assert.ok(!result.isError, JSON.stringify(result));
    return JSON.parse((result.content as Array<{ text: string }>)[0].text);
  };
  try {
    const { tools } = await client.listTools();
    const tool = tools.find(tool => tool.name === 'campus_apa7_guidance')!;
    assert.match(tool.description!, /tableFigureRuleId.*figure-notes/);
    assert.equal(tool.inputSchema.additionalProperties, false);
    for (const topic of ['principles-ethics', 'citation', 'reference', 'format', 'reporting', 'writing-style', 'bias-free-language', 'mechanics', 'table-figure', 'legal', 'publication', 'review']) {
      const overview = await call({ topic });
      assert.equal(overview.guidanceScope, 'overview', topic);
      assert.ok(overview.detailLookup.examples.length, topic);
      for (const example of overview.detailLookup.examples) {
        const detail = await call(example.arguments);
        assert.equal(detail.guidanceScope, 'selected-guidance');
        assert.ok(detail[example.resultField], example.resultField);
        assert.equal(detail.detailLookup, undefined);
        if (topic === 'table-figure') assert.ok(detail.tableFigureRule.rules.length > 1);
        if (topic === 'review') assert.ok(detail.reviewSkill.considerations.items.length);
      }
      if (topic === 'table-figure') {
        assert.deepEqual(overview.detailLookup.examples.map((r: any) => r.arguments.tableFigureRuleId), ['figure-notes', 'figure-components', 'reprinted-adapted-table-figure']);
        const upc = await call(overview.detailLookup.upcSection.arguments);
        assert.equal(upc.reviewSkill.selection, 'figures');
      }
    }
    const typo = await client.callTool({ name: tool.name, arguments: { topic: 'table-figure', ruleId: 'figure-notes' } });
    assert.equal(typo.isError, true, 'an unknown selector must not silently return the summary');
    const incompatible = await client.callTool({ name: tool.name, arguments: { topic: 'review', tableFigureRuleId: 'figure-notes' } });
    assert.equal(incompatible.isError, true);
    entitled = false;
    const denied = await client.callTool({ name: tool.name, arguments: { topic: 'table-figure', tableFigureRuleId: 'figure-notes' } });
    assert.equal(denied.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});
