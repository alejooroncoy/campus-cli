import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'node:crypto';
import type { Session } from '../types.js';
import { track } from '../../../analytics.js';
import { blackboardUniversity } from '../universities.js';

const SESSION_DIR = path.join(os.homedir(), '.blackboard-cli');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');
const PROFILE_DIR = path.join(SESSION_DIR, 'browser-profile');

export function blackboardCookies(cookies: Session['cookies'], universityId?: string): Session['cookies'] {
  const host = new URL(blackboardUniversity(universityId).origin).hostname;
  return cookies.filter((cookie) => {
    const domain = cookie.domain.replace(/^\./, '').toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  });
}

export function saveSession(session: Session): void {
  if (fs.existsSync(SESSION_DIR) && fs.lstatSync(SESSION_DIR).isSymbolicLink()) {
    throw new Error(`Refusing to store credentials through a symbolic link: ${SESSION_DIR}`);
  }
  fs.mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
  fs.chmodSync(SESSION_DIR, 0o700);

  const sanitized = { ...session, cookies: blackboardCookies(session.cookies, session.universityId) };
  const temporary = `${SESSION_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(sanitized, null, 2), { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, SESSION_FILE);
  fs.chmodSync(SESSION_FILE, 0o600);
}

export function loadSession(): Session | null {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    if (fs.lstatSync(SESSION_FILE).isSymbolicLink()) return null;
    fs.chmodSync(SESSION_FILE, 0o600);
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    const session: Session = JSON.parse(raw);
    const filtered = blackboardCookies(session.cookies ?? [], session.universityId);
    if (filtered.length !== (session.cookies ?? []).length) {
      session.ssoExpiresAt ??= getLegacySsoExpiry(session.cookies ?? []);
      session.cookies = filtered;
      saveSession(session); // one-time migration from sessions that stored Microsoft cookies
    }
    if (session.expiresAt && Date.now() > session.expiresAt) {
      track('session_expired', {});
      return null; // expired
    }
    return session;
  } catch {
    return null;
  }
}

function getLegacySsoExpiry(cookies: Session['cookies']): number | undefined {
  const names = new Set(['ESTSAUTHPERSISTENT', 'ESTSAUTHLIGHT', 'ESTSAUTH']);
  const now = Date.now();
  const values = cookies
    .filter((cookie) => names.has(cookie.name) && /login\.(microsoftonline|live)\.com$/.test(cookie.domain.replace(/^\./, '')))
    .map((cookie) => (cookie.expires ?? 0) * 1000)
    .filter((expiry) => expiry > now);
  return values.length ? Math.max(...values) : undefined;
}

export function clearSession(opts: { keepProfile?: boolean } = {}): void {
  try {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  } catch {}
  if (!opts.keepProfile) clearBrowserProfile();
}

// The browser profile holds Microsoft SSO cookies. Without clearing it,
// the next `login` silently re-authenticates with the same account and
// switching users becomes impossible.
export function clearBrowserProfile(): void {
  try {
    if (fs.existsSync(PROFILE_DIR)) fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
  } catch {}
}

export function isSessionValid(session: Session | null): boolean {
  if (!session) return false;
  if (Date.now() > session.expiresAt) return false;
  // JSESSIONID or BbRouter are sufficient for REST API calls
  const hasCriticalCookies =
    session.cookies.some(c => c.name === 'JSESSIONID') ||
    session.cookies.some(c => c.name === 'BbRouter');
  return hasCriticalCookies;
}

export async function loadOrRefreshSession(): Promise<Session | null> {
  // 1. Session still valid — return directly
  const session = loadSession();
  if (session !== null) return session;

  // 2. Session expired — read raw file to preserve userId/userName for silent refresh
  let expiredSession: Session | null = null;
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    expiredSession = JSON.parse(raw);
  } catch {}

  // Dynamic import to avoid circular dependency (login.ts imports from session.ts)
  const { silentRelogin, SilentLoginFailed } = await import('./login.js');
  try {
    return await silentRelogin(expiredSession);
  } catch (err) {
    if (err instanceof SilentLoginFailed) return null; // SSO expired — caller must prompt for login
    throw err;
  }
}
