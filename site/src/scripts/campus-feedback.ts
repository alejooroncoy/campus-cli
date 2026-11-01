import { inView } from 'motion';
import { validPublicReviews } from '../lib/product-reviews.mjs';

/** Public reviews stay live so edits and withdrawals are respected. */
function setupCampusFeedback() {
  document.querySelectorAll<HTMLElement>('[data-campus-feedback]').forEach(root => {
    if (root.dataset.feedbackInitialized) return;
    root.dataset.feedbackInitialized = 'true';
    const card = root.querySelector<HTMLElement>('[data-public-feedback]');
    const text = root.querySelector<HTMLElement>('[data-feedback-text]');
    const link = root.querySelector<HTMLAnchorElement>('[data-feedback-link]');
    if (!card || !text || !link) return;
    card.hidden = true;
    text.textContent = '';
    const controller = new AbortController();
    const stopObserving = inView(root, () => {
      void (async () => {
        try {
          const response = await fetch('/api/app/blackboard-reviews/?page=1', {
            credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' },
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]),
          });
          if (!response.ok) return;
          const data = await response.json();
          if (controller.signal.aborted || !validPublicReviews(data) || data.page !== 1 || !data.reviews.length) return;
          const review = data.reviews[0];
          text.textContent = `“${review.text}”`;
          link.href = `/opiniones-campus/#review-${encodeURIComponent(review.id)}`;
          card.hidden = false;
        } catch { /* The sourced WhatsApp quote and public review link remain. */ }
      })();
    }, { margin: '200px 0px' });
    document.addEventListener('astro:before-swap', () => {
      stopObserving();
      controller.abort();
      delete root.dataset.feedbackInitialized;
    }, { once: true });
  });
}
setupCampusFeedback();
document.addEventListener('astro:page-load', setupCampusFeedback);
