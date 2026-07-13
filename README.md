# campus-cli

> Accede al **campus universitario** desde la terminal o desde tu IA — sin abrir el navegador.

CLI/MCP no oficial para estudiantes. Consulta cursos, descarga materiales, revisa tareas y entregas directamente desde la línea de comandos, o dale acceso a tu asistente de IA vía **MCP**. Hoy soporta **Blackboard Learn**; Canvas y Moodle están en el roadmap (ver [Providers](#providers)).

```bash
npx campus-cli login
```

---

## Instalación

```bash
# Opción 1 — usar directamente con npx (sin instalar)
npx campus-cli login

# Opción 2 — instalar globalmente
npm install -g campus-cli
campus login

# Opción 3 — clonar el repo
git clone https://github.com/alejooroncoy/campus-cli
cd campus-cli
npm install               # instala Chromium automáticamente (postinstall)
node run.js login
```

> Si `npm install` corrió con `--ignore-scripts` (o el navegador igual falta al hacer login), el CLI lo instala solo la primera vez que hace falta — no necesitas correr `playwright install` a mano.

---

## Primeros pasos

### 1. Login

```bash
campus login
```

Se abre una ventana del navegador con el login de Microsoft UPC. Inicia sesión con tu cuenta `u20XXXXXXX@upc.edu.pe` (incluye MFA si lo tienes). La ventana se cierra sola y la sesión queda guardada 8 horas.

> **Importante:** durante el login, Microsoft mostrará el mensaje **"Stay signed in?"** con un checkbox **"Don't show this again"**. Activa ese checkbox y haz clic en **Yes** — esto le indica a Microsoft que mantenga la sesión activa y es necesario para que el CLI pueda guardar las cookies correctamente.

```
  campus-cli
  CLI no oficial para tu campus universitario · Blackboard · Canvas · Moodle

  ✓ Sesión guardada — expira en 8 horas
    Usuario: Juan Pérez García

  ¿Qué puedo hacer ahora?

  campus courses list                ver tus cursos del ciclo
  campus assignments list <id>       ver tareas pendientes y notas
  campus courses contents <id>       explorar materiales
  campus download-folder <id> <fid>  descargar toda una carpeta
```

### 2. Ver cursos y tareas

```bash
campus courses list

  _100001_1  Cálculo Diferencial e Integral [Ultra]
  _100002_1  Programación Orientada a Objetos [Ultra]
  _100003_1  Bases de Datos [Ultra]
  _100004_1  Algoritmos y Estructuras de Datos [Ultra]

campus assignments list _100004_1

  _200001_1  Tarea 1  [manual]
    Nota: sin entregar · Máx: 5 pts · Entrega: 15/04/2026 (vence en 17d)
```

---

## Comandos

> Nota: los comandos son de Blackboard (único provider implementado hoy). El bin `campus` es el nombre principal — `blackboard`/`blackboard-upc` siguen funcionando como alias por compatibilidad.

### Sesión
```bash
campus login              # autenticación Microsoft SSO
campus logout             # borrar sesión
campus whoami             # usuario activo y tiempo restante
campus status             # versión del servidor Blackboard
```

### Cursos
```bash
campus courses list
campus courses get <courseId>
campus courses contents <courseId>
campus courses contents <courseId> --parent <folderId>   # navegar subcarpetas
campus courses contents <courseId> --type file|folder|assignment
campus courses announcements <courseId>
campus courses grades <courseId>
```

### Tareas
```bash
campus assignments list <courseId>              # tareas con nota y fecha
campus assignments list <courseId> --pending    # solo pendientes
campus assignments attempts <courseId> <id>     # historial de entregas
campus assignments submit <courseId> <id> -f tarea.pdf
campus assignments submit <courseId> <id> -t "Mi respuesta" -c "Comentario"
campus assignments submit <courseId> <id> -f borrador.pdf --draft
```

### Descargas
```bash
campus download <courseId> <contentId>                    # archivo individual
campus download-folder <courseId> <folderId> -o ./dir/    # carpeta completa
campus download-folder <courseId> <folderId> --filter "parcial"
```

### API raw / scripting
```bash
campus api GET /learn/api/public/v1/users/me
campus api GET /learn/api/public/v1/courses -q "limit=10"
campus endpoints          # catálogo de todos los endpoints conocidos
campus endpoints --json   # para pipelines
```

Todos los comandos aceptan `--json`. Los spinners van a `stderr`, por lo que `--json 2>/dev/null` es JSON limpio.

---

## Uso con IA (MCP)

`campus-cli` incluye un servidor **MCP** (Model Context Protocol) estándar — corre vía stdio con `npx campus-cli mcp`, así que funciona con cualquier cliente que hable MCP, no solo Claude. El servidor expone además un campo `instructions` (parte del handshake `initialize` de MCP) con una guía de uso, para que cualquier agente se oriente solo aunque no lea este README. Configuración probada para los más comunes:

### Claude Code

Añade a `.mcp.json` en tu proyecto:

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

`Settings → MCP → Add new MCP server`, o edita directamente `~/.cursor/mcp.json` (global) o `.cursor/mcp.json` (por proyecto):

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

### GitHub Copilot (VS Code)

Crea `.vscode/mcp.json` en tu proyecto (o usa el comando `MCP: Add Server` en la paleta de comandos):

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

Agrega a `~/.codex/config.toml`:

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

### Otros clientes (Perplexity y similares)

Cualquier cliente con soporte MCP sobre stdio funciona con el mismo patrón: comando `npx`, argumentos `["campus-cli", "mcp"]`. Si tu cliente no aparece aquí, revisa su documentación de "MCP servers" o "Model Context Protocol" — la configuración siempre se reduce a esos dos datos (comando + args).

> **Nota:** Si usas instalación global (`npm install -g campus-cli`), puedes reemplazar `npx campus-cli` por la ruta absoluta del binario (`which campus`) en cualquiera de las configs de arriba.

### Herramientas MCP disponibles

Todas las tools de Blackboard llevan el prefijo `blackboard_` (evita colisiones cuando se agreguen Canvas/Moodle):

| Herramienta | Descripción |
|---|---|
| `blackboard_whoami` | Info del estudiante autenticado |
| `blackboard_list_courses` | Cursos inscritos |
| `blackboard_get_course` | Detalle de un curso |
| `blackboard_list_contents` | Árbol de materiales |
| `blackboard_list_announcements` | Anuncios del curso |
| `blackboard_list_assignments` | Tareas con fechas y notas |
| `blackboard_list_attempts` | Historial de entregas |
| `blackboard_get_grades` | Notas del ciclo |
| `blackboard_list_attachments` | Archivos de un contenido |
| `blackboard_download_attachment` | Descargar archivo (base64) |
| `blackboard_submit_attempt` | Entregar tarea (pide confirmación) |
| `blackboard_get_quiz_questions` | Cargar preguntas de un quiz |
| `blackboard_save_quiz_answer` | Guardar una respuesta sin enviar |
| `blackboard_submit_quiz` | Finalizar y enviar un quiz (pide confirmación) |
| `blackboard_get_assignment_feedback` | Notas + comentarios del profesor |
| `blackboard_raw_api` | Cualquier endpoint de Blackboard |

Con tu asistente de IA (Claude, Cursor, Copilot, Codex...) puedes hacer cosas como:

> *"¿Qué tareas tengo pendientes esta semana?"*
> *"Descárgame todos los exámenes del curso de Finanzas"*
> *"¿Cuál es mi nota actual en Arquitectura de Software?"*

---

## Cómo funciona la autenticación

UPC usa **SAML SSO → Microsoft Azure AD**. El CLI:
1. Abre Chromium (Playwright) en la URL SAML de UPC
2. Te muestra el login de Microsoft — tú ingresas tus credenciales
3. Captura las cookies de sesión automáticamente al redirigir a `/ultra`
4. Guarda todo en `~/.blackboard-cli/session.json` (permisos `600`)

La sesión dura **8 horas**. Después necesitas volver a hacer `login`.

---

## Stack

- **TypeScript** + `tsx` — sin build step
- **Playwright** — maneja el flujo SAML/SSO
- **Axios** — llamadas a la REST API con cookies de sesión
- **Commander.js** — framework CLI
- **MCP SDK** — servidor MCP estándar (Claude, Cursor, Copilot, Codex...)
- **Chalk** + **Ora** — output en la terminal

---

## Providers

`campus-cli` está pensado para crecer más allá de una sola universidad/LMS — la arquitectura interna (`src/providers/<lms>/`) ya separa cada proveedor en su propia carpeta (auth, api, comandos, tools MCP con su propio prefijo).

| Universidad | LMS | Estado |
|---|---|---|
| UPC | Blackboard Learn | ✅ Implementado (`blackboard_*`) |
| UTP, USIL, Norbert Wiener | Canvas | 🗺️ Roadmap — no implementado |
| UCSM, UNAP | Moodle | 🗺️ Roadmap — no implementado |

¿Tienes cuenta en una universidad con Canvas o Moodle y quieres ayudar a implementarlo? Los PRs son bienvenidos — abre un issue para coordinar antes de empezar.

---

## Notas

- Probado con Blackboard Learn `v4000.10.0` (UPC, 2026).
- CLI **no oficial** — sin afiliación con ninguna universidad, Blackboard Inc., Canvas ni Moodle.
- Úsalo solo con tu propia cuenta. Respeta los TOS de tu universidad.
- Las cookies se guardan localmente. No se envían a servidores externos.

---

## Licencia

MIT
