import { track } from './analytics.ts';

type Step = 'document' | 'payment';
export function setupTurnitinRequest(form: HTMLFormElement, uploads: { validate: (kind?: 'document' | 'receipt') => boolean }) {
  const panels = [...form.querySelectorAll<HTMLElement>('[data-ti-request-step]')];
  const progress = [...form.querySelectorAll<HTMLButtonElement>('.ti-request-progress [data-ti-go-step]')];
  const summary = form.querySelector<HTMLElement>('[data-ti-document-summary]')!;
  const documentInput = form.elements.namedItem('document') as HTMLInputElement;
  let step: Step = 'document';
  let started = false;
  const viewed = new Set<Step>();
  function show(next: Step, focus = false) {
    step = next;
    panels.forEach(panel => { panel.hidden = panel.dataset.tiRequestStep !== step; });
    progress.forEach(button => {
      if (button.dataset.tiGoStep === step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    summary.textContent = documentInput.files?.[0]?.name ?? '';
    if (started && !viewed.has(step)) { viewed.add(step); track('campus_turnitin_step_viewed', { step }); }
    if (focus) {
      const heading = form.querySelector<HTMLElement>(`[data-ti-request-step="${step}"] h3`)!;
      heading.focus({ preventScroll: true });
      form.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }
  function next() {
    if (!uploads.validate('document')) { show('document'); return false; }
    show('payment', true); return true;
  }
  form.querySelector<HTMLButtonElement>('[data-ti-next]')!.onclick = next;
  form.querySelectorAll<HTMLButtonElement>('[data-ti-go-step]').forEach(button => {
    button.onclick = () => { if (button.dataset.tiGoStep === 'payment') next(); else show('document', true); };
  });
  documentInput.addEventListener('change', () => {
    summary.textContent = documentInput.files?.[0]?.name ?? '';
    if (!documentInput.files?.length && step === 'payment') show('document', true);
  });
  const copy = form.querySelector<HTMLButtonElement>('[data-ti-copy-phone]')!;
  const copyLabel = copy.querySelector<HTMLElement>('[data-ti-copy-label]')!;
  copy.onclick = async () => {
    const number = form.querySelector<HTMLElement>('[data-ti-phone]')!.textContent?.replace(/\s/g, '') ?? '';
    try { await navigator.clipboard.writeText(number); copyLabel.textContent = 'Copiado'; track('campus_turnitin_payment_copied'); }
    catch { copyLabel.textContent = 'Copia el número'; }
  };
  return {
    start() { started = true; show(step); },
    next,
    isPayment: () => step === 'payment',
    document: () => show('document', true),
    reset() { started = false; viewed.clear(); show('document'); copyLabel.textContent = 'Copiar'; },
  };
}
