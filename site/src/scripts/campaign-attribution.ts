import { marketingCampaign } from './web-analytics.ts';

const key = 'campus_campaign_v1';
const ttl = 30 * 86400_000;
const cookie = 'campus_campaign';
let pending: Promise<void> | undefined;

function readTouch(value: string | null) {
  try {
    const touch = JSON.parse(value ?? 'null');
    if (!touch || !['meta','email'].includes(touch.source) || typeof touch.id !== 'string'
      || !/^[0-9]{6,32}$/.test(touch.id) || !Number.isSafeInteger(touch.observedAt)
      || touch.observedAt > Date.now() || touch.observedAt <= Date.now() - ttl) return;
    return { source: touch.source as string, id: touch.id as string, observedAt: touch.observedAt as number };
  } catch { return; }
}
function optedOut(projectKey: string): boolean {
  try {
    return JSON.parse(localStorage.getItem(`ph_campus_analytics_v2_${projectKey}`) ?? 'null')?.opted_out === true
      || localStorage.getItem(`__ph_opt_in_out_${projectKey}`) === '0';
  } catch { return true; }
}
function cookieOptions() {
  return `Path=/api/app/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}
export function clearCampaign(): void {
  try {
    sessionStorage.removeItem(key);
    document.cookie = `${cookie}=; Max-Age=0; ${cookieOptions()}`;
  } catch { /* Optional attribution must never block the app. */ }
}
export function rememberCampaign(projectKey: string): void {
  try {
    if (optedOut(projectKey)) { clearCampaign(); return; }
    const campaign = marketingCampaign(location.search);
    if (!campaign.utm_campaign) return; // Direct/internal visits never replace a campaign.
    const previous = readTouch(sessionStorage.getItem(key));
    const touch = previous?.source === campaign.utm_source && previous?.id === campaign.utm_campaign
      ? previous : { source: campaign.utm_source, id: campaign.utm_campaign, observedAt: Date.now() };
    const value = JSON.stringify(touch);
    sessionStorage.setItem(key, value);
    document.cookie = `${cookie}=${encodeURIComponent(value)}; Max-Age=${Math.floor((touch.observedAt + ttl - Date.now()) / 1000)}; ${cookieOptions()}`;
  } catch { /* Storage/cookies are optional. */ }
}
// Called at landing and again when an authenticated session becomes available.
// Checkout also reads the cookie, so a slow/failed sync cannot race the order.
export function syncCampaign(projectKey: string): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    try {
      if (optedOut(projectKey)) { clearCampaign(); return; }
      const value = sessionStorage.getItem(key);
      if (!value) return;
      const touch = readTouch(value);
      if (!touch) { clearCampaign(); return; }
      const response = await fetch('/api/app/campaign', { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(touch), signal: AbortSignal.timeout(8000) });
      // A 204 guest response retains the touch for OAuth. Do not clear a newer click.
      if (response.status === 200 && sessionStorage.getItem(key) === value) clearCampaign();
    } catch { /* Retain the cookie for OAuth/checkout and retry on session resolution. */ }
  })().finally(() => { pending = undefined; });
  return pending;
}
