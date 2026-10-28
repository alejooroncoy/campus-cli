import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Command } from 'commander';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { bridgeRelay } from '../src/mcp/server.js';
import { RelayAuthProvider, RelayCredentialStore, loginToRelay } from '../src/relay/auth.js';
import { relayFetch, relayUrl } from '../src/relay/config.js';
import { relayCommands } from '../src/relay/commands.js';
import { UPN_RELAY_TOOLS, MIUPC_RELAY_TOOLS } from '../src/relay/portal-tools.js';
import { UPN_TOOLS } from '../src/providers/upn/mcp-tools.js';
import { MIUPC_TOOLS } from '../src/providers/miupc/mcp-tools.js';

const exec = promisify(execFile);
const root = path.resolve(__dirname, '..');
const cliEntry = process.env.CAMPUS_RELAY_TEST_ENTRY ? [process.env.CAMPUS_RELAY_TEST_ENTRY] : ['--import', 'tsx', path.join(root, 'src/index.ts')];
const metadata = (tools: ReadonlyArray<{ name: string; kind: string; description: string }>) => tools.map(({ name, kind, description }) => ({ name, kind, description }));
const tick = () => new Promise(resolve => setImmediate(resolve));
const temp = () => fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'campus-relay-test-'));
const credentials = { redirectUrl: 'http://127.0.0.1:1234/callback', client: { client_id: 'cli-fixture' },
  tokens: { access_token: 'access-fixture', refresh_token: 'refresh-fixture', token_type: 'Bearer', expires_in: 900 } };

async function fixture(t: any) {
  const calls: any[] = [];
  let base = '';
  let challenge = '';
  let expired = false;
  let rejected: number | undefined;
  const payment = { content: [{ type: 'text', text: 'Activa tu acceso Campus para continuar.' }] };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, base);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString();
    const reply = (value: unknown, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value)); };
    if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return reply({ resource: `${base}/mcp`, authorization_servers: [base] });
    if (url.pathname.startsWith('/.well-known/oauth-authorization-server')) return reply({
      issuer: base, authorization_endpoint: `${base}/oauth/authorize`, token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'], scopes_supported: ['campus.read'],
    });
    if (url.pathname === '/oauth/register') {
      const registration = JSON.parse(raw);
      calls.push({ registration });
      return reply({ client_id: 'cli-fixture', ...registration }, 201);
    }
    if (url.pathname === '/oauth/token') {
      const params = Object.fromEntries(new URLSearchParams(raw));
      calls.push({ token: params });
      if (params.grant_type === 'authorization_code') {
        assert.equal(params.code, 'code-fixture');
        assert.equal(createHash('sha256').update(params.code_verifier).digest('base64url'), challenge);
      } else assert.equal(params.refresh_token, 'refresh-fixture');
      return reply({ ...credentials.tokens, access_token: 'fresh-access', refresh_token: 'fresh-refresh', scope: 'campus.read' });
    }
    if (url.pathname !== '/mcp') return reply({ error: 'not found' }, 404);
    if (req.method === 'GET') return reply({}, 405);
    const message = JSON.parse(raw);
    calls.push({ message, authorization: req.headers.authorization, version: req.headers['mcp-protocol-version'] });
    if (rejected) return reply({ error: 'relay access rejected' }, rejected);
    if (!req.headers.authorization || (expired && req.headers.authorization === 'Bearer access-fixture')) {
      res.setHeader('www-authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);
      return reply({ error: 'unauthorized' }, 401);
    }
    if (message.id === undefined) { res.writeHead(202).end(); return; }
    if (message.method === 'initialize') return reply({ jsonrpc: '2.0', id: message.id, result: {
      protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'paid-relay-fixture', version: '1' }, instructions: 'Use the relay rules.',
    } });
    if (message.method === 'tools/list') return reply({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'paid_tool', inputSchema: { type: 'object' } }] } });
    if (message.method === 'tools/call') return reply({ jsonrpc: '2.0', id: message.id, result: payment });
    return reply({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'unavailable in relay' } });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { url: new URL(`${base}/mcp`), calls, payment, challenge: (value: string) => { challenge = value; }, expire: () => { expired = true; }, reject: (status: number) => { rejected = status; } };
}

test('relay URLs require TLS and credentials cannot follow another origin or a redirect', async t => {
  const previous = process.env.CAMPUS_RELAY_URL;
  t.after(() => { if (previous === undefined) delete process.env.CAMPUS_RELAY_URL; else process.env.CAMPUS_RELAY_URL = previous; });
  for (const value of ['http://relay.example/mcp', 'https://user:password@relay.example/mcp', 'https://relay.example/mcp?token=x', 'https://relay.example/mcp#local']) {
    process.env.CAMPUS_RELAY_URL = value;
    assert.throws(() => relayUrl());
  }
  const f = await fixture(t);
  const request = relayFetch(f.url);
  assert.throws(() => request('https://different.example/oauth/token'), /pertenecer al relay/);
  const server = createServer((_req, res) => res.writeHead(307, { location: 'https://different.example/oauth/token' }).end());
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = new URL(`http://127.0.0.1:${(server.address() as any).port}/mcp`);
  await assert.rejects(relayFetch(url)(url, { method: 'POST', body: 'private grant' }), /fetch failed/);
});

test('portal CLI labels stay aligned without importing provider implementations at runtime', () => {
  assert.deepEqual(UPN_RELAY_TOOLS, metadata(UPN_TOOLS));
  // The hosted relay also publishes newer portal tools. Preserve those CLI
  // aliases while checking every contract available in this core snapshot.
  for (const tool of metadata(MIUPC_TOOLS)) assert.deepEqual(MIUPC_RELAY_TOOLS.find(entry => entry.name === tool.name), tool);
  assert.equal(new Set(MIUPC_RELAY_TOOLS.map(tool => tool.name)).size, MIUPC_RELAY_TOOLS.length);
});

test('relay credentials are private, scoped to the complete URL, and reject symlinks', t => {
  const dir = temp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new RelayCredentialStore(new URL('https://relay.example/mcp'), path.join(dir, 'tokens'));
  store.save(credentials);
  assert.deepEqual(store.load(), credentials);
  assert.equal(fs.statSync(store.file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(store.file)).mode & 0o777, 0o700);
  assert.equal(new RelayCredentialStore(new URL('https://other.example/mcp'), path.dirname(store.file)).load(), undefined);
  assert.equal(new RelayCredentialStore(new URL('https://relay.example/other'), path.dirname(store.file)).load(), undefined);
  fs.unlinkSync(store.file);
  const secret = path.join(dir, 'other'); fs.writeFileSync(secret, 'untouched'); fs.symlinkSync(secret, store.file);
  assert.throws(() => store.load(), /inseguro/);
  assert.throws(() => store.save(credentials), /inseguro/);
  store.clear();
  assert.equal(fs.readFileSync(secret, 'utf8'), 'untouched');
});

test('login uses relay OAuth PKCE, validates callback state, and persists only completed grants', async t => {
  const f = await fixture(t);
  const dir = temp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new RelayCredentialStore(f.url, dir);
  await loginToRelay({ url: f.url, store, openBrowser: async authorization => {
    assert.equal(authorization.origin, f.url.origin);
    assert.equal(authorization.searchParams.get('scope'), 'campus.read');
    f.challenge(authorization.searchParams.get('code_challenge')!);
    const callback = new URL(authorization.searchParams.get('redirect_uri')!);
    callback.searchParams.set('code', 'code-fixture'); callback.searchParams.set('state', 'wrong-state');
    assert.equal((await fetch(callback)).status, 400);
    assert.equal(store.load(), undefined);
    callback.searchParams.set('state', authorization.searchParams.get('state')!);
    assert.equal((await fetch(callback)).status, 200);
  } });
  assert.equal(store.load()?.tokens?.access_token, 'fresh-access');
  assert.equal(f.calls.filter(call => call.token).length, 1);
  assert.equal(f.calls.filter(call => call.registration).length, 1);
});

test('cancelled and timed out logins preserve existing relay credentials', async t => {
  const f = await fixture(t);
  const dir = temp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new RelayCredentialStore(f.url, dir); store.save(credentials);
  await assert.rejects(loginToRelay({ url: f.url, store, openBrowser: async authorization => {
    const callback = new URL(authorization.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', authorization.searchParams.get('state')!);
    callback.searchParams.set('error', 'access_denied');
    await fetch(callback);
  } }), /No se autorizó/);
  assert.deepEqual(store.load(), credentials);
  await assert.rejects(loginToRelay({ url: f.url, store, timeoutMs: 100, openBrowser: async () => {} }), /Tiempo de espera/);
  assert.deepEqual(store.load(), credentials);
});

test('expired access refreshes with the relay and stores the rotated token', async t => {
  const f = await fixture(t); f.expire();
  const dir = temp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new RelayCredentialStore(f.url, dir); store.save(credentials);
  const client = new Client({ name: 'fixture', version: '1' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(f.url, { authProvider: new RelayAuthProvider(store) }));
  assert.equal(client.getServerVersion()?.name, 'paid-relay-fixture');
  assert.equal(store.load()?.tokens?.refresh_token, 'fresh-refresh');
  assert.equal(f.calls.filter(call => call.token?.grant_type === 'refresh_token').length, 1);
});

test('stdio bridge preserves handshake, payment results, resources, cancellation, and human elicitation', async () => {
  const [caller, local] = InMemoryTransport.createLinkedPair();
  const [remote, relay] = InMemoryTransport.createLinkedPair();
  const atCaller: JSONRPCMessage[] = [], atRelay: JSONRPCMessage[] = [];
  caller.onmessage = message => { atCaller.push(message); };
  relay.onmessage = message => { atRelay.push(message); };
  await caller.start(); await relay.start();
  const close = await bridgeRelay(local, remote);
  const initialize = { jsonrpc: '2.0' as const, id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: { elicitation: {} }, clientInfo: { name: 'fixture', version: '1' } } };
  await caller.send(initialize);
  await tick(); assert.deepEqual(atRelay.pop(), initialize);
  const initialization = { jsonrpc: '2.0' as const, id: 1, result: { protocolVersion: '2025-11-25', serverInfo: { name: 'remote', version: '1' }, capabilities: { resources: {}, tools: {} }, instructions: 'paid relay' } };
  await relay.send(initialization);
  await tick(); assert.deepEqual(atCaller.pop(), initialization);
  const payment = { jsonrpc: '2.0' as const, id: 2, result: { content: [{ type: 'text', text: 'Payment required' }] } };
  await relay.send(payment); await tick(); assert.deepEqual(atCaller.pop(), payment);
  const elicitation = { jsonrpc: '2.0' as const, id: 'confirm', method: 'elicitation/create', params: { message: 'Confirm submission', requestedSchema: { type: 'object', properties: { confirm: { type: 'boolean' } } } } };
  await relay.send(elicitation); await tick(); assert.deepEqual(atCaller.pop(), elicitation);
  const rejected = { jsonrpc: '2.0' as const, id: 'confirm', result: { action: 'decline' } };
  await caller.send(rejected); await tick(); assert.deepEqual(atRelay.pop(), rejected);
  const resource = { jsonrpc: '2.0' as const, id: 3, result: { contents: [{ uri: 'ui://relay/widget', mimeType: 'text/html', text: '<p>Relay app</p>' }] } };
  await relay.send(resource); await tick(); assert.deepEqual(atCaller.pop(), resource);
  const cancelled = { jsonrpc: '2.0' as const, method: 'notifications/cancelled', params: { requestId: 4, reason: 'user cancelled' } };
  await caller.send(cancelled); await tick(); assert.deepEqual(atRelay.pop(), cancelled);
  await close();
});

test('CLI reads route to relay, preserve payment guidance, and reject local mutations', async () => {
  const calls: any[] = [];
  const lines: string[] = [];
  const payment = { content: [{ type: 'text' as const, text: 'Payment required' }] };
  const log = console.log; console.log = (line: string) => { lines.push(line); };
  try {
    const invoke = async (args: string[]) => {
      const program = new Command().exitOverride();
      relayCommands(program, async (name, args = {}) => { calls.push({ name, args }); return payment; });
      await program.parseAsync(args, { from: 'user' });
    };
    await invoke(['courses', 'get', '_100_1', '--json']);
    assert.deepEqual(calls.pop(), { name: 'blackboard_get_course', args: { courseId: '_100_1' } });
    assert.deepEqual(JSON.parse(lines.pop()!), payment);
    await invoke(['upn', 'grades', 'ABC123']);
    assert.deepEqual(calls.pop(), { name: 'upn_get_grades', args: { courseCode: 'ABC123' } });
    await invoke(['miupc', 'procedure-requests', '--closed']);
    assert.deepEqual(calls.pop(), { name: 'miupc_list_procedure_requests', args: { scope: 'closed' } });
    await invoke(['courses', 'discussion-replies', '_1_1', '_2_1', '_3_1', '--limit', '8']);
    assert.deepEqual(calls.pop(), { name: 'blackboard_list_discussion_replies', args: { courseId: '_1_1', discussionId: '_2_1', messageId: '_3_1', limit: 8 } });
    await assert.rejects(invoke(['api', 'POST', '/learn/api/public/v1/test']), /solo permite lecturas/);
    await assert.rejects(invoke(['assignments', 'submit', '_1_1', '_2_1', '--text', 'answer']), /solo lee/);
    assert.equal(calls.length, 0);
  } finally { console.log = log; }
});

test('executable MCP and CLI require relay credentials even when legacy sessions exist', async t => {
  const home = temp(); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, '.blackboard-cli'));
  fs.writeFileSync(path.join(home, '.blackboard-cli', 'session.json'), JSON.stringify({ userId: '_1_1', cookies: [], xsrfToken: 'legacy', expiresAt: Date.now() + 3600_000 }));
  fs.writeFileSync(path.join(home, '.blackboard-cli', 'account.json'), JSON.stringify({ accessToken: 'legacy', accessTokenExpiresAt: Date.now() + 3600_000 }));
  for (const args of [['courses', 'list', '--json'], ['mcp']]) {
    await assert.rejects(exec(process.execPath, [...cliEntry, ...args], { env: { ...process.env, HOME: home }, timeout: 15_000 }), (error: any) => {
      assert.match(error.stderr, /campus login/); assert.equal(error.stdout, ''); return true;
    });
  }
});

test('real stdio MCP and CLI forward the relay gate with no locally registered tools', async t => {
  const f = await fixture(t);
  const home = temp(); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  new RelayCredentialStore(f.url, path.join(home, '.blackboard-cli', 'relay')).save(credentials);
  const env = Object.fromEntries(Object.entries({ ...process.env, HOME: home, CAMPUS_RELAY_URL: f.url.href }).filter((entry): entry is [string, string] => entry[1] !== undefined));
  const client = new Client({ name: 'stdio-fixture', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [...cliEntry, 'mcp'], env, stderr: 'pipe' });
  t.after(() => client.close());
  await client.connect(transport);
  assert.equal(client.getServerVersion()?.name, 'paid-relay-fixture');
  assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['paid_tool']);
  assert.deepEqual(await client.callTool({ name: 'paid_tool' }), f.payment);
  const cli = await exec(process.execPath, [...cliEntry, 'courses', 'list', '--json'], { env, timeout: 15_000 });
  assert.deepEqual(JSON.parse(cli.stdout), f.payment);
  assert.ok(f.calls.filter(call => call.message).every(call => call.authorization === 'Bearer access-fixture'));
  assert.ok(f.calls.some(call => call.message?.method === 'tools/list' && call.version));
});

test('relay authorization, payment HTTP errors and outages never switch the CLI to local providers', async t => {
  const f = await fixture(t);
  const home = temp(); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  new RelayCredentialStore(f.url, path.join(home, '.blackboard-cli', 'relay')).save(credentials);
  for (const status of [402, 403, 503]) {
    f.reject(status);
    await assert.rejects(exec(process.execPath, [...cliEntry, 'courses', 'list', '--json'], {
      env: { ...process.env, HOME: home, CAMPUS_RELAY_URL: f.url.href }, timeout: 15_000,
    }), (error: any) => {
      assert.equal(error.stdout, '');
      assert.match(error.stderr, /relay access rejected/);
      return true;
    });
  }
  assert.ok(f.calls.filter(call => call.message).every(call => call.message.method === 'initialize'));
});

test('npm manifest ships only the relay client, with no direct providers or account-session exports', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.exports, { '.': './run.js' });
  assert.ok(!pkg.files.includes('dist'));
  assert.ok(pkg.files.every((file: string) => !/dist\/(providers|account|analytics)/.test(file)));
  assert.ok(pkg.dependencies.playwright, 'Playwright is used only by local university login');
  assert.ok(!pkg.dependencies.axios);
});
