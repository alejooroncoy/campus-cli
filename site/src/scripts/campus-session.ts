export type CampusSession = {
  authenticated: boolean;
  email?: string;
  plan?: string;
  aiReady: boolean;
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
  remaining?: number;
  period?: string;
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

  const pending = request.then(value => {
    // A response from before logout/refresh must not repopulate the session.
    if (pendingSession === pending) cachedSession = value;
    return value;
  }).catch(error => {
    if (pendingSession === pending) {
      pendingSession = undefined;
      if (typeof window !== "undefined") delete window.__campusSessionBootstrap;
    }
    throw error;
  });
  pendingSession = pending;
  return pending;
}

export function clearCampusSession(): void {
  cachedSession = undefined;
  pendingSession = undefined;
  if (typeof window !== "undefined") delete window.__campusSessionBootstrap;
  try {
    sessionStorage.removeItem("campus_ui_profile");
  } catch { /* Storage is optional. */ }
}
