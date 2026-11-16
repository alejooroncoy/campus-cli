import { useEffect, useRef, useState } from 'react';
import { clock, duration, highlight, limaDate, sessionStateLabel, turns, type LiveEntry } from '../lib/campu-live-notes';

// Clases de UClass que escuchó la extensión Campito, leídas con la cookie de Campus.
// Mismo diseño que los apuntes de la extensión: Resumen, Transcripción y Pregúntale a Campito.
const API = '/api/app/live-classes/web';

type LiveSession = { id: string; course: string; state: string; recordedAt?: string; createdAt?: string };
type Coverage = { lastReceivedMs: number; lastTranscribedMs: number; pending: number; failed: number; gaps: unknown[] };
type ClassRead = { session: LiveSession; entries: LiveEntry[]; coverage?: Coverage };
type Summary = { highlights: string[]; tasks: { title: string; detail?: string; due?: string; atMs: number }[]; topics: { title: string; atMs: number }[] };
type SummaryState = { status: 'loading' } | { status: 'too_short' } | { status: 'error'; message: string } | { status: 'ready'; summary: Summary; stale: boolean };
type Message = { n: number; question: string; answer?: string; error?: boolean };
type Tab = 'summary' | 'transcript' | 'ask';

class RequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function post<T = any>(path: string, body: unknown): Promise<T> {
  const response = await fetch(API + path + '/', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestError(value.error ?? 'No se pudo cargar la clase.', response.status);
  return value;
}
const SUGGESTIONS = ['¿Qué tengo que entregar y para cuándo?', '¿Qué fue lo más importante de la clase?', '¿Hubo fechas, notas o avisos?', 'Explícame lo que no entendí del tema principal'];

function Highlighted({ text, query }: { text: string; query: string }) {
  return <>{highlight(text, query).map((part, i) => part.match ? <mark key={i}>{part.text}</mark> : part.text)}</>;
}

export default function UClassNotes() {
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [openId, setOpenId] = useState('');
  const [data, setData] = useState<ClassRead | null>(null), [status, setStatus] = useState('');
  const [tab, setTab] = useState<Tab>('summary');
  const [query, setQuery] = useState(''), [draftQuery, setDraftQuery] = useState('');
  const [summary, setSummary] = useState<SummaryState>({ status: 'loading' });
  const [done, setDone] = useState<Set<number>>(new Set()), [rated, setRated] = useState(false);
  const [thread, setThread] = useState<Message[]>([]), [question, setQuestion] = useState(''), [follow, setFollow] = useState(true);
  const transcript = useRef<HTMLDivElement>(null), detail = useRef<HTMLElement>(null);
  const pendingJump = useRef<number | null>(null), loading = useRef(false), current = useRef(''), asked = useRef(0), generation = useRef(0);

  useEffect(() => {
    // Sin beta, sin extensión o sin clases: la sección no aparece.
    post<{ sessions?: LiveSession[] }>('/context', { operation: 'list' })
      .then((r) => setSessions(r.sessions ?? []))
      .catch(() => setSessions([]));
  }, []);

  // Trae la clase completa por páginas (o todos los resultados de la búsqueda).
  async function load(id: string, search: string, quiet = false) {
    // El sondeo en vivo no se encima a una carga en curso; abrir otra clase o buscar sí la reemplaza.
    if (quiet && loading.current) return;
    const run = ++generation.current;
    loading.current = true;
    if (!quiet) setStatus(search ? 'Buscando…' : 'Cargando la clase…');
    try {
      let after = 0, first: any = null;
      const entries: LiveEntry[] = [];
      for (let page = 0; page < 40; page++) {
        const r = await post('/context', search ? { operation: 'search', sessionId: id, query: search, after } : { operation: 'read', sessionId: id, after, limit: 60 });
        if (run !== generation.current) return; // La reemplazó otra carga más reciente.
        if (r.status !== 'connected') throw new Error('No encontramos esta clase en tu cuenta.');
        first ??= r;
        entries.push(...r.entries);
        if (r.nextCursor === null || r.nextCursor === undefined) break;
        after = r.nextCursor;
      }
      if (run !== generation.current || current.current !== id) return;
      setData({ ...first, entries });
      if (!quiet) setStatus('');
    } catch (e) {
      if (run === generation.current && current.current === id) setStatus(e instanceof Error ? e.message : 'No se pudo cargar la clase.');
    } finally {
      // Solo la carga vigente libera el turno: una reemplazada no debe dejar pasar el sondeo antes de tiempo.
      if (run === generation.current) loading.current = false;
    }
  }

  async function loadSummary(id: string, refresh = false) {
    setSummary({ status: 'loading' });
    try {
      const r = await post(`/${id}/summary`, refresh ? { refresh: true } : {});
      if (current.current !== id) return;
      setSummary(r.status === 'too_short' ? { status: 'too_short' } : { status: 'ready', summary: r.summary, stale: Boolean(r.stale) });
    } catch (e) {
      if (current.current === id) setSummary({ status: 'error', message: e instanceof Error ? e.message : 'No pude preparar el resumen.' });
    }
  }

  function open(id: string) {
    current.current = id;
    setOpenId(id); setData(null); setTab('summary'); setQuery(''); setDraftQuery(''); setThread([]); setRated(false); setFollow(true);
    try { setDone(new Set(JSON.parse(localStorage.getItem(`campu-done-${id}`) ?? '[]'))); } catch { setDone(new Set()); }
    void load(id, '');
    void loadSummary(id);
    requestAnimationFrame(() => detail.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }
  function close() { current.current = ''; setOpenId(''); setData(null); setStatus(''); }

  const live = data?.session.state === 'listening' || data?.session.state === 'paused';
  // Mientras escucha, o mientras quedan fragmentos por escribir aunque la clase ya terminó, la transcripción se actualiza sola.
  const writing = live || (data?.coverage?.pending ?? 0) > 0;
  // Si al abrir había poco texto, el resumen se vuelve a pedir solo cuando la transcripción crece.
  const entryCount = data?.entries.length ?? 0;
  useEffect(() => {
    if (openId && summary.status === 'too_short' && entryCount >= 6) void loadSummary(openId);
  }, [openId, entryCount]);
  useEffect(() => {
    if (!openId || !writing || query) return;
    const timer = setInterval(() => void load(openId, '', true), 8000);
    return () => clearInterval(timer);
  }, [openId, writing, query]);

  useEffect(() => {
    if (tab !== 'transcript' || !transcript.current) return;
    if (pendingJump.current !== null) {
      // El párrafo más cercano antes de ese minuto (un turno largo tiene varios).
      const rows = [...transcript.current.querySelectorAll<HTMLElement>('p[data-start]')];
      const target = rows.filter((r) => Number(r.dataset.start) <= pendingJump.current!).pop() ?? rows[0];
      if (target && !query) {
        pendingJump.current = null;
        target.scrollIntoView({ block: 'center' });
        target.classList.add('flash');
        setTimeout(() => target.classList.remove('flash'), 1600);
      }
    } else if (live && !query && follow) transcript.current.lastElementChild?.scrollIntoView({ block: 'end' });
  }, [tab, data, query]);

  // Un minuto del resumen lleva al pasaje de la transcripción.
  function jumpTo(ms: number) {
    pendingJump.current = ms;
    setFollow(false);
    setTab('transcript');
    if (query) { setQuery(''); setDraftQuery(''); void load(openId, ''); }
  }
  function search(value: string) {
    const q = value.trim();
    setQuery(q);
    void load(openId, q);
  }
  function toggleTask(i: number) {
    const next = new Set(done);
    next.has(i) ? next.delete(i) : next.add(i);
    setDone(next);
    // Las tareas marcadas son del alumno y se quedan en este navegador.
    try { localStorage.setItem(`campu-done-${openId}`, JSON.stringify([...next])); } catch {}
  }
  async function rate(rating: 'up' | 'down') {
    try { await post('/feedback', { sessionId: openId, kind: 'summary', rating }); setRated(true); } catch {}
  }
  async function ask(text: string) {
    const q = text.trim();
    if (q.length < 2) return;
    const id = openId, n = ++asked.current;
    setThread((t) => [...t, { n, question: q }]);
    let answer: Message;
    try {
      const r = await post<{ text: string }>('/ask', { sessionId: id, question: q });
      answer = { n, question: q, answer: r.text };
    } catch (e) {
      answer = { n, question: q, answer: e instanceof Error ? e.message : 'No pude responder ahora.', error: true };
    }
    if (current.current !== id) return;
    setThread((t) => t.map((m) => m.n === n ? answer : m));
  }

  if (!sessions?.length) return null;
  const list = data ? turns(data.entries) : [];
  const stamp = (ms: number) => <button type="button" className="campu-ts" title="Ver en la transcripción" onClick={() => jumpTo(ms)}>{clock(ms)}</button>;
  const coverage = data?.coverage;

  return <>
    <section className="classes-library campu-library" aria-labelledby="uclass-title">
      <div className="classes-library-heading">
        <div><span className="classes-eyebrow">Con la extensión Campito</span><h2 id="uclass-title">Clases de UClass</h2></div>
      </div>
      <ul className="classes-list">{sessions.map((s) => <li key={s.id}>
        <div><h3>{s.course}</h3><p>{limaDate(s.recordedAt ?? s.createdAt)}</p><span className="campu-state" data-live={String(s.state === 'listening')}>{sessionStateLabel(s.state)}</span></div>
        <div className="classes-item-actions"><button className="app-button app-button--secondary" aria-pressed={openId === s.id} onClick={() => openId === s.id ? close() : open(s.id)}>{openId === s.id ? 'Cerrar apuntes' : 'Ver apuntes'}</button></div>
      </li>)}</ul>
    </section>

    {openId && <section ref={detail} className="classes-card classes-detail campu-notes" aria-labelledby="campu-notes-title">
      <div className="campu-head">
        <p className="campu-when">{limaDate(data?.session.recordedAt ?? data?.session.createdAt)}</p>
        <div className="classes-library-heading"><h2 id="campu-notes-title">{data?.session.course ?? 'Cargando tu clase…'}</h2><button className="classes-delete" onClick={close}>Cerrar</button></div>
        {data && <div className="campu-meta">
          <span className="campu-state" data-live={String(data.session.state === 'listening')}>{sessionStateLabel(data.session.state)}</span>
          {coverage?.lastReceivedMs ? <span>{duration(coverage.lastReceivedMs)}</span> : null}
          <span>{coverage?.pending ? `Escribiendo… faltan ${coverage.pending} fragmentos` : 'Texto al día'}</span>
        </div>}
      </div>

      <div className="campu-tabs" role="tablist" aria-label="Vistas de la clase">
        {([['summary', 'Resumen'], ['transcript', 'Transcripción'], ['ask', 'Pregúntale a Campito']] as const).map(([key, label]) =>
          <button key={key} role="tab" id={`campu-tab-${key}`} aria-controls={`campu-panel-${key}`} aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      {status && <p className="campu-status" role="status" aria-live="polite">{status}</p>}

      {tab === 'summary' && <div id="campu-panel-summary" role="tabpanel" aria-labelledby="campu-tab-summary">
        {summary.status === 'loading' && <p className="campu-muted">Campito está leyendo la clase para resumirla…</p>}
        {summary.status === 'too_short' && <><p className="campu-empty">Todavía hay poco texto para resumir. Vuelve cuando la clase avance.</p><button type="button" className="campu-link" onClick={() => openId && void loadSummary(openId)}>Volver a intentar</button></>}
        {summary.status === 'error' && <p className="campu-muted">{summary.message} Mientras tanto, revisa la transcripción.</p>}
        {summary.status === 'ready' && <>
          <h3>Lo importante</h3>
          <ul className="campu-highlights">{summary.summary.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
          <h3>Tareas y fechas que mencionó</h3>
          {summary.summary.tasks.length ? summary.summary.tasks.map((t, i) => <div key={i} className="campu-task">
            <input type="checkbox" id={`campu-task-${i}`} checked={done.has(i)} onChange={() => toggleTask(i)} />
            <label htmlFor={`campu-task-${i}`}><strong>{t.title}</strong>{(t.detail || t.due) && <small>{[t.detail, t.due && `Para: ${t.due}`].filter(Boolean).join(' · ')}</small>}</label>
            {stamp(t.atMs)}
          </div>) : <p className="campu-muted">No escuché tareas ni fechas en esta clase.</p>}
          <h3>Temas</h3>
          {summary.summary.topics.map((t, i) => <div key={i} className="campu-topic"><span>{t.title}</span>{stamp(t.atMs)}</div>)}
          <div className="campu-rate">
            {rated ? <span>Gracias, lo tomamos en cuenta.</span> : <>
              <span>¿Te sirvió este resumen?</span>
              <button type="button" aria-label="Sí, me sirvió" onClick={() => void rate('up')}>👍</button>
              <button type="button" aria-label="No me sirvió" onClick={() => void rate('down')}>👎</button>
            </>}
            {summary.stale && <button type="button" className="campu-link" onClick={() => void loadSummary(openId, true)}>Actualizar resumen</button>}
          </div>
        </>}
      </div>}

      {tab === 'transcript' && <div id="campu-panel-transcript" role="tabpanel" aria-labelledby="campu-tab-transcript">
        <div className="campu-toolbar">
          <form role="search" onSubmit={(e) => { e.preventDefault(); search(draftQuery); }}>
            <input type="search" value={draftQuery} placeholder="Buscar en la clase: «trabajo final», «SAFe»…" aria-label="Buscar en la transcripción"
              onChange={(e) => { setDraftQuery(e.target.value); if (!e.target.value.trim() && query) search(''); }} />
          </form>
          <button type="button" className="app-button app-button--secondary" onClick={() => void load(openId, query)}>Actualizar</button>
        </div>
        {live && !query && <label className="campu-follow"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Seguir lo último</label>}
        {query && data && <p className="campu-muted">{list.length ? `Resultados para «${query}».` : `No encontré «${query}» en esta clase. Que no aparezca no prueba que no se dijo.`}</p>}
        <div ref={transcript} className="campu-transcript" aria-label="Transcripción de la clase">
          {list.map((t, i) => t.type === 'gap'
            ? <div key={i} className="campu-gap">{t.text} · {clock(t.start)}–{clock(t.end)}</div>
            : <article key={i} className={`campu-turn ${t.type === 'chat' ? 'chat' : t.who.kind}`}>
              <time>{clock(t.start)}</time>
              <div>
                <strong>{t.type === 'chat' ? `${t.author} · chat` : t.who.label}</strong>
                {(t.type === 'chat' ? [{ start: t.start, parts: [t.text] }] : t.paragraphs).map((p, j, all) => <p key={j} data-start={p.start}>
                  {j > 0 && <time className="campu-inline-time">{clock(p.start)}</time>}
                  <Highlighted text={p.parts.join(' ')} query={query} />
                  {t.type === 'turn' && t.pending && j === all.length - 1 && <span className="campu-writing"> escribiendo…</span>}
                </p>)}
              </div>
            </article>)}
        </div>
        {data && !list.length && !query && <p className="campu-empty">Todavía no hay texto. Campito lo va escribiendo unos segundos después de escuchar.</p>}
      </div>}

      {tab === 'ask' && <div id="campu-panel-ask" role="tabpanel" aria-labelledby="campu-tab-ask">
        <p className="campu-muted">Campito responde con esta clase y el contexto de tu curso, citando el minuto.</p>
        {!thread.length && <div className="campu-suggestions">{SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => void ask(s)}>{s}</button>)}</div>}
        <div className="campu-thread" aria-live="polite">{thread.map((m) => <div key={m.n} className="campu-exchange">
          <div className="campu-msg mine">{m.question}</div>
          <div className={`campu-msg campu${m.error ? ' error' : ''}`}>{m.answer ?? 'Revisando la clase…'}</div>
        </div>)}</div>
        <form className="campu-ask" onSubmit={(e) => { e.preventDefault(); const q = question; setQuestion(''); void ask(q); }}>
          <input value={question} maxLength={1400} required autoFocus placeholder="Pregúntale a Campito sobre esta clase…" aria-label="Tu pregunta" onChange={(e) => setQuestion(e.target.value)} />
          <button className="app-button">Preguntar</button>
        </form>
      </div>}

      <details className="campu-details">
        <summary>Detalles de la captura</summary>
        {coverage && <p>Audio recibido hasta {clock(coverage.lastReceivedMs)} · texto hasta {clock(coverage.lastTranscribedMs)} · {coverage.pending} pendientes · {coverage.failed} sin transcribir · {coverage.gaps.length} cortes.</p>}
        <p className="campu-muted">Texto y resumen automáticos, pendientes de revisión. Los nombres salen del indicador visible de UClass: son probables, no una verificación de quién habló. Para eliminar esta clase, usa los apuntes de la extensión.</p>
      </details>
    </section>}
  </>;
}
