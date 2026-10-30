import { analyticsHeaders, track } from './analytics';
import { universitySetupHref, universityDoneHref } from "./university-onboarding";
import { readGuestUniversity, declaredUniversity, universityLabel, universitySearchMatches, universitySelectionPayload, type UniversityChoice } from './guest-university';
import { renderProfileAccount } from "./profile-account";
import { renderCopilotAccount } from "./copilot-account";
import {connectorLoginHref} from './assistant-handoff';
import {markGuestDraftHandoff} from "./conversation-drafts";
import { watchLiveCampusSession } from "./live-session";
import { watchSessionChanges } from "./session-sync";
import { createKeyboardViewportState, watchMobileKeyboard } from "./mobile-keyboard";
import { getCampusSession, canConnectMiupc, clearCampusSession, getCampusProfilePreview, type CampusProfilePreview, type CampusSession } from "./campus-session";

const UI_CACHE_KEY = "campus_ui_profile";

type UIProfileCache = CampusProfilePreview;

const readUICache = getCampusProfilePreview;

function writeUICache(cache: UIProfileCache | null): void {
  try {
    if (cache) {
      sessionStorage.setItem(UI_CACHE_KEY, JSON.stringify({ ...cache, savedAt: Date.now() }));
    } else {
      sessionStorage.removeItem(UI_CACHE_KEY);
    }
  } catch {
    // Ignore storage errors in restrictive environments
  }
}

function formatStudentName(raw?: string | null): string {
  if (!raw) return "";
  let name = raw.trim();
  if (name.includes(",")) {
    const [last, first] = name.split(",").map(s => s.trim());
    name = `${first} ${last}`.trim();
  }
  if (name === name.toUpperCase() && name.length > 2) {
    name = name
      .toLowerCase()
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return name;
}

function updateNavHighlights(): void {
  const path = window.location.pathname;
  document.querySelectorAll<HTMLAnchorElement>(".app-nav a, .sidebar-menu-btn, .app-mobile-nav a").forEach(link => {
    const href = link.getAttribute("href");
    if (!href) return;
    const isExact = href === path;
    const isSub = href !== "/app/" && path.startsWith(href);
    const isActive = isExact || isSub;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function applyAccountUI(profile: UIProfileCache | null): void {
  // Sidebar user trigger
  const sbUserAvatar = document.querySelector<HTMLElement>("[data-app-sidebar-user-avatar]");
  const sbUserName = document.querySelector<HTMLElement>("[data-app-sidebar-user-name]");
  const sbUserSub = document.querySelector<HTMLElement>("[data-app-sidebar-user-sub]");

  // Sidebar user dropdown menu
  const menuAvatar = document.querySelector<HTMLElement>("[data-app-sidebar-menu-avatar]");
  const menuName = document.querySelector<HTMLElement>("[data-app-sidebar-menu-name]");
  const menuSub = document.querySelector<HTMLElement>("[data-app-sidebar-menu-sub]");
  const menuLogout = document.querySelector<HTMLElement>("[data-app-sidebar-logout]");
  const menuLogin = document.querySelector<HTMLElement>("[data-app-sidebar-login]");

  const sidebarFooter = document.querySelector<HTMLElement>("[data-app-sidebar-footer]");
  const planCard = document.querySelector<HTMLElement>("[data-app-plan-card]");
  const guestNote = document.querySelector<HTMLElement>("[data-app-sidebar-guest-note]");
  if (planCard) planCard.hidden = !profile?.authenticated;
  if (guestNote) guestNote.hidden = Boolean(profile?.authenticated);
  sidebarFooter?.classList.toggle("sidebar-footer--guest", !profile?.authenticated);

  // Sidebar plan summary
  const planTitle = document.querySelector<HTMLElement>("[data-app-plan-card-title]");
  const planDesc = document.querySelector<HTMLElement>("[data-app-plan-card-desc]");
  const planBtn = document.querySelector<HTMLAnchorElement>("[data-app-plan-card-btn]");
  document.querySelectorAll<HTMLElement>("[data-app-sidebar-auth-only]").forEach(element => {
    element.hidden = !profile?.authenticated;
  });
  const upgradeLabel = document.querySelector<HTMLElement>("[data-app-sidebar-upgrade-label]");
  if (upgradeLabel) upgradeLabel.textContent = "Ver mi plan";

  if (profile?.authenticated) {
    // Sidebar User Trigger
    if (sbUserName && profile.shortName) sbUserName.textContent = profile.shortName;
    if (sbUserSub && profile.subTitle) sbUserSub.textContent = profile.subTitle;
    if (sbUserAvatar && profile.initials) {
      sbUserAvatar.textContent = profile.initials;
      sbUserAvatar.classList.add("has-initials");
    }

    // Sidebar User Dropdown
    if (menuName && profile.shortName) menuName.textContent = profile.shortName;
    if (menuSub && profile.subTitle) menuSub.textContent = profile.subTitle;
    if (menuAvatar && profile.initials) {
      menuAvatar.textContent = profile.initials;
      menuAvatar.classList.add("has-initials");
    }
    if (menuLogout) menuLogout.hidden = false;
    if (menuLogin) menuLogin.hidden = true;

    // Show the actual available balance, including welcome credits.
    if (planTitle) planTitle.textContent = profile.accessUnavailable ? "Plan por comprobar" : profile.plan === "plus" ? profile.plusTest ? "Campus Plus · prueba" : "Campus Plus" : profile.plan === "free" ? "Campus Free" : "Plan por comprobar";
    if (planDesc) planDesc.textContent = profile.accessUnavailable ? "Saldo temporalmente no disponible" : typeof profile.remaining === "number"
      ? `${profile.remaining} consultas disponibles${profile.period === "day" ? " hoy" : ""}`
      : "Consultas disponibles";
    if (planBtn) {
      planBtn.href = "/app/perfil/";
      const btnSpan = planBtn.querySelector("span");
      if (btnSpan) btnSpan.textContent = "Ver mi plan";
    }
  } else {
    // Sidebar User Trigger
    if (sbUserName) sbUserName.textContent = "Prueba gratis";
    if (sbUserSub) sbUserSub.textContent = "Conoce Campus";
    if (sbUserAvatar) {
      sbUserAvatar.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0" /></svg>';
      sbUserAvatar.classList.remove("has-initials");
    }

    // Sidebar User Dropdown
    if (menuName) menuName.textContent = "Tu cuenta Campus";
    if (menuSub) menuSub.textContent = "Guarda tus consultas";
    if (menuAvatar) {
      menuAvatar.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0" /></svg>';
      menuAvatar.classList.remove("has-initials");
    }
    if (menuLogout) menuLogout.hidden = true;
    if (menuLogin) {
      menuLogin.hidden = false;
      menuLogin.setAttribute("href", `/api/app/auth/start?return=${encodeURIComponent(location.pathname)}`);
    }


  }
}

let universityChoices: UniversityChoice[] = [];
let universityRequest: Promise<void> | undefined;
async function loadUniversities(optionsEl: HTMLDataListElement | null) {
  if (!optionsEl) return;
  if (!universityChoices.length) {
    universityRequest ??= fetch("/api/app/universities", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("No pudimos cargar las universidades. Recarga para intentarlo.");
      const data = await response.json() as { universities: UniversityChoice[] };
      universityChoices = data.universities;
    }).catch(error => { universityRequest = undefined; throw error; });
    await universityRequest;
  }
  if (!optionsEl.isConnected) return;
  optionsEl.replaceChildren(...universityChoices.map(item => {
    const option = document.createElement("option");
    option.value = universityLabel(item);
    return option;
  }));
  const upc = universityChoices.find(item => item.shortName?.toUpperCase() === 'UPC');
  const quickChoice = optionsEl.closest('form')?.querySelector<HTMLButtonElement>('[data-app-select-upc]');
  if (quickChoice) {
    quickChoice.hidden = !upc;
    if (upc) quickChoice.dataset.universityLabel = `${upc.shortName} — ${upc.name}`;
    quickChoice.setAttribute('aria-pressed', String(optionsEl.closest('form')?.querySelector<HTMLInputElement>('input')?.value === quickChoice.dataset.universityLabel));
  }
}

// Keep the expanded viewport across Astro page swaps, even if the keyboard stays open.
const mobileKeyboardViewport = createKeyboardViewportState();
let stopMobileKeyboard: (() => void) | undefined;

let stopSessionDisplay: (() => void) | undefined;
function initPage() {
  stopSessionDisplay?.();
  stopMobileKeyboard?.();
  stopMobileKeyboard = watchMobileKeyboard(mobileKeyboardViewport);
  updateNavHighlights();

  // Instant UI paint from harmless cache (only non-sensitive profile info)
  const copilotAccount = document.querySelector<HTMLElement>("[data-copilot-account]");
  renderCopilotAccount(copilotAccount, "loading");
  const cachedProfile = readUICache();
  applyAccountUI(cachedProfile);

  const status = document.querySelector<HTMLElement>("[data-app-status]");
  const say = (text: string) => { if (status) status.textContent = text; };
  const login = document.querySelector<HTMLAnchorElement>("[data-app-login]");
  const profileLoading = document.querySelector<HTMLElement>("[data-app-profile-loading]");
  const profileGuest = document.querySelector<HTMLElement>("[data-app-profile-guest]");
  const profileError = document.querySelector<HTMLElement>("[data-app-profile-error]");
  const profileAccount = document.querySelector<HTMLElement>("[data-profile-account]");
  renderProfileAccount(profileAccount, "loading");
  const profileAuthenticated = document.querySelector<HTMLElement>("[data-app-profile-authenticated]");
  const profileUniversity = document.querySelector<HTMLElement>("[data-app-profile-university]");
  const universityForm = document.querySelector<HTMLFormElement>("[data-app-university-form]");
  const universityInput = document.querySelector<HTMLInputElement>("#app-university");
  const universityOptions = document.querySelector<HTMLDataListElement>("[data-app-university-options]");
  const universitiesLoading = document.querySelector<HTMLElement>("[data-app-universities-loading]");
  const universityStatus = document.querySelector<HTMLElement>("[data-app-university-status]");
  const universityCancel = document.querySelector<HTMLElement>("[data-app-cancel-university]");
  const setUniversityStatus = (text: string, loading = false) => {
    if (!universityStatus) return;
    universityStatus.setAttribute("aria-busy", String(loading));
    if (!loading) { universityStatus.textContent = text; return; }
    const accessible = document.createElement("span"); accessible.className = "app-sr-only"; accessible.textContent = text;
    const skeleton = document.createElement("span"); skeleton.className = "app-skeleton app-skeleton--line"; skeleton.setAttribute("aria-hidden", "true");
    universityStatus.replaceChildren(accessible, skeleton);
  };

  function showUniversityForm(selected: UniversityChoice | null = null) {
    if (profileUniversity) profileUniversity.hidden = false;
    if (profileAuthenticated) profileAuthenticated.hidden = true;
    if (universityInput && !universityInput.value && selected) universityInput.value = universityLabel(selected);
    const declared = document.querySelector<HTMLInputElement>('[data-app-university-not-listed]');
    if (declared && selected) declared.checked = selected.id === null;
    if (selected) setUniversityStatus('Conservamos tu elección. Guarda para continuar.');
    if (!universityChoices.length && universitiesLoading) universitiesLoading.hidden = false;
    void loadUniversities(universityOptions).then(() => { if (universitiesLoading) universitiesLoading.hidden = true; })
      .catch(error => { if (universitiesLoading) universitiesLoading.hidden = true; setUniversityStatus(error.message); });
  }

  const loginUrl = location.pathname==='/app/copilot/'?connectorLoginHref(location.search):`/api/app/auth/start?return=${encodeURIComponent(location.pathname)}`;
  if (login) login.href = loginUrl;

  const renderSession = (value: CampusSession) => {
    if (profileError && (value.accessUnavailable || typeof value.authenticated !== "boolean")) { showSessionError(); return; }
    renderCopilotAccount(copilotAccount, value);
    renderProfileAccount(profileAccount, value);
    if (profileError) profileError.hidden = true;
    if (value.authenticated && !value.universityConfirmed && !["/app/perfil/", "/app/turnitin/", "/app/asistente/", "/app/profes/"].includes(location.pathname) && !/^\/app\/(?:asistente|profes)\/c\//.test(location.pathname)) {
      location.assign(universitySetupHref(location.pathname, location.search));
      return;
    }
    if (profileLoading) profileLoading.hidden = true;
    if (profileGuest) profileGuest.hidden = value.authenticated;
    if (!value.authenticated && profileUniversity) profileUniversity.hidden = true;
    if (profileAuthenticated) profileAuthenticated.hidden = !value.authenticated || !value.universityConfirmed;
    if (value.authenticated && !value.universityConfirmed) showUniversityForm(readGuestUniversity());

    const email = document.querySelector("[data-app-email]");
    if (email) email.textContent = value.email ?? "Inicia sesión con tu cuenta Campus.";
    const universityName = document.querySelector("[data-app-university-name]");
    if (universityName) universityName.textContent = value.university ? universityLabel(value.university) : "Sin universidad";
    const miupcConnector = document.querySelector<HTMLElement>("#miupc");
    if (miupcConnector) miupcConnector.hidden = !canConnectMiupc(value);
    const coverage = document.querySelector<HTMLElement>("[data-app-profile-coverage]");
    if (coverage) coverage.hidden = !value.universityConfirmed || value.profesAvailable !== false;
    const bannerStatus = document.querySelector<HTMLElement>("[data-app-banner-status]");
    if (bannerStatus) {
      if (value.banner?.connected) {
        const details = [
          value.banner.career,
          value.banner.entryYear ? `Malla ${value.banner.entryYear}` : null,
          value.banner.enrolledCount ? `${value.banner.enrolledCount} cursos inscritos` : null,
        ].filter(Boolean).join(" · ");
        bannerStatus.textContent = details ? `Conectado (${details})` : "Conectado";
      } else {
        bannerStatus.textContent = "No conectado (opcional para ver horario y avance)";
      }
    }
    if (login) login.hidden = value.authenticated;
    const logout = document.querySelector<HTMLElement>("[data-app-logout]");
    if (logout) logout.hidden = !value.authenticated;

    if (value.authenticated) {
      const rawName = value.banner?.fullName || value.email?.split("@")[0] || "";
      const cleanName = formatStudentName(rawName);
      const shortName = cleanName ? (cleanName.split(" ").length > 2 ? `${cleanName.split(" ")[0]} ${cleanName.split(" ")[1]}` : cleanName) : "";
      const parts = cleanName ? cleanName.trim().split(/\s+/).filter(Boolean) : [];
      const initials = parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : parts.length > 1 ? (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase() : "";

      const subTitle = value.banner?.connected
        ? (value.banner.career ? `UPC · ${formatStudentName(value.banner.career)}` : "UPC · Alumno")
        : (value.university?.shortName || value.email?.split("@")[1] || "Cuenta Campus");

      const profileCache: UIProfileCache = {
        authenticated: true,
        cleanName,
        shortName,
        initials,
        subTitle,
        bannerConnected: !!value.banner?.connected,
        plan: value.plan,
        plusTest: value.plusTest,
        accessUnavailable: value.accessUnavailable,
        remaining: value.usage?.remaining,
        period: value.usage?.period,
      };
      writeUICache(profileCache);
      applyAccountUI(profileCache);
    } else {
      writeUICache(null);
      applyAccountUI(null);
    }

    if (profileGuest && new URLSearchParams(location.search).get("login") === "error") {
      say("No se pudo completar el inicio de sesión. Inténtalo de nuevo.");
    }
  };
  const updated = (event: Event) => renderSession((event as CustomEvent<CampusSession>).detail);
  window.addEventListener("campus:session-updated", updated);
  stopSessionDisplay = () => window.removeEventListener("campus:session-updated", updated);
  const showSessionError = () => {
    const preview = readUICache();
    if (preview?.authenticated) applyAccountUI({ ...preview, accessUnavailable: true, remaining: undefined });
    renderCopilotAccount(copilotAccount, "error");
    renderProfileAccount(profileAccount, "error");
    if (profileLoading) profileLoading.hidden = true;
    if (profileGuest) profileGuest.hidden = true;
    if (profileUniversity) profileUniversity.hidden = true;
    if (profileAuthenticated) profileAuthenticated.hidden = true;
    if (profileError) profileError.hidden = false;
  };
  getCampusSession().then(renderSession).catch(showSessionError);
  document.querySelectorAll<HTMLButtonElement>("[data-profile-refresh]").forEach(button => {
    button.addEventListener("click", async () => {
      renderProfileAccount(profileAccount, "loading");
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      try { await getCampusSession(true).then(renderSession); }
      catch { showSessionError(); }
      finally { button.disabled = false; button.removeAttribute("aria-busy"); }
    });
  });

  copilotAccount?.querySelector("[data-copilot-account-retry]")?.addEventListener("click", () => {
    renderCopilotAccount(copilotAccount, "loading");
    void getCampusSession(true).then(value => {
      if (copilotAccount.isConnected) renderSession(value);
    }).catch(() => {
      if (copilotAccount.isConnected) renderCopilotAccount(copilotAccount, "error");
    });
  });

  document.querySelector("[data-app-change-university]")?.addEventListener("click", () => {
    showUniversityForm();
    if (universityCancel) universityCancel.hidden = false;
    universityInput?.focus();
  });

  universityCancel?.addEventListener("click", () => {
    if (profileUniversity) profileUniversity.hidden = true;
    if (profileAuthenticated) profileAuthenticated.hidden = false;
    universityCancel.hidden = true;
    setUniversityStatus("");
  });

  const upcChoice = document.querySelector<HTMLButtonElement>('[data-app-select-upc]');
  upcChoice?.addEventListener('click', () => {
    if (!universityInput || !upcChoice.dataset.universityLabel) return;
    universityInput.value = upcChoice.dataset.universityLabel;
    upcChoice.setAttribute('aria-pressed', 'true');
    setUniversityStatus('UPC seleccionada. Guarda para continuar.');
  });
  universityInput?.addEventListener('input', () => {
    upcChoice?.setAttribute('aria-pressed', String(universityInput.value === upcChoice.dataset.universityLabel));
    setUniversityStatus('');
  });

  universityForm?.addEventListener("submit", async event => {
    event.preventDefault();
    if (universityForm.dataset.saving === 'true') return;
    const matches = universitySearchMatches(universityChoices, universityInput?.value ?? '');
    const declared = document.querySelector<HTMLInputElement>('[data-app-university-not-listed]')?.checked;
    const choice = declared ? declaredUniversity(universityInput?.value) : matches[0];
    if (!choice || !declared && matches.length !== 1) {
      setUniversityStatus(matches.length > 1 ? 'UP identifica a dos universidades. Elige Universidad de Palermo (Argentina) o Universidad del Pacífico (Perú).' : "Elige una universidad de las sugerencias.");
      universityInput?.focus();
      return;
    }
    universityForm.dataset.saving = 'true';
    const button = universityForm.querySelector<HTMLButtonElement>("button[type=submit]");
    if (button) {
      button.disabled = true; button.setAttribute("aria-busy", "true"); button.setAttribute("aria-label", "Guardando tu universidad…");
      button.querySelector<HTMLElement>("[data-app-university-submit-label]")!.hidden = true;
      button.querySelector<HTMLElement>("[data-app-university-submit-skeleton]")!.hidden = false;
    }
    setUniversityStatus("Guardando tu universidad…", true);
    try {
      const response = await fetch("/api/app/university", {
        method: "POST",
        headers: { "content-type": "application/json", ...analyticsHeaders() },
        body: JSON.stringify(universitySelectionPayload(choice)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos guardar tu universidad.");
      location.assign(universityDoneHref(location.search));
    } catch (error) {
      delete universityForm.dataset.saving;
      setUniversityStatus(error instanceof Error ? error.message : "No pudimos guardar tu universidad.");
      if (button) {
        button.disabled = false; button.removeAttribute("aria-busy"); button.removeAttribute("aria-label");
        button.querySelector<HTMLElement>("[data-app-university-submit-label]")!.hidden = false;
        button.querySelector<HTMLElement>("[data-app-university-submit-skeleton]")!.hidden = true;
      }
    }
  });

  // NavUser Dropdown Popover
  const userTrigger = document.querySelector<HTMLButtonElement>("#app-sidebar-user-trigger");
  const userMenu = document.querySelector<HTMLElement>("#app-sidebar-user-menu");

  if (userTrigger && userMenu) {
    userTrigger.onclick = (e) => {
      e.stopPropagation();
      const isHidden = userMenu.hidden;
      userMenu.hidden = !isHidden;
      userTrigger.setAttribute("aria-expanded", String(isHidden));
    };

    document.addEventListener("click", (e) => {
      if (!userMenu.hidden && !userMenu.contains(e.target as Node) && !userTrigger.contains(e.target as Node)) {
        userMenu.hidden = true;
        userTrigger.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !userMenu.hidden) {
        userMenu.hidden = true;
        userTrigger.setAttribute("aria-expanded", "false");
        userTrigger.focus();
      }
    });
  }

  document.querySelectorAll<HTMLElement>("[data-app-logout], [data-app-sidebar-logout]").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        const response = await fetch("/api/app/logout", { method: "POST", headers: analyticsHeaders() });
        if (!response.ok) throw new Error();
        track('campus_logout_completed');
        clearCampusSession();
        writeUICache(null);
        location.assign("/app/");
      } catch {
        say("No pudimos cerrar la sesión. Inténtalo otra vez.");
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-copy-value]").forEach(button => button.addEventListener("click", async () => {
    const value = button.dataset.copyValue;
    const label = button.dataset.copyLabel ?? "Dato";
    if (!value) return;
    const copiedMessage = label === "URL" ? "URL copiada. Pégala" : "Nombre copiado. Pégalo";
    const copyTarget = label === "URL" ? "la URL" : "el nombre";
    const copyStatus = button.closest(".connector-copy")?.querySelector<HTMLElement>("[data-copy-status]");
    const announceCopy = (message: string) => { if (copyStatus) copyStatus.textContent = message; else say(message); };
    try {
      await navigator.clipboard.writeText(value);
      track('campus_connector_copied', { copy_kind: label === 'URL' ? 'url' : 'name' });
      announceCopy(`${copiedMessage} en la configuración de tu asistente.`);
    } catch {
      track('campus_flow_failed', { step: 'connector', error_kind: 'clipboard' });
      announceCopy(`No pudimos copiar ${copyTarget}. Selecciona el dato y cópialo manualmente.`);
    }
  }));

  document.querySelectorAll<HTMLAnchorElement>("[data-copy-connector-url]").forEach(link => link.addEventListener("click", () => {
    const url = link.dataset.copyConnectorUrl;
    if (!url) return;
    const copyStatus = link.closest(".app-connector-card")?.querySelector<HTMLElement>("[data-copy-status]");
    const announceCopy = (message: string) => { if (copyStatus) copyStatus.textContent = message; else say(message); };
    try {
      void navigator.clipboard.writeText(url)
        .then(() => announceCopy("URL de Campus copiada. En Gemini, abre Apps personalizadas y pégala."))
        .catch(() => announceCopy("No se pudo copiar la URL. Usa el botón Copiar del paso 2 antes de pegarla en Gemini."));
    } catch {
      announceCopy("No se pudo copiar la URL. Usa el botón Copiar del paso 2 antes de pegarla en Gemini.");
    }
  }));
}

// Hook into Astro's View Transitions lifecycle (initial load and every client-side page load)
document.addEventListener("astro:page-load", initPage);
document.addEventListener("astro:before-swap", () => { stopMobileKeyboard?.(); stopMobileKeyboard = undefined; });

// Fallback for regular load if ClientRouter is absent
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    if (!("astro" in window)) initPage();
  });
} else if (!("astro" in window)) {
  initPage();
}

// Service Worker registration (only runs once)
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "127.0.0.1" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// PWA Install prompt handling (no invasivo, respetuoso)
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const pwaBanner = document.querySelector<HTMLElement>("#app-pwa-banner");
const pwaInstallBtn = document.querySelector<HTMLButtonElement>("#app-pwa-install-btn");
const pwaDismissBtn = document.querySelector<HTMLButtonElement>("#app-pwa-dismiss-btn");
const pwaMsg = document.querySelector<HTMLElement>("#app-pwa-banner-msg");

const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
let isDismissed = false;
try { isDismissed = localStorage.getItem("campus-pwa-dismissed") === "1"; } catch { /* Storage is optional. */ }

if (!isStandalone && !isDismissed && pwaBanner) {
  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    pwaBanner.hidden = false;
  });

  if (isIos) {
    pwaBanner.hidden = false;
    if (pwaMsg) pwaMsg.textContent = "Toca Compartir y luego 'Añadir a pantalla de inicio'.";
    if (pwaInstallBtn) pwaInstallBtn.textContent = "¿Cómo instalar?";
  }

  pwaInstallBtn?.addEventListener("click", async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      deferredPrompt = null;
      pwaBanner.hidden = true;
    } else if (isIos) {
      alert("Para agregar Campus a tu pantalla de inicio:\n1. Toca el botón Compartir (icono con flecha hacia arriba) en Safari.\n2. Desplázate hacia abajo y selecciona 'Añadir a pantalla de inicio'.");
    }
  });

  pwaDismissBtn?.addEventListener("click", () => {
    try { localStorage.setItem("campus-pwa-dismissed", "1"); } catch { /* Keep dismissal in this document. */ }
    pwaBanner.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    pwaBanner.hidden = true;
    try { localStorage.setItem("campus-pwa-dismissed", "1"); } catch { /* Keep dismissal in this document. */ }
  });
}


// Notifications only invalidate local display state. The reload verifies the
// actual cookie/session on the server; neither a message nor storage grants access.
let invalidatingAccount=false;
watchSessionChanges(() => {
  if(invalidatingAccount)return;
  invalidatingAccount=true;
  clearCampusSession(false);
  stopMobileKeyboard?.();
  document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input, textarea').forEach(field=>{field.value='';field.blur();});
  document.querySelectorAll('.app-profes-ai__conversation, [data-app-profile-authenticated]').forEach(element=>element.replaceChildren());
  location.reload();
});

watchLiveCampusSession();

document.addEventListener('click',event=>{
  const link=event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement|null : null;
  if(!link)return;
  const url=new URL(link.href,location.href);
  if(url.origin===location.origin && url.pathname==='/api/app/auth/start')markGuestDraftHandoff();
},true);
