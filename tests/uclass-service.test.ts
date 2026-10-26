import assert from 'node:assert/strict';
import test from 'node:test';

import { rankTranscriptLines, selectRecordingForQuery, selectRecordingsForQuery } from '../src/providers/uclass/service.js';
import { parseRecordingData, readTranscript } from '../src/providers/uclass/api.js';
import type { UclassRecording, UclassTranscriptItem } from '../src/providers/uclass/types.js';

const recordings: UclassRecording[] = [
  { classId: 'room', recordingId: 'new', url: 'https://example.com/new', title: null, durationSeconds: 1, publishedAt: '2026-08-26T12:00:00.000Z' },
  { classId: 'room', recordingId: 'first', url: 'https://example.com/first', title: null, durationSeconds: 1, publishedAt: '2026-08-24T12:00:00.000Z' },
];

const now = new Date('2026-08-27T17:00:00Z');

test('selectRecordingForQuery uses the first class rather than the latest recording', () => {
  assert.equal(selectRecordingForQuery(recordings, '¿Qué pidió el profesor en la primera clase de esta semana?', now)?.recordingId, 'first');
});

test('selectRecordingForQuery resolves a Spanish calendar date', () => {
  assert.equal(selectRecordingForQuery(recordings, '¿Qué se explicó el 24 de agosto?')?.recordingId, 'first');
});

test('selectRecordingsForQuery considers the full current week before narrowing an ordinal', () => {
  assert.deepEqual(selectRecordingsForQuery(recordings, '¿Qué se vio esta semana?', now).map((recording) => recording.recordingId), ['new', 'first']);
  assert.deepEqual(selectRecordingsForQuery(recordings, '¿Qué se pidió en la primera clase de esta semana?', now).map((recording) => recording.recordingId), ['first']);
});

test('recording dates and ordinals never fall back to an unrelated latest class', () => {
  assert.deepEqual(selectRecordingsForQuery(recordings, 'clase del 25 de agosto', now), []);
  assert.deepEqual(selectRecordingsForQuery(recordings, 'tercera clase de esta semana', now), []);
  assert.deepEqual(selectRecordingsForQuery(recordings, 'esta semana', new Date('2026-10-26T17:00:00Z')), []);
  assert.equal(selectRecordingForQuery(recordings, 'clase de 2026-08-24', now)?.recordingId, 'first');
  assert.deepEqual(recordings.map(recording => recording.recordingId), ['new', 'first'], 'selection must not reorder the source');
});

test('weekly recording selection uses Monday in Lima, independent of host timezone', () => {
  const boundary = [
    { ...recordings[0], recordingId: 'sunday', publishedAt: '2026-08-24T04:59:59Z' },
    { ...recordings[0], recordingId: 'monday', publishedAt: '2026-08-24T05:00:00Z' },
    { ...recordings[0], recordingId: 'unknown', publishedAt: null },
  ];
  assert.deepEqual(selectRecordingsForQuery(boundary, 'esta semana', now).map(recording => recording.recordingId), ['monday']);
});

test('rankTranscriptLines prefers rare installation evidence over generic project mentions', () => {
  const transcript: UclassTranscriptItem[] = [
    ...Array.from({ length: 20 }, (_, index) => ({ id: String(index), startSeconds: index, endSeconds: index + 1, speaker: 'Profesor', text: 'Hoy veremos el proyecto y sus fases.' })),
    { id: 'install', startSeconds: 21, endSeconds: 22, speaker: 'Profesor', text: 'Manual de installacion del Proye professional.' },
    { id: 'download', startSeconds: 23, endSeconds: 24, speaker: 'Profesor', text: 'Descárguenlo para poder instalarlo en sus computadoras.' },
  ];
  const hits = rankTranscriptLines(transcript, '¿Mencionó Microsoft Project y cómo instalarlo?');
  assert.equal(hits[0].index, 20);
  assert.equal(hits[1].index, 21);
  assert.deepEqual(rankTranscriptLines(transcript, '¿Qué dijo el profesor?'), []);
  const rare = rankTranscriptLines(transcript, 'proyecto instalar');
  assert.equal(rare[0].index, 20, 'frequent project boilerplate must not outrank a rare installation match');
});

test('parseRecordingData preserves recording chat separately from speech transcript', () => {
  const source = parseRecordingData(
    { classId: 'room', recordingId: 'recording', url: 'https://example.com/recording' },
    {
      name: 'Clase 2',
      transcripts: [{ class_session_note_id: 'speech', content: 'Abramos el material.', data: { start_time: 10, end_time: 12, user_name: 'Docente' } }],
      chatMessages: [{ id: 'link', timestamp: 1_700_000_000_000, sender_name: 'Docente', message: 'https://example.com/material' }],
    },
  );
  assert.deepEqual(source.transcript, [{ id: 'speech', startSeconds: 10, endSeconds: 12, speaker: 'Docente', text: 'Abramos el material.' }]);
  assert.deepEqual(source.chat, [{ id: 'link', timestampSeconds: 0, sender: 'Docente', text: 'https://example.com/material' }]);
  assert.equal(source.chatTimeline, 'first_chat_message', 'chat with no shared speech clock must not claim recording timestamps');
});

test('parseRecordingData does not mistake unrelated arrays for recording chat', () => {
  const source = parseRecordingData(
    { classId: 'room', recordingId: 'recording', url: 'https://example.com/recording' },
    { attendees: [{ name: 'No es un mensaje' }] },
  );
  assert.deepEqual(source.chat, []);
});

test('the transcript reader uses the parser and aligns shared epoch clocks without merging chat into speech', async t => {
  const previous = globalThis.fetch;
  const classId = '11111111-1111-4111-8111-111111111111';
  const recordingId = '22222222-2222-4222-8222-222222222222';
  const recording = { classId, recordingId, url: `https://upc.class.com/player/recording/${classId}/${recordingId}` };
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), `https://upc.rest.pod-2.sa-east-1.prod.class.com/meeting/${classId}/v1_join_async_meeting`);
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), { recordingUuid: recordingId });
    return new Response(JSON.stringify({ recordingData: {
      transcripts: [{ content: 'Clase', data: { start_time: 1_700_000_000_000, end_time: 1_700_000_002_000 } }],
      chatMessages: [{ id: 'chat', timestamp: 1_700_000_003_000, message: 'Enlace' }],
      attendees: [{ message: 'Not a chat message' }],
    } }), { headers: { 'content-type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = previous; });
  const result = await readTranscript({ cookies: [], userUuid: 'fixture', capturedAt: Date.now(), expiresAt: Date.now() + 60_000 }, recording);
  assert.equal(result.transcript.length, 1);
  assert.equal(result.transcript[0].startSeconds, 0);
  assert.equal(result.transcript[0].endSeconds, 2);
  assert.deepEqual(result.chat, [{ id: 'chat', timestampSeconds: 3, sender: null, text: 'Enlace' }]);
  assert.equal(result.chatTimeline, 'recording');
});
