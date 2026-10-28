import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PurgeCSS } from 'purgecss';
import { transform } from 'esbuild';

// Derive the homepage's shared styles from the final HTML, including any
// build-time feature flags. Other pages retain the complete shared stylesheet.
export async function optimizeHomeStyles(root) {
  const pagePath = new URL('index.html', root);
  const html = await readFile(pagePath, 'utf8');
  const originalLink = 'href="/styles.min.css"';
  if (!html.includes(originalLink)) throw new Error('Homepage shared stylesheet link is missing.');
  const shared = await readFile(new URL('styles.min.css', root), 'utf8');
  const [result] = await new PurgeCSS().purge({
    content: [{ raw: html, extension: 'html' }],
    css: [{ raw: shared }],
    // These states are applied by the shared navigation/reveal script.
    safelist: ['js', 'is-scrolled', 'is-visible'],
  });
  const { code } = await transform(result.css, { loader: 'css', minify: true });
  const digest = createHash('sha256').update(code).digest('hex').slice(0, 16);
  // Keep the original root-relative location so font URLs resolve identically.
  const name = `styles-home.${digest}.css`;
  await writeFile(new URL(name, root), code);
  await writeFile(pagePath, html.replace(originalLink, `href="/${name}"`));
  return { originalBytes: Buffer.byteLength(shared), optimizedBytes: Buffer.byteLength(code), name };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Homepage shared CSS:', await optimizeHomeStyles(new URL('../dist/', import.meta.url)));
}
