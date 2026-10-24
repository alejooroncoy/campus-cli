type Events = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

// Read only the conserved-version list. Never reconcile or save the editor here.
export function watchLibraryVersions(options: {
  window: Events;
  document: Events;
  active: () => boolean;
  refresh: () => Promise<void>;
  interval: (callback: () => void) => () => void;
}) {
  let running = false, pending = false, stopped = false;
  let cancelTimer: (() => void) | undefined;
  const refresh = async () => {
    if (stopped || !options.active()) return;
    if (running) { pending = true; return; }
    running = true;
    try {
      do {
        pending = false;
        await options.refresh();
      } while (pending && !stopped && options.active());
    } catch { /* A later focus, reconnect or timer retries a failed read. */ }
    finally { running = false; }
  };
  const request = () => { void refresh(); };
  const pause = () => { cancelTimer?.(); cancelTimer = undefined; };
  const resume = () => {
    if (stopped) return;
    cancelTimer ??= options.interval(request);
    request();
  };
  for (const event of ['online', 'focus']) options.window.addEventListener(event, request);
  options.window.addEventListener('pagehide', pause);
  options.window.addEventListener('pageshow', resume);
  options.document.addEventListener('visibilitychange', request);
  cancelTimer = options.interval(request);
  return {
    refresh: request,
    stop() {
      stopped = true;
      pause();
      for (const event of ['online', 'focus']) options.window.removeEventListener(event, request);
      options.window.removeEventListener('pagehide', pause);
      options.window.removeEventListener('pageshow', resume);
      options.document.removeEventListener('visibilitychange', request);
    },
  };
}
