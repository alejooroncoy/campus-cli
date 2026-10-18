import { setupTurnitinRequest } from './turnitin-request';
import { analyticsHeaders, track } from './analytics';
import { setupTurnitinUploads } from './turnitin-upload';
import { setupTurnitinLogin } from './turnitin-login';
import { setupTurnitinReportViewer, type ReportKind } from './turnitin-report-viewer';
type Order = {
  id: string; amountCents: number; status: string; documentName: string; note: string; isTest?: boolean;
  createdAt: string; paidAt: string | null;
  availableReports?: ReportKind[];
};
type Config = { enabled: boolean; ordersAvailable: boolean; amountCents: number; phone: string; holder: string; maxDocumentBytes: number; maxReceiptBytes: number };
const labels: Record<string,string> = { payment_review: 'Comprobante en revisión', processing: 'Preparando tus informes', completed: 'Informes listos', payment_rejected: 'Pago observado' };
const money = (cents: number) => `S/${(cents / 100).toLocaleString('es-PE')}`;

function setupTurnitin() {
  const form = document.querySelector<HTMLFormElement>('[data-ti-form]');
  if (!form || form.dataset.initialized) return;
  form.dataset.initialized = 'true';
  const status = document.querySelector<HTMLElement>('[data-ti-status]')!;
  const fields = document.querySelector<HTMLFieldSetElement>('[data-ti-fields]')!;
  const refresh = document.querySelector<HTMLButtonElement>('[data-ti-refresh]')!;
  let config: Config;
  let requestId = crypto.randomUUID();
  let refreshPending = false;
  let ordersLoaded = false;
  let pendingOrders = false;
  let disposed = false;
  let statuses = new Map<string, string>();
  let poll: ReturnType<typeof setInterval> | undefined;
  let historyOrders: Order[] = [];
  let historyFilter = 'all';
  let historySearch = '';
  let nextCursor: string | null = null;
  let historyVersion = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let initialLinkHandled = false;
  let linkUnavailable = false;
  const openReports = new Set<string>();
  const more = document.querySelector<HTMLButtonElement>('[data-ti-more]')!;
  const historyCount = document.querySelector<HTMLElement>('[data-ti-history-count]')!;
  const announce = (message: string, quiet = false) => { status.textContent = message; status.classList.toggle('ti-status--quiet', quiet); };
  async function api(path: string, input?: unknown) {
    const response = await fetch(`/api/app/turnitin/${path}`, { credentials: 'same-origin', cache: 'no-store',
      method: input === undefined ? 'GET' : 'POST',
      headers: { ...analyticsHeaders(), ...(input === undefined ? {} : { 'content-type': 'application/json' }) },
      body: input === undefined ? undefined : JSON.stringify(input), signal: AbortSignal.timeout(60000) });
    const result = await response.json().catch(() => ({ error: 'No se pudo conectar con Campus.' }));
    if (!response.ok) throw new Error(result.error ?? 'No se pudo completar la solicitud.');
    return result;
  }
  async function encode(file: File | undefined, max: number) {
    if (!file?.size || file.size > max) throw new Error(`Selecciona un archivo válido de hasta ${Math.round(max / 1024 / 1024)} MB.`);
    const base64 = await new Promise<string>((resolve,reject) => {
      const reader = new FileReader(); reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file);
    });
    return { name: file.name, base64 };
  }
  const selected = (target: HTMLFormElement, name: string) => (target.elements.namedItem(name) as HTMLInputElement).files?.[0];
  function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') {
    const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
  }
  function link(order: Order, kind: string, text: string) {
    const anchor = el('a', text);
    anchor.href = `/api/app/turnitin/orders/${order.id}/files/${kind}`;
    anchor.setAttribute('download', '');
    if (kind === 'similarity' || kind === 'ai') anchor.onclick = () => track('campus_turnitin_download_clicked', { report_kind: kind, is_test: Boolean(order.isTest) });
    return anchor;
  }
  function reportCard(order: Order, kind: ReportKind) {
    const box = el('div', '', 'ti-file-card');
    box.setAttribute('role', 'group');
    const title = kind === 'similarity' ? 'Informe de similitud' : 'Informe de IA';
    box.setAttribute('aria-label', title);
    box.append(el('span', 'PDF · Disponible', 'ti-file-label'), el('h4', title),
      el('p', order.isTest ? 'PDF ficticio para comprobar la entrega. Sin análisis real.' : kind === 'similarity' ? 'Consulta las coincidencias de texto y sus fuentes.' : 'Consulta el resultado de detección de escritura con IA.'));
    const actions = el('div', '', 'ti-file-actions');
    const view = el('button', 'Ver informe', 'app-button');
    view.type = 'button';
    view.setAttribute('aria-label', `Ver ${title.replace('Informe', 'informe')} de ${order.documentName}`);
    view.onclick = () => setupTurnitinReportViewer()?.open({ id: order.id, documentName: order.documentName, isTest: order.isTest, availableReports: order.availableReports }, kind);
    const download = link(order, kind, 'Descargar PDF ↓');
    download.className = 'app-button app-button--secondary';
    download.setAttribute('aria-label', `Descargar ${title.replace('Informe', 'informe')} de ${order.documentName}`);
    actions.append(view, download); box.append(actions); return box;
  }
  function renderOrders(orders: Order[], target: HTMLElement) {
    target.replaceChildren();
    document.querySelector<HTMLElement>('.ti-report-note')!.hidden = orders.length === 0;
    if (!orders.length) {
      const empty = el('div', '', 'ti-empty');
      const filtered = (historyFilter !== 'all' || Boolean(historySearch));
      empty.append(el('h3', filtered ? 'No encontramos revisiones con estos filtros' : 'Aún no tienes revisiones'), el('p', filtered ? 'Prueba otro nombre o selecciona Todas para ver tus trabajos.' : 'Aquí verás el estado y los informes de cada trabajo.', 'ti-muted'));
      target.append(empty); return;
    }
    for (const order of orders) {
      const card = el('article', '', 'ti-order');
      card.id = `ti-order-${order.id}`; card.dataset.status = order.status;
      const head = el('div', '', 'ti-order-heading');
      head.append(el('h3', order.documentName), el('span', order.isTest ? (order.status === 'completed' ? 'Prueba entregada' : 'Prueba en preparación') : labels[order.status] ?? order.status, 'ti-tag'));
      card.append(head);
      {
        const progress = el('ol', '', 'ti-order-progress');
        progress.setAttribute('aria-label', 'Avance de tu revisión');
        const position = order.status === 'completed' ? 2 : order.status === 'processing' ? 1 : 0;
        [order.isTest ? 'Prueba' : 'Pago', 'Revisión', 'Informes'].forEach((label, index) => {
          const step = el('li', label); step.dataset.progress = index < position ? 'done' : index === position ? 'current' : 'pending';
          if (index === position) step.setAttribute('aria-current', 'step');
          progress.append(step);
        });
        card.append(progress);
      }
      card.append(el('p', `${money(order.amountCents)} · ${new Date(order.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })} · Pedido ${order.id.slice(0,8)}`, 'ti-small'));
      if (order.isTest) card.append(el('p', 'Prueba sin abono · PDF ficticios, sin análisis real.', 'ti-small'));
      if (order.note) card.append(el('p', order.note));
      if (order.status === 'processing' && order.paidAt) card.append(el('p', 'Entrega de 10 minutos a 1 hora desde la validación del pago.', 'ti-small'));
      const availableReports = order.availableReports ?? (order.status === 'completed' ? ['similarity', 'ai'] as ReportKind[] : []);
      if (availableReports.length) {
        const reports = el('div', '', 'ti-file-grid');
        for (const kind of availableReports) reports.append(reportCard(order, kind));
        if (order.status === 'completed') {
          const details = el('details', '', 'ti-order-reports');
          details.open = openReports.has(order.id);
          const summary = el('summary');
          const label = availableReports.length === 1 ? `Ver informe de ${availableReports[0] === 'similarity' ? 'similitud' : 'IA'}` : 'Ver informes de similitud e IA';
          summary.append(el('span', label), el('span', '', 'ti-disclosure'));
          summary.lastElementChild!.setAttribute('aria-hidden', 'true');
          details.append(summary, reports);
          details.ontoggle = () => { if (details.open) { openReports.add(order.id); track('campus_turnitin_reports_opened', { is_test: Boolean(order.isTest) }); } else openReports.delete(order.id); };
          card.append(details);
        } else {
          const names = availableReports.map(kind => kind === 'similarity' ? 'similitud' : 'IA');
          card.append(el('p', `${availableReports.length === 1 ? 'El informe' : 'Los informes'} de ${names.join(' e ')} ${availableReports.length === 1 ? 'ya está disponible' : 'ya están disponibles'}.`, 'ti-small'), reports);
          const pending = (['similarity', 'ai'] as const).filter(kind => !availableReports.includes(kind));
          if (pending.length) card.append(el('p', `El informe de ${pending.map(kind => kind === 'similarity' ? 'similitud' : 'IA').join(' e ')} aparecerá aquí cuando esté listo.`, 'ti-muted'));
        }
      } else {
        card.append(el('p', order.status === 'payment_rejected' ? 'Revisa la observación del pago antes de solicitar una nueva revisión.' : order.status === 'payment_review' ? 'Recibimos tu documento y comprobante. Ahora validamos el pago.' : order.isTest ? 'Estamos preparando los PDF de prueba.' : 'Pago validado. Estamos preparando tus informes.', 'ti-muted'));
      }
      target.append(card);
    }
  }
  async function loadOrders(append = false, reset = false) {
    const version = ++historyVersion;
    refreshPending = true; refresh.disabled = more.disabled = true;
    more.textContent = append ? 'Cargando…' : 'Ver más revisiones';
    const query = new URLSearchParams();
    if (historyFilter !== 'all') query.set('status', historyFilter);
    if (historySearch) query.set('search', historySearch);
    if (append && nextCursor) query.set('cursor', nextCursor);
    try {
      const result = await api(`orders?${query}`);
      if (disposed || version !== historyVersion) return;
      const orders: Order[] = result.orders;
      // Older pending orders may be outside the first page. Refresh only their
      // metadata so a completion is visible without collapsing loaded history.
      if (ordersLoaded && !append && !reset && historyFilter === 'all' && !historySearch) {
        const olderPending = historyOrders.filter(order => ['payment_review','processing'].includes(order.status) && !orders.some(item => item.id === order.id)).slice(0,3);
        const updates = await Promise.allSettled(olderPending.map(order => api(`orders/${order.id}`)));
        if (disposed || version !== historyVersion) return;
        for (const update of updates) if (update.status === 'fulfilled' && update.value.order) orders.push(update.value.order);
      }
      for (const order of orders) {
        const previous = statuses.get(order.id);
        const available = order.availableReports ?? (order.status === 'completed' ? ['similarity', 'ai'] as ReportKind[] : []);
        const progress = `${order.status}:${available.join(',')}`;
        if (ordersLoaded && previous && previous !== progress) {
          const previousReports = previous.slice(previous.indexOf(':') + 1).split(',').filter(Boolean);
          const addedReports = available.filter(kind => !previousReports.includes(kind));
          if (order.status === 'completed' && !previous.startsWith('completed:')) announce('Tus informes ya están listos. Ábrelos en Mis revisiones.');
          else if (addedReports.length) announce('Ya tienes un informe disponible. Puedes abrirlo o descargarlo en Mis revisiones.');
        }
        if (previous !== progress) track('campus_turnitin_status_updated', { order_status: order.status, previous_status: previous?.split(':')[0], is_test: Boolean(order.isTest) });
        statuses.set(order.id, progress);
      }
      if (!ordersLoaded || reset || (!append && (historyFilter !== 'all' || Boolean(historySearch)))) historyOrders = orders;
      else {
        const merged = new Map(historyOrders.map(order => [order.id, order]));
        for (const order of orders) merged.set(order.id, order);
        historyOrders = [...merged.values()].sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      }
      if (!ordersLoaded || reset || append || historyFilter !== 'all' || historySearch) nextCursor = result.nextCursor ?? null;
      const counts: Record<string, number> = result.counts ?? {
        all: historyOrders.length, ...Object.fromEntries(Object.keys(labels).map(key => [key, historyOrders.filter(order => order.status === key).length])),
      };
      pendingOrders = counts.payment_review > 0 || counts.processing > 0;
      document.querySelector<HTMLElement>('[data-ti-history-tools]')!.hidden = counts.all <= 1 && !historySearch && historyFilter === 'all';
      document.querySelectorAll<HTMLElement>('[data-ti-count]').forEach(node => { node.textContent = String(counts[node.dataset.tiCount!] ?? 0); });
      const total = counts[historyFilter] ?? 0;
      const updateHistoryCount = () => { historyCount.textContent = `${Math.min(historyOrders.length,total)} de ${total} ${total === 1 ? 'revisión' : 'revisiones'}${historySearch ? ' con este nombre' : ''} · Más recientes primero`; };
      more.hidden = !nextCursor;
      if (!ordersLoaded) {
        const newOrder = document.querySelector<HTMLDetailsElement>('[data-ti-new-order]')!;
        newOrder.open = counts.all === 0;
        if (counts.all === 0) newOrder.parentElement!.prepend(newOrder);
        const linkedId = /^#ti-order-([0-9a-f-]{36})$/i.exec(location.hash)?.[1];
        if (linkedId && !historyOrders.some(order => order.id === linkedId)) {
          try {
            const linked = await api(`orders/${linkedId}`);
            if (disposed || version !== historyVersion) return;
            if (linked.order) historyOrders.unshift(linked.order);
          } catch { linkUnavailable = true; }
        }
        if (linkedId) openReports.add(linkedId);
      }
      ordersLoaded = true;
      updateHistoryCount();
      renderOrders(historyOrders, document.querySelector<HTMLElement>('[data-ti-orders]')!);
      if (!initialLinkHandled && /^#ti-order-[0-9a-f-]{36}$/i.test(location.hash)) {
        document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' });
        initialLinkHandled = true;
      }
    } finally {
      if (version === historyVersion) { refreshPending = false; refresh.disabled = more.disabled = false; more.textContent = 'Ver más revisiones'; }
    }
  }
  refresh.onclick = async () => {
    track('campus_turnitin_history_refreshed');
    try { await loadOrders(); announce('Estado actualizado.'); } catch (error) { announce((error as Error).message); }
  };
  more.onclick = async () => {
    if (!nextCursor || refreshPending) return;
    try { await loadOrders(true); } catch (error) { announce((error as Error).message); }
  };
  document.querySelectorAll<HTMLButtonElement>('[data-ti-filter]').forEach(button => {
    button.onclick = () => {
      historyFilter = button.dataset.tiFilter!;
      track('campus_turnitin_history_filtered', { order_status: historyFilter });
      document.querySelectorAll<HTMLButtonElement>('[data-ti-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      void loadOrders(false, true).catch(error => announce(error.message));
    };
  });
  const search = document.querySelector<HTMLInputElement>('[data-ti-search]')!;
  const searchHistory = () => {
    clearTimeout(searchTimer);
    historySearch = search.value.trim();
    void loadOrders(false, true).catch(error => announce(error.message));
  };
  search.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(searchHistory, 300); };
  search.addEventListener('search', searchHistory);
  const uploads = setupTurnitinUploads(form, kind => kind === 'document' ? (config?.maxDocumentBytes ?? 10 * 1024 * 1024) : (config?.maxReceiptBytes ?? 5 * 1024 * 1024));
  const request = setupTurnitinRequest(form, uploads);
  const requestPanel = document.querySelector<HTMLDetailsElement>('[data-ti-new-order]')!;
  requestPanel.addEventListener('toggle', () => { if (requestPanel.open && !form.hidden && !fields.disabled) request.start(); });
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const submitText = submit.querySelector<HTMLElement>('[data-ti-submit-text]')!;
  const submissionMessage = form.querySelector<HTMLElement>('[data-ti-submit-status]')!;
  const showSubmission = (message: string) => { submissionMessage.textContent = message; submissionMessage.hidden = !message; };
  form.addEventListener('change', () => { requestId = crypto.randomUUID(); showSubmission(''); });
  form.onsubmit = async event => {
    event.preventDefault();
    if (fields.disabled) return;
    if (!request.isPayment()) { request.next(); return; }
    if (!uploads.validate('document')) { request.document(); return; }
    if (!uploads.validate() || !form.reportValidity()) { track('campus_flow_failed', { step: 'upload', error_kind: 'validation' }); return; }
    track('campus_turnitin_submit_started');
    fields.disabled = true; submit.setAttribute('aria-busy', 'true'); submitText.textContent = 'Enviando…'; showSubmission('Enviando tu documento y comprobante. Mantén esta página abierta.'); announce('Enviando tu documento y comprobante…', true);
    try {
      const received = await api('orders', { requestId, amountCents: config.amountCents, consent: (form.elements.namedItem('consent') as HTMLInputElement).checked,
        document: await encode(selected(form,'document'),config.maxDocumentBytes), receipt: await encode(selected(form,'receipt'),config.maxReceiptBytes) });
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(received.order?.id ?? '')) throw new Error('No pudimos confirmar el envío. Vuelve a intentarlo; conservamos tus archivos.');
      track('campus_turnitin_submitted');
      form.reset(); uploads.reset(); request.reset(); showSubmission(''); requestId = crypto.randomUUID();
      announce('Pedido recibido. Tu comprobante está en revisión. Consulta el estado en Mis revisiones.');
      document.querySelector<HTMLDetailsElement>('[data-ti-new-order]')!.open = false;
      const reviewPanel = document.querySelector<HTMLElement>('[data-ti-my-orders-panel]')!;
      reviewPanel.parentElement!.prepend(reviewPanel);
      reviewPanel.scrollIntoView({ block: 'start' });
      historyFilter = 'all'; historySearch = ''; search.value = '';
      document.querySelectorAll<HTMLButtonElement>('[data-ti-filter]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.tiFilter === 'all')));
      try { await loadOrders(false, true); } catch { announce('Tu pedido ya fue recibido. Usa Actualizar estado para consultar su avance.'); }
    } catch (error) { track('campus_flow_failed', { step: 'turnitin', error_kind: 'rejected' }); showSubmission((error as Error).message); announce((error as Error).message, true); }
    finally { fields.disabled = false; submit.removeAttribute('aria-busy'); submitText.textContent = 'Enviar revisión'; }
  };
  const cleanup = () => { disposed = true; clearInterval(poll); clearTimeout(searchTimer); };
  document.addEventListener('astro:before-swap', cleanup, { once: true });
  window.addEventListener('pagehide', cleanup, { once: true });
  void (async () => {
    try {
      config = await api('config');
      document.querySelector<HTMLElement>('[data-ti-price]')!.textContent = config.amountCents === 800 ? 'S/8 · Lanzamiento' : `${money(config.amountCents)} por documento`;
      document.querySelector<HTMLElement>('[data-ti-amount]')!.textContent = money(config.amountCents);
      document.querySelector<HTMLElement>('[data-ti-phone]')!.textContent = config.phone;
      document.querySelector<HTMLElement>('[data-ti-holder]')!.textContent = config.holder;
      if (!config.ordersAvailable) {
        document.querySelector<HTMLElement>('[data-ti-new-order]')!.hidden = true;
        document.querySelector<HTMLElement>('[data-ti-my-orders-panel]')!.hidden = true;
        announce('El servicio todavía no está recibiendo pedidos. No realices pagos por ahora.');
        return;
      }
      const response = await fetch('/api/app/session', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo comprobar tu sesión.');
      const session = await response.json();
      if (disposed) return;
      if (!session.authenticated) {
        document.querySelector<HTMLElement>('[data-ti-login]')!.hidden = false;
        announce(config.enabled ? 'Inicia sesión para solicitar o consultar una revisión.' : 'Los pedidos nuevos están pausados. Inicia sesión para consultar pedidos anteriores.');
        setupTurnitinLogin()?.open(config.amountCents);
        return;
      }
      form.hidden = !config.enabled; refresh.hidden = false;
      await loadOrders();
      if (config.enabled && requestPanel.open) request.start();
      // Refresh pending reviews while the student is viewing this page.
      poll = setInterval(() => {
        if (!disposed && !refreshPending && pendingOrders && document.visibilityState === 'visible')
          void loadOrders().catch(() => {});
      }, 30000);
      announce(linkUnavailable ? 'No pudimos abrir esa revisión. Comprueba que entraste con la cuenta del pedido.' : statuses.size ? 'Aquí tienes tus revisiones. Abre o descarga los informes que ya estén listos.' : config.enabled ? 'Selecciona el documento, paga y adjunta tu comprobante para enviar el pedido.' : 'Los pedidos nuevos están pausados. Puedes consultar y descargar tus informes anteriores.', config.enabled);
    } catch (error) { announce((error as Error).message); }
  })();
}
setupTurnitin();
document.addEventListener('astro:page-load', setupTurnitin);
