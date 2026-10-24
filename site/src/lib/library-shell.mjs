/** Render library pages within the same public Base layout as campuscli.com. */
export function renderLibraryShell(template, source) {
  const body = source.match(/<main class="lib-container" id="contenido">([\s\S]*?)<\/main>/)?.[1];
  const title = source.match(/<title>[\s\S]*?<\/title>/)?.[0];
  const description = source.match(/<meta name="description" content="[^"]*">/)?.[0];
  const robots = source.match(/<meta name="robots" content="[^"]*">/)?.[0];
  if (body === undefined || !title || !description || !robots || !template.includes('__CAMPUS_LIBRARY_BODY__')) throw new Error('LIBRARY_PAGE_INVALID');
  const canonical = source.match(/<link rel="canonical" href="[^"]*">/)?.[0];
  if (!canonical) throw new Error('LIBRARY_CANONICAL_MISSING');
  const metadata = [
    ...(source.match(/<meta property="og:[^"]*" content="[^"]*">/g) ?? []),
    ...(source.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? []).map((script) => {
      const json = script.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
      return `<script type="application/ld+json">${JSON.stringify(JSON.parse(json)).replaceAll('<', '\\u003c')}</script>`;
    }),
  ].filter(Boolean).join('');
  return template.replace(/<title>[\s\S]*?<\/title>/, () => title)
    .replace(/<meta name="description" content="[^"]*"\s*\/?\s*>/, () => description)
    .replace(/<meta name="robots" content="[^"]*"\s*\/?\s*>/, () => robots)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?\s*>/, () => canonical)
    .replace(/<meta property="og:(?:title|description|url|type)" content="[^"]*"\s*\/?\s*>/g, '')
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?\s*>/, () => `<meta name="twitter:title" content="${title.slice(7,-8)}">`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?\s*>/, () => description.replace('name="description"', 'name="twitter:description"'))
    .replace('</head>', () => metadata + '</head>')
    .replace('__CAMPUS_LIBRARY_BODY__', () => body);
}
