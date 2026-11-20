// Página de Campito: la escena de las dos pestañas y las funciones en pestañas.

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// La clase avanza en la pestaña de atrás; con el segundo «presente», el aviso cae
// sobre el Excel; después vuelves a la clase y respondes. Sin animación (o si el
// alumno la desactivó), la escena queda en el aviso, que es el momento clave.
function setupDemo(stage: HTMLElement): void {
  const browser = stage.querySelector<HTMLElement>('.cf-browser');
  const lines = [...stage.querySelectorAll<HTMLElement>('.cf-class__lines li[data-line]')];
  const replay = stage.querySelector<HTMLButtonElement>('[data-cf-replay]');
  if (!browser) return;
  const still = () => {
    lines.forEach((line) => line.classList.add('is-on'));
    browser.dataset.step = 'alert';
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return still();

  let run = 0;
  async function play(): Promise<void> {
    const id = ++run;
    const alive = () => id === run;
    if (replay) replay.hidden = true;
    browser!.dataset.step = 'work';
    lines.forEach((line) => line.classList.remove('is-on'));
    await wait(900);
    for (const line of lines) {
      if (!alive()) return;
      line.classList.add('is-on');
      await wait(1100);
    }
    if (!alive()) return;
    browser!.dataset.step = 'alert';
    await wait(3600);
    if (!alive()) return;
    browser!.dataset.step = 'reply';
    await wait(2600);
    if (!alive()) return;
    browser!.dataset.step = 'alert';
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

document.querySelectorAll<HTMLElement>('[data-cf-demo]').forEach(setupDemo);
document.querySelectorAll<HTMLElement>('[data-cf-tabs]').forEach(setupTabs);
