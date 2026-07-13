# blackboard-cli

> Accede a **UPC Aula Virtual** desde la terminal — sin abrir el navegador.

CLI no oficial para estudiantes de la UPC. Consulta cursos, descarga materiales, revisa tareas y entregas directamente desde la línea de comandos. También expone un **servidor MCP** para que Claude lo use como herramientas nativas.

```bash
npx blackboard-upc login
```

---

## Instalación

```bash
# Opción 1 — usar directamente con npx (sin instalar)
npx blackboard-upc login

# Opción 2 — instalar globalmente
npm install -g blackboard-upc
blackboard login

# Opción 3 — clonar el repo
git clone https://github.com/alejooroncoy/blackboard-cli
cd blackboard-cli
npm install               # instala Chromium automáticamente (postinstall)
node run.js login
```

> Si `npm install` corrió con `--ignore-scripts` (o el navegador igual falta al hacer login), el CLI lo instala solo la primera vez que hace falta — no necesitas correr `playwright install` a mano.

---

## Primeros pasos

### 1. Login

```bash
blackboard login
```

Se abre una ventana del navegador con el login de Microsoft UPC. Inicia sesión con tu cuenta `u20XXXXXXX@upc.edu.pe` (incluye MFA si lo tienes). La ventana se cierra sola y la sesión queda guardada 8 horas.

> **Importante:** durante el login, Microsoft mostrará el mensaje **"Stay signed in?"** con un checkbox **"Don't show this again"**. Activa ese checkbox y haz clic en **Yes** — esto le indica a Microsoft que mantenga la sesión activa y es necesario para que el CLI pueda guardar las cookies correctamente.

```
  ██████  ██       █████   ██████ ██   ██ ██████   ██████   █████  ██████  ██████
  ...
  CLI no oficial para UPC Aula Virtual · Blackboard Learn

  ✓ Sesión guardada — expira en 8 horas
    Usuario: Juan Pérez García

  ¿Qué puedo hacer ahora?

  blackboard courses list                ver tus cursos del ciclo
  blackboard assignments list <id>       ver tareas pendientes y notas
  blackboard courses contents <id>       explorar materiales
  blackboard download-folder <id> <fid>  descargar toda una carpeta
```

### 2. Ver cursos y tareas

```bash
blackboard courses list

  _100001_1  Cálculo Diferencial e Integral [Ultra]
  _100002_1  Programación Orientada a Objetos [Ultra]
  _100003_1  Bases de Datos [Ultra]
  _100004_1  Algoritmos y Estructuras de Datos [Ultra]

blackboard assignments list _100004_1

  _200001_1  Tarea 1  [manual]
    Nota: sin entregar · Máx: 5 pts · Entrega: 15/04/2026 (vence en 17d)
```

---

## Comandos

### Sesión
```bash
blackboard login              # autenticación Microsoft SSO
blackboard logout             # borrar sesión
blackboard whoami             # usuario activo y tiempo restante
blackboard status             # versión del servidor Blackboard
```

### Cursos
```bash
blackboard courses list
blackboard courses get <courseId>
blackboard courses contents <courseId>
blackboard courses contents <courseId> --parent <folderId>   # navegar subcarpetas
blackboard courses contents <courseId> --type file|folder|assignment
blackboard courses announcements <courseId>
blackboard courses grades <courseId>
```

### Tareas
```bash
blackboard assignments list <courseId>              # tareas con nota y fecha
blackboard assignments list <courseId> --pending    # solo pendientes
blackboard assignments attempts <courseId> <id>     # historial de entregas
blackboard assignments submit <courseId> <id> -f tarea.pdf
blackboard assignments submit <courseId> <id> -t "Mi respuesta" -c "Comentario"
blackboard assignments submit <courseId> <id> -f borrador.pdf --draft
```

### Descargas
```bash
blackboard download <courseId> <contentId>                    # archivo individual
blackboard download-folder <courseId> <folderId> -o ./dir/    # carpeta completa
blackboard download-folder <courseId> <folderId> --filter "parcial"
```

### API raw / scripting
```bash
blackboard api GET /learn/api/public/v1/users/me
blackboard api GET /learn/api/public/v1/courses -q "limit=10"
blackboard endpoints          # catálogo de todos los endpoints conocidos
blackboard endpoints --json   # para pipelines
```

Todos los comandos aceptan `--json`. Los spinners van a `stderr`, por lo que `--json 2>/dev/null` es JSON limpio.

---

## Uso con Claude (MCP)

`blackboard-cli` incluye un servidor MCP que Claude puede usar como herramientas nativas.

### Claude Code

Añade a `.mcp.json` en tu proyecto:

```json
{
  "mcpServers": {
    "blackboard": {
      "command": "npx",
      "args": ["blackboard-upc", "mcp"]
    }
  }
}
```

### Claude Desktop

Edita `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "blackboard": {
      "command": "npx",
      "args": ["blackboard-upc", "mcp"]
    }
  }
}
```

> **Nota:** Si usas instalación global, reemplaza `npx blackboard-upc` por la ruta absoluta del binario (`which blackboard`).

### Herramientas MCP disponibles

| Herramienta | Descripción |
|---|---|
| `whoami` | Info del estudiante autenticado |
| `list_courses` | Cursos inscritos |
| `get_course` | Detalle de un curso |
| `list_contents` | Árbol de materiales |
| `list_announcements` | Anuncios del curso |
| `list_assignments` | Tareas con fechas y notas |
| `list_attempts` | Historial de entregas |
| `get_grades` | Notas del ciclo |
| `list_attachments` | Archivos de un contenido |
| `download_attachment` | Descargar archivo (base64) |
| `submit_attempt` | Entregar tarea (pide confirmación) |
| `raw_api` | Cualquier endpoint de Blackboard |

Con Claude puedes hacer cosas como:

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
- **MCP SDK** — servidor para Claude
- **Chalk** + **Ora** — output en la terminal

---

## Notas

- Probado con Blackboard Learn `v4000.10.0` (UPC, 2026).
- CLI **no oficial** — sin afiliación con UPC ni Blackboard Inc.
- Úsalo solo con tu propia cuenta. Respeta los TOS de UPC.
- Las cookies se guardan localmente. No se envían a servidores externos.

---

## Licencia

MIT
