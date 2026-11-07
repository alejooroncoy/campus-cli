import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AxiosInstance } from 'axios';
import { collectRecentChanges, rankRecentChanges, toPeruTime, type RecentChange } from '../src/providers/blackboard/api/recent-changes.js';

const change = (id: string, modified: string): RecentChange => ({
  id, kind: 'page', title: id, path: id, modified, modifiedPeru: toPeruTime(modified), files: [],
});

test('toPeruTime converts UTC to UTC-5 across midnight', () => {
  assert.equal(toPeruTime('2026-11-07T01:27:55.344Z'), '2026-11-06 20:27');
});

test('rankRecentChanges sorts newest first and honours since and limit', () => {
  const input = [change('a', '2026-10-07T13:35:00Z'), change('b', '2026-11-07T01:27:00Z'), change('c', '2026-10-19T13:58:00Z')];
  assert.deepEqual(rankRecentChanges(input).results.map((c) => c.id), ['b', 'c', 'a']);
  assert.deepEqual(rankRecentChanges(input, { since: '2026-10-10T00:00:00Z' }).results.map((c) => c.id), ['b', 'c']);
  const limited = rankRecentChanges(input, { limit: 1 });
  assert.equal(limited.total, 3);
  assert.deepEqual(limited.results.map((c) => c.id), ['b']);
  assert.throws(() => rankRecentChanges(input, { since: 'nope' }));
});

// Árbol: raíz > Unidad (carpeta vieja) > Semana (carpeta vieja) > página editada hoy.
// Reproduce el caso real: las carpetas dicen 7 oct y la página interna se editó el 6 nov.
const pptxBody = '<a data-bbfile="{&quot;displayName&quot;:&quot;ejercicio.pptx&quot;,&quot;mimeType&quot;:&quot;application/vnd.openxmlformats-officedocument.presentationml.presentation&quot;,&quot;resourceUrl&quot;:&quot;https://aulavirtual.upc.edu.pe/bbcswebdav/pid-1/x.pptx&quot;,&quot;render&quot;:&quot;inline&quot;}" href="https://aulavirtual.upc.edu.pe/bbcswebdav/pid-1/x.pptx"></a>';
const tree: Record<string, unknown[]> = {
  root: [{ id: 'u3', title: 'Unidad 3', hasChildren: true, modified: '2026-10-19T13:58:00Z' }],
  u3: [{ id: 's11', parentId: 'u3', title: 'Semana 11', hasChildren: true, modified: '2026-10-07T13:34:00Z' }],
  s11: [
    { id: 'rec', parentId: 's11', title: 'S11|Recursos', hasChildren: true, modified: '2026-10-07T13:35:00Z' },
    { id: 'priv', parentId: 's11', title: 'Oculto', modified: '2026-11-08T00:00:00Z', availability: { available: 'No' } },
  ],
  rec: [{
    id: 'doc', parentId: 'rec', title: 'ultraDocumentBody', modified: '2026-11-07T01:27:55.344Z', created: '2022-08-05T02:05:04Z',
    body: pptxBody, contentHandler: { id: 'resource/x-bb-document' },
  }],
};

function fakeClient(): AxiosInstance {
  return {
    get: async (url: string) => {
      if (url.endsWith('/announcements')) {
        return { data: { results: [{ id: 'ann', title: 'Feedback', created: '2026-10-02T22:02:47Z' }] } };
      }
      const parent = url.match(/contents\/([^/]+)\/children/)?.[1] ?? 'root';
      return { data: { results: tree[parent] ?? [], paging: {} } };
    },
  } as unknown as AxiosInstance;
}

test('collectRecentChanges surfaces a page edited inside folders that look old', async () => {
  const result = await collectRecentChanges(fakeClient(), '_1_1', { limit: 5 });
  assert.equal(result.truncated, false);
  assert.equal(result.complete, true);
  assert.equal(result.results[0].id, 'doc');
  assert.equal(result.results[0].modifiedPeru, '2026-11-06 20:27');
  assert.equal(result.results[0].path, 'Unidad 3 > Semana 11 > S11|Recursos');
  assert.equal(result.results[0].title, 'S11|Recursos');
  assert.deepEqual(result.results[0].files.map((f) => f.name), ['ejercicio.pptx']);
  // Carpetas y contenido oculto no se reportan; el anuncio sí.
  assert.deepEqual(result.results.map((c) => c.id), ['doc', 'ann']);
});

test('collectRecentChanges reports truncation instead of claiming completeness', async () => {
  const result = await collectRecentChanges(fakeClient(), '_1_1', { maxNodes: 2 });
  assert.equal(result.truncated, true);
  assert.equal(result.complete, false);
  assert.match(result.note, /cortó por tamaño/);
});

test('an unreadable folder does not abort the walk but marks the result incomplete', async () => {
  const client = {
    get: async (url: string) => {
      if (url.endsWith('/announcements')) return { data: { results: [] } };
      const parent = url.match(/contents\/([^/]+)\/children/)?.[1] ?? 'root';
      if (parent === 's11') throw Object.assign(new Error('forbidden'), { response: { status: 403 } });
      return { data: { results: tree[parent] ?? [], paging: {} } };
    },
  } as unknown as AxiosInstance;
  const result = await collectRecentChanges(client, '_1_1');
  assert.equal(result.complete, false);
  assert.deepEqual(result.unreadableFolders, [{ path: 'Unidad 3 > Semana 11', status: 403 }]);
  assert.match(result.note, /no afirmes que no hay nada nuevo/);
});

test('a session expiry is not swallowed by the per-folder tolerance', async () => {
  const client = {
    get: async () => { throw Object.assign(new Error('expired'), { code: 'SESSION_EXPIRED' }); },
  } as unknown as AxiosInstance;
  await assert.rejects(collectRecentChanges(client, '_1_1'), /expired/);
});

test('a document page at the root keeps a non-empty title', async () => {
  const client = {
    get: async (url: string) => url.endsWith('/announcements')
      ? { data: { results: [] } }
      : { data: { results: [{ id: 'd', title: 'ultraDocumentBody', modified: '2026-11-01T00:00:00Z', contentHandler: { id: 'resource/x-bb-document' } }], paging: {} } },
  } as unknown as AxiosInstance;
  const result = await collectRecentChanges(client, '_1_1');
  assert.equal(result.results[0].title, 'ultraDocumentBody');
});

test('an invalid since fails before walking the tree', async () => {
  let calls = 0;
  const client = { get: async () => { calls += 1; return { data: { results: [] } }; } } as unknown as AxiosInstance;
  await assert.rejects(collectRecentChanges(client, '_1_1', { since: 'nope' }), /ISO 8601/);
  assert.equal(calls, 0);
});
