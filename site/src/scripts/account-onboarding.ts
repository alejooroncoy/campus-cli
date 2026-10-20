import { assistantReturnPath } from './assistant-handoff.ts';

export const ACCOUNT_HANDOFF_KEY = 'campus-account-handoff-v1';
const key = ACCOUNT_HANDOFF_KEY;
// Only navigation metadata lives here. Messages and drafts never enter analytics.
export function beginAccountHandoff(path: string): void {
  const returnPath = assistantReturnPath(path);
  if (!returnPath) return;
  try { sessionStorage.setItem(key, JSON.stringify({ startedAt: Date.now(), returnPath, completed: false })); } catch { /* Optional. */ }
}
export function accountHandoff() {
  try {
    const item = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (item && assistantReturnPath(item.returnPath) && typeof item.startedAt === 'number'
      && Date.now() >= item.startedAt && Date.now() - item.startedAt < 30 * 60 * 1000
      && typeof item.completed === 'boolean') return item as { startedAt: number; returnPath: string; completed: boolean };
  } catch { /* Optional. */ }
  return null;
}
export function completeAccountHandoff(): boolean {
  const item = accountHandoff();
  if (!item || item.completed) return false;
  try { sessionStorage.setItem(key, JSON.stringify({ ...item, completed: true })); return true; } catch { return false; }
}
export function consumeConversationHandoff(path: string): boolean {
  const item = accountHandoff();
  if (!item?.completed) return false;
  const itemBase = item.returnPath.split('?')[0];
  const targetBase = path.split('?')[0];
  if (itemBase !== targetBase || !targetBase.includes('/c/')) return false;
  try { sessionStorage.removeItem(key); return true; } catch { return false; }
}
