# Cliente del relay de Campus — migración 3.x

Contrato 3.0.0: captura de login con Playwright local y todas las consultas mediante el relay. El relay incorpora `/v1/cli/login` para verificar y almacenar capturas, sin cambiar el worker, el vault o la política de cobro.

## Acceso

Toda operación de la CLI y del puente MCP usa el endpoint `https://mcp.campuscli.com/mcp`. El relay valida el token de la cuenta y aplica sus controles de plan, prueba y cupo. No existe una variable que habilite ejecución local como alternativa.

La prueba actual de cinco consultas del relay se conserva. Quitar esa prueba requiere un cambio independiente de la política del servidor. Tampoco se pueden inutilizar las versiones anteriores de código abierto que ya se distribuyeron.

`campus login` usa el flujo MCP OAuth del relay con PKCE S256, estado aleatorio y retorno efímero a `127.0.0.1`. Primero pide `campus.identity`, sin acceso a consultas. Después abre Playwright local con un contexto temporal y obtiene solamente las cookies de la universidad seleccionada. Tras el consentimiento explícito, las envía al relay por HTTPS. El relay comprueba el origen, vencimiento, universidad y la identidad mediante `blackboard_whoami`, guarda la sesión cifrada contra la cuenta autenticada y devuelve un token `campus.read`. Las capturas rechazadas no reemplazan la autorización local anterior. El navegador se cierra; no se guardan cookies del campus en los archivos de sesión 2.x. La sesión Google de `campus account login` de 2.x y las cookies locales de Blackboard no sirven como autorización del relay.

Los tokens OAuth del relay se guardan con permisos 0600 en un directorio 0700 bajo `~/.blackboard-cli/relay`. El nombre del archivo deriva del endpoint completo, para no reutilizar credenciales al cambiar de servicio. Los refresh tokens se renuevan mediante el mismo relay. El login fallido o cancelado no reemplaza la autorización anterior.

Para conectar Palermo desde el navegador hospedado, usa `campus login --hosted --university palermo-ar`. El onboarding del relay abre el login oficial MyUP en Browserbase; después, el worker reutiliza Blackboard por HTTP. El cliente verifica la universidad de la cuenta antes de guardar su autorización OAuth y nunca recibe ni guarda la contraseña universitaria. Cuando el servidor ofrece reconexión mediante credenciales, el único checkbox «Mantener mi cuenta conectada» explica que Campus guardará cifrados el usuario y la contraseña, con retención máxima de treinta días, para nuevos accesos automáticos. Es voluntario y viene desmarcado; un consentimiento anterior de cookies no lo habilita. MFA, contraseña rechazada o vencimiento del permiso requieren reconectar. Para retirar el permiso desde el asistente o el CLI, usa `campus_revoke_persistent_access` (por ejemplo, `campus tools call campus_revoke_persistent_access`). El relay elimina el acceso guardado sin consumir cupo académico. Esto no garantiza una sesión MyUP de un mes. Sin esa función configurada, la pantalla ofrece únicamente guardar cookies y lo indica expresamente. La captura local existente solo transfiere Blackboard, sin cookies MyUP ni contraseña; todas las consultas y decisiones de acceso siguen en el relay.

## Compatibilidad CLI

| Entrada | Comportamiento 3.x |
| --- | --- |
| `login`, `account login` | OAuth de identidad Campus, Playwright local y transferencia de sesión verificada al relay. `--university` selecciona una universidad admitida por el servidor. No se aceptan contraseñas por argumentos ni se habilita un motor local de consultas. |
| `status`, `account whoami` | `campus_check_connection` del relay. |
| `whoami` | `blackboard_whoami` del relay. |
| Cursos, mensajes, debates y portales | Herramientas correspondientes del relay, con salida JSON. |
| `assignments list <courseId>` | Evaluaciones publicadas del curso. |
| `assignments list` sin curso | Vista semanal publicada por el relay, no el informe local histórico de todas las evaluaciones. |
| `assignments list --pending` | No disponible: la respuesta del relay no garantiza el estado necesario para reconstruir el filtro local de entregas individuales y grupales. Consultar la lista con su estado publicado. |
| `assignments feedback <courseId>` | Retroalimentación del curso completo; no acepta el antiguo filtro por columna/intento. |
| `assignments submit`, `--draft` | Rechazado: el relay actual solo lee Blackboard. Hacer la entrega en Aula Virtual. |
| `api GET` | Herramienta de API pública del relay, con las restricciones del servidor. |
| `api POST/PUT/PATCH/DELETE` | Rechazado antes de ejecutar una operación. |
| `download`, `download-folder` | Descarga mediante tickets temporales del relay. `--out` es un subdirectorio relativo del directorio protegido. |
| `tools list`, `tools call` | Catálogo vigente y resultado MCP completo del relay. |
| `campus-mendeley-connect` | Alias de `campus tools call campus_mendeley_connect`; ya no recibe credenciales locales. |

`--json` permanece como opción de compatibilidad; las consultas ya producen JSON. Los mensajes de pago o reconexión y los errores del relay se conservan. La CLI no intenta repararlos consultando directamente la universidad.

## Puente MCP

El puente une `StdioServerTransport` con `StreamableHTTPClientTransport`. El handshake conserva las capacidades del cliente, la identidad, instrucciones y versión del servidor remoto. Los mensajes viajan en ambas direcciones, incluidas confirmaciones por elicitación, solicitudes de recursos, cancelaciones y notificaciones. Ningún resultado de confirmación se acepta automáticamente.

Solo se anuncian las herramientas que el relay publica para esa cuenta. La CLI de terminal no anuncia capacidades de elicitación y no puede aceptar automáticamente una solicitud que requiera confirmación humana.

Los datos estructurados, los enlaces `resource_link` y los metadatos de aplicaciones del relay se conservan en el MCP. El puente no habilita acceso a rutas del equipo cliente desde el servicio hospedado: los archivos adjuntos se deben proporcionar mediante las capacidades que anuncie el relay y el cliente compatible.

## Distribución y núcleo privado

El cambio es incompatible con la biblioteca 2.x y por eso prepara la versión mayor 3.0.0. El paquete npm solo incluye `dist/index`, `dist/relay` (incluida la captura de login local), el puente MCP, utilidades de archivos/URLs y sus entradas ejecutables. Playwright es una dependencia de ejecución usada exclusivamente durante login. Se eliminan los exports `campus-cli/client`, `session`, `login`, proveedores y herramientas del núcleo.

El código fuente existente de proveedores se conserva en este checkout para desarrollo y pruebas, pero no se distribuye en el nuevo paquete. El backend `campus-cli-internal` debe mantener su dependencia fijada al artefacto privado de núcleo 2.x o migrar a otro artefacto privado de núcleo. No instalar el cliente 3.x como sustituto de esa dependencia: carece de los exports del servidor.

El cliente no contiene un control local de pago que pueda reemplazar la decisión del servidor. El límite comercial efectivo está en el relay hospedado. Excluir los proveedores de nuevas distribuciones no retira copias antiguas, licencias otorgadas ni código público ya disponible.

## Verificación

`tests/relay-client.test.ts` prueba autenticación PKCE contra un relay de prueba, retorno con estado incorrecto, cancelación, timeout, rotación de tokens, aislamiento por endpoint, permisos de archivos, comandos CLI, transmisión bidireccional de MCP y mensajes de pago. Las pruebas de proceso real comprueban que las sesiones antiguas no habilitan la CLI y que el catálogo y la identidad provienen del relay.

Antes de publicar, compilar y comprobar el contenido de `npm pack`; instalar ese archivo en un entorno sin las dependencias de desarrollo para verificar que no requiere proveedores o sesiones locales. La política de cobro se conserva. La sesión capturada es temporal (acotada por sus cookies y un máximo de tres horas); al vencer se puede repetir `campus login`. No se exporta un grant de SSO de Microsoft/Google. La versión inicial del relay anuncia UPC y UPN; una universidad fuera de su catálogo se rechaza antes de capturar cookies.
