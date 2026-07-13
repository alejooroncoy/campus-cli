import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerBlackboardTools } from '../providers/blackboard/mcp-tools.js';

const INSTRUCTIONS = `
campus-cli conecta el campus universitario del estudiante con su agente de IA.

Hoy solo Blackboard Learn (Aula Virtual) está implementado — todas sus tools
llevan el prefijo blackboard_*. Antes de usar cualquiera, verifica sesión con
blackboard_whoami; si falla, pide al usuario que corra \`campus login\` en su
terminal (abre un navegador para el SSO de Microsoft).

Flujo típico: blackboard_list_courses → blackboard_list_assignments /
blackboard_get_grades → blackboard_list_contents para materiales.
blackboard_raw_api cubre cualquier endpoint no expuesto por una tool
dedicada. Antes de blackboard_submit_attempt o blackboard_submit_quiz,
siempre confirma con el usuario qué se va a enviar.

Futuro: canvas_* y moodle_* para otras universidades (Canvas, Moodle) —
no implementados todavía.
`.trim();

export async function startMcpServer() {
  const server = new McpServer(
    {
      name: 'campus-cli',
      version: '1.0.0',
    },
    {
      instructions: INSTRUCTIONS,
    }
  );

  registerBlackboardTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
