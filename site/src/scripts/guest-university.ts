import { analyticsHeaders, track } from './analytics';
import type { CampusSession } from './campus-session';

export type UniversityChoice = { id: number; name: string; shortName: string | null };
export const GUEST_UNIVERSITY_KEY = 'campus-university-choice-v1';
let memoryChoice: UniversityChoice | null = null;
let choicesRequest: Promise<UniversityChoice[]> | undefined;

function validChoice(value: unknown): value is UniversityChoice {
  if (!value || typeof value !== 'object') return false;
  const item = value as UniversityChoice;
  return Number.isSafeInteger(item.id) && item.id > 0 && typeof item.name === 'string'
    && item.name.length > 0 && item.name.length <= 300
    && (item.shortName === null || (typeof item.shortName === 'string' && item.shortName.length <= 100));
}
export function readGuestUniversity(): UniversityChoice | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(GUEST_UNIVERSITY_KEY) ?? 'null');
    if (saved?.version === 1 && validChoice(saved.university)) return saved.university;
  } catch { /* Keep the current visit usable when storage is unavailable. */ }
  return memoryChoice;
}
export function rememberGuestUniversity(university: UniversityChoice): void {
  if (!validChoice(university)) return;
  memoryChoice = university;
  try { window.localStorage.setItem(GUEST_UNIVERSITY_KEY, JSON.stringify({ version: 1, university })); }
  catch { /* The selection still lasts for the current visit. */ }
}
export function universityLabel(item: UniversityChoice): string {
  const shortName = item.shortName || chatUniversityCode(item);
  return shortName ? `${shortName} — ${item.name}` : item.name;
}
const chatUniversities = [
  ['UPC', 'Universidad Peruana de Ciencias Aplicadas'],
  ['UPN', 'Universidad Privada del Norte'],
  ['UP', 'Universidad del Pacífico'],
] as const;
const universityNameKey = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
export function chatUniversityCode(item: UniversityChoice | null): string | undefined {
  return item ? chatUniversities.find(([, name]) => universityNameKey(name) === universityNameKey(item.name))?.[0] : undefined;
}
export function guestUniversitySupported(item: UniversityChoice | null): boolean {
  return chatUniversityCode(item) !== undefined;
}
export function loadUniversityChoices(): Promise<UniversityChoice[]> {
  return choicesRequest ??= fetch('/api/app/universities', {
    credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000),
  }).then(async response => {
    if (!response.ok) throw new Error('No pudimos cargar las universidades. Inténtalo otra vez.');
    const data = await response.json() as { universities?: unknown[] };
    const choices = data.universities?.filter(validChoice);
    if (!choices?.length) throw new Error('No pudimos cargar las universidades. Inténtalo otra vez.');
    return choices;
  }).catch(error => { choicesRequest = undefined; throw error; });
}

// Only the authenticated API can confirm a university or grant coverage.
// Never replace the university of an already configured account.
export async function carryGuestUniversity(session: CampusSession, current: () => boolean): Promise<CampusSession> {
  const selected = readGuestUniversity();
  if (!session.authenticated || session.universityConfirmed !== false || session.accessUnavailable || !selected || !current()) return session;
  // After a failed automatic save, the explicit recovery form owns the next write.
  if (window.location?.pathname === '/app/perfil/' && new URLSearchParams(window.location.search).get('universidad') === 'pendiente') return session;
  try {
    const choices = await loadUniversityChoices();
    const choice = choices.find(item => item.id === selected.id);
    if (!choice || !current()) return session;
    const saved = await fetch('/api/app/university', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...analyticsHeaders() },
      body: JSON.stringify({ universityId: choice.id }), signal: AbortSignal.timeout(8000),
    });
    if (!saved.ok || !current()) return session;
    const verified = await fetch('/api/app/session', {
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
    if (!verified.ok) return session;
    const result = await verified.json() as CampusSession;
    if (current() && result.authenticated && result.universityConfirmed && result.university?.id === choice.id) {
      track('campus_university_carried', { current_plan: result.plan === 'plus' ? 'plus' : 'free', university_confirmed: true, supported: result.profesAvailable === true });
    }
    return current() ? result : session;
  } catch { return session; /* Keep the existing explicit profile setup as a recovery path. */ }
}
