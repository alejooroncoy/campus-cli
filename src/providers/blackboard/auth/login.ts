import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Session, Cookie } from '../types.js';
import { saveSession } from './session.js';
import { launchPersistentContextSafe } from '../../../browser-install.js';

const BASE_URL = 'https://aulavirtual.upc.edu.pe';
const SAML_URL = `${BASE_URL}/auth-saml/saml/login?apId=_4893_1&redirectUrl=${encodeURIComponent(`${BASE_URL}/ultra`)}`;

const SESSION_TTL_FALLBACK_MS = 3 * 60 * 60 * 1000; // 3h — matches BbRouter timeout:10800
const PROFILE_DIR = path.join(os.homedir(), '.blackboard-cli', 'browser-profile');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface LoginOptions {
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
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true, mode: 0o700 });
  }
}

export async function login(opts: LoginOptions = {}): Promise<Session> {
  const { headless = false, timeout = 120_000 } = opts;

  ensureProfileDir();

  const context = await launchPersistentContextSafe(PROFILE_DIR, {
    headless,
    userAgent: USER_AGENT,
  });

  const page = await context.newPage();

  try {
    console.log('Navigating to UPC Aula Virtual...');
    await page.goto(SAML_URL, { waitUntil: 'networkidle', timeout });

    // With persistent context, Microsoft SSO may auto-complete without showing the login page
    let needsInteractiveLogin = false;
    try {
      await page.waitForURL(/login\.microsoftonline\.com/, { timeout: 8_000 });
      needsInteractiveLogin = true;
    } catch {
      // SSO cookies still valid — SAML redirect auto-completing
    }

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

      // Handle "Stay signed in?" prompt
      try {
        await page.waitForSelector('#idBtn_Back, #KmsiCheckboxField', { timeout: 8_000 });
        const noBtn = page.locator('#idBtn_Back');
        if (await noBtn.isVisible()) await noBtn.click();
      } catch {}
    }

    // Wait for redirect back to aulavirtual.upc.edu.pe/ultra
    console.log('Waiting for authentication to complete...');
    await page.waitForURL(/aulavirtual\.upc\.edu\.pe\/ultra/, {
      timeout: timeout - 10_000,
    });

    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Extract cookies
    const rawCookies = await context.cookies();
    const cookies: Cookie[] = rawCookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    }));

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
        .filter(c => c.domain.includes('aulavirtual.upc.edu.pe'))
        .map(c => `${c.name}=${c.value}`)
        .join('; ');
      const resp = await page.request.get(`${BASE_URL}/learn/api/public/v1/users/me`, {
        headers: { Accept: 'application/json', Cookie: cookieStrForApi },
      });
      if (resp.ok()) userData = await resp.json();
    } catch {}

    const displayName = resolveDisplayName(userData);

    const session: Session = {
      cookies,
      xsrfToken: nonce,
      userId: userData?.id,
      userName: displayName,
      expiresAt: extractBbRouterExpiry(cookies),
    };

    saveSession(session);
    console.log(`✓ Logged in as ${displayName || 'unknown'}`);

    return session;
  } finally {
    await context.close();
  }
}

export async function silentRelogin(previousSession?: Session | null): Promise<Session> {
  if (!fs.existsSync(PROFILE_DIR)) {
    throw new SilentLoginFailed('No browser profile — run campus login first');
  }

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
    await page.goto(SAML_URL, { waitUntil: 'commit', timeout: 20_000 });

    // If SSO cookies are still valid, this redirect completes automatically
    await page.waitForURL(/aulavirtual\.upc\.edu\.pe\/ultra/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 });

    const rawCookies = await context.cookies();
    const cookies: Cookie[] = rawCookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    }));

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
          .filter(c => c.domain.includes('aulavirtual.upc.edu.pe'))
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
      cookies,
      xsrfToken: extractXsrf(cookies),
      userId,
      userName,
      expiresAt: extractBbRouterExpiry(cookies),
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
