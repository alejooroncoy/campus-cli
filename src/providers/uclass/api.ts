import type { UclassChatItem, UclassRecording, UclassSession, UclassTranscript } from './types.js';

const PLAYER_ORIGIN = 'https://upc.class.com';
const API_ORIGIN = 'https://upc.rest.pod-2.sa-east-1.prod.class.com';

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function headers(session: UclassSession, referer: string) {
  return {
    accept: 'application/json',
    user_uuid: session.userUuid,
    'x-class-user-uuid': session.userUuid,
    cookie: session.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
    origin: PLAYER_ORIGIN,
    referer,
  };
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error(`${label} no tiene un formato válido`);
}

/** Class sometimes returns epoch milliseconds instead of recording-relative
 * seconds. This makes source citations portable to every MCP client. */
export function normalizeTranscriptTiming(transcript: UclassTranscript): UclassTranscript {
  const values = transcript.transcript.flatMap((line) => [line.startSeconds, line.endSeconds])
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const absolute = values.filter((value) => value >= 1_000_000_000);
  if (!absolute.length) return transcript;
  const origin = Math.min(...absolute);
  const milliseconds = origin >= 100_000_000_000;
  const relative = (value: number | null) => value === null || value < 1_000_000_000
    ? value
    : Math.max(0, (value - origin) / (milliseconds ? 1_000 : 1));
  return { ...transcript, transcript: transcript.transcript.map((line) => ({ ...line, startSeconds: relative(line.startSeconds), endSeconds: relative(line.endSeconds) })) };
}

/** Parse only the published speech/chat fields; attendee lists and other
 * arrays are not evidence of messages. No network or authentication here. */
export function parseRecordingData(
  recording: Pick<UclassRecording, 'classId' | 'recordingId' | 'url'>,
  payload: unknown,
): UclassTranscript & { chat: UclassChatItem[] } {
  const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const data = object(payload);
  const transcript = (Array.isArray(data.transcripts) ? data.transcripts : []).map((row, index) => {
    const item = object(row), line = object(item.data);
    return {
      id: String(item.class_session_note_id ?? line.message_id ?? index),
      startSeconds: finite(line.start_time), endSeconds: finite(line.end_time),
      speaker: stringOrNull(line.user_name), text: stringOrNull(item.override_text) ?? stringOrNull(item.content) ?? '',
    };
  }).filter(line => line.text);
  const chat = (Array.isArray(data.chatMessages) ? data.chatMessages : []).map((row, index) => {
    const item = object(row);
    return { id: String(item.id ?? index), timestampSeconds: finite(item.timestamp),
      sender: stringOrNull(item.sender_name), text: stringOrNull(item.message) ?? '' };
  }).filter(line => line.text);
  const epochSeconds = (value: number) => value >= 100_000_000_000 ? value / 1000 : value;
  const speechTimes = transcript.flatMap(line => [line.startSeconds, line.endSeconds])
    .filter((value): value is number => value !== null && value >= 1_000_000_000).map(epochSeconds);
  const chatTimes = chat.map(line => line.timestampSeconds)
    .filter((value): value is number => value !== null && value >= 1_000_000_000).map(epochSeconds);
  const origin = speechTimes.length ? Math.min(...speechTimes) : chatTimes.length ? Math.min(...chatTimes) : undefined;
  return { ...normalizeTranscriptTiming({ recording, title: stringOrNull(data.name), durationSeconds: finite(data.duration), transcript }),
    chat: chat.map(line => ({ ...line, timestampSeconds: line.timestampSeconds !== null && line.timestampSeconds >= 1_000_000_000
      ? Math.max(0, epochSeconds(line.timestampSeconds) - origin!) : line.timestampSeconds })),
    chatTimeline: chatTimes.length && !speechTimes.length ? 'first_chat_message' : 'recording',
  };
}

export async function listRecordings(session: UclassSession, classId: string): Promise<UclassRecording[]> {
  assertUuid(classId, 'La sala de Class');
  if (!session.userUuid || session.expiresAt <= Date.now()) throw new Error('La sesión de Class venció; ejecuta campus login y vuelve a intentar');
  const referer = `${PLAYER_ORIGIN}/react/lti/${classId}`;
  const schoolResponse = await fetch(`${API_ORIGIN}/api/zoom/get_school_info`, { headers: headers(session, referer) });
  if (schoolResponse.status === 401 || schoolResponse.status === 403) throw new Error('Class rechazó la sesión; ejecuta campus login y vuelve a intentar');
  if (!schoolResponse.ok) throw new Error(`Class no pudo identificar la institución (${schoolResponse.status})`);
  const school = await schoolResponse.json() as Record<string, unknown>;
  const schoolId = stringOrNull(school.school_uuid) ?? stringOrNull(school.uuid);
  if (!schoolId) throw new Error('Class no devolvió la institución de esta sala');
  const response = await fetch(`${API_ORIGIN}/recording/v1/schools/${encodeURIComponent(schoolId)}/class/${encodeURIComponent(classId)}/recordings`, { headers: headers(session, referer) });
  if (response.status === 401 || response.status === 403) throw new Error('Class rechazó la sesión; ejecuta campus login y vuelve a intentar');
  if (!response.ok) throw new Error(`Class no pudo listar las grabaciones (${response.status})`);
  const payload = await response.json() as { recordings?: unknown };
  return (Array.isArray(payload.recordings) ? payload.recordings : []).map((row): UclassRecording | null => {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    const recordingId = stringOrNull(item.recordingId) ?? stringOrNull(item.recording_id) ?? stringOrNull(item.uuid);
    if (!recordingId || !/^[0-9a-f-]{36}$/i.test(recordingId)) return null;
    return {
      classId,
      recordingId,
      url: `${PLAYER_ORIGIN}/player/recording/${classId}/${recordingId}`,
      title: stringOrNull(item.name),
      durationSeconds: finite(item.duration),
      publishedAt: stringOrNull(item.when) ?? stringOrNull(item.created_at),
    };
  }).filter((recording): recording is UclassRecording => Boolean(recording))
    .sort((a, b) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''));
}

export async function readTranscript(session: UclassSession, recording: Pick<UclassRecording, 'classId' | 'recordingId' | 'url'>): Promise<UclassTranscript> {
  assertUuid(recording.classId, 'La sala de Class');
  assertUuid(recording.recordingId, 'La grabación de Class');
  if (!session.userUuid || session.expiresAt <= Date.now()) throw new Error('La sesión de Class venció; ejecuta campus login y vuelve a intentar');
  const response = await fetch(`${API_ORIGIN}/meeting/${encodeURIComponent(recording.classId)}/v1_join_async_meeting`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers(session, recording.url) },
    body: JSON.stringify({ recordingUuid: recording.recordingId }),
  });
  if (response.status === 401 || response.status === 403) throw new Error('Class rechazó la sesión; ejecuta campus login y vuelve a intentar');
  if (!response.ok) throw new Error(`Class no pudo abrir la grabación (${response.status})`);
  const payload = await response.json() as { recordingData?: Record<string, unknown> };
  return parseRecordingData(recording, payload.recordingData);
}
