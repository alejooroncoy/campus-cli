import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { externalizeAppScripts } from './externalize-app-scripts.mjs';
const root = await mkdtemp(join(tmpdir(), 'campus-csp-'));
try {
  await mkdir(join(root,'app'));
  const path = join(root,'app','index.html');
  await writeFile(path, '<script type="module">import "./test.js";</script><script type="application/json">{"a":1}</script><script src="/existing.js"></script>');
  await externalizeAppScripts(root);
  const html = await readFile(path,'utf8');
  assert.match(html, /type="module" src="\/assets\/campus-bootstrap-[a-f0-9]+\.js"/);
  assert.ok(html.includes('<script type="application/json">{"a":1}</script>'));
  const [asset] = await readdir(join(root,'assets'));
  assert.equal(await readFile(join(root,'assets',asset),'utf8'), 'import "./test.js";');
  await externalizeAppScripts(root);
  assert.equal(await readFile(path,'utf8'),html);
  console.log('App bootstrap externalization: passed');
} finally { await rm(root,{recursive:true,force:true}); }
