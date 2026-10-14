interface ViewportSample {
  width: number;
  layoutHeight: number;
  visibleHeight: number;
  offsetTop: number;
  scale: number;
  editing: boolean;
  mobile: boolean;
}

// Covers browsers that shrink the layout viewport and those that only shrink
// the visual viewport. Small browser-toolbar movements and zoom are not keyboards.
export function createKeyboardViewportState() {
  let width = 0;
  let expandedHeight = 0;
  return (sample: ViewportSample) => {
    if (sample.width !== width) {
      width = sample.width;
      expandedHeight = sample.layoutHeight;
    }
    expandedHeight = Math.max(expandedHeight, sample.layoutHeight, sample.visibleHeight);
    const inset = Math.max(0, sample.layoutHeight - sample.visibleHeight - sample.offsetTop);
    const loss = Math.max(inset, expandedHeight - sample.visibleHeight);
    const open = sample.mobile && sample.editing && Math.abs(sample.scale - 1) < .05
      && loss >= Math.max(120, expandedHeight * .2);
    return { open, inset: open ? inset : 0 };
  };
}

export function watchMobileKeyboard(): () => void {
  const body = document.body;
  const viewport = window.visualViewport;
  const mobile = window.matchMedia('(max-width: 700px)');
  const sampleState = createKeyboardViewportState();
  let frame = 0;
  let keepLatestVisible = false;
  let previousHeight = 0;
  let previousOpen = false;
  let previousDockHeight = 0;
  let observedDock: HTMLElement | null = null;
  const editing = () => {
    const field = document.activeElement;
    return field instanceof HTMLTextAreaElement && !field.readOnly && !field.disabled
      || field instanceof HTMLInputElement && !field.readOnly && !field.disabled
        && ['text','search','email','password','tel','url','number'].includes(field.type)
      || field instanceof HTMLElement && field.isContentEditable;
  };
  const update = () => {
    frame = 0;
    const visibleHeight = viewport?.height ?? window.innerHeight;
    const {open,inset} = sampleState({width:window.innerWidth,layoutHeight:window.innerHeight,
      visibleHeight,offsetTop:viewport?.offsetTop ?? 0,scale:viewport?.scale ?? 1,
      editing:editing(),mobile:mobile.matches});
    body.classList.toggle('app-keyboard-open',open);
    body.style.setProperty('--app-keyboard-inset',`${inset}px`);
    const dock = document.querySelector<HTMLElement>('.app-profes-ai__composer-dock');
    if (dock !== observedDock) {
      if (observedDock) dockObserver.unobserve(observedDock);
      observedDock = dock;
      if (dock) dockObserver.observe(dock);
    }
    const dockHeight = dock?.getBoundingClientRect().height ?? 0;
    body.style.setProperty('--app-keyboard-dock-height',`${dockHeight}px`);
    if (open && keepLatestVisible && (!previousOpen || visibleHeight !== previousHeight || dockHeight !== previousDockHeight)) {
      document.querySelector('.app-profes-ai__conversation')?.lastElementChild?.scrollIntoView({block:'end',behavior:'instant'});
    }
    previousHeight = visibleHeight;
    previousOpen = open;
    previousDockHeight = dockHeight;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const dockObserver = new ResizeObserver(schedule);
  const focus = () => {
    const end = document.querySelector('.app-profes-ai__conversation')?.lastElementChild;
    keepLatestVisible = document.activeElement?.id === 'profes-message' && Boolean(end)
      && end!.getBoundingClientRect().bottom <= (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0) + 80;
    schedule();
  };
  window.addEventListener('resize',schedule);
  viewport?.addEventListener('resize',schedule);
  viewport?.addEventListener('scroll',schedule);
  mobile.addEventListener('change',schedule);
  document.addEventListener('focusin',focus);
  document.addEventListener('focusout',schedule);
  update();
  return () => {
    cancelAnimationFrame(frame);
    dockObserver.disconnect();
    window.removeEventListener('resize',schedule);
    viewport?.removeEventListener('resize',schedule);
    viewport?.removeEventListener('scroll',schedule);
    mobile.removeEventListener('change',schedule);
    document.removeEventListener('focusin',focus);
    document.removeEventListener('focusout',schedule);
    body.classList.remove('app-keyboard-open');
    body.style.removeProperty('--app-keyboard-inset');
    body.style.removeProperty('--app-keyboard-dock-height');
  };
}
