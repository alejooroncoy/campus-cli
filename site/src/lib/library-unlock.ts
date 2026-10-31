// Ficha de un trabajo importado de GitHub: con sesión se desbloquea la tarjeta del repositorio y se carga el informe.
// El HTML público nunca trae la dirección del repo ni el texto del README; ambos llegan por la API con sesión.
type ReadmeResponse = { html: string; truncated: boolean };

export async function unlockImported(scope: ParentNode = document): Promise<void> {
  const card = scope.querySelector<HTMLElement>('[data-lib-source-card]');
  if (!card || card.hasAttribute('data-unlocked')) return;
  const doc = scope.querySelector<HTMLElement>('[data-lib-doc]');
  try {
    const response = await fetch('/api/app/session', { credentials: 'same-origin', cache: 'no-store' });
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
    // El servidor escapa todo el texto del README y solo emite las etiquetas de su propio convertidor.
    sheet.innerHTML = body.html + (body.truncated ? '<p class="lib-doc-more">El informe continúa en GitHub.</p>' : '');
    doc.setAttribute('data-unlocked', '');
    const lock = doc.querySelector<HTMLElement>('[data-lib-doc-lock]');
    if (lock) lock.hidden = true;
    const print = doc.querySelector<HTMLButtonElement>('[data-lib-doc-print]');
    if (print) { print.hidden = false; print.addEventListener('click', () => window.print()); }
  } catch {
    // Sin red o sin sesión la ficha se queda bloqueada, que es el estado seguro.
  }
}
