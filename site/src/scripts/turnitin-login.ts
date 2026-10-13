export function turnitinLoginReturn(pathname: string, hash: string) {
  return '/app/turnitin/' + (pathname === '/app/turnitin/' && /^#ti-order-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hash) ? hash : '');
}
type TurnitinLogin = { open: (amountCents?: number) => void };
const initialized = new WeakMap<HTMLDialogElement, TurnitinLogin>();
export function setupTurnitinLogin(): TurnitinLogin | null {
  const dialog = document.querySelector<HTMLDialogElement>('[data-ti-login-dialog]');
  if (!dialog) return null;
  const previous = initialized.get(dialog);
  if (previous) return previous;
  const controller = {
    open(amountCents?: number) {
      if (!dialog.isConnected) return;
      const returnUrl = turnitinLoginReturn(location.pathname, location.hash);
      const readingReports = returnUrl.includes('#');
      const login = dialog.querySelector<HTMLAnchorElement>('[data-ti-google-login]')!;
      login.href = '/api/app/auth/start?return=' + encodeURIComponent(returnUrl);
      const title = dialog.querySelector<HTMLElement>('#ti-login-title')!;
      const description = dialog.querySelector<HTMLElement>('#ti-login-description')!;
      const note = dialog.querySelector<HTMLElement>('[data-ti-login-note]')!;
      for (const node of [title, description, note]) node.dataset.defaultText ??= node.textContent!;
      title.textContent = readingReports ? 'Inicia sesión para ver tus informes.' : title.dataset.defaultText!;
      description.textContent = readingReports ? 'Tus informes de similitud e IA están en Campus. Entra con la misma cuenta con la que hiciste el pedido.' : description.dataset.defaultText!;
      note.textContent = readingReports ? 'Volverás directamente a tu revisión para ver o descargar los PDF.' : note.dataset.defaultText!;
      dialog.querySelector<HTMLElement>('.ti-login-offer')!.hidden = readingReports;

      if (amountCents !== undefined) dialog.querySelector<HTMLElement>('[data-ti-login-price]')!.textContent = `S/${amountCents / 100}`;
      if (!dialog.open) dialog.showModal();
      dialog.querySelector<HTMLAnchorElement>('[data-ti-google-login]')?.focus();
    },
  };
  initialized.set(dialog, controller);
  dialog.querySelectorAll<HTMLButtonElement>('[data-ti-close-login]').forEach(button => { button.onclick = () => dialog.close(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.querySelectorAll<HTMLAnchorElement>('[data-ti-open-login]').forEach(anchor => {
    anchor.onclick = event => { event.preventDefault(); controller.open(); };
  });
  let checking = false;
  document.querySelectorAll<HTMLAnchorElement>('[data-ti-start]').forEach(anchor => {
    anchor.onclick = async event => {
      event.preventDefault();
      if (checking) return;
      checking = true; anchor.setAttribute('aria-busy', 'true');
      // Open immediately. A returning customer proceeds straight to the order.
      controller.open();
      try {
        const response = await fetch('/api/app/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (response.ok && (await response.json()).authenticated === true) window.location.assign('/app/turnitin/');
      } catch { /* Google sign-in remains available if session checking failed. */ }
      finally { checking = false; anchor.removeAttribute('aria-busy'); }
    };
  });
  return controller;
}
