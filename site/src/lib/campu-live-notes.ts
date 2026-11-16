// Apuntes de Campito en clase (sesiones de UClass que escuchó la extensión).
// Misma lógica que los apuntes de la extensión: turnos por hablante, párrafos
// por minuto y horas de la clase. Sin DOM, para poder probarla en Node.

export type LiveEntry = {
  id: string;
  kind: 'audio' | 'chat' | 'gap' | string;
  startMs: number;
  endMs: number;
  text?: string;
  status?: string;
  author?: string;
  role?: string;
  audioSource?: 'tab' | 'microphone' | 'classmate';
  speaker?: { name?: string | null; role?: string } | null;
};
export type Speaker = { key: string; label: string; kind: 'you' | 'teacher' | 'person' | 'room' | 'classmate' };
export type Paragraph = { start: number; parts: string[] };
export type Turn =
  | { type: 'turn'; who: Speaker; start: number; end: number; paragraphs: Paragraph[]; pending: boolean }
  | { type: 'chat'; start: number; author: string; text: string; role?: string }
  | { type: 'gap'; start: number; end: number; text: string };

/** 0:00 hasta una hora; 1:02:03 en clases largas. */
export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

export function duration(ms: number) {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Fecha y hora de la clase en Perú (UTC-5), con mayúscula inicial. */
export function limaDate(iso: string | undefined) {
  if (!iso) return '';
  try {
    const text = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    return text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
  } catch {
    return '';
  }
}

// Quién habla: tu micrófono, la etiqueta docente de UClass, un nombre visible
// (probable, no verificado) o, sin señal, la sala.
export function speakerOf(e: LiveEntry): Speaker {
  if (e.audioSource === 'microphone') return { key: 'you', label: 'Tú', kind: 'you' };
  // Un tramo que no escuchaste, completado por un compañero de tu misma sala.
  if (e.audioSource === 'classmate') return { key: 'classmate', label: 'Mientras no estabas · compartido por un compañero de tu sala', kind: 'classmate' };
  const name = e.speaker?.name;
  if (e.speaker?.role === 'teacher') return { key: 'teacher:' + (name ?? ''), label: name ? `Profesor · ${name}` : 'Profesor', kind: 'teacher' };
  if (name) return { key: 'person:' + name, label: name, kind: 'person' };
  return { key: 'room', label: 'Sala', kind: 'room' };
}

/** Une los fragmentos seguidos del mismo hablante en un turno, partido en párrafos de ~1 minuto. */
export function turns(entries: LiveEntry[]): Turn[] {
  const out: Turn[] = [];
  for (const e of [...entries].sort((a, b) => a.startMs - b.startMs)) {
    if (e.kind === 'chat') { out.push({ type: 'chat', start: e.startMs, author: e.author || 'Chat', text: e.text ?? '', role: e.role }); continue; }
    if (e.kind === 'gap') {
      if (e.endMs - e.startMs >= 30000 && !/Preparación/.test(e.text ?? ''))
        out.push({ type: 'gap', start: e.startMs, end: e.endMs, text: /pausa sin voz/i.test(e.text ?? '') ? 'Silencio' : 'Corte de captura' });
      continue;
    }
    if (e.kind !== 'audio') continue;
    const pending = ['queued', 'processing'].includes(e.status ?? '');
    if (!e.text && !pending) continue;
    let who = speakerOf(e);
    const last = out[out.length - 1];
    // El indicador de UClass parpadea: un fragmento sin nombre pegado al turno
    // anterior (sin pausa) suele ser la misma persona que seguía hablando.
    if (who.kind === 'room' && last?.type === 'turn' && last.who.kind !== 'you' && e.startMs - last.end < 2500) who = last.who;
    if (last?.type === 'turn' && last.who.key === who.key && e.startMs - last.end < 20000) {
      const paragraph = last.paragraphs[last.paragraphs.length - 1];
      if (e.text) {
        if (e.startMs - paragraph.start >= 60000) last.paragraphs.push({ start: e.startMs, parts: [e.text] });
        else paragraph.parts.push(e.text);
      }
      last.end = e.endMs;
      last.pending ||= pending;
    } else {
      out.push({ type: 'turn', who, start: e.startMs, end: e.endMs, paragraphs: [{ start: e.startMs, parts: e.text ? [e.text] : [] }], pending });
    }
  }
  return out;
}

/** Parte un texto en trozos y marca los que coinciden con la búsqueda (sin HTML). */
export function highlight(text: string, query: string): { text: string; match: boolean }[] {
  if (!query) return [{ text, match: false }];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.split(new RegExp(`(${escaped})`, 'gi')).filter(Boolean)
    .map((part) => ({ text: part, match: part.toLocaleLowerCase('es') === query.toLocaleLowerCase('es') }));
}

export const sessionStateLabel = (state: string) =>
  ({ listening: '● Escuchando', paused: 'En pausa' } as Record<string, string>)[state] ?? 'Clase terminada';
