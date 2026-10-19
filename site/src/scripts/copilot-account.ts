import type { CampusSession } from "./campus-session";

type AccountState = "loading" | "guest" | "free" | "plus" | "unavailable" | "blocked";
type AccountView = {
  state: AccountState;
  label: string;
  description: string;
  usage?: string;
  action?: { label: string; href: string };
  upgrade?: boolean;
  retry?: boolean;
};

const unavailable = (): AccountView => ({
  state: "unavailable",
  label: "No disponible",
  description: "No pudimos comprobar tu sesión o tu plan. Vuelve a intentarlo; esto no significa que tengas Campus Free o que hayas cerrado sesión.",
  retry: true,
});

// Display only. Permissions and limits remain enforced by the server.
export function copilotAccountView(session: CampusSession | "loading" | "error"): AccountView {
  if (session === "loading") return {
    state: "loading", label: "Comprobando…", description: "Estamos comprobando tu cuenta y tu plan de Campus.",
  };
  if (session === "error" || session.accessUnavailable) return unavailable();
  if (session.authenticated === false) return {
    state: "guest", label: "Prueba gratis",
    description: "Prueba Campus con 5 consultas. Crea tu cuenta Campus Free para recibir 25 consultas de bienvenida.",
    action: { label: "Crear cuenta o entrar", href: "/api/app/auth/start?return=%2Fapp%2Fcopilot%2F" },
  };
  if (session.authenticated !== true) return unavailable();
  if (session.accessBlocked) return {
    state: "blocked", label: "Acceso restringido",
    description: "Tu sesión está iniciada, pero el acceso de tu cuenta está restringido. Revisa tu cuenta para conocer su estado.",
    action: { label: "Ver mi cuenta", href: "/app/perfil/" },
  };
  if (session.plan !== "free" && session.plan !== "plus") return {
    ...unavailable(), description: "Tu sesión está iniciada, pero no pudimos comprobar tu plan de Campus. Vuelve a intentarlo.",
  };
  const plan = session.plan;
  const usage = session.usage;
  const validUsage = usage && Number.isFinite(usage.remaining) && usage.remaining >= 0
    && Number.isFinite(usage.limit) && usage.limit >= 0;
  return {
    state: plan,
    label: plan === "plus" ? session.plusTest ? "Campus Plus · prueba" : "Campus Plus" : "Campus Free",
    description: plan === "plus"
      ? "Has iniciado sesión con Campus Plus. Usa esta misma cuenta al autorizar Campus en tu asistente."
      : "Tu cuenta Campus Free incluye 25 consultas de bienvenida en la web. Usa esta misma cuenta para autorizar el conector.",
    usage: validUsage ? `En la web: ${usage.remaining} de ${usage.limit} consultas disponibles${usage.period === "day" ? " hoy" : ""}.` : undefined,
    action: { label: "Ver mi cuenta", href: "/app/perfil/" },
    upgrade: plan === "free",
  };
}

export function renderCopilotAccount(root: HTMLElement | null, session: CampusSession | "loading" | "error"): void {
  if (!root) return;
  const view = copilotAccountView(session);
  root.dataset.state = view.state;
  const label = root.querySelector<HTMLElement>("[data-copilot-account-label]");
  const description = root.querySelector<HTMLElement>("[data-copilot-account-description]");
  const usage = root.querySelector<HTMLElement>("[data-copilot-account-usage]");
  const action = root.querySelector<HTMLAnchorElement>("[data-copilot-account-action]");
  const upgrade = root.querySelector<HTMLElement>("[data-copilot-account-upgrade]");
  const retry = root.querySelector<HTMLElement>("[data-copilot-account-retry]");
  root.setAttribute("aria-busy", String(view.state === "loading"));
  const setText = (node: HTMLElement | null, value: string, skeletonClass: string) => {
    if (!node) return;
    if (view.state !== "loading") { node.textContent = value; return; }
    const skeleton = document.createElement("span"); skeleton.className = `app-skeleton ${skeletonClass}`; skeleton.setAttribute("aria-hidden", "true");
    const accessible = document.createElement("span"); accessible.className = "app-sr-only"; accessible.textContent = value;
    node.replaceChildren(skeleton, accessible);
  };
  setText(label, view.label, "app-skeleton--short");
  setText(description, view.description, "app-skeleton--line");
  if (usage) { usage.textContent = view.usage ?? ""; usage.hidden = !view.usage; }
  if (action) {
    action.hidden = !view.action;
    if (view.action) { action.textContent = view.action.label; action.href = view.action.href; }
    else { action.textContent = ""; action.removeAttribute("href"); }
  }
  if (upgrade) upgrade.hidden = !view.upgrade;
  if (retry) retry.hidden = !view.retry;
}
