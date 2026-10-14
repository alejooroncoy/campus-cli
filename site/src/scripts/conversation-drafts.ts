export const CONVERSATION_DRAFTS_KEY = 'campus-conversation-drafts-v1';
type DraftStorage = Pick<Storage,'getItem'|'setItem'>;
const validId = (id:string) => id === 'new' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// Drafts stay in this tab and are restored only after the account is known.
// With blocked/full storage, the mounted chat still keeps its in-memory drafts.
export function createConversationDrafts(owner:string|null=null, storage?:DraftStorage) {
  const drafts = new Map<string,string>();
  if (owner && storage) {
    try {
      const saved = JSON.parse(storage.getItem(CONVERSATION_DRAFTS_KEY) ?? 'null');
      if (saved?.owner === owner && Array.isArray(saved.entries)) {
        for (const entry of saved.entries.slice(-100)) {
          if (Array.isArray(entry) && validId(entry[0]) && typeof entry[1] === 'string' && entry[1].length <= 2000) drafts.set(entry[0],entry[1]);
        }
      }
    } catch { /* Optional storage may be unavailable or corrupt. */ }
  }
  return {
    owner,
    get(id:string|null) { return drafts.get(id ?? 'new') ?? ''; },
    set(id:string|null,text:string) {
      const key = id ?? 'new';
      if (!validId(key) || text.length > 2000) return;
      drafts.delete(key);
      if (text) drafts.set(key,text);
      while (drafts.size > 100) drafts.delete(drafts.keys().next().value!);
      if (owner && storage) {
        try { storage.setItem(CONVERSATION_DRAFTS_KEY,JSON.stringify({owner,entries:[...drafts]})); }
        catch { /* Keep the in-memory copy when persistence fails. */ }
      }
    },
    entries() { return drafts.entries(); },
  };
}


export function restoreConversationDrafts(owner:string|null, storage:DraftStorage|undefined,
  pending:ReturnType<typeof createConversationDrafts>, edited:boolean, id:string|null, fieldValue:string) {
  const restored = createConversationDrafts(owner,storage);
  const canAdopt = pending.owner === owner || pending.owner === null && edited;
  if (canAdopt) for (const [key,text] of pending.entries()) restored.set(key === 'new' ? null : key,text);
  // Browser Back may refill a form from an earlier account. Only a real input
  // event in this newly mounted editor counts as an unsaved question to adopt.
  if (pending.owner === null && edited && fieldValue) restored.set(id,fieldValue);
  return restored;
}
