import { mcpHandoff } from './mcp-handoff.ts';
import { metaCampaign } from './web-analytics.ts';

const key = 'campus_entry';
const ttl = 24 * 60 * 60_000;
const cookieOptions = 'Path=/api/app/auth/; SameSite=Lax; Secure';

export function rememberEntry(projectKey: string, startingAuth = false): void {
  try {
    // Match the opt-out that the analytics client preserves across SDK migration.
    const consent = JSON.parse(localStorage.getItem(`ph_campus_analytics_v2_${projectKey}`) ?? 'null');
    if (consent?.opted_out === true || localStorage.getItem(`__ph_opt_in_out_${projectKey}`) === '0') {
      clearEntry();
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
      : campaign.utm_campaign ? { entry_channel: 'campaign', entry_campaign: campaign.utm_campaign }
      : external ? { entry_channel: 'referral', entry_source: domain }
      : !referrer ? { entry_channel: 'direct' } : null;
    if (!entry) {
      if (startingAuth) clearEntry();
      return;
    }
    const value = encodeURIComponent(JSON.stringify(entry));
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
