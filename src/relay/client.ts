import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { RelayAuthProvider, RelayCredentialStore, LOGIN_REQUIRED } from './auth.js';
import { relayUrl, relayFetch } from './config.js';
import { renewRelaySession } from './session-renewal.js';

export function relayTransport(): StreamableHTTPClientTransport {
  const url = relayUrl();
  const authProvider = new RelayAuthProvider(new RelayCredentialStore(url));
  if (!authProvider.tokens()) throw new Error(LOGIN_REQUIRED);
  return new StreamableHTTPClientTransport(url, { authProvider, fetch: relayFetch(url) });
}

/** The server alone decides access and billing for every CLI operation. */
export async function withRelayClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const transport = relayTransport();
  const client = new Client({ name: 'campus-cli', version: require('../../package.json').version });
  try {
    await client.connect(transport);
    return await run(client);
  } finally { await client.close(); }
}

export async function callRelayTool(name: string, args: Record<string, unknown> = {}) {
  const renewal = await renewRelaySession();
  if (renewal === 'renewed') console.error('Sesión universitaria renovada.');
  else if (renewal === 'unavailable') console.error('No se pudo renovar la sesión universitaria sola. Si la consulta falla, ejecuta campus login.');
  return withRelayClient(client => client.callTool({ name, arguments: args }, undefined, { timeout: 300_000 }));
}
