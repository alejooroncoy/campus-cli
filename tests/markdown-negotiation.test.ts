import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';
import proxy, { prefersMarkdown } from '../site/proxy.ts';

const ORIGIN = 'https://campuscli.com';
const PAGES = new URL('../site/src/pages/', import.meta.url).pathname;
const request = (path: string, accept: string, method = 'GET') =>
  new Request(`${ORIGIN}${path}`, { method, headers: { accept } });
const isRewriteTo = (response: Response, path: string) => response.headers.get('x-middleware-rewrite') === `${ORIGIN}${path}`;
const passesThrough = (response: Response) => response.headers.get('x-middleware-next') === '1' && !response.headers.has('x-middleware-rewrite');
const config = JSON.parse(readFileSync(new URL('../site/vercel.json', import.meta.url), 'utf8'));
const matcher: string[] = config.proxy.matcher;

test('Accept parsing honours q values and never serves Markdown that was refused or ranked below HTML', () => {
  for (const accept of ['text/markdown', 'text/markdown;q=1', 'text/markdown ;q=1', 'TEXT/Markdown; q=0.9', 'text/html;q=0.5, text/markdown', 'text/markdown, text/html;q=0.5']) {
    assert.equal(prefersMarkdown(accept), true, accept);
  }
  for (const accept of ['', '*/*', 'text/html', 'text/html,application/xhtml+xml,*/*;q=0.8', 'text/markdown;q=0', 'text/html, text/markdown;q=0.1', 'text/x-markdown', 'text/markdown;q=abc']) {
    assert.equal(prefersMarkdown(accept), false, accept);
  }
});

test('a page that prefers Markdown is rewritten to its twin for GET and HEAD, without any network probe', () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('the middleware must not use the network'); }) as typeof fetch;
  try {
    for (const method of ['GET', 'HEAD']) {
      const response = proxy(request('/herramientas/formato-apa-7/?utm=x', 'text/markdown', method));
      assert.ok(isRewriteTo(response, '/herramientas/formato-apa-7/index.md'), method);
      assert.equal(response.headers.get('vary'), 'Accept');
    }
    assert.ok(isRewriteTo(proxy(request('/', 'text/markdown')), '/index.md'));
  } finally {
    globalThis.fetch = original;
  }
});

test('browsers, refused Markdown, other methods and non-page paths pass through', () => {
  for (const [path, accept, method] of [
    ['/herramientas/formato-apa-7/', 'text/html,application/xhtml+xml,*/*;q=0.8', 'GET'],
    ['/herramientas/formato-apa-7/', '*/*', 'GET'],
    ['/herramientas/formato-apa-7/', 'text/markdown;q=0', 'GET'],
    ['/herramientas/formato-apa-7/', 'text/html, text/markdown;q=0.1', 'GET'],
    ['/herramientas/formato-apa-7', 'text/markdown', 'GET'],
    ['/herramientas/formato-apa-7/', 'text/markdown', 'POST'],
    ['//evil/', 'text/markdown', 'GET'],
    ['/%5Cevil/', 'text/markdown', 'GET'],
    ['/with.dot/', 'text/markdown', 'GET'],
    ['/blog/x/index.md', 'text/markdown', 'GET'],
  ]) {
    assert.ok(passesThrough(proxy(request(path, accept, method))), `${method} ${path} ${accept}`);
  }
});

/** The page source that would answer a matcher entry: `/blog/:slug/` -> `blog/[slug]/`. */
const sourceDir = (entry: string) => join(PAGES, entry.replace(/:([a-z]+)/gi, '[$1]'));

test('every matcher entry is a page that has a Markdown twin, so the rewrite needs no probe', () => {
  for (const entry of matcher) {
    assert.match(entry, /^\/(?:[a-z0-9:_-]+\/)*$/i, entry);
    assert.ok(existsSync(join(sourceDir(entry), 'index.md.ts')), `${entry} has no index.md.ts`);
  }
});

test('every page with a Markdown twin is in the matcher', () => {
  const twins: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name === 'index.md.ts') {
        const rel = relative(PAGES, dir).split(sep).filter(Boolean).map((part) => part.replace(/^\[(.+)\]$/, ':$1'));
        twins.push(rel.length ? `/${rel.join('/')}/` : '/');
      }
    }
  };
  walk(PAGES);
  assert.deepEqual(twins.sort(), [...matcher].sort());
});

test('a function-built page gets its HTML function for browsers and its Markdown twin for agents', () => {
  const browser = proxy(request('/blackboard-chatgpt/?page=2', 'text/html,application/xhtml+xml,*/*;q=0.8'));
  assert.ok(isRewriteTo(browser, '/api/blackboard-chatgpt?page=2'));
  assert.ok(isRewriteTo(proxy(request('/blackboard-chatgpt/', 'text/markdown')), '/blackboard-chatgpt/index.md'));
  assert.ok(passesThrough(proxy(request('/blog/', 'text/html'))));
});
