import { isLibraryPage, isLibraryRoute, isLibraryWorkspace, isLibraryWorkspaceViewHash, isSameLibraryDocument, librarySearchURL } from '../lib/library-navigation';
import { initLibrary } from './library';
import { unlockImported } from '../lib/library-unlock';

type Position = { x: number; y: number; filterX?: number; courseX?: number };
type LibraryHistory = { position: Position; url: string };
type Metadata = { title: string; nodes: Element[] };
const initialRoot = document.querySelector<HTMLElement>('[data-library-public], [data-library]');
if (initialRoot && !initialRoot.dataset.navigationReady) {
  initialRoot.dataset.navigationReady = 'true';
  let root: HTMLElement = initialRoot;
  let rendered = new URL(location.href);
  let controller: AbortController | null = null;
  let retryURL: URL | null = null;
  let retryPop = false;
  let frame = 0;
  // Keep the original editor node, not an HTML snapshot: FileList, fields, criteria,
  // consent and the controller's current draft/step all stay alive in this tab.
  let workspace: { root: HTMLElement; metadata: Metadata } | null = null;
  const workspacePositions = new Map<string, Position>();
  const previousRestoration = history.scrollRestoration;
  const managedHead = [
    'meta[name="description"]', 'meta[name="robots"]', 'link[rel="canonical"]',
    'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:url"]', 'meta[property="og:type"]',
    'meta[name="twitter:title"]', 'meta[name="twitter:description"]', 'script[type="application/ld+json"]',
  ];
  const metadataFrom = (page: Document): Metadata => ({ title: page.title, nodes: Array.from(page.head.querySelectorAll(managedHead.join(','))).map(node => node.cloneNode(true) as Element) });
  function syncMetadata(metadata: Metadata) {
    document.title = metadata.title;
    document.head.querySelectorAll(managedHead.join(',')).forEach(node => node.remove());
    metadata.nodes.forEach(node => document.head.append(node.cloneNode(true)));
  }
  const contentOf = (element: HTMLElement) => element.querySelector<HTMLElement>('#contenido, #lib-workspace')!;
  const position = (): Position => ({
    x: scrollX, y: scrollY,
    filterX: root.querySelector<HTMLElement>('.lib-type-tabs')?.scrollLeft ?? 0,
    courseX: root.querySelector<HTMLElement>('.lib-course-sidebar nav')?.scrollLeft ?? 0,
  });
  const restorePosition = (pos: Position) => {
    const filters = root.querySelector<HTMLElement>('.lib-type-tabs');
    const courses = root.querySelector<HTMLElement>('.lib-course-sidebar nav');
    if (filters && pos.filterX !== undefined) filters.scrollLeft = pos.filterX;
    if (courses && pos.courseX !== undefined) courses.scrollLeft = pos.courseX;
    scrollTo({ left: pos.x, top: pos.y, behavior: 'instant' });
  };
  const stateFor = (url: URL, pos: Position) => ({ ...history.state, campusLibrary: { url: url.href, position: pos } satisfies LibraryHistory });
  const viewKey = (url: URL) => url.hash || '#aportes';
  function rememberPosition() {
    if (!isSameLibraryDocument(new URL(location.href), rendered)) return;
    const url = new URL(location.href), pos = position();
    history.replaceState(stateFor(url, pos), '', url.href);
    if (isLibraryWorkspace(url, location.origin)) workspacePositions.set(viewKey(url), pos);
  }
  function statusUI(element = root) {
    return {
      box: element.querySelector<HTMLElement>('[data-library-navigation-status]')!,
      text: element.querySelector<HTMLElement>('[data-library-navigation-message]')!,
      retry: element.querySelector<HTMLButtonElement>('[data-library-navigation-retry]')!,
    };
  }
  function clearBusy(element: HTMLElement) {
    contentOf(element).removeAttribute('aria-busy');
    delete element.dataset.loading;
  }
  function initializeWorkspace(element: HTMLElement) {
    initLibrary(element);
    element.dispatchEvent(new Event('campus:library-route'));
  }
  void unlockImported(initialRoot);
  if (initialRoot.matches('[data-library]')) {
    workspace = { root: initialRoot, metadata: metadataFrom(document) };
    initializeWorkspace(initialRoot);
  }
  history.scrollRestoration = 'manual';
  history.replaceState(stateFor(rendered, position()), '', location.href);
  addEventListener('scroll', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; rememberPosition(); });
  }, { passive: true });
  document.addEventListener('scroll', event => {
    const target = event.target;
    if (target instanceof Element && root.contains(target) &&
      target.matches('.lib-type-tabs, .lib-course-sidebar nav')) rememberPosition();
  }, { capture: true, passive: true });
  addEventListener('pagehide', () => {
    history.scrollRestoration = previousRestoration;
    const pending = controller;
    controller = null;
    pending?.abort();
    clearBusy(root);
  });
  addEventListener('pageshow', () => { history.scrollRestoration = 'manual'; });

  async function navigate(url: URL, pop = false, restored?: Position) {
    const previous = controller;
    controller = null;
    previous?.abort();
    clearBusy(root);
    const status = statusUI();
    // Public fragment links remain native. Workspace hashes select mounted views.
    if (isLibraryPage(url, location.origin) && isSameLibraryDocument(url, rendered)) {
      if (url.hash !== rendered.hash || pop) {
        rendered = url;
        status.text.textContent = '';
        status.box.classList.add('lib-navigation-quiet');
        status.retry.hidden = true;
        if (restored) restorePosition(restored);
        return;
      }
      if (!retryURL) { status.text.textContent = ''; return; }
    }
    if (!pop) rememberPosition();
    const oldPosition = position();
    const samePath = url.pathname === rendered.pathname;
    const requestRoot = root;
    const active = new AbortController();
    controller = active;
    const timeout = setTimeout(() => active.abort(new Error('timeout')), 20000);
    status.box.classList.add('lib-navigation-quiet');
    status.retry.hidden = true;
    status.text.textContent = 'Actualizando Biblioteca…';
    contentOf(root).setAttribute('aria-busy', 'true');
    root.dataset.loading = 'true';
    try {
      let next: HTMLElement, metadata: Metadata, finalURL = url;
      if (isLibraryWorkspace(url, location.origin) && workspace) {
        next = workspace.root;
        metadata = workspace.metadata;
      } else {
        const response = await fetch(url, { headers: { Accept: 'text/html' }, credentials: 'same-origin', signal: active.signal });
        if (!response.ok || !response.headers.get('content-type')?.startsWith('text/html')) throw new Error('unavailable');
        finalURL = new URL(response.url);
        if (!isLibraryRoute(finalURL, location.origin)) throw new Error('invalid-route');
        finalURL.hash = url.hash;
        const page = new DOMParser().parseFromString(await response.text(), 'text/html');
        const selector = isLibraryWorkspace(finalURL, location.origin) ? '[data-library]' : '[data-library-public]';
        const found = page.querySelector<HTMLElement>(selector);
        if (!found || !found.querySelector('#contenido, #lib-workspace') || !page.querySelector('link[rel="canonical"]') || !page.title) throw new Error('invalid-page');
        next = found;
        metadata = metadataFrom(page);
        if (isLibraryWorkspace(finalURL, location.origin)) workspace = { root: next, metadata };
      }
      if (controller !== active || active.signal.aborted) return;
      if (!pop) history.pushState(stateFor(finalURL, oldPosition), '', finalURL.href);
      else if (finalURL.href !== location.href) history.replaceState(stateFor(finalURL, restored ?? { x: 0, y: 0 }), '', finalURL.href);
      if (next !== root) root.replaceWith(next);
      root = next;
      rendered = finalURL;
      void unlockImported(root);
      syncMetadata(metadata);
      if (root.matches('[data-library]')) initializeWorkspace(root);
      retryURL = null;
      const resumedPosition = isLibraryWorkspace(finalURL, location.origin) ? workspacePositions.get(viewKey(finalURL)) : undefined;
      if (pop && restored) restorePosition(restored);
      else if (resumedPosition) restorePosition(resumedPosition);
      else if (samePath && !isLibraryWorkspace(finalURL, location.origin)) restorePosition(oldPosition);
      else if (finalURL.hash && isLibraryPage(finalURL, location.origin)) document.getElementById(decodeURIComponent(finalURL.hash.slice(1)))?.scrollIntoView({ block: 'start' });
      else restorePosition({ x: 0, y: Math.max(0, root.getBoundingClientRect().top + scrollY - 100) });
      if (!pop) {
        const heading = (samePath ? root.querySelector<HTMLElement>('#lib-results-title') : null) ?? root.querySelector<HTMLElement>('h1');
        if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      }
      rememberPosition();
      const nextStatus = statusUI();
      nextStatus.box.classList.add('lib-navigation-quiet');
      nextStatus.retry.hidden = true;
      const results = root.querySelector('#lib-results-title');
      nextStatus.text.textContent = root.matches('[data-library]') ? 'Vista actualizada. Tu aporte se conserva en esta pestaña.' : results ? `${results.textContent}. Resultados actualizados.` : 'Ficha del trabajo cargada.';
    } catch {
      if (controller !== active) return;
      retryURL = url;
      retryPop = pop;
      const failed = statusUI();
      failed.box.classList.remove('lib-navigation-quiet');
      failed.text.textContent = 'No pudimos actualizar esta vista. Conservamos el contenido y tus datos. Comprueba tu conexión y vuelve a intentarlo.';
      failed.retry.hidden = false;
      failed.box.tabIndex = -1;
      failed.box.focus();
    } finally {
      clearTimeout(timeout);
      if (controller === active) {
        clearBusy(requestRoot);
        clearBusy(root);
        controller = null;
      }
    }
  }
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (target.closest('[data-library-navigation-retry]')) {
      if (retryURL) void navigate(retryURL, retryPop, history.state?.campusLibrary?.position);
      return;
    }
    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href);
    if (!isLibraryRoute(url, location.origin)) return;
    if (isSameLibraryDocument(url, new URL(location.href)) && url.hash &&
      (isLibraryPage(url, location.origin) || !isLibraryWorkspaceViewHash(url.hash))) return;
    event.preventDefault();
    void navigate(url);
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('.lib-discover-search')) return;
    const url = librarySearchURL(form, location.href);
    if (!isLibraryPage(url, location.origin)) return;
    event.preventDefault();
    void navigate(url);
  });
  addEventListener('popstate', event => {
    const url = new URL(location.href);
    if (isLibraryRoute(url, location.origin)) void navigate(url, true, event.state?.campusLibrary?.position);
  });
}
