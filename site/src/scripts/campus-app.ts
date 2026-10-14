import { watchMobileKeyboard } from "./mobile-keyboard";
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
    if (planTitle) planTitle.textContent = "Campus";
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
    if (sbUserName) sbUserName.textContent = "Invitado";
    if (sbUserSub) sbUserSub.textContent = "Sin iniciar sesión";
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

const universities = new Map<string, number>();
const universityKey = (value: string) => value.trim().toLocaleLowerCase("es-PE");

async function loadUniversities(optionsEl: HTMLDataListElement | null) {
  if (!optionsEl || universities.size) return;
  const response = await fetch("/api/app/universities", { cache: "no-store" });
  if (!response.ok) throw new Error("No pudimos cargar las universidades. Recarga para intentarlo.");
  const data = await response.json() as { universities: { id: number; name: string; shortName: string | null }[] };
  for (const item of data.universities) {
    const label = item.shortName ? `${item.shortName} — ${item.name}` : item.name;
    universities.set(universityKey(label), item.id);
    if (item.shortName) universities.set(universityKey(item.shortName), item.id);
    const option = document.createElement("option");
    option.value = label;
    optionsEl.append(option);
  }
}

let stopMobileKeyboard: (() => void) | undefined;

function initPage() {
  stopMobileKeyboard?.();
  stopMobileKeyboard = watchMobileKeyboard();
  updateNavHighlights();

  // Instant UI paint from harmless cache (only non-sensitive profile info)
  const cachedProfile = readUICache();
  applyAccountUI(cachedProfile);

  const status = document.querySelector<HTMLElement>("[data-app-status]");
  const say = (text: string) => { if (status) status.textContent = text; };
  const login = document.querySelector<HTMLAnchorElement>("[data-app-login]");
  const profileLoading = document.querySelector<HTMLElement>("[data-app-profile-loading]");
  const profileGuest = document.querySelector<HTMLElement>("[data-app-profile-guest]");
  const profileAuthenticated = document.querySelector<HTMLElement>("[data-app-profile-authenticated]");
  const profileUniversity = document.querySelector<HTMLElement>("[data-app-profile-university]");
  const universityForm = document.querySelector<HTMLFormElement>("[data-app-university-form]");
  const universityInput = document.querySelector<HTMLInputElement>("#app-university");
  const universityOptions = document.querySelector<HTMLDataListElement>("[data-app-university-options]");
  const universityStatus = document.querySelector<HTMLElement>("[data-app-university-status]");
  const universityCancel = document.querySelector<HTMLElement>("[data-app-cancel-university]");

  function showUniversityForm() {
    if (profileUniversity) profileUniversity.hidden = false;
    if (profileAuthenticated) profileAuthenticated.hidden = true;
    void loadUniversities(universityOptions).catch(error => { if (universityStatus) universityStatus.textContent = error.message; });
  }

  const loginUrl = `/api/app/auth/start?return=${encodeURIComponent(location.pathname)}`;
  if (login) login.href = loginUrl;

  getCampusSession().then(value => {
    if (value.authenticated && !value.universityConfirmed && !["/app/perfil/", "/app/turnitin/"].includes(location.pathname)) {
      location.assign("/app/perfil/?universidad=pendiente");
      return;
    }
    if (profileLoading) profileLoading.hidden = true;
    if (profileGuest) profileGuest.hidden = value.authenticated;
    if (profileAuthenticated) profileAuthenticated.hidden = !value.authenticated || !value.universityConfirmed;
    if (value.authenticated && !value.universityConfirmed) showUniversityForm();

    document.querySelectorAll("[data-app-plan]").forEach(el => {
      el.textContent = value.authenticated
        ? value.accessUnavailable ? "Campus · Saldo no disponible" : value.plan === "plus" ? "Campus · Acceso activo (100/día)" : "Campus · Acceso gratuito (25 consultas)"
        : el.tagName === "A" ? "Iniciar sesión" : "Prueba gratis (5 consultas)";
    });

    document.querySelectorAll<HTMLElement>("[data-app-activate]").forEach(el => {
      el.hidden = !value.authenticated || value.plan === "plus" || value.accessBlocked === true || value.accessUnavailable === true;
    });

    const email = document.querySelector("[data-app-email]");
    if (email) email.textContent = value.email ?? "Inicia sesión con tu cuenta Campus.";
    const universityName = document.querySelector("[data-app-university-name]");
    if (universityName) universityName.textContent = value.university?.shortName ? `${value.university.shortName} — ${value.university.name}` : value.university?.name ?? "Sin universidad";
    const miupcConnector = document.querySelector<HTMLElement>("#miupc");
    if (miupcConnector) miupcConnector.hidden = !canConnectMiupc(value);
    const coverage = document.querySelector<HTMLElement>("[data-app-profile-coverage]");
    if (coverage) coverage.hidden = !value.universityConfirmed || value.profesAvailable !== false;
    const usage = document.querySelector("[data-app-usage]");
    if (usage) usage.textContent = value.accessUnavailable ? "No pudimos comprobar tu saldo. Puedes volver a intentarlo sin iniciar sesión." : value.usage ? `${value.usage.remaining} de ${value.usage.limit} consultas disponibles${value.usage.period === "day" ? " hoy" : " en tu prueba"}.` : "5 consultas de prueba gratis disponibles.";
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
  }).catch(() => {
    applyAccountUI(null);
    if (profileLoading) profileLoading.hidden = true;
    if (profileGuest) profileGuest.hidden = false;
    if (profileAuthenticated) profileAuthenticated.hidden = true;
    if (profileGuest && new URLSearchParams(location.search).get("login") === "error") {
      say("No se pudo iniciar sesión. Inténtalo de nuevo.");
    }
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
    if (universityStatus) universityStatus.textContent = "";
  });

  universityForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const universityId = universities.get(universityKey(universityInput?.value ?? ""));
    if (!universityId) {
      if (universityStatus) universityStatus.textContent = "Elige una universidad de las sugerencias.";
      universityInput?.focus();
      return;
    }
    const button = universityForm.querySelector<HTMLButtonElement>("button[type=submit]");
    if (button) button.disabled = true;
    if (universityStatus) universityStatus.textContent = "Guardando tu universidad…";
    try {
      const response = await fetch("/api/app/university", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ universityId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos guardar tu universidad.");
      location.assign(new URLSearchParams(location.search).get("universidad") === "pendiente" ? "/app/profes/" : "/app/perfil/");
    } catch (error) {
      if (universityStatus) universityStatus.textContent = error instanceof Error ? error.message : "No pudimos guardar tu universidad.";
      if (button) button.disabled = false;
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
        const response = await fetch("/api/app/logout", { method: "POST" });
        if (!response.ok) throw new Error();
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
    try {
      await navigator.clipboard.writeText(value);
      say(`${copiedMessage} en la configuración de tu asistente.`);
    } catch {
      say(`No pudimos copiar ${copyTarget}. Selecciona el dato y cópialo manualmente.`);
    }
  }));

  document.querySelectorAll<HTMLAnchorElement>("[data-copy-connector-url]").forEach(link => link.addEventListener("click", () => {
    const url = link.dataset.copyConnectorUrl;
    if (!url) return;
    try {
      void navigator.clipboard.writeText(url)
        .then(() => say("URL de Campus copiada. En Gemini, abre Apps personalizadas y pégala."))
        .catch(() => say("No se pudo copiar la URL. Usa el botón Copiar de arriba antes de pegarla en Gemini."));
    } catch {
      say("No se pudo copiar la URL. Usa el botón Copiar de arriba antes de pegarla en Gemini.");
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
const isDismissed = localStorage.getItem("campus-pwa-dismissed") === "1";

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
    localStorage.setItem("campus-pwa-dismissed", "1");
    pwaBanner.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    pwaBanner.hidden = true;
    localStorage.setItem("campus-pwa-dismissed", "1");
  });
}
