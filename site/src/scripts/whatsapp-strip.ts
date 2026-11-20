// La franja lee el estado que pinta la tarjeta de WhatsApp (data-state en
// [data-whatsapp-reminders]) y al tocarla abre la misma tarjeta en una hoja
// inferior. La tarjeta no se duplica: se mueve a la hoja y vuelve a su lugar al cerrar.

type StripCopy = { text: string; action: string };
const COPY: Record<string, StripCopy> = {
  free: { text: "Tu semana en WhatsApp", action: "Con Plus" },
  link: { text: "Tu semana en WhatsApp", action: "Vincular" },
  off: { text: "Tu semana en WhatsApp", action: "Activar" },
  on: { text: "Tu semana llega a WhatsApp", action: "Ajustes" },
};

let cleanup = () => {};
export function mountWhatsAppStrip() {
  cleanup();
  const strip = document.querySelector<HTMLButtonElement>("[data-wa-strip]");
  const sheet = document.querySelector<HTMLDialogElement>("[data-wa-sheet]");
  const card = document.querySelector<HTMLElement>("[data-whatsapp-reminders]");
  if (!strip || !sheet || !card) return;
  const body = sheet.querySelector<HTMLElement>("[data-wa-sheet-body]")!;
  const text = strip.querySelector<HTMLElement>("[data-wa-strip-text]")!;
  const action = strip.querySelector<HTMLElement>("[data-wa-strip-action]")!;
  const home = document.createComment("wa-card");

  const paint = () => {
    const state = card.dataset.state ?? "";
    const copy = COPY[state];
    // Sin sesión, mientras carga o con WhatsApp aún sin activar: no hay franja.
    strip.hidden = card.hidden || !copy;
    if (!copy) return;
    strip.dataset.state = state;
    text.textContent = copy.text;
    action.textContent = copy.action;
  };
  const watcher = new MutationObserver(paint);
  watcher.observe(card, { attributes: true, attributeFilter: ["data-state", "hidden"] });
  paint();

  const open = () => {
    if (sheet.open) return;
    card.before(home);
    body.append(card);
    sheet.showModal();
  };
  const restore = () => {
    if (home.isConnected) {
      home.replaceWith(card);
    }
    strip.focus({ preventScroll: true });
  };
  const close = () => sheet.close();
  // Tocar fuera de la hoja (el fondo) también la cierra.
  const backdrop = (event: MouseEvent) => {
    if (event.target === sheet) close();
  };
  strip.addEventListener("click", open);
  sheet.addEventListener("close", restore);
  sheet.addEventListener("click", backdrop);
  const closeButton = sheet.querySelector<HTMLButtonElement>("[data-wa-sheet-close]")!;
  closeButton.addEventListener("click", close);

  cleanup = () => {
    watcher.disconnect();
    strip.removeEventListener("click", open);
    sheet.removeEventListener("close", restore);
    sheet.removeEventListener("click", backdrop);
    closeButton.removeEventListener("click", close);
    if (sheet.open) sheet.close();
  };
}
document.addEventListener("astro:before-swap", () => cleanup());
