import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import UClassNotes from './UClassNotes';
import CharacterGreeting from './CharacterGreeting';
import ClassesSurvey from './ClassesSurvey';
import { CampitoListening, EmptyClasses, LevelBars, SignedOutClasses, TranscriptionSteps } from './ClassRecorderVisuals';
import { appendClassAudio, automaticClassTitle, clockLabel, deleteLocalClass, localClassAudio, localClasses, recordingMime, saveClass, type ClassRecording, type ClassSegment } from '../lib/class-recordings';

type Config = { authenticated: boolean; owner: string | null; readable: boolean; enabled: boolean; transcribing: boolean; transcriptionLive?: boolean; liveTranscription?: boolean; liveQuestions?: boolean; preview?: boolean; model?: string; audioEnhancement?: boolean; audioEnhancementMethod?: 'voice_leveling' | 'elevenlabs_voice_isolator' | null; partBytes: number; maxBytes: number; maxSeconds: number };
const API = '/api/app/classes';
const MAX_BYTES = 96 * 1024 * 1024;
const MAX_SECONDS = 10800;
type Course = { id: string; name: string; source: 'blackboard' | 'banner'; code?: string };
const statusLabel: Record<string, string> = { draft: 'Audio por sincronizar', queued: 'Esperando transcripción', processing: 'Transcribiendo en español', ready: 'Texto disponible · Revisión pendiente', failed: 'No se pudo transcribir' };
const errorText = (e: unknown) => e instanceof Error ? e.message : 'No se pudo completar la acción.';
async function json(response: Response) {
  // Una página de error del proxy (HTML) no debe llegar al alumno como un error de JSON.
  const value = await response.json().catch(() => { throw new Error(response.ok ? 'No pudimos leer la respuesta de Mis clases. Vuelve a intentarlo en un momento.' : 'Mis clases no está disponible en este momento. Tus grabaciones de este dispositivo siguen guardadas.'); });
  if (!response.ok) throw new Error(value.error ?? 'No se pudo completar la acción.');
  return value;
}
function extension(mime: string) { return mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('mpeg') ? 'mp3' : mime.includes('wav') ? 'wav' : 'webm'; }
// Las ventanas duran entre 8 y 12 s y se cortan en una pausa de la voz, no a mitad de palabra.
const LIVE_RATE = 16000, LIVE_MIN_SECONDS = 8, LIVE_MAX_SECONDS = 12, LIVE_PAUSE_RMS = 0.01;
type LiveLine = { startSeconds: number; text: string; review: boolean };
/** Continuación de una clase cuya captura cortó el sistema (pantalla bloqueada, llamada, otra app con el micrófono). */
// Clase completa cuando la captura se cortó en partes: segmentos en una sola línea de tiempo.
type FullSegment = ClassSegment & { partId: string; partSeconds: number };
type FullClass = { groupId: string; parts: { id: string; title: string; status: string; offsetSeconds: number; durationSeconds: number }[]; segments: FullSegment[]; gaps: { fromSeconds: number; toSeconds: number }[] };
type Continuation = { firstId: string; firstRecordedAt: string; baseTitle: string; part: number; course: string; courseRef: { courseId?: string; courseSource?: 'blackboard' | 'banner' }; tried: boolean };
/** WAV PCM mono de 16 bits: cada ventana es un archivo completo que el servidor puede transcribir sola. */
function wavBlob(samples: Int16Array) {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const tag = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  tag(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); tag(8, 'WAVE'); tag(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, LIVE_RATE, true); view.setUint32(28, LIVE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => view.setInt16(44 + i * 2, sample, true));
  return new Blob([view], { type: 'audio/wav' });
}
/** Estado que envía la app de Campus (Expo) cuando el teléfono graba la clase. */
type NativeRecorderState = { status: 'idle' | 'starting' | 'recording' | 'interrupted' | 'stopping'; elapsedSeconds: number; part: number; firstId: string | null; message?: string; uploads: { pending: number; uploading: boolean; done: number; error?: string } };
type NativeBridge = { CampusNative?: { recorder?: number }; ReactNativeWebView?: { postMessage(data: string): void } };
/** Dentro de la app, la grabación la hace el teléfono: sigue con la pantalla bloqueada y sube cada parte sola. */
const nativeRecorder = () => typeof window !== 'undefined' && Boolean((window as NativeBridge).CampusNative?.recorder && (window as NativeBridge).ReactNativeWebView);
const toNative = (message: unknown) => (window as NativeBridge).ReactNativeWebView?.postMessage(JSON.stringify(message));
/**
 * Dónde se graba: la laptop graba en la web (aguanta con la pantalla en reposo), el celular con la app.
 * En iPhone la web pierde el micrófono al bloquear o al salir de Campus, así que ahí no se ofrece grabar.
 */
type RecordDevice = 'native' | 'ios' | 'android' | 'desktop';
function recordDevice(): RecordDevice {
  if (nativeRecorder()) return 'native';
  const ua = navigator.userAgent;
  // iPadOS se presenta como Mac: se distingue por la pantalla táctil.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return /Android/.test(ua) ? 'android' : 'desktop';
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Si las notas de UClass fallan al dibujarse, se ocultan; la grabación en curso no se desmonta. */
class NotesBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}
const NATIVE_STATUS = ['idle', 'starting', 'recording', 'interrupted', 'stopping'];
/** El estado que manda la app se valida antes de usarlo: una versión vieja o un script de la página no deben romper la vista. */
function nativeState(value: unknown): NativeRecorderState | null {
  const v = value as NativeRecorderState | null, n = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  if (!v || !NATIVE_STATUS.includes(v.status) || !n(v.elapsedSeconds) || !n(v.part) || !v.uploads || !n(v.uploads.pending) || !n(v.uploads.done)) return null;
  return { status: v.status, elapsedSeconds: v.elapsedSeconds, part: v.part, firstId: typeof v.firstId === 'string' ? v.firstId : null,
    message: typeof v.message === 'string' ? v.message.slice(0, 300) : undefined,
    uploads: { pending: v.uploads.pending, done: v.uploads.done, uploading: Boolean(v.uploads.uploading), error: typeof v.uploads.error === 'string' ? v.uploads.error.slice(0, 200) : undefined } };
}

export default function ClassRecorder() {
  const [config, setConfig] = useState<Config | null>(null), [loading, setLoading] = useState(true);
  // Se decide en el cliente para que el HTML inicial sea el mismo en todos los dispositivos.
  const [device, setDevice] = useState<RecordDevice>('desktop');
  useEffect(() => { setDevice(recordDevice()); }, []);
  const [items, setItems] = useState<ClassRecording[]>([]), [selected, setSelected] = useState<ClassRecording | null>(null);
  const [title, setTitle] = useState(''), [course, setCourse] = useState(''), [consent, setConsent] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]), [courseId, setCourseId] = useState(''), [coursesLoading, setCoursesLoading] = useState(false);
  const [courseStatus, setCourseStatus] = useState(''), [helpOpen, setHelpOpen] = useState(false);
  const [mode, setMode] = useState<'idle' | 'starting' | 'testing' | 'recording' | 'paused' | 'saving'>('idle');
  const [elapsed, setElapsed] = useState(0), [level, setLevel] = useState(0), [low, setLow] = useState(false);
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [audioUrl, setAudioUrl] = useState('');
  const [audioVersion, setAudioVersion] = useState<'original' | 'clean'>('original');
  const [sampleUrl, setSampleUrl] = useState(''), [rescue, setRescue] = useState<Blob | null>(null), [deleteId, setDeleteId] = useState('');
  const [uploadMinutes, setUploadMinutes] = useState('');
  const [liveId, setLiveId] = useState(''), [liveLines, setLiveLines] = useState<LiveLine[]>([]), [liveUntil, setLiveUntil] = useState(0), [liveNote, setLiveNote] = useState('');
  const [resume, setResume] = useState<Continuation | null>(null), [full, setFull] = useState<FullClass | null>(null), [playingPart, setPlayingPart] = useState('');
  const microphoneRef = useRef<(test: boolean, continuation?: Continuation) => Promise<void>>(async () => {});
  const [question, setQuestion] = useState(''), [asking, setAsking] = useState(false), [answer, setAnswer] = useState<{ text: string; untilSeconds: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null);
  const alive = useRef(true), owner = useRef<string | null>(null), active = useRef(false), audio = useRef<HTMLAudioElement>(null);
  // Audio que todavía no está a salvo: se está guardando o quedó solo en memoria tras un fallo. Cerrar la pestaña lo perdería.
  const unsaved = useRef(false), autoplay = useRef(false);
  // Clase abierta y el estado de sus partes al abrirla, para refrescarla cuando termine de transcribirse.
  const openClass = useRef<{ firstId: string; statuses: Record<string, string | undefined> } | null>(null), busyRef = useRef(false);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { if (!selected) openClass.current = null; }, [selected]);
  const cleanupAudio = useRef<() => void>(() => {}), requestController = useRef(new AbortController());
  const detail = useRef<HTMLElement>(null), playbackPosition = useRef<number | null>(null);
  const awaitingTranscript = useRef<string | null>(null);
  const [native, setNative] = useState<NativeRecorderState | null>(null), refreshRef = useRef<() => Promise<void>>(async () => {});
  const nativeActive = Boolean(native && native.status !== 'idle');
  const locked = mode !== 'idle';
  const chosenCourse = courses.find(c => c.id === courseId);
  const courseRef = chosenCourse ? { courseId: chosenCourse.id, courseSource: chosenCourse.source } : {};

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(API + path + '/', { ...init, credentials: 'same-origin', cache: 'no-store', signal: requestController.current.signal,
      headers: { 'x-campus-class-owner': owner.current ?? '', ...init.headers } });
    // Si la sesión vence en plena clase, la grabación sigue en el dispositivo: solo se pausa el envío.
    if (response.status === 401 && active.current) {
      setMessage('Tu sesión venció. La grabación sigue guardándose en este dispositivo: al terminar, inicia sesión otra vez para sincronizarla.');
      throw new Error('Tu sesión venció. La grabación continúa en este dispositivo.');
    }
    if (response.status === 401 || response.status === 409 && (await response.clone().text()).includes('cuenta cambió')) {
      if (recorder.current?.state !== 'inactive') recorder.current?.stop();
      owner.current = null; setConfig(null); setItems([]); setSelected(null); setAudioUrl('');
      throw new Error('La sesión cambió. Actualiza la página para continuar con tu cuenta.');
    }
    return response;
  }
  async function refresh(settings = config) {
    if (!settings?.owner) return;
    const expectedOwner = settings.owner;
    // Sin almacenamiento del navegador (bloqueado o privado) igual se muestran las clases de la cuenta.
    const local = await localClasses(expectedOwner).catch(() => [] as ClassRecording[]);
    if (alive.current && expectedOwner === owner.current) setItems(local.map(r => ({ ...r, state: r.state === 'recording' && !active.current ? 'interrupted' : r.state })));
    let remote: ClassRecording[] = [];
    if (settings.readable) remote = (await json(await request(''))).recordings;
    if (!alive.current || expectedOwner !== owner.current) return;
    const merged = new Map(local.map(r => [r.id, { ...r, state: r.state === 'recording' && !active.current ? 'interrupted' as const : r.state }]));
    for (const remoteItem of remote) merged.set(remoteItem.id, { ...remoteItem, ...merged.get(remoteItem.id), owner: expectedOwner, status: remoteItem.status, attempts: remoteItem.attempts, cloud: remoteItem.status });
    setItems([...merged.values()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)));
    const completed = merged.get(awaitingTranscript.current ?? '');
    if (completed?.status === 'ready') { awaitingTranscript.current = null; void select(completed, true); return; }
    // La clase abierta se actualiza sola cuando una de sus partes termina de transcribirse, sin tener que cerrarla y abrirla.
    const open = openClass.current;
    if (open) {
      const group = [...merged.values()].filter(p => p.id === open.firstId || p.continuesId === open.firstId);
      const newlyReady = group.some(p => p.status === 'ready' && open.statuses[p.id] !== 'ready');
      const first = merged.get(open.firstId);
      if (newlyReady && first && !busyRef.current) void select(first);
    }
  }
  async function loadCourses(expectedOwner = owner.current) {
    setCoursesLoading(true);
    try {
      const result = await json(await request('/courses'));
      if (owner.current !== expectedOwner || !alive.current) return;
      setCourses(result.courses ?? []);
      setCourseStatus(result.status !== 'available' ? 'No pudimos cargar tus cursos. Puedes grabar ahora y escribir el curso si lo necesitas.' : result.source === 'demo' ? 'Cursos de ejemplo de la vista previa.' : result.source === 'saved_banner_snapshot' ? 'Cursos de tu matrícula guardada. No confirma cambios recientes.' : result.complete === false ? 'Cursos de tu Aula Virtual. La lista puede estar incompleta.' : 'Cursos de tu Aula Virtual.');
    } catch { if (alive.current) setCourseStatus('No pudimos cargar tus cursos. Puedes grabar sin elegir uno.'); }
    finally { if (alive.current) setCoursesLoading(false); }
  }
  useEffect(() => {
    alive.current = true;
    void fetch(API + '/config/', { credentials: 'same-origin', cache: 'no-store', signal: requestController.current.signal }).then(json).then(async settings => {
      if (!alive.current) return;
      owner.current = settings.owner; setConfig(settings);
      if (settings.owner) void loadCourses(settings.owner);
      await refresh(settings);
    }).catch(e => { if (alive.current) setMessage(errorText(e)); }).finally(() => { if (alive.current) setLoading(false); });
    const unload = (e: BeforeUnloadEvent) => { if (active.current || unsaved.current) { e.preventDefault(); e.returnValue = ''; } };
    const identityChanged = () => {
      requestController.current.abort();
      if (recorder.current?.state !== 'inactive') recorder.current?.stop();
      owner.current = null; setConfig(null); setItems([]); setSelected(null); setAudioUrl(''); setSampleUrl(''); setRescue(null); setCourses([]); setCourseId(''); setCourse(''); setLiveId(''); setLiveLines([]); setAnswer(null);
      setMessage('La cuenta cambió. Actualiza la página para continuar.');
    };
    // Se verifica la cookie antes de cortar nada: los avisos de la misma cuenta son comunes y no deben detener una grabación.
    const verifyIdentity = () => { void fetch(API + '/config/', { cache: 'no-store' }).then(json).then(settings => { if (owner.current && settings.owner !== owner.current) identityChanged(); }).catch(() => {}); };
    const storage = (e: StorageEvent) => { if (e.key === 'campus-session-revision-v1') verifyIdentity(); };
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('campus-session-events-v1');
    if (channel) channel.onmessage = verifyIdentity;
    // Los enlaces internos navegan sin recargar (ClientRouter de Astro) y no disparan beforeunload: se pregunta aquí.
    const navigate = (e: Event) => { if ((active.current || unsaved.current) && !confirm('Tu clase todavía se está grabando o guardando. Si sales, puedes perder audio. ¿Salir igual?')) e.preventDefault(); };
    document.addEventListener('astro:before-preparation', navigate);
    window.addEventListener('beforeunload', unload); window.addEventListener('storage', storage);
    return () => {
      alive.current = false; requestController.current.abort(); active.current = false;
      if (recorder.current?.state !== 'inactive') recorder.current?.stop();
      cleanupAudio.current(); stream.current?.getTracks().forEach(t => t.stop());
      document.removeEventListener('astro:before-preparation', navigate);
      window.removeEventListener('beforeunload', unload); window.removeEventListener('storage', storage); channel?.close();
    };
  }, []);
  // En la app: el teléfono informa estado, tiempo, parte y subidas; al confirmarse una parte se actualiza Mis clases.
  useEffect(() => {
    if (!nativeRecorder()) return;
    let lastDone = -1, lastStatus: NativeRecorderState['status'] = 'idle';
    const onNative = (event: Event) => {
      const state = nativeState((event as CustomEvent<unknown>).detail);
      if (!alive.current || !state) return;
      setNative(state);
      if (state.status !== 'idle') { active.current = true; setMode(state.status === 'starting' ? 'starting' : state.status === 'stopping' ? 'saving' : 'recording'); setElapsed(state.elapsedSeconds); }
      else if (lastStatus !== 'idle') { active.current = false; setMode('idle'); }
      if (state.message && state.status !== lastStatus) setMessage(state.message);
      if (lastDone >= 0 && state.uploads.done !== lastDone) void refreshRef.current().catch(() => {});
      lastDone = state.uploads.done; lastStatus = state.status;
    };
    window.addEventListener('campus-native', onNative);
    toNative({ type: 'campus:hello' });
    return () => window.removeEventListener('campus-native', onNative);
  }, []);
  useEffect(() => {
    const mobile = matchMedia('(max-width: 760px)'), update = () => setHelpOpen(!mobile.matches);
    update(); mobile.addEventListener('change', update); return () => mobile.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (selected) detail.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [selected]);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => () => { if (sampleUrl) URL.revokeObjectURL(sampleUrl); }, [sampleUrl]);
  useEffect(() => {
    if (!config?.enabled || !items.some(i => ['queued','processing'].includes(i.status ?? ''))) return;
    const timer = setInterval(() => { if (!document.hidden && !active.current) void refresh().catch(() => {}); }, 7000);
    return () => clearInterval(timer);
  }, [config, items]);

  /**
   * Segundo proceso de la grabación: copia el micrófono en ventanas de 8 a 12 s y las envía para el texto en vivo.
   * El audio completo lo sigue guardando MediaRecorder en este dispositivo; si esto falla, la grabación no se afecta.
   * La copia corre en un AudioWorklet (hilo de audio), que sigue recibiendo muestras con la página en segundo plano.
   */
  function startLive(id: string, courseName: string, recordedAt: string, context: AudioContext, source: MediaStreamAudioSourceNode, recording: () => boolean, continuesId?: string, offsetSeconds = 0) {
    // En una parte nueva, los minutos siguen contando desde el inicio de la clase (reloj real), como en la transcripción unida.
    const windowSamples = LIVE_RATE * LIVE_MAX_SECONDS, minSamples = LIVE_RATE * LIVE_MIN_SECONDS, block = LIVE_RATE / 10, ratio = context.sampleRate / LIVE_RATE;
    let energy = 0, energyCount = 0, samples = new Int16Array(windowSamples), filled = 0, sentSamples = 0, sequence = 0, stopped = false;
    let sum = 0, count = 0, phase = 0, pausedUntil = 0, sending = false, retry: ReturnType<typeof setTimeout> | undefined;
    // Ventanas por enviar. Sin conexión se guardan hasta 30 (unos 5 min); las más antiguas quedan para la transcripción final.
    const queue: { index: number; startMs: number; endMs: number; pcm: Int16Array; tries: number }[] = [];
    const note = (text: string) => { if (alive.current) setLiveNote(text); };
    const started = request('/live/' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ course: courseName, recordedAt, consent: true, ...(continuesId ? { continuesId } : {}) }) }).then(json);
    started.catch(() => { stopped = true; queue.length = 0; note('El texto en vivo no está disponible ahora. Tu grabación continúa en este dispositivo.'); });
    const pump = async () => {
      if (sending || !queue.length) return;
      if (Date.now() < pausedUntil) { clearTimeout(retry); retry = setTimeout(() => void pump(), pausedUntil - Date.now()); return; }
      sending = true;
      const item = queue[0];
      try {
        await started;
        const response = await request(`/live/${id}/audio/${item.index}`, { method: 'POST', headers: { 'content-type': 'audio/wav', 'x-campus-start-ms': String(item.startMs), 'x-campus-end-ms': String(item.endMs) }, body: wavBlob(item.pcm) });
        if (response.status === 429) {
          const value = await response.json().catch(() => ({}));
          pausedUntil = Date.now() + (Number(value.retryAfterSeconds) || 600) * 1000;
          note('El texto en vivo está en pausa por un momento. Tu grabación continúa.');
        } else {
          const value = await json(response);
          queue.shift();
          if (alive.current) {
            setLiveUntil(until => Math.max(until, offsetSeconds + item.endMs / 1000)); setLiveNote('');
            if (value.text) setLiveLines(lines => [...lines, { startSeconds: offsetSeconds + item.startMs / 1000, text: value.text, review: Boolean(value.review) }].sort((x, y) => x.startSeconds - y.startSeconds));
          }
        }
      } catch {
        // Sin conexión o error pasajero: se reintenta con espera creciente; tras 4 intentos la ventana queda para la pasada final.
        if (++item.tries >= 4) queue.shift();
        note(navigator.onLine === false ? 'Sin conexión: guardamos el texto en vivo pendiente y lo enviamos al volver. Tu grabación continúa.' : 'No pudimos enviar un fragmento. Lo reintentamos; tu grabación continúa.');
        pausedUntil = Math.max(pausedUntil, Date.now() + 2000 * 2 ** Math.min(item.tries, 4));
      } finally { sending = false; }
      if (queue.length) void pump();
    };
    const online = () => { pausedUntil = 0; void pump(); };
    window.addEventListener('online', online);
    const flush = () => {
      const pcm = samples.slice(0, filled), startMs = Math.round(sentSamples / LIVE_RATE * 1000), index = sequence++;
      sentSamples += filled; filled = 0;
      if (index > 1100 || stopped) return;
      queue.push({ index, startMs, endMs: Math.round(sentSamples / LIVE_RATE * 1000), pcm, tries: 0 });
      if (queue.length > 30) queue.shift();
      void pump();
    };
    const take = (input: Float32Array) => {
      if (stopped || !recording()) return;
      // Baja a 16 kHz promediando las muestras de cada paso.
      for (let i = 0; i < input.length; i++) {
        sum += input[i]; count++; phase++;
        if (phase < ratio) continue;
        phase -= ratio;
        const value = Math.max(-1, Math.min(1, sum / count));
        samples[filled++] = value * 32767;
        sum = 0; count = 0; energy += value * value; energyCount++;
        // Cada 100 ms se mira si hay pausa; pasados 8 s, la primera pausa cierra la ventana.
        if (energyCount === block) {
          const pause = Math.sqrt(energy / energyCount) < LIVE_PAUSE_RMS;
          energy = 0; energyCount = 0;
          if (pause && filled >= minSamples) { flush(); continue; }
        }
        if (filled === windowSamples) flush();
      }
    };
    const silent = context.createGain(); silent.gain.value = 0; silent.connect(context.destination);
    let node: AudioNode | undefined;
    const legacy = () => {
      const tap = context.createScriptProcessor(4096, 1, 1);
      tap.onaudioprocess = event => take(event.inputBuffer.getChannelData(0));
      source.connect(tap); tap.connect(silent); node = tap;
    };
    if (context.audioWorklet) void context.audioWorklet.addModule('/class-live-worklet.js').then(() => {
      if (stopped) return;
      const tap = new AudioWorkletNode(context, 'class-live-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      tap.port.onmessage = event => take(event.data as Float32Array);
      source.connect(tap); tap.connect(silent); node = tap;
    }).catch(legacy);
    else legacy();
    return () => {
      if (stopped) return;
      if (filled >= LIVE_RATE) flush(); // El último tramo también cuenta si dura al menos 1 s.
      stopped = true; window.removeEventListener('online', online);
      // Lo que quede en la fila se intenta enviar una vez más; lo que no llegue lo cubre la transcripción final.
      void pump().finally(() => clearTimeout(retry));
      try { node?.disconnect(); silent.disconnect(); } catch { /* El contexto ya puede estar cerrado. */ }
    };
  }
  async function askLive() {
    if (!liveId || question.trim().length < 2 || asking) return;
    setAsking(true);
    try {
      const value = await json(await request(`/live/${liveId}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: question.trim() }) }));
      setAnswer({ text: value.text, untilSeconds: value.untilSeconds });
    } catch (e) { setAnswer({ text: errorText(e), untilSeconds: liveUntil }); } finally { if (alive.current) setAsking(false); }
  }

  async function microphone(test: boolean, continuation?: Continuation) {
    if (!owner.current || locked) return;
    if (!test && !continuation && !consent) { setMessage('Confirma que tienes permiso para grabar. El título se genera automáticamente.'); return; }
    if (!test && !continuation && config?.enabled && nativeRecorder()) {
      toNative({ type: 'campus:record:start', meta: { owner: owner.current, title: title.trim() || automaticClassTitle(course, new Date().toISOString()), course: course.trim(), ...courseRef } });
      setMessage(''); return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setMessage('Este navegador no permite grabar. Puedes subir un audio grabado con tu celular.'); return; }
    const expectedOwner = owner.current;
    // El audio recuperado puede ser la única copia completa: primero se descarga o se descarta.
    if (rescue) { setMessage('Descarga o descarta primero el audio recuperado: puede ser la única copia completa de tu clase.'); return; }
    setMode('starting'); active.current = true; setMessage(''); setRescue(null); setSampleUrl(''); setElapsed(0);
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: { ideal: 1 }, echoCancellation: false, noiseSuppression: false, autoGainControl: true }, video: false });
      if (!alive.current || owner.current !== expectedOwner) { input.getTracks().forEach(t => t.stop()); return; }
      stream.current = input;
      const mimeType = recordingMime();
      const capture = new MediaRecorder(input, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
      recorder.current = capture;
      const recordedAt = new Date().toISOString();
      const part = continuation?.part ?? 1, recordCourse = continuation?.course ?? course.trim(), recordCourseRef = continuation?.courseRef ?? courseRef;
      const baseTitle = continuation?.baseTitle ?? (title.trim() || automaticClassTitle(course, recordedAt));
      let record: ClassRecording = { id: crypto.randomUUID(), owner: expectedOwner, title: part > 1 ? `${baseTitle} · parte ${part}`.slice(0, 160) : baseTitle, course: recordCourse, ...recordCourseRef, ...(continuation ? { continuesId: continuation.firstId } : {}), recordedAt, mime: capture.mimeType.split(';')[0] || 'audio/webm', bytes: 0, durationSeconds: 0, parts: 0, state: 'recording' };
      if (!test) await saveClass(record);
      if (continuation) setResume(null);
      // systemStop: el sistema cortó el micrófono. No es un error ni una decisión del estudiante: se guarda y se continúa.
      const chunks: Blob[] = []; let pending = Promise.resolve(), seconds = 0, lastTick = performance.now(), failed = false, systemStop = false;
      let context: AudioContext | undefined, animation = 0, quietSince = performance.now(), lastMeter = 0, stopLive = () => {};
      try {
        context = new AudioContext(); await context.resume();
        const analyser = context.createAnalyser(), source = context.createMediaStreamSource(input); analyser.fftSize = 2048; source.connect(analyser);
        if (!test && config?.liveTranscription) {
          // En una continuación se conserva el texto anterior en pantalla; las preguntas usan la parte actual.
          setLiveId(record.id); setLiveNote(''); setAnswer(null);
          if (!continuation) { setLiveLines([]); setLiveUntil(0); setQuestion(''); }
          stopLive = startLive(record.id, record.course, recordedAt, context, source, () => capture.state === 'recording', continuation?.firstId,
            continuation ? Math.max(0, (Date.parse(recordedAt) - Date.parse(continuation.firstRecordedAt)) / 1000) : 0);
        }
        const values = new Float32Array(analyser.fftSize);
        const meter = () => {
          if (!alive.current) return;
          animation = requestAnimationFrame(meter);
          const now = performance.now();
          if (now - lastMeter < 125) return;
          lastMeter = now;
          analyser.getFloatTimeDomainData(values);
          const rms = Math.sqrt(values.reduce((n, x) => n + x * x, 0) / values.length);
          setLevel(Math.round(Math.min(1, rms * 8) * 100) / 100);
          if (rms > .01) quietSince = performance.now();
          setLow(performance.now() - quietSince > 8000);
        }; meter();
        // Safari pasa el contexto a 'interrupted' en una llamada o al cambiar de app; al volver se reanuda.
        const audioContext = context;
        audioContext.onstatechange = () => { if (audioContext.state !== 'running' && audioContext.state !== 'closed' && document.visibilityState === 'visible') void audioContext.resume().catch(() => {}); };
      } catch { /* Recording still works if an audio meter is unavailable. */ }
      let wake: { release(): Promise<void> } | undefined;
      const keepAwake = () => { if (document.visibilityState === 'visible' && capture.state !== 'inactive') void (navigator as Navigator & { wakeLock?: { request(type: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen').then(lock => { wake = lock; }).catch(() => {}); };
      const visibility = () => {
        if (document.hidden) { if (alive.current) setMessage('Mantén Campus abierto: si bloqueas el celular o cambias de aplicación, el sistema puede pausar el micrófono. Si pasa, guardamos lo grabado y seguimos al volver.'); }
        else { keepAwake(); if (context && context.state !== 'running') void context.resume().catch(() => {}); }
      };
      const tick = () => { const now = performance.now(); if (capture.state === 'recording') seconds += (now - lastTick) / 1000; lastTick = now; if (alive.current) setElapsed(Math.floor(seconds)); if (seconds >= (test ? 10 : MAX_SECONDS) && capture.state !== 'inactive') capture.stop(); };
      const timer = setInterval(tick, 250);
      cleanupAudio.current = () => { stopLive(); clearInterval(timer); cancelAnimationFrame(animation); void context?.close().catch(() => {}); void wake?.release().catch(() => {}); document.removeEventListener('visibilitychange', visibility); input.getTracks().forEach(t => t.stop()); };
      capture.ondataavailable = event => {
        if (!event.data.size) return;
        chunks.push(event.data);
        if (test || failed) return;
        pending = pending.then(async () => {
          const next = { ...record, bytes: record.bytes + event.data.size, parts: record.parts + 1, durationSeconds: seconds, mime: event.data.type.split(';')[0] || record.mime };
          await appendClassAudio(next, event.data, record.parts); record = next;
          if (record.bytes >= MAX_BYTES && capture.state !== 'inactive') capture.stop();
        }).catch(() => { failed = true; if (capture.state !== 'inactive') capture.stop(); });
      };
      capture.onerror = () => { failed = true; if (capture.state !== 'inactive') capture.stop(); };
      capture.onstop = () => {
        // Una sola vez: si ya se retomó la clase en otra parte, no hay que volver a mostrar «inactivo».
        let idled = false;
        const idle = () => { if (!idled && alive.current) { idled = true; setMode('idle'); } };
        cleanupAudio.current(); active.current = false; if (!test) unsaved.current = true;
        if (alive.current) { setMode('saving'); setLevel(0); setLow(false); }
        void pending.then(async () => {
          const blob = new Blob(chunks, { type: record.mime });
          if (test) { if (alive.current && owner.current === expectedOwner) { setSampleUrl(URL.createObjectURL(blob)); setMessage('Escucha la prueba: comprueba que se entiendan las palabras del profesor desde tu asiento.'); } }
          else {
            record = { ...record, state: failed ? 'interrupted' : 'saved', durationSeconds: Math.min(MAX_SECONDS, Math.max(.1, seconds)) };
            await saveClass(record).catch(() => { failed = true; });
            if (!failed) unsaved.current = false;
            if (alive.current && owner.current === expectedOwner) {
              if (failed) { setRescue(blob); setMessage('Se interrumpió el guardado. Descarga el audio recuperado antes de cerrar esta página.'); }
              else if (systemStop) {
                setResume({ firstId: continuation?.firstId ?? record.id, firstRecordedAt: continuation?.firstRecordedAt ?? record.recordedAt, baseTitle, part: part + 1, course: recordCourse, courseRef: recordCourseRef, tried: false });
                setMessage(`El sistema pausó el micrófono a los ${clockLabel(seconds)}. Guardamos esa parte y seguimos grabando la misma clase en cuanto vuelvas a Campus.`);
                // Se puede retomar ya: la parte guardada se sube en segundo plano, sin hacer esperar a la parte siguiente.
                idle();
              }
              else setMessage('Clase guardada en este dispositivo. Puedes sincronizarla con tu cuenta para transcribirla.');
              await refresh();
              if (!failed && config?.transcriptionLive) { if (systemStop) void sync(record); else await sync(record); }
            }
          }
        }).catch(e => { if (alive.current) setMessage(errorText(e)); }).finally(idle);
      };
      input.getAudioTracks().forEach(track => {
        track.onended = () => { systemStop = !test; if (capture.state !== 'inactive') capture.stop(); };
        // Silenciado por el sistema (por ejemplo, una llamada): la grabación sigue y registra silencio mientras dure.
        track.onmute = () => { if (alive.current && capture.state !== 'inactive') setMessage('El sistema silenció el micrófono por un momento. Seguimos grabando; esa parte quedará en silencio.'); };
        track.onunmute = () => { if (alive.current && capture.state !== 'inactive') setMessage(''); };
      });
      document.addEventListener('visibilitychange', visibility);
      capture.start(5000); keepAwake(); if (alive.current) setMode(test ? 'testing' : 'recording');
      if (continuation && alive.current) setMessage(`Seguimos grabando la misma clase en la parte ${part}. La parte anterior quedó guardada.`);
      // A persistent-storage grant reduces automatic eviction; the browser can decline it.
      void navigator.storage?.persist?.().catch(() => {});
    } catch (e) {
      cleanupAudio.current(); stream.current?.getTracks().forEach(t => t.stop()); active.current = false;
      if (alive.current) { setMode('idle'); setMessage(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Permite el micrófono en este navegador o sube un audio que ya hayas grabado.' : errorText(e)); }
    }
  }

  microphoneRef.current = microphone;
  refreshRef.current = () => refresh();
  // Al volver a Campus tras una interrupción, la grabación continúa sola una vez; si el navegador lo impide, queda el botón.
  useEffect(() => {
    if (!resume || resume.tried || mode !== 'idle') return;
    const attempt = () => {
      if (document.visibilityState !== 'visible') return;
      setResume(current => current && { ...current, tried: true });
      void microphoneRef.current(false, resume);
    };
    attempt();
    document.addEventListener('visibilitychange', attempt);
    return () => document.removeEventListener('visibilitychange', attempt);
  }, [resume, mode]);

  async function importAudio(file?: File) {
    if (!file || !owner.current) return;
    if (!consent) { setMessage('Confirma que tienes permiso para guardar este audio.'); return; }
    const mime = file.type.split(';')[0] || ({ m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg', mp4: 'video/mp4' } as Record<string, string>)[file.name.split('.').pop()?.toLowerCase() ?? ''];
    if (!mime || !['audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/x-wav','audio/x-m4a','video/mp4'].includes(mime) || file.size > MAX_BYTES || !file.size) { setMessage('Elige un audio M4A, MP3, WAV, WebM, Ogg o MP4 de hasta 96 MB.'); return; }
    setBusy(true); setMessage('Comprobando el archivo…');
    try {
      const duration = await new Promise<number>(resolve => {
        const player = document.createElement('audio'), url = URL.createObjectURL(file);
        const done = () => { clearTimeout(timeout); URL.revokeObjectURL(url); player.removeAttribute('src'); player.load(); };
        const timeout = setTimeout(() => { done(); resolve(NaN); }, 5000);
        player.onloadedmetadata = () => { const value = player.duration; done(); resolve(value); }; player.onerror = () => { done(); resolve(NaN); }; player.src = url;
      });
      const seconds = Number.isFinite(duration) ? duration : Number(uploadMinutes) * 60;
      if (!seconds || seconds <= 0 || seconds > MAX_SECONDS) throw new Error('Indica la duración del audio en minutos (hasta 180) si el navegador no puede leerla.');
      const recordedAt = new Date(file.lastModified).toISOString();
      const record: ClassRecording = { id: crypto.randomUUID(), owner: owner.current, title: title.trim() || automaticClassTitle(course, recordedAt), course: course.trim(), ...courseRef, recordedAt, mime, bytes: file.size, durationSeconds: seconds, parts: 1, state: 'saved' };
      await appendClassAudio(record, file, 0); await refresh(); setMessage('Audio guardado en este dispositivo. Ya puedes sincronizarlo.');
    } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  }

  async function classBlob(item: ClassRecording, variant: 'original' | 'clean' = 'original') {
    if (variant === 'original' && item.parts) return localClassAudio(item);
    const source = variant === 'clean' ? item.enhancedAudio : item;
    if (!source) throw new Error('No está disponible la versión de voz limpia.');
    const parts: BlobPart[] = [];
    for (let index = 0; index < Math.ceil(source.bytes / (config?.partBytes ?? 1048576)); index++) {
      const response = await request(`/${item.id}/${variant === 'clean' ? 'clean-parts' : 'parts'}/${index}`);
      if (!response.ok) { await json(response); throw new Error('No se pudo descargar el audio.'); }
      parts.push(await response.arrayBuffer());
    }
    return new Blob(parts, { type: source.mime });
  }
  async function select(item: ClassRecording, announce = false) {
    setBusy(true); setMessage('');
    try {
      let current = item, offline = false;
      // Sin conexión o con la cuenta caída, una clase con copia en este dispositivo se abre igual; el texto de la cuenta es un extra.
      if (item.cloud) {
        try { current = { ...item, ...(await json(await request('/' + item.id))).recording, owner: item.owner, parts: item.parts }; }
        catch (e) { if (!item.parts) throw e; offline = true; }
      }
      const version = 'original';
      playbackPosition.current = null;
      const blob = await classBlob(current, version);
      // Si la clase tiene varias partes en tu cuenta, se muestra su transcripción unida.
      const group = partsOf(item);
      const joined = !offline && group.length > 1 && group.every(p => p.cloud) ? await json(await request(`/${item.id}/full`)).catch(() => null) as FullClass | null : null;
      setFull(joined); setPlayingPart(item.id);
      openClass.current = { firstId: item.continuesId ?? item.id, statuses: Object.fromEntries(group.map(p => [p.id, p.id === item.id ? current.status : p.status])) };
      setAudioVersion(version); setAudioUrl(URL.createObjectURL(blob)); setSelected(current);
      if (announce) setMessage('Tu transcripción está lista. Revisa el texto junto al audio.');
      else if (offline) setMessage('No pudimos conectar con tu cuenta: abrimos la copia de este dispositivo. El texto aparecerá cuando vuelva la conexión.');
    } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  }
  /** Partes que aún falta subir o transcribir: el botón de la clase depende de todas, no solo de la primera. */
  const pendingParts = (group: ClassRecording[]) => group.filter(p => !['ready','queued','processing'].includes(p.status ?? ''));
  const canSync = (p: ClassRecording) => Boolean(p.bytes) && (p.attempts ?? 0) < 3;
  /** Partes de una clase interrumpida, en orden; una clase normal es su única parte. */
  function partsOf(item: ClassRecording) {
    const first = item.continuesId ?? item.id;
    return items.filter(i => i.id === first || i.continuesId === first).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  }
  /** Lleva el reproductor al minuto de un segmento, cambiando de parte si hace falta. */
  async function playSegment(segment: { startSeconds: number; partId?: string; partSeconds?: number }) {
    const target = segment.partSeconds ?? segment.startSeconds;
    if (segment.partId && segment.partId !== playingPart) {
      const part = items.find(i => i.id === segment.partId);
      if (!part) return;
      setBusy(true);
      try { const blob = await classBlob(part, 'original'); playbackPosition.current = target; autoplay.current = true; setAudioVersion('original'); setPlayingPart(part.id); setAudioUrl(URL.createObjectURL(blob)); }
      catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
      return;
    }
    if (audio.current) { audio.current.currentTime = target; void audio.current.play().catch(() => {}); }
  }
  async function changeAudio(version: 'original' | 'clean') {
    if (!selected) return;
    setBusy(true);
    // En una clase con partes, la versión cambia para la parte que se está escuchando, no para la primera.
    const part = items.find(i => i.id === playingPart) ?? selected;
    try { const position = audio.current?.currentTime ?? 0; const blob = await classBlob(part.id === selected.id ? selected : part, version); playbackPosition.current = position; setAudioVersion(version); setAudioUrl(URL.createObjectURL(blob)); }
    catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  }
  async function improveTranscript(item: ClassRecording) {
    setBusy(true);
    try {
      await json(await request(`/${item.id}/retranscribe`, { method: 'POST' }));
      awaitingTranscript.current = item.id;
      setMessage('Estamos preparando otra transcripción. Conservamos el audio original y la versión anterior.');
      await refresh();
    } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  }
  async function sync(item: ClassRecording) {
    setBusy(true); setMessage('Sincronizando el audio…');
    try {
      if (!config?.enabled || item.owner !== owner.current) throw new Error('No está disponible el guardado en tu cuenta. Conserva la copia local.');
      let remote;
      if (!item.cloud || item.cloud === 'draft') {
        const blob = await localClassAudio(item);
        if (!blob.size || blob.size > config.maxBytes) throw new Error('El audio está vacío o supera los 96 MB. Descarga el original.');
        const metadata = { id: item.id, title: item.title, course: item.course, ...(item.courseId ? { courseId: item.courseId, courseSource: item.courseSource } : {}), ...(item.continuesId ? { continuesId: item.continuesId } : {}), recordedAt: item.recordedAt, mime: item.mime, bytes: blob.size, durationSeconds: item.durationSeconds, partCount: Math.ceil(blob.size / config.partBytes), consent: true };
        remote = (await json(await request('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(metadata) }))).recording;
        for (let index = 0; index < metadata.partCount; index++) {
          if (remote.uploadedParts.includes(index)) continue;
          await json(await request(`/${item.id}/parts/${index}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: blob.slice(index * config.partBytes, (index + 1) * config.partBytes) }));
          setMessage(`Sincronizando audio: ${Math.round((index + 1) / metadata.partCount * 100)} %`);
        }
      }
      if (config.transcribing) { await json(await request(`/${item.id}/transcribe`, { method: 'POST' })); if (config.transcriptionLive) awaitingTranscript.current = item.id; setMessage('Audio recibido. Estamos generando la transcripción en español.'); }
      else setMessage('Audio guardado en tu cuenta. La transcripción aún no está habilitada.');
      if (item.parts) await saveClass({ ...item, cloud: 'draft' });
      await refresh();
    } catch (e) { setMessage(errorText(e) + ' Tu copia local se conserva; puedes volver a sincronizar.'); } finally { setBusy(false); }
  }
  async function remove(item: ClassRecording) {
    setBusy(true);
    try {
      // Always check the server, including a partially uploaded recording after a failed connection.
      // Una clase interrumpida se elimina con todas sus partes.
      const parts = partsOf(item);
      if (!config?.readable && parts.some(p => p.cloud)) throw new Error('No pudimos comprobar el borrado en tu cuenta. Vuelve a intentarlo cuando el servicio esté disponible.');
      // Primero en la cuenta, todas las partes: si una falla, no se borra nada del dispositivo y se puede reintentar entera.
      // Una parte que nunca se subió responde 404: no hay nada que borrar allá.
      if (config?.readable) for (const part of parts) { const response = await request('/' + part.id, { method: 'DELETE' }); if (response.status !== 404) await json(response); }
      for (const part of parts) if (part.parts !== undefined) await deleteLocalClass(part);
      if (selected && partsOf(item).some(p => p.id === selected.id)) { setSelected(null); setFull(null); setAudioUrl(''); }
      setDeleteId(''); await refresh(); setMessage(config?.readable ? 'Clase eliminada de este dispositivo y de tu cuenta.' : 'Copia local eliminada. El servicio no está disponible para comprobar si hay una copia en tu cuenta.');
    } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  }

  return <div className="classes" data-class-recorder data-recording={locked} data-signed-out={!loading && !config?.authenticated}>
    <header className="classes-heading"><span className="classes-eyebrow">Tus clases, a tu ritmo</span><h1><span className="classes-heading-full">Graba hoy. Repasa después.</span><span className="classes-heading-mobile">Tus clases, contigo.</span></h1><p>Elige tu curso, graba y vuelve a escuchar lo que necesitas.</p></header>
    {config?.preview && <p className="classes-review-note" role="note"><strong>Prueba local.</strong> {config.transcriptionLive ? 'Transcripción real en español. Los cursos de la demo son de ejemplo.' : 'Grabación y guardado reales; transcripción simulada.'}</p>}
    {loading ? <p role="status">Comprobando tu cuenta…</p> : !config?.authenticated ? <SignedOutClasses message={message} /> : <>
      <div className="classes-grid">
        <section className={`classes-card${locked ? " classes-card--capturing" : ""}`} aria-labelledby="new-class-title">
          <div className="classes-card-heading" hidden={locked}><CharacterGreeting size={72} className="classes-card-campito" /><div><span className="classes-eyebrow">Clase presencial</span><h2 id="new-class-title">Grabar una clase</h2><p className="classes-card-lede">Campito escucha contigo y deja el texto listo para repasar.</p></div></div>
          {locked && <div className="classes-record-summary"><strong>{course || 'Clase presencial'}</strong><time aria-label="Tiempo grabado">{clockLabel(elapsed)}</time></div>}
          <fieldset disabled={locked || busy} className="classes-fields" hidden={locked}>
            <label className="classes-course-choice"><span className="classes-field-label">Curso <span>(opcional)</span></span><select value={courseId} onChange={e => { setCourseId(e.target.value); setCourse(courses.find(c => c.id === e.target.value)?.name.slice(0, 160) ?? ''); }} aria-describedby="class-course-source"><option value="">{coursesLoading ? 'Cargando tus cursos…' : 'Elegir de mis cursos'}</option>{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="manual">Escribir otro curso</option></select></label>
            {courseId === 'manual' && <label>Nombre del curso<input value={course} onChange={e => setCourse(e.target.value)} maxLength={160} placeholder="Ej. Marketing" autoComplete="off" /></label>}
            <details className="classes-optional-title"><summary><span>{title.trim() ? 'Título propio' : 'Nombre automático'}</span><span className="classes-title-change">Cambiar título</span></summary><p className="classes-auto-title">Usamos el curso y la fecha. Puedes añadir un título propio.</p><label>Título de la clase<input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} placeholder="Se genera automáticamente" autoComplete="off" /></label></details>
            <label className="classes-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Tengo permiso para grabar y guardar esta clase.</label>
          </fieldset>
          {locked && <div className="classes-live" data-mode={mode} data-paused={mode === 'paused' || native?.status === 'interrupted'}><CampitoListening level={nativeActive ? 0 : level} native={nativeActive} paused={mode === 'paused' || native?.status === 'interrupted'} /><strong className="classes-timer">{clockLabel(elapsed)}</strong><span className="classes-live-state">{mode === 'testing' ? 'Prueba de 10 segundos' : mode === 'paused' ? 'En pausa' : mode === 'starting' ? 'Abriendo micrófono…' : mode === 'saving' ? 'Guardando audio…' : native?.status === 'interrupted' ? 'Clase en pausa por el sistema' : 'Grabando tu clase'}</span>{nativeActive && native ? <small>{native.status === 'interrupted' ? 'Micrófono interrumpido. Seguimos grabando la misma clase en cuanto el teléfono lo devuelva.' : <><strong className="classes-native-reassurance">Puedes bloquear el celular: la grabación sigue.</strong>Parte {native.part}.</>} {native.uploads.pending ? `${native.uploads.pending} parte(s) por subir.` : ''}{native.uploads.error ? ` ${native.uploads.error}` : ''}</small> : <><LevelBars level={level} active={mode === 'recording' || mode === 'testing'} /><meter className="classes-sr-only" min={0} max={1} value={level} aria-label="Nivel del micrófono" /><small>{low ? 'Señal baja. Comprueba que se escuche al profesor.' : 'El nivel indica volumen, no precisión del reconocimiento.'}</small></>}</div>}
          <div className={`classes-actions classes-record-actions${locked ? " classes-record-actions--active" : ""}`} data-mode={mode} data-paused={mode === 'paused' || native?.status === 'interrupted'}>
            {locked && <span className="classes-controls-time">{mode === 'paused' || native?.status === 'interrupted' ? 'En pausa' : mode === 'testing' ? 'Prueba de micrófono' : mode === 'starting' ? 'Abriendo micrófono' : mode === 'saving' ? 'Guardando audio' : 'Grabación'} · {clockLabel(elapsed)}</span>}
            {!locked && device === 'native' && !config.enabled ? <div className="classes-ios" role="note"><strong>Grabar desde la app se activará pronto en tu cuenta.</strong><p>Cuando esté lista, la app seguirá grabando aunque bloquees el celular.</p></div>
            : !locked && device === 'ios' ? <div className="classes-ios" role="note">
              <strong>Grabar desde iPhone llega pronto.</strong>
              <p>Mientras tanto, graba con <b>Notas de voz</b>: sigue grabando aunque bloquees el iPhone o recibas una llamada. Al terminar, súbela aquí y Campus la transcribe.</p>
              <ol>
                <li>Al empezar la clase, abre Notas de voz y toca el botón rojo.</li>
                <li>Al terminar, abre la grabación, toca Compartir y elige <b>Guardar en Archivos</b>.</li>
                <li>Vuelve aquí, marca el permiso de arriba y elige ese audio.</li>
              </ol>
              <label className="classes-ios-minutes">Duración en minutos <span>(solo si no la detectamos)</span><input type="number" min="1" max="180" inputMode="numeric" value={uploadMinutes} onChange={e => setUploadMinutes(e.target.value)} disabled={busy} /></label>
              <label className={`app-button classes-ios-upload${busy || !consent ? ' is-disabled' : ''}`}>Subir audio de Notas de voz<input type="file" accept="audio/*,.m4a" disabled={busy || !consent} aria-describedby={consent ? undefined : 'classes-ios-consent'} onChange={e => { void importAudio(e.target.files?.[0]); e.target.value = ''; }} /></label>
              {!consent && <small id="classes-ios-consent">Marca primero el permiso de arriba para poder subir el audio.</small>}
              <small>Si el archivo pasa de 96 MB, en Ajustes › Notas de voz › Calidad del audio elige «Comprimida».</small>
            </div>
            : !locked ? <><button className="app-button classes-record-button" disabled={busy || !consent} aria-describedby={!consent ? 'classes-record-reason' : undefined} onClick={() => void microphone(false)}><span className="classes-rec-dot" aria-hidden="true" />Grabar clase</button>{!consent && <small className="classes-record-reason" id="classes-record-reason">Marca el permiso para grabar.</small>}<button className="app-button app-button--secondary" disabled={busy} onClick={() => void microphone(true)}>Probar micrófono</button>{device === 'android' && <small className="classes-device-note">Pronto: la app de Campus para grabar con la pantalla apagada. Por ahora, mantén Campus abierto mientras grabas.</small>}</> : <>
              {['recording','paused'].includes(mode) && !nativeActive && <button className="app-button app-button--secondary" onClick={() => { const r = recorder.current; if (!r) return; if (r.state === 'recording') { r.pause(); setMode('paused'); } else if (r.state === 'paused') { r.resume(); setMode('recording'); } }}>{mode === 'paused' ? 'Continuar' : 'Pausar'}</button>}
              <button className="app-button" disabled={['starting','saving'].includes(mode)} onClick={() => { if (nativeActive) toNative({ type: 'campus:record:stop' }); else if (recorder.current?.state !== 'inactive') recorder.current?.stop(); }}>{config.transcriptionLive && mode !== 'testing' ? 'Detener y transcribir' : 'Detener y guardar'}</button>
            </>}
          </div>
          <details className="classes-record-info" hidden={locked}><summary>Sobre tus cursos y el audio</summary><div className="classes-course-source" id="class-course-source"><span>{coursesLoading ? 'Buscando los cursos de tu cuenta…' : courseStatus}</span>{!coursesLoading && <button type="button" disabled={busy} onClick={() => void loadCourses()}>Actualizar cursos</button>}</div>{config.model === 'elevenlabs/scribe_v2' && <p className="classes-provider-note">La transcripción se procesa con ElevenLabs en español.{config.audioEnhancement ? config.audioEnhancementMethod === 'voice_leveling' ? ' También preparamos una versión con volumen nivelado que conserva las voces y el ambiente.' : ' También preparamos una copia con limpieza intensa para escuchar.' : ''} El audio original se conserva.</p>}</details>
          {resume && !locked && <div className="classes-resume" role="status"><strong>La clase sigue en curso</strong><p>Guardamos lo grabado. Toca continuar para seguir en la parte {resume.part} de la misma clase.</p><div className="classes-actions"><button className="app-button" disabled={busy} onClick={() => void microphone(false, resume)}>● Continuar grabación</button><button className="app-button app-button--secondary" onClick={() => { setResume(null); setMessage('Grabación terminada. Las partes quedaron guardadas en Mis clases.'); }}>Terminar aquí</button></div></div>}
          {liveId && <section className="classes-livetext" aria-labelledby="class-live-title">
            <div className="classes-livetext-heading"><strong id="class-live-title">Texto en vivo</strong><span>{liveUntil ? `Transcrito hasta ${clockLabel(liveUntil)}` : locked ? 'Esperando los primeros segundos…' : 'Sin texto en vivo'}</span></div>
            {liveLines.length > 0 && <ol className="classes-livetext-lines">{liveLines.slice(-4).map(line => <li key={line.startSeconds}><span>{clockLabel(line.startSeconds)}</span><p>{line.text}</p></li>)}</ol>}
            {liveNote && <p className="classes-note">{liveNote}</p>}
            {config.liveQuestions && <form className="classes-liveask" onSubmit={e => { e.preventDefault(); void askLive(); }}>
              <label>Pregunta sobre lo que va de la clase<input value={question} onChange={e => setQuestion(e.target.value)} maxLength={1400} placeholder="Ej. ¿Qué dijo sobre el trabajo parcial?" autoComplete="off" /></label>
              <button className="app-button app-button--secondary" disabled={asking || !liveUntil || question.trim().length < 2}>{asking ? 'Buscando en la clase…' : 'Preguntar'}</button>
            </form>}
            {answer && <div className="classes-liveanswer" role="status"><p>{answer.text}</p><small>Respuesta con lo transcrito hasta el minuto {clockLabel(answer.untilSeconds)}. Es texto automático y provisional: confirma fechas e indicaciones con tu docente.</small></div>}
            <p className="classes-note">El texto en vivo es provisional. Al detener, la clase completa se vuelve a transcribir con más cuidado.</p>
          </section>}
          {sampleUrl && <div className="classes-sample"><strong>Escucha tu prueba</strong><audio controls src={sampleUrl} preload="metadata" /></div>}
          {!locked && device !== 'ios' && <><p className="classes-note">Prueba el micrófono desde tu asiento. Cuanto más clara llegue la voz, mejor será el texto. {nativeRecorder() && config.enabled ? 'En la app puedes bloquear el celular o guardarlo: la clase se graba por partes y se sube sola.' : 'Mantén la página abierta y la pantalla encendida al grabar.'}</p>
          <details className="classes-import"><summary>Ya tengo un audio grabado</summary><label>Duración en minutos <span>(si el navegador no la detecta)</span><input type="number" min="1" max="180" value={uploadMinutes} onChange={e => setUploadMinutes(e.target.value)} disabled={locked || busy} /></label><label className="classes-file">Elegir audio<input type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.mp4" disabled={locked || busy || !consent} onChange={e => { void importAudio(e.target.files?.[0]); e.target.value = ''; }} /></label><p className="classes-note">Hasta 3 horas y 96 MB. M4A, MP3, WAV, WebM, Ogg o MP4.</p></details></>}
        </section>
        <aside className="classes-help"><details open={helpOpen} onToggle={e => setHelpOpen(e.currentTarget.open)}><summary>Consejos para grabar mejor</summary><div className="classes-help-content"><span className="classes-eyebrow">Antes de empezar</span><h2>Si lo escuchas bien,<br />podrás repasarlo mejor.</h2><ol><li><strong>Haz una prueba desde tu asiento.</strong><p>Escúchala con audífonos. Si no entiendes las palabras, acerca el micrófono al profesor.</p></li><li><strong>Guarda la clase.</strong><p>El audio se conserva en este navegador. Sincronízalo para tener una copia privada en tu cuenta.</p></li><li><strong>Revisa el texto junto al audio.</strong><p>La transcripción automática puede equivocarse, especialmente con ruido, distancia o términos del curso.</p></li></ol><p className="classes-storage">{config.enabled ? config.transcribing ? 'Transcripción en español disponible al sincronizar.' : 'Guardado en tu cuenta disponible. La transcripción aún no está habilitada.' : 'Por ahora, el audio se guarda solo en este dispositivo. El guardado en tu cuenta aún no está habilitado.'}</p><p className="classes-note">El navegador puede borrar su almacenamiento. Descarga una copia o sincroniza antes de limpiar los datos del sitio.</p></div></details><p className="classes-mcp-note"><strong>También en tu IA.</strong> Al sincronizar, tus clases quedan asociadas a tu cuenta Campus. Cuando el texto esté listo, podrás consultarlo desde el MCP.</p></aside>
      </div>
      <div className="classes-message" role="status" aria-live="polite">{message}</div>
      {rescue && <div className="classes-actions"><button className="app-button" onClick={() => { download(rescue, `clase-recuperada.${extension(rescue.type)}`); unsaved.current = false; setRescue(null); }}>Descargar audio recuperado</button><button className="app-button app-button--secondary" onClick={() => { if (confirm('¿Descartar el audio recuperado? No se podrá recuperar.')) { unsaved.current = false; setRescue(null); } }}>Descartar</button></div>}
      <ClassesSurvey hasReadyClass={items.some(item => item.status === 'ready')} recording={locked} />
      <section className="classes-library" aria-labelledby="my-classes-title"><div className="classes-library-heading"><h2 id="my-classes-title">Mis clases</h2><button className="app-button app-button--secondary" disabled={busy || locked} onClick={() => void refresh().catch(e => setMessage(errorText(e)))}>Actualizar</button></div>
        {!items.length ? <EmptyClasses /> : <ul className="classes-list">{items.filter(item => !item.continuesId || !items.some(i => i.id === item.continuesId)).map(item => { const group = partsOf(item); return <li key={item.id}><div className="classes-item-main"><h3>{item.title}</h3><p>{item.course ? item.course + ' · ' : ''}{new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' }).format(new Date(item.recordedAt))} · {clockLabel(group.reduce((n, p) => n + p.durationSeconds, 0))}{group.length > 1 ? ` · ${group.length} partes` : ''}</p>{['draft', 'queued', 'processing'].includes(item.status ?? '') ? <TranscriptionSteps status={item.status} /> : <span className="classes-badge" data-status={item.status ?? item.state}>{item.status ? statusLabel[item.status] : item.state === 'interrupted' ? 'Grabación interrumpida · Revisa el audio' : 'Guardada en este dispositivo'}</span>}</div><div className="classes-item-actions"><button className="app-button" disabled={busy || locked || !item.bytes} onClick={() => void select(item)}>Abrir</button>{config.enabled && pendingParts(group).length > 0 && <button className="app-button app-button--secondary" disabled={busy || locked || !pendingParts(group).some(canSync)} onClick={() => void (async () => { for (const part of pendingParts(group)) if (canSync(part)) await sync(part); })()}>{pendingParts(group).some(p => p.status === 'failed') ? 'Reintentar transcripción' : config.transcribing ? 'Transcribir clase' : 'Sincronizar'}</button>}{config.model === 'elevenlabs/scribe_v2' && item.status === 'ready' && item.transcriptionModel !== config.model && <button className="app-button app-button--secondary" disabled={busy || locked || (item.attempts ?? 0) >= 3} onClick={() => void improveTranscript(item)}>Mejorar transcripción</button>}<button className="classes-delete" disabled={busy || locked} onClick={() => setDeleteId(item.id)}>Eliminar</button>{deleteId === item.id && <div className="classes-confirm"><span>{group.length > 1 ? `Se eliminarán el audio y el texto de las ${group.length} partes de esta clase.` : 'Se eliminarán el audio y el texto de esta clase.'}</span><button className="app-button app-button--secondary" disabled={busy} onClick={() => setDeleteId('')}>Cancelar</button><button className="app-button" disabled={busy} onClick={() => void remove(item)}>Sí, eliminar</button></div>}</div></li>; })}</ul>}
      </section>
      <NotesBoundary><UClassNotes key={config.owner ?? ''} /></NotesBoundary>
      {selected && <section ref={detail} className="classes-card classes-detail" aria-labelledby="class-detail-title"><div className="classes-library-heading"><h2 id="class-detail-title">{selected.title}</h2><button className="classes-delete" onClick={() => { setSelected(null); setFull(null); setAudioUrl(''); }}>Cerrar</button></div>{selected.enhancedAudio && <div className="classes-audio-versions" role="group" aria-label="Versión del audio"><button type="button" disabled={busy} aria-pressed={audioVersion === 'original'} onClick={() => void changeAudio('original')}>Original</button><button type="button" disabled={busy} aria-pressed={audioVersion === 'clean'} onClick={() => void changeAudio('clean')}>{selected.enhancedAudio.method === 'voice_leveling' ? 'Voz nivelada' : 'Limpieza intensa'}</button></div>}<audio ref={audio} controls src={audioUrl} preload="metadata" onLoadedMetadata={() => { if (audio.current && playbackPosition.current !== null) { audio.current.currentTime = Math.min(playbackPosition.current, Number.isFinite(audio.current.duration) ? audio.current.duration : playbackPosition.current); playbackPosition.current = null; } if (audio.current && autoplay.current) { autoplay.current = false; void audio.current.play().catch(() => {}); } }} />{selected.enhancedAudio && <p className="classes-note">{selected.enhancedAudio.method === 'voice_leveling' ? 'Texto reconocido a partir del original. La voz nivelada ajusta el volumen y conserva el ruido ambiente para proteger las voces lejanas.' : 'Texto reconocido a partir del original. La limpieza intensa puede eliminar voces lejanas. Escucha el original si falta algo.'}</p>}<div className="classes-actions"><button className="app-button app-button--secondary" disabled={busy} onClick={() => {
          // En una clase con partes se descarga la parte que se está escuchando.
          const group = partsOf(selected), part = group.find(p => p.id === playingPart) ?? selected, n = group.findIndex(p => p.id === part.id) + 1;
          void classBlob(part).then(blob => download(blob, `clase${group.length > 1 ? `-parte-${n}` : ''}.${extension(part.mime)}`)).catch(e => setMessage(errorText(e)));
        }}>{partsOf(selected).length > 1 ? `Descargar parte ${partsOf(selected).findIndex(p => p.id === playingPart) + 1 || 1}` : 'Descargar audio original'}</button>{selected.enhancedAudio && <button className="app-button app-button--secondary" disabled={busy} onClick={() => { void classBlob(selected, 'clean').then(blob => download(blob, selected.enhancedAudio?.method === 'voice_leveling' ? 'clase-voz-nivelada.mp3' : 'clase-limpieza-intensa.mp3')).catch(e => setMessage(errorText(e))); }}>{selected.enhancedAudio.method === 'voice_leveling' ? 'Descargar voz nivelada' : 'Descargar limpieza intensa'}</button>}{(full || selected.transcript) && <button className="app-button app-button--secondary" onClick={() => download(new Blob([selected.title + '\n' + (full?.segments ?? selected.transcript!.segments).map(s => `[${clockLabel(s.startSeconds)}] ${s.text || '[Sin palabras reconocidas: revisar audio]'}`).join('\n\n')], { type: 'text/plain;charset=utf-8' }), 'transcripcion.txt')}>Descargar texto</button>}</div>
        {!full && selected && partsOf(selected).length > 1 && <><p className="classes-review-note">Clase en {partsOf(selected).length} partes: la grabación se cortó y siguió. {config?.transcribing ? 'Transcríbelas para ver el texto unido.' : 'Cada parte está guardada en este dispositivo.'}</p><div className="classes-parts" role="group" aria-label="Audio de cada parte">{partsOf(selected).map((p, i) => <button key={p.id} type="button" disabled={busy || !p.bytes} aria-pressed={playingPart === p.id} onClick={() => void playSegment({ startSeconds: 0, partId: p.id, partSeconds: 0 })}>Parte {i + 1} · {clockLabel(p.durationSeconds)}</button>)}</div></>}
        {full && <><p className="classes-review-note">Clase en {full.parts.length} partes: la grabación se cortó y siguió. {full.parts.some(p => p.status !== 'ready') ? `Faltan transcribir ${full.parts.filter(p => p.status !== 'ready').length} parte(s); aparecerán aquí al terminar. ` : ''}Los minutos cuentan desde el inicio de la clase.</p><div className="classes-parts" role="group" aria-label="Audio de cada parte">{full.parts.map((p, i) => <button key={p.id} type="button" disabled={busy} aria-pressed={playingPart === p.id} onClick={() => void playSegment({ startSeconds: 0, partId: p.id, partSeconds: 0 })}>Parte {i + 1} · {clockLabel(p.offsetSeconds)}</button>)}</div></>}
        {full ? <div className="classes-transcript">{[...full.segments.map(s => ({ kind: 'segment' as const, at: s.startSeconds, s })), ...full.gaps.map(g => ({ kind: 'gap' as const, at: g.fromSeconds, g }))].sort((a, b) => a.at - b.at).map((entry, index) => entry.kind === 'gap'
          ? <p key={'gap' + index} className="classes-gap">Sin audio de {clockLabel(entry.g.fromSeconds)} a {clockLabel(entry.g.toSeconds)}: la grabación estuvo detenida.</p>
          : <div key={index} className={entry.s.review ? 'classes-segment needs-review' : 'classes-segment'}><button aria-label={`Escuchar desde ${clockLabel(entry.s.startSeconds)}`} onClick={() => void playSegment(entry.s)}>{clockLabel(entry.s.startSeconds)}</button><div>{entry.s.review && <span className="classes-review-label">Revisar audio</span>}<p>{entry.s.text || 'Sin palabras reconocidas. Puede ser silencio o voz que no se alcanzó a captar.'}</p></div></div>)}</div>
        : selected.transcript ? <><p className="classes-review-note">Transcripción automática en español. Revisa nombres, fórmulas y términos del curso escuchando el audio. Los tiempos corresponden a fragmentos, no a cada palabra.</p><div className="classes-transcript">{selected.transcript.segments.map((segment, index) => <div key={index} className={segment.review ? 'classes-segment needs-review' : 'classes-segment'}><button aria-label={`Escuchar desde ${clockLabel(segment.startSeconds)}`} onClick={() => void playSegment({ startSeconds: segment.startSeconds, partId: selected.id, partSeconds: segment.startSeconds })}>{clockLabel(segment.startSeconds)}</button><div>{segment.review && <span className="classes-review-label">Revisar audio</span>}<p>{segment.text || 'Sin palabras reconocidas. Puede ser silencio o voz que no se alcanzó a captar.'}</p></div></div>)}</div><p className="classes-note">Reconocimiento: {selected.transcript.model === 'groq/whisper-large-v3-turbo+openai/gpt-transcribe' ? <><a href="https://console.groq.com/docs/speech-to-text" target="_blank" rel="noopener noreferrer">Whisper Large v3 Turbo en Groq · Español</a>. Los tramos dudosos se volvieron a reconocer con <a href="https://platform.openai.com/docs/guides/speech-to-text" target="_blank" rel="noopener noreferrer">OpenAI gpt-transcribe</a>.</> : selected.transcript.model === 'elevenlabs/scribe_v2' ? <a href="https://elevenlabs.io/docs/overview/capabilities/speech-to-text" target="_blank" rel="noopener noreferrer">ElevenLabs Scribe v2 · Español</a> : <><a href="https://huggingface.co/nvidia/stt_es_conformer_transducer_large" target="_blank" rel="noopener noreferrer">NVIDIA Conformer-Transducer Large (es)</a>, licencia CC BY 4.0.</>}</p></> : <p className="classes-note">{selected.cloud ? statusLabel[selected.status ?? 'draft'] : 'Sincroniza esta clase para solicitar su transcripción.'}</p>}
      </section>}
    </>}
  </div>;
}
