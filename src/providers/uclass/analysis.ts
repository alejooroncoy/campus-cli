import type { UclassRecording, UclassTranscriptItem } from './types.js';

function normalize(value: string): string {
  return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const calendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
});

function localDate(value: Date): { year: number; month: number; day: number; at: number } | undefined {
  if (!Number.isFinite(value.getTime())) return undefined;
  const fields = Object.fromEntries(calendar.formatToParts(value).map(part => [part.type, part.value]));
  const year = Number(fields.year), month = Number(fields.month), day = Number(fields.day);
  return { year, month, day, at: Date.UTC(year, month - 1, day) };
}

const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Pure metadata selection for the retained core. This never opens Class or
 * authorizes access; callers must first obtain recordings for the course. */
export function selectRecordingsForQuery(recordings: UclassRecording[], query: string, now = new Date()): UclassRecording[] {
  const normalized = normalize(query);
  let selected = recordings.slice().sort((a, b) =>
    (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0));
  const spanishDate = normalized.match(/\b(\d{1,2}) de ([a-z]+)(?: de (\d{4}))?\b/);
  const isoDate = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (spanishDate || isoDate) {
    const day = Number(isoDate?.[3] ?? spanishDate?.[1]);
    const month = isoDate ? Number(isoDate[2]) : months.indexOf(spanishDate![2]) + 1;
    const year = isoDate?.[1] ?? spanishDate?.[3];
    selected = selected.filter(recording => {
      const date = localDate(new Date(recording.publishedAt ?? ''));
      return date?.day === day && date.month === month && (year === undefined || date.year === Number(year));
    });
  }
  if (/\b(?:esta semana|semana actual)\b/.test(normalized)) {
    const today = localDate(now);
    if (!today) return [];
    const monday = today.at - ((new Date(today.at).getUTCDay() + 6) % 7) * 86_400_000;
    selected = selected.filter(recording => {
      const date = localDate(new Date(recording.publishedAt ?? ''));
      return date !== undefined && date.at >= monday && date.at < monday + 7 * 86_400_000;
    });
  }
  const ordinal = normalized.match(/\b(primera?|segunda?|tercera?|cuarta?|quinta?|ultima?)\s+(?:clase|grabacion)\b/);
  if (ordinal) {
    const index = ['primer', 'segund', 'tercer', 'cuart', 'quint'].findIndex(prefix => ordinal[1].startsWith(prefix));
    const recording = index < 0 ? selected[0] : selected[selected.length - 1 - index];
    return recording ? [recording] : [];
  }
  return selected;
}

export function selectRecordingForQuery(recordings: UclassRecording[], query: string, now = new Date()): UclassRecording | undefined {
  return selectRecordingsForQuery(recordings, query, now)[0];
}

const stopWords = new Set('que el la los las de del un una unos unas en por para con y o se es al lo le les como cuando donde cual esto esta este estas estos semana clase profesor dijo pidio vio menciono hay habia haber tiene hacer'.split(' '));

function terms(text: string): Set<string> {
  return new Set(normalize(text).split(/[^\p{L}\p{N}]+/u)
    .filter(term => term.length > 2 && !stopWords.has(term))
    // Native captions sometimes spell "instalación" with a doubled l.
    .map(term => term.replace(/^install/, 'instal'))
    .map(term => term.startsWith('instal') ? 'instal' : term));
}

/** Lexical candidates only, with rare query terms weighted above repeated
 * lecture boilerplate. The surrounding source still needs to be read. */
export function rankTranscriptLines(transcript: UclassTranscriptItem[], query: string): Array<{ index: number; score: number }> {
  const needles = terms(query);
  const lines = transcript.map(line => terms(line.text));
  const weights = new Map([...needles].map(term => [term,
    Math.log(1 + lines.length / (1 + lines.filter(line => line.has(term)).length)),
  ]));
  return lines.map((line, index) => ({ index,
    score: [...needles].reduce((total, term) => total + (line.has(term) ? weights.get(term)! : 0), 0),
  })).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
}
