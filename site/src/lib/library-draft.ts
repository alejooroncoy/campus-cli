// Text is committed synchronously on each edit. File blobs use IndexedDB once per
// selection, so typing never rewrites megabytes or depends on an unload handler.
export class DraftConflictError extends Error {
  constructor() { super('El borrador cambió en otra pestaña.'); }
}
export type DraftEnvelope<T> = {
  version: 1; revision: string; savedAt: number; snapshot: T; fileToken: string | null;
};
export type DraftFiles = {
  read(key: string): Promise<{ token: string; files: File[] } | undefined>;
  write(key: string, value: { token: string; files: File[] }): Promise<void>;
  remove(key: string): Promise<void>;
};
export function indexedDraftFiles(): DraftFiles {
  let connection: Promise<IDBDatabase> | undefined;
  const db = () => connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('campus-library-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onerror = () => { connection = undefined; reject(request.error); };
    request.onblocked = () => { connection = undefined; reject(new Error('Almacenamiento ocupado.')); };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); connection = undefined; };
      resolve(database);
    };
  });
  async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('files', mode);
      const request = action(tx.objectStore('files'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error('No se pudo guardar el archivo.'));
      tx.onerror = () => reject(tx.error ?? request.error);
    });
  }
  return {
    read: (key) => transaction('readonly', store => store.get(key)),
    write: async (key, value) => { await transaction('readwrite', store => store.put(value, key)); },
    remove: async (key) => { await transaction('readwrite', store => store.delete(key)); },
  };
}
export async function libraryDraftKey(email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
  return 'campus:library:draft:v1:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export class LibraryDraftStore<T> {
  private expected: string | null = null;
  private fileToken: string | null = null;
  private pending: Promise<void> = Promise.resolve();
  readonly key: string;
  private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  private blobs: DraftFiles;
  constructor(key: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, blobs: DraftFiles) {
    this.key = key; this.storage = storage; this.blobs = blobs;
  }
  async load() {
    this.expected = this.storage.getItem(this.key);
    if (!this.expected) return null;
    const saved = JSON.parse(this.expected) as DraftEnvelope<T>;
    if (saved.version !== 1 || !saved.snapshot || !saved.revision || !Number.isFinite(saved.savedAt)) throw new Error('Borrador local no compatible.');
    this.fileToken = saved.fileToken;
    const record = saved.fileToken ? await this.blobs.read(this.key + ':' + saved.fileToken).catch(() => undefined) : undefined;
    const filesMissing = !!saved.fileToken && record?.token !== saved.fileToken;
    return { ...saved, files: filesMissing ? [] : record?.files ?? [], filesMissing };
  }
  // The comparison and text commit are synchronous: another tab cannot silently
  // replace a newer recovery copy. Retry takeover must be explicit in the UI.
  save(snapshot: T, files?: File[], takeover = false): Promise<number> {
    const actual = this.storage.getItem(this.key);
    if (!takeover && actual !== this.expected) throw new DraftConflictError();
    const previousToken = this.fileToken;
    const nextToken = files === undefined ? this.fileToken : files.length ? crypto.randomUUID() : null;
    const saved: DraftEnvelope<T> = { version: 1, revision: crypto.randomUUID(), savedAt: Date.now(), snapshot, fileToken: nextToken };
    const raw = JSON.stringify(saved);
    this.storage.setItem(this.key, raw);
    this.expected = raw;
    this.fileToken = nextToken;
    if (files !== undefined) {
      const token = this.fileToken;
      this.pending = this.pending.catch(() => {}).then(async () => {
        if (token) await this.blobs.write(this.key + ':' + token, { token, files });
        if (previousToken && previousToken !== token) await this.blobs.remove(this.key + ':' + previousToken);
      });
    }
    return this.pending.then(() => saved.savedAt);
  }
  clear(takeover = false): Promise<void> {
    if (!takeover && this.storage.getItem(this.key) !== this.expected) throw new DraftConflictError();
    const token = this.fileToken;
    this.storage.removeItem(this.key);
    this.expected = null;
    this.fileToken = null;
    this.pending = this.pending.catch(() => {}).then(async () => { if (token) await this.blobs.remove(this.key + ':' + token); });
    return this.pending;
  }
}
