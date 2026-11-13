import { track } from './analytics';
import type { CampusSession } from './campus-session';

// Prueba 50/50 de la pregunta de muestra sin cuenta. El brazo se guarda en el
// navegador y se registra una sola vez en `campus_guest_sample_assigned`; el
// análisis por persona se une por ese evento. No se asigna brazo mientras el
// backend no ofrezca la muestra, para no contaminar la medición.
export type GuestSampleArm = 'sample' | 'gate';
const KEY = 'campus-guest-sample-arm-v1';

function stored(): GuestSampleArm | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'sample' || value === 'gate' ? value : null;
  } catch { return null; }
}

function draw(): GuestSampleArm {
  const bytes = new Uint8Array(1);
  try { crypto.getRandomValues(bytes); } catch { bytes[0] = Math.floor(Math.random() * 256); }
  return bytes[0] % 2 === 0 ? 'sample' : 'gate';
}

/** Devuelve el brazo del invitado y lo asigna la primera vez que el backend ofrece la muestra. */
export function assignGuestSampleArm(session: Pick<CampusSession, 'authenticated' | 'guestSample'>): GuestSampleArm {
  if (session.authenticated || !session.guestSample) return 'gate';
  const saved = stored();
  if (saved) return saved;
  if (!session.guestSample.available) return 'gate';
  const arm = draw();
  try { localStorage.setItem(KEY, arm); } catch { /* Sin almacenamiento, cada visita se asigna de nuevo. */ }
  track('campus_guest_sample_assigned', { guest_sample_arm: arm });
  return arm;
}

/** El invitado ve el chat con una pregunta de muestra solo si su brazo es `sample` y el backend la ofrece. */
export function guestSampleOffered(session: Pick<CampusSession, 'authenticated' | 'guestSample'>, arm: GuestSampleArm): boolean {
  return !session.authenticated && arm === 'sample' && session.guestSample?.available === true;
}
