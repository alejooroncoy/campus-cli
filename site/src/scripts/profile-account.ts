import type { CampusSession } from './campus-session';
import { copilotAccountView } from './copilot-account';

// Display only: the live session is authoritative for plans and web quotas.
export function profileAccountView(session: CampusSession | 'loading' | 'error') {
  const account = copilotAccountView(session);
  const verified = account.state === 'free' || account.state === 'plus';
  const usage = typeof session === 'object' ? session.usage : undefined;
  const validUsage = verified && usage && Number.isInteger(usage.remaining) && usage.remaining >= 0
    && Number.isInteger(usage.limit) && usage.limit >= 0 && usage.remaining <= usage.limit;
  return {
    state: account.state,
    label: account.label,
    usage: validUsage ? `${usage.remaining} de ${usage.limit} consultas disponibles${usage.period === 'day' ? ' hoy' : ''}` : undefined,
    note: !verified ? account.description : !validUsage
      ? 'No pudimos comprobar tus consultas disponibles. Actualiza el saldo para volver a intentarlo.'
      : usage.period === 'day'
        ? usage.remaining === 0 ? 'Has usado tus consultas web de hoy. Tu cuota se renueva cada día.' : 'Tu cuota web se renueva cada día.'
        : account.state === 'free' ? usage.remaining === 0
          ? 'Has usado tus consultas de bienvenida. No se renuevan cada mes. Puedes conocer Campus Plus para continuar.'
          : 'Son consultas de bienvenida: no se renuevan cada mes.'
        : 'Este saldo corresponde al uso en la web.',
    mcp: verified && account.state === 'plus' ? 'Con Campus Plus: consultas ilimitadas mediante MCP, el conector para tu IA compatible. Son independientes de tu cuota web.' : undefined,
    upgrade: account.upgrade === true,
  };
}

export function renderProfileAccount(root: HTMLElement | null, session: CampusSession | 'loading' | 'error') {
  if (!root) return;
  const view = profileAccountView(session);
  root.dataset.state = view.state;
  for (const key of ['label', 'usage', 'note', 'mcp'] as const) {
    const node = root.querySelector<HTMLElement>(`[data-profile-${key}]`);
    if (node) { node.textContent = view[key] ?? ''; node.hidden = !view[key]; }
  }
  const upgrade = root.querySelector<HTMLElement>('[data-profile-upgrade]');
  if (upgrade) upgrade.hidden = !view.upgrade;
  const refresh = root.querySelector<HTMLButtonElement>('[data-profile-refresh]');
  if (refresh) {
    refresh.disabled = view.state === 'loading';
    refresh.textContent = view.state === 'loading' ? 'Comprobando…' : 'Actualizar saldo';
    refresh.setAttribute('aria-busy', String(view.state === 'loading'));
  }
}
