import { chromium, type Browser } from 'playwright';
import { researchDownload, resolvedPublicHttpsUrl, ResearchHttpError, ResearchBrowserAccessError } from './research-http.js';
import { resolveResearchHtmlPdf } from './research-html.js';
import { localResearchBrowser } from './research-browser.js';
import { MAX_BROWSER_PDF_BYTES, type BrowserReadingOpen } from './research-browser-reading.js';

const API = 'https://api.browserbase.com/v1';
const ID = /^[a-z0-9][a-z0-9-]{0,100}$/i;
const PDF_LINK = /^\s*(?:view|download|get|ver|descargar)(?:\s+(?:the|full[- ]text|el|texto completo))?\s+pdf\b/i;
const CHALLENGE = /just a moment|are you a robot|captcha|verify.*human|confirm.*human|verifica que eres humano/i;

export function browserRecoveryEligible(error: unknown) {
  return error instanceof ResearchBrowserAccessError
    || error instanceof ResearchHttpError && error.status === 403 && !error.rateLimited;
}

async function boundedBody(response: Response, maximum: number) {
  const chunks: Buffer[] = []; let size = 0;
  if (Number(response.headers.get('content-length')) > maximum) {
    await response.body?.cancel(); throw new Error('response_too_large');
  }
  if (!response.body) throw new Error('response_empty');
  const stream = response.body.getReader();
  try {
    for (;;) {
      const chunk = await stream.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > maximum) throw new Error('response_too_large');
      chunks.push(Buffer.from(chunk.value));
    }
    return Buffer.concat(chunks, size);
  } finally { await stream.cancel().catch(() => {}); stream.releaseLock(); }
}

/** Browserbase is only used for a blocked public source, after per-job human approval. */
export function automaticResearchBrowser(options: {
  apiKey?: string; projectId?: string;
  confirm: (source: { origin: string; doi?: string }) => Promise<boolean>;
  download?: typeof researchDownload;
  local?: BrowserReadingOpen;
  fetch?: typeof fetch;
  connect?: (url: string) => Promise<Browser>;
  validateUrl?: typeof resolvedPublicHttpsUrl;
  timeoutMs?: number; pollMs?: number;
}): BrowserReadingOpen {
  return async callbacks => {
    const abort = new AbortController();
    let sessionId: string | undefined; let projectId = options.projectId;
    let browser: Browser | undefined; let local: Awaited<ReturnType<BrowserReadingOpen>> | undefined;
    let closed = false; let released = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const validate = options.validateUrl ?? resolvedPublicHttpsUrl;
    const request = options.fetch ?? fetch;
    const timeoutMs = Math.min(options.timeoutMs ?? 150_000, 180_000);
    const api = async (path: string, body?: unknown, cleanup = false) => {
      const response = await request(API + path, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { 'x-bb-api-key': options.apiKey!, 'content-type': 'application/json',
          accept: path.startsWith('/downloads/') ? 'application/octet-stream' : 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: cleanup ? AbortSignal.timeout(5000) : AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]),
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error('browserbase_api_unavailable'); }
      return response;
    };
    const json = async (path: string, body?: unknown) => JSON.parse((await boundedBody(await api(path, body), 256 * 1024)).toString());
    const release = async () => {
      if (!sessionId || released) return;
      released = true;
      await api('/sessions/' + sessionId, { status: 'REQUEST_RELEASE', ...(projectId ? { projectId } : {}) }, true)
        .then(response => response.body?.cancel()).catch(() => {});
    };
    const close = async () => {
      closed = true; abort.abort(); if (timer) clearTimeout(timer);
      await local?.close().catch(() => {});
      let closingTimer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.all([release(), browser?.close().catch(() => {})]),
        new Promise<void>(resolve => { closingTimer = setTimeout(resolve, 5500); }),
      ]).finally(() => { if (closingTimer) clearTimeout(closingTimer); });
    };
    const delay = (ms: number) => new Promise<void>(resolve => {
      if (abort.signal.aborted) { resolve(); return; }
      const done = () => { clearTimeout(wait); abort.signal.removeEventListener('abort', done); resolve(); };
      const wait = setTimeout(done, ms);
      abort.signal.addEventListener('abort', done, { once: true });
    });
    void (async () => {
      await validate(callbacks.url);
      callbacks.onProgress?.('direct_download');
      const download = options.download ?? researchDownload;
      let blocked = false;
      try {
        if (callbacks.skipDirect) throw new ResearchBrowserAccessError();
        const downloaded = await resolveResearchHtmlPdf(await download(callbacks.url, { maxBytes: MAX_BROWSER_PDF_BYTES }),
          { maxBytes: MAX_BROWSER_PDF_BYTES }, download);
        if (closed) return;
        if (downloaded.bytes.subarray(0, 5).toString() === '%PDF-') {
          await callbacks.onPdf(downloaded.bytes); return;
        }
        blocked = CHALLENGE.test(downloaded.bytes.subarray(0, 32 * 1024).toString());
        // A normal publisher landing page may require JavaScript to expose its PDF.
        if (!blocked && !/text\/html/i.test(downloaded.contentType)) throw new Error('not_a_pdf');
      } catch (error) {
        if (!browserRecoveryEligible(error)) throw error;
        blocked = true;
      }
      if (closed) return;
      if (!options.apiKey) {
        callbacks.onProgress?.('local_verification');
        local = await (options.local ?? localResearchBrowser())(callbacks);
        if (closed) await local.close();
        return;
      }
      callbacks.onProgress?.('awaiting_browserbase_approval');
      if (!await options.confirm({ origin: new URL(callbacks.url).origin, doi: callbacks.doi }) || closed) {
        if (!closed) callbacks.onFailure('browserbase_not_authorized'); return;
      }
      callbacks.onProgress?.('browserbase_verification');
      timer = setTimeout(() => { if (!closed) { callbacks.onFailure('browserbase_timeout'); void close(); } }, timeoutMs);
      timer.unref();
      // No existing contexts, campus cookies, paid proxies, recordings or TLS exceptions.
      const session = await json('/sessions', { ...(projectId ? { projectId } : {}),
        timeout: Math.max(60, Math.ceil(timeoutMs / 1000)), keepAlive: false,
        browserSettings: { solveCaptchas: true, recordSession: false, logSession: false, ignoreCertificateErrors: false },
      });
      if (typeof session.id !== 'string' || !ID.test(session.id)) throw new Error('invalid_session');
      sessionId = session.id;
      if (typeof session.projectId === 'string' && ID.test(session.projectId)) projectId = session.projectId;
      if (closed) { await release(); return; }
      const connect = new URL(session.connectUrl);
      if (connect.protocol !== 'wss:' || !connect.hostname.endsWith('.browserbase.com')
        || connect.username || connect.password || connect.port && connect.port !== '443') throw new Error('invalid_connection');
      browser = await (options.connect ?? (url => chromium.connectOverCDP(url)))(connect.toString());
      if (closed) { await browser.close(); return; }
      const context = browser.contexts()[0];
      if (!context) throw new Error('browser_context_missing');
      await context.route('**/*', async route => {
        try { await validate(route.request().url()); if (closed) await route.abort(); else await route.continue(); }
        catch { await route.abort().catch(() => {}); }
      });
      const page = context.pages()[0] ?? await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.setBypassServiceWorker', { bypass: true });
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: 'downloads', eventsEnabled: true });
      void page.goto(callbacks.url, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
      const followed = new Set<string>();
      while (!closed) {
        // The official download API retrieves the bytes from this session only.
        // Never refetch a signed publisher URL or send the API key to a publisher.
        const listed = await json('/downloads?sessionId=' + encodeURIComponent(sessionId!) + '&limit=10');
        if (closed) return;
        if (!Array.isArray(listed.downloads)) throw new Error('invalid_downloads');
        const file = listed.downloads.find((item: any) => item.mimeType === 'application/pdf' || /\.pdf$/i.test(item.filename ?? ''));
        if (file) {
          if (typeof file.id !== 'string' || !ID.test(file.id) || !Number.isFinite(file.size)
            || file.size <= 0 || file.size > MAX_BROWSER_PDF_BYTES) throw new Error('invalid_download');
          callbacks.onProgress?.('downloading_pdf');
          const bytes = await boundedBody(await api('/downloads/' + file.id), MAX_BROWSER_PDF_BYTES);
          if (closed) return;
          await callbacks.onPdf(bytes); return;
        }
        for (const candidate of context.pages()) {
          if (closed) return;
          try {
            // Human-verification navigations can destroy the JS execution context.
            const title = await candidate.title();
            const beginning = await candidate.locator('body').innerText({ timeout: 500 });
            if (CHALLENGE.test(title + ' ' + beginning.slice(0, 900))) continue;
            const links = candidate.getByRole('link').filter({ hasText: PDF_LINK });
            for (let i = 0; i < Math.min(await links.count(), 10); i++) {
              const link = links.nth(i);
              if (!await link.isVisible()) continue;
              const href = await link.getAttribute('href'); if (!href) continue;
              const target = await validate(new URL(href, candidate.url()).toString());
              const key = target.origin + target.pathname;
              if (followed.has(key)) continue;
              followed.add(key);
              void candidate.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
              break;
            }
          } catch { /* Observe the next stable page; do not reload the publisher. */ }
        }
        await delay(options.pollMs ?? 2000);
      }
    })().catch(() => { if (!closed) callbacks.onFailure('browserbase_download_failed'); })
      .finally(() => { if (!local) void close(); });
    return { close };
  };
}
