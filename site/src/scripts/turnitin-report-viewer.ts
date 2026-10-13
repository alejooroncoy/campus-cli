import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';

export type ReportKind = 'similarity' | 'ai';
export type PreviewKind = ReportKind | 'receipt';
export type ReportOrder = { id: string; documentName: string; receiptName?: string; admin: boolean };
const initialized = new WeakMap<HTMLDialogElement, { open: (order: ReportOrder, kind: PreviewKind) => void }>();
const titles: Record<PreviewKind, string> = { similarity: 'Informe de similitud', ai: 'Informe de IA', receipt: 'Comprobante de pago' };
const reportUrl = (order: ReportOrder, kind: PreviewKind) =>
  `/api/app/turnitin/${order.admin ? 'admin/' : ''}orders/${order.id}/files/${kind}`;

export function setupTurnitinReportViewer() {
  const candidate = document.querySelector<HTMLDialogElement>('[data-ti-report-dialog]');
  if (!candidate) return null;
  const dialog = candidate;
  const previous = initialized.get(dialog);
  if (previous) return previous;
  const find = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const message = find<HTMLElement>('[data-ti-report-message]');
  const canvas = find<HTMLCanvasElement>('[data-ti-report-canvas]');
  const text = find<HTMLElement>('[data-ti-report-text]');
  const image = find<HTMLImageElement>('[data-ti-preview-image]');
  const footer = find<HTMLElement>('.ti-report-footer');
  const switcher = find<HTMLElement>('.ti-report-switch');
  const stage = find<HTMLElement>('[data-ti-pdf-stage]');
  const download = find<HTMLAnchorElement>('[data-ti-report-download]');
  const retry = find<HTMLButtonElement>('[data-ti-report-retry]');
  const login = find<HTMLAnchorElement>('[data-ti-report-login]');
  const prev = find<HTMLButtonElement>('[data-ti-report-prev]');
  const next = find<HTMLButtonElement>('[data-ti-report-next]');
  const zoom = find<HTMLSelectElement>('[data-ti-report-zoom]');
  const pageLabel = find<HTMLElement>('[data-ti-report-page]');
  let order: ReportOrder | null = null;
  let kind: PreviewKind = 'similarity';
  let pdf: PDFDocumentProxy | null = null;
  let loadingTask: PDFDocumentLoadingTask | null = null;
  let rendering: RenderTask | null = null;
  let abort: AbortController | null = null;
  let generation = 0;
  let drawing = 0;
  let pageNumber = 1;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let observer: ResizeObserver | null = null;
  function controls() {
    prev.disabled = !pdf || pageNumber <= 1;
    next.disabled = !pdf || pageNumber >= pdf.numPages;
    zoom.disabled = !pdf;
  }
  function clearDocument() {
    generation++; drawing++;
    abort?.abort(); abort = null;
    rendering?.cancel(); rendering = null;
    const task = loadingTask; loadingTask = null; pdf = null;
    if (task) void task.destroy().catch(() => {});
    canvas.width = canvas.height = 0; canvas.hidden = true;
    text.textContent = '';
    image.onload = image.onerror = null; image.hidden = true; image.removeAttribute('src'); image.style.width = '';
    controls();
  }
  async function renderPage() {
    if (!pdf || !dialog.open) return;
    const currentPdf = pdf;
    retry.hidden = true;
    pageLabel.textContent = `Página ${pageNumber} de ${currentPdf.numPages}`;
    controls();
    const documentVersion = generation;
    const renderVersion = ++drawing;
    rendering?.cancel();
    const old = rendering; rendering = null;
    await old?.promise.catch(() => {});
    try {
      const page = await currentPdf.getPage(pageNumber);
      if (documentVersion !== generation || renderVersion !== drawing || !dialog.open) return;
      const base = page.getViewport({ scale: 1 });
      const width = Math.max(240, Math.min(stage.clientWidth - 32, 1040));
      const viewport = page.getViewport({ scale: width / base.width * Number(zoom.value) });
      const density = Math.min(devicePixelRatio || 1, 2, Math.sqrt(12000000 / (viewport.width * viewport.height)));
      canvas.width = Math.ceil(viewport.width * density);
      canvas.height = Math.ceil(viewport.height * density);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.hidden = false;
      message.textContent = 'Mostrando tu informe…';
      const task = page.render({ canvas, viewport, transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0] });
      rendering = task;
      await task.promise;
      if (documentVersion !== generation || renderVersion !== drawing || !dialog.open) return;
      rendering = null;
      const content = await page.getTextContent();
      if (documentVersion !== generation || renderVersion !== drawing || !dialog.open) return;
      // A text alternative for screen readers; PDF content never becomes HTML.
      text.textContent = content.items.map(item => 'str' in item ? item.str : '').join(' ').slice(0, 300000);
      text.setAttribute('aria-label', `Página ${pageNumber} de ${currentPdf.numPages}. ${titles[kind]}`);
      message.textContent = kind === 'receipt' ? 'Revisa el comprobante aquí o descarga el PDF.' : 'Puedes leer el informe aquí o descargar el PDF.';
      pageLabel.textContent = `Página ${pageNumber} de ${currentPdf.numPages}`;
      controls();
    } catch {
      if (documentVersion !== generation || renderVersion !== drawing || !dialog.open) return;
      canvas.hidden = true; text.textContent = '';
      message.textContent = 'No pudimos mostrar esta página. Puedes descargar el PDF o volver a intentar.';
      retry.hidden = false;
    }
  }
  async function load(selected: PreviewKind) {
    if (!order || !dialog.open) return;
    clearDocument();
    kind = selected; pageNumber = 1; zoom.value = '1'; stage.scrollTop = stage.scrollLeft = 0;
    const version = generation;
    const currentOrder = order;
    switcher.hidden = selected === 'receipt'; footer.hidden = false;
    find<HTMLElement>('[data-ti-viewer-context]').textContent = selected === 'receipt' ? 'Administrar pedido' : 'Tu revisión de Turnitin';
    retry.hidden = login.hidden = true;
    pageLabel.textContent = 'Página —';
    find<HTMLElement>('[data-ti-report-title]').textContent = titles[kind];
    dialog.querySelectorAll<HTMLButtonElement>('[data-ti-report-kind]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.tiReportKind === kind));
    });
    download.href = reportUrl(currentOrder, kind);
    download.setAttribute('aria-label', `${kind === 'receipt' ? 'Descargar' : 'Descargar PDF:'} ${titles[kind]}`);
    download.textContent = kind === 'receipt' ? 'Descargar comprobante ↓' : 'Descargar PDF ↓';
    message.textContent = kind === 'receipt' ? 'Cargando comprobante…' : 'Cargando tu informe…';
    const requestAbort = new AbortController(); abort = requestAbort;
    const timeout = setTimeout(() => requestAbort.abort(), 45000);
    let failureMessage = kind === 'receipt' ? 'No pudimos abrir el comprobante. Vuelve a intentar o descárgalo.' : 'No pudimos abrir el informe. Vuelve a intentar o descarga el PDF.';
    try {
      const response = await fetch(reportUrl(currentOrder, selected), {
        credentials: 'same-origin', cache: 'no-store', signal: requestAbort.signal,
      });
      if (version !== generation || !dialog.open) return;
      if (response.status === 401) {
        login.hidden = false;
        failureMessage = 'Tu sesión terminó. Inicia sesión para ver tus informes.';
        throw new Error(failureMessage);
      }
      if (!response.ok) throw new Error(failureMessage);
      const mime = response.headers.get('content-type')?.split(';')[0];
      if (selected === 'receipt' && (mime === 'image/png' || mime === 'image/jpeg')) {
        const blob = await response.blob();
        if (blob.size > 5 * 1024 * 1024) throw new Error(failureMessage);
        const data = await new Promise<string>((resolve,reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob);
        });
        if (version !== generation || !dialog.open) return;
        image.onerror = () => { if (version === generation && dialog.open) { image.hidden = true; retry.hidden = false; message.textContent = failureMessage; } };
        image.src = data; image.alt = `Comprobante de ${currentOrder.documentName}`; image.hidden = false;
        footer.hidden = true; message.textContent = 'Revisa el comprobante o descárgalo en tu dispositivo.';
        return;
      }
      if (mime !== 'application/pdf')
        throw new Error('No pudimos abrir el informe. Vuelve a intentar o descarga el PDF.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (version !== generation || !dialog.open) return;
      const engine = await import('pdfjs-dist');
      if (version !== generation || !dialog.open) return;
      engine.GlobalWorkerOptions.workerSrc = workerUrl;
      const task = engine.getDocument({
        data: bytes, verbosity: 0, useWasm: false, disableFontFace: true,
        standardFontDataUrl: `/assets/pdfjs-${engine.version}/standard_fonts/`,
        cMapUrl: `/assets/pdfjs-${engine.version}/cmaps/`, cMapPacked: true,
      });
      loadingTask = task;
      const loaded = await task.promise;
      if (version !== generation || !dialog.open) return;
      pdf = loaded;
      await renderPage();
    } catch (error) {
      if (version !== generation || !dialog.open) return;
      message.textContent = error instanceof Error && error.name !== 'AbortError'
        ? failureMessage : 'La carga tardó demasiado. Vuelve a intentar o descarga el PDF.';
      retry.hidden = !login.hidden;
    } finally { clearTimeout(timeout); }
  }
  dialog.querySelectorAll<HTMLButtonElement>('[data-ti-report-kind]').forEach(button => {
    button.onclick = () => void load(button.dataset.tiReportKind as ReportKind);
  });
  prev.onclick = () => { if (pdf && pageNumber > 1) { pageNumber--; stage.scrollTop = 0; void renderPage(); } };
  next.onclick = () => { if (pdf && pageNumber < pdf.numPages) { pageNumber++; stage.scrollTop = 0; void renderPage(); } };
  zoom.onchange = () => void renderPage();
  retry.onclick = () => void load(kind);
  find<HTMLButtonElement>('[data-ti-report-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    clearDocument(); order = null;
    clearTimeout(resizeTimer);
    observer?.disconnect(); observer = null;
    download.removeAttribute('href');
    find<HTMLElement>('[data-ti-report-document]').textContent = '';
  });
  const controller = { open(currentOrder: ReportOrder, selected: PreviewKind) {
    if (selected === 'receipt' && !currentOrder.admin) return;
    order = currentOrder;
    find<HTMLElement>('[data-ti-report-document]').textContent = currentOrder.documentName;
    if (!dialog.open) dialog.showModal();
    observer?.disconnect();
    observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (pdf && dialog.open) void renderPage(); }, 150);
    });
    observer.observe(stage);
    void load(selected);
  } };
  initialized.set(dialog, controller);
  document.addEventListener('astro:before-swap', () => { if (dialog.open) dialog.close(); }, { once: true });
  window.addEventListener('pagehide', () => { if (dialog.open) dialog.close(); }, { once: true });
  return controller;
}
