import { chromium, type BrowserContext } from 'playwright';
import { execFileSync } from 'child_process';

type PersistentContextOptions = Parameters<typeof chromium.launchPersistentContext>[1];

// Both providers (Blackboard, Mi UPC) launch a persistent Chromium context for
// their SSO login flow. New installs (npm install -g, npx, --ignore-scripts,
// or a `postinstall` that silently failed) can end up without the Chromium
// binary Playwright expects — self-heal once instead of surfacing Playwright's
// raw "Executable doesn't exist" wall of text.
let installAttempted = false;

function isMissingBrowserError(err: any): boolean {
  const msg = err?.message ?? '';
  return msg.includes("Executable doesn't exist") || msg.includes('playwright install');
}

// "Chrome for Testing" (what Playwright downloads) exposes automation
// fingerprints — navigator.webdriver=true, the AutomationControlled blink
// feature — that Microsoft Entra's risk-based conditional access sometimes
// treats as a signal to force an extra identity-verification challenge that
// then fails ("Sorry, we're having trouble verifying your account"). None of
// this bypasses auth — the human still completes the real Microsoft login —
// it just stops the browser from looking like a bot to that risk scoring.
function stealthArgs(existing: string[] = []): string[] {
  return [...existing, '--disable-blink-features=AutomationControlled'];
}

async function applyStealth(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
}

async function doLaunch(profileDir: string, options: PersistentContextOptions): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext(profileDir, {
    ...options,
    args: stealthArgs(options?.args),
  });
  await applyStealth(context);
  return context;
}

export async function launchPersistentContextSafe(
  profileDir: string,
  options: PersistentContextOptions
): Promise<BrowserContext> {
  try {
    return await doLaunch(profileDir, options);
  } catch (err: any) {
    if (!isMissingBrowserError(err) || installAttempted) throw err;
    installAttempted = true;
    console.log('Instalando el navegador de Playwright (solo la primera vez)...');
    execFileSync('npx', ['playwright', 'install', 'chromium'], { stdio: 'inherit' });
    return await doLaunch(profileDir, options);
  }
}
