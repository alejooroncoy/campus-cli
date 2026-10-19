import { assistantReturnPath, connectAiHref } from './assistant-handoff';

export function universityReturnPath(value: string | null): string | null {
  if (!value) return null;
  const chat = assistantReturnPath(value);
  if (chat) return chat;
  if (value === '/app/') return '/app/asistente/';
  if (value === '/app/perfil/' || value === '/app/copilot/' || value === '/app/plus/') return value;
  if (value.startsWith('/app/copilot/?')) {
    const back = assistantReturnPath(new URLSearchParams(value.slice('/app/copilot/?'.length)).get('return'));
    return back ? connectAiHref(back) : '/app/copilot/';
  }
  return null;
}
export function universitySetupHref(pathname: string, search = '') {
  const back = universityReturnPath(pathname === '/app/copilot/' ? pathname + search : pathname) ?? '/app/asistente/';
  return `/app/perfil/?universidad=pendiente&return=${encodeURIComponent(back)}`;
}
export function universityDoneHref(search: string) {
  const params = new URLSearchParams(search);
  return universityReturnPath(params.get('return')) ?? (params.get('universidad') === 'pendiente' ? '/app/asistente/' : '/app/perfil/');
}
