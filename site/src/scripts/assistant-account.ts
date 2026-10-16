import type { CampusSession } from './campus-session';
import { profileAccountView } from './profile-account';

// Reuse the chat's live session and stream balance; never fetch or infer a plan.
export function assistantAccountView(session: CampusSession | 'loading' | 'error') {
  const account = profileAccountView(session);
  const usage = typeof session === 'object' ? session.usage : undefined;
  const validGuestUsage = account.state === 'guest' && usage
    && Number.isInteger(usage.remaining) && usage.remaining >= 0
    && Number.isInteger(usage.limit) && usage.limit >= 0 && usage.remaining <= usage.limit;
  const verifiedUsage = Boolean(account.usage) || validGuestUsage;
  const balance = verifiedUsage && usage
    ? `${usage.remaining} de ${usage.limit} consultas${account.state === 'guest' ? ' de prueba' : usage.period === 'day' ? ' web hoy' : account.state === 'free' ? ' de bienvenida' : ' web'}`
    : account.state === 'loading' ? '' : 'Saldo no disponible';
  return {
    state: account.state,
    label: account.state === 'unavailable' ? 'Cuenta por comprobar' : account.label,
    balance,
    available: verifiedUsage && usage
      ? `${usage.remaining} ${usage.remaining === 1 ? 'consulta disponible' : 'consultas disponibles'}${usage.period === 'day' ? ' hoy' : ''}`
      : balance,
    retry: account.state === 'unavailable' || (['free', 'plus', 'guest'].includes(account.state) && !verifiedUsage),
  };
}
