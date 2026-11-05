// La landing se genera con los precios de siempre; aquí se reemplazan por los
// vigentes (editables desde el panel de admin) apenas responde /config.
type Product = { id: 'ai' | 'similarity' | 'both'; amountCents: number };

const money = (cents: number) => `S/${(cents / 100).toLocaleString('es-PE', { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;

async function refreshLandingPrices() {
  const targets = document.querySelectorAll<HTMLElement>('[data-ti-landing-price]');
  if (!targets.length) return;
  try {
    const response = await fetch('/api/app/turnitin/config', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const products: Product[] = ((await response.json()).products ?? [])
      .filter((product: Product) => Number.isInteger(product?.amountCents) && product.amountCents >= 100 && product.amountCents <= 10_000);
    if (!products.length) return;
    const price = (id: string) => id === 'min' ? Math.min(...products.map(product => product.amountCents)) : products.find(product => product.id === id)?.amountCents;
    targets.forEach(target => {
      const cents = price(target.dataset.tiLandingPrice ?? '');
      if (cents !== undefined) target.textContent = (target.dataset.tiLandingPrefix ?? '') + money(cents);
    });
  } catch { /* La landing conserva sus precios por defecto. */ }
}

void refreshLandingPrices();
