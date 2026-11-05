import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { relayCommands } from '../src/relay/commands.js';

test('CLI forwards page controls and count/search intent instead of ignoring --limit', async () => {
  const calls: any[] = [];
  const log = console.log; console.log = () => {};
  const run = async (argv: string[]) => {
    const program = new Command().exitOverride();
    relayCommands(program, async (name, args) => {
      calls.push({ name, args });
      return { content: [{ type: 'text', text: JSON.stringify({ results: [] }) }] };
    });
    await program.parseAsync(argv, { from: 'user' });
  };
  try {
    await run(['courses', 'list', '--limit', '20', '--offset', '40']);
    assert.deepEqual(calls.pop(), { name: 'blackboard_list_courses', args: { limit: 20, offset: 40 } });
    await run(['courses', 'members', '_1_1', '--count', '--max-pages', '5']);
    assert.deepEqual(calls.pop(), { name: 'blackboard_list_people', args: { courseId: '_1_1', mode: 'count', maxPages: 5 } });
    await run(['courses', 'members', '_1_1', '--search', 'José', '--cursor', '/page']);
    assert.deepEqual(calls.pop(), { name: 'blackboard_list_people', args: { courseId: '_1_1', search: 'José', cursor: '/page' } });
    await run(['assignments', 'feedback', '_1_1', '--cursor', '/page']);
    assert.deepEqual(calls.pop(), { name: 'blackboard_get_assignment_feedback', args: { courseId: '_1_1', cursor: '/page' } });
    await run(['courses', 'grades', '_1_1', '--columns-cursor', '/columns', '--grades-cursor', '/grades']);
    assert.deepEqual(calls.pop(), { name: 'blackboard_get_grades', args: { courseId: '_1_1', columnsCursor: '/columns', gradesCursor: '/grades' } });
    await assert.rejects(run(['courses', 'list', '--offset', '-1']), /Paginación/);
  } finally { console.log = log; }
});

test('download-folder visits children on later pages and stops on a repeating cursor', async () => {
  const calls: any[] = [];
  const program = new Command().exitOverride();
  relayCommands(program, async (name, args) => {
    calls.push({ name, args });
    const page = args?.parentId === '_2_1' && !args?.cursor
      ? { results: [], coverage: { nextCursor: '/page2' } }
      : args?.parentId === '_2_1'
        ? { results: [{ id: '_3_1', canListChildren: true }], coverage: { nextCursor: null } }
        : { results: [], coverage: { nextCursor: null } };
    return { content: [{ type: 'text', text: JSON.stringify(page) }] };
  });
  await program.parseAsync(['download-folder', '_1_1', '_2_1'], { from: 'user' });
  assert.deepEqual(calls.map(call => call.args), [
    { courseId: '_1_1', parentId: '_2_1' },
    { courseId: '_1_1', parentId: '_2_1', cursor: '/page2' },
    { courseId: '_1_1', parentId: '_3_1' },
  ]);
  const loop = new Command().exitOverride();
  relayCommands(loop, async () => ({ content: [{ type: 'text', text: JSON.stringify({ results: [], paging: { nextPage: '/same' } }) }] }));
  await assert.rejects(loop.parseAsync(['download-folder', '_1_1', '_2_1'], { from: 'user' }), /repitió/);
});
