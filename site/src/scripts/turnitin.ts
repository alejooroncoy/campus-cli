import { setupTurnitinRequest } from './turnitin-request';
import { analyticsHeaders, track } from './analytics';
import { setupTurnitinUploads } from './turnitin-upload';
import { setupTurnitinLogin } from './turnitin-login';
import { setupTurnitinReportViewer, type ReportKind } from './turnitin-report-viewer';
type Order = {
  id: string; amountCents: number; status: string; documentName: string; note: string; isTest?: boolean;
  createdAt: string; paidAt: string | null;
  availableReports?: ReportKind[];
  report?: 'ai' | 'similarity' | 'both';
};
type Product = {id: 'ai' | 'similarity' | 'both'; label: string; amountCents: number; reports: ReportKind[]};
type Config = { enabled: boolean; ordersAvailable: boolean; amountCents: number; products?: Product[]; availability?: Record<Product['id'],number>; phone: string; holder: string; maxDocumentBytes: number; maxReceiptBytes: number };
const labels: Record<string,string> = { payment_review: 'Pago en revisión', processing: 'Preparando tus informes', completed: 'Informes listos', payment_rejected: 'Pago observado' };
const money = (cents: number) => `S/${(cents / 100).toLocaleString('es-PE')}`;

function setupTurnitin() {
  const form = document.querySelector<HTMLFormElement>('[data-ti-form]');
  if (!form || form.dataset.initialized) return;
  form.dataset.initialized = 'true';
  const status = document.querySelector<HTMLElement>('[data-ti-status]')!;
  const fields = document.querySelector<HTMLFieldSetElement>('[data-ti-fields]')!;
  const refresh = document.querySelector<HTMLButtonElement>('[data-ti-refresh]')!;
  let config!: Config;
  let authenticated = false;
  let availabilityUnknown = false;
  let checkingAvailability = false;
  let availabilityRefresh: Promise<void> | undefined;
  const requiredReports = (report: Order['report']): ReportKind[] => report === 'ai' ? ['ai'] : report === 'similarity' ? ['similarity'] : ['similarity', 'ai'];
  const productLabel = (report: Order['report']) => report === 'ai' ? 'Solo IA' : report === 'similarity' ? 'Solo similitud' : 'Similitud + IA';
  const selectedReport = () => (form.elements.namedItem('report') as RadioNodeList).value as Product['id'];
  const selectedOffer = () => config.products?.find(product => product.id === selectedReport());
  const canOrder = () => Boolean(config?.enabled && config.ordersAvailable && !availabilityUnknown && config.availability?.[selectedReport()] !== 0);
  function updatePrice() {
    if (!config || !form) return;
    const offer = selectedOffer();
    const amount = offer?.amountCents ?? config.amountCents;
    document.querySelector<HTMLElement>('[data-ti-price]')!.textContent = `${money(amount)} · ${productLabel(selectedReport())}`;
    document.querySelector<HTMLElement>('[data-ti-amount]')!.textContent = money(amount);
    document.querySelector<HTMLElement>('[data-ti-product-summary]')!.textContent = productLabel(selectedReport());
    const availability = document.querySelector<HTMLElement>('[data-ti-availability]')!;
    const count = config.availability?.[selectedReport()];
    availability.textContent = checkingAvailability ? 'Comprobando disponibilidad…' : availabilityUnknown ? 'Comprueba la disponibilidad antes de pagar.' : canOrder() ? 'Puedes continuar con la revisión que elegiste.' : 'Esta revisión no está disponible por ahora.';
    availability.hidden = false;
    form.querySelectorAll<HTMLElement>('[data-ti-option-status]').forEach(node => {
      const id = node.dataset.tiOptionStatus as Product['id'];
      const available = config.enabled && config.ordersAvailable && config.availability?.[id] !== 0;
      node.dataset.state = availabilityUnknown ? 'unknown' : available ? 'available' : 'unavailable';
      node.textContent = availabilityUnknown ? 'Sin confirmar' : available ? 'Disponible' : 'No disponible por ahora';
    });
    form.querySelector<HTMLButtonElement>('[data-ti-next]')!.disabled = !canOrder() || checkingAvailability;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submit.disabled = !canOrder() || checkingAvailability;
    document.querySelectorAll<HTMLButtonElement>('[data-ti-check-capacity]').forEach(button => { button.disabled = checkingAvailability; button.textContent = checkingAvailability ? 'Comprobando…' : 'Comprobar disponibilidad'; });
    document.querySelector<HTMLElement>('[data-ti-payment-availability]')!.textContent = checkingAvailability ? 'Comprobando disponibilidad…' : canOrder() ? 'Esta revisión está disponible. Completa el pago y envía tu pedido; la disponibilidad puede cambiar.' : 'No realices el pago hasta confirmar la disponibilidad.';
    const notice = document.querySelector<HTMLElement>('[data-ti-capacity-notice]')!;
    notice.hidden = canOrder();
    const exhausted = config.availability && !Object.values(config.availability).some(value => value > 0);
    document.querySelector<HTMLElement>('[data-ti-capacity-title]')!.textContent = availabilityUnknown ? 'No pudimos comprobar la disponibilidad' : exhausted ? 'Revisiones no disponibles por ahora' : count === 0 ? `${productLabel(selectedReport())} no está disponible por ahora` : 'Los pedidos nuevos están pausados';
    document.querySelector<HTMLElement>('[data-ti-capacity-message]')!.textContent = availabilityUnknown ? 'No realices el pago. Vuelve a comprobar la disponibilidad; conservamos los archivos que elegiste mientras mantengas esta página abierta.' : exhausted ? 'En este momento no podemos recibir nuevas revisiones. Vuelve a comprobar más tarde. Tus pedidos e informes anteriores siguen disponibles. No realices el pago.' : count === 0 ? 'Puedes elegir otro informe disponible o volver a comprobar más tarde. No realices el pago de esta opción.' : 'No realices el pago por ahora. Tus pedidos e informes anteriores siguen disponibles.';
    requestPanel.hidden = !config.enabled || !config.ordersAvailable;
    form.hidden = !authenticated || requestPanel.hidden;
    if (!canOrder() && request.isPayment()) request.document();
  }
  async function refreshAvailability() {
    if (availabilityRefresh) return availabilityRefresh;
    availabilityRefresh = (async () => {
      checkingAvailability = true; updatePrice();
      try {
        const next: Config = await api('config');
        if (disposed) return;
        config = next;
        config.enabled = config.enabled && requestPanel.dataset.tiServiceEnabled === 'true';
        availabilityUnknown = false;
        document.querySelector<HTMLElement>('[data-ti-phone]')!.textContent = config.phone;
        document.querySelector<HTMLElement>('[data-ti-holder]')!.textContent = config.holder;
      } catch (error) { availabilityUnknown = true; throw error; }
      finally { checkingAvailability = false; availabilityRefresh = undefined; if (!disposed) updatePrice(); }
    })();
    return availabilityRefresh;
  }
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
  const ordersList = document.querySelector<HTMLElement>('[data-ti-orders]')!;
  const historyCount = document.querySelector<HTMLElement>('[data-ti-history-count]')!;
  const announce = (message: string, quiet = false) => { status.textContent = message; status.classList.toggle('ti-status--quiet', quiet); };
  async function api(path: string, input?: unknown) {
    const response = await fetch(`/api/app/turnitin/${path}`, { credentials: 'same-origin', cache: 'no-store',
      method: input === undefined ? 'GET' : 'POST',
      headers: { ...analyticsHeaders(), ...(input === undefined ? {} : { 'content-type': 'application/json' }) },
      body: input === undefined ? undefined : JSON.stringify(input), signal: AbortSignal.timeout(path === 'config' ? 12000 : 60000) });
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
    document.querySelector<HTMLElement>('.ti-report-note')!.hidden = !orders.some(order => (order.availableReports ?? (order.status === 'completed' ? requiredReports(order.report) : [])).includes('ai'));
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
      card.append(el('p', `${productLabel(order.report)} · ${money(order.amountCents)} · ${new Date(order.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })} · Pedido ${order.id.slice(0,8)}`, 'ti-small'));
      if (order.isTest) card.append(el('p', 'Prueba sin abono · PDF ficticios, sin análisis real.', 'ti-small'));
      if (order.status === 'payment_rejected') {
        const observation = el('div', '', 'ti-payment-observation');
        observation.append(el('h4', 'Motivo de la observación'), el('p', order.note || 'No se indicó un motivo. Contacta a soporte para revisar tu pedido.'));
        card.append(observation, el('p', 'El pago no está aprobado. Si ya pagaste, no vuelvas a pagar ni crees otro pedido: revisémoslo contigo.', 'ti-muted'));
        const help = el('a', 'Consultar mi pago por WhatsApp', 'app-button app-button--secondary ti-payment-help');
        help.href = `https://wa.me/51946189585?text=${encodeURIComponent(`Hola, necesito ayuda con el pago observado de mi pedido de Turnitin ${order.id.slice(0,8)}.`)}`;
        help.target = '_blank'; help.rel = 'noopener noreferrer';
        help.setAttribute('aria-label', 'Consultar mi pago observado por WhatsApp (se abre en otra pestaña)');
        card.append(help, el('p', 'Ten a mano tu comprobante y el número de operación para que podamos revisarlos.', 'ti-small'));
      } else if (order.note) card.append(el('p', order.note));
      if (order.status === 'processing' && order.paidAt) card.append(el('p', 'Entrega de 10 minutos a 1 hora desde la validación del pago.', 'ti-small'));
      const availableReports = order.availableReports ?? (order.status === 'completed' ? requiredReports(order.report) : []);
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
          const pending = requiredReports(order.report).filter(kind => !availableReports.includes(kind));
          if (pending.length) card.append(el('p', `El informe de ${pending.map(kind => kind === 'similarity' ? 'similitud' : 'IA').join(' e ')} aparecerá aquí cuando esté listo.`, 'ti-muted'));
        }
      } else if (order.status !== 'payment_rejected') {
        card.append(el('p', order.status === 'payment_review' ? 'Recibimos tu documento y comprobante. Estamos verificando el abono; el pago aún no está aprobado.' : order.isTest ? 'Estamos preparando los PDF de prueba.' : 'Pago validado. Estamos preparando tus informes.', 'ti-muted'));
        if (order.status === 'payment_review' && !order.isTest) card.append(el('p', 'No necesitas volver a pagar ni enviar otro pedido.', 'ti-muted'));
        if (['payment_review', 'processing'].includes(order.status)) {
          const pending = el('div', '', 'ti-pending-reports');
          pending.append(el('h4', 'Aquí aparecerán tus informes'), el('p', 'Cuando estén listos, podrás verlos y descargar los PDF en esta misma revisión. Vuelve a Turnitin con tu cuenta para consultar el avance.', 'ti-muted'));
          card.append(pending);
        }
      }
      target.append(card);
    }
  }
  async function loadOrders(append = false, reset = false) {
    const version = ++historyVersion;
    refreshPending = true; refresh.disabled = more.disabled = true;
    ordersList.setAttribute('aria-busy', 'true');
    if (!append) {
      refresh.setAttribute('aria-busy', 'true');
      refresh.setAttribute('aria-label', 'Actualizando tus revisiones…');
      refresh.querySelector<HTMLElement>('[data-ti-refresh-label]')!.hidden = true;
      refresh.querySelector<HTMLElement>('[data-ti-refresh-skeleton]')!.hidden = false;
    }
    more.setAttribute('aria-busy', String(append));
    if (append) more.setAttribute('aria-label', 'Cargando más revisiones…');
    more.querySelector<HTMLElement>('[data-ti-more-label]')!.hidden = append;
    more.querySelector<HTMLElement>('[data-ti-more-skeleton]')!.hidden = !append;
    if (reset && ordersLoaded) {
      const placeholder = document.createElement('div'); placeholder.className = 'ti-orders-skeleton ti-orders-skeleton--refresh';
      placeholder.setAttribute('role', 'status'); placeholder.setAttribute('aria-label', 'Actualizando revisiones');
      const card = document.createElement('article'); card.className = 'ti-order-skeleton';
      for (const width of ['title', 'line', 'line-short']) { const line = document.createElement('span'); line.className = `ti-inline-skeleton ti-inline-skeleton--${width}`; line.setAttribute('aria-hidden', 'true'); card.append(line); }
      placeholder.append(card); ordersList.prepend(placeholder);
    }
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
        const available = order.availableReports ?? (order.status === 'completed' ? requiredReports(order.report) : []);
        const progress = `${order.status}:${available.join(',')}`;
        if (ordersLoaded && previous && previous !== progress) {
          const previousReports = previous.slice(previous.indexOf(':') + 1).split(',').filter(Boolean);
          const addedReports = available.filter(kind => !previousReports.includes(kind));
          if (order.status === 'completed' && !previous.startsWith('completed:')) {
            openReports.add(order.id);
            announce('Tus informes ya están listos. Ábrelos en Mis revisiones.');
          }
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
        if (historyOrders.length === 1 && historyOrders[0].status === 'completed') openReports.add(historyOrders[0].id);
      }
      ordersLoaded = true;
      updateHistoryCount();
      renderOrders(historyOrders, ordersList);
      if (!initialLinkHandled && /^#ti-order-[0-9a-f-]{36}$/i.test(location.hash)) {
        document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' });
        initialLinkHandled = true;
      }
    } catch (error) {
      if (version === historyVersion && !ordersLoaded) ordersList.replaceChildren();
      throw error;
    } finally {
      if (version === historyVersion) {
        refreshPending = false; refresh.disabled = more.disabled = false;
        ordersList.removeAttribute('aria-busy'); ordersList.querySelectorAll('.ti-orders-skeleton--refresh').forEach(placeholder => placeholder.remove());
        refresh.removeAttribute('aria-busy');
        refresh.removeAttribute('aria-label');
        refresh.querySelector<HTMLElement>('[data-ti-refresh-label]')!.hidden = false;
        refresh.querySelector<HTMLElement>('[data-ti-refresh-skeleton]')!.hidden = true;
        more.removeAttribute('aria-busy');
        more.removeAttribute('aria-label');
        more.querySelector<HTMLElement>('[data-ti-more-label]')!.hidden = false;
        more.querySelector<HTMLElement>('[data-ti-more-skeleton]')!.hidden = true;
      }
    }
  }
  refresh.onclick = async () => {
    track('campus_turnitin_history_refreshed');
    try { await Promise.all([loadOrders(), refreshAvailability()]); announce('Estado y disponibilidad actualizados.'); } catch (error) { announce((error as Error).message); }
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
  const uploads = setupTurnitinUploads(form, kind => kind === 'document' ? (config?.maxDocumentBytes ?? 20 * 1024 * 1024) : (config?.maxReceiptBytes ?? 5 * 1024 * 1024));
  const request = setupTurnitinRequest(form, uploads, async () => {
    try { await refreshAvailability(); return canOrder(); }
    catch { announce('No pudimos comprobar la disponibilidad. No realices el pago; usa Comprobar disponibilidad para intentarlo de nuevo.'); return false; }
  });
  const requestPanel = document.querySelector<HTMLDetailsElement>('[data-ti-new-order]')!;
  requestPanel.addEventListener('toggle', () => { if (requestPanel.open && !form.hidden && !fields.disabled) request.start(); });
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const submitText = submit.querySelector<HTMLElement>('[data-ti-submit-text]')!;
  const submissionMessage = form.querySelector<HTMLElement>('[data-ti-submit-status]')!;
  const showSubmission = (message: string) => { submissionMessage.textContent = message; submissionMessage.hidden = !message; };
  document.querySelectorAll<HTMLButtonElement>('[data-ti-check-capacity]').forEach(button => { button.onclick = async () => {
    if (!config) { location.reload(); return; }
    try { await refreshAvailability(); announce(canOrder() ? 'Esta revisión está disponible. Puedes continuar con tu pedido.' : 'No realices el pago. Revisa el aviso de disponibilidad.'); }
    catch { announce('No pudimos comprobar la disponibilidad. No realices el pago e inténtalo de nuevo.'); }
  }; });
  form.addEventListener('change', () => { requestId = crypto.randomUUID(); showSubmission(''); updatePrice(); });
  form.onsubmit = async event => {
    event.preventDefault();
    if (!canOrder() || checkingAvailability || fields.disabled) return;
    if (!request.isPayment()) { request.next(); return; }
    if (!uploads.validate('document')) { request.document(); return; }
    if (!uploads.validate() || !form.reportValidity()) { track('campus_flow_failed', { step: 'upload', error_kind: 'validation' }); return; }
    try { await refreshAvailability(); } catch { announce('No pudimos comprobar la disponibilidad. Conservamos tus archivos. Si ya pagaste, contacta a soporte desde el aviso.'); return; }
    if (!canOrder()) return;
    track('campus_turnitin_submit_started');
    fields.disabled = true; submit.setAttribute('aria-busy', 'true'); submit.setAttribute('aria-label', 'Enviando tu revisión…'); submitText.hidden = true; submit.querySelector<HTMLElement>('[data-ti-submit-skeleton]')!.hidden = false; showSubmission('Enviando tu documento y comprobante. Mantén esta página abierta.'); announce('Enviando tu documento y comprobante…', true);
    try {
      const received = await api('orders', { requestId, report: selectedReport(), amountCents: selectedOffer()?.amountCents ?? config.amountCents, consent: (form.elements.namedItem('consent') as HTMLInputElement).checked,
        document: await encode(selected(form,'document'),config.maxDocumentBytes), receipt: await encode(selected(form,'receipt'),config.maxReceiptBytes) });
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(received.order?.id ?? '')) throw new Error('No pudimos confirmar el envío. Vuelve a intentarlo; conservamos tus archivos.');
      track('campus_turnitin_submitted');
      form.reset(); uploads.reset(); request.reset(); showSubmission(''); requestId = crypto.randomUUID(); updatePrice();
      try { await refreshAvailability(); } catch { /* The received order remains confirmed if availability refresh fails. */ }
      announce('Pedido recibido. Tu comprobante está en revisión. Consulta el estado en Mis revisiones.');
      document.querySelector<HTMLDetailsElement>('[data-ti-new-order]')!.open = false;
      const reviewPanel = document.querySelector<HTMLElement>('[data-ti-my-orders-panel]')!;
      reviewPanel.parentElement!.prepend(reviewPanel);
      reviewPanel.scrollIntoView({ block: 'start' });
      historyFilter = 'all'; historySearch = ''; search.value = '';
      document.querySelectorAll<HTMLButtonElement>('[data-ti-filter]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.tiFilter === 'all')));
      try { await loadOrders(false, true); } catch { announce('Tu pedido ya fue recibido. Usa Actualizar estado para consultar su avance.'); }
    } catch (error) { track('campus_flow_failed', { step: 'turnitin', error_kind: 'rejected' }); showSubmission((error as Error).message); announce((error as Error).message, true); try { await refreshAvailability(); } catch { /* The availability notice offers payment support. */ } }
    finally { fields.disabled = false; submit.removeAttribute('aria-busy'); submit.removeAttribute('aria-label'); submitText.hidden = false; submit.querySelector<HTMLElement>('[data-ti-submit-skeleton]')!.hidden = true; }
  };
  const cleanup = () => { disposed = true; clearInterval(poll); clearTimeout(searchTimer); };
  document.addEventListener('astro:before-swap', cleanup, { once: true });
  window.addEventListener('pagehide', cleanup, { once: true });
  void (async () => {
    try {
      await refreshAvailability();
      if (disposed) return;
      const requested = new URLSearchParams(location.search).get('report');
      if (requested && ['ai','similarity','both'].includes(requested)) {
        const radio = form.querySelector<HTMLInputElement>(`input[name="report"][value="${requested}"]`);
        if (radio) radio.checked = true;
      }
      updatePrice();
      poll = setInterval(() => {
        if (disposed || fields.disabled || document.visibilityState !== 'visible') return;
        void refreshAvailability().catch(() => {});
        if (authenticated && !refreshPending && pendingOrders) void loadOrders().catch(() => {});
      }, 30000);
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
      authenticated = Boolean(session.authenticated);
      if (!session.authenticated) {
        document.querySelector<HTMLElement>('[data-ti-login]')!.hidden = false;
        ordersList.removeAttribute('aria-busy');
        ordersList.replaceChildren(el('p', 'Inicia sesión para consultar tus revisiones.', 'ti-muted'));
        announce(config.enabled ? 'Inicia sesión para solicitar o consultar una revisión.' : config.availability && !Object.values(config.availability).some(count=>count>0) ? 'Las revisiones no están disponibles por ahora. No realices pagos. Inicia sesión para consultar pedidos anteriores.' : 'Los pedidos nuevos están pausados. Inicia sesión para consultar pedidos anteriores.');
        setupTurnitinLogin()?.open(config.amountCents, !config.enabled);
        return;
      }
      updatePrice(); refresh.hidden = false;
      await loadOrders();
      if (config.enabled && requestPanel.open) request.start();
      announce(linkUnavailable ? 'No pudimos abrir esa revisión. Comprueba que entraste con la cuenta del pedido.' : statuses.size ? 'Aquí tienes tus revisiones. Abre o descarga los informes que ya estén listos.' : config.enabled ? 'Selecciona el documento, paga y adjunta tu comprobante para enviar el pedido.' : 'Los pedidos nuevos están pausados. Puedes consultar y descargar tus informes anteriores.', config.enabled);
    } catch (error) {
      ordersList.removeAttribute('aria-busy');
      if (!ordersLoaded) ordersList.replaceChildren(el('p', 'No pudimos cargar tus revisiones. Actualiza para intentarlo.', 'ti-muted'));
      if (!config) {
        requestPanel.hidden = true;
        document.querySelector<HTMLElement>('[data-ti-capacity-notice]')!.hidden = false;
        document.querySelector<HTMLElement>('[data-ti-capacity-title]')!.textContent = 'No pudimos cargar el servicio';
        document.querySelector<HTMLElement>('[data-ti-capacity-message]')!.textContent = 'No realices el pago. Usa Comprobar disponibilidad para volver a intentarlo. Si ya pagaste, contacta a soporte.';
      }
      announce((error as Error).message);
    }
  })();
}
setupTurnitin();
document.addEventListener('astro:page-load', setupTurnitin);
