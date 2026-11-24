/**
 * Movimiento de la home (rediseño de noviembre 2026, maqueta A en public/maqueta/a.html).
 *
 * Todo es decorativo: sin JavaScript la página se lee entera, porque los estados iniciales
 * ocultos solo se aplican cuando este script marca `.home-v2` con `is-animated`.
 * Con «reducir movimiento» nada se anima y los videos quedan en su primer cuadro.
 * El sitio cambia de página sin recargar (Astro): al salir, todo lo que quedó corriendo se limpia.
 */

const SVG = 'http://www.w3.org/2000/svg';

/** Avisos que se turnan junto a Campito en la portada. */
const AVISOS: Array<[string, string, boolean]> = [
  ['Campito · 7:58 p. m.', '«Esto viene en el parcial»', false],
  ['Te perdiste 6 minutos', 'Explicó el VAN en el min 48', false],
  ['Campito · 8:05 p. m.', 'El profe dijo tu nombre', true],
];

/** Lo que hay que apagar al salir de la home. */
const cleanups: Array<() => void> = [];
function every(ms: number, fn: () => void): void { const id = window.setInterval(fn, ms); cleanups.push(() => window.clearInterval(id)); }
function later(ms: number, fn: () => void): void { const id = window.setTimeout(fn, ms); cleanups.push(() => window.clearTimeout(id)); }
function on<K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void): void {
  window.addEventListener(type, fn); cleanups.push(() => window.removeEventListener(type, fn));
}
function watch(cb: IntersectionObserverCallback, options?: IntersectionObserverInit): IntersectionObserver {
  const io = new IntersectionObserver(cb, options); cleanups.push(() => io.disconnect()); return io;
}

function splitWords(h1: HTMLElement): void {
  let i = 0;
  h1.querySelectorAll<HTMLElement>(':scope > span').forEach((line) => {
    const words = (line.textContent ?? '').split(' ');
    line.textContent = '';
    words.forEach((word, k) => {
      const span = document.createElement('span');
      span.className = 'w';
      span.style.setProperty('--i', String(i++));
      span.textContent = word;
      line.append(span);
      if (k < words.length - 1) line.append(' ');
    });
  });
}

/** Líneas de la universidad a Campito y de Campito a tu IA, con puntos que viajan. */
function drawLinks(flow: HTMLElement, svg: SVGSVGElement, campu: HTMLElement, calm: boolean): void {
  const f = flow.getBoundingClientRect();
  const c = campu.getBoundingClientRect();
  if (!f.width || !c.width) return;
  const cx = c.left + c.width / 2 - f.left;
  const cy = c.top + c.height * 0.55 - f.top;
  svg.setAttribute('viewBox', `0 0 ${f.width} ${f.height}`);
  svg.replaceChildren();
  // En celular el flujo va en columna y las líneas se ocultan por CSS.
  if (getComputedStyle(svg).display === 'none') return;
  const add = (el: Element, out: boolean, k: number): void => {
    const r = el.getBoundingClientRect();
    const x = out ? r.left - f.left : r.right - f.left;
    const y = r.top + r.height / 2 - f.top;
    const [x1, y1, x2, y2] = out ? [cx, cy, x, y] : [x, y, cx, cy];
    const d = `M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
    const base = document.createElementNS(SVG, 'path'); base.setAttribute('d', d); svg.append(base);
    const dash = document.createElementNS(SVG, 'path'); dash.setAttribute('d', d); dash.setAttribute('class', 'dash');
    dash.id = `hv-link-${out ? 'o' : 'i'}${k}`; svg.append(dash);
    if (calm) return;
    const begin = `${(1.6 + k * 0.45 + (out ? 1.2 : 0)).toFixed(2)}s`;
    const dot = document.createElementNS(SVG, 'circle'); dot.setAttribute('r', '4.5'); dot.setAttribute('visibility', 'hidden');
    const show = document.createElementNS(SVG, 'set');
    show.setAttribute('attributeName', 'visibility'); show.setAttribute('to', 'visible'); show.setAttribute('begin', begin);
    const move = document.createElementNS(SVG, 'animateMotion');
    move.setAttribute('dur', '2.4s'); move.setAttribute('repeatCount', 'indefinite'); move.setAttribute('begin', begin);
    const path = document.createElementNS(SVG, 'mpath'); path.setAttribute('href', `#${dash.id}`);
    move.append(path); dot.append(show, move); svg.append(dot);
  };
  flow.querySelectorAll('[data-from]').forEach((el, k) => add(el, false, k));
  flow.querySelectorAll('[data-to]').forEach((el, k) => add(el, true, k));
}

function flowHero(root: HTMLElement, calm: boolean): void {
  const flow = root.querySelector<HTMLElement>('[data-flow]');
  const svg = root.querySelector<SVGSVGElement>('[data-links]');
  const campu = root.querySelector<HTMLElement>('[data-campu]');
  // Chips: tras entrar quedan fijos, así el brillo no reinicia su animación.
  root.querySelectorAll<HTMLElement>('.chip').forEach((chip) => {
    if (calm) chip.classList.add('on');
    chip.addEventListener('animationend', (e) => { if (e.animationName === 'hv-pop') chip.classList.add('on'); });
  });
  if (flow && svg && campu) {
    const draw = (): void => drawLinks(flow, svg, campu, calm);
    let pending: number | undefined;
    on('load', draw);
    on('resize', () => { window.clearTimeout(pending); pending = window.setTimeout(draw, 120); });
    later(1700, draw);
    draw();
  }
  const bounce = (cls: 'hop' | 'spin'): void => {
    if (!campu) return;
    campu.classList.remove('hop', 'spin'); void campu.offsetWidth; campu.classList.add(cls);
  };
  if (campu && !calm) {
    campu.addEventListener('animationend', (e) => { if (e.animationName !== 'hv-breathe') campu.classList.remove('hop', 'spin'); });
    campu.addEventListener('click', () => bounce('spin'));
  }
  const box = root.querySelector<HTMLElement>('[data-live-alert]');
  const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-to]'));
  if (!box || calm) return;
  let n = 0;
  every(3200, () => {
    const alert = box.querySelector<HTMLElement>('.alert');
    if (!alert) return;
    alert.classList.add('swap');
    later(300, () => {
      n = (n + 1) % AVISOS.length;
      const [small, title, hot] = AVISOS[n];
      const name = box.dataset.character ?? 'Campito';
      const s = alert.querySelector('small'); const t = alert.querySelector('strong');
      if (s) s.textContent = small.replace('Campito', name);
      if (t) t.textContent = title;
      alert.classList.toggle('alert--hot', hot);
      alert.classList.remove('swap');
      bounce('hop');
      const chip = targets[n % targets.length];
      if (chip) { chip.classList.add('ping'); later(1200, () => chip.classList.remove('ping')); }
    });
  });
}

function loopVideos(root: HTMLElement, calm: boolean): void {
  const videos = Array.from(root.querySelectorAll<HTMLVideoElement>('video[autoplay]'));
  videos.forEach((video) => {
    if (calm) { video.removeAttribute('autoplay'); video.pause(); return; }
    video.muted = true;
    const play = (): void => { if (video.paused) video.play().catch(() => { /* El navegador decide. */ }); };
    play();
    video.addEventListener('loadeddata', play);
    video.addEventListener('canplay', play);
  });
  if (calm || !('IntersectionObserver' in window)) return;
  const io = watch((entries) => entries.forEach((entry) => {
    const video = entry.target as HTMLVideoElement;
    if (entry.isIntersecting) video.play().catch(() => { /* El navegador decide. */ });
    else video.pause();
  }));
  videos.forEach((video) => io.observe(video));
}

function reveal(root: HTMLElement, calm: boolean): void {
  const targets = root.querySelectorAll<HTMLElement>('[data-reveal], [data-chapter]');
  if (calm || !('IntersectionObserver' in window)) { targets.forEach((t) => t.classList.add('in')); return; }
  const io = watch((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('in');
    io.unobserve(entry.target);
  }), { threshold: 0.2 });
  targets.forEach((t) => io.observe(t));
}

function classSteps(root: HTMLElement): void {
  const steps = Array.from(root.querySelectorAll<HTMLElement>('[data-step]'));
  const bar = root.querySelector<HTMLElement>('[data-meter]');
  const label = root.querySelector<HTMLElement>('[data-meter-label]');
  if (!steps.length || !bar || !label) return;
  if (!('IntersectionObserver' in window)) { bar.style.transform = 'none'; steps.forEach((s) => s.classList.add('on')); return; }
  const seen = new Set<Element>();
  const io = watch((entries) => {
    entries.forEach((entry) => { if (entry.isIntersecting) { seen.add(entry.target); entry.target.classList.add('on'); } });
    const pct = Math.round((seen.size / steps.length) * 100);
    bar.style.transform = `scaleX(${pct / 100})`;
    label.textContent = `${pct}% de la clase al día`;
  }, { threshold: 0.4 });
  steps.forEach((s) => io.observe(s));
}

function teardown(): void { while (cleanups.length) cleanups.pop()?.(); }

function setupHome(): void {
  const root = document.querySelector<HTMLElement>('.home-v2');
  if (!root || root.dataset.homeReady) return;
  root.dataset.homeReady = 'true';
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('is-animated');
  const h1 = root.querySelector<HTMLElement>('[data-words]');
  if (h1 && !calm) splitWords(h1);
  flowHero(root, calm);
  loopVideos(root, calm);
  reveal(root, calm);
  classSteps(root);
}

document.addEventListener('astro:before-swap', teardown);
document.addEventListener('astro:page-load', setupHome);
if (document.readyState !== 'loading') setupHome();
else document.addEventListener('DOMContentLoaded', setupHome);
