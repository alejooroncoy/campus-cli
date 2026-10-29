import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { isJSONRPCRequest, isJSONRPCResultResponse, type RequestId } from '@modelcontextprotocol/sdk/types.js';
import { relayTransport } from '../relay/client.js';
import { keepSessionRenewed } from '../relay/session-renewal.js';

/** Forward the protocol intact, including capabilities, elicitation and resources.
 * No local provider is registered when the relay denies access or is unavailable.
 */
export async function bridgeRelay(
  local: Transport,
  remote: Transport,
  report: (error: Error) => void = console.error,
  /** Se ejecuta una sola vez al cerrar el puente, sea por señal o porque cualquiera de los transportes se cerró. */
  onClose: () => Promise<void> | void = () => {},
) {
  let closed = false;
  let initializeId: RequestId | undefined;
  const close = async () => {
    if (closed) return;
    closed = true;
    await Promise.allSettled([local.close(), remote.close(), Promise.resolve().then(onClose)]);
  };
  local.onmessage = message => {
    if (isJSONRPCRequest(message) && message.method === 'initialize') initializeId = message.id;
    void remote.send(message).catch(async error => {
      report(error instanceof Error ? error : new Error('No se pudo contactar al relay de Campus.'));
      if (isJSONRPCRequest(message)) {
        await local.send({ jsonrpc: '2.0', id: message.id, error: { code: -32000,
          message: 'El relay de Campus rechazó la solicitud o no está disponible. Comprueba tu sesión con campus login y el acceso de tu cuenta.' } }).catch(() => close());
      }
    });
  };
  remote.onmessage = message => {
    if (isJSONRPCResultResponse(message) && message.id === initializeId && typeof message.result.protocolVersion === 'string') {
      remote.setProtocolVersion?.(message.result.protocolVersion);
    }
    void local.send(message).catch(() => close());
  };
  local.onerror = remote.onerror = report;
  local.onclose = remote.onclose = () => { void close(); };
  try {
    await remote.start();
    await local.start();
  } catch (error) {
    await close();
    throw error;
  }
  return close;
}

export async function startMcpServer(): Promise<void> {
  let stopRenewal: (() => Promise<void>) | undefined;
  let bridgeClosed = false;
  // La renovación se cancela con el cierre normal del puente (el cliente MCP se desconecta o el relay corta), no solo con señales.
  const close = await bridgeRelay(new StdioServerTransport(), relayTransport(), console.error, () => { bridgeClosed = true; return stopRenewal?.(); });
  if (!bridgeClosed) stopRenewal = keepSessionRenewed();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void close().finally(() => process.exit(0)); });
}
