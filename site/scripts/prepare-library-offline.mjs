import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Only build-produced, account-free HTML enters the shell cache. Never copy a
// runtime page, session response, uploaded file or any other API response.
const root = new URL('../dist/', import.meta.url);
const html = await readFile(new URL('app/biblioteca/index.html', root), 'utf8');
await writeFile(new URL('library-offline.html', root), html);
const assets = new Set(['/library-offline.html']);
const version = createHash('sha256').update(html);
const pending = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1]);
while (pending.length) {
  const url = new URL(pending.pop(), 'https://offline.campus.invalid/');
  if (url.origin !== 'https://offline.campus.invalid' || !/\.(?:js|css|woff2|svg|webp|ico|png)$/.test(url.pathname)) continue;
  const path = url.pathname + url.search;
  if (assets.has(path)) continue;
  assets.add(path);
  const content = await readFile(new URL('.' + url.pathname, root));
  version.update(path).update(content);
  if (url.pathname.endsWith('.js')) {
    for (const match of content.toString().matchAll(/["'](\.{1,2}\/[^"']+\.js)["']/g)) pending.push(new URL(match[1], url).pathname);
  }
}
await writeFile(new URL('library-offline-assets.json', root), JSON.stringify([...assets]));
const worker = await readFile(new URL('sw.js', root), 'utf8');
await writeFile(new URL('sw.js', root), worker.replace('"campus-shell-v14"', JSON.stringify('campus-shell-v14-' + version.digest('hex').slice(0,16))));
console.log(`Library offline shell: ${assets.size} static assets.`);
