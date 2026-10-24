import { test } from 'node:test';
import axios from 'axios';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Reuse, isReusable, keyFor } from '../src/providers/blackboard/api/reuse.js';
import { createClient } from '../src/providers/blackboard/api/client.js';
import type { Session } from '../src/providers/blackboard/types.js';

const session = (): Session =>
  ({ cookies: [{ name: 'BbRouter', value: 'x', domain: 'aulavirtual.upc.edu.pe' }] }) as unknown as Session;

/** A server that counts what actually reached the university. */
async function countingServer() {
  let hits = 0;
  const server = createServer((_req, res) => {
    hits += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ results: [], hit: hits }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const previousAdapter = axios.defaults.adapter;
  const transport = axios.getAdapter(previousAdapter);
  // Redirect only the test transport, after the production origin guard.
  axios.defaults.adapter = config => transport({ ...config, baseURL: `http://127.0.0.1:${port}` });
  return {
    port,
    hits: () => hits,
    close: () => {
      axios.defaults.adapter = previousAdapter;
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test('two identical questions at once become one request', async () => {
  const reuse = new Reuse();
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 20));
    return 'ok';
  };
  const [a, b] = await Promise.all([reuse.get('k', fetch), reuse.get('k', fetch)]);
  assert.equal(a, 'ok');
  assert.equal(b, 'ok');
  assert.equal(calls, 1, 'the same question was asked twice');
  assert.equal(reuse.stats.coalesced, 1);
});

test('a repeat within the window is answered from memory', async () => {
  let clock = 0;
  const reuse = new Reuse({ ttlMs: 1_000, now: () => clock });
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return calls;
  };
  assert.equal(await reuse.get('k', fetch), 1);
  clock += 500;
  assert.equal(await reuse.get('k', fetch), 1, 'asked again inside the window');
  clock += 900;
  assert.equal(await reuse.get('k', fetch), 2, 'the memory should have expired');
});

test('a failed request is not remembered as an answer', async () => {
  const reuse = new Reuse();
  await assert.rejects(
    reuse.get('k', async () => {
      throw new Error('network down');
    }),
    /network down/
  );
  assert.equal(await reuse.get('k', async () => 'recovered'), 'recovered');
});

test('writing forgets everything, so nothing stale survives a submission', async () => {
  const reuse = new Reuse({ ttlMs: 60_000 });
  await reuse.get('attempts', async () => 'sin entregar');
  reuse.forget();
  assert.equal(await reuse.get('attempts', async () => 'entregado'), 'entregado');
});

test('only plain reads are reused', () => {
  assert.equal(isReusable({ method: 'get', url: '/x' }), true);
  assert.equal(isReusable({ method: 'post', url: '/x' }), false);
  assert.equal(isReusable({ method: 'put', url: '/x' }), false);
  // File bytes are never held in memory to save a request.
  assert.equal(isReusable({ method: 'get', url: '/x', responseType: 'arraybuffer' }), false);
  assert.equal(isReusable({ method: 'get', url: '/x', responseType: 'stream' }), false);
});

test('the same query written two ways shares one answer', () => {
  const a = keyFor({ method: 'GET', url: '/courses', params: { limit: 100, offset: 0 } });
  const b = keyFor({ method: 'get', url: '/courses', params: { offset: 0, limit: 100 } });
  assert.equal(a, b, 'parameter order should not produce a second request');
});

test('the client asks the university once for a question repeated in a conversation', async () => {
  // The real pattern: list_assignments and get_grades both read the gradebook
  // columns, and an assistant calls them one after the other. Before this, that
  // was two requests for the identical answer, seconds apart.
  const server = await countingServer();
  try {
    const client = createClient(session(), { paceKey: `ana:${server.port}` });
    const url = '/learn/api/public/v2/courses/_1_1/gradebook/columns';

    await client.get(url);
    await client.get(url);
    await client.get(url);

    assert.equal(server.hits(), 1, `the same question reached the university ${server.hits()} times`);
  } finally {
    await server.close();
  }
});

test('a fan-out over one course collapses to the requests it really needs', async () => {
  // get_assignment_feedback walks every assignment in the course. Repeats
  // within that walk are free now; distinct ones still go out.
  const server = await countingServer();
  try {
    const client = createClient(session(), { paceKey: `ana:${server.port}` });

    await Promise.all([
      ...Array.from({ length: 13 }, () =>
        client.get('/learn/api/public/v2/courses/_1_1/gradebook/columns')
      ),
      ...Array.from({ length: 13 }, (_, i) =>
        client.get(`/learn/api/public/v2/courses/_1_1/gradebook/columns/_${i}_1/attempts`)
      ),
    ]);

    // Thirteen identical column reads collapse into one; the thirteen distinct
    // attempt reads still happen, because they ask different things.
    assert.equal(server.hits(), 14, `expected 14 real requests, saw ${server.hits()}`);
  } finally {
    await server.close();
  }
});

test('a submission is never answered from memory', async () => {
  const server = await countingServer();
  try {
    const client = createClient(session(), { paceKey: `ana:${server.port}` });
    const attempts = '/learn/api/public/v2/courses/_1_1/gradebook/columns/_1_1/attempts';

    await client.get(attempts);
    await client.post(attempts, { text: 'mi entrega' });
    await client.get(attempts);

    // read, write, and a read that must go out again rather than repeat the
    // pre-submission answer.
    assert.equal(server.hits(), 3, `expected the post-write read to go out, saw ${server.hits()}`);
  } finally {
    await server.close();
  }
});

test('two tool calls in a row share what was just asked', async () => {
  // The MCP layer builds a fresh client per tool call. list_assignments and
  // get_grades are two calls that read the same gradebook columns, so a memory
  // owned by the client would be empty exactly when it is needed.
  const server = await countingServer();
  try {
    const url = '/learn/api/public/v2/courses/_1_1/gradebook/columns';
    const call = () => {
      const client = createClient(session(), { paceKey: `ana:${server.port}` });
      return client.get(url);
    };
    await call();
    await call();
    assert.equal(server.hits(), 1, `a new client per tool asked ${server.hits()} times`);
  } finally {
    await server.close();
  }
});

test('one student never reads another student answer', async () => {
  const server = await countingServer();
  try {
    const url = '/learn/api/public/v1/users/me';
    const call = (who: string) => {
      const client = createClient(session(), { paceKey: `${who}:${server.port}` });
      return client.get(url);
    };
    await call('ana');
    await call('beto');
    assert.equal(server.hits(), 2, 'two students shared one answer');
  } finally {
    await server.close();
  }
});
