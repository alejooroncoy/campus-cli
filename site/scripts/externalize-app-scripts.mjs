// Astro's island bootstrap is inline. Publish it as same-origin files so the
// app works under the existing strict CSP without allowing inline execution.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
export async function externalizeAppScripts(root) {
  const assets = join(root, 'assets');
  await mkdir(assets, { recursive: true });
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith('.html')) {
        const html = await readFile(path, 'utf8');
        const matches = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
        let next = html;
        for (const [tag, attrs, body] of matches) {
          if (/\bsrc\s*=/i.test(attrs) || !body.trim()) continue;
          const type = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1];
          if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
          const digest = createHash('sha256').update(body).digest('hex').slice(0, 24);
          const name = `campus-bootstrap-${digest}.js`;
          await writeFile(join(assets, name), body);
          next = next.replace(tag, `<script${attrs} src="/assets/${name}"></script>`);
        }
        if (next !== html) await writeFile(path, next);
      }
    }
  }
  await visit(join(root, 'app'));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await externalizeAppScripts(new URL('../dist/', import.meta.url).pathname);
