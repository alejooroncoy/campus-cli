import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { resolvedPublicHttpsUrl } from './research-http.js';
import { MAX_BROWSER_PDF_BYTES, type BrowserReadingOpen } from './research-browser-reading.js';

const PDF_LINK = /^\s*(?:view|download|get|ver|descargar)(?:\s+(?:the|full[- ]text|el|texto completo))?\s+pdf\b/i;
const CHALLENGE = /just a moment|are you a robot|verify (?:that )?you are human|confirm (?:that )?you are (?:a )?human|captcha|verifica que eres humano/i;

/** A normal, visible browser. No stealth patches, CAPTCHA clicks, cookie export or server retry. */
export function localResearchBrowser(options: {
  launch?: () => Promise<Browser>;
  validateUrl?: typeof resolvedPublicHttpsUrl;
} = {}): BrowserReadingOpen {
  return async callbacks => {
    const validateUrl = options.validateUrl ?? resolvedPublicHttpsUrl;
    await validateUrl(callbacks.url);
    const browser = await (options.launch ?? (() => chromium.launch({ headless: false })) )();
    let context: BrowserContext | undefined;
    let closed = false;
    let capturing = false;
    let scanning = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const setups = new Map<Page, Promise<void>>();
    const clicked = new Set<string>();
    const close = async () => {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      await browser.close().catch(() => {});
    };
    const fail = () => { if (!closed) callbacks.onFailure(); };
    try {
      context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block', ignoreHTTPSErrors: false });
      context.on('close', () => { if (!closed) { closed = true; if (timer) clearInterval(timer); callbacks.onClosed(); void browser.close().catch(() => {}); } });
      browser.on('disconnected', () => { if (!closed) { closed = true; if (timer) clearInterval(timer); callbacks.onClosed(); } });

      const setup = (page: Page): Promise<void> => {
        const prior = setups.get(page);
        if (prior) return prior;
        const promise = (async () => {
          // A user can click a download/popup before its new page has a CDP session.
          // Playwright emits that download on the originating page; consume only this context's artifact.
          page.on('download', download => {
            void (async () => {
              if (closed || capturing) return;
              capturing = true;
              const stream = await download.createReadStream();
              if (!stream) throw new Error('download_unavailable');
              const chunks: Buffer[] = []; let total = 0;
              for await (const raw of stream) {
                const chunk = Buffer.from(raw); total += chunk.length;
                if (closed || total > MAX_BROWSER_PDF_BYTES) {
                  stream.destroy(); await download.cancel().catch(() => {}); throw new Error('cancelled_or_oversized_pdf');
                }
                chunks.push(chunk);
              }
              await callbacks.onPdf(Buffer.concat(chunks, total));
            })().catch(fail).finally(() => { void download.delete().catch(() => {}); });
          });
          const session = await context!.newCDPSession(page);
          // Pause response headers, before Chromium's PDF viewer/download consumes the bytes.
          // Stream in bounded chunks; response.body() would allocate an unbounded response.
          session.on('Fetch.requestPaused', event => {
            void (async () => {
              const headers = event.responseHeaders ?? [];
              const header = (name: string) => headers.find(h => h.name.toLowerCase() === name)?.value ?? '';
              const pdf = /application\/pdf/i.test(header('content-type'))
                || /filename\*?=.*\.pdf(?:[";\s]|$)/i.test(header('content-disposition'));
              if (closed || capturing || !pdf || event.responseStatusCode !== 200) {
                await session.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {}); return;
              }
              await validateUrl(event.request.url);
              capturing = true;
              if (Number(header('content-length')) > MAX_BROWSER_PDF_BYTES) throw new Error('oversized_pdf');
              const { stream } = await session.send('Fetch.takeResponseBodyAsStream', { requestId: event.requestId });
              const chunks: Buffer[] = [];
              let total = 0;
              try {
                for (;;) {
                  const chunk = await session.send('IO.read', { handle: stream, size: 64 * 1024 });
                  const bytes = Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8');
                  total += bytes.length;
                  if (closed || total > MAX_BROWSER_PDF_BYTES) throw new Error('cancelled_or_oversized_pdf');
                  chunks.push(bytes);
                  if (chunk.eof) break;
                }
              } finally {
                await session.send('IO.close', { handle: stream }).catch(() => {});
                // The manager owns this downloaded PDF. Do not also download or render it a second time.
                await session.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Aborted' }).catch(() => {});
              }
              await callbacks.onPdf(Buffer.concat(chunks, total));
            })().catch(() => { if (!closed) fail(); });
          });
          await session.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Response' }] });
        })();
        setups.set(page, promise);
        return promise;
      };
      // Install the response observer before even a fast popup can issue its first request.
      // All requests and redirects stay public HTTPS; credentials never leave this browser context.
      await context.route('**/*', async route => {
        try {
          await validateUrl(route.request().url());
          // A popup's initial navigation can precede creation of its Playwright Frame.
          // Do not deadlock/abort it; its download is observed on the originating page.
          let owner: Page | undefined;
          try { owner = route.request().frame().page(); } catch { /* early popup */ }
          if (owner) await setup(owner);
          if (closed) await route.abort(); else await route.continue();
        } catch { await route.abort().catch(() => {}); }
      });
      context.on('page', page => { void setup(page).catch(fail); });
      const page = await context.newPage();
      await setup(page);
      const scan = async () => {
        if (closed || capturing || scanning) return;
        scanning = true;
        try {
          for (const candidate of context!.pages()) {
            if (candidate.isClosed()) continue;
            const title = await candidate.title().catch(() => '');
            const beginning = await candidate.locator('body').innerText({ timeout: 500 }).then(text => text.slice(0, 700)).catch(() => '');
            if (CHALLENGE.test(title) || CHALLENGE.test(beginning)
              || await candidate.locator('#challenge-form, iframe[src*="challenges.cloudflare.com"], iframe[src*="recaptcha"]').count()) continue;
            const links = candidate.getByRole('link').filter({ hasText: PDF_LINK });
            const count = Math.min(await links.count(), 10);
            for (let i = 0; i < count; i++) {
              const link = links.nth(i);
              if (!await link.isVisible()) continue;
              const href = await link.getAttribute('href');
              if (!href) continue;
              const target = new URL(href, candidate.url()).toString();
              await validateUrl(target);
              const key = candidate.url() + '\n' + target;
              if (clicked.has(key)) continue;
              clicked.add(key);
              // Follow the actual PDF link in this observed page, retaining the same cookies.
              // target=_blank must not race creation of a new PDF-only browser target.
              await candidate.goto(target, { waitUntil: 'domcontentloaded', timeout: 2000 }).catch(() => {});
              break;
            }
          }
        } catch { /* A page may navigate while its human-verification UI changes. Retry the scan, not the request. */ }
        finally { scanning = false; }
      };
      timer = setInterval(() => { void scan(); }, 1500);
      timer.unref();
      // A challenge, PDF capture or user interaction can keep navigation pending. The job owns the deadline.
      void page.goto(callbacks.url, { waitUntil: 'domcontentloaded', timeout: 30_000 }).then(scan).catch(() => {});
      return { close };
    } catch {
      await close();
      throw new Error('No se pudo abrir el navegador local de lectura. Instala Chromium con npx playwright install chromium.');
    }
  };
}
