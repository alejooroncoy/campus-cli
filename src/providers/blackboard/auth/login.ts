import fs from 'fs';
import os from 'os';
import path from 'path';
import type { BrowserContext, Page } from 'playwright';
import type { Session, Cookie } from '../types.js';
import { blackboardCookies, saveSession } from './session.js';
import { launchPersistentContextSafe } from '../../../browser-install.js';
import { blackboardUniversity, blackboardLoginUrl } from '../universities.js';

const SESSION_TTL_FALLBACK_MS = 3 * 60 * 60 * 1000; // 3h — matches BbRouter timeout:10800
const PROFILE_DIR = path.join(os.homedir(), '.blackboard-cli', 'browser-profile');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface LoginOptions {
  universityId?: string;
  headless?: boolean;
  username?: string;
  password?: string;
  timeout?: number;
}

export class SilentLoginFailed extends Error {
  constructor(reason: string) {
    super(`Silent re-login failed: ${reason}`);
    this.name = 'SilentLoginFailed';
  }
}

function extractBbRouterExpiry(cookies: Cookie[]): number {
  const bb = cookies.find(c => c.name === 'BbRouter');
  if (bb) {
    const m = bb.value.match(/expires:(\d+)/);
    if (m) {
      const ms = parseInt(m[1], 10) * 1000;
      const now = Date.now();
      // Sanity check: must be a future timestamp within 24 hours
      if (ms > now && ms < now + 24 * 60 * 60 * 1000) return ms;
    }
  }
  return Date.now() + SESSION_TTL_FALLBACK_MS;
}

// UPC's /users/me omits `userName` at the root. The display name must be
// assembled from `name.given` + `name.family`, falling back to `studentId`.
export function resolveDisplayName(userData: any): string | undefined {
  if (!userData) return undefined;
  if (typeof userData.userName === 'string' && userData.userName.trim()) return userData.userName.trim();
  const full = [userData?.name?.given, userData?.name?.family].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (userData?.name?.preferredDisplayName && typeof userData.name.preferredDisplayName === 'string') {
    const pdn = userData.name.preferredDisplayName.trim();
    if (pdn && pdn !== 'GivenName' && pdn !== 'FamilyName') return pdn;
  }
  return userData.studentId || undefined;
}

// Microsoft SSO persistence is controlled specifically by ESTSAUTHPERSIST
// (set when the user accepts "Keep me signed in"). Other cookies on
// login.microsoftonline.com like MUID/fpc are tracking and persist ~1 year
// but don't keep the user signed in — ignore them.
const SSO_COOKIE_NAMES = new Set(['ESTSAUTHPERSISTENT', 'ESTSAUTHLIGHT', 'ESTSAUTH']);

export function getSsoExpiry(cookies: Cookie[]): number | undefined {
  const ssoCookies = cookies.filter(c =>
    SSO_COOKIE_NAMES.has(c.name) &&
    (c.domain.includes('login.microsoftonline.com') || c.domain.includes('login.live.com'))
  );
  const now = Date.now();
  const future = ssoCookies
    .map(c => c.expires)
    .filter((e): e is number => typeof e === 'number' && e > 0)
    .map(e => e * 1000)
    .filter(ms => ms > now);
  if (future.length === 0) return undefined;
  return Math.max(...future);
}

function extractXsrf(cookies: Cookie[]): string {
  const bb = cookies.find(c => c.name === 'BbRouter');
  if (bb) {
    const m = bb.value.match(/xsrf:([a-f0-9-]+)/);
    if (m) return m[1];
  }
  return '';
}

function ensureProfileDir(): void {
  if (fs.existsSync(PROFILE_DIR) && fs.lstatSync(PROFILE_DIR).isSymbolicLink()) {
    throw new Error(`Refusing to use a browser profile through a symbolic link: ${PROFILE_DIR}`);
  }
  fs.mkdirSync(PROFILE_DIR, { recursive: true, mode: 0o700 });
  fs.chmodSync(PROFILE_DIR, 0o700);
}

export function isBlackboardUltraUrl(value: string | URL, universityId?: string): boolean {
  try {
    const url = value instanceof URL ? value : new URL(value);
    return url.protocol === 'https:'
      && url.origin === blackboardUniversity(universityId).origin
      && (url.pathname === '/ultra' || url.pathname.startsWith('/ultra/'));
  } catch {
    return false;
  }
}

async function waitForAuthenticationDestination(
  page: Page,
  timeout: number,
  universityId?: string,
): Promise<'microsoft' | 'ultra'> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (destination: 'microsoft' | 'ultra') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      page.off('framenavigated', inspect);
      page.off('domcontentloaded', inspect);
      resolve(destination);
    };
    const inspect = () => {
      if (isBlackboardUltraUrl(page.url(), universityId)) {
        finish('ultra');
        return;
      }
      void page.locator('input[type="email"], input[name="loginfmt"]')
        .isVisible()
        .then(visible => {
          if (visible) finish('microsoft');
        })
        .catch(() => undefined);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      page.off('framenavigated', inspect);
      page.off('domcontentloaded', inspect);
      reject(new Error('Timed out waiting for Microsoft login or Blackboard Ultra'));
    }, timeout);
    page.on('framenavigated', inspect);
    page.on('domcontentloaded', inspect);
    inspect();
  });
}

async function waitForSessionCookies(context: BrowserContext, timeout = 5_000, universityId?: string): Promise<Cookie[]> {
  const deadline = Date.now() + timeout;
  do {
    const cookies = (await context.cookies()).map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    }));
    if (blackboardCookies(cookies, universityId).some(cookie => cookie.name === 'JSESSIONID' || cookie.name === 'BbRouter')) {
      return cookies;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error('Blackboard redirected to Ultra without creating a session');
}

async function dismissStaySignedInOrContinue(page: Page, timeout = 8_000, universityId?: string): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(interval);
      page.off('framenavigated', inspect);
      page.off('domcontentloaded', inspect);
      resolve();
    };
    const inspect = () => {
      if (isBlackboardUltraUrl(page.url(), universityId)) {
        finish();
        return;
      }
      void page.locator('#idBtn_Back').isVisible()
        .then(async visible => {
          if (!visible || settled) return;
          await page.locator('#idBtn_Back').click();
          finish();
        })
        .catch(() => undefined);
    };
    const timer = setTimeout(finish, timeout);
    const interval = setInterval(inspect, 100);
    page.on('framenavigated', inspect);
    page.on('domcontentloaded', inspect);
    inspect();
  });
}

export async function login(opts: LoginOptions = {}): Promise<Session> {
  const { headless = false, timeout = 120_000 } = opts;

  const universityId = opts.universityId ?? 'upc-pe';
  const university = blackboardUniversity(universityId);
  const BASE_URL = university.origin;
  ensureProfileDir();

  const context = await launchPersistentContextSafe(PROFILE_DIR, {
    headless,
    userAgent: USER_AGENT,
  });

  const page = await context.newPage();

  try {
    console.log(`Navigating to ${university.name} Aula Virtual...`);
    const destination = waitForAuthenticationDestination(page, timeout, universityId);
    destination.catch(() => {}); // avoid an unhandled rejection if page.goto throws first
    await page.goto(blackboardLoginUrl(universityId), { waitUntil: 'commit', timeout });
    const needsInteractiveLogin = await destination === 'microsoft';

    if (needsInteractiveLogin) {
      if (opts.username) {
        await page.fill('input[type="email"], input[name="loginfmt"]', opts.username);
        await page.click('input[type="submit"], button[type="submit"]');
        await page.waitForTimeout(1500);
      }

      if (opts.password) {
        await page.waitForSelector('input[type="password"], input[name="passwd"]', { timeout: 15_000 });
        await page.fill('input[type="password"], input[name="passwd"]', opts.password);
        await page.click('input[type="submit"], button[type="submit"]');
        await page.waitForTimeout(1500);
      }

      await dismissStaySignedInOrContinue(page, 8_000, universityId);
    }

    console.log('Waiting for authentication to complete...');
    if (!isBlackboardUltraUrl(page.url(), universityId)) {
      await page.waitForURL(url => isBlackboardUltraUrl(url, universityId), {
        waitUntil: 'commit',
        timeout,
      });
    }
    const allCookies = await waitForSessionCookies(context, 5_000, universityId);
    const cookies = blackboardCookies(allCookies, universityId);
    await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => undefined);

    // Extract XSRF token from BbRouter cookie
    let nonce = extractXsrf(cookies);

    // Fallback: try meta tag in the page
    if (!nonce) {
      nonce = await page.evaluate(() => {
        const metaXsrf = document.querySelector<HTMLMetaElement>(
          'meta[name="blackboard.platform.security.NonceUtil.nonce"]'
        )?.content;
        if (metaXsrf) return metaXsrf;
        const allCookies = document.cookie.split(';').reduce<Record<string, string>>((acc, c) => {
          const [k, v] = c.trim().split('=');
          acc[k] = v;
          return acc;
        }, {});
        return allCookies['XSRF-TOKEN'] || '';
      });
    }

    // Get current user info via direct HTTP call with captured cookies
    let userData: any = null;
    try {
      const cookieStrForApi = cookies
        .filter(c => blackboardCookies([c], universityId).length > 0)
        .map(c => `${c.name}=${c.value}`)
        .join('; ');
      const resp = await page.request.get(`${BASE_URL}/learn/api/public/v1/users/me`, {
        headers: { Accept: 'application/json', Cookie: cookieStrForApi },
      });
      if (resp.ok()) userData = await resp.json();
    } catch {}

    const displayName = resolveDisplayName(userData);

    const session: Session = {
      universityId,
      cookies: blackboardCookies(cookies, universityId),
      xsrfToken: nonce,
      userId: userData?.id,
      userName: displayName,
      expiresAt: extractBbRouterExpiry(cookies),
      ssoExpiresAt: getSsoExpiry(allCookies),
    };

    saveSession(session);
    console.log(`✓ Logged in as ${displayName || 'unknown'}`);

    return session;
  } finally {
    await context.close();
  }
}

export async function silentRelogin(previousSession?: Session | null): Promise<Session> {
  const universityId = previousSession?.universityId ?? 'upc-pe';
  const BASE_URL = blackboardUniversity(universityId).origin;
  if (!fs.existsSync(PROFILE_DIR)) {
    throw new SilentLoginFailed('No browser profile — run campus login first');
  }
  if (fs.lstatSync(PROFILE_DIR).isSymbolicLink()) {
    throw new SilentLoginFailed('Browser profile is a symbolic link; run campus logout and login again');
  }
  fs.chmodSync(PROFILE_DIR, 0o700);

  let context;
  try {
    context = await launchPersistentContextSafe(PROFILE_DIR, {
      headless: true,
      userAgent: USER_AGENT,
    });
  } catch (err: any) {
    throw new SilentLoginFailed(`Could not open browser profile: ${err.message}`);
  }

  const page = await context.newPage();

  try {
    const ultraNavigation = page.waitForURL(url => isBlackboardUltraUrl(url, universityId), {
      waitUntil: 'commit',
      timeout: 20_000,
    });
    ultraNavigation.catch(() => {}); // avoid an unhandled rejection if page.goto throws first
    await page.goto(blackboardLoginUrl(universityId), { waitUntil: 'commit', timeout: 20_000 });
    await ultraNavigation;
    const allCookies = await waitForSessionCookies(context, 3_000, universityId);
    const cookies = blackboardCookies(allCookies, universityId);

    if (!cookies.some(c => c.name === 'JSESSIONID' || c.name === 'BbRouter')) {
      throw new SilentLoginFailed('Redirect succeeded but session cookies are missing');
    }

    let userId = previousSession?.userId;
    let userName = previousSession?.userName;

    // Self-heal: older sessions were stored with userName=null because the
    // old extractor looked at the wrong field. Refetch once if it's missing.
    if (!userName || !userId) {
      try {
        const cookieStrForApi = cookies
          .filter(c => blackboardCookies([c], universityId).length > 0)
          .map(c => `${c.name}=${c.value}`)
          .join('; ');
        const resp = await page.request.get(`${BASE_URL}/learn/api/public/v1/users/me`, {
          headers: { Accept: 'application/json', Cookie: cookieStrForApi },
        });
        if (resp.ok()) {
          const me = await resp.json();
          userId = userId ?? me?.id;
          userName = userName ?? resolveDisplayName(me);
        }
      } catch {}
    }

    const session: Session = {
      universityId,
      cookies: blackboardCookies(cookies, universityId),
      xsrfToken: extractXsrf(cookies),
      userId,
      userName,
      expiresAt: extractBbRouterExpiry(cookies),
      ssoExpiresAt: getSsoExpiry(allCookies),
    };

    saveSession(session);
    return session;
  } catch (err: any) {
    if (err instanceof SilentLoginFailed) throw err;
    throw new SilentLoginFailed(err.message ?? 'Timed out — SSO session likely expired');
  } finally {
    await context.close();
  }
}
