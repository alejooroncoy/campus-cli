// Botón «Copiar texto para mi IA» de /herramientas/formato-apa-7/.
// Descarga el archivo estático una vez, lo copia al portapapeles y, si el navegador lo impide,
// lo muestra en un cuadro de texto para copiarlo a mano.
const SKILL_URL = '/skills/apa7-campus-pegable.md';

const button = document.querySelector<HTMLButtonElement>('[data-apa-copy]');
const status = document.querySelector<HTMLElement>('[data-apa-status]');
const fallback = document.querySelector<HTMLTextAreaElement>('[data-apa-fallback]');
const sizeLabel = document.querySelector<HTMLElement>('[data-apa-size]');

let cached: string | undefined;

async function loadText(): Promise<string> {
  if (cached !== undefined) return cached;
  const response = await fetch(SKILL_URL, { cache: 'no-cache' }); // revalida: si actualizamos la skill, nadie copia la versión vieja
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  cached = await response.text();
  if (sizeLabel) sizeLabel.textContent = `${Math.round(new Blob([cached]).size / 1024)} KB`;
  return cached;
}

function say(message: string) {
  if (status) status.textContent = message;
}

function showManualCopy(text: string) {
  if (!fallback) return;
  fallback.hidden = false;
  fallback.value = text;
  fallback.focus();
  fallback.select();
}

button?.addEventListener('click', async () => {
  button.disabled = true;
  say('Preparando el texto…');
  try {
    const text = await loadText();
    try {
      await navigator.clipboard.writeText(text);
      say('Copiado. Pégalo en tu asistente de IA y adjunta tu trabajo.');
    } catch {
      showManualCopy(text);
      say('Tu navegador no permitió copiar automáticamente. Selecciona el texto del cuadro y cópialo.');
    }
  } catch {
    say('No se pudo cargar el texto. Usa «Descargar como archivo» e inténtalo de nuevo.');
  } finally {
    button.disabled = false;
  }
});

// Muestra el tamaño real sin esperar al clic.
loadText().catch(() => undefined);

// «Ir a copiar el texto»: si el botón de copiar ya se ve (escritorio), no mueve la página: la resalta y deja el foco en el botón de copiar.
// Si queda fuera de pantalla (celular), baja hasta ella y también la resalta.
const jump = document.querySelector<HTMLAnchorElement>('[data-apa-jump]');
const card = document.getElementById('herramienta');

function highlightCard() {
  if (!card) return;
  card.classList.remove('is-highlighted');
  void card.offsetWidth; // reinicia la animación si se pulsa dos veces
  card.classList.add('is-highlighted');
  button?.focus({ preventScroll: true });
}

jump?.addEventListener('click', (event) => {
  if (!card) return;
  const target = (button ?? card).getBoundingClientRect(); // basta con que el botón de copiar se vea
  const visible = target.top >= 0 && target.bottom <= window.innerHeight;
  if (visible) {
    event.preventDefault();
    highlightCard();
  } else {
    setTimeout(highlightCard, 450); // deja que termine el desplazamiento por ancla
  }
});
