import { ACCOUNT_HANDOFF_KEY } from './account-onboarding';
import { analyticsSession, resetAnalytics } from "./analytics";
import { notifySessionLogout, publishSessionIdentity } from "./session-sync";
import { CONVERSATION_DRAFTS_KEY, GUEST_DRAFT_HANDOFF_KEY } from "./conversation-drafts";
import { carryGuestUniversity } from './guest-university';
export type CampusSession = {
  analyticsId?: string;
  authenticated: boolean;
  email?: string;
  plan?: string;
  plusTest?: boolean;
  aiReady: boolean;
  accessBlocked?: boolean;
  accessUnavailable?: boolean;
  university?: { id: number; name: string; shortName: string | null } | null;
  universityConfirmed?: boolean;
  profesAvailable?: boolean;
  features?: { schedulePlanning: boolean };
  usage?: { remaining: number; limit: number; period: string };
  banner?: {
    connected: boolean;
    fullName?: string | null;
    career?: string | null;
    entryYear?: number | null;
    catalogTerm?: string | null;
    enrolledCount?: number;
    projectedCount?: number;
  };
};

export type CampusProfilePreview = {
  authenticated: boolean;
  savedAt?: number;
  cleanName?: string;
  shortName?: string;
  initials?: string;
  subTitle?: string;
  bannerConnected?: boolean;
  plan?: string;
  plusTest?: boolean;
  remaining?: number;
  period?: string;
  accessUnavailable?: boolean;
};

declare global {
  interface Window {
    __campusSessionBootstrap?: { promise: Promise<CampusSession> };
  }
}

// Display data only: never use this snapshot to grant access or enable actions.
export function getCampusProfilePreview(): CampusProfilePreview | null {
  try {
    const raw = sessionStorage.getItem("campus_ui_profile");
    const profile = raw ? JSON.parse(raw) as CampusProfilePreview : null;
    return profile?.authenticated && typeof profile.savedAt === "number"
      && Date.now() - profile.savedAt < 15 * 60 * 1000 ? profile : null;
  } catch { return null; }
}

let cachedSession: CampusSession | undefined;
let pendingSession: Promise<CampusSession> | undefined;

export function getCampusSession(forceRefresh = false): Promise<CampusSession> {
  if (forceRefresh) {
    cachedSession = undefined;
    pendingSession = undefined;
    if (typeof window !== "undefined") delete window.__campusSessionBootstrap;
  }
  if (cachedSession) return Promise.resolve(cachedSession);
  if (pendingSession) return pendingSession;

  const early = typeof window !== "undefined" ? window.__campusSessionBootstrap : undefined;
  const request = early?.promise ?? fetch("/api/app/session", {
    credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8000),
  }).then(async response => {
    if (!response.ok) throw new Error("No se pudo comprobar la sesión.");
    return response.json() as Promise<CampusSession>;
  });
  if (typeof window !== "undefined" && !early) window.__campusSessionBootstrap = { promise: request };

  const pending = request.then(async value => {
    // A response from before logout/refresh must not repopulate the session.
    if (pendingSession !== pending) return getCampusSession();
    value = await carryGuestUniversity(value, () => pendingSession === pending);
    if (pendingSession !== pending) return getCampusSession();
    if (pendingSession === pending) {
      await publishSessionIdentity(value, () => pendingSession === pending);
      if (pendingSession !== pending) return getCampusSession();
      if (value.accessUnavailable) {
        pendingSession = undefined;
        if (typeof window !== "undefined") delete window.__campusSessionBootstrap;
      } else {
        cachedSession = value;
        try { analyticsSession(value); } catch { /* Metrics must never invalidate a verified session. */ }
      }
    }
    return value;
  }).catch(error => {
    if (pendingSession !== pending) return getCampusSession();
    if (pendingSession === pending) {
      pendingSession = undefined;
      if (typeof window !== "undefined") delete window.__campusSessionBootstrap;
    }
    throw error;
  });
  pendingSession = pending;
  return pending;
}

export function clearCampusSession(notify = true): void {
  cachedSession = undefined;
  pendingSession = undefined;
  if (typeof window !== "undefined") delete window.__campusSessionBootstrap;
  try {
    sessionStorage.removeItem("campus_ui_profile");
    sessionStorage.removeItem(CONVERSATION_DRAFTS_KEY);
    sessionStorage.removeItem(GUEST_DRAFT_HANDOFF_KEY);
    sessionStorage.removeItem(ACCOUNT_HANDOFF_KEY);
    sessionStorage.removeItem("campus-question");
  } catch { /* Storage is optional. */ }
  if (typeof window !== "undefined") {
    try { resetAnalytics(); } catch { /* Logout also works when analytics is unavailable. */ }
  }
  if (notify && typeof window !== "undefined") notifySessionLogout();
}

export function canConnectMiupc(session: CampusSession): boolean {
  return session.authenticated && session.universityConfirmed === true
    && session.profesAvailable !== false && session.university?.shortName === "UPC";
}
