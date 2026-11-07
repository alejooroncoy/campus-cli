import type { AxiosInstance } from 'axios';
import { getCourseAnnouncements, getCourseContents } from './courses.js';
import { extractEmbeddedFiles } from '../embedded-files.js';

/** Perú no tiene horario de verano: UTC-5 fijo todo el año. */
const PERU_OFFSET_MS = -5 * 60 * 60 * 1000;
const DEFAULT_MAX_NODES = 600;
const TREE_PARALLELISM = 5;

export type RecentChangeKind = 'page' | 'assessment' | 'link' | 'file' | 'announcement' | 'other';

export interface RecentChange {
  id: string;
  kind: RecentChangeKind;
  title: string;
  /** Ruta de carpetas hasta el ítem, p. ej. "Unidad 3 > Semana 11 > S11|Recursos de aprendizaje". */
  path: string;
  /** Fecha de edición en ISO UTC. Es la que ordena la lista. */
  modified: string;
  /** La misma fecha en hora de Perú (UTC-5), legible: "2026-11-06 20:27". */
  modifiedPeru: string;
  /** Fecha de creación tal cual la informa Blackboard. Al clonarse el curso cada ciclo suele ser de años atrás: no indica cuándo lo agregó el profesor. */
  created?: string;
  files: Array<{ name: string; mimeType: string }>;
  activityUrl?: string;
}

export interface RecentChangesResult {
  courseId: string;
  since?: string;
  total: number;
  returned: number;
  nodesVisited: number;
  /** true si el recorrido se cortó por tamaño: no se puede afirmar que no hay más cambios. */
  truncated: boolean;
  /** Carpetas que Blackboard no dejó leer (p. ej. 403). Su contenido no se revisó. */
  unreadableFolders: Array<{ path: string; status?: number }>;
  /** false si no se pudieron leer los anuncios. */
  announcementsChecked: boolean;
  /** true solo si se recorrió todo el árbol y se leyeron los anuncios: únicamente entonces "no hay nada más nuevo" es una afirmación válida. */
  complete: boolean;
  note: string;
  results: RecentChange[];
}

interface ContentNode {
  id: string;
  parentId?: string;
  title?: string;
  body?: unknown;
  created?: string;
  modified?: string;
  hasChildren?: boolean;
  availability?: { available?: string };
  contentHandler?: { id?: string };
}

export function toPeruTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms + PERU_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}

function kindFromHandler(handler: string | undefined): RecentChangeKind {
  if (!handler) return 'other';
  if (handler === 'resource/x-bb-document' || handler === 'resource/x-bb-lesson') return 'page';
  if (handler === 'resource/x-bb-asmt-test-link') return 'assessment';
  if (handler === 'resource/x-bb-externallink') return 'link';
  if (handler === 'resource/x-bb-file') return 'file';
  return 'other';
}

function filesFromBody(body: unknown): Array<{ name: string; mimeType: string }> {
  const html = typeof body === 'string' ? body : undefined;
  if (!html) return [];
  const seen = new Set<string>();
  const files: Array<{ name: string; mimeType: string }> = [];
  for (const file of extractEmbeddedFiles(html)) {
    const key = `${file.displayName}|${file.mimeType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    files.push({ name: file.displayName, mimeType: file.mimeType });
  }
  return files;
}

/**
 * Ordena por fecha de edición descendente y aplica `since` y `limit`.
 * Es pura para poder probarla sin red.
 */
export function rankRecentChanges(
  changes: readonly RecentChange[],
  opts: { since?: string; limit?: number } = {},
): { total: number; results: RecentChange[] } {
  const sinceMs = opts.since ? Date.parse(opts.since) : undefined;
  if (opts.since && Number.isNaN(sinceMs)) throw new Error('since must be an ISO 8601 date');
  const filtered = changes
    .filter((change) => sinceMs === undefined || Date.parse(change.modified) >= sinceMs)
    .sort((a, b) => Date.parse(b.modified) - Date.parse(a.modified));
  return { total: filtered.length, results: filtered.slice(0, opts.limit ?? 20) };
}

async function pagedContents(client: AxiosInstance, courseId: string, parentId?: string): Promise<ContentNode[]> {
  const expectedPrefix = `/learn/api/public/v1/courses/${courseId}/contents`;
  let page = await getCourseContents(client, courseId, parentId);
  const nodes: ContentNode[] = [...(page.results as ContentNode[])];
  let nextPage = page.paging?.nextPage as string | undefined;
  while (nextPage) {
    if (!nextPage.startsWith(expectedPrefix)) {
      throw new Error('Refusing an unexpected Blackboard content page');
    }
    page = (await client.get(nextPage)).data;
    nodes.push(...(page.results as ContentNode[]));
    nextPage = page.paging?.nextPage as string | undefined;
  }
  return nodes;
}

/**
 * Recorre todo el árbol del curso y devuelve lo editado más recientemente.
 *
 * Blackboard no propaga `modified` hacia las carpetas: editar una página
 * interna deja intacta la fecha de la carpeta que la contiene. Por eso se
 * reportan las hojas (páginas, evaluaciones, enlaces) y no los contenedores.
 */
export async function collectRecentChanges(
  client: AxiosInstance,
  courseId: string,
  opts: { since?: string; limit?: number; maxNodes?: number } = {},
): Promise<RecentChangesResult> {
  // Falla antes de recorrer el árbol si la fecha no es válida.
  if (opts.since && Number.isNaN(Date.parse(opts.since))) throw new Error('since must be an ISO 8601 date');

  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
  const visited = new Set<string>();
  const changes: RecentChange[] = [];
  const unreadableFolders: Array<{ path: string; status?: number }> = [];
  let level: Array<{ id: string | undefined; path: string }> = [{ id: undefined, path: '' }];
  let truncated = false;

  while (level.length > 0 && !truncated) {
    const next: Array<{ id: string; path: string }> = [];
    for (let i = 0; i < level.length && !truncated; i += TREE_PARALLELISM) {
      const chunk = level.slice(i, i + TREE_PARALLELISM);
      const children = await Promise.all(
        chunk.map(async (parent) => {
          try {
            return { parent, nodes: await pagedContents(client, courseId, parent.id) };
          } catch (error) {
            // Una sesión vencida debe llegar al usuario; una carpeta sin permiso (403/404) no debe tumbar todo el recorrido.
            if ((error as { code?: unknown })?.code === 'SESSION_EXPIRED') throw error;
            const status = (error as { response?: { status?: number } })?.response?.status;
            if (status !== 403 && status !== 404) throw error;
            unreadableFolders.push({ path: parent.path || '(raíz)', status });
            return { parent, nodes: [] as ContentNode[] };
          }
        }),
      );
      for (const { parent, nodes } of children) {
        for (const node of nodes) {
          if (visited.has(node.id)) continue;
          if (visited.size >= maxNodes) { truncated = true; break; }
          visited.add(node.id);
          if (node.availability?.available === 'No') continue;

          const title = node.title ?? node.id;
          const path = parent.path ? `${parent.path} > ${title}` : title;
          if (node.hasChildren) next.push({ id: node.id, path });
          // Los contenedores se recorren pero no se reportan: su fecha no refleja lo de adentro.
          if (node.hasChildren || !node.modified) continue;

          const handlerId = node.contentHandler?.id;
          const isDocBody = title === 'ultraDocumentBody';
          changes.push({
            id: node.id,
            kind: kindFromHandler(handlerId),
            // Las páginas Ultra se llaman "ultraDocumentBody": la ruta del padre es lo que las identifica.
            title: isDocBody ? parent.path.split(' > ').pop() || title : title,
            path: isDocBody ? parent.path : path,
            modified: node.modified,
            modifiedPeru: toPeruTime(node.modified),
            created: node.created,
            files: filesFromBody(node.body),
            ...(handlerId === 'resource/x-bb-asmt-test-link'
              ? { activityUrl: `https://aulavirtual.upc.edu.pe/ultra/courses/${courseId}/assessment/${node.id}/overview?courseId=${courseId}` }
              : {}),
          });
        }
        if (truncated) break;
      }
    }
    level = next;
  }

  let announcementsChecked = true;
  const announcements = await getCourseAnnouncements(client, courseId).catch((error) => {
    if ((error as { code?: unknown })?.code === 'SESSION_EXPIRED') throw error;
    announcementsChecked = false;
    return undefined;
  });
  for (const announcement of (announcements?.results ?? []) as Array<{ id: string; title?: string; created?: string; modified?: string; draft?: boolean }>) {
    if (announcement.draft) continue;
    const date = announcement.modified ?? announcement.created;
    if (!date) continue;
    changes.push({
      id: announcement.id,
      kind: 'announcement',
      title: announcement.title ?? announcement.id,
      path: 'Anuncios',
      modified: date,
      modifiedPeru: toPeruTime(date),
      created: announcement.created,
      files: [],
    });
  }

  const ranked = rankRecentChanges(changes, { since: opts.since, limit: opts.limit });
  const complete = !truncated && unreadableFolders.length === 0 && announcementsChecked;
  const gaps = [
    truncated ? 'el recorrido se cortó por tamaño' : undefined,
    unreadableFolders.length > 0 ? `${unreadableFolders.length} carpeta(s) sin permiso de lectura` : undefined,
    announcementsChecked ? undefined : 'no se pudieron leer los anuncios',
  ].filter(Boolean);
  return {
    courseId,
    since: opts.since,
    total: ranked.total,
    returned: ranked.results.length,
    nodesVisited: visited.size,
    truncated,
    unreadableFolders,
    announcementsChecked,
    complete,
    note:
      '`modified` es la fecha de edición de la página completa, no de cada archivo: Blackboard no guarda cuándo se subió un archivo. ' +
      '`created` suele ser de años atrás porque el curso se clona cada ciclo. ' +
      (complete
        ? 'El recorrido del árbol fue completo.'
        : `Revisión incompleta (${gaps.join('; ')}): puede haber cambios más recientes sin revisar, no afirmes que no hay nada nuevo.`),
    results: ranked.results,
  };
}
