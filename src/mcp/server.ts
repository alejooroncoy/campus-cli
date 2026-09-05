import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerBlackboardTools } from '../providers/blackboard/mcp-tools.js';
import { registerBannerTools } from '../providers/banner/mcp-tools.js';
import { registerUclassTools } from '../providers/uclass/mcp-tools.js';
import { registerAcademicTools } from '../providers/academic/apa7-mcp-tools.js';
import { track } from '../analytics.js';

// La versión que anunciamos en el handshake sale del package.json. Estaba
// escrita a mano y se quedó en 1.0.0, así que cada cliente y cada directorio
// que la leía veía una versión que no existe. Desde dist/mcp/, '../..' es la
// raíz del paquete, que sí incluye package.json en lo publicado.
const { version: VERSION } = require('../../package.json') as { version: string };

const INSTRUCTIONS = `
campus-cli conecta el campus universitario del estudiante con su agente de IA.

Hoy solo Blackboard Learn (Aula Virtual) está implementado — todas sus tools
llevan el prefijo blackboard_*. Antes de usar cualquiera, verifica sesión con
blackboard_whoami; si falla, pide al usuario que corra \`campus login\` en su
terminal (abre un navegador para el SSO de Microsoft).

Las herramientas uclass_* leen las transcripciones nativas de grabaciones UPC
Class publicadas para un curso Blackboard. Primero usa uclass_search_transcript:
devuelve evidencia con contexto y [m:ss]. Nunca conviertas candidatos,
propuestas o resultados parciales en decisiones sin verificar el tramo completo.

Flujo típico: blackboard_list_courses → blackboard_list_assignments /
blackboard_get_grades → blackboard_list_contents para materiales.

banner_get_weekly_schedule consulta la matrícula UPC en Banner y devuelve el
horario semanal de lunes a domingo. Úsala para responder qué clases tiene el
estudiante, a qué hora y en qué aula; acepta un código de período opcional.
campus_get_weekly_schedule continúa disponible como alias deprecado.

campus_apa7_guidance ofrece reglas y modelos de APA 7 en español sin necesitar
inicio de sesión. Úsala cuando se pida una cita, referencia, formato, revisión,
tabla/figura o requisitos APA de un curso. Para requisitos de una entrega, usa
después las herramientas Blackboard para leer la rúbrica o plantilla: la guía
general nunca reemplaza al docente. No inventes metadatos bibliográficos.

Para entregas: blackboard_upload_attempt_file sube cada archivo/imagen y
devuelve un fileUploadId; blackboard_save_attempt_draft guarda texto y/o
esos fileUploadIds sin enviar (el intento queda abierto para seguir
editando, no requiere confirmación); blackboard_submit_attempt finaliza
y envía — siempre confirma con el usuario qué se va a enviar antes de
llamarla. El servidor pide una segunda confirmación directa vía elicitation.

Las descargas quedan dentro de ~/Downloads/campus-cli (o la raíz configurada
por el usuario) y nunca sobrescriben archivos existentes.

blackboard_raw_api cubre endpoints públicos no expuestos por una tool
dedicada; cualquier método que modifique datos exige elicitation.

Futuro: canvas_* y moodle_* para otras universidades (Canvas, Moodle) —
no implementados todavía.
`.trim();

export async function startMcpServer() {
  track('mcp_started');
  const server = new McpServer(
    {
      name: 'campus-cli',
      version: VERSION,
    },
    {
      instructions: INSTRUCTIONS,
    }
  );

  registerBlackboardTools(server);
  registerBannerTools(server);
  registerUclassTools(server);
  registerAcademicTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
