import { chromium, type BrowserContext } from 'playwright';
import { execFileSync } from 'child_process';
import { sequentializeByKey } from './concurrency.js';

type PersistentContextOptions = Parameters<typeof chromium.launchPersistentContext>[1];

// Both providers (Blackboard, Mi UPC) launch a persistent Chromium context for
// their SSO login flow. New installs (npm install -g, npx, --ignore-scripts,
// or a `postinstall` that silently failed) can end up without the Chromium
// binary Playwright expects — self-heal once per profileDir instead of
// surfacing Playwright's raw "Executable doesn't exist" wall of text. Keyed
// by profileDir (not a single process-wide flag) so a second provider
// (canvas_*/moodle_*, using its own profileDir) doesn't inherit a false
// "already tried" state from Blackboard's launch, or vice versa.
const installAttempted = new Set<string>();
const systemChannelsExhausted = new Set<string>();

// Playwright can drive an already-installed Chromium-based browser via
// `channel` instead of downloading its own — try the common ones in order.
// There's no way to ask the OS "what's the default browser", and this list
// only helps when the default happens to be Chromium-based (Chrome/Edge);
// Firefox/Safari can't run this Chromium-specific SSO flow either way.
const SYSTEM_CHROMIUM_CHANNELS = ['chrome', 'msedge'] as const;

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

// Concurrent MCP tool calls can each independently trigger a session refresh
// (see auth/session.ts loadOrRefreshSession) and all funnel through here with
// the same profileDir — CLAUDE.md tells agents they may fan out up to 5
// parallel tool calls. Chromium's user-data-dir holds an exclusive lock, so
// launching two persistent contexts against the same profile at once fails
// or hangs instead of queueing. Serialize per-profileDir so concurrent
// callers await the same in-flight launch instead of racing separate ones.
const launchQueues = new Map<string, Promise<void>>();

export async function launchPersistentContextSafe(
  profileDir: string,
  options: PersistentContextOptions
): Promise<BrowserContext> {
  return sequentializeByKey(launchQueues, profileDir, () =>
    launchPersistentContextExclusive(profileDir, options)
  );
}

async function launchPersistentContextExclusive(
  profileDir: string,
  options: PersistentContextOptions
): Promise<BrowserContext> {
  // Prefer a Chromium-based browser already installed on this machine —
  // avoids Playwright's ~150MB Chromium download entirely in the common
  // case. The stealth patch (navigator.webdriver) applies the same
  // regardless of which binary is driven, so this doesn't reintroduce the
  // Entra bot-detection problem.
  if (!systemChannelsExhausted.has(profileDir) && !options?.channel) {
    for (const channel of SYSTEM_CHROMIUM_CHANNELS) {
      try {
        return await doLaunch(profileDir, { ...options, channel });
      } catch {
        // Try the next system channel, then fall through to the bundled
        // Chromium below — any launch failure here (not just "not found")
        // should still leave the bundled fallback a chance to work.
      }
    }
    systemChannelsExhausted.add(profileDir);
  }

  try {
    return await doLaunch(profileDir, options);
  } catch (err: any) {
    if (installAttempted.has(profileDir)) throw err;
    installAttempted.add(profileDir);
    // Playwright doesn't expose a stable error code for "browser not
    // installed" (just an English message), so instead of pattern-matching
    // it, always try the self-heal install once. `playwright install
    // chromium` is idempotent — near-instant if already installed — so this
    // costs nothing when the failure wasn't actually about a missing
    // browser, and the retry below still surfaces the real error either way.
    // stdout es el canal JSON-RPC cuando esto corre dentro de `campus mcp`: todo va a stderr.
    console.error('Verificando el navegador de Playwright (solo la primera vez)...');
    try {
      execFileSync('npx', ['playwright', 'install', 'chromium'], { stdio: ['ignore', 2, 2] });
    } catch {
      throw err; // install itself failed — surface the original launch error
    }
    return await doLaunch(profileDir, options);
  }
}
