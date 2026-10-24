// A locator for an explicitly saved local draft, never an authentication grant.
export const LIBRARY_OFFLINE_OWNER = 'campus:library:offline-owner:v1';
type StorageReader = Pick<Storage, 'getItem'>;
export type OfflineOwner = { key: string; scope: string };
export function readOfflineOwner(storage: StorageReader): OfflineOwner | null {
  try {
    const owner = JSON.parse(storage.getItem(LIBRARY_OFFLINE_OWNER) ?? 'null');
    if (!/^campus:library:draft:v1:[a-f0-9]{64}$/.test(owner?.key) || typeof owner.scope !== 'string' || !owner.scope) return null;
    const identity = JSON.parse(storage.getItem('campus-session-revision-v1') ?? 'null')?.identity;
    if (identity && identity !== owner.key.split(':').at(-1)) return null;
    return { key: owner.key, scope: owner.scope };
  } catch { return null; }
}
export function rememberOfflineOwner(storage: Pick<Storage, 'setItem'>, owner: OfflineOwner) {
  storage.setItem(LIBRARY_OFFLINE_OWNER, JSON.stringify(owner));
}
export function forgetOfflineOwner(storage: Pick<Storage, 'removeItem'>) {
  storage.removeItem(LIBRARY_OFFLINE_OWNER);
}
