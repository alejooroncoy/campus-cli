# Changelog

All notable changes to `campus-cli` (formerly `blackboard-upc`) will be documented here.

---

## [2.2.1] — 2026-09-19

### Fixed
- `blackboard_list_messages` ahora expande cada conversación de la bandeja de entrada antes de devolverla. Así incluye todos los mensajes del hilo y expone sus adjuntos en `attachments`, tanto por conversación como por mensaje.
- La lectura de cuerpos de mensajes admite las variantes `rawText` y `displayText` que entrega Blackboard, para no omitir adjuntos embebidos cuando el texto no llega como cadena simple.

---

## [2.2.0] — 2026-08-26

### Added
- `banner_get_weekly_schedule` pasa a ser el nombre principal del horario de Banner, consistente con los prefijos `blackboard_` y `uclass_`.

### Changed
- `campus_get_weekly_schedule` se mantiene como alias deprecado para no romper integraciones existentes.

---

## [2.1.0] — 2026-08-26

### Added
- `campus_get_weekly_schedule` — devuelve el horario semanal de Banner con días, horas, cursos y aulas; excluye matrículas retiradas o anuladas.
- Soporte para UClass y las tools asociadas, para consultar las integraciones académicas disponibles desde Campus.
- `blackboard_list_messages` y el comando equivalente para consultar mensajes de Blackboard sin abrir el navegador.

### Changed
- El catálogo MCP diferencia explícitamente el horario de clases de Banner (`banner_get_weekly_schedule`) de la vista semanal de tareas y vencimientos de Blackboard.

---

## [2.0.0] — 2026-08-14

### Security
- Las descargas MCP ahora quedan confinadas a `~/Downloads/campus-cli` (configurable por la persona que inicia el proceso mediante `CAMPUS_DOWNLOAD_DIR`). `outputDir` solo acepta subdirectorios relativos, se rechazan escapes por symlink antes de crear carpetas, nunca se sobrescribe un archivo, cada descarga tiene un límite de 100 MB y la raíz completa una cuota de 500 MB coordinada entre procesos. Los bytes se escriben primero en un archivo privado, los temporales abandonados se recuperan bajo lock y el nombre final solo aparece atómicamente al completar.
- Las subidas locales y entregas finales ya no confían en un `confirmed: true` generado por el agente: el servidor usa la elicitation de MCP para pedir una confirmación directamente en la interfaz del cliente y falla de forma cerrada si el cliente no la soporta. Las subidas también rechazan symlinks y archivos no regulares.
- `blackboard_raw_api` queda limitado a endpoints `/learn/api/public/` y exige confirmación directa para `POST`, `PUT`, `PATCH` y `DELETE`. Las descargas directas solo aceptan URLs `/bbcswebdav/` del origen HTTPS exacto de Blackboard, incluidos redirects.
- `session.json` deja de duplicar cookies de Microsoft: solo persiste cookies aplicables a Blackboard y migra automáticamente sesiones antiguas. Los archivos de sesión y cuenta se escriben de forma atómica, con permisos privados y sin seguir symlinks.
- Los endpoints configurables de cuenta y analítica exigen HTTPS, salvo loopback explícito para desarrollo.
- El sitio añade CSP, HSTS y protección contra framing.

### Changed
- **Breaking**: Node.js 22 o superior pasa a ser requisito mínimo. Esto alinea el runtime soportado con Playwright 1.62 y evita anunciar versiones de Node fuera de soporte.
- Astro 5 → 7.2.2 y dependencias transitivas actualizadas hasta dejar `npm audit` en cero tanto para el CLI como para el sitio.
- Playwright y Zod actualizados; dependencias de compilación movidas a `devDependencies`; eliminados `@browserbasehq/sdk`, `playwright-core` y `@types/inquirer` porque no se usaban directamente.
- Las instrucciones con `npx` fijan `campus-cli@2.0.0` para que un cliente MCP no ejecute silenciosamente una versión distinta en el siguiente arranque.

### Added
- Pruebas de regresión para aislamiento de origen, endpoints raw/descarga, filtrado de cookies, URLs TLS, confinamiento de descargas, no sobrescritura y límites de tamaño.
- Pruebas de regresión que verifican el cierre del stream HTTP cuando una descarga no puede crear el archivo de destino o recibe un nombre inseguro en la respuesta.

## [1.4.2] — 2026-08-08

### Security
- Los IDs de Blackboard (`courseId`, `contentId`, `parentId`, `columnId`, `attemptId`, `fileId`) se interpolaban sin validar en las URLs de la API REST. Un valor con `/` o `..` — por ejemplo, sugerido a un agente por contenido malicioso de un curso — podía redirigir la petición a un endpoint distinto dentro del mismo host. Ahora las 21 tools MCP que reciben alguno de estos campos exigen el formato real de Blackboard (`_529580_1`) antes de armar la petición.

### Fixed
- 10 vulnerabilidades de dependencias resueltas, sin saltar a la última versión mayor de nada:
  - `inquirer` 10 → 12 (no 14): el mínimo salto donde `@inquirer/editor` deja de arrastrar el paquete `tmp` vulnerable (escritura arbitraria de archivos vía symlink, path traversal por prefix/postfix sin sanear).
  - Se eliminaron `google-auth-library`, `@modelcontextprotocol/node`, `@modelcontextprotocol/server` y `@modelcontextprotocol/client`: ninguno se importa en el código — dependencias muertas que arrastraban las vulnerabilidades de `gaxios`/`uuid` y una versión vieja de `@hono/node-server`.
  - `tsx` refrescado dentro de su propio rango ya declarado, trayendo el `esbuild` con el fix de lectura arbitraria de archivos en Windows.

---

## [1.4.1] — 2026-08-08

### Security
- Un listado de terceros (mcp-marketplace.io) marcó el paquete con "Use Caution" señalando path traversal en descargas y falta de confirmación al enviar. A partir de ahí, una auditoría propia encontró y cerró además una fuga de sesión más seria:
- El cliente HTTP mandaba la cookie de sesión y el token XSRF del estudiante como headers por defecto, y los seguía enviando aunque la URL de la petición fuera absoluta y apuntara a otro host. `blackboard_raw_api`, `blackboard_download_file_url`, `blackboard_download_attachment` y el comando `campus api` podían ser inducidos (por ejemplo, contenido de un curso con instrucciones ocultas para el agente) a mandar la sesión completa a un servidor externo. Ahora cualquier URL absoluta se valida contra el host real de Blackboard antes de salir — la comprobación vive en un solo lugar central, no repetida por cada tool.
- Path traversal (CWE-22) en las descargas: un nombre de archivo con `../` que Blackboard reportara ya no puede escribir fuera de la carpeta de destino.
- `blackboard_submit_attempt` y `blackboard_upload_attempt_file` ahora exigen una confirmación explícita (`confirmed: true`) que el propio protocolo MCP valida, en vez de depender solo de que el agente obedezca la instrucción del prompt — cierra la puerta a que contenido malicioso de un curso empuje una entrega o una subida de archivo local sin que el estudiante la vea antes.
- `blackboard_list_people` ya no devuelve el email de un compañero de curso al buscarlo por nombre; solo lo hacía en la vista general, así que la búsqueda quedaba como excepción.
- 8 vulnerabilidades de dependencias resueltas (`npm audit fix`, sin romper compatibilidad).

### Added
- `Dockerfile` para los verificadores de directorios MCP. Glama y similares arrancan el servidor y le piden `tools/list`; la imagen no descarga el navegador de Playwright porque el login real ocurre en la máquina del estudiante, no en un contenedor.

### Fixed
- El servidor MCP anunciaba `version: 1.0.0` en el handshake, escrita a mano y congelada desde entonces. Ahora sale del `package.json`, así que cada cliente y cada directorio ve la versión real.

---

## [1.3.2] — 2026-08-06

### Added
- `mcpName` en `package.json` y `server.json` en la raíz del repo, con el formato del registro oficial de MCP (`io.github.alejooroncoy/campus-cli`). El registro valida la propiedad del servidor leyendo `mcpName` del `package.json` **publicado en npm**, así que este campo solo surte efecto a partir de esta versión; sin él, `mcp-publisher publish` rechaza la publicación.

### Notes
- Release de metadatos: no cambia código, dependencias ni comportamiento del CLI ni del servidor MCP.

---

## [1.3.1] — 2026-08-05

### Changed
- `description`, `keywords` y `homepage` de `package.json` (visibles en la página de npm) ahora son más específicos: mencionan explícitamente MCP, ChatGPT y Claude, para diferenciarse del paquete `campus-cli` de PyPI (Python, no relacionado) y de otras apps de "IA para estudiantes" con nombres parecidos.

---

## [1.3.0] — 2026-08-05

### Added
- `campus account login|whoami|logout` — cuenta Campus (Google), la identidad compartida entre las apps del ecosistema Campus (CLI, y las que vienen: Profe, Trámites...), separada de la sesión de Blackboard de cada universidad. El login es vía navegador con OAuth2+PKCE (redirect a `127.0.0.1`, igual que `gh auth login`/`gcloud auth login`) contra el servicio ya hospedado en `mcp.campuscli.com`.
- `campus login` ahora exige tener una cuenta Campus activa antes de iniciar el SSO de Blackboard (que sigue siendo 100% local, sin cambios): si no hay cuenta, te pide correr `campus account login` primero. `campus account login`, al terminar, encadena automáticamente el SSO de Blackboard — no hace falta correr los dos comandos por separado.

### Notes
- El SSO de Blackboard no cambió: sigue abriendo Chromium/Chrome/Edge local vía Playwright, sin pasar por ningún servidor propio. Solo la nueva cuenta Campus (Google) usa el backend hospedado.

---

## [1.2.0] — 2026-08-05

### Added
- `blackboard_list_people` — lista los docentes y compañeros de un curso, resolviendo el id interno de usuario que traen anuncios y notas a un nombre real. Con `search`, busca a una persona puntual y devuelve su email; sin `search`, separa instructores de compañeros (compañeros solo por nombre, sin contacto, salvo que se pida uno en particular).
- Analítica de uso opcional vía PostHog: inicio de la CLI, comandos ejecutados, logins, sesiones vencidas, uso de tools MCP, entregas de tareas, etc. No se envían cookies, contraseñas, cursos, tareas ni calificaciones — solo el id de Blackboard como identificador estable. Se puede desactivar con `POSTHOG_DISABLED=1` o apuntar a un proyecto propio con `POSTHOG_API_KEY`/`POSTHOG_HOST` (ver README).
---

## [1.1.2] — 2026-07-29

> La versión 1.1.1 se publicó y despublicó el mismo día: el build incluía código compilado de trabajo en curso (app de escritorio/backend, no conectado al CLI) por una limpieza incompleta de `dist/`. 1.1.2 es esa misma release, empaquetada correctamente.

### Fixed
- `campus login`/`silentRelogin` ya no descargan el Chromium de Playwright por defecto: `launchPersistentContextSafe` prueba primero el Chrome o Edge ya instalado en la máquina (mismo binario, misma versión), y solo si ninguno existe recurre al Chromium empaquetado por Playwright, instalándolo la primera vez que hace falta.
- `run.js` ejecuta `dist/index.js` compilado cuando está disponible en vez de transpilar con `tsx` en cada arranque — inicio más rápido para instalaciones globales/`npx`.
- El paquete publicado en npm ahora solo incluye `dist`, `run.js`, `README.md` y `CHANGELOG.md` (antes se publicaba todo el repo); se agregó `prepublishOnly` para garantizar que `dist/` siempre esté compilado antes de publicar, y `build` ahora limpia `dist/` antes de compilar para no arrastrar archivos de builds anteriores.
- El login por SSO de Microsoft ahora detecta el destino real de la navegación (`aulavirtual.upc.edu.pe/ultra`) en vez de depender de tiempos de espera fijos, cerrando un caso donde una redirección lenta o falsificada podía dejar la sesión a medio autenticar.
- Se corrigieron dos `unhandled rejection` en el flujo de login que podían tumbar el proceso del servidor MCP ante un fallo de red durante la autenticación.
- Las llamadas concurrentes a las tools de Blackboard (hasta 5 en paralelo, como permite este mismo agente) ya no compiten por el mismo perfil de navegador: los lanzamientos de Chromium se serializan por sesión en vez de arriesgarse a chocar contra el lock del directorio de perfil.
- Las respuestas de las tools `blackboard_*` vía MCP ahora se devuelven en JSON compacto en vez de indentado, reduciendo el consumo de tokens sin perder información.

---

## [1.1.0] — 2026-07-21

### Removed
- **Breaking**: se eliminaron las tools `blackboard_get_quiz_questions`, `blackboard_save_quiz_answer` y `blackboard_submit_quiz` (auto-resolver y enviar quizzes/evaluaciones). Navegar y descargar archivos adjuntos dentro de un quiz sigue funcionando igual vía `blackboard_list_contents`/`blackboard_list_attachments`.

### Added
- `blackboard_upload_attempt_file` — sube un archivo local (imagen, PDF, etc.) a Blackboard y devuelve un `fileUploadId` para adjuntarlo a una entrega.
- `blackboard_save_attempt_draft` — guarda texto y/o archivos en una entrega de tarea SIN enviarla; el intento queda abierto para seguir editando. No requiere confirmación (a diferencia de `blackboard_submit_attempt`).
- `blackboard_submit_attempt` ahora también acepta `fileUploadIds` para adjuntar archivos al enviar.

### Notes
- Estas tools operan sobre columnas de calificación tipo entrega de archivo/texto/link. En Blackboard Ultra, tareas y quizzes comparten el mismo tipo de contenido (`resource/x-bb-asmt-test-link`); si se usan contra una evaluación con preguntas interactivas, Blackboard responde `400` ("Attempts cannot be created for assessments with non-presentation-only questions"). Un `403 bb-rest-attempt-past-due-exception` es el comportamiento normal una vez vencida la fecha de entrega.

## [1.0.2] — 2026-07-15

### Fixed
- `campus assignments list <courseId>` ahora muestra notas que Blackboard devuelve en `grade.score`, no solo en `grade.displayGrade.score`.
- `campus assignments list <courseId> --pending` ya no trata tareas calificadas como pendientes cuando la nota viene en `grade.score`.
- Cuando un curso no tiene pendientes, el CLI ahora muestra `No pending assignments found in this course.` en vez de dejar una salida vacía.

---

## [1.0.1] — 2026-07-15

### Added
- `campus assignments list` ahora acepta `courseId` opcional. Sin `courseId`, recorre todos los cursos disponibles del estudiante.
- `campus assignments list --pending` ahora funciona como vista global de pendientes, ideal después de `campus courses list`.
- Suite mínima de tests con `node:test` vía `tsx`, cubriendo el uso opcional de `courseId` y el filtro de pendientes.

### Fixed
- `campus assignments list --pending` ya no falla con `missing required argument 'courseId'`.
- `--pending --json` ahora filtra correctamente las tareas pendientes tanto en modo global como en modo de un solo curso.
- El paquete npm ya no incluye `.codex/` ni `AGENTS.md` en el tarball publicado.

### Changed
- README reestructurado para facilitar adopción: badges de npm, requisitos, comparación CLI/MCP, configuración mínima MCP, privacidad, troubleshooting y contribución.

---

## [1.0.0] — 2026-07-13 — renombrado a `campus-cli`

Continúa la historia de `blackboard-upc` (ver entradas `1.0.x`–`1.1.0` abajo). Se renombra el paquete porque el alcance ya no es solo Blackboard/UPC: universidades peruanas usan LMS distintos (UTP/USIL/Wiener → Canvas, UCSM/UNAP → Moodle), y la estructura interna (`src/providers/<lms>/`) ya está pensada para agregarlos.

### Added
- Campo `instructions` en el handshake `initialize` del servidor MCP — cualquier cliente MCP (no solo Claude Code vía `CLAUDE.md`) recibe una guía de uso al conectarse.
- Sección "Providers" en el README documentando el roadmap (Canvas, Moodle) y cómo contribuir.

### Changed
- **Breaking**: paquete npm `blackboard-upc` → `campus-cli`; bin primario `blackboard`/`blackboard-upc` → `campus`/`campus-cli` (los nombres viejos se mantienen como alias, no se rompen instalaciones existentes).
- **Breaking**: las 19 tools MCP de Blackboard ahora llevan el prefijo `blackboard_` (ej. `whoami` → `blackboard_whoami`, `raw_api` → `blackboard_raw_api`) para no colisionar cuando se agreguen `canvas_*`/`moodle_*`.
- Banner de terminal simplificado (ya no deletrea "BLACKBOARD" en ASCII art — no tenía sentido con el rebrand).

### Deprecated
- El paquete `blackboard-upc` en npm queda marcado como deprecado, apuntando a `campus-cli`.

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
