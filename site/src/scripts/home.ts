import { track } from './analytics';
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

/** Pausa del movimiento (WCAG 2.2.2). Se recuerda en este navegador. */
const MOTION_KEY = 'campus-home-motion';
const motion = { paused: false };

/** Lo que hay que apagar al salir de la home. */
const cleanups: Array<() => void> = [];
function every(ms: number, fn: () => void): void { const id = window.setInterval(fn, ms); cleanups.push(() => window.clearInterval(id)); }
function later(ms: number, fn: () => void): void {
  // Se quita de la lista al dispararse: los avisos de la portada lo llaman cada pocos segundos.
  const cancel = (): void => window.clearTimeout(id);
  const id = window.setTimeout(() => { const k = cleanups.indexOf(cancel); if (k >= 0) cleanups.splice(k, 1); fn(); }, ms);
  cleanups.push(cancel);
}
function on<K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void): void {
  window.addEventListener(type, fn); cleanups.push(() => window.removeEventListener(type, fn));
}
function watch(cb: IntersectionObserverCallback, options?: IntersectionObserverInit): IntersectionObserver {
  const io = new IntersectionObserver(cb, options); cleanups.push(() => io.disconnect()); return io;
}

/** Posición de un elemento dentro del flujo según el layout, sin transformaciones: los rebotes de entrada no la mueven. */
function layoutBox(el: HTMLElement, flow: HTMLElement): { x: number; y: number; w: number; h: number } {
  let x = 0; let y = 0; let node: HTMLElement | null = el;
  while (node && node !== flow) { x += node.offsetLeft; y += node.offsetTop; node = node.offsetParent as HTMLElement | null; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/**
 * Líneas de la universidad a Campito y de Campito a tu IA, con puntos que viajan.
 * Entran por un punto en el borde izquierdo del cuerpo y salen por el derecho (medidos sobre el
 * póster del video), así no cruzan a Campito ni asoman por las zonas transparentes del video.
 */
function drawLinks(flow: HTMLElement, svg: SVGSVGElement, campu: HTMLElement, calm: boolean): void {
  if (!flow.offsetWidth || !campu.offsetWidth) return;
  svg.setAttribute('viewBox', `0 0 ${flow.offsetWidth} ${flow.offsetHeight}`);
  svg.replaceChildren();
  // En celular el flujo va en columna y las líneas se ocultan por CSS.
  if (getComputedStyle(svg).display === 'none') return;
  const c = layoutBox(campu, flow);
  const hubY = c.y + c.h * 0.56;
  const hubs = { in: c.x + c.w * 0.08, out: c.x + c.w * 0.88 };
  const add = (el: HTMLElement, out: boolean, k: number): void => {
    const r = layoutBox(el, flow);
    const x = out ? r.x - 6 : r.x + r.w + 6;
    const y = r.y + r.h / 2;
    const hub = out ? hubs.out : hubs.in;
    const [x1, y1, x2, y2] = out ? [hub, hubY, x, y] : [x, y, hub, hubY];
    const mid = (x1 + x2) / 2;
    const d = `M${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
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
  flow.querySelectorAll<HTMLElement>('[data-from]').forEach((el, k) => add(el, false, k));
  flow.querySelectorAll<HTMLElement>('[data-to]').forEach((el, k) => add(el, true, k));
  for (const x of [hubs.in, hubs.out]) {
    const port = document.createElementNS(SVG, 'circle');
    port.setAttribute('class', 'port'); port.setAttribute('r', '5'); port.setAttribute('cx', String(x)); port.setAttribute('cy', String(hubY));
    svg.append(port);
  }
  if (motion.paused) svg.pauseAnimations();
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
    // Las fuentes cambian el ancho de los chips; el póster fija el tamaño de Campito.
    document.fonts?.ready.then(() => { if (root.isConnected) draw(); }).catch(() => { /* Sin fuentes, se queda el trazo anterior. */ });
    campu.addEventListener('loadedmetadata', draw, { once: true });
    if ('ResizeObserver' in window) { const ro = new ResizeObserver(() => draw()); ro.observe(flow); cleanups.push(() => ro.disconnect()); }
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
    if (motion.paused) return;
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
      const line = svg?.querySelector(`#hv-link-o${n % targets.length}`);
      if (chip) { chip.classList.add('ping'); line?.classList.add('hot'); later(1200, () => { chip.classList.remove('ping'); line?.classList.remove('hot'); }); }
    });
  });
}

/** Botones «Pausar animación»: detienen los videos, las líneas del flujo y los avisos que rotan. */
function motionToggle(root: HTMLElement, calm: boolean): void {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-motion-toggle]'));
  if (calm || !buttons.length) return;
  const svg = root.querySelector<SVGSVGElement>('[data-links]');
  const apply = (paused: boolean): void => {
    motion.paused = paused;
    root.classList.toggle('is-paused', paused);
    buttons.forEach((b) => { const label = b.querySelector('span'); if (label) label.textContent = paused ? 'Reanudar animación' : 'Pausar animación'; });
    if (paused) svg?.pauseAnimations(); else svg?.unpauseAnimations();
    root.querySelectorAll<HTMLVideoElement>('video[data-loop]').forEach((v) => {
      if (paused) v.pause();
      else if (v.getBoundingClientRect().bottom > 0 && v.getBoundingClientRect().top < innerHeight) v.play().catch(() => { /* El navegador decide. */ });
    });
  };
  let saved = false;
  try { saved = localStorage.getItem(MOTION_KEY) === 'paused'; } catch { /* Sin almacenamiento, empieza en movimiento. */ }
  apply(saved);
  buttons.forEach((b) => b.addEventListener('click', () => {
    apply(!motion.paused);
    try { if (motion.paused) localStorage.setItem(MOTION_KEY, 'paused'); else localStorage.removeItem(MOTION_KEY); } catch { /* Opcional. */ }
  }));
}

/**
 * «¿De qué universidad eres?»: Campito en vivo (la extensión) hoy solo funciona en UClass de la UPC.
 * En las demás, el botón principal es «Conectar mi IA» y se dice lo que ya tienen. Se recuerda en el navegador.
 */
const UNI_KEY = 'campus-home-university';
const UNIS: Record<string, { name: string; zoom: boolean }> = {
  upc: { name: 'UPC', zoom: false },
  upn: { name: 'UPN', zoom: false },
  ulima: { name: 'Universidad de Lima', zoom: true },
  palermo: { name: 'Universidad de Palermo', zoom: true },
};
const SUPPORT_WHATSAPP = '51946189585';
/** Grupo que se muestra: Campito en vivo (UPC), tu IA (otras con Campus) o el pedido de una universidad nueva. */
function universityGroup(uni: string | null): 'upc' | 'otra' | 'pedir' {
  if (uni === 'otra') return 'pedir';
  return uni && UNIS[uni] && uni !== 'upc' ? 'otra' : 'upc';
}
function universityPicker(root: HTMLElement): void {
  const pick = root.querySelector<HTMLElement>('[data-uni-pick]');
  if (!pick) return;
  pick.hidden = false;
  const buttons = Array.from(pick.querySelectorAll<HTMLButtonElement>('[data-uni-opt]'));
  const apply = (uni: string | null): void => {
    const group = universityGroup(uni);
    root.dataset.uni = uni ?? '';
    buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.uniOpt === uni)));
    // data-for admite varios grupos separados por espacio (por ejemplo «otra pedir»).
    root.querySelectorAll<HTMLElement>('[data-for]').forEach((el) => { el.hidden = !(el.dataset.for ?? '').split(' ').includes(group); });
    const info = uni ? UNIS[uni] : undefined;
    if (!info) return;
    root.querySelectorAll<HTMLElement>('[data-uni-name]').forEach((el) => { el.textContent = info.name; });
    root.querySelectorAll<HTMLElement>('[data-uni-zoom]').forEach((el) => { el.hidden = !info.zoom; });
  };
  let saved: string | null = null;
  try { saved = localStorage.getItem(UNI_KEY); } catch { /* Sin almacenamiento, sin elección guardada. */ }
  apply(saved && UNIS[saved] ? saved : null);
  buttons.forEach((b) => b.addEventListener('click', () => {
    const uni = b.dataset.uniOpt ?? null;
    apply(uni);
    // «Otra» no se recuerda: quien solo miró no debe volver a una portada sin botones.
    try { if (uni && UNIS[uni]) localStorage.setItem(UNI_KEY, uni); else localStorage.removeItem(UNI_KEY); } catch { /* Opcional. */ }
    const status = pick.querySelector<HTMLElement>('[data-uni-status]');
    if (status) status.textContent = uni === 'otra' ? 'Mostrando el formulario para pedir Campus en tu universidad.' : `Mostrando las opciones para la ${uni && UNIS[uni] ? UNIS[uni].name : 'UPC'}.`;
    if (uni) track('campus_home_university_selected', { home_university: uni });
    if (uni === 'otra') root.querySelector<HTMLInputElement>('#uni-ask-name')?.focus();
  }));
  // «Otra»: el pedido sale por WhatsApp de soporte con el nombre ya escrito; no se guarda nada en Campus.
  const form = root.querySelector<HTMLFormElement>('[data-uni-ask]');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = (new FormData(form).get('universidad') ?? '').toString().trim().slice(0, 80);
    const error = form.querySelector<HTMLElement>('[data-uni-ask-error]');
    if (error) error.hidden = name.length >= 2;
    if (name.length < 2) return;
    const text = `Hola, quiero que Campus llegue a mi universidad: ${name}`;
    // Un enlace real (no window.open): la analítica lo cuenta como WhatsApp de soporte y queda como plan B
    // si el navegador de Instagram o TikTok no abre la pestaña.
    const link = form.querySelector<HTMLAnchorElement>('[data-uni-ask-link]');
    const done = form.querySelector<HTMLElement>('[data-uni-ask-done]');
    if (done) done.hidden = false;
    track('campus_university_requested', { home_university: 'otra' });
    if (link) { link.href = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`; link.click(); }
  });
}

function loopVideos(root: HTMLElement, calm: boolean): void {
  const videos = Array.from(root.querySelectorAll<HTMLVideoElement>('video[data-loop]'));
  // Solo corre el video que está en pantalla; al cargar, el navegador no debe reanudar uno oculto.
  const visible = new WeakMap<HTMLVideoElement, boolean>();
  const observed = !calm && 'IntersectionObserver' in window;
  videos.forEach((video) => {
    if (calm) { video.pause(); video.currentTime = 0; return; }
    video.muted = true;
    const play = (): void => {
      if (motion.paused || (observed && !visible.get(video))) return;
      if (video.paused) video.play().catch(() => { /* El navegador decide. */ });
    };
    play();
    video.addEventListener('loadeddata', play);
    video.addEventListener('canplay', play);
  });
  if (!observed) return;
  const io = watch((entries) => entries.forEach((entry) => {
    const video = entry.target as HTMLVideoElement;
    visible.set(video, entry.isIntersecting);
    if (entry.isIntersecting && !motion.paused) video.play().catch(() => { /* El navegador decide. */ });
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

function teardown(): void { while (cleanups.length) cleanups.pop()?.(); motion.paused = false; }

function setupHome(): void {
  const root = document.querySelector<HTMLElement>('.home-v2');
  if (!root || root.dataset.homeReady) return;
  root.dataset.homeReady = 'true';
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('is-animated');
  motionToggle(root, calm);
  universityPicker(root);
  flowHero(root, calm);
  loopVideos(root, calm);
  reveal(root, calm);
  classSteps(root);
}

document.addEventListener('astro:before-swap', teardown);
/** Ofertas con fecha (precio de finales): al vencer se muestra el precio normal aunque la página siga en caché. */
function applyPromoDates(now = Date.now()): void {
  document.querySelectorAll<HTMLElement>('[data-promo-until]').forEach(el => { if (now >= Date.parse(el.dataset.promoUntil!)) el.hidden = true; });
  document.querySelectorAll<HTMLElement>('[data-promo-after]').forEach(el => { if (now >= Date.parse(el.dataset.promoAfter!)) el.hidden = false; });
}

/** Cuenta regresiva de la oferta: «termina en 2 d 4 h», y en el último día horas y minutos. */
function promoLeft(ms: number): string {
  const min = Math.max(1, Math.floor(ms / 60000)), d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return d ? `termina en ${d} d ${h} h` : h ? `termina en ${h} h ${m} min` : `termina en ${m} min`;
}
function tickPromoCountdown(): void {
  document.querySelectorAll<HTMLElement>('[data-promo-countdown]').forEach(el => {
    const left = Date.parse(el.dataset.promoCountdown!) - Date.now();
    if (left > 0) el.textContent = promoLeft(left);
  });
}
let promoTimer = 0;
function startPromoCountdown(): void {
  tickPromoCountdown();
  if (!promoTimer && document.querySelector('[data-promo-countdown]')) promoTimer = window.setInterval(() => { tickPromoCountdown(); applyPromoDates(); }, 30000);
}

document.addEventListener('astro:page-load', () => { applyPromoDates(); startPromoCountdown(); });
document.addEventListener('astro:page-load', setupHome);
if (document.readyState !== 'loading') { applyPromoDates(); startPromoCountdown(); setupHome(); }
else document.addEventListener('DOMContentLoaded', () => { applyPromoDates(); startPromoCountdown(); setupHome(); });
