import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { optimizeHomeStyles } from './optimize-home-styles.mjs';

const dir = await mkdtemp(`${tmpdir()}/campus-home-css-`);
const root = pathToFileURL(`${dir}/`);
try {
  await mkdir(new URL('blog/', root));
  const html = '<link rel="stylesheet" href="/styles.min.css"><header class="site-header"><button class="button">Menu</button></header>';
  await writeFile(new URL('index.html', root), html);
  await writeFile(new URL('blog/index.html', root), html);
  await writeFile(new URL('styles.min.css', root), '@font-face{font-family:Campus;src:url(assets/fonts/font.woff2)}.site-header{display:grid}.site-header.is-scrolled{padding:8px}.js .button.is-visible:hover{color:red}.unused-guide{display:flex}@media(max-width:720px){.site-header{gap:8px}.unused-guide{gap:20px}}');
  const result = await optimizeHomeStyles(root);
  const css = await readFile(new URL(result.name, root), 'utf8');
  assert.doesNotMatch(css, /unused-guide/);
  assert.match(css, /\.site-header\.is-scrolled/);
  assert.match(css, /\.js \.button\.is-visible:hover/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /url\(assets\/fonts\/font\.woff2\)/);
  assert.match(await readFile(new URL('index.html', root), 'utf8'), /href="\/styles-home\.[a-f0-9]{16}\.css"/);
  assert.equal(await readFile(new URL('blog/index.html', root), 'utf8'), html);
  assert.ok(result.optimizedBytes < result.originalBytes);
  console.log('Homepage CSS: unused rules removed; runtime states, fonts, mobile rules and other pages preserved.');
} finally {
  await rm(dir, { recursive: true, force: true });
}
