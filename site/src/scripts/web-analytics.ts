import { analyticsPage } from './analytics-contract.ts';

export const webEvents = new Set(['$pageview', '$pageleave']);
// Only Meta campaign IDs are accepted: campaign names and other query values
// can contain personal or academic information. Never persist the raw URL.
export function metaCampaign(search: string): Record<string, string> {
  const query = new URLSearchParams(search);
  const sources = query.getAll('utm_source');
  const campaigns = query.getAll('utm_campaign');
  if (sources.length !== 1 || campaigns.length !== 1 || sources[0].toLowerCase() !== 'meta'
    || !/^[0-9]{6,32}$/.test(campaigns[0])) return {};
  return { utm_source: 'meta', utm_campaign: campaigns[0] };
}
// These are route families, never user-provided paths, slugs or conversation IDs.
const paths: Record<string, string> = {
  home: '/', app: '/app/', assistant: '/app/asistente/', connect: '/app/copilot/',
  profile: '/app/perfil/', plus: '/app/plus/', turnitin_app: '/app/turnitin/',
  turnitin: '/turnitin/', professors: '/profes/', professor_directory: '/profes/upc/',
  professor_profile: '/profes/upc/:professor/', professor_review_form: '/profes/upc/:professor/escribir/',
  professor_reviews: '/profes/resenas/', library: '/biblioteca/', library_item: '/biblioteca/:item/',
  library_app: '/app/biblioteca/', campus_reviews: '/opiniones-campus/', cli: '/campus-cli/',
  blackboard_upc: '/blackboard-upc/', chatgpt: '/blackboard-chatgpt/', terminal: '/blackboard-cli/',
  mcp: '/blackboard-mcp/', blog: '/blog/', privacy: '/privacidad/', about: '/about/',
  contact: '/contacto/', terms: '/terminos/', independence: '/no-afiliacion/', other: '/:other/',
};
const validPath = (value: unknown) => typeof value === 'string' && Object.values(paths).includes(value);
const origin = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return;
  try { const url = new URL(value); if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin; } catch { /* Optional. */ }
};

/** Reapply at the SDK boundary and when restoring a queued event. */
export function safeWebProperties(input: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  if (input.utm_source === 'meta' && typeof input.utm_campaign === 'string'
    && /^[0-9]{6,32}$/.test(input.utm_campaign)) {
    safe.utm_source = 'meta'; safe.utm_campaign = input.utm_campaign;
  }
  const base = origin(input.$current_url);
  if (base && validPath(input.$pathname)) {
    safe.$current_url = base + input.$pathname;
    safe.$pathname = input.$pathname;
    safe.$host = new URL(base).host;
  }
  const referrer = origin(input.$referrer);
  if (referrer) { safe.$referrer = referrer + '/'; safe.$referring_domain = new URL(referrer).hostname; }
  else if (input.$referrer === '$direct') { safe.$referrer = '$direct'; safe.$referring_domain = '$direct'; }
  if (['Desktop', 'Mobile', 'Tablet'].includes(input.$device_type as string)) safe.$device_type = input.$device_type;
  if (typeof input.$pageview_id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.$pageview_id)) safe.$pageview_id = input.$pageview_id;
  if (validPath(input.$prev_pageview_pathname)) safe.$prev_pageview_pathname = input.$prev_pageview_pathname;
  if (typeof input.$prev_pageview_duration === 'number' && Number.isFinite(input.$prev_pageview_duration)
    && input.$prev_pageview_duration >= 0) safe.$prev_pageview_duration = Math.min(input.$prev_pageview_duration, 86400);
  return safe;
}

export function webPageProperties(pathname: string, siteOrigin: string, referrer: string, width: number, search = '') {
  const path = paths[analyticsPage(pathname)] ?? paths.other;
  return safeWebProperties({ $current_url: siteOrigin, $pathname: path,
    $referrer: referrer || '$direct', $device_type: width < 761 ? 'Mobile' : width < 1200 ? 'Tablet' : 'Desktop', ...metaCampaign(search) });
}
