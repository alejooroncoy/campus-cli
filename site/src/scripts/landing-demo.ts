import { animate, inView, type AnimationSequence } from 'motion';

function setupLandingDemo() {
  document.querySelectorAll<HTMLElement>('[data-campus-demo]').forEach(root => {
    if (root.dataset.initialized) return;
    root.dataset.initialized = 'true';

    const question = root.querySelector<HTMLElement>('.cp-motion__question');
    const thinking = root.querySelector<HTMLElement>('.cp-motion__thinking');
    const avatar = root.querySelector<HTMLElement>('.cp-motion__answer > img');
    const context = root.querySelector<HTMLElement>('.cp-motion__context');
    const introduction = root.querySelector<HTMLElement>('.cp-motion__answer strong');
    const steps = [...root.querySelectorAll<HTMLElement>('.cp-motion__steps li')];
    const sources = root.querySelector<HTMLElement>('.cp-motion__sources');
    const replay = root.querySelector<HTMLButtonElement>('[data-demo-replay]');
    if (!question || !thinking || !avatar || !context || !introduction || !sources || !replay) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const elements = [question, avatar, context, introduction, ...steps, sources];
    let animation: ReturnType<typeof animate> | undefined;
    let visible = false;
    let started = false;

    const showStatic = () => {
      animation?.stop();
      animation = undefined;
      elements.forEach(element => {
        element.style.opacity = '1';
        element.style.transform = 'none';
      });
      thinking.style.opacity = '0';
      replay.hidden = true;
      root.dataset.demoState = 'static';
    };

    const prepare = () => {
      if (reduced.matches) return showStatic();
      elements.forEach(element => { element.style.opacity = '0'; });
      const reveal = (element: HTMLElement, at: number): AnimationSequence[number] =>
        [element, { opacity: [0, 1], y: [9, 0] }, { at, duration: 0.4 }];
      const sequence: AnimationSequence = [
        reveal(question, 0),
        reveal(avatar, 0.65),
        [thinking, { opacity: [0, 1] }, { at: 0.65, duration: 0.2 }],
        [thinking, { opacity: [1, 0] }, { at: 1.55, duration: 0.15 }],
        reveal(context, 1.7),
        reveal(introduction, 2.05),
        ...steps.map((step, index) => reveal(step, 2.4 + index * 0.4)),
        reveal(sources, 3.75),
      ];
      thinking.querySelectorAll('i').forEach((dot, index) => {
        sequence.push([dot, { y: [0, -3, 0], opacity: [0.4, 1, 0.4] }, { at: 0.8 + index * 0.1, duration: 0.6 }]);
      });
      animation = animate(sequence, { defaultTransition: { ease: [0.22, 1, 0.36, 1] } });
      animation.pause();
      animation.time = 0;
      started = false;
      replay.hidden = false;
      replay.disabled = true;
      root.dataset.demoState = 'ready';
    };

    const play = () => {
      if (!animation || reduced.matches) return;
      const current = animation;
      started = true;
      root.dataset.demoState = 'playing';
      current.play();
      current.then(() => {
        if (animation !== current) return;
        root.dataset.demoState = 'complete';
        replay.disabled = false;
      });
    };

    const updateVisibility = () => {
      if (!animation || root.dataset.demoState === 'complete') return;
      if (visible && !document.hidden) {
        if (started) animation.play();
        else play();
      } else animation.pause();
    };
    const updatePreference = () => {
      showStatic();
      prepare();
      updateVisibility();
    };
    const restart = () => {
      prepare();
      updateVisibility();
    };

    prepare();
    const stopObserving = inView(root, () => {
      visible = true;
      updateVisibility();
      return () => { visible = false; updateVisibility(); };
    }, { amount: 0.2 });
    replay.addEventListener('click', restart);
    reduced.addEventListener('change', updatePreference);
    document.addEventListener('visibilitychange', updateVisibility);
    document.addEventListener('astro:before-swap', () => {
      stopObserving();
      animation?.stop();
      replay.removeEventListener('click', restart);
      reduced.removeEventListener('change', updatePreference);
      document.removeEventListener('visibilitychange', updateVisibility);
    }, { once: true });
  });
}

setupLandingDemo();
document.addEventListener('astro:page-load', setupLandingDemo);
