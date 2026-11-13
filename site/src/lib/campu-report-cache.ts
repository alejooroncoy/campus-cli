/**
 * Último reporte de Campu visto en este navegador, para abrirlo al instante y
 * actualizarlo en silencio. Es solo para mostrar: nunca da acceso a nada.
 * Se borra al cerrar sesión, al entrar con otra cuenta y al borrar los datos de
 * Campu, y vence a los 7 días.
 */
export const REPORT_CACHE_KEY = "campu_report_v1";
const MAX_AGE = 7 * 86400_000;
const MAX_PAGES = 5;

export type CachedReport = {
  status: any;
  notices: any[];
  next: string | null;
  events: any[];
  context: any;
  opened: boolean;
};
type Stored = { owner: string; pages: Record<string, CachedReport & { at: number }> };

function load(): Stored | null {
  try {
    const raw = JSON.parse(localStorage.getItem(REPORT_CACHE_KEY) ?? "null");
    return raw && typeof raw.owner === "string" && raw.pages ? raw : null;
  } catch {
    return null;
  }
}

/** Dueño del reporte guardado, para mostrarlo antes de que responda la sesión. */
export function cachedReportOwner(): string | null {
  return load()?.owner ?? null;
}

export function readReport(page: string): CachedReport | null {
  const stored = load();
  const hit = stored?.pages[page];
  return hit && Date.now() - hit.at < MAX_AGE ? hit : null;
}

export function writeReport(owner: string, page: string, report: CachedReport) {
  try {
    const stored = load();
    const pages = stored?.owner === owner ? stored.pages : {};
    pages[page] = { ...report, at: Date.now() };
    for (const key of Object.keys(pages)
      .sort((a, b) => pages[b].at - pages[a].at)
      .slice(MAX_PAGES))
      delete pages[key];
    localStorage.setItem(REPORT_CACHE_KEY, JSON.stringify({ owner, pages }));
  } catch {
    // Sin almacenamiento (modo privado, cuota llena): simplemente no se guarda.
  }
}

/** Sin dueño, se borra siempre; con dueño, solo si el guardado es de otra cuenta. */
export function forgetReport(unlessOwner?: string | null) {
  try {
    if (unlessOwner && load()?.owner === unlessOwner) return;
    localStorage.removeItem(REPORT_CACHE_KEY);
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}
