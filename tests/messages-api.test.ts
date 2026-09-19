import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCourseConversations,
  getCourseConversation,
  getCourseConversationsPageSet,
  getCourseDiscussions,
  getDiscussionMessages,
  getDiscussionMessageReplies,
  getDiscussionTopicMessages,
  getMessageCourseSummaries,
} from '../src/providers/blackboard/api/courses.js';

test('Blackboard Ultra message APIs request the course summary and conversations', async () => {
  let request: { path?: string; config?: any } = {};
  const client = {
    get: async (path: string, config: any) => {
      request = { path, config };
      return { data: { results: [{ id: '_1_1', subject: 'Hola' }], paging: { nextPage: 'next' } } };
    },
  } as any;

  const summary = await getMessageCourseSummaries(client, { limit: 20, offset: 5 });

  assert.equal(request.path, '/learn/api/v1/messages/summary');
  assert.deepEqual(request.config.params, { limit: 20, offset: 5 });
  assert.deepEqual(summary.results, [{ id: '_1_1', subject: 'Hola' }]);
  assert.deepEqual(summary.paging, { nextPage: 'next' });

  await getCourseConversations(client, '_42_1', { limit: 10, offset: 2 });
  assert.equal(request.path, '/learn/api/v1/courses/_42_1/conversations');
  assert.deepEqual(request.config.params, { limit: 10, offset: 2 });
  await getCourseConversation(client, '_42_1', '_43_1');
  assert.equal(request.path, '/learn/api/v1/courses/_42_1/conversations/_43_1');
  await assert.rejects(getCourseConversations(client, '../other'), /courseId must look like a Blackboard ID/);
  await assert.rejects(getCourseConversation(client, '_42_1', '../other'), /conversationId must look like a Blackboard ID/);
});

test('getCourseConversationsPageSet marks an inbox as truncated after its bounded pages', async () => {
  const client = {
    get: async (path: string) => {
      if (path.endsWith('/conversations')) {
        return { data: { results: [{ id: 'first' }], paging: { nextPage: '/learn/api/v1/courses/_42_1/conversations?offset=100' } } };
      }
      return { data: { results: [{ id: 'second' }], paging: { nextPage: '/learn/api/v1/courses/_42_1/conversations?offset=200' } } };
    },
  } as any;
  const result = await getCourseConversationsPageSet(client, '_42_1', { maxPages: 2 });
  assert.deepEqual(result.results, [{ id: 'first' }, { id: 'second' }]);
  assert.equal(result.truncated, true);
});

test('getCourseConversationsPageSet refuses a page outside the current course endpoint', async () => {
  const client = {
    get: async () => ({ data: { results: [], paging: { nextPage: 'https://evil.example/messages' } } }),
  } as any;
  await assert.rejects(getCourseConversationsPageSet(client, '_42_1'), /unexpected Blackboard conversation page/);
});

test('Blackboard discussion APIs request discussions, messages, and replies', async () => {
  const requests: Array<{ path: string; params?: any }> = [];
  const client = {
    get: async (path: string, config?: any) => {
      requests.push({ path, params: config?.params });
      return { data: { results: [{ id: '_1_1', title: 'Debate' }], paging: { nextPage: 'next' } } };
    },
  } as any;

  const discussions = await getCourseDiscussions(client, '_42_1', { title: 'caso', gradable: true, limit: 25, offset: 5 });
  assert.deepEqual(discussions.results, [{ id: '_1_1', title: 'Debate' }]);
  assert.deepEqual(requests.at(-1), {
    path: '/learn/api/public/v1/courses/_42_1/discussions',
    params: { limit: 25, offset: 5, title: 'caso', gradable: true },
  });

  await getDiscussionMessages(client, '_42_1', '_99_1', { status: 'Published', isRead: false, limit: 10 });
  assert.deepEqual(requests.at(-1), {
    path: '/learn/api/public/v1/courses/_42_1/discussions/_99_1/messages',
    params: { limit: 10, status: 'Published', isRead: false },
  });

  await getDiscussionMessageReplies(client, '_42_1', '_99_1', '_100_1', { status: 'Published', offset: 20 });
  assert.deepEqual(requests.at(-1), {
    path: '/learn/api/public/v1/courses/_42_1/discussions/_99_1/messages/_100_1/replies',
    params: { limit: 100, offset: 20, status: 'Published' },
  });
});

test('Blackboard topic messages use the topic root replies when available', async () => {
  const requests: Array<{ path: string; params?: any }> = [];
  const client = {
    get: async (path: string, config?: any) => {
      requests.push({ path, params: config?.params });
      return { data: { results: [] } };
    },
  } as any;

  await getDiscussionTopicMessages(client, '_42_1', '_99_1', { id: '_100_1' }, { status: 'Published', limit: 10 });
  assert.deepEqual(requests.at(-1), {
    path: '/learn/api/public/v1/courses/_42_1/discussions/_99_1/messages/_100_1/replies',
    params: { limit: 10, status: 'Published' },
  });

  await getDiscussionTopicMessages(client, '_42_1', '_99_1', undefined, { limit: 10 });
  assert.deepEqual(requests.at(-1), {
    path: '/learn/api/public/v1/courses/_42_1/discussions/_99_1/messages',
    params: { limit: 10 },
  });
});
