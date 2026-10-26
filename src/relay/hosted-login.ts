import { loginToRelay, type RelayCredentialStore } from './auth.js';
import { relayFetch, relayUrl } from './config.js';
import { loginUniversity } from './local-login.js';

/** Hosted onboarding uses the official remote browser; renewal remains on the worker. */
export async function loginHosted(options: {
  universityId?: string; url?: URL; store?: RelayCredentialStore;
  openBrowser?: (url: URL) => Promise<void>;
} = {}): Promise<void> {
  const url = options.url ?? relayUrl();
  if (options.universityId) loginUniversity(options.universityId);
  await loginToRelay({ ...options, url, scope: 'campus.read', finalize: async (tokens, signal) => {
    if (!tokens.scope?.split(/\s+/).includes('campus.read')) throw new Error('El relay no habilitó el acceso de esta cuenta.');
    if (options.universityId) {
      const response = await relayFetch(url, signal, 20_000)(new URL('/v1/account', url), {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      if (!response.ok) throw new Error('El relay no pudo verificar la universidad de la cuenta Campus.');
      const { account } = await response.json();
      if (account?.universityId !== options.universityId) throw new Error('La universidad de la cuenta Campus no coincide con --university.');
    }
    return tokens;
  } });
}
