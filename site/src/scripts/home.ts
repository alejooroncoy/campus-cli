/**
 * Movimiento de la home (rediseño de noviembre 2026, maqueta A en public/maqueta/a.html).
 *
 * Todo es decorativo: sin JavaScript la página se lee entera, porque los estados iniciales
 * ocultos solo se aplican cuando este script marca `.home-v2` con `is-animated`.
 * Con «reducir movimiento» nada se anima y los videos quedan en su primer cuadro.
 */

const AVISOS: Array<[string, string, boolean]> = [
  ['Campito · 7:58 p. m.', '«Esto viene en el parcial»', false],
  ['Campito · 8:05 p. m.', 'El profe dijo tu nombre', true],
  ['Te perdiste 6 minutos', 'Explicó el VAN en el min 48', false],
  ['Campito · 8:20 p. m.', 'Dejó tarea para el jueves', false],
];

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

function stackAlerts(stack: HTMLElement, calm: boolean): void {
  const name = stack.dataset.character ?? 'Campito';
  let i = 0;
  const push = (): void => {
    const [small, title, hot] = AVISOS[i % AVISOS.length];
    i += 1;
    const el = document.createElement('div');
    el.className = hot ? 'alert alert--hot' : 'alert';
    const img = document.createElement('img');
    img.src = '/assets/campu/campu-wave-v2-96.webp'; img.alt = ''; img.width = 44; img.height = 44;
    const text = document.createElement('div');
    const s = document.createElement('small'); s.textContent = small.replace('Campito', name);
    const t = document.createElement('strong'); t.textContent = title;
    text.append(s, t); el.append(img, text);
    stack.prepend(el);
    const visible = stack.querySelectorAll<HTMLElement>('.alert:not(.out)');
    if (visible.length > 3) {
      const last = visible[visible.length - 1];
      last.classList.add('out');
      window.setTimeout(() => last.remove(), 350);
    }
  };
  if (calm) { AVISOS.slice(0, 3).forEach(push); return; }
  window.setTimeout(() => { push(); window.setInterval(push, 2600); }, 1800);
}

function loopVideos(calm: boolean): void {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('.home-v2 video[autoplay]'));
  videos.forEach((video) => {
    if (calm) { video.removeAttribute('autoplay'); video.pause(); return; }
    video.muted = true;
    const play = (): void => { if (video.paused) video.play().catch(() => { /* El navegador decide. */ }); };
    play();
    video.addEventListener('loadeddata', play);
    video.addEventListener('canplay', play);
  });
  if (calm || !('IntersectionObserver' in window)) return;
  const watcher = new IntersectionObserver((entries) => entries.forEach((entry) => {
    const video = entry.target as HTMLVideoElement;
    if (entry.isIntersecting) video.play().catch(() => { /* El navegador decide. */ });
    else video.pause();
  }));
  videos.forEach((video) => watcher.observe(video));
}

function reveal(calm: boolean): void {
  const targets = document.querySelectorAll<HTMLElement>('.home-v2 [data-reveal], .home-v2 [data-chapter]');
  if (calm || !('IntersectionObserver' in window)) { targets.forEach((t) => t.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('in');
    io.unobserve(entry.target);
  }), { threshold: 0.2 });
  targets.forEach((t) => io.observe(t));
}

function classSteps(): void {
  const steps = Array.from(document.querySelectorAll<HTMLElement>('.home-v2 [data-step]'));
  const bar = document.querySelector<HTMLElement>('.home-v2 [data-meter]');
  const label = document.querySelector<HTMLElement>('.home-v2 [data-meter-label]');
  if (!steps.length || !bar || !label) return;
  if (!('IntersectionObserver' in window)) { bar.style.transform = 'none'; steps.forEach((s) => s.classList.add('on')); return; }
  const seen = new Set<Element>();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => { if (entry.isIntersecting) { seen.add(entry.target); entry.target.classList.add('on'); } });
    const pct = Math.round((seen.size / steps.length) * 100);
    bar.style.transform = `scaleX(${pct / 100})`;
    label.textContent = `${pct}% de la clase al día`;
  }, { threshold: 0.4 });
  steps.forEach((s) => io.observe(s));
}

function setupHome(): void {
  const root = document.querySelector<HTMLElement>('.home-v2');
  if (!root || root.dataset.homeReady) return;
  root.dataset.homeReady = 'true';
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('is-animated');
  const h1 = root.querySelector<HTMLElement>('[data-words]');
  if (h1 && !calm) splitWords(h1);
  root.querySelectorAll<HTMLElement>('[data-stack]').forEach((stack) => stackAlerts(stack, calm));
  loopVideos(calm);
  reveal(calm);
  classSteps();
}

document.addEventListener('astro:page-load', setupHome);
if (document.readyState !== 'loading') setupHome();
else document.addEventListener('DOMContentLoaded', setupHome);
