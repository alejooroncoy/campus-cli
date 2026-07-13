# Changelog

All notable changes to `blackboard-upc` will be documented here.

---

## [1.1.0] — 2026-07-13

### Added
- **Auto-instalación de Chromium**: `npm install` ahora corre `playwright install chromium` automáticamente (`postinstall`), y si de todas formas falta el navegador al hacer login, el CLI lo instala solo una vez y reintenta — antes esto fallaba con el error crudo de Playwright ("Executable doesn't exist") y el usuario tenía que arreglarlo a mano.
- Mitigación de fingerprint de automatización en el login (`--disable-blink-features=AutomationControlled` + ocultar `navigator.webdriver`) para reducir falsos positivos de MFA/antifraude de Microsoft durante el SSO.

### Changed
- Restructuración interna: el código pasó a vivir en `src/providers/blackboard/` (auth, api, commands, mcp-tools) sin cambios de comportamiento — puramente organizacional, deja espacio para futuros providers. Los 18 tools MCP mantienen sus nombres exactos.

### Explored and reverted
- Se investigó (y se descartó) dar acceso también al portal Mi UPC (estudiante.upc.edu.pe): a diferencia de Blackboard, su token de sesión (Azure AD/MSAL) queda **cifrado en `localStorage`** — no es un endpoint público, extraerlo requeriría romper esa protección a propósito. Se prefirió no seguir por ese camino; queda documentado por si se retoma con un enfoque de automatización de navegador en vez de extracción de token.

## [1.0.10] — 2026-04-24

### Added
- **TTL real del SSO en `whoami`, `status` y `login`** — ahora se muestran las dos ventanas: la del token de Blackboard (~3h, se auto-renueva) y la del SSO de Microsoft (~90 días, la ventana real hasta que hay que re-loguearse). Ejemplo:
  ```
  SSO Microsoft: 89 días · Blackboard: 173 min
  se auto-renueva hasta que el SSO expire o hagas logout
  ```
- `getSsoExpiry()` helper en `src/auth/login.ts` — lee el expiry de `ESTSAUTHPERSISTENT` (la cookie de Microsoft que controla la persistencia del SSO) desde la sesión guardada, sin llamadas de red
- `formatSessionLifetime()` helper en `src/ui/theme.ts` — centraliza el formato de las dos líneas (resumen + nota) y maneja el caso donde el SSO es session-only

### Changed
- `blackboard login` ya no muestra "expira en 3h" (engañoso, porque se auto-renueva); muestra la misma info que `whoami`/`status`

---

## [1.0.9] — 2026-04-24

### Fixed
- **`whoami` y `status` mostraban `unknown`** — el extractor leía `userData.userName`, campo que la API de UPC no devuelve. Ahora se arma desde `name.given + name.family` con fallback a `studentId`
- **`logout` no permitía cambiar de cuenta** — solo borraba `session.json` pero no el browser profile de Playwright (`~/.blackboard-cli/browser-profile`), donde viven las cookies de Microsoft SSO. El siguiente `login` se auto-autenticaba con la misma cuenta. Ahora `logout` borra también el profile

### Added
- `blackboard logout --keep-profile` — conserva las cookies SSO (útil para renovar sesión de la misma cuenta sin re-ingresar credenciales)
- **Self-heal de sesiones viejas** — `whoami` y `status` detectan `userName: null` en sesiones guardadas con versiones previas y rellenan el nombre llamando a `/users/me` una sola vez (sin necesidad de re-login)
- `resolveDisplayName()` helper en `src/auth/login.ts` — centraliza la lógica de nombre desde la respuesta de `/users/me`

---

## [1.0.8] — 2026-04-19

### Added
- **Soporte para preguntas `fimb`** (fill-in-multiple-blanks) en `get_quiz_questions`, `save_quiz_answer` y el tipo `QuizQuestion`:
  - `QuizQuestion.blanks` — array con los nombres de los blanks (ej. `["BLANK-1", "BLANK-2"]`)
  - `QuizQuestion.currentAnswer` — para fimb, devuelve `Record<string, string|null>` con el valor actual de cada blank
  - `save_quiz_answer` ahora acepta un JSON string con el mapa `{blankName: value}` (ej. `'{"BLANK-1":"1438.62","BLANK-2":"140.62"}'`)

---

## [1.0.7] — 2026-04-12

### Added
- **Persistent browser context** — el perfil de Playwright se guarda en `~/.blackboard-cli/browser-profile/`; las cookies de Microsoft SSO persisten entre sesiones, eliminando el login manual repetido
- **Silent auto-refresh** — cuando la sesión expira, la CLI relanza el browser en headless y se re-autentica automáticamente si el SSO de Microsoft sigue activo (sin intervención del usuario)
- **TTL real del servidor** — la expiración de sesión ya no es hardcoded a 8h; se parsea el campo `expires` del cookie `BbRouter` para usar el timestamp real del servidor (fallback: 3h)
- `get_assignment_feedback` — muestra nota, comentarios del profesor y archivos de feedback para todas las tareas de un curso
- `download_feedback_file` *(experimental)* — descarga archivos adjuntados por el profesor a una corrección

### Changed
- `blackboard login` ahora muestra el tiempo de expiración real (ej. "expira en 2.9h") en vez de "8 horas"
- `whoami`, `status` y `api` usan `loadOrRefreshSession()` — intentan refresh silencioso antes de pedir login manual

---

## [1.0.6] — 2026-04-12

### Added
- Soporte completo para quizzes/evaluaciones de Blackboard Ultra:
  - `get_quiz_questions` — obtiene todas las preguntas, opciones y respuesta actual de un intento; acepta URL directa o IDs separados (`courseId` + `contentId` + `attemptId`)
  - `save_quiz_answer` — guarda una respuesta individual sin enviar (verdadero/falso o índice de opción)
  - `submit_quiz` — envía el intento final (siempre pide confirmación)
- `src/api/quiz.ts` — módulo nuevo con tipos `QuizQuestion`, `QuizInfo`, `QuizAttemptPolicy` y toda la lógica de los endpoints internos de Ultra
- Verifica intentos restantes antes de cargar preguntas (`getQuizColumnId`)

### Fixed
- `tsconfig.json` — agrega `"DOM"` a `lib` para que los callbacks de `page.evaluate()` en `login.ts` compilen sin errores

---

## [1.0.5] — 2026-03-31

### Fixed
- `run.js` ahora prepone el directorio del Node que lo ejecuta al PATH antes de lanzar `tsx`
- Soluciona el crash en MCP cuando el usuario tiene nvm con Node 16 como default (Playwright requiere >=18)

---

## [1.0.4] — 2026-03-30

### Changed
- `download_attachment` y `download_file_url` ya no devuelven base64 — guardan el archivo directamente a disco
- Directorio por defecto: `process.cwd()` (donde el usuario está trabajando), configurable con `outputDir`
- Pasar `filename` (el `displayName` de `list_attachments`) para guardar con el nombre correcto
- Respuesta devuelve `{ saved, size, mimeType }` — sin datos en el contexto

---

## [1.0.3] — 2026-03-30

### Changed
- Todos los tools MCP migrados de `server.tool()` a `server.registerTool()` (API nueva del SDK v1.28+)
- Elimina todos los warnings de TypeScript por uso de API deprecada

---

## [1.0.2] — 2026-03-30

### Fixed
- `list_attachments` — fallback automático a parseo del HTML del `body` para contenido tipo `x-bb-document` y `x-bb-lesson` (antes retornaba 400 en estos casos)
- `download_attachment` — ahora acepta URLs directas de `bbcswebdav` además de IDs estándar de Blackboard

### Added
- `download_file_url` (MCP) — nueva herramienta para descargar archivos embebidos directamente desde URLs de `bbcswebdav` con las cookies de sesión autenticadas
- Todos los tools de descarga ahora retornan `filename`, `mimeType` y `size` junto al contenido `base64`

---

## [1.0.1] — 2026-03-30

### Added
- `courses members <courseId>` — lista compañeros e instructor de un curso (con `--role` y `--json`)

### Improved
- `courses list` — usa `expand=course` en una sola llamada en vez de 1+N (antes: 1 llamada por curso)
- `assignments list` — usa bulk grades (`/gradebook/users/{id}`) en paralelo con columns, eliminando N llamadas individuales
- `courses members` — usa `expand=user` para traer nombres en una sola llamada

---

## [1.0.0] — 2026-03-30

### Added

#### Autenticación
- Login via **SAML SSO → Microsoft Azure AD** con Playwright (ventana del browser)
- Sesión persistida en `~/.blackboard-cli/session.json` (TTL 8h, permisos 600)
- Comandos `login`, `logout`, `whoami`, `status`

#### Cursos
- `courses list` — cursos inscritos con nombre, rol, estado y último acceso
- `courses get <id>` — detalle de un curso
- `courses contents <id>` — árbol de contenido navegable por carpetas
- `courses contents --type file|folder|assignment|document` — filtro por tipo
- `courses announcements <id>` — anuncios del curso
- `courses grades <id>` — notas del ciclo

#### Tareas
- `assignments list <id>` — tareas con fecha de entrega, nota actual y alertas de color
- `assignments list --pending` — solo las pendientes de entrega
- `assignments attempts <id> <columnId>` — historial de entregas
- `assignments submit` — entregar tarea con archivo (`-f`), texto (`-t`) o borrador (`--draft`)

#### Descargas
- `download <courseId> <contentId>` — descargar archivo adjunto individual
- `download-folder <courseId> <folderId>` — descarga recursiva de toda una carpeta
- `download-folder --filter <keyword>` — filtrar por nombre de archivo

#### API & Developer experience
- `api <METHOD> <path>` — passthrough a cualquier endpoint de la REST API
- `endpoints` — catálogo documentado de 22+ endpoints con parámetros
- Todos los comandos aceptan `--json` con spinners redirigidos a `stderr`

#### MCP Server
- Comando `mcp` — inicia un servidor MCP (stdio) para Claude Code y Claude Desktop
- 13 herramientas: `whoami`, `list_courses`, `get_course`, `list_contents`,
  `list_announcements`, `list_assignments`, `list_attempts`, `get_grades`,
  `list_attachments`, `download_attachment`, `submit_attempt`, `raw_api`, `system_version`
- `CLAUDE.md` — guía de comportamiento para agentes IA

#### UI
- Banner ASCII con color rojo UPC (`#E31837`)
- Prompt "¿Qué puedo hacer ahora?" tras login exitoso
- Paleta semántica: `ok` (verde), `fail` (rojo), `warn` (amarillo), `hint` (cyan)

---

## Roadmap

- [x] `npx` install sin clonar repo (publicación en npm)
- [ ] Refresh automático de sesión antes de expirar
- [ ] Notificaciones de entregas próximas (`assignments due`)
- [ ] Descarga de videos de grabaciones de clase
- [ ] Soporte para múltiples cuentas / ciclos simultáneos
