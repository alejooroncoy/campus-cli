import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { externalizeAppScripts } from './externalize-app-scripts.mjs';
import { runInNewContext } from 'node:vm';
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
  // A route swap can connect an island while the external client loader is
  // still downloading. It must wait, then reuse that loader on the same root.
  const islandPath = join(root,'app','island.html');
  await writeFile(islandPath, `<script>customElements.define("astro-island", class { constructor() { if (Astro.load === undefined) self.waiting = true; } });</script>`);
  await externalizeAppScripts(root);
  const islandHtml = await readFile(islandPath,'utf8');
  const islandAsset = islandHtml.match(/src="\/assets\/([^"]+)"/)[1];
  const source = await readFile(join(root,'assets',islandAsset),'utf8');
  const context = {customElements:{define:(_name, Island)=>new Island()}}; context.self = context;
  runInNewContext(source,context);
  assert.equal(context.waiting,true);
  const namespace = context.Astro;
  runInNewContext('self.Astro.load = () => "ready";',context);
  runInNewContext(source,context);
  assert.equal(context.Astro,namespace,'The external runtime must preserve already registered client loaders.');
  assert.equal(context.Astro.load(),'ready');
  console.log('App bootstrap externalization: passed');
} finally { await rm(root,{recursive:true,force:true}); }
