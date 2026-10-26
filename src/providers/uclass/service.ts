import os from 'node:os';
import path from 'node:path';
import type { BrowserContext, Frame, Page } from 'playwright';
import { launchPersistentContextSafe } from '../../browser-install.js';
import { loadOrRefreshSession, isSessionValid } from '../blackboard/auth/session.js';
import type { Cookie } from '../blackboard/types.js';
import { listRecordings, readTranscript } from './api.js';
import type { UclassRecording, UclassSession, UclassTranscript } from './types.js';
import { rankTranscriptLines, selectRecordingForQuery } from './analysis.js';
export { rankTranscriptLines, selectRecordingForQuery, selectRecordingsForQuery } from './analysis.js';

const PROFILE_DIR = path.join(os.homedir(), '.blackboard-cli', 'browser-profile');
const sessions = new Map<string, { classId: string; session: UclassSession }>();
const transcripts = new Map<string, UclassTranscript>();
const recordingLists = new Map<string, { recordings: UclassRecording[]; expiresAt: number }>();
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function isUuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function toCookie(cookie: { name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: string }): Cookie {
  return { name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path, ...(cookie.expires > 0 ? { expires: cookie.expires } : {}), httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite };
}

function toPlaywrightCookie(cookie: Cookie) {
  const sameSite: 'Strict' | 'Lax' | 'None' | undefined = cookie.sameSite === 'Strict' || cookie.sameSite === 'Lax' || cookie.sameSite === 'None'
    ? cookie.sameSite
    : undefined;
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires ?? -1,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    ...(sameSite ? { sameSite } : {}),
  };
}

function classExpiry(cookies: Cookie[]) {
  const future = cookies.map((cookie) => (cookie.expires ?? 0) * 1000).filter((value) => value > Date.now());
  return future.length ? Math.max(...future) : Date.now() + 90 * 60_000;
}

async function waitForClassFrame(page: Page, courseId: string): Promise<Frame> {
  await page.goto(`https://aulavirtual.upc.edu.pe/ultra/courses/${encodeURIComponent(courseId)}/outline`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.getByRole('button', { name: /class/i }).first().click({ timeout: 20_000 });
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const frame = page.frames().find((candidate) => /^https:\/\/upc\.class\.com\/react\/lti\/([0-9a-f-]{36})/i.test(candidate.url()));
    if (frame) return frame;
    await page.waitForTimeout(500);
  }
  throw new Error('Blackboard no expuso una sala de Class para este curso');
}

async function captureClassSession(context: BrowserContext, frame: Frame): Promise<{ classId: string; session: UclassSession }> {
  const match = frame.url().match(/^https:\/\/upc\.class\.com\/react\/lti\/([0-9a-f-]{36})/i);
  const classId = match?.[1] ?? '';
  if (!isUuid(classId)) throw new Error('Class no devolvió una sala válida');
  let userUuid = '';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    userUuid = await frame.evaluate(() => window.localStorage.getItem('user_uuid') ?? '');
    if (isUuid(userUuid)) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!isUuid(userUuid)) throw new Error('Class no entregó una sesión de estudiante');
  const cookies = (await context.cookies()).filter((cookie) => /(^|\.)class\.com$/i.test(cookie.domain)).map(toCookie);
  return { classId, session: { cookies, userUuid, capturedAt: Date.now(), expiresAt: classExpiry(cookies) } };
}

/** Resolves Blackboard's Class LTI launch with the student's existing local
 * SSO profile. The browser is used only to obtain the Class HTTP capability;
 * video/audio are never downloaded. */
async function classSessionForCourse(courseId: string) {
  if (!/^_\d+_\d+$/.test(courseId)) throw new Error('courseId debe tener formato Blackboard, por ejemplo _554422_1');
  const cached = sessions.get(courseId);
  if (cached && cached.session.expiresAt > Date.now()) return cached;
  const blackboard = await loadOrRefreshSession();
  if (!isSessionValid(blackboard)) throw new Error('Not authenticated. Ask the user to run: campus login');
  const context = await launchPersistentContextSafe(PROFILE_DIR, { headless: true, userAgent: USER_AGENT });
  try {
    await context.addCookies(blackboard!.cookies.map(toPlaywrightCookie));
    const page = await context.newPage();
    const frame = await waitForClassFrame(page, courseId);
    const captured = await captureClassSession(context, frame);
    sessions.set(courseId, captured);
    return captured;
  } finally {
    await context.close();
  }
}

export async function recordingsForCourse(courseId: string): Promise<UclassRecording[]> {
  const cached = recordingLists.get(courseId);
  if (cached && cached.expiresAt > Date.now()) return cached.recordings;
  const { classId, session } = await classSessionForCourse(courseId);
  if (!classId) throw new Error('Class necesita abrirse una vez para esta grabación');
  const recordings = await listRecordings(session, classId);
  recordingLists.set(courseId, {
    recordings,
    // Reuse metadata in this MCP process, rather than relaunching Class for
    // every question. The source session itself still has its own expiry.
    expiresAt: Math.min(session.expiresAt, Date.now() + 10 * 60_000),
  });
  return recordings;
}

export async function transcriptForCourse(courseId: string, recordingId?: string, query?: string): Promise<UclassTranscript> {
  const recordings = await recordingsForCourse(courseId);
  const recording = recordingId ? recordings.find((item) => item.recordingId === recordingId)
    : selectRecordingForQuery(recordings, query ?? '');
  if (!recording) throw new Error(recordingId ? 'La grabación no pertenece a este curso'
    : query ? 'No hay grabaciones publicadas de Class que coincidan con la fecha o clase solicitada'
    : 'No hay grabaciones publicadas de Class para este curso');
  const key = `${courseId}:${recording.recordingId}`;
  const cached = transcripts.get(key);
  if (cached) return cached;
  const { session } = await classSessionForCourse(courseId);
  const transcript = await readTranscript(session, recording);
  transcripts.set(key, transcript);
  return transcript;
}

function minute(seconds: number | null) {
  if (seconds === null) return 'sin marca';
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

/** Supplies a small evidence window to the connected model. Returning the
 * neighboring interventions is crucial: it prevents a candidate, example or
 * preliminary vote from being interpreted as the final answer. */
export async function searchTranscript(courseId: string, query: string, recordingId?: string) {
  const transcript = await transcriptForCourse(courseId, recordingId, query);
  const hits = rankTranscriptLines(transcript.transcript, query).slice(0, 8);
  const used = new Set<number>();
  const excerpts = hits.map(({ index }) => {
    const lines = transcript.transcript.slice(Math.max(0, index - 2), Math.min(transcript.transcript.length, index + 3))
      .filter((line) => !used.has(transcript.transcript.indexOf(line)))
      .map((line) => {
        used.add(transcript.transcript.indexOf(line));
        return `[${minute(line.startSeconds)}]${line.speaker ? ` ${line.speaker}:` : ''} ${line.text}`;
      });
    return lines.join('\n');
  }).filter(Boolean);
  return { recording: transcript.recording, title: transcript.title, durationSeconds: transcript.durationSeconds, query, excerpts, hitCount: hits.length };
}
