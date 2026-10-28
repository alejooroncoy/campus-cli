import { test, type TestContext } from 'node:test';
import axios from 'axios';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Pace, laneFor, API_CONCURRENCY, FILE_CONCURRENCY } from '../src/providers/blackboard/api/pace.js';
import { createClient } from '../src/providers/blackboard/api/client.js';
import type { Session } from '../src/providers/blackboard/types.js';

const session = (): Session =>
  ({
    cookies: [{ name: 'BbRouter', value: 'x', domain: 'aulavirtual.upc.edu.pe' }],
  }) as unknown as Session;

/** Retarget only the inner HTTP transport. createClient still installs its
 * real origin guard, cache and pacing wrapper around this adapter. */
function routeTestTransport(t: TestContext, port: number) {
  const previous = axios.defaults.adapter;
  const transport = axios.getAdapter(previous);
  axios.defaults.adapter = config => transport({ ...config, baseURL: `http://127.0.0.1:${port}`, proxy: false });
  t.after(() => { axios.defaults.adapter = previous; });
}

/** Runs `n` tasks through a lane and reports the highest overlap seen. */
async function peakConcurrency(pace: Pace, lane: 'api' | 'file', n: number): Promise<number> {
  let active = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: n }, () =>
      pace.run(lane, async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active -= 1;
      })
    )
  );
  return peak;
}

test('downloads never overlap', async () => {
  const pace = new Pace({ gapMs: 0 });
  assert.equal(await peakConcurrency(pace, 'file', 6), FILE_CONCURRENCY);
});

test('metadata requests may overlap, up to the cap', async () => {
  const pace = new Pace();
  assert.equal(await peakConcurrency(pace, 'api', 12), API_CONCURRENCY);
});

test('the two lanes do not spend each other budget', async () => {
  const pace = new Pace({ api: 2, file: 1, gapMs: 0 });
  let fileRan = false;
  const slowApi = Array.from({ length: 2 }, () =>
    pace.run('api', () => new Promise((r) => setTimeout(r, 40)))
  );
  // With a shared budget this would queue behind the two api calls.
  await pace.run('file', async () => {
    fileRan = true;
  });
  assert.ok(fileRan, 'a download waited on unrelated metadata calls');
  await Promise.all(slowApi);
});

test('consecutive downloads are separated by a pause', async () => {
  const pace = new Pace({ file: 1, gapMs: 60 });
  const started = Date.now();
  await pace.run('file', async () => {});
  await pace.run('file', async () => {});
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 55, `expected a gap between downloads, took ${elapsed}ms`);
});

test('a failed request hands its slot back', async () => {
  const pace = new Pace({ file: 1, gapMs: 0 });
  await assert.rejects(
    pace.run('file', async () => {
      throw new Error('network down');
    }),
    /network down/
  );
  // Would hang for ever if the slot had leaked, since the lane allows one.
  await pace.run('file', async () => {});
  assert.equal(pace.activeIn('file'), 0);
});

test('lane detection covers how Blackboard actually serves bytes', () => {
  assert.equal(laneFor({ url: '/learn/api/public/v1/courses/_1_1/contents' }), 'api');
  assert.equal(
    laneFor({ url: '/learn/api/public/v1/courses/_1_1/contents/_2_1/attachments/_3_1/download' }),
    'file'
  );
  assert.equal(laneFor({ url: '/bbcswebdav/pid-123-dt-content-rid-456/xid-789' }), 'file');
  // Response type alone is enough: a new download helper is paced without
  // anyone remembering to register its URL shape here.
  assert.equal(laneFor({ url: '/anything', responseType: 'stream' }), 'file');
  assert.equal(laneFor({ url: '/anything', responseType: 'arraybuffer' }), 'file');
});

test('the client paces a recursive fan-out without anyone asking it to', async t => {
  // The risk this covers: collectFiles walks the content tree with Promise.all
  // over every folder, recursively. Before pacing, a course with nested folders
  // produced dozens of simultaneous requests to the university from one
  // student, which is the shape that gets an address blocked.
  //
  // Measured against a real server. Retarget the inner transport before
  // createClient wraps it, preserving both origin validation and pacing.
  let active = 0;
  let peak = 0;
  const server = createServer(async (_req, res) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 15));
    active -= 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ results: [] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  routeTestTransport(t, port);

  try {
    const client = createClient(session());
    await assert.rejects(client.get('/learn/api/public/v1/users/me', {
      baseURL: `http://127.0.0.1:${port}`,
    }), /Cannot override the university Blackboard origin/);
    assert.equal(peak, 0, 'the forbidden origin reached the transport');

    await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        client.get(`/learn/api/public/v1/courses/_1_1/contents/_${i}_1/children`)
      )
    );

    assert.ok(peak > 0, 'the server never saw a request');
    assert.ok(peak <= API_CONCURRENCY, `sixteen folders opened ${peak} connections at once`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('a folder of downloads reaches the server one at a time', async t => {
  let active = 0;
  let peak = 0;
  const server = createServer(async (_req, res) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 15));
    active -= 1;
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end('bytes');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  routeTestTransport(t, port);

  try {
    const client = createClient(session());

    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        client.get(`/learn/api/public/v1/courses/_1_1/contents/_1_1/attachments/_${i}_1/download`, {
          responseType: 'arraybuffer',
        })
      )
    );

    assert.equal(peak, 1, `five downloads overlapped ${peak} at a time`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('one student download does not block another student', async t => {
  // The hosted relay serves many students from one process. A single global
  // pace would be correct for the CLI and wrong here: with downloads
  // serialised across everyone, one slow file would stall the whole service.
  let serving = 0;
  let peak = 0;
  let releaseGroup!: () => void;
  const allStarted = new Promise<void>(resolve => { releaseGroup = resolve; });
  const server = createServer(async (_req, res) => {
    serving += 1;
    peak = Math.max(peak, serving);
    if (serving === 3) releaseGroup();
    // A rendezvous measures overlap without a fragile wall-clock threshold.
    // The timeout lets a broken global limiter fail instead of hanging.
    await new Promise<void>(resolve => {
      const timeout = setTimeout(resolve, 1_000);
      void allStarted.then(() => { clearTimeout(timeout); resolve(); });
    });
    serving -= 1;
    res.writeHead(200);
    res.end('bytes');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  routeTestTransport(t, port);

  try {
    const download = (who: string) => {
      const client = createClient(session(), { paceKey: `${who}:${port}` });
      return client.get('/learn/api/public/v1/courses/_1_1/contents/_1_1/attachments/_1_1/download', {
        responseType: 'arraybuffer',
      });
    };

    await Promise.all([download('ana'), download('beto'), download('caro')]);
    assert.equal(peak, 3, 'three students were serialised against each other');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('the same student is still serialised across clients', async t => {
  let serving = 0;
  let peak = 0;
  const server = createServer(async (_req, res) => {
    serving += 1;
    peak = Math.max(peak, serving);
    await new Promise((r) => setTimeout(r, 20));
    serving -= 1;
    res.writeHead(200);
    res.end('bytes');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  routeTestTransport(t, port);

  try {
    // Two clients, one person: rebuilding the client must not buy a fresh
    // allowance, which is how a per-call limiter enforces nothing.
    const download = () => {
      const client = createClient(session(), { paceKey: `ana:${port}` });
      return client.get('/learn/api/public/v1/courses/_1_1/contents/_1_1/attachments/_1_1/download', {
        responseType: 'arraybuffer',
      });
    };
    await Promise.all([download(), download(), download()]);
    assert.equal(peak, 1, `one student reached the server ${peak} times at once`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
