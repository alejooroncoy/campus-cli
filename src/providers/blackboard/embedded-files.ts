const BLACKBOARD_ORIGIN = 'https://aulavirtual.upc.edu.pe';

export type EmbeddedFile = {
  type: 'embedded';
  displayName: string;
  mimeType: string;
  downloadUrl: string;
};

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match?.[2];
}

function fileNameFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || 'archivo adjunto');
  } catch {
    return 'archivo adjunto';
  }
}

function mediaSubtypeFromUrl(url: URL): string | undefined {
  const extension = url.pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const subtypes: Record<string, string> = {
    aac: 'aac', flac: 'flac', m4a: 'mp4', mp3: 'mpeg', oga: 'ogg', ogg: 'ogg', wav: 'wav', weba: 'webm',
    m4v: 'mp4', mov: 'quicktime', mp4: 'mp4', ogv: 'ogg', webm: 'webm',
  };
  return extension ? subtypes[extension] : undefined;
}

function mediaCategoryFromUrl(url: URL): 'audio' | 'video' | undefined {
  const extension = url.pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension && ['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'wav', 'weba'].includes(extension)) return 'audio';
  if (extension && ['m4v', 'mov', 'mp4', 'ogv', 'webm'].includes(extension)) return 'video';
  return undefined;
}

function htmlTags(html: string): string[] {
  const tags: string[] = [];
  let start = -1;
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < html.length; index++) {
    const character = html[index];
    if (start < 0) {
      if (character === '<') {
        if (html.startsWith('<!--', index)) {
          const end = html.indexOf('-->', index + 4);
          index = end >= 0 ? end + 2 : html.length;
        } else if (html.startsWith('<!', index) || html.startsWith('<?', index)) {
          const end = html.indexOf('>', index + 2);
          index = end >= 0 ? end : html.length;
        } else {
          start = index;
        }
      }
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      tags.push(html.slice(start, index + 1));
      start = -1;
    }
  }
  return tags;
}

/** Blackboard's document viewer can render a file even when it is not exposed
 * by the REST attachments endpoint. */
export function extractEmbeddedFiles(body: string): EmbeddedFile[] {
  const fileIndexes = new Map<string, number>();
  const authoritativeFields = new Map<string, { displayName: boolean; mimeType: boolean }>();
  const files: EmbeddedFile[] = [];
  const mediaAncestors: Array<'audio' | 'video'> = [];

  for (const tag of htmlTags(body)) {
    const tagName = tag.match(/^<\/?\s*(a|iframe|embed|object|audio|video|source)\b/i)?.[1]?.toLowerCase();
    if (!tagName) continue;
    if (tagName === 'audio' || tagName === 'video') {
      if (/^<\//.test(tag)) {
        const ancestor = mediaAncestors.lastIndexOf(tagName);
        if (ancestor >= 0) mediaAncestors.splice(ancestor, 1);
        continue;
      }
      if (!/\/\s*>$/.test(tag)) mediaAncestors.push(tagName);
    }
    const href = attribute(tag, 'href') ?? attribute(tag, 'src') ?? attribute(tag, 'data');
    const rawMetadata = attribute(tag, 'data-bbfile');
    let metadata: Record<string, unknown> = {};
    if (rawMetadata) {
      try {
        metadata = JSON.parse(rawMetadata.replace(/&quot;/g, '"'));
      } catch {
        // Blackboard occasionally supplies malformed metadata; try the URL.
      }
    }

    const candidates = [
      href?.replace(/&amp;/g, '&'),
      typeof metadata.resourceUrl === 'string' ? metadata.resourceUrl : undefined,
    ].filter((candidate): candidate is string => Boolean(candidate));
    let url: URL | undefined;
    for (const candidate of candidates) {
      try {
        const parsed = new URL(candidate, BLACKBOARD_ORIGIN);
        if (parsed.protocol === 'https:' && parsed.origin === BLACKBOARD_ORIGIN && parsed.pathname.startsWith('/bbcswebdav/')) {
          url = parsed;
          break;
        }
      } catch {
        // Try another candidate.
      }
    }
    if (!url) continue;
    const mediaElement = (tagName === 'audio' || tagName === 'video')
      ? tagName
      : tagName === 'source'
        ? mediaAncestors[mediaAncestors.length - 1]
        : undefined;
    const mediaCategory = mediaElement ?? mediaCategoryFromUrl(url);
    const urlMimeType = mediaCategory ? `${mediaCategory}/${mediaSubtypeFromUrl(url) ?? '*'}` : undefined;
    const hasAuthoritativeName = typeof metadata.displayName === 'string'
      || typeof metadata.linkName === 'string'
      || Boolean(attribute(tag, 'title') ?? attribute(tag, 'aria-label'));
    const hasAuthoritativeMimeType = typeof metadata.mimeType === 'string' || Boolean(attribute(tag, 'type'));

    const file: EmbeddedFile = {
      type: 'embedded',
      displayName: typeof metadata.displayName === 'string'
        ? metadata.displayName
        : typeof metadata.linkName === 'string'
          ? metadata.linkName
          : attribute(tag, 'title') ?? attribute(tag, 'aria-label') ?? fileNameFromUrl(url.href),
      mimeType: typeof metadata.mimeType === 'string'
        ? metadata.mimeType
        : attribute(tag, 'type') ?? urlMimeType ?? 'application/octet-stream',
      downloadUrl: url.href,
    };
    const existingIndex = fileIndexes.get(url.href);
    if (existingIndex !== undefined) {
      const existing = files[existingIndex]!;
      const existingAuthority = authoritativeFields.get(url.href) ?? { displayName: false, mimeType: false };
      const isMedia = /^(?:audio|video)\//i.test(file.mimeType);
      const hasNewAuthoritativeField = (hasAuthoritativeName && !existingAuthority.displayName)
        || (hasAuthoritativeMimeType && !existingAuthority.mimeType);
      const shouldUpgrade = hasNewAuthoritativeField
        || (!/^(?:audio|video)\//i.test(existing.mimeType) && isMedia)
        || (Boolean(mediaElement) && existing.mimeType !== file.mimeType && !existingAuthority.mimeType);
      if (shouldUpgrade) {
        files[existingIndex] = {
          ...file,
          ...(existingAuthority.displayName ? { displayName: existing.displayName } : {}),
          ...(existingAuthority.mimeType || (hasNewAuthoritativeField && !hasAuthoritativeMimeType) ? { mimeType: existing.mimeType } : {}),
        };
      }
      authoritativeFields.set(url.href, {
        displayName: existingAuthority.displayName || hasAuthoritativeName,
        mimeType: existingAuthority.mimeType || hasAuthoritativeMimeType,
      });
      continue;
    }
    fileIndexes.set(url.href, files.length);
    authoritativeFields.set(url.href, { displayName: hasAuthoritativeName, mimeType: hasAuthoritativeMimeType });
    files.push(file);
  }

  return files;
}
