const key = 'campus-mcp-handoff-v1';
const clients = ['chatgpt', 'gemini', 'claude', 'cursor', 'vscode'] as const;
type Client = typeof clients[number];
type Handoff = { aiClient: Client; aiClientSource: 'handoff_url'; expires: number };
const ttl = 30 * 60_000;
// Analytics only: this marker confers no identity, payment or account permissions.
export function mcpHandoff(url: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, now = Date.now()): Record<string, string> {
  try {
    const current = new URL(url);
    const client = current.searchParams.get('ai_client');
    if (['/app/turnitin/', '/turnitin/'].includes(current.pathname) && current.searchParams.get('source') === 'mcp') {
      if (!clients.includes(client as Client)) { storage.removeItem(key); return {}; }
      const saved: Handoff = { aiClient: client as Client, aiClientSource: 'handoff_url', expires: now + ttl };
      storage.setItem(key, JSON.stringify(saved));
      return { aiClient: saved.aiClient, aiClientSource: saved.aiClientSource };
    }
    const saved: Handoff = JSON.parse(storage.getItem(key) ?? 'null');
    if (!saved || !clients.includes(saved.aiClient) || saved.aiClientSource !== 'handoff_url'
      || !Number.isFinite(saved.expires) || saved.expires <= now || saved.expires > now + ttl) {
      storage.removeItem(key); return {};
    }
    return { aiClient: saved.aiClient, aiClientSource: saved.aiClientSource };
  } catch { return {}; }
}
export function clearMcpHandoff(storage: Pick<Storage, 'removeItem'>): void {
  try { storage.removeItem(key); } catch { /* Optional analytics storage. */ }
}
