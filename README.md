# campus-cli

[![npm version](https://img.shields.io/npm/v/campus-cli.svg)](https://www.npmjs.com/package/campus-cli)
[![npm downloads](https://img.shields.io/npm/dw/campus-cli.svg)](https://www.npmjs.com/package/campus-cli)

> Usa tu campus universitario desde la terminal o desde tu asistente de IA.

`campus-cli` es un CLI/MCP no oficial para estudiantes. Permite consultar cursos, tareas, notas, anuncios y materiales sin abrir el navegador. Hoy funciona con **Blackboard Learn** en UPC; Canvas y Moodle están en el roadmap.

```bash
npx campus-cli login
campus courses list
campus assignments list --pending
```

## Qué puedes hacer

- Ver tus cursos del ciclo.
- Revisar tareas pendientes, fechas de entrega y notas.
- Descargar archivos y carpetas completas de Blackboard.
- Consultar anuncios, contenidos y calificaciones.
- Usarlo desde Claude, Cursor, Copilot, Codex u otro cliente compatible con MCP.
- Automatizar consultas con `--json` o con llamadas directas a la API de Blackboard.

## Estado actual

| Universidad | LMS | Estado |
|---|---|---|
| UPC | Blackboard Learn | Implementado |
| UTP, USIL, Norbert Wiener | Canvas | Roadmap |
| UCSM, UNAP | Moodle | Roadmap |

Si estudias en una universidad con Canvas o Moodle y quieres ayudar a probar o implementar soporte, abre un issue para coordinar.

## Requisitos

- Node.js 18 o superior.
- Una cuenta activa de UPC con acceso a Aula Virtual.
- Acceso al flujo normal de Microsoft SSO, incluyendo MFA si tu cuenta lo pide.
- macOS, Linux o Windows con un entorno donde Playwright pueda abrir Chromium.

## Instalación rápida

### Usar sin instalar

```bash
npx campus-cli login
```

### Instalar globalmente

```bash
npm install -g campus-cli
campus login
```

### Clonar el repo

```bash
git clone https://github.com/alejooroncoy/campus-cli
cd campus-cli
npm install
node run.js login
```

`campus-cli` usa Playwright para abrir Chromium durante el login. `npm install` intenta instalar Chromium automáticamente; si el navegador falta, el CLI lo instala la primera vez que lo necesite.

## Primer uso

```bash
campus login
```

Se abrirá una ventana con el login de Microsoft UPC. Inicia sesión con tu cuenta universitaria y completa MFA si aplica.

Durante el login, Microsoft puede mostrar **"Stay signed in?"** con el checkbox **"Don't show this again"**. Marca ese checkbox y haz clic en **Yes** para que la sesión pueda mantenerse correctamente.

Después del login:

```bash
campus courses list
```

Ejemplo:

```text
_100001_1  Cálculo Diferencial e Integral [Ultra]
_100002_1  Programación Orientada a Objetos [Ultra]
_100003_1  Bases de Datos [Ultra]
_100004_1  Algoritmos y Estructuras de Datos [Ultra]
```

Luego puedes revisar tareas de un curso:

```bash
campus assignments list _100004_1 --pending
```

Ejemplo:

```text
_200001_1  Tarea 1  [manual]
  Nota: sin entregar · Máx: 5 pts · Entrega: 15/04/2026
```

## Comandos principales

### Sesión

```bash
campus login              # iniciar sesión con Microsoft SSO
campus logout             # borrar sesión local
campus whoami             # usuario activo y tiempo restante
campus status             # sesión + versión del servidor Blackboard
```

### Cursos

```bash
campus courses list
campus courses get <courseId>
campus courses contents <courseId>
campus courses contents <courseId> --parent <folderId>
campus courses contents <courseId> --type file|folder|assignment
campus courses announcements <courseId>
campus courses grades <courseId>
```

### Tareas

```bash
campus assignments list <courseId>
campus assignments list
campus assignments list --pending
campus assignments list <courseId> --pending
campus assignments attempts <courseId> <assignmentId>
campus assignments submit <courseId> <assignmentId> -f tarea.pdf
campus assignments submit <courseId> <assignmentId> -t "Mi respuesta" -c "Comentario"
campus assignments submit <courseId> <assignmentId> -f borrador.pdf --draft
```

### Descargas

```bash
campus download <courseId> <contentId>
campus download-folder <courseId> <folderId> -o ./materiales/
campus download-folder <courseId> <folderId> --filter "parcial"
```

### API y scripting

```bash
campus api GET /learn/api/public/v1/users/me
campus api GET /learn/api/public/v1/courses -q "limit=10"
campus endpoints
campus endpoints --json
```

Todos los comandos aceptan `--json`. Los spinners van a `stderr`, así que puedes usar `--json 2>/dev/null` para obtener JSON limpio en scripts.

## CLI o MCP

| Modo | Úsalo cuando quieres | Ejemplo |
|---|---|---|
| CLI | Ejecutar comandos directos desde la terminal | `campus assignments list --pending` |
| MCP | Darle acceso a tu campus a un asistente de IA | "Qué tareas tengo pendientes esta semana?" |
| API raw | Automatizar consultas o explorar endpoints | `campus api GET /learn/api/public/v1/users/me` |

Puedes usar ambos modos con la misma sesión. Primero ejecuta `campus login`; luego usa el CLI manualmente o conecta el servidor MCP a tu cliente de IA.

## Uso con IA mediante MCP

`campus-cli` incluye un servidor MCP estándar. Corre por `stdio` con:

```bash
npx campus-cli mcp
```

Eso permite conectar tu campus a clientes como Claude, Cursor, GitHub Copilot, OpenAI Codex CLI, Windsurf y otros clientes compatibles con Model Context Protocol.

### Claude Code

Agrega esto a `.mcp.json`:

```json
{
  "mcpServers": {
    "campus": {
      "command": "npx",
      "args": ["campus-cli", "mcp"]
    }
  }
}
```

### Claude Desktop

Edita `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "campus": {
      "command": "npx",
      "args": ["campus-cli", "mcp"]
    }
  }
}
```

### Cursor

Usa `Settings -> MCP -> Add new MCP server`, o edita `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "campus": {
      "command": "npx",
      "args": ["campus-cli", "mcp"]
    }
  }
}
```

### GitHub Copilot en VS Code

Crea `.vscode/mcp.json`:

```json
{
  "servers": {
    "campus": {
      "type": "stdio",
      "command": "npx",
      "args": ["campus-cli", "mcp"]
    }
  }
}
```

### OpenAI Codex CLI

Agrega esto a `~/.codex/config.toml`:

```toml
[mcp_servers.campus]
command = "npx"
args = ["campus-cli", "mcp"]
```

### Windsurf

Edita `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "campus": {
      "command": "npx",
      "args": ["campus-cli", "mcp"]
    }
  }
}
```

Si instalaste el paquete globalmente con `npm install -g campus-cli`, puedes reemplazar `npx campus-cli` por la ruta absoluta de `campus`.

### Configuración mínima

Todos los clientes MCP terminan usando la misma idea:

```json
{
  "command": "npx",
  "args": ["campus-cli", "mcp"]
}
```

El formato exacto cambia por cliente, pero el comando y los argumentos son los mismos.

## Herramientas MCP

Todas las herramientas actuales usan el prefijo `blackboard_` para evitar colisiones cuando se agreguen `canvas_*` o `moodle_*`.

| Herramienta | Descripción |
|---|---|
| `blackboard_whoami` | Usuario autenticado |
| `blackboard_list_courses` | Cursos inscritos |
| `blackboard_get_course` | Detalle de un curso |
| `blackboard_list_contents` | Materiales y carpetas |
| `blackboard_list_announcements` | Anuncios del curso |
| `blackboard_list_assignments` | Tareas con fechas y notas |
| `blackboard_list_attempts` | Historial de entregas |
| `blackboard_get_grades` | Reporte de notas |
| `blackboard_list_attachments` | Archivos adjuntos |
| `blackboard_download_attachment` | Descargar archivo |
| `blackboard_upload_attempt_file` | Subir un archivo local (imagen, PDF, etc.) y obtener un fileUploadId |
| `blackboard_save_attempt_draft` | Guardar texto/archivos en un intento SIN enviarlo (queda abierto para seguir editando) |
| `blackboard_submit_attempt` | Entregar tarea; confirma antes de enviar |
| `blackboard_get_assignment_feedback` | Comentarios y feedback del profesor |
| `blackboard_raw_api` | Cualquier endpoint de Blackboard |

Ejemplos de uso con un asistente:

```text
Qué tareas tengo pendientes esta semana?
Descarga todos los PDFs del curso de Finanzas.
Cuál es mi nota actual en Arquitectura de Software?
Busca los materiales sobre el parcial.
```

Ejemplo de conversación:

```text
Usuario: Qué tareas tengo pendientes esta semana?
IA: Tienes 2 pendientes:
- Tarea 1 de Algoritmos, vence el 15/04.
- Lectura de Bases de Datos, vence el 18/04.
```

## Seguridad y privacidad

- No necesitas escribir tu contraseña en la terminal.
- No hay servidor intermedio de `campus-cli`.
- Puedes cerrar sesión y borrar las cookies locales con `campus logout`.
- Es un proyecto no oficial; no está afiliado a UPC, Blackboard, Canvas ni Moodle.
- Tus credenciales se ingresan directamente en la ventana de Microsoft, no en el CLI.
- Las cookies se guardan localmente en tu máquina.
- La sesión local se guarda en `~/.blackboard-cli/session.json` con permisos restrictivos.
- No se envían cookies, credenciales ni datos del campus a servidores externos del proyecto.
- Úsalo solo con tu propia cuenta y respeta las reglas de tu universidad.

UPC usa SAML SSO con Microsoft Azure AD. El CLI abre Chromium con Playwright, espera a que completes el login, captura las cookies de Blackboard al volver a `/ultra` y las reutiliza para llamar la REST API.

## Problemas comunes

### `Not authenticated`

Tu sesión local expiró o no existe. Ejecuta:

```bash
campus login
```

### Microsoft pide login cada vez

Cuando aparezca **"Stay signed in?"**, marca **"Don't show this again"** y responde **Yes**. Si ya habías iniciado sesión antes, prueba borrar la sesión local:

```bash
campus logout
campus login
```

### Chromium o Playwright no abre

Normalmente el CLI instala Chromium automáticamente. Si instalaste dependencias con scripts desactivados, vuelve a instalar:

```bash
npm install
```

Luego intenta de nuevo:

```bash
campus login
```

### Un curso o archivo no aparece

Primero confirma que aparece en Aula Virtual desde el navegador. Si aparece en Blackboard pero no en el CLI, abre un issue con:

- Comando ejecutado.
- Si usaste `--json`.
- Tipo de contenido que falta: curso, carpeta, archivo, tarea o nota.
- Mensaje de error, si lo hubo.

No publiques cookies, tokens, capturas con datos personales ni archivos privados del curso.

## Desarrollo

```bash
npm install
npm run build
node run.js --help
```

Stack principal:

- TypeScript
- Playwright
- Axios
- Commander.js
- MCP SDK
- Chalk y Ora

La arquitectura separa cada LMS en `src/providers/<lms>/`. Blackboard vive en `src/providers/blackboard/`; futuros providers deberían seguir el mismo patrón.

## Roadmap

- Soporte para Canvas.
- Soporte para Moodle.
- Notificaciones de entregas próximas.
- Descarga de grabaciones o videos, si el LMS lo permite.
- Soporte para múltiples cuentas o ciclos.
- Más guías por cliente MCP.

Si tu universidad usa Canvas o Moodle, abre un issue con el nombre de la universidad, el LMS y qué flujo quieres probar primero: cursos, tareas, notas o materiales.

## Contribuir

Las contribuciones más útiles ahora son:

- Probar el CLI en más cursos de UPC y reportar errores con el comando usado.
- Confirmar versiones de Blackboard donde funciona o falla.
- Ayudar con soporte para Canvas o Moodle si tienes una cuenta de prueba.
- Mejorar ejemplos, screenshots, docs de instalación o configuraciones MCP.

Antes de trabajar en un provider nuevo, abre un issue para coordinar el alcance.

## Licencia

ISC
