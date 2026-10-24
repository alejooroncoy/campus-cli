import { beginAccountHandoff, completeAccountHandoff } from './account-onboarding.ts';
import { mcpHandoff, clearMcpHandoff } from './mcp-handoff.ts';
import { analyticsPage, events, safeAnalyticsProperties } from './analytics-contract.ts';
import type { CampusSession } from './campus-session';
import type { PostHog } from 'posthog-js/dist/module.slim';

type Event = { event: string; properties: Record<string, unknown> };
const browser = typeof window !== 'undefined' && typeof location !== 'undefined'
  && typeof location.pathname === 'string' && typeof location.hostname === 'string';
const local = import.meta.env?.DEV || (browser && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname));
const key = import.meta.env?.PUBLIC_POSTHOG_KEY;
const host = import.meta.env?.PUBLIC_POSTHOG_HOST;
let client: PostHog | undefined;
const pendingKey = 'campus-analytics-pending-v1';
let queue: Event[] = [];
if (browser && !local && key && host) {
  try {
    const pending = JSON.parse(sessionStorage.getItem(pendingKey) ?? '[]');
    if (Array.isArray(pending)) queue = pending.slice(-100).filter(item => events.has(item?.event))
      .map(item => ({ event: item.event, properties: safeAnalyticsProperties(item.properties ?? {}) }));
  } catch { /* Storage may be disabled. */ }
}
function persistQueue(): void {
  try { sessionStorage.setItem(pendingKey, JSON.stringify(queue)); } catch { /* Optional. */ }
}
let identity: string | undefined;
let sessionResolved = false;
let readyContext = '';
let lastSessionState = '';
let currentPlan = 'unavailable';
let isTest: boolean | undefined;
let audience='unknown';
let mounted = false;
let observer: IntersectionObserver | undefined;
const sectionTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
const visibleHeadings = new Set<HTMLElement>();
function clearSectionTimers(): void {
  sectionTimers.forEach(timer => clearTimeout(timer)); sectionTimers.clear();
}
function scheduleSectionView(element: HTMLElement): void {
  const section = element.dataset.analyticsSection;
  if (!section || document.visibilityState === 'hidden' || seen.has(`section:${section}`) || sectionTimers.has(element)) return;
  sectionTimers.set(element, setTimeout(() => {
    sectionTimers.delete(element);
    if (!visibleHeadings.has(element) || document.visibilityState === 'hidden' || seen.has(`section:${section}`)) return;
    seen.add(`section:${section}`);
    if(section==='plus_offer')track('campus_plus_offer_viewed',{location:'plus'});else track('campus_section_viewed', { section });
  }, 800));
}
let seen = new Set<string>();
let viewPath = '';
const identifier = (key: string) => {
  if (!browser) return '';
  try { const saved = sessionStorage.getItem(key); if (saved) return saved;
    const id = crypto.randomUUID(); sessionStorage.setItem(key, id); return id;
  } catch { return crypto.randomUUID(); }
};
const localId = local ? identifier('campus-analytics-preview-id') : '';
const localSession = local ? identifier('campus-analytics-preview-session') : '';

// In development the same contracts run into a bounded local buffer. No SDK,
// ingestion, flags, replay or remote configuration requests are made.
if (browser && !local && key && host) {
  // Only capture/identity are used; replay, surveys and autocapture stay disabled.
  void import('posthog-js/dist/module.slim').then(({ default: posthog }) => {
    client = posthog.init(key, {
      api_host: host, defaults: '2026-05-30',
      autocapture: false, capture_pageview: false, capture_pageleave: false,
      disable_session_recording: true, enable_recording_console_log: false,
      capture_exceptions: false, capture_performance: false,
      rageclick: false, capture_dead_clicks: false, advanced_disable_flags: true,
      disable_surveys: true, disable_external_dependency_loading: true,
      ip: false, persistence: 'localStorage', person_profiles: 'identified_only',
      before_send: event => {
        if (!event || (!events.has(event.event) && event.event !== '$identify')) return null;
        const original = event.properties ?? {};
        // Discard SDK's implicit referrer, title, search, URL, device and person
        // properties; retain only correlation fields and our closed contract.
        event.properties = { ...safeAnalyticsProperties(original),
          // The browser SDK authenticates ingestion with this public project
          // token. Keep our configured token, never a caller-supplied value.
          token: key,
          distinct_id: original.distinct_id,
          $session_id: original.$session_id,
          $window_id: original.$window_id,
          ...(event.event === '$identify' ? { $anon_distinct_id: original.$anon_distinct_id } : {}),
          $process_person_profile: event.event === '$identify' || Boolean(identity),
          $geoip_disable: true,
          ...(identity && audience!=='unknown' ? {$set:{analytics_audience:audience,is_test:isTest===true,is_internal:audience==='internal'}} : {}),
        };
        // The real SDK also puts initial URLs/referrers in these top-level
        // person updates. They are outside properties and must be removed too.
        delete event.$set;
        delete event.$set_once;
        return event;
      },
    });
    if (identity) client?.identify(identity);
    else if (sessionResolved && client?.get_distinct_id().startsWith("campus:")) client.reset();
    for (const item of queue) client?.capture(item.event, item.properties);
    queue = []; persistQueue();
  }).catch(() => { queue = []; });
} else if (browser && !local && (!key || !host)) {
  console.warn('[Campus analytics] Configura PUBLIC_POSTHOG_KEY y PUBLIC_POSTHOG_HOST para activar métricas.');
}

export function selectedPlan(): 'free' | 'plus' | 'trial' | undefined {
  try { const selected = sessionStorage.getItem('campus-selected-plan');
    return selected === 'trial' || selected === 'free' || selected === 'plus' ? selected : undefined;
  } catch { return undefined; }
}
export function track(event: string, properties: Record<string, unknown> = {}): void {
  if (!browser || !events.has(event)) return;
  const item = { event, properties: safeAnalyticsProperties({
    ...(() => { try { return mcpHandoff(location.href, sessionStorage); } catch { return {}; } })(),
    page: analyticsPage(location.pathname), current_plan: currentPlan,
    ...(isTest!==undefined?{is_test:isTest}:{}),
    selected_plan: selectedPlan(),
    viewport: innerWidth < 761 ? 'mobile' : innerWidth < 1200 ? 'tablet' : 'desktop',
    environment: local ? 'development' : 'production', ...properties,
    analytics_audience:audience,is_internal:audience==='internal',
    ...(isTest!==undefined||properties.is_test===true?{is_test:isTest===true||properties.is_test===true}:{}),
  }) };
  if (local) {
    try { const recent = JSON.parse(sessionStorage.getItem('campus-analytics-debug') ?? '[]');
      sessionStorage.setItem('campus-analytics-debug', JSON.stringify([...recent.slice(-99), item]));
    } catch { /* Analytics storage never blocks the app. */ }
    console.debug('[Campus analytics · local]', JSON.stringify(item));
  } else if (client) client.capture(item.event, item.properties);
  else if (key && host) { queue = [...queue.slice(-99), item]; persistQueue(); }
}
export function analyticsHeaders(): Record<string, string> {
  const distinctId = local ? identity ?? localId : client?.get_distinct_id();
  const sessionId = local ? localSession : client?.get_session_id();
  return { ...(distinctId ? { 'X-POSTHOG-DISTINCT-ID': distinctId } : {}),
    ...(sessionId ? { 'X-POSTHOG-SESSION-ID': sessionId } : {}) };
}
export function analyticsSession(session: CampusSession): void {
  if (!browser || session.accessUnavailable) return;
  sessionResolved = true;
  currentPlan = session.authenticated ? (session.plan === 'plus' ? 'plus' : 'free') : 'guest';
  audience=session.analyticsAudience??(session.authenticated?'unknown':'customer');
  isTest=session.authenticated&&session.plusTest===true?true:audience==='unknown'?undefined:audience==='test';
  // The server normalizes non-numeric/long Google subjects to an opaque
  // google_<sha256> ID. Raw provider subjects are not a browser contract.
  if (session.authenticated && /^campus:(?:google:[0-9]{8,32}|[a-zA-Z0-9_-]{8,100})$/.test(session.analyticsId ?? '')) {
    identity = session.analyticsId;
    if (!local && client && client.get_distinct_id() !== identity) client.identify(identity!);
  } else if (!session.authenticated && (identity || client?.get_distinct_id().startsWith('campus:'))) resetAnalytics();
  if (session.authenticated && identity && identity === session.analyticsId && completeAccountHandoff()) {
    track('campus_account_access_completed', { authenticated: true, university_confirmed: session.universityConfirmed === true,
      remaining: session.usage?.remaining, limit: session.usage?.limit });
  }
  const state = `${currentPlan}:${session.usage?.remaining}:${session.usage?.limit}`;
  const context = `${analyticsPage(location.pathname)}:${session.authenticated ? identity ?? 'account' : 'guest'}`;
  const firstReady = readyContext !== context;
  if (!firstReady && lastSessionState === state) return;
  readyContext = context; lastSessionState = state;
  track(firstReady ? 'campus_session_ready' : 'campus_usage_updated', { authenticated: session.authenticated, remaining: session.usage?.remaining, limit: session.usage?.limit });
}
export function resetAnalytics(): void {
  if (browser) { try { clearMcpHandoff(sessionStorage); } catch { /* Optional. */ } }
  identity = undefined; currentPlan = 'guest'; isTest = false;audience='customer';
  readyContext = ''; lastSessionState = '';
  queue = [];
  if (browser && !local) persistQueue();
  if (!local) client?.reset();
  seen = new Set();
}
function locationFor(element: Element): string {
  if (element.closest('.site-header')) return 'header';
  if (element.closest('.footer')) return 'footer';
  if (element.closest('.cp-plan--plus')) return 'plus';
  if (element.closest('.cp-plan--free')) return 'free';
  if (element.closest('.cp-plan-trial')) return 'trial';
  if (element.closest('.cp-hero')) return 'hero';
  if (element.closest('#investigacion')) return 'research';
  if (element.closest('.cp-final')) return 'closing';
  return location.pathname.startsWith('/app/') ? 'app' : 'other';
}
function trackPage(): void {
  // Astro emits page-load initially too. Route identity excludes conversation
  // IDs, hashes and queries, and avoids a duplicate for the same loaded page.
  const page = analyticsPage(location.pathname);
  if (viewPath === location.pathname) return;
  viewPath = location.pathname; seen = new Set();
  track('campus_page_viewed', { page }); observer?.disconnect(); clearSectionTimers(); visibleHeadings.clear();
  if (typeof IntersectionObserver === 'undefined') return;
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const element = entry.target as HTMLElement;
      if (entry.isIntersecting) { visibleHeadings.add(element); scheduleSectionView(element); }
      else { visibleHeadings.delete(element); clearTimeout(sectionTimers.get(element)); sectionTimers.delete(element); }
    }
  }, { threshold: 0.5 });
  const sections: Record<string, string> = { '#planes': 'plans', '#incluye': 'features', '#investigacion': 'research', '#como-empezar': 'onboarding', '.cp-faq': 'faq', '.cp-final': 'closing' };
  const plusOffer=document.querySelector<HTMLElement>('.cp-plan--plus');
  if(plusOffer){plusOffer.dataset.analyticsSection='plus_offer';observer.observe(plusOffer);}
  for (const [selector, section] of Object.entries(sections)) {
    const container = document.querySelector(selector);
    const heading = container?.querySelector<HTMLElement>('h2');
    if (heading) { heading.dataset.analyticsSection = section; observer.observe(heading); }
  }
}
export function setupAnalytics(): void {
  if (mounted) return; mounted = true;
  trackPage(); document.addEventListener('astro:page-load', trackPage);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') clearSectionTimers();
    else visibleHeadings.forEach(scheduleSectionView);
  });
  window.addEventListener('pagehide', () => { clearSectionTimers(); visibleHeadings.clear(); });
  document.addEventListener('click', event => {
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!anchor) return;
    const url = new URL(anchor.href, location.origin);
    const loc = locationFor(anchor);
    const support = url.origin === 'https://wa.me' && url.pathname === '/51946189585';
    const provider = ({ 'chatgpt.com': 'chatgpt', 'claude.ai': 'claude', 'gemini.google.com': 'gemini' } as Record<string, string>)[url.hostname];
    if (!support && !provider && url.origin !== location.origin) return;
    const plan = ['free', 'plus', 'trial'].includes(loc) ? loc : undefined;
    const target = support ? 'whatsapp' : provider ? 'connect' : url.pathname === '/api/app/auth/start' ? 'auth'
      : url.hash === '#planes' ? 'plans' : url.hash === '#incluye' ? 'features' : analyticsPage(url.pathname);
    const managingPlus = anchor.hasAttribute('data-profile-manage') || currentPlan === 'plus';
    const intent = support ? 'support' : target === 'plus' ? managingPlus ? 'navigate' : 'plus' : plan ?? (target === 'auth' ? 'signup' : target === 'connect' ? 'connect' : ['turnitin_app', 'turnitin'].includes(target) ? 'turnitin' : target === 'app' && loc !== 'app' ? 'trial' : 'navigate');
    if (['trial', 'free', 'plus'].includes(intent)) {
      try { sessionStorage.setItem('campus-selected-plan', intent); } catch { /* Optional. */ }
    }
    if (target === 'auth' && currentPlan === 'guest') beginAccountHandoff(url.searchParams.get('return') ?? location.pathname);
    track('campus_cta_clicked', { location: loc, target, intent, provider });
  });
  document.addEventListener('toggle', event => {
    if (!(event.target instanceof HTMLDetailsElement) || !event.target.open) return;
    const details = event.target;
    const group = details.closest('#investigacion') ? 'research' : details.closest('#faq, .cp-faq') ? 'faq' : null;
    if (group) track('campus_details_opened', { section: group,
      position: Array.from(details.parentElement?.querySelectorAll('details') ?? []).indexOf(details) + 1 });
  }, true);
}
