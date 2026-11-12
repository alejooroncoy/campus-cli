import { mcpHandoff } from './mcp-handoff.ts';
import { metaCampaign } from './web-analytics.ts';
import { analyticsPage } from './analytics-contract.ts';

const key = 'campus_entry';
const ttl = 24 * 60 * 60_000;
const firstKey = 'campus_entry_first_v1';
const firstTtl = 30 * 86400_000;
const cookieOptions = 'Path=/api/app/auth/; SameSite=Lax; Secure';

export function rememberEntry(projectKey: string, startingAuth = false): void {
  try {
    // Match the opt-out that the analytics client preserves across SDK migration.
    const consent = JSON.parse(localStorage.getItem(`ph_campus_analytics_v2_${projectKey}`) ?? 'null');
    if (consent?.opted_out === true || localStorage.getItem(`__ph_opt_in_out_${projectKey}`) === '0') {
      clearEntry();
      clearFirstEntry();
      return;
    }
    const now = Date.now();
    const previous = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (previous?.expires > now && previous.expires <= now + ttl) {
      document.cookie = `${key}=${previous.value}; Max-Age=${Math.ceil((previous.expires - now) / 1000)}; ${cookieOptions}`;
      return;
    }
    const handoff = mcpHandoff(location.href, sessionStorage, now);
    const campaign = metaCampaign(location.search);
    const referrer = document.referrer ? new URL(document.referrer) : null;
    const domain = referrer?.hostname;
    const internal = domain === location.hostname || domain === 'campuscli.com' || domain?.endsWith('.campuscli.com');
    const external = referrer && domain && !internal && domain !== 'accounts.google.com' && /^https?:$/.test(referrer.protocol);
    const entry = handoff.aiClient ? { entry_channel: 'mcp', entry_source: handoff.aiClient }
      : campaign.utm_campaign ? { entry_channel: 'campaign', entry_source: campaign.utm_source, entry_campaign: campaign.utm_campaign }
      : external ? { entry_channel: 'referral', entry_source: domain }
      : !referrer ? { entry_channel: 'direct' } : null;
    if (!entry) {
      if (startingAuth) clearEntry();
      return;
    }
    // Landing is a closed route family, never a path, slug or query string.
    const withLanding = { ...entry, entry_landing: analyticsPage(location.pathname) };
    saveFirstEntry(withLanding, now);
    const value = encodeURIComponent(JSON.stringify(withLanding));
    sessionStorage.setItem(key, JSON.stringify({ value, expires: now + ttl }));
    document.cookie = `${key}=${value}; Max-Age=${ttl / 1000}; ${cookieOptions}`;
  } catch {
    if (startingAuth) clearEntry();
  }
}

export function clearEntry(): void {
  try {
    document.cookie = `${key}=; Max-Age=0; ${cookieOptions}`;
    sessionStorage.removeItem(key);
  } catch { /* Optional. */ }
}

type Entry = Record<string, string | undefined>;
function saveFirstEntry(entry: Entry, now: number): void {
  try {
    if (readFirst(now)) return; // The first observed entry wins and is never overwritten.
    localStorage.setItem(firstKey, JSON.stringify({ entry, expires: now + firstTtl }));
  } catch { /* Optional. */ }
}
function readFirst(now: number): Entry | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(firstKey) ?? 'null');
    if (saved?.expires > now && saved.expires <= now + firstTtl && saved.entry && typeof saved.entry === 'object') return saved.entry;
  } catch { /* Optional. */ }
}
// First observed channel for conversion events. Values pass the analytics
// contract before leaving the browser; none is a URL, query or personal data.
export function firstEntry(): Entry {
  return readFirst(Date.now()) ?? {};
}
export function clearFirstEntry(): void {
  try { localStorage.removeItem(firstKey); } catch { /* Optional. */ }
}
