import { secureServiceUrl } from '../security/urls.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';

export function relayUrl(): URL {
  const url = new URL(secureServiceUrl(process.env.CAMPUS_RELAY_URL ?? 'https://mcp.campuscli.com/mcp', 'CAMPUS_RELAY_URL'));
  if (url.search || url.hash) throw new Error('CAMPUS_RELAY_URL must not contain query parameters or a fragment');
  return url;
}

/** Relay OAuth credentials never follow redirects or metadata to another origin. */
export function relayFetch(server: URL, signal?: AbortSignal, timeoutMs?: number): FetchLike {
  return (input, init) => {
    const target = new URL(input);
    if (target.origin !== server.origin) throw new Error('El endpoint OAuth/MCP debe pertenecer al relay configurado.');
    // OAuth exchanges are bounded; MCP streams may remain open for long tools.
    const timeout = timeoutMs ?? (target.pathname === server.pathname ? undefined : 20_000);
    const signals = [timeout === undefined ? undefined : AbortSignal.timeout(timeout), signal, init?.signal].filter((value): value is AbortSignal => value != null);
    return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.any(signals) });
  };
}
