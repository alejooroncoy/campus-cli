// Audio stays in IndexedDB until the student deletes it. It never enters analytics or chat storage.
export type ClassSegment = { startSeconds: number; endSeconds: number; text: string; review: boolean; timingPrecision: 'audio_range' };
export type ClassRecording = {
  id: string; owner: string; title: string; course: string; courseId?: string; courseSource?: 'blackboard' | 'banner'; recordedAt: string; mime: string;
  /** Primera parte de la clase cuando la captura se cortó y siguió en otra parte. */
  continuesId?: string;
  bytes: number; durationSeconds: number; parts: number; state: 'recording' | 'saved' | 'interrupted';
  cloud?: string; status?: string; attempts?: number;
  transcriptionModel?: string | null;
  enhancedAudio?: { bytes: number; mime: string; method: 'elevenlabs_voice_isolator' | 'voice_leveling' };
  transcript?: { model: string; language: string; segments: ClassSegment[]; reviewRequired: boolean };
};
const DATABASE = 'campus-private-classes-v1';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('classes', { keyPath: 'id' }).createIndex('owner', 'owner');
      db.createObjectStore('parts', { keyPath: ['id', 'index'] });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento local.'));
    request.onblocked = () => reject(new Error('Cierra otras pestañas de clases y vuelve a intentarlo.'));
  });
}
async function transaction<T>(stores: string[], mode: IDBTransactionMode, run: (tx: IDBTransaction, done: (value: T) => void) => void): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode); let result: T;
      tx.oncomplete = () => resolve(result);
      // Solo una cuota agotada es «sin espacio»; una copia de otra cuenta aborta a propósito y se dice tal cual.
      tx.onerror = tx.onabort = () => reject(tx.error?.name === 'QuotaExceededError' ? new Error('No hay espacio para guardar el audio.')
        : tx.error ? new Error('No pudimos usar el almacenamiento de este dispositivo.') : new Error('Esta copia no pertenece a tu cuenta en este dispositivo.'));
      try { run(tx, value => { result = value; }); } catch (e) { tx.abort(); reject(e); }
    });
  } finally { db.close(); }
}
export const saveClass = (recording: ClassRecording) => transaction<void>(['classes'], 'readwrite', tx => { tx.objectStore('classes').put(recording); });
export const appendClassAudio = (recording: ClassRecording, bytes: Blob, index: number) => transaction<void>(['classes', 'parts'], 'readwrite', tx => {
  tx.objectStore('parts').put({ id: recording.id, index, bytes }); tx.objectStore('classes').put(recording);
});
export const localClasses = (owner: string) => transaction<ClassRecording[]>(['classes'], 'readonly', (tx, done) => {
  const request = tx.objectStore('classes').index('owner').getAll(owner);
  request.onsuccess = () => done(request.result.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)));
});
export const localClassAudio = (recording: ClassRecording) => transaction<Blob>(['classes','parts'], 'readonly', (tx, done) => {
  const identity = tx.objectStore('classes').get(recording.id);
  identity.onsuccess = () => {
    if (identity.result?.owner !== recording.owner) { tx.abort(); return; }
    const request = tx.objectStore('parts').getAll(IDBKeyRange.bound([recording.id, 0], [recording.id, Number.MAX_SAFE_INTEGER]));
    request.onsuccess = () => done(new Blob(request.result.map(p => p.bytes), { type: recording.mime }));
  };
});
export const deleteLocalClass = (recording: ClassRecording) => transaction<void>(['classes','parts'], 'readwrite', tx => {
  const request = tx.objectStore('classes').get(recording.id);
  request.onsuccess = () => {
    if (request.result?.owner !== recording.owner) { tx.abort(); return; }
    tx.objectStore('classes').delete(recording.id);
    tx.objectStore('parts').delete(IDBKeyRange.bound([recording.id, 0], [recording.id, Number.MAX_SAFE_INTEGER]));
  };
});
export function recordingMime() {
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
}
export function clockLabel(seconds: number) {
  const rounded = Math.max(0, Math.floor(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}
export function automaticClassTitle(course: string, date: string) {
  const time = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(date));
  return `${course.trim() || 'Clase presencial'} · ${time}`.slice(0, 160);
}
