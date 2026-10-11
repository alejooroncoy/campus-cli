// Kept in the mounted chat, never in persistent browser storage or shared across users.
export function createConversationCache<T>(load: (id: string, before?: string | null) => Promise<T>) {
  const values = new Map<string, { value: T; expires: number }>();
  const pending = new Map<string, Promise<T>>();
  const keyFor = (id: string, before?: string | null) => `${id}:${before ?? ""}`;
  function peek(id: string, before?: string | null): T | undefined {
    const key = keyFor(id, before);
    const entry = values.get(key);
    if (!entry) return;
    if (entry.expires <= Date.now()) { values.delete(key); return; }
    return entry.value;
  }
  function get(id: string, before?: string | null): Promise<T> {
    const value = peek(id, before);
    if (value !== undefined) return Promise.resolve(value);
    const key = keyFor(id, before);
    const existing = pending.get(key);
    if (existing) return existing;
    const request = load(id, before).then(value => {
      // A response invalidated after sending/deleting must not revive old messages.
      if (pending.get(key) === request) {
        values.set(key, { value, expires: Date.now() + 60_000 });
        if (values.size > 24) values.delete(values.keys().next().value!);
      }
      return value;
    }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
    pending.set(key, request);
    return request;
  }
  function invalidate(id: string) {
    for (const key of values.keys()) if (key.startsWith(`${id}:`)) values.delete(key);
    for (const key of pending.keys()) if (key.startsWith(`${id}:`)) pending.delete(key);
  }
  return { peek, get, invalidate };
}
