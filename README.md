# campus-cli

[![npm version](https://img.shields.io/npm/v/campus-cli.svg)](https://www.npmjs.com/package/campus-cli)
[![npm downloads](https://img.shields.io/npm/dw/campus-cli.svg)](https://www.npmjs.com/package/campus-cli)

> Conecta Blackboard UPC con ChatGPT y Claude (vía MCP), o úsalo directo desde la terminal.

`campus-cli` (también conocido como **Campus** o **Campus CLI**, [campuscli.com](https://campuscli.com)) es un CLI y servidor MCP no oficial para estudiantes de UPC. Le da a asistentes de IA como ChatGPT y Claude acceso directo a tu **Blackboard Learn**: cursos, tareas, notas, anuncios, mensajes y materiales, sin abrir el navegador. Canvas y Moodle están en el roadmap.

No confundir con: el paquete `campus-cli` de PyPI (Python, gestión de notebooks de Jupyter, proyecto no relacionado) ni con otras plataformas de "IA para programadores" o "resolver tareas con IA" que usan nombres parecidos — este proyecto es específicamente la integración de Blackboard con asistentes de IA vía MCP.

```bash
npx campus-cli@2.0.0 account login
campus courses list
campus assignments list --pending
```

**English summary** — `campus-cli` is an unofficial **Blackboard MCP server** and CLI for students. It exposes Blackboard Learn (currently UPC Aula Virtual, Peru) to any Model Context Protocol client — Claude Desktop, Claude Code, Cursor, GitHub Copilot, Codex CLI, Windsurf — so an AI assistant can read your courses, assignments, due dates, grades, instructor feedback, announcements and course materials, and download files, without you copying anything by hand. Unlike institutional Blackboard integrations, it needs **no OAuth developer key from your university**: it uses the student's own SSO session, locally. Run it with `npx campus-cli@2.0.0 mcp` (stdio). Canvas and Moodle are on the roadmap.

## Qué puedes hacer

- Ver tus cursos del ciclo.
- Consultar tu horario semanal, con horas y aulas de tus cursos matriculados.
- Revisar tareas pendientes, fechas de entrega y notas.
- Descargar archivos y carpetas completas de Blackboard.
- Consultar anuncios, mensajes, contenidos y calificaciones.
- Obtener guías y plantillas de citas, referencias y formato APA 7 en español.
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

- Node.js 22 o superior.
- Una cuenta activa de UPC con acceso a Aula Virtual.
- Acceso al flujo normal de Microsoft SSO, incluyendo MFA si tu cuenta lo pide.
- macOS, Linux o Windows con un entorno donde Playwright pueda abrir Chromium.

## Instalación rápida

### Usar sin instalar

```bash
npx campus-cli@2.0.0 account login
```

### Instalar globalmente

```bash
npm install -g campus-cli@2.0.0
campus account login
```

### Clonar el repo

```bash
git clone https://github.com/alejooroncoy/campus-cli
cd campus-cli
npm install
node run.js account login
```

`campus-cli` usa Playwright para abrir Chromium durante el login. `npm install` intenta instalar Chromium automáticamente; si el navegador falta, el CLI lo instala la primera vez que lo necesite.

## Primer uso

```bash
campus account login
```

Se abre el navegador para iniciar sesión con tu cuenta Campus (Google) — es la identidad compartida entre las apps del ecosistema Campus, separada de tu sesión de Blackboard. Al terminar, encadena automáticamente el login de Microsoft UPC (Blackboard SSO, 100% local, sin pasar por ningún servidor propio). Si más adelante corres `campus login` por separado, te pedirá primero `campus account login` en caso de no tener una cuenta Campus activa.

Inicia sesión con tu cuenta universitaria y completa MFA si aplica.

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

### Cuenta Campus

```bash
campus account login      # iniciar sesión con Google (encadena el login de Blackboard)
campus account whoami     # cuenta Campus activa
campus account logout     # cerrar sesión de la cuenta Campus en este equipo
```

### Sesión (Blackboard)

```bash
campus login              # iniciar sesión con Microsoft SSO (pide cuenta Campus primero)
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
campus messages
campus messages --course <courseId>
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
npx campus-cli@2.0.0 mcp
```

Eso permite conectar tu campus a clientes como Claude, Cursor, GitHub Copilot, OpenAI Codex CLI, Windsurf y otros clientes compatibles con Model Context Protocol.

Además de las herramientas de Blackboard, el MCP incluye `banner_get_weekly_schedule`: consulta tu matrícula en Banner UPC y organiza las clases de lunes a domingo. Por defecto usa el período activo; también puedes pasar un código de período si quieres revisar un ciclo anterior. `campus_get_weekly_schedule` sigue disponible como alias deprecado para integraciones existentes.

### Claude Code

Agrega esto a `.mcp.json`:

```json
{
  "mcpServers": {
    "campus": {
      "command": "npx",
      "args": ["campus-cli@2.0.0", "mcp"]
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
      "args": ["campus-cli@2.0.0", "mcp"]
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
      "args": ["campus-cli@2.0.0", "mcp"]
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
      "args": ["campus-cli@2.0.0", "mcp"]
    }
  }
}
```

### OpenAI Codex CLI

Agrega esto a `~/.codex/config.toml`:

```toml
[mcp_servers.campus]
command = "npx"
args = ["campus-cli@2.0.0", "mcp"]
```

### Windsurf

Edita `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "campus": {
      "command": "npx",
      "args": ["campus-cli@2.0.0", "mcp"]
    }
  }
}
```

Si instalaste el paquete globalmente con `npm install -g campus-cli@2.0.0`, puedes reemplazar `npx campus-cli@2.0.0` por la ruta absoluta de `campus`.

### Configuración mínima

Todos los clientes MCP terminan usando la misma idea:

```json
{
  "command": "npx",
  "args": ["campus-cli@2.0.0", "mcp"]
}
```

El formato exacto cambia por cliente, pero el comando y los argumentos son los mismos.

### Guías paso a paso

Cada cliente tiene su guía con la ruta exacta del archivo, cómo verificar la conexión y qué hacer si falla:

- [Claude Desktop](https://campuscli.com/blackboard-mcp/claude-desktop/)
- [Claude Code](https://campuscli.com/blackboard-mcp/claude-code/)
- [Cursor](https://campuscli.com/blackboard-mcp/cursor/)
- [GitHub Copilot en VS Code](https://campuscli.com/blackboard-mcp/github-copilot/)
- [OpenAI Codex CLI](https://campuscli.com/blackboard-mcp/codex/)
- [Windsurf](https://campuscli.com/blackboard-mcp/windsurf/)

## Herramientas MCP

Las herramientas de Aula Virtual usan el prefijo `blackboard_`; `banner_get_weekly_schedule` consulta la matrícula en Banner UPC. Las de UPC Class usan `uclass_`: entregan fuentes estructuradas para que la IA conectada (Codex, Claude, ChatGPT, etc.) las interprete, sin enviar la grabación a una IA propia del CLI.

| Herramienta | Descripción |
|---|---|
| `blackboard_whoami` | Usuario autenticado |
| `blackboard_list_courses` | Cursos inscritos |
| `blackboard_get_course` | Detalle de un curso |
| `blackboard_list_contents` | Materiales y carpetas |
| `blackboard_list_announcements` | Anuncios del curso |
| `blackboard_list_messages` | Mensajes de la bandeja de entrada de Blackboard |
| `blackboard_list_assignments` | Tareas con fechas y notas |
| `blackboard_list_attempts` | Historial de entregas |
| `blackboard_get_grades` | Reporte de notas |
| `blackboard_list_attachments` | Archivos adjuntos |
| `blackboard_download_attachment` | Descargar archivo dentro de `~/Downloads/campus-cli` |
| `blackboard_upload_attempt_file` | Subir un archivo local; el cliente MCP pide confirmación directa |
| `blackboard_save_attempt_draft` | Guardar texto/archivos en un intento SIN enviarlo (queda abierto para seguir editando) |
| `blackboard_submit_attempt` | Entregar tarea; el cliente MCP pide confirmación directa |
| `blackboard_get_assignment_feedback` | Comentarios y feedback del profesor |
| `blackboard_system_version` | Versión del servidor Blackboard |
| `blackboard_list_people` | Docentes y compañeros del curso; resuelve un id interno a un nombre |
| `blackboard_download_file_url` | Descargar un archivo desde una URL bbcswebdav |
| `blackboard_download_feedback_file` | [EXPERIMENTAL] Descargar un archivo de feedback adjunto a una nota |
| `blackboard_raw_api` | API pública de Blackboard; los métodos que modifican datos piden confirmación directa |
| `banner_get_weekly_schedule` | Horario semanal UPC de la matrícula activa (horas, aulas, secciones y cursos sin clase presencial) |
| `campus_get_weekly_schedule` | Alias deprecado de `banner_get_weekly_schedule`; se mantiene temporalmente por compatibilidad |
| `uclass_list_recordings` | Grabaciones publicadas de UPC Class para un curso Blackboard |
| `uclass_search_transcript` | Fragmentos con contexto y marcas de tiempo de una transcripción de Class |
| `uclass_read_transcript` | Transcripción estructurada completa de una grabación de Class |

Las descargas MCP nunca escriben fuera de `~/Downloads/campus-cli`, no sobrescriben archivos y aplican límites de 100 MB por archivo y 500 MB para la raíz completa. Puedes elegir otra raíz al iniciar el servidor con `CAMPUS_DOWNLOAD_DIR=/ruta/segura`; el argumento `outputDir` de las tools solo crea subdirectorios relativos dentro de ella. Las subidas, entregas finales y llamadas raw que modifican datos requieren que el cliente soporte MCP elicitation; si no la soporta, la operación falla sin ejecutarse.

Las transcripciones de Class se consultan por HTTP desde la sesión SSO existente, no se descarga el video ni el audio. Durante la sesión MCP se reutilizan la lista de grabaciones y la transcripción ya leída; al cerrar el proceso esa caché en memoria desaparece.

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
- No se envían cookies, credenciales ni datos académicos a servidores externos; la analítica opcional de PostHog solo recibe eventos de uso.
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

## Analítica de uso con PostHog

El cliente registra en PostHog el inicio de la CLI, los logins exitosos y la apertura del dashboard. No se envían cookies, contraseñas, cursos, tareas ni calificaciones.

Como identificador estable se usa el **ID de tu cuenta Campus**, la que creas con `campus account login`. Si no tienes cuenta Campus, se usa un UUID aleatorio generado en tu máquina que no identifica a nadie. En ningún caso se envía tu identificador de Blackboard: es una credencial de la universidad y no sale de tu equipo.

Esto es seudónimo, no anónimo: quien tenga acceso a nuestro PostHog puede distinguir a un usuario de otro y, cruzando con nuestra base de cuentas, saber de quién se trata. Lo decimos así de claro a propósito.

Solo viajan las propiedades de esta lista blanca: `app`, `attempts_count`, `command`, `duration_ms`, `error_type`, `has_comments`, `has_file`, `has_text`, `method`, `mode`, `parent_command`, `status_code`, `success`, `tool` y `version`. Cualquier otra clave se descarta antes de enviar, así que un evento nuevo no puede filtrar el nombre de un curso por descuido. El código está en [`src/analytics.ts`](src/analytics.ts) y son cuarenta líneas: léelas.

La clave pública del proyecto está configurada por defecto. Para cambiar el proyecto o desactivar la analítica:

```bash
POSTHOG_API_KEY=phc_... POSTHOG_HOST=https://us.i.posthog.com campus status
POSTHOG_DISABLED=1 campus status
```

En PostHog puedes consultar `login_started`, `login_success`, `login_failed`, `session_expired`, `cli_started`, `cli_command_started`, `cli_command_completed`, `cli_error`, `mcp_tool_used`, `mcp_tool_error`, `dashboard_opened`, `dashboard_loaded`, `dashboard_error`, `attempts_viewed`, `assignment_submission_started`, `assignment_file_uploaded`, `assignment_file_upload_error`, `assignment_draft_saved`, `assignment_submitted` y `assignment_submission_error`. Las propiedades `tool`, `command`, `mode`, `success`, `duration_ms`, `error_type` y `status_code` permiten analizar usuarios nuevos, retención, abandono del login, sesiones vencidas, errores, tiempos de respuesta, herramientas y comandos más usados, borradores y entregas finales.

Las contribuciones más útiles ahora son:

- Probar el CLI en más cursos de UPC y reportar errores con el comando usado.
- Confirmar versiones de Blackboard donde funciona o falla.
- Ayudar con soporte para Canvas o Moodle si tienes una cuenta de prueba.
- Mejorar ejemplos, screenshots, docs de instalación o configuraciones MCP.

Antes de trabajar en un provider nuevo, abre un issue para coordinar el alcance.

## Licencia

ISC
