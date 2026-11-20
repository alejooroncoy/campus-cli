// Página de Campito: la clase con memoria, las funciones en pestañas y el
// experimento del ángulo de la portada (campito-hero-angle).
import { experimentVariant } from './analytics.ts';
import { CHARACTER_NAME } from '../lib/character.mjs';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Versión A («¿qué me perdí?»): los apuntes se llenan y, al volver de una llamada,
// preguntas qué te perdiste. Versión B («el trabajo»): preguntas qué hay que hacer en
// el trabajo que dejó el profe y Campito marca lo que no dijo. Sin animación queda en el momento final de cada versión.
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
  const finale = angle === 'test' ? 'summary' : 'ask';
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

// Versión B del experimento: otro título y subtítulo, la escena termina en el resumen
// y la pestaña del resumen va primero. La A es el HTML tal cual.
const ANGLE_B_COPY: Record<string, string> = {
  title: 'Sal de clase sabiendo qué hay que <em>hacer.</em>',
  lead: `${CHARACTER_NAME} acompaña tu clase de UClass. ¿Dejaron un trabajo y no te quedó del todo claro? Pregúntale qué hay que hacer: te lo explica con lo que dijo el profe y te marca lo que falta preguntarle.`,
};

function applyAngle(root: HTMLElement, angle: string): void {
  if (angle !== 'test') return;
  root.querySelectorAll<HTMLElement>('[data-cf-copy]').forEach((el) => {
    const html = ANGLE_B_COPY[el.dataset.cfCopy ?? ''];
    if (html) el.innerHTML = html;
  });
  const summary = root.querySelector<HTMLButtonElement>('#cf-tab-summary');
  const list = summary?.parentElement;
  if (summary && list) { list.prepend(summary); summary.click(); }
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

document.querySelectorAll<HTMLElement>('[data-cf-tabs]').forEach(setupTabs);
void start();
