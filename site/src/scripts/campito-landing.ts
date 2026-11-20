// Página de Campito: la clase con memoria, las funciones en pestañas y el
// experimento del ángulo de la portada (campito-hero-angle).
import { experimentVariant } from './analytics.ts';
import { CHARACTER_NAME } from '../lib/character.mjs';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Tres versiones (experimento campito-hero-angle). Los apuntes se llenan igual y la
// escena termina distinto: control pregunta «¿qué acaba de explicar?»; «ponte-al-dia»
// vuelve de una llamada del trabajo y pregunta qué se perdió; «trabajo» pregunta qué
// hay que hacer y Campito marca lo que el profe no dijo. Sin animación queda en el final.
const CAPTIONS = [
  '«El PI Planning alinea a todos los equipos al inicio.»',
  '«No confundan el System Demo con el demo quincenal.»',
  '«Para la práctica calificada, este ejercicio es el que más vale.»',
];

function setupDemo(stage: HTMLElement, angle: string): void {
  const browser = stage.querySelector<HTMLElement>('.cf-browser');
  const notes = [...stage.querySelectorAll<HTMLElement>('[data-note]')];
  const caption = stage.querySelector<HTMLElement>('[data-cf-caption]');
  const replay = stage.querySelector<HTMLButtonElement>('[data-cf-replay]');
  if (!browser) return;
  const finale = angle === 'trabajo' ? 'summary' : 'ask';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    notes.forEach((note) => note.classList.add('is-on'));
    browser.dataset.step = finale;
    return;
  }

  let run = 0;
  async function play(): Promise<void> {
    const id = ++run;
    const alive = () => id === run;
    if (replay) replay.hidden = true;
    browser!.dataset.step = 'class';
    notes.forEach((note) => note.classList.remove('is-on'));
    await wait(700);
    for (const [index, note] of notes.entries()) {
      if (!alive()) return;
      if (caption) caption.textContent = CAPTIONS[index] ?? caption.textContent;
      await wait(900);
      if (!alive()) return;
      note.classList.add('is-on');
      await wait(1100);
    }
    if (!alive()) return;
    browser!.dataset.step = finale;
    if (replay) replay.hidden = false;
  }

  replay?.addEventListener('click', () => void play());
  // Empieza cuando la escena se ve, no al cargar la página.
  const seen = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      seen.disconnect();
      void play();
    }
  }, { threshold: 0.35 });
  seen.observe(stage);
}

// Pestañas accesibles: clic, flechas, Inicio y Fin.
function setupTabs(root: HTMLElement): void {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const select = (tab: HTMLButtonElement, focus = false) => {
    for (const other of tabs) {
      const on = other === tab;
      other.setAttribute('aria-selected', String(on));
      other.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(other.getAttribute('aria-controls') ?? '');
      if (panel) panel.hidden = !on;
    }
    if (focus) tab.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (event) => {
      const next = { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], true);
    });
  });
}

// El HTML es la versión control; las otras cambian título, subtítulo, el final de la
// escena y qué función se muestra primero.
type Angle = { title: string; lead: string; ask?: { question: string; answer: string }; tab?: string };
const ANGLES: Record<string, Angle> = {
  'ponte-al-dia': {
    title: '¿Te llamaron del trabajo en plena clase? Ponte al <em>día.</em>',
    lead: `${CHARACTER_NAME} sigue tu clase de UClass mientras atiendes. Al volver, pregúntale qué te perdiste y te resume esos minutos, con el minuto de cada cosa.`,
    ask: {
      question: 'Me llamaron del trabajo. ¿Qué me perdí?',
      answer: 'En los últimos 12 minutos: explicó el System Demo frente al demo quincenal, cómo calcular el CPI y el SPI con valor ganado, y que ese ejercicio será el de mayor puntaje en la práctica calificada.<span>Profesor · min 95 a 107</span>',
    },
    tab: 'cf-tab-ask',
  },
  trabajo: {
    title: 'Sal de clase sabiendo qué hay que <em>hacer.</em>',
    lead: `${CHARACTER_NAME} acompaña tu clase de UClass. ¿Dejaron un trabajo y no te quedó del todo claro? Pregúntale qué hay que hacer: te lo explica con lo que dijo el profe y te marca lo que falta preguntarle.`,
    tab: 'cf-tab-summary',
  },
};

function applyAngle(root: HTMLElement, angle: string): void {
  const version = ANGLES[angle];
  if (!version) return;
  const copy: Record<string, string> = { title: version.title, lead: version.lead };
  root.querySelectorAll<HTMLElement>('[data-cf-copy]').forEach((el) => {
    const html = copy[el.dataset.cfCopy ?? ''];
    if (html) el.innerHTML = html;
  });
  if (version.ask) {
    root.querySelectorAll<HTMLElement>('[data-cf-ask]').forEach((el) => {
      const html = version.ask![el.dataset.cfAsk as 'question' | 'answer'];
      if (html) el.innerHTML = html;
    });
  }
  const tab = version.tab ? root.querySelector<HTMLButtonElement>('#' + version.tab) : null;
  if (tab?.parentElement) { tab.parentElement.prepend(tab); tab.click(); }
}

async function start(): Promise<void> {
  const root = document.querySelector<HTMLElement>('.cf');
  if (!root) return;
  root.dataset.angle = 'pending';
  const angle = await experimentVariant('campito-hero-angle', 800);
  applyAngle(root, angle);
  root.dataset.angle = angle;
  document.querySelectorAll<HTMLElement>('[data-cf-demo]').forEach((stage) => setupDemo(stage, angle));
}

// Cupos fundadores: el servidor dice cuántos de los 25 ya pagaron (solo el número).
// Sin respuesta, la tarjeta se queda con «cupos limitados» y nada pintado: nunca un
// número inventado. En local se puede previsualizar con ?cupos=4.
async function showSeats(): Promise<void> {
  const box = document.querySelector<HTMLElement>('[data-cf-seats]');
  const label = box?.querySelector<HTMLElement>('[data-cf-seats-label]');
  if (!box || !label) return;
  let seats: { limit: number; taken: number } | undefined;
  const preview = ['localhost', '127.0.0.1'].includes(location.hostname) ? Number(new URLSearchParams(location.search).get('cupos')) : NaN;
  if (Number.isInteger(preview) && preview >= 0) seats = { limit: 25, taken: preview };
  else {
    try {
      const response = await fetch('/api/app/plus/founders', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(5000) });
      if (response.ok) seats = await response.json();
    } catch { /* Sin dato, sin número. */ }
  }
  if (!seats || !Number.isInteger(seats.taken) || !Number.isInteger(seats.limit) || seats.limit <= 0) return;
  const taken = Math.max(0, Math.min(seats.taken, seats.limit));
  box.querySelectorAll('i').forEach((seat, index) => seat.classList.toggle('is-taken', index < taken));
  const left = seats.limit - taken;
  label.innerHTML = left > 0
    ? `<strong>${taken} de ${seats.limit}</strong> cupos fundadores tomados. Quedan ${left}.`
    : 'Los 25 cupos fundadores ya se tomaron.';
}

document.querySelectorAll<HTMLElement>('[data-cf-tabs]').forEach(setupTabs);
void start();
void showSeats();
