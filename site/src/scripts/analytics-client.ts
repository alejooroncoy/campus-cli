import PostHog from 'posthog-js-lite';
import { isLikelyBot } from '@posthog/browser-common/utils/blocked-uas';
import { PostHogPersistedProperty } from '@posthog/core';
import type { CaptureEvent } from '@posthog/core';

export interface AnalyticsClient {
  capture(event: string, properties: Record<string, unknown>): void;
  identify(id: string): void;
  reset(): void;
  get_distinct_id(): string;
  get_session_id(): string;
}

interface Options {
  host: string;
  before_send(event: CaptureEvent): CaptureEvent | null;
}

const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

// A separate store prevents older, still-open tabs from overwriting the new
// SDK's queue. Copy only identity/session/consent, never URL or person metadata.
function migrateBrowserState(key: string, storageKey: string): void {
  try {
    const current = localStorage.getItem(storageKey);
    if (current) {
      try {
        const parsed = JSON.parse(current);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return;
      } catch { /* Recover an invalid store before the SDK parses it. */ }
    }
    let legacy: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(localStorage.getItem(`ph_${key}_posthog`) ?? '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) legacy = parsed;
    } catch { /* A fresh session is safe when the old store is unreadable. */ }
    const state: Record<string, unknown> = {};
    if (identifier(legacy.distinct_id)) {
      state.distinct_id = legacy.distinct_id;
      state.person_mode = legacy.$user_state === 'identified' || legacy.distinct_id.startsWith('campus:') ? 'identified' : 'anonymous';
      state.anonymous_id = identifier(legacy.$device_id) ? legacy.$device_id : legacy.distinct_id;
    }
    const session = legacy.$sesid;
    if (Array.isArray(session) && uuid(session[1]) && timestamp(session[0]) && timestamp(session[2])) {
      state.session_id = session[1];
      state.session_timestamp = session[0];
      state.session_start_timestamp = session[2];
    }
    if (localStorage.getItem(`__ph_opt_in_out_${key}`) === '0') state.opted_out = true;
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch { /* The official SDK falls back to memory when storage is denied. */ }
}

class NavigationSafePostHog extends PostHog {
  fetch(url: string, options: Parameters<PostHog['fetch']>[1]) {
    // Flush promptly and let in-flight conversions finish during navigation.
    const request = { ...options, keepalive: true, credentials: 'omit' as const };
    return super.fetch(url, request);
  }
}

export function createAnalyticsClient(key: string, options: Options): AnalyticsClient {
  const persistenceName = `campus_analytics_v2_${key}`;
  migrateBrowserState(key, `ph_${persistenceName}`);
  const windowKey = `${persistenceName}_window`;
  const bot = isLikelyBot(typeof navigator === 'undefined' ? undefined : navigator, []);
  let windowSession = '', windowId = '';
  let sdk: PostHog;
  const getWindowId = () => {
    const session = sdk.getSessionId();
    if (session !== windowSession) {
      let saved;
      try { saved = JSON.parse(sessionStorage.getItem(windowKey) ?? 'null'); } catch { /* Optional. */ }
      windowSession = session;
      windowId = saved?.session === session && uuid(saved?.id) ? saved.id : '';
      if (!windowId) {
        // Retain the browser SDK's current tab id during the one-time migration.
        try {
          const legacyId = JSON.parse(sessionStorage.getItem(`ph_${key}_window_id`) ?? 'null');
          const legacy = JSON.parse(localStorage.getItem(`ph_${key}_posthog`) ?? '{}');
          if (legacy.$sesid?.[1] === session && uuid(legacyId)) windowId = legacyId;
        } catch { /* Optional. */ }
      }
      windowId ||= crypto.randomUUID();
      try { sessionStorage.setItem(windowKey, JSON.stringify({ session, id: windowId })); } catch { /* Optional. */ }
    }
    return windowId;
  };
  sdk = new NavigationSafePostHog(key, {
    host: options.host, persistence: 'localStorage', persistence_name: persistenceName,
    preloadFeatureFlags: false, disableRemoteFeatureFlags: true, disableSurveys: true,
    captureHistoryEvents: false, disableGeoip: true, personProfiles: 'identified_only',
    flushAt: 1, flushInterval: 1000, maxBatchSize: 20, maxQueueSize: 100,
    // The browser SDK also preserves identity for bots while dropping events.
    before_send: event => bot ? null : options.before_send({ ...event, properties: {
      ...event.properties, distinct_id: sdk.getDistinctId(), $window_id: getWindowId(),
    } }),
  });
  const reset = () => {
    sdk.reset([PostHogPersistedProperty.OptedOut]); windowSession = ''; windowId = '';
    try { sessionStorage.removeItem(windowKey); } catch { /* Optional. */ }
  };
  return {
    capture: (event, properties) => sdk.capture(event, properties as Parameters<PostHog['capture']>[1]),
    identify: id => {
      // A switch between known accounts must never merge their person profiles.
      if (sdk.getDistinctId() !== id && sdk.getPersistedProperty(PostHogPersistedProperty.PersonMode) === 'identified') reset();
      sdk.identify(id);
    },
    reset,
    get_distinct_id: () => sdk.getDistinctId(),
    get_session_id: () => sdk.getSessionId(),
  };
}
