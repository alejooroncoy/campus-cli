import { getCampusSession, canConnectMiupc } from "./campus-session";

// University login stays in the owner's temporary Browserbase view. Only its
// private, short-lived link reaches the browser; it is never saved locally.
function initMiupcProfile() {
  const button = document.querySelector<HTMLButtonElement>('[data-miupc-connect]');
  const status = document.querySelector<HTMLElement>('[data-miupc-status]');
  const link = document.querySelector<HTMLAnchorElement>('[data-miupc-login]');
  if (!button || !status || !link || button.dataset.initialized) return;
  button.dataset.initialized = 'true';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let revision = 0;
  const messages: Record<string, string> = {
    connected: 'Conexión guardada. Ya puedes preguntar por tus notas actuales en Campus.',
    pending_login: 'Completa el acceso de Mi UPC en la ventana segura.',
    saving: 'Guardando tu conexión…',
    busy: 'Hay una consulta de Mi UPC en curso. Inténtalo cuando termine.',
    reconnect_required: 'Primero conecta tu cuenta UPC desde Campus.',
    not_configured: 'La conexión con Mi UPC todavía no está disponible.',
    expired: 'El enlace venció. Puedes volver a conectar Mi UPC.',
    failed: 'No pudimos guardar la conexión. Inténtalo de nuevo.',
    not_supported: 'Mi UPC está disponible solo para estudiantes de UPC.',
    not_connected: 'Conecta Mi UPC una vez para consultar tus notas actuales desde Campus.',
  };
  const renderStatus = (text: string, loading = false) => {
    status.setAttribute('aria-busy', String(loading));
    if (!loading) { status.textContent = text; return; }
    const accessible = document.createElement('span'); accessible.className = 'app-sr-only'; accessible.textContent = text;
    const skeleton = document.createElement('span'); skeleton.className = 'app-skeleton app-skeleton--line'; skeleton.setAttribute('aria-hidden', 'true');
    status.replaceChildren(accessible, skeleton);
  };
  const update = (data: { status: string; loginUrl?: string }) => {
    if (disposed) return;
    renderStatus(messages[data.status] ?? messages.failed, data.status === 'saving');
    const waiting = ['pending_login', 'saving'].includes(data.status);
    button.disabled = waiting;
    button.textContent = data.status === 'connected' ? 'Renovar conexión' : 'Conectar Mi UPC';
    link.hidden = !data.loginUrl;
    if (data.loginUrl) {
      const url = new URL(data.loginUrl);
      if (url.protocol === 'https:' && url.hostname === 'www.browserbase.com') link.href = url.href;
      else link.hidden = true;
    } else link.removeAttribute('href');
    if (waiting) timer = setTimeout(() => void poll(), 3000);
  };
  const poll = async () => {
    const current = revision;
    renderStatus('Comprobando tu conexión de Mi UPC…', true);
    try {
      if (!canConnectMiupc(await getCampusSession())) { update({ status: 'not_supported' }); return; }
      const response = await fetch('/api/app/miupc/connect/', { cache: 'no-store', signal: AbortSignal.timeout(50_000) });
      const data = response.ok ? await response.json() : { status: 'failed' };
      if (current === revision) update(data);
    } catch { if (current === revision) update({ status: 'failed' }); }
  };
  button.addEventListener('click', async () => {
    revision++;
    if (timer) clearTimeout(timer);
    button.disabled = true;
    renderStatus('Preparando la conexión segura…', true);
    try {
      const response = await fetch('/api/app/miupc/connect/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(50_000) });
      update(response.ok ? await response.json() : { status: 'failed' });
    } catch { update({ status: 'failed' }); }
  });
  document.addEventListener('astro:before-swap', () => { disposed = true; if (timer) clearTimeout(timer); }, { once: true });
  void poll();
}
initMiupcProfile();
document.addEventListener('astro:page-load', initMiupcProfile);
