// Botón «Copiar texto para mi IA» de las páginas de APA 7 (formato y normas).
// Descarga el archivo estático una vez, lo copia al portapapeles y, si el navegador lo impide,
// lo muestra en un cuadro de texto para copiarlo a mano.
const SKILL_URL = '/skills/apa7-campus-pegable.md';
const MARKER = 'name: apa7-campus-pegable'; // el archivo real empieza con este frontmatter

const button = document.querySelector<HTMLButtonElement>('[data-apa-copy]');
const status = document.querySelector<HTMLElement>('[data-apa-status]');
const fallback = document.querySelector<HTMLTextAreaElement>('[data-apa-fallback]');
const sizeLabel = document.querySelector<HTMLElement>('[data-apa-size]');
const jump = document.querySelector<HTMLAnchorElement>('[data-apa-jump]');
const card = document.getElementById('herramienta');

// Sin JavaScript el botón no hace nada: queda oculto y solo funciona «Descargar como archivo».
if (button) button.hidden = false;

let pending: Promise<string> | undefined;

function loadText(): Promise<string> {
  pending ??= (async () => {
    const response = await fetch(SKILL_URL, { cache: 'no-cache' }); // revalida: si actualizamos la skill, nadie copia la versión vieja
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (!text.includes(MARKER)) throw new Error('El archivo no es la skill'); // evita copiar una página de error
    if (sizeLabel) sizeLabel.textContent = `${Math.round(new Blob([text]).size / 1024)} KB`;
    return text;
  })();
  pending.catch(() => { pending = undefined; }); // permite reintentar tras un fallo
  return pending;
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
  fallback.setSelectionRange(0, text.length); // iOS ignora select() en un textarea de solo lectura
}

// Safari y los navegadores dentro de otras apps solo dejan escribir en el portapapeles durante el clic:
// se entrega una promesa del texto en vez de esperar la descarga antes de copiar.
async function copyToClipboard(): Promise<string> {
  const text = loadText();
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })]);
      return text;
    } catch {
      // cae al método simple
    }
  }
  await navigator.clipboard.writeText(await text);
  return text;
}

button?.addEventListener('click', async () => {
  button.setAttribute('aria-busy', 'true'); // sin `disabled`: así el foco no se pierde
  say('Preparando el texto…');
  try {
    try {
      await copyToClipboard();
      say('Copiado. Pégalo en tu asistente de IA y adjunta tu trabajo.');
    } catch {
      showManualCopy(await loadText());
      say('Tu navegador no permitió copiar automáticamente. Selecciona el texto del cuadro y cópialo.');
    }
  } catch {
    say('No se pudo cargar el texto. Usa «Descargar como archivo» e inténtalo de nuevo.');
  } finally {
    button.removeAttribute('aria-busy');
  }
});

// Muestra el tamaño real sin esperar al clic.
loadText().catch(() => undefined);

// «Ir a copiar el texto»: si el botón de copiar ya se ve (escritorio), no mueve la página: resalta la tarjeta
// y deja el foco en el botón. Si queda fuera de pantalla (celular), baja hasta ella y también la resalta.
function highlightCard() {
  if (!card) return;
  card.classList.remove('is-highlighted');
  void card.offsetWidth; // reinicia la animación si se pulsa dos veces
  card.classList.add('is-highlighted');
  button?.focus({ preventScroll: true });
}

card?.addEventListener('animationend', () => card.classList.remove('is-highlighted'));

jump?.addEventListener('click', (event) => {
  if (!card) return;
  const target = (button ?? card).getBoundingClientRect(); // basta con que el botón de copiar se vea
  if (target.top >= 0 && target.bottom <= window.innerHeight) {
    event.preventDefault();
    highlightCard();
  } else if ('onscrollend' in window) {
    window.addEventListener('scrollend', highlightCard, { once: true });
  } else {
    setTimeout(highlightCard, 450);
  }
});
