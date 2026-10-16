function setupLandingDemo() {
  document.querySelectorAll<HTMLElement>('[data-campus-demo]').forEach(root => {
    if (root.dataset.initialized) return;
    root.dataset.initialized = 'true';
    const toggle = root.querySelector<HTMLButtonElement>('[data-demo-toggle]');
    const label = root.querySelector<HTMLElement>('[data-demo-toggle-label]');
    const icon = root.querySelector<SVGPathElement>('[data-demo-icon]');
    if (!toggle || !label || !icon) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let paused = false;
    let visible = true;
    const update = () => {
      root.classList.toggle('is-animated', !reduced.matches);
      root.dataset.paused = String(paused || !visible || document.hidden);
      toggle.hidden = reduced.matches;
      toggle.setAttribute('aria-pressed', String(paused));
      toggle.setAttribute('aria-label', paused ? 'Reproducir animación' : 'Pausar animación');
      label.textContent = paused ? 'Reproducir' : 'Pausar';
      icon.setAttribute('d', paused ? 'm8 5 11 7-11 7V5Z' : 'M9 5v14M15 5v14');
    };
    toggle.addEventListener('click', () => { paused = !paused; update(); });
    reduced.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? false;
      update();
    }, { threshold: 0.1 }) : null;
    observer?.observe(root);
    update();
    document.addEventListener('astro:before-swap', () => {
      observer?.disconnect();
      reduced.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    }, { once: true });
  });
}
setupLandingDemo();
document.addEventListener('astro:page-load', setupLandingDemo);
