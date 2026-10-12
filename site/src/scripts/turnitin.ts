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
  const announce = (message: string) => { status.textContent = message; };
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
  function renderOrders(orders: Order[], target: HTMLElement, admin = false) {
    target.replaceChildren();
    if (!orders.length) { target.append(el('p', 'Todavía no hay pedidos.', 'ti-muted')); return; }
    for (const order of orders) {
      const card = el('article', '', 'ti-order');
      card.append(el('h3', order.documentName), el('span', labels[order.status] ?? order.status, 'ti-tag'));
      card.append(el('p', `${money(order.amountCents)} · ${new Date(order.createdAt).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })}`, 'ti-small'));
      card.append(el('p', `Pedido ${order.id.slice(0,8)}`, 'ti-small'));
      if (order.note) card.append(el('p', order.note));
      if (order.status === 'processing' && order.paidAt) card.append(el('p', 'Entrega de 10 minutos a 1 hora desde la validación del pago.', 'ti-small'));
      if (order.status === 'completed') card.append(link(order, 'similarity', 'Descargar similitud ↓', admin), link(order, 'ai', 'Descargar informe de IA ↓', admin));
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
              announce('Informes entregados. El cliente ya puede descargarlos.'); await loadOrders();
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
      const result = await api('orders'); isAdmin = result.admin === true;
      renderOrders(result.orders, document.querySelector<HTMLElement>('[data-ti-orders]')!);
      document.querySelector<HTMLElement>('[data-ti-admin]')!.hidden = !isAdmin;
      if (isAdmin) renderOrders((await api('admin/orders')).orders, document.querySelector<HTMLElement>('[data-ti-admin-orders]')!, true);
    } finally { refreshPending = false; refresh.disabled = false; }
  }
  refresh.onclick = async () => {
    try { await loadOrders(); announce('Estado actualizado.'); } catch (error) { announce((error as Error).message); }
  };
  form.addEventListener('change', () => { requestId = crypto.randomUUID(); });
  form.onsubmit = async event => {
    event.preventDefault();
    if (fields.disabled || !form.reportValidity()) return;
    fields.disabled = true; announce('Enviando tu documento y comprobante…');
    try {
      await api('orders', { requestId, amountCents: config.amountCents, consent: (form.elements.namedItem('consent') as HTMLInputElement).checked,
        document: await encode(selected(form,'document'),config.maxDocumentBytes), receipt: await encode(selected(form,'receipt'),config.maxReceiptBytes) });
      form.reset(); requestId = crypto.randomUUID();
      announce('Pedido recibido. Tu comprobante está en revisión. Consulta el estado en Mis pedidos.');
      try { await loadOrders(); } catch { announce('Tu pedido ya fue recibido. Usa Actualizar estado para consultar su avance.'); }
    } catch (error) { announce((error as Error).message); }
    finally { fields.disabled = false; }
  };
  void (async () => {
    try {
      config = await api('config');
      document.querySelector<HTMLElement>('[data-ti-price]')!.textContent = config.amountCents === 800 ? 'Lanzamiento: S/8 por documento. Regular: S/10.' : 'S/10 por documento.';
      document.querySelector<HTMLElement>('[data-ti-amount]')!.textContent = money(config.amountCents);
      document.querySelector<HTMLElement>('[data-ti-phone]')!.textContent = config.phone;
      document.querySelector<HTMLElement>('[data-ti-holder]')!.textContent = config.holder;
      if (!config.ordersAvailable) { announce('El servicio todavía no está recibiendo pedidos. Vuelve pronto.'); return; }
      const response = await fetch('/api/app/session', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo comprobar tu sesión.');
      const session = await response.json();
      if (!session.authenticated) { document.querySelector<HTMLElement>('[data-ti-login]')!.hidden = false; announce(config.enabled ? 'Inicia sesión para enviar tu pedido y descargar tus informes.' : 'Los pedidos nuevos están pausados. Inicia sesión para consultar pedidos anteriores.'); return; }
      await loadOrders(); form.hidden = !config.enabled; refresh.hidden = false;
      announce(config.enabled ? 'Selecciona el documento, paga y adjunta tu comprobante para enviar el pedido.' : 'Los pedidos nuevos están pausados. Puedes consultar y descargar tus informes anteriores.');
    } catch (error) { announce((error as Error).message); }
  })();
}
setupTurnitin();
document.addEventListener('astro:page-load', setupTurnitin);
