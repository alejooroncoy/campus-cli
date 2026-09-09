/**
 * Turns the product pages' source html into the Markdown we hand to assistants.
 *
 * It reads the same `src/html/*.html` file the page renders from, so the two
 * cannot drift. Converting the *built* page instead would mean guessing which
 * parts of a styled document were the content, which is exactly the guesswork
 * publishing Markdown is meant to remove.
 *
 * Deliberately small: it handles the tags those files actually use and nothing
 * else. A general html-to-Markdown library would be a dependency and a much
 * larger surface for output we would not be checking.
 */

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&rsquo;': '’',
  '&larr;': '←',
  '&rarr;': '→',
  '&#8594;': '→',
};

function decode(value: string): string {
  return value.replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity] ?? entity);
}

/** Inline markup, kept: it is meaning, not decoration. */
function inline(html: string, baseUrl: string): string {
  return decode(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<(strong|b)\b[^>]*>(.*?)<\/\1>/gis, (_, __, text) => `**${strip(text)}**`)
      .replace(/<(em|i)\b[^>]*>(.*?)<\/\1>/gis, (_, __, text) => `*${strip(text)}*`)
      .replace(/<code\b[^>]*>(.*?)<\/code>/gis, (_, text) => `\`${strip(text)}\``)
      .replace(/<a\b[^>]*\shref="([^"]+)"[^>]*>(.*?)<\/a>/gis, (_, href: string, text: string) => {
        const label = strip(text);
        if (!label) return '';
        const url = href.startsWith('/') ? `${baseUrl}${href}` : href;
        return `[${label}](${url})`;
      })
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function strip(html: string): string {
  return decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * Walks the document top to bottom so the Markdown keeps the reading order of
 * the page. Anything not matched here is dropped on purpose — navigation,
 * breadcrumbs and call-to-action buttons are page furniture, not content.
 */
export function htmlToMarkdown(html: string, baseUrl = 'https://campuscli.com'): string {
  const body = html
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
    .replace(/<button\b[\s\S]*?<\/button>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
    // The kicker above the title is typography, not a sentence. Left in, it
    // becomes a stray fragment sitting above the heading it was decorating.
    .replace(/<p class="eyebrow"[^>]*>[\s\S]*?<\/p>/gi, '');

  const blocks: string[] = [];
  const pattern =
    /<(h1|h2|h3|p|pre|ul|ol|dl|table)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

  for (const match of body.matchAll(pattern)) {
    const [, tag, , contents] = match;
    const name = tag.toLowerCase();

    if (name === 'h1' || name === 'h2' || name === 'h3') {
      const text = inline(contents, baseUrl);
      if (text) blocks.push(`${'#'.repeat(Number(name[1]))} ${text}`);
      continue;
    }

    if (name === 'p') {
      const text = inline(contents, baseUrl);
      // `.eyebrow` is a visual kicker; as a paragraph of its own it reads as a
      // stray fragment, so it only survives when it carries real words.
      if (text) blocks.push(text);
      continue;
    }

    if (name === 'pre') {
      const code = decode(contents.replace(/<[^>]+>/g, '')).replace(/^\n+|\n+$/g, '');
      if (code.trim()) blocks.push(['```bash', code, '```'].join('\n'));
      continue;
    }

    if (name === 'table') {
      const rows = [...contents.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
        .map((row) => [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)]
          .map((cell) => inline(cell[1], baseUrl).replace(/\|/g, '\\|'))
          .filter(Boolean))
        .filter((row) => row.length);
      if (rows.length) {
        const width = Math.max(...rows.map((row) => row.length));
        const normalized = rows.map((row) => [...row, ...Array(width - row.length).fill('')]);
        blocks.push([`| ${normalized[0].join(' | ')} |`, `| ${Array(width).fill('---').join(' | ')} |`,
          ...normalized.slice(1).map((row) => `| ${row.join(' | ')} |`)].join('\n'));
      }
      continue;
    }

    if (name === 'ul' || name === 'ol') {
      const items = [...contents.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((item, index) => {
          const text = inline(item[1], baseUrl);
          return text ? `${name === 'ol' ? `${index + 1}.` : '-'} ${text}` : '';
        })
        .filter(Boolean);
      if (items.length) blocks.push(items.join('\n'));
      continue;
    }

    if (name === 'dl') {
      const pairs = [
        ...contents.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi),
      ]
        .map(([, term, definition]) => {
          const q = inline(term, baseUrl);
          const a = inline(definition, baseUrl);
          return q && a ? `### ${q}\n\n${a}` : '';
        })
        .filter(Boolean);
      if (pairs.length) blocks.push(pairs.join('\n\n'));
    }
  }

  return blocks.join('\n\n');
}
