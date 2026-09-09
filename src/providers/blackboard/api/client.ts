import axios, { AxiosInstance, AxiosError } from 'axios';
import path from 'path';
import type { Session } from '../types.js';
import { laneFor, paceFor } from './pace.js';
import { Reuse, isReusable, keyFor, reuseFor } from './reuse.js';

const BASE_URL = 'https://aulavirtual.upc.edu.pe';
const ALLOWED_HOST = 'aulavirtual.upc.edu.pe';
// Blackboard uses several vendor-owned hosts for signed file downloads. These
// redirects are allowed only within the Blackboard domain; credentials are
// stripped before following any cross-origin redirect below.
const BLACKBOARD_DOWNLOAD_HOST = /(?:^|\.)blackboard\.com$/i;

// Axios attaches the instance's default headers — including the session Cookie
// and X-Blackboard-XSRF token — even when a request URL is absolute and points
// at a different host entirely, bypassing baseURL. A caller-controlled URL
// (bbcswebdav links, blackboard_raw_api's path) must never be allowed to be
// absolute unless it targets this exact host, or the student's session leaks
// to whatever host was supplied.
export function assertSameOrigin(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url, BASE_URL);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:' || parsed.host !== ALLOWED_HOST) {
    throw new Error(
      `Refusing to send the Blackboard session to a non-Blackboard host: ${parsed.hostname}`
    );
  }
}

/**
 * A redirect may use any Blackboard-owned signed download host, but callers
 * can never start a session-authenticated request there. The redirect handler
 * strips credentials before accepting it below.
 */
export function assertTrustedBlackboardRedirect(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url, BASE_URL);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (
    parsed.protocol !== 'https:' ||
    (parsed.host !== ALLOWED_HOST && !BLACKBOARD_DOWNLOAD_HOST.test(parsed.hostname))
  ) {
    throw new Error(
      `Refusing to follow a Blackboard redirect to an untrusted host: ${parsed.hostname}`
    );
  }
}

function stripSessionHeaders(headers: Record<string, unknown> | undefined): void {
  if (!headers) return;
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === 'cookie' || name.toLowerCase() === 'x-blackboard-xsrf') {
      delete headers[name];
    }
  }
}

export function assertPublicApiUrl(url: string): void {
  assertSameOrigin(url);
  const parsed = new URL(url, BASE_URL);
  if (!parsed.pathname.startsWith('/learn/api/public/')) {
    throw new Error('Raw API calls are restricted to /learn/api/public/ endpoints');
  }
}

export function assertBlackboardFileUrl(url: string): void {
  assertSameOrigin(url);
  const parsed = new URL(url, BASE_URL);
  if (!parsed.pathname.startsWith('/bbcswebdav/')) {
    throw new Error('Direct downloads are restricted to Blackboard /bbcswebdav/ URLs');
  }
}

// Server-reported filenames (Content-Disposition, Blackboard fileName) are untrusted —
// strip to a plain basename so a crafted name can't write outside `dir` (CWE-22).
// `.`/`..`/empty are rejected outright: path.basename('.') is '.', which would make
// dest === dir and crash writeFileSync with EISDIR instead of failing safely.
export function safeDestPath(dir: string, name: string): string {
  const base = path.basename(name);
  if (!base || base === '.' || base === '..') {
    throw new Error(`Refusing to write an unsafe filename: ${name}`);
  }
  const dest = path.join(dir, base);
  const rel = path.relative(dir, dest);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`Refusing to write outside output directory: ${name}`);
  }
  return dest;
}

export type ClientOptions = {
  /**
   * Identifies whose traffic this is, for processes serving several students.
   *
   * The CLI leaves it out: one process is one person. The hosted relay passes
   * the student's key so that one person's downloads never queue behind
   * another's, while each person still looks like a single browser.
   */
  paceKey?: string;
  /**
   * Shared short-term memory of GET responses.
   *
   * Passed in when several clients serve the same person, so rebuilding the
   * client does not throw away what we just asked. Defaults to a private one.
   */
  reuse?: Reuse;
};

export function createClient(session: Session, options: ClientOptions = {}): AxiosInstance {
  // Build cookie header string
  const cookieStr = session.cookies
    .filter((c) => {
      const domain = c.domain.replace(/^\./, '');
      return ALLOWED_HOST === domain || ALLOWED_HOST.endsWith(`.${domain}`);
    })
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      Cookie: cookieStr,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(session.xsrfToken ? { 'X-Blackboard-XSRF': session.xsrfToken } : {}),
    },
    withCredentials: true,
    beforeRedirect: (options) => {
      const url = `${options.protocol}//${options.hostname}${options.port ? `:${options.port}` : ''}${options.path ?? '/'}`;
      assertTrustedBlackboardRedirect(url);
      // Signed Blackboard links authorize the download in their URL. Do not
      // forward a student's Blackboard cookie or XSRF token cross-origin.
      if (options.hostname !== ALLOWED_HOST) {
        stripSessionHeaders(options.headers as Record<string, unknown> | undefined);
      }
    },
  });

  // Pacing goes on the adapter rather than on interceptors because the slot has
  // to come back however the request ends. An interceptor pair would have to
  // match each response to its request by hand, and any request that never
  // settled would hold its slot until the process exited.
  const pace = paceFor(options.paceKey ?? 'local');
  const key = options.paceKey ?? 'local';
  const reuse = options.reuse ?? reuseFor(key);
  const base = axios.getAdapter(client.defaults.adapter);
  client.defaults.adapter = (config) => {
    // Central choke point: every request this client ever sends passes through
    // here, so this is where the session leaks if a URL slips through unchecked
    // — enforcing it at each call site instead has already missed one (the `campus
    // api` CLI command shipped without the guard that blackboard_raw_api got).
    assertSameOrigin(config.url ?? '');
    const send = () => pace.run(laneFor(config), () => base(config));
    if (!isReusable(config)) {
      // A write invalidates everything we remember before it runs, so a reader
      // racing the write cannot repopulate the memory with the old answer.
      reuse.forget();
      return send();
    }
    // Reuse sits in front of pacing on purpose: an answer we already have costs
    // the university nothing and should not wait behind anyone's queue.
    return reuse.get(keyFor(config), send);
  };

  // Intercept 401 to give a helpful message
  client.interceptors.response.use(
    (r) => r,
    (err: AxiosError) => {
      if (err.response?.status === 401) {
        const e = new Error('Session expired. Run: campus login');
        (e as any).code = 'SESSION_EXPIRED';
        throw e;
      }
      throw err;
    }
  );

  return client;
}
