import { setupTurnitinUploads } from './turnitin-upload';
import { setupTurnitinLogin } from './turnitin-login';
import { setupTurnitinReportViewer, type ReportKind } from './turnitin-report-viewer';
type Order = {
  id: string; amountCents: number; status: string; documentName: string; note: string;
  createdAt: string; paidAt: string | null;
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
  let isAdmin = false;
  let refreshPending = false;
  let ordersLoaded = false;
  let pendingOrders = false;
  let disposed = false;
  let statuses = new Map<string, string>();
  let poll: ReturnType<typeof setInterval> | undefined;
  const announce = (message: string, quiet = false) => { status.textContent = message; status.classList.toggle('ti-status--quiet', quiet); };
  async function api(path: string, input?: unknown) {
    const response = await fetch(`/api/app/turnitin/${path}`, { credentials: 'same-origin', cache: 'no-store',
      method: input === undefined ? 'GET' : 'POST',
      headers: input === undefined ? {} : { 'content-type': 'application/json' },
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
  function link(order: Order, kind: string, text: string, admin: boolean) {
    const anchor = el('a', text);
    anchor.href = `/api/app/turnitin/${admin ? 'admin/' : ''}orders/${order.id}/files/${kind}`;
    anchor.setAttribute('download', ''); return anchor;
  }
  function reportCard(order: Order, kind: ReportKind, admin: boolean) {
    const box = el('div', '', 'ti-file-card');
    box.setAttribute('role', 'group');
    const title = kind === 'similarity' ? 'Informe de similitud' : 'Informe de IA';
    box.setAttribute('aria-label', title);
    box.append(el('span', 'PDF · Disponible', 'ti-file-label'), el('h4', title),
      el('p', kind === 'similarity' ? 'Consulta las coincidencias de texto y sus fuentes.' : 'Consulta el resultado de detección de escritura con IA.'));
    const actions = el('div', '', 'ti-file-actions');
    const view = el('button', 'Ver informe', 'app-button');
    view.type = 'button';
    view.setAttribute('aria-label', `Ver ${title.replace('Informe', 'informe')} de ${order.documentName}`);
    view.onclick = () => setupTurnitinReportViewer()?.open({ id: order.id, documentName: order.documentName, admin }, kind);
    const download = link(order, kind, 'Descargar PDF ↓', admin);
    download.className = 'app-button app-button--secondary';
    download.setAttribute('aria-label', `Descargar ${title.replace('Informe', 'informe')} de ${order.documentName}`);
    actions.append(view, download); box.append(actions); return box;
  }
  function renderOrders(orders: Order[], target: HTMLElement, admin = false) {
    target.replaceChildren();
    if (!admin) document.querySelector<HTMLElement>('.ti-report-note')!.hidden = orders.length === 0;
    if (!orders.length) {
      const empty = el('div', '', 'ti-empty');
      empty.append(el('h3', admin ? 'No hay pedidos pendientes' : 'Tu primera revisión empieza aquí'), el('p', admin ? 'Los pedidos nuevos aparecerán en este panel.' : 'Después de enviar tu trabajo, podrás seguir su estado y abrir o descargar los dos informes.', 'ti-muted'));
      target.append(empty); return;
    }
    for (const order of orders) {
      const card = el('article', '', 'ti-order');
      card.id = `ti-order-${order.id}`; card.dataset.status = order.status;
      const head = el('div', '', 'ti-order-heading');
      head.append(el('h3', order.documentName), el('span', labels[order.status] ?? order.status, 'ti-tag'));
      card.append(head);
      card.append(el('p', `${money(order.amountCents)} · ${new Date(order.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })} · Pedido ${order.id.slice(0,8)}`, 'ti-small'));
      if (order.note) card.append(el('p', order.note));
      if (order.status === 'processing' && order.paidAt) card.append(el('p', 'Entrega de 10 minutos a 1 hora desde la validación del pago.', 'ti-small'));
      if (order.status === 'completed') {
        const reports = el('div', '', 'ti-file-grid');
        reports.append(reportCard(order, 'similarity', admin), reportCard(order, 'ai', admin));
        card.append(reports);
      } else if (!admin) {
        card.append(el('p', order.status === 'payment_rejected' ? 'Revisa la observación del pago antes de solicitar una nueva revisión.' : 'Tus informes de similitud e IA aparecerán aquí cuando la revisión esté lista.', 'ti-muted'));
      }
      if (admin) {
        card.append(link(order, 'document', 'Descargar documento', true), link(order, 'receipt', 'Ver comprobante', true));
        if (order.status === 'payment_review') {
          const reviewForm = el('form');
          const noteLabel = el('label','Observación (obligatoria si rechazas el pago)');
          const note = el('textarea'); note.maxLength = 500; note.rows = 2; noteLabel.append(note);
          const accept = el('button', 'Confirmar pago', 'app-button'); accept.type = 'button';
          const reject = el('button', 'Observar pago', 'app-button app-button--secondary'); reject.type = 'button';
          const review = async (accepted: boolean) => {
            if (!accepted && note.value.trim().length < 5) { announce('Indica el motivo de la observación.'); note.focus(); return; }
            accept.disabled = reject.disabled = true;
            try { await api(`admin/orders/${order.id}/review`, { accepted, note: note.value }); announce('Pedido actualizado.'); await loadOrders(); }
            catch (error) { announce((error as Error).message); }
            finally { accept.disabled = reject.disabled = false; }
          };
          accept.onclick = () => void review(true); reject.onclick = () => void review(false);
          reviewForm.append(noteLabel, accept, reject); card.append(reviewForm);
        }
        if (order.status === 'processing') {
          const delivery = el('form');
          for (const [name, text] of [['similarity','Informe de similitud (PDF)'],['ai','Informe de IA (PDF)']]) {
            const label = el('label',text); const input = el('input'); input.name = name; input.type = 'file'; input.accept = '.pdf'; input.required = true; label.append(input); delivery.append(label);
          }
          const button = el('button', 'Entregar ambos informes', 'app-button'); button.type = 'submit'; delivery.append(button);
          delivery.onsubmit = async event => {
            event.preventDefault(); button.disabled = true;
            try {
              await api(`admin/orders/${order.id}/complete`, { similarity: await encode(selected(delivery,'similarity'),config.maxDocumentBytes), ai: await encode(selected(delivery,'ai'),config.maxDocumentBytes) });
              announce('Informes entregados. El cliente ya puede verlos y descargarlos.'); await loadOrders();
            } catch (error) { announce((error as Error).message); }
            finally { button.disabled = false; }
          };
          card.append(delivery);
        }
      }
      target.append(card);
    }
  }
  async function loadOrders() {
    if (refreshPending) return;
    refreshPending = true; refresh.disabled = true;
    try {
      const result = await api('orders');
      if (disposed) return;
      isAdmin = result.admin === true;
      const orders: Order[] = result.orders;
      if (ordersLoaded && orders.some(order => order.status === 'completed' && statuses.has(order.id) && statuses.get(order.id) !== 'completed'))
        announce('Tus informes ya están listos. Ábrelos en Mis revisiones.');
      pendingOrders = orders.some(order => ['payment_review', 'processing'].includes(order.status));
      statuses = new Map(orders.map(order => [order.id, order.status]));
      if (!ordersLoaded) {
        const newOrder = document.querySelector<HTMLDetailsElement>('[data-ti-new-order]')!;
        newOrder.open = orders.length === 0 && !isAdmin;
        if (!orders.length && !isAdmin) newOrder.parentElement!.prepend(newOrder);
      }
      ordersLoaded = true;
      renderOrders(orders, document.querySelector<HTMLElement>('[data-ti-orders]')!);
      document.querySelector<HTMLElement>('[data-ti-admin]')!.hidden = !isAdmin;
      if (isAdmin) {
        const adminOrders = await api('admin/orders');
        if (disposed) return;
        renderOrders(adminOrders.orders, document.querySelector<HTMLElement>('[data-ti-admin-orders]')!, true);
        document.querySelector<HTMLElement>('.ti-order-layout')!.prepend(document.querySelector<HTMLElement>('[data-ti-admin]')!);
      }
      if (/^#ti-order-[0-9a-f-]{36}$/i.test(location.hash)) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' });
    } finally { refreshPending = false; refresh.disabled = false; }
  }
  refresh.onclick = async () => {
    try { await loadOrders(); announce('Estado actualizado.'); } catch (error) { announce((error as Error).message); }
  };
  const uploads = setupTurnitinUploads(form, kind => kind === 'document' ? (config?.maxDocumentBytes ?? 10 * 1024 * 1024) : (config?.maxReceiptBytes ?? 5 * 1024 * 1024));
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const submitText = submit.querySelector<HTMLElement>('[data-ti-submit-text]')!;
  const submissionMessage = form.querySelector<HTMLElement>('[data-ti-submit-status]')!;
  const showSubmission = (message: string) => { submissionMessage.textContent = message; submissionMessage.hidden = !message; };
  form.addEventListener('change', () => { requestId = crypto.randomUUID(); showSubmission(''); });
  form.onsubmit = async event => {
    event.preventDefault();
    if (fields.disabled || !uploads.validate() || !form.reportValidity()) return;
    fields.disabled = true; submit.setAttribute('aria-busy', 'true'); submitText.textContent = 'Enviando…'; showSubmission('Enviando tu documento y comprobante. Mantén esta página abierta.'); announce('Enviando tu documento y comprobante…', true);
    try {
      await api('orders', { requestId, amountCents: config.amountCents, consent: (form.elements.namedItem('consent') as HTMLInputElement).checked,
        document: await encode(selected(form,'document'),config.maxDocumentBytes), receipt: await encode(selected(form,'receipt'),config.maxReceiptBytes) });
      form.reset(); uploads.reset(); showSubmission(''); requestId = crypto.randomUUID();
      announce('Pedido recibido. Tu comprobante está en revisión. Consulta el estado en Mis revisiones.');
      document.querySelector<HTMLDetailsElement>('[data-ti-new-order]')!.open = false;
      const reviewPanel = document.querySelector<HTMLElement>('[data-ti-my-orders-panel]')!;
      reviewPanel.parentElement!.prepend(reviewPanel);
      reviewPanel.scrollIntoView({ block: 'start' });
      try { await loadOrders(); } catch { announce('Tu pedido ya fue recibido. Usa Actualizar estado para consultar su avance.'); }
    } catch (error) { showSubmission((error as Error).message); announce((error as Error).message, true); }
    finally { fields.disabled = false; submit.removeAttribute('aria-busy'); submitText.textContent = 'Enviar a revisión'; }
  };
  const cleanup = () => { disposed = true; clearInterval(poll); };
  document.addEventListener('astro:before-swap', cleanup, { once: true });
  window.addEventListener('pagehide', cleanup, { once: true });
  void (async () => {
    try {
      config = await api('config');
      document.querySelector<HTMLElement>('[data-ti-price]')!.textContent = config.amountCents === 800 ? 'S/8 · Lanzamiento' : `${money(config.amountCents)} por documento`;
      document.querySelector<HTMLElement>('[data-ti-amount]')!.textContent = money(config.amountCents);
      document.querySelector<HTMLElement>('[data-ti-phone]')!.textContent = config.phone;
      document.querySelector<HTMLElement>('[data-ti-holder]')!.textContent = config.holder;
      if (!config.ordersAvailable) { announce('El servicio todavía no está recibiendo pedidos. Vuelve pronto.'); return; }
      const response = await fetch('/api/app/session', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo comprobar tu sesión.');
      const session = await response.json();
      if (disposed) return;
      if (!session.authenticated) {
        document.querySelector<HTMLElement>('[data-ti-login]')!.hidden = false;
        announce(config.enabled ? 'Inicia sesión para enviar tu pedido y descargar tus informes.' : 'Los pedidos nuevos están pausados. Inicia sesión para consultar pedidos anteriores.');
        setupTurnitinLogin()?.open(config.amountCents);
        return;
      }
      form.hidden = !config.enabled; refresh.hidden = false;
      await loadOrders();
      // Keep pending customer reviews current without disturbing staff forms.
      poll = setInterval(() => {
        if (!disposed && pendingOrders && !isAdmin && document.visibilityState === 'visible')
          void loadOrders().catch(() => {});
      }, 30000);
      announce(isAdmin ? 'Revisa los pedidos en Administrar pedidos.' : statuses.size ? 'Aquí tienes tus revisiones. Abre o descarga los informes que ya estén listos.' : config.enabled ? 'Selecciona el documento, paga y adjunta tu comprobante para enviar el pedido.' : 'Los pedidos nuevos están pausados. Puedes consultar y descargar tus informes anteriores.', config.enabled);
    } catch (error) { announce((error as Error).message); }
  })();
}
setupTurnitin();
document.addEventListener('astro:page-load', setupTurnitin);
