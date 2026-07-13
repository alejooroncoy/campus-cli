import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerBlackboardTools } from '../providers/blackboard/mcp-tools.js';

export async function startMcpServer() {
  const server = new McpServer({
    name: 'blackboard-upc',
    version: '1.0.0',
  });

  registerBlackboardTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
