import { animate, inView, stagger, type AnimationSequence } from 'motion';
import { validPublicReviews } from '../lib/product-reviews.mjs';

/** A single product story, with the selected profile carried into its review. */
function setupProfesFilm() {
  document.querySelectorAll<HTMLElement>('[data-profes-film]').forEach(root => {
    if (root.dataset.filmInitialized) return;
    root.dataset.filmInitialized = 'true';
    const get = <T extends Element = HTMLElement>(name: string) => root.querySelector<T>(`[data-film-${name}]`)!;
    const panel = get<HTMLElement>('window');
    const query = get<HTMLElement>('query');
    const profiles = Array.from(root.querySelectorAll<HTMLElement>('[data-film-profile]'));
    const detail = get<HTMLElement>('detail');
    const pieces = Array.from(root.querySelectorAll<HTMLElement>('[data-film-detail-piece]'));
    const steps = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-film-step]'));
    const toggle = get<HTMLButtonElement>('toggle');
    const label = get<HTMLElement>('toggle-label');
    const icon = get<SVGPathElement>('toggle-icon');
    const preference = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    const course = query.textContent ?? '';
    const duration = 11.2;
    let timeline: ReturnType<typeof animate> | undefined;
    let visible = false;
    let userPaused = false;
    let phase = -1;
    let disposed = false;

    const setPhase = (next: number) => {
      if (phase === next) return;
      phase = next;
      root.dataset.filmPhase = String(next);
      steps.forEach((step, index) => step.setAttribute('aria-pressed', String(index === next)));
      get('status').textContent = ['Un curso. Más perspectivas.', 'Compara antes de elegir.', 'Una nota. Toda una experiencia.'][next];
    };
    const updateControl = () => {
      toggle.hidden = preference.matches;
      toggle.setAttribute('aria-pressed', String(userPaused));
      toggle.setAttribute('aria-label', userPaused ? 'Reanudar demostración' : 'Pausar demostración');
      label.textContent = userPaused ? 'Reanudar' : 'Pausar';
      icon.setAttribute('d', userPaused ? 'm9 5 10 7-10 7Z' : 'M9 5v14M15 5v14');
    };
    const sync = () => {
      if (!timeline || disposed) return;
      if (preference.matches || userPaused || !visible || document.hidden) timeline.pause();
      else timeline.play();
      root.dataset.filmState = userPaused ? 'paused' : visible && !document.hidden ? 'playing' : 'suspended';
      updateControl();
    };
    const showStatic = () => {
      timeline?.cancel();
      timeline = undefined;
      // Restore the complete, readable HTML, including when the preference
      // changes midway through an animation. No content relies on JS to exist.
      root.querySelectorAll<HTMLElement>('[style]').forEach(node => node.removeAttribute('style'));
      root.removeAttribute('data-film-ready');
      root.dataset.filmState = 'static';
      query.textContent = course;
      steps.forEach(step => { step.disabled = true; });
      toggle.hidden = true;
      phase = -1;
      setPhase(2);
    };
    const build = () => {
      if (preference.matches || disposed) { showStatic(); return; }
      timeline?.cancel();
      userPaused = false;
      phase = -1;
      const chosen = profiles[0];
      const otherProfiles = profiles.slice(1);
      const caret = get<HTMLElement>('caret');
      const pointer = get<HTMLElement>('pointer');
      const click = get<HTMLElement>('click');
      const note = get<HTMLElement>('note');
      const decision = get<HTMLElement>('decision');
      const backs = Array.from(root.querySelectorAll<HTMLElement>('[data-film-back]'));
      caret.style.display = 'block';
      pointer.style.display = 'block';
      click.style.display = 'block';
      const sequence: AnimationSequence = [
        [panel, { opacity: [0, 1], y: [24, 0], rotateX: [9, 2], rotateY: [-9, -3], rotateZ: [-2, 0], scale: [.96, 1] }, { at: 0, type: 'spring', duration: 1.15, bounce: .14 }],
        [backs, { opacity: [0, 1], y: [15, 0] }, { at: .12, duration: .9, delay: stagger(.08), ease: [.22, 1, .36, 1] }],
        [query, { opacity: [0, 1] }, { at: .35, duration: .15 }],
        [(value: number) => { query.textContent = course.slice(0, Math.round(value)); }, [0, course.length], { at: .4, duration: 1.15, ease: 'linear' }],
        [caret, { opacity: [0, 1, 0, 1, 0, 1, 0] }, { at: .35, duration: 1.5, ease: 'linear' }],
        [get('enter'), { scale: [1, .85, 1], backgroundColor: ['#ffffff', '#d9eff8', '#ffffff'] }, { at: 1.6, duration: .36 }],
        [get('count'), { opacity: [0, 1] }, { at: 1.95, duration: .3 }],
        [profiles, { opacity: [0, 1], y: [16, 0], scale: [.98, 1] }, { at: 1.9, delay: stagger(.12), type: 'spring', duration: .65, bounce: .1 }],
        [note, { opacity: [0, 1], y: [15, 0], rotate: [8, 5], scale: [.96, 1] }, { at: 2.4, type: 'spring', duration: .85, bounce: .16 }],
        [pointer, { opacity: [0, 1], x: [40, 0], y: [85, 0] }, { at: 3.25, duration: .7, ease: [.22, 1, .36, 1] }],
        [pointer, { scale: [1, .83, 1] }, { at: 4, duration: .25 }],
        [click, { opacity: [0, .7, 0], scale: [.3, 1.6] }, { at: 4, duration: .55 }],
        [chosen, { backgroundColor: ['#edf8fc', '#dff2fa', '#edf8fc'] }, { at: 4, duration: .7 }],
        [otherProfiles, { opacity: [1, 0], y: [0, -8], scale: [1, .98] }, { at: 4.5, duration: .35, delay: stagger(.06), ease: [.4, 0, 1, 1] }],
        [pointer, { opacity: [1, 0], y: [0, 6] }, { at: 4.5, duration: .25 }],
        [panel, { rotateX: [2, 0], rotateY: [-3, 0], scale: [1, 1.025] }, { at: 4.65, type: 'spring', duration: 1.05, bounce: .1 }],
        [detail, { opacity: [0, 1], y: [12, 0] }, { at: 4.85, duration: .5, ease: [.22, 1, .36, 1] }],
        [pieces, { opacity: [0, 1], y: [10, 0] }, { at: 5, duration: .55, delay: stagger(.15), ease: [.22, 1, .36, 1] }],
        [decision, { opacity: [0, 1], y: [18, 0], rotate: [0, -3], scale: [.96, 1] }, { at: 6.3, type: 'spring', duration: .85, bounce: .16 }],
        // Hold the review for reading, then fade out before the next loop.
        [panel, { opacity: [1, 0], y: [0, -10] }, { at: 10.45, duration: .55, ease: [.4, 0, 1, 1] }],
        [[...backs, note, decision], { opacity: [1, 0] }, { at: 10.45, duration: .5 }],
        // A reading hold is part of the timeline, so background tabs and the
        // pause control also suspend it. There are no detached timeout chains.
        [(time: number) => setPhase(time < 1.9 ? 0 : time < 4.85 ? 1 : 2), [0, duration], { at: 0, duration, ease: 'linear' }],
      ];
      timeline = animate(sequence, { autoplay: false, repeat: Infinity });
      root.dataset.filmReady = 'true';
      steps.forEach(step => { step.disabled = false; });
      setPhase(0);
      sync();
    };
    const onToggle = () => {
      if (!timeline) return;
      userPaused = !userPaused;
      sync();
    };
    const onStep = (event: Event) => {
      if (!timeline || preference.matches) return;
      const next = Number((event.currentTarget as HTMLElement).dataset.filmStep);
      timeline.pause();
      timeline.time = [1.65, 3.1, 7.5][next];
      userPaused = true;
      setPhase(next);
      sync();
    };
    toggle.addEventListener('click', onToggle);
    steps.forEach(step => step.addEventListener('click', onStep));
    preference.addEventListener('change', build);
    document.addEventListener('visibilitychange', sync);
    const stopObserving = inView(root, () => {
      visible = true;
      sync();
      return () => { visible = false; sync(); };
    }, { amount: .25 });
    build();
    document.addEventListener('astro:before-swap', () => {
      disposed = true;
      stopObserving();
      timeline?.cancel();
      preference.removeEventListener('change', build);
      document.removeEventListener('visibilitychange', sync);
      toggle.removeEventListener('click', onToggle);
      steps.forEach(step => step.removeEventListener('click', onStep));
    }, { once: true });
  });
}
setupProfesFilm();
document.addEventListener('astro:page-load', setupProfesFilm);

/** Independent idle and gesture cycles keep Campu's expression unhurried. */
function setupCampuMotion() {
  document.querySelectorAll<HTMLElement>('[data-campu-motion]').forEach(root => {
    if (root.dataset.campuInitialized) return;
    const character = root.querySelector<HTMLElement>('[data-campu-character]');
    const halo = root.querySelector<HTMLElement>('.campu-intro__orbit');
    const toggle = root.querySelector<HTMLButtonElement>('[data-campu-toggle]');
    const arm = root.querySelector<HTMLElement>('[data-campu-arm]');
    const eyes = Array.from(root.querySelectorAll<HTMLElement>('[data-campu-eye]'));
    const layers = Array.from(root.querySelectorAll<HTMLImageElement>('[data-campu-layer]'));
    if (!character || !halo || !toggle) return;
    root.dataset.campuInitialized = 'true';
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let cycles: ReturnType<typeof animate>[] = [];
    let rigReady = false;
    let visible = false;
    let userPaused = false;
    let disposed = false;
    const pendingLoads: (() => void)[] = [];

    const sync = () => {
      if (disposed) return;
      const playing = visible && !document.hidden && !userPaused && !preference.matches;
      cycles.forEach(cycle => { if (playing) cycle.play(); else cycle.pause(); });
      root.dataset.campuState = preference.matches ? 'static' : userPaused ? 'paused' : playing ? 'playing' : 'suspended';
      toggle.hidden = preference.matches;
      const label = userPaused ? 'Reanudar animación de Campu' : 'Pausar animación de Campu';
      toggle.setAttribute('aria-label', label);
      toggle.setAttribute('aria-pressed', String(userPaused));
      toggle.title = label;
      toggle.firstElementChild!.textContent = userPaused ? '▶' : 'Ⅱ';
    };
    const reset = () => {
      cycles.forEach(cycle => cycle.cancel());
      cycles = [];
      [character, halo, arm, ...eyes].forEach(part => part?.style.removeProperty('transform'));
    };
    const build = () => {
      reset();
      root.dataset.campuRig = rigReady && !preference.matches ? 'ready' : 'fallback';
      if (!preference.matches) {
        const idle: AnimationSequence = [
          // Matching first/last poses and easing keep the loop from snapping.
          [character, {
            y: [0, -7, -10, -3, 0],
            rotate: [0, -1.4, .8, -.3, 0],
            scale: [1, 1.008, 1.012, 1.004, 1],
          }, { at: 0, duration: 6.8, times: [0, .28, .58, .82, 1], ease: 'easeInOut' }],
          [halo, { scale: [1, 1.025, 1] }, { at: 0, duration: 6.8, ease: 'easeInOut' }],
        ];
        cycles.push(animate(idle, { autoplay: false, repeat: Infinity }));
        if (rigReady && arm && eyes.length === 2) {
          const gestures: AnimationSequence = [
            [arm, { rotate: [0, -8, 7, -6, 5, -2, 0] },
              { at: .65, duration: 2.25, times: [0, .14, .32, .5, .68, .84, 1], ease: 'easeInOut' }],
            [arm, { rotate: [0, -6, 5, -4, 0] },
              { at: 10.6, duration: 1.85, ease: 'easeInOut' }],
            // Leave a quiet hold before repeating, rather than waving nonstop.
            [arm, { rotate: [0, 0] }, { at: 18.7, duration: .1 }],
          ];
          // Quick closures, slower openings, plus one occasional double blink.
          for (const at of [2.8, 6.65, 6.99, 11.8, 16.6]) {
            gestures.push([eyes, { scaleY: [1, .08, 1] },
              { at, duration: .24, times: [0, .38, 1], delay: stagger(.012), ease: 'easeInOut' }]);
          }
          cycles.push(animate(gestures, { autoplay: false, repeat: Infinity }));
        }
      }
      sync();
    };
    const onToggle = () => { userPaused = !userPaused; sync(); };
    toggle.addEventListener('click', onToggle);
    preference.addEventListener('change', build);
    document.addEventListener('visibilitychange', sync);
    const stopObserving = inView(root, () => {
      visible = true;
      sync();
      return () => { visible = false; sync(); };
    }, { amount: .15 });
    build();
    // Lazy images can reject decode() before their first request starts. Wait
    // for load first, keeping the original image visible during that interval.
    if (arm && eyes.length === 2 && layers.length) {
      const prepareLayer = async (image: HTMLImageElement) => {
        if (!image.complete) await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            image.removeEventListener('load', onLoad);
            image.removeEventListener('error', onError);
          };
          const onLoad = () => { cleanup(); resolve(); };
          const onError = () => { cleanup(); reject(new Error('Campu layer unavailable')); };
          image.addEventListener('load', onLoad, { once: true });
          image.addEventListener('error', onError, { once: true });
          pendingLoads.push(cleanup);
        });
        await image.decode();
      };
      void Promise.all(layers.map(prepareLayer)).then(() => {
        if (disposed) return;
        rigReady = true;
        build();
      }).catch(() => { /* The original responsive image remains the fallback. */ });
    }
    document.addEventListener('astro:before-swap', () => {
      disposed = true;
      stopObserving();
      reset();
      pendingLoads.forEach(cleanup => cleanup());
      preference.removeEventListener('change', build);
      document.removeEventListener('visibilitychange', sync);
      toggle.removeEventListener('click', onToggle);
      delete root.dataset.campuInitialized;
    }, { once: true });
  });
}
setupCampuMotion();
document.addEventListener('astro:page-load', setupCampuMotion);

/** Public reviews stay live so edits and withdrawals are respected. */
function setupCampusFeedback() {
  document.querySelectorAll<HTMLElement>('[data-campus-feedback]').forEach(root => {
    if (root.dataset.feedbackInitialized) return;
    root.dataset.feedbackInitialized = 'true';
    const card = root.querySelector<HTMLElement>('[data-public-feedback]');
    const text = root.querySelector<HTMLElement>('[data-feedback-text]');
    const link = root.querySelector<HTMLAnchorElement>('[data-feedback-link]');
    if (!card || !text || !link) return;
    const controller = new AbortController();
    const stopObserving = inView(root, () => {
      void (async () => {
        try {
          const response = await fetch('/api/app/blackboard-reviews/?page=1', {
            credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' },
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]),
          });
          if (!response.ok) return;
          const data = await response.json();
          if (controller.signal.aborted || !validPublicReviews(data) || data.page !== 1 || !data.reviews.length) return;
          const review = data.reviews[0];
          text.textContent = `“${review.text}”`;
          link.href = `/opiniones-campus/#review-${encodeURIComponent(review.id)}`;
          card.hidden = false;
        } catch { /* The sourced WhatsApp quote and public review link remain. */ }
      })();
    }, { margin: '200px 0px' });
    document.addEventListener('astro:before-swap', () => {
      stopObserving();
      controller.abort();
      delete root.dataset.feedbackInitialized;
    }, { once: true });
  });
}
setupCampusFeedback();
document.addEventListener('astro:page-load', setupCampusFeedback);
