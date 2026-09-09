import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractEmbeddedFiles } from '../src/providers/blackboard/embedded-files.js';
import { attachmentMediaResourceLink, embeddedMediaResourceLink, resolvedEmbeddedMediaResourceLink } from '../src/providers/blackboard/resource-links.js';

test('finds a viewer-only Blackboard file when the attachments API is empty', () => {
  const files = extractEmbeddedFiles('<iframe title="SEMANA 01 - 2026-2.pptx" src="/bbcswebdav/pid-1-dt-content-rid-2/xid-3"></iframe>');
  assert.equal(files[0]?.downloadUrl, 'https://aulavirtual.upc.edu.pe/bbcswebdav/pid-1-dt-content-rid-2/xid-3');
});

test('rejects external and non-file links', () => {
  const files = extractEmbeddedFiles('<a href="https://evil.example/bbcswebdav/file">outside</a><a href="/webapps/blackboard/content/listContent.jsp">not a file</a>');
  assert.deepEqual(files, []);
});

test('finds Blackboard video elements embedded in assignment instructions', () => {
  const files = extractEmbeddedFiles('<video title="Self-introduction"><source type="video/mp4" src="/bbcswebdav/pid-7/video.mp4"></video>');
  assert.equal(files.length, 1);
  assert.equal(files[0]?.mimeType, 'video/mp4');
  assert.equal(files[0]?.downloadUrl, 'https://aulavirtual.upc.edu.pe/bbcswebdav/pid-7/video.mp4');
  assert.equal(embeddedMediaResourceLink(files[0]!)?.type, 'resource_link');
});

test('uses exact HTML attribute names instead of prefixed lookalikes', () => {
  const files = extractEmbeddedFiles('<video data-src="https://example.com/placeholder" src="/bbcswebdav/pid-7/video.mp4" data-type="application/octet-stream" type="video/mp4"></video>');
  assert.equal(files[0]?.downloadUrl, 'https://aulavirtual.upc.edu.pe/bbcswebdav/pid-7/video.mp4');
  assert.equal(files[0]?.mimeType, 'video/mp4');
});

test('keeps a quoted greater-than sign inside Blackboard metadata', () => {
  const files = extractEmbeddedFiles(`<a data-bbfile='{"displayName":"Week 1 > Overview.mp4"}' href="/bbcswebdav/pid-7/video.mp4"></a>`);
  assert.equal(files[0]?.displayName, 'Week 1 > Overview.mp4');
  assert.equal(files[0]?.downloadUrl, 'https://aulavirtual.upc.edu.pe/bbcswebdav/pid-7/video.mp4');
});

test('skips HTML comments before extracting embedded files', () => {
  const files = extractEmbeddedFiles(`<!-- student's video --><video src="/bbcswebdav/pid-7/video.mp4"></video>`);
  assert.equal(files[0]?.downloadUrl, 'https://aulavirtual.upc.edu.pe/bbcswebdav/pid-7/video.mp4');
});

test('infers media type for an untyped source element from its URL', () => {
  const files = extractEmbeddedFiles('<video><source src="/bbcswebdav/pid-7/video.mp4"></video>');
  assert.equal(files[0]?.mimeType, 'video/mp4');
  assert.equal(embeddedMediaResourceLink(files[0]!)?.type, 'resource_link');
});

test('source elements retain their parent media category when the URL is ambiguous', () => {
  const files = extractEmbeddedFiles('<video><source src="/bbcswebdav/pid-7/xid-3"></video><audio><source src="/bbcswebdav/pid-8/clip.webm"></audio>');
  assert.equal(files[0]?.mimeType, 'video/*');
  assert.equal(files[1]?.mimeType, 'audio/webm');
  assert.ok(embeddedMediaResourceLink(files[0]!));
  assert.ok(embeddedMediaResourceLink(files[1]!));
});

test('an explicit media occurrence upgrades an earlier generic occurrence of the same URL', () => {
  const files = extractEmbeddedFiles('<iframe src="/bbcswebdav/pid-7/xid-3"></iframe><video src="/bbcswebdav/pid-7/xid-3"></video>');
  assert.equal(files.length, 1);
  assert.equal(files[0]?.mimeType, 'video/*');
  assert.ok(embeddedMediaResourceLink(files[0]!));
});

test('an explicit media occurrence corrects an earlier URL-based media inference', () => {
  const files = extractEmbeddedFiles('<a href="/bbcswebdav/pid-7/clip.webm">Archivo</a><audio src="/bbcswebdav/pid-7/clip.webm"></audio>');
  assert.equal(files.length, 1);
  assert.equal(files[0]?.mimeType, 'audio/webm');
});

test('deduplication preserves authoritative Blackboard metadata', () => {
  const files = extractEmbeddedFiles(`<a data-bbfile='{"resourceUrl":"/bbcswebdav/pid-7/xid-3","displayName":"Clase grabada","mimeType":"video/mp4"}'></a><video src="/bbcswebdav/pid-7/xid-3"></video>`);
  assert.equal(files.length, 1);
  assert.equal(files[0]?.displayName, 'Clase grabada');
  assert.equal(files[0]?.mimeType, 'video/mp4');
});

test('later authoritative Blackboard metadata replaces earlier URL inference', () => {
  const files = extractEmbeddedFiles(`<a href="/bbcswebdav/pid-7/clip.webm">Archivo</a><a data-bbfile='{"resourceUrl":"/bbcswebdav/pid-7/clip.webm","displayName":"Audio de clase","mimeType":"audio/webm"}'></a>`);
  assert.equal(files.length, 1);
  assert.equal(files[0]?.displayName, 'Audio de clase');
  assert.equal(files[0]?.mimeType, 'audio/webm');
});

test('infers media type from a direct video URL when Blackboard omits type', () => {
  const files = extractEmbeddedFiles('<video src="/bbcswebdav/pid-9/self-introduction.mp4"></video>');

  assert.equal(files[0]?.mimeType, 'video/mp4');
  assert.equal(embeddedMediaResourceLink(files[0]!)?.type, 'resource_link');
});

test('keeps the media element category for untyped extensionless and WebM embeds', () => {
  const files = extractEmbeddedFiles('<video src="/bbcswebdav/pid-9/xid-3"></video><audio src="/bbcswebdav/pid-10/clip.webm"></audio>');
  assert.equal(files[0]?.mimeType, 'video/*');
  assert.equal(files[1]?.mimeType, 'audio/webm');
  assert.ok(embeddedMediaResourceLink(files[0]!));
  assert.ok(embeddedMediaResourceLink(files[1]!));
});

test('finds Blackboard audio elements embedded in assignment instructions', () => {
  const files = extractEmbeddedFiles('<audio title="Pronunciación" type="audio/mpeg" src="/bbcswebdav/pid-8/audio.mp3"></audio>');

  assert.equal(files.length, 1);
  assert.equal(files[0]?.mimeType, 'audio/mpeg');
  assert.equal(embeddedMediaResourceLink(files[0]!)?.type, 'resource_link');
});

test('turns embedded Blackboard media into a resource link', () => {
  const link = embeddedMediaResourceLink({ displayName: 'Self-introduction.mp4', mimeType: 'video/mp4', downloadUrl: 'https://aulavirtual.upc.edu.pe/bbcswebdav/pid-7/video.mp4' });
  assert.equal(link?.type, 'resource_link');
  assert.match(link?.description ?? '', /analizarlo o transcribirlo/);
});

test('resolves embedded media before exposing a resource link', async () => {
  let destroyed = false;
  const client = { get: async () => ({ data: { destroy: () => { destroyed = true; } }, headers: { location: '/bbcswebdav/pid-7/video.mp4?ticket=temporary' } }) } as any;
  const link = await resolvedEmbeddedMediaResourceLink(client, { displayName: 'Self-introduction.mp4', mimeType: 'video/mp4', downloadUrl: 'https://aulavirtual.upc.edu.pe/bbcswebdav/pid-7/video.mp4' });
  assert.equal(destroyed, true);
  assert.equal(link?.uri, 'https://aulavirtual.upc.edu.pe/bbcswebdav/pid-7/video.mp4?ticket=temporary');
});

test('keeps a directly served signed embedded media URL', async () => {
  let destroyed = false;
  const client = { get: async () => ({ status: 200, data: { destroy: () => { destroyed = true; } }, headers: {} }) } as any;
  const url = 'https://aulavirtual.upc.edu.pe/bbcswebdav/pid-7/video.mp4?ticket=temporary';
  const link = await resolvedEmbeddedMediaResourceLink(client, { displayName: 'Self-introduction.mp4', mimeType: 'video/mp4', downloadUrl: url });
  assert.equal(destroyed, true);
  assert.equal(link?.uri, url);
});

test('resolves an attached video without downloading it', async () => {
  let destroyed = false;
  const client = { get: async () => ({ data: { destroy: () => { destroyed = true; } }, headers: { location: 'https://aulavirtual.upc.edu.pe/bbcswebdav/pid-8/video.mp4' } }) } as any;
  const link = await attachmentMediaResourceLink(client, '_10_1', '_20_1', { id: '_30_1', fileName: 'Video de Adrián.mp4', mimeType: 'video/mp4', size: 5_996_902 });
  assert.equal(destroyed, true);
  assert.deepEqual(link && { type: link.type, name: link.name, mimeType: link.mimeType, size: link.size }, { type: 'resource_link', name: 'Video de Adrián.mp4', mimeType: 'video/mp4', size: 5_996_902 });
});

test('resolves relative Blackboard attachment redirects before exposing them', async () => {
  const client = { get: async () => ({ data: { destroy() {} }, headers: { location: '/bbcswebdav/pid-8/video.mp4' } }) } as any;
  const link = await attachmentMediaResourceLink(client, '_10_1', '_20_1', { id: '_30_1', mimeType: 'video/mp4' });
  assert.equal(link?.uri, 'https://aulavirtual.upc.edu.pe/bbcswebdav/pid-8/video.mp4');
});

test('does not resolve ordinary documents as media resource links', async () => {
  const client = { get: async () => { throw new Error('should not fetch'); } } as any;
  assert.equal(await attachmentMediaResourceLink(client, '_10_1', '_20_1', { id: '_30_1', mimeType: 'application/pdf' }), null);
});
