import { analyticsPage } from './analytics-contract.ts';

export const webEvents = new Set(['$pageview', '$pageleave']);
// Only numeric, shared campaign IDs, never names, recipient IDs or raw URLs.
export function marketingCampaign(search: string): Record<string, string> {
  const query = new URLSearchParams(search);
  const sources = query.getAll('utm_source');
  const campaigns = query.getAll('utm_campaign');
  const source = sources.length===1 ? ({facebook:'meta',instagram:'meta',fb:'meta',ig:'meta',meta:'meta',email:'email'} as Record<string,string>)[sources[0].toLowerCase()] : undefined;
  if (!source || campaigns.length !== 1
    || !/^[0-9]{6,32}$/.test(campaigns[0])) return {};
  return { utm_source: source, utm_campaign: campaigns[0] };
}
export const metaCampaign = marketingCampaign;
// Fixed public labels only: never accept arbitrary campaign content or user data.
const engageContents = new Set([
  'remontada_upecinos', 'mejoralo_upecinos',
  'remontada_virtualidad', 'mejoralo_virtualidad',
  'remontada_working_student', 'mejoralo_working_student',
]);
export function engageCampaign(search: string): Record<string, string> {
  const query = new URLSearchParams(search);
  const source = query.getAll('utm_source');
  const medium = query.getAll('utm_medium');
  const campaign = query.getAll('utm_campaign');
  const content = query.getAll('utm_content');
  if (source.length !== 1 || source[0] !== 'viva_engage'
    || medium.length !== 1 || medium[0] !== 'social'
    || campaign.length !== 1 || campaign[0] !== 'grupo_de_la_u'
    || content.length !== 1 || !engageContents.has(content[0])) return {};
  return { utm_source: source[0], utm_medium: medium[0], utm_campaign: campaign[0], utm_content: content[0] };
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
  if (['meta', 'email'].includes(input.utm_source as string) && typeof input.utm_campaign === 'string'
    && /^[0-9]{6,32}$/.test(input.utm_campaign)) {
    safe.utm_source = input.utm_source; safe.utm_campaign = input.utm_campaign;
  } else if (input.utm_source === 'viva_engage' && input.utm_medium === 'social'
    && input.utm_campaign === 'grupo_de_la_u' && typeof input.utm_content === 'string'
    && engageContents.has(input.utm_content)) {
    safe.utm_source = input.utm_source; safe.utm_medium = input.utm_medium;
    safe.utm_campaign = input.utm_campaign; safe.utm_content = input.utm_content;
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
    $referrer: referrer || '$direct', $device_type: width < 761 ? 'Mobile' : width < 1200 ? 'Tablet' : 'Desktop',
    ...marketingCampaign(search), ...engageCampaign(search) });
}
