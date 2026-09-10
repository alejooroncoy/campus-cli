import type { AxiosInstance } from 'axios';
import { assertBlackboardFileUrl } from './api/client.js';

const BLACKBOARD_ORIGIN = 'https://aulavirtual.upc.edu.pe';

export type BlackboardAttachment = {
  id: string;
  fileName?: string;
  displayName?: string;
  mimeType?: string;
  size?: number;
};

export type MediaResourceLink = {
  type: 'resource_link';
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  size?: number;
};

export function isMediaMimeType(mimeType?: string): boolean {
  return /^(?:audio|video)\//i.test(mimeType ?? '');
}

export function embeddedMediaResourceLink(file: { displayName: string; mimeType: string; downloadUrl: string }): MediaResourceLink | null {
  if (!isMediaMimeType(file.mimeType)) return null;
  assertBlackboardFileUrl(file.downloadUrl);
  return {
    type: 'resource_link', uri: file.downloadUrl, name: file.displayName, mimeType: file.mimeType,
    description: 'Recurso multimedia de Blackboard. Si el cliente admite este formato, puede analizarlo o transcribirlo; si no, use blackboard_download_attachment con los metadatos devueltos por la herramienta.',
  };
}

function expiredSession(): never {
  const error = Object.assign(new Error('Session expired. Run: campus login'), { code: 'SESSION_EXPIRED' });
  throw error;
}

function resolveMediaLocation(location: string, requestUrl: string): string {
  const resolved = new URL(location, requestUrl);
  const microsoftLogin = /(?:^|\.)login\.(?:microsoftonline|live)\.com$/i.test(resolved.hostname);
  const blackboardLogin = /^\/webapps\/(?:login(?:\/|$)|bb-auth-provider-[^/]+\/execute\/(?:shibbolethLogin|samlLogin)(?:\/|$))/i.test(resolved.pathname)
    || /^\/auth-saml\/saml\/login(?:\/|$)/i.test(resolved.pathname);
  if (microsoftLogin || blackboardLogin) expiredSession();
  return resolved.href;
}

function hasFileSignature(url: string): boolean {
  const parsed = new URL(url);
  return ['ticket', 'signature', 'sig', 'token'].some(key => parsed.searchParams.has(key));
}

async function resolveSignedMediaLocation(client: AxiosInstance, location: string, requestUrl: string): Promise<string | null> {
  let uri = resolveMediaLocation(location, requestUrl);
  for (let attempt = 0; attempt < 3; attempt++) {
    assertBlackboardFileUrl(uri);
    if (hasFileSignature(uri)) return uri;
    const response = await client.get(uri, {
      responseType: 'stream', maxRedirects: 0, validateStatus: (status) => status >= 200 && status < 400, headers: { Accept: '*/*' },
    });
    response.data?.destroy?.();
    const next = response.headers.location as string | undefined;
    if (!next) return null;
    uri = resolveMediaLocation(next, uri);
  }
  return null;
}

/** Resolves an embedded bbcswebdav URL while the student's Blackboard session
 * is available. Raw embedded URLs are session-protected and cannot be used as
 * MCP resource links by a separate client. */
export async function resolvedEmbeddedMediaResourceLink(
  client: AxiosInstance, file: { displayName: string; mimeType: string; downloadUrl: string },
): Promise<MediaResourceLink | null> {
  if (!isMediaMimeType(file.mimeType)) return null;
  assertBlackboardFileUrl(file.downloadUrl);
  const response = await client.get(file.downloadUrl, {
    responseType: 'stream', maxRedirects: 0, validateStatus: (status) => status >= 200 && status < 400, headers: { Accept: '*/*' },
  });
  response.data?.destroy?.();
  const location = response.headers.location as string | undefined;
  const hasSignature = hasFileSignature(file.downloadUrl);
  if (!location && !(response.status >= 200 && response.status < 300 && hasSignature)) return null;
  const uri = location ? await resolveSignedMediaLocation(client, location, file.downloadUrl) : file.downloadUrl;
  if (!uri) return null;
  return {
    type: 'resource_link', uri, name: file.displayName, mimeType: file.mimeType,
    description: 'Recurso multimedia de Blackboard. Si el cliente admite este formato, puede analizarlo o transcribirlo; si no, use blackboard_download_file_url con el downloadUrl devuelto por la herramienta.',
  };
}

/** Resolves the authenticated attachment endpoint to a short-lived, file-scoped
 * URL. The stream is destroyed immediately: listing must not download media. */
export async function attachmentMediaResourceLink(
  client: AxiosInstance, courseId: string, contentId: string, attachment: BlackboardAttachment,
): Promise<MediaResourceLink | null> {
  if (!isMediaMimeType(attachment.mimeType) || !/^_\d+_\d+$/.test(attachment.id)) return null;
  const response = await client.get(
    `/learn/api/public/v1/courses/${courseId}/contents/${contentId}/attachments/${attachment.id}/download`,
    { responseType: 'stream', maxRedirects: 0, validateStatus: (status) => status >= 200 && status < 400, headers: { Accept: '*/*' } },
  );
  response.data?.destroy?.();
  const location = response.headers.location as string | undefined;
  if (!location) return null;
  const requestUrl = new URL(`/learn/api/public/v1/courses/${courseId}/contents/${contentId}/attachments/${attachment.id}/download`, BLACKBOARD_ORIGIN).href;
  const uri = await resolveSignedMediaLocation(client, location, requestUrl);
  if (!uri) return null;
  return {
    type: 'resource_link', uri,
    name: attachment.fileName ?? attachment.displayName ?? 'Recurso multimedia de Blackboard',
    mimeType: attachment.mimeType!,
    ...(typeof attachment.size === 'number' && Number.isFinite(attachment.size) ? { size: attachment.size } : {}),
    description: 'Recurso multimedia de Blackboard. Si el cliente admite este formato, puede analizarlo o transcribirlo; si no, use blackboard_download_attachment con los metadatos devueltos por la herramienta.',
  };
}
