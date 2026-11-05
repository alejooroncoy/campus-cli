import { onCLS, onFCP, onINP, onLCP } from 'web-vitals';
import type { Metric } from 'web-vitals';

type Properties = Record<string, unknown>;
const pageContext = (properties: Properties) => {
  const { utm_source: _source, utm_medium: _medium, utm_campaign: _campaign, utm_content: _content, ...page } = properties;
  return page;
};

/** One observer set per document; no DOM attribution or raw performance entries. */
export function startWebVitals(capture: (properties: Properties) => void, initialPage: Properties) {
  let page = pageContext(initialPage);
  let pending: Properties = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer); timer = undefined;
    if (!Object.keys(pending).length) return;
    capture({ ...page, ...pending }); pending = {};
  };
  const report = (metric: Metric) => {
    if (!Number.isFinite(metric.value) || metric.value < 0 || metric.value >= 900_000) return;
    pending[`$web_vitals_${metric.name}_value`] = metric.value;
    timer ??= setTimeout(flush, 5000);
  };
  if (typeof window !== 'undefined' && window.document && typeof PerformanceObserver !== 'undefined') {
    // Native Web Vitals describe a document load, including after an Astro
    // route change. Retain that load's safe URL instead of relabelling it.
    onCLS(report); onFCP(report); onINP(report); onLCP(report);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', flush);
  }
  return {
    flush,
    restore(properties: Properties) { flush(); page = pageContext(properties); },
  };
}
