import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clock, duration, highlight, limaDate, turns } from '../src/lib/campu-live-notes.ts';

const audio = (startMs, text, extra = {}) => ({ id: 'audio:' + startMs, kind: 'audio', startMs, endMs: startMs + 9000, status: 'ready', text, ...extra });

test('las horas de la clase se leen como en los apuntes de la extensión', () => {
  assert.equal(clock(65_000), '1:05');
  assert.equal(clock(3_723_000), '1:02:03');
  assert.equal(duration(45 * 60000), '45 min');
  assert.equal(duration(95 * 60000), '1 h 35 min');
  assert.equal(limaDate('2026-11-10T14:00:00.000Z').startsWith('Martes'), true, 'fecha en hora de Perú con mayúscula');
});

test('los fragmentos del mismo hablante forman un turno con párrafos por minuto', () => {
  const teacher = { speaker: { name: 'Ana', role: 'teacher' } };
  const list = turns([
    audio(0, 'Hoy vemos el alcance.', teacher),
    audio(9_500, 'Sigue el profesor.', { speaker: { name: null, role: 'unknown' } }),
    ...[20_000, 30_000, 40_000, 50_000].map((at) => audio(at, 'Más.', teacher)),
    audio(60_000, 'Sigue la explicación.', teacher),
    audio(70_000, 'Ya pasó un minuto.', teacher),
    { id: 'c1', kind: 'chat', startMs: 72_000, endMs: 72_000, text: '¿Para cuándo?', author: 'Luis' },
    audio(80_000, 'Yo pregunto.', { audioSource: 'microphone' }),
    { id: 'g', kind: 'gap', startMs: 100_000, endMs: 160_000, text: 'Corte' },
    audio(170_000, '', { status: 'queued' }),
  ]);
  assert.deepEqual(list.map((t) => t.type), ['turn', 'chat', 'turn', 'gap', 'turn']);
  const first = list[0];
  assert.equal(first.who.label, 'Profesor · Ana');
  assert.deepEqual(first.paragraphs.map((p) => p.start), [0, 60_000], 'un párrafo nuevo cada minuto');
  assert.deepEqual(first.paragraphs[0].parts.slice(0, 2), ['Hoy vemos el alcance.', 'Sigue el profesor.'], 'la sala pegada al turno sigue siendo el profesor');
  assert.equal(list[2].who.label, 'Tú');
  assert.equal(list[3].text, 'Corte de captura');
  assert.equal(list[4].pending, true);
});

test('la búsqueda se resalta sin interpretar HTML ni expresiones', () => {
  assert.deepEqual(highlight('El trabajo final y el TRABAJO', 'trabajo'), [
    { text: 'El ', match: false }, { text: 'trabajo', match: true }, { text: ' final y el ', match: false }, { text: 'TRABAJO', match: true },
  ]);
  assert.deepEqual(highlight('a+b <i>', 'a+b'), [{ text: 'a+b', match: true }, { text: ' <i>', match: false }]);
});
