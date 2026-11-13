// Ficha de un trabajo importado de GitHub: con sesión se desbloquea la tarjeta del repositorio y se carga el informe.
// El HTML público nunca trae la dirección del repo ni el texto del README; ambos llegan por la API con sesión.
type ReadmeResponse = { html: string; truncated: boolean };

// A previously installed worker may fail an image while its replacement is
// activating. Refresh only a failed, read-only report when the new worker takes
// control. This handler holds no detached report nodes across library navigation.
const refreshFailedReport = () => {
  if (document.querySelector('[data-lib-doc][data-unlocked] .lib-doc-image-error')) window.location.reload();
};

export async function unlockImported(scope: ParentNode = document): Promise<void> {
  const card = scope.querySelector<HTMLElement>('[data-lib-source-card]');
  if (!card || card.hasAttribute('data-unlocked')) return;
  const doc = scope.querySelector<HTMLElement>('[data-lib-doc]');
  try {
    const response = await fetch('/api/app/session/', { credentials: 'same-origin', cache: 'no-store' });
    const session = response.ok ? await response.json() : null;
    if (!session?.authenticated || !card.isConnected) return;
    card.querySelectorAll<HTMLElement>('[data-lib-locked]').forEach(node => { node.hidden = true; });
    card.querySelectorAll<HTMLElement>('[data-lib-unlocked]').forEach(node => { node.hidden = false; });
    card.setAttribute('data-unlocked', '');
    const work = doc?.dataset.work;
    if (!doc || !work) return;
    const readme = await fetch(`/api/app/library/works/${encodeURIComponent(work)}/readme`, { credentials: 'same-origin', cache: 'no-store' });
    if (!readme.ok || !doc.isConnected) return;
    const body = await readme.json() as ReadmeResponse;
    const sheet = doc.querySelector<HTMLElement>('[data-lib-doc-sheet]');
    if (!sheet || typeof body.html !== 'string') return;
    // El servidor convierte Markdown/HTML y sanea etiquetas, atributos y URLs.
    sheet.innerHTML = body.html + (body.truncated ? '<p class="lib-doc-more">El informe continúa en GitHub.</p>' : '');
    const imageController = navigator.serviceWorker?.controller;
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', refreshFailedReport, { once: true });
      // Public pages can be controlled by an older app worker without registering
      // one themselves. Update that existing registration; do not install a PWA.
      void navigator.serviceWorker.getRegistration().then(registration => registration?.update()).catch(() => {});
    }
    sheet.querySelectorAll<HTMLImageElement>('img').forEach(image => {
      const fallback = () => {
        const message = document.createElement('span');
        message.className = 'lib-doc-image-error';
        message.append(document.createTextNode(image.alt ? `No se pudo cargar la imagen: ${image.alt}. ` : 'No se pudo cargar esta imagen. '));
        const link = document.createElement('a');
        link.href = image.src;
        link.textContent = 'Abrir imagen original';
        link.target = '_blank';
        link.rel = 'nofollow noopener noreferrer';
        message.append(link);
        image.replaceWith(message);
        if (imageController && navigator.serviceWorker?.controller !== imageController) refreshFailedReport();
      };
      // Deferred image selection may report complete with no decoded pixels.
      // Only an error event proves failure; checking naturalWidth here races loading.
      image.addEventListener('error', fallback, { once: true });
    });
    doc.setAttribute('data-unlocked', '');
    const lock = doc.querySelector<HTMLElement>('[data-lib-doc-lock]');
    if (lock) lock.hidden = true;
    const print = doc.querySelector<HTMLButtonElement>('[data-lib-doc-print]');
    if (print) { print.hidden = false; print.addEventListener('click', () => window.print()); }
  } catch {
    // Sin red o sin sesión la ficha se queda bloqueada, que es el estado seguro.
  }
}
