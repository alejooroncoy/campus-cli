# Reanudar una lectura después de una verificación humana

El cliente local de Campus intenta descargar el PDF directamente. Si el editor bloquea el acceso y Browserbase está configurado, pide autorización directa para esa tarea y abre una sesión remota aislada con resolución de CAPTCHA. Recupera el PDF desde la API de descargas de esa misma sesión, verifica su identidad bibliográfica, lo guarda y lee el rango solicitado. Sin configuración Browserbase conserva la verificación manual en una ventana local. Las llamadas siguientes reutilizan los mismos bytes y SHA-256.

## Configuración de Browserbase

Definir `BROWSERBASE_API_KEY` en el entorno del proceso MCP local; `BROWSERBASE_PROJECT_ID` es opcional (Browserbase puede inferir el proyecto de la clave). No poner credenciales en la PR, argumentos de herramientas ni archivos compartidos. No se agrega un SDK ni un servicio nuevo. Los endpoints y el comportamiento de descarga siguen la documentación oficial de [sesiones](https://docs.browserbase.com/reference/api/create-a-session) y [descargas](https://docs.browserbase.com/platform/browser/files/downloads).

La autorización usa MCP elicitation y falla cerrada si el cliente no la admite, la rechaza o no contesta. La aprobación identifica origen y DOI; vale para una tarea y no concede una autorización general para futuros CAPTCHA. No se activa un proxy de pago ni se cambian planes. La sesión consume el uso del plan configurado.

## Uso

1. Leer normalmente con `campus_research_read_pdf` o `campus_research_read_document`, incluyendo `doi` cuando se conoce. Un HTTP 403 sin indicios de rate limit o una página HTML de verificación inicia la recuperación automáticamente. En enlaces doi.org se puede extraer el DOI de la ruta. Sin DOI canónico no se adivina la identidad del PDF: usar `campus_research_start_browser_reading` con DOI y URL editorial.
2. La tarea reutiliza la descarga directa fallida; no la repite antes de Browserbase. Si empieza mediante `start_browser_reading`, primero prueba la descarga directa. Una descarga PDF directa satisfactoria no abre un navegador ni pide autorización. Un 401, 429, límite de consultas, error de red o archivo demasiado grande no activa la recuperación.
3. Con Browserbase, el estudiante confirma la solicitud MCP y Campus continúa automáticamente. Sigue una vez el enlace visible View PDF o Download PDF y recupera solo el archivo de esa sesión mediante la API. Las cookies de Campus, Chrome personal y Codex no se transfieren. Sin la clave, el estudiante completa manualmente la verificación en la ventana local de Campus. En ningún caso una página abierta acredita lectura del PDF.
4. Consultar `campus_research_browser_reading_status` con `jobId`. `awaiting_user` no acredita lectura; `ready` contiene `localFile`, SHA-256, identidad y texto de las páginas solicitadas. El PDF se guarda en `~/Downloads/campus-cli/research` o en `research` dentro de `CAMPUS_DOWNLOAD_DIR`, con nombre único y sin sobrescribir archivos.
5. Continuar con `campus_research_browser_read_pages`, el mismo `jobId`, `expectedSha256` y `nextPage` como `startPage`. No se vuelve a descargar al editor. Para comprobar un fragmento, usar `campus_research_browser_verify_evidence` con página, fragmento y esa misma huella.
6. `campus_research_cancel_browser_reading` cierra la ventana y libera los bytes. Conserva cualquier PDF ya guardado para que el usuario pueda abrirlo o adjuntarlo a Mendeley mediante una acción autorizada.

Volver a iniciar el mismo DOI y URL mientras está pendiente devuelve el mismo trabajo. Si ya está listo, reutiliza el trabajo y lee el nuevo rango solicitado: no abre otra sesión, no descarga otra copia ni repite la verificación. La reutilización pertenece al proceso y usuario local; no es una caché compartida entre cuentas.

## Límites y estados

Las tareas y sus bytes pertenecen al proceso MCP local. Expiran quince minutos después de iniciarse; un reinicio requiere una tarea nueva. Se permiten dos tareas activas y cuatro conservadas. La sesión Browserbase dura como máximo 150 segundos y se libera al obtener el PDF, fallar, cancelar, expirar o desconectarse el cliente. La aprobación puede esperar hasta cinco minutos sin crear una sesión remota. El campo `phase` distingue `direct_download`, `awaiting_browserbase_approval`, `browserbase_verification`, `downloading_pdf` y `local_verification`.

No se hace OCR. Los PDF aceptados tienen hasta 20 MB; el lector existente mantiene sus límites de tiempo y memoria. La descarga desde Browserbase se corta por bytes aunque no exista Content-Length. Se comprueba el tamaño declarado del archivo antes de transferirlo. Un archivo ajeno al DOI falla la identidad, aunque tenga extensión PDF.

Una ventana cerrada cancela la espera. Los estados `failed`, `cancelled` y `expired` no devuelven texto de archivo. Un PDF ajeno al DOI, un HTML de bloqueo o un archivo demasiado grande no se guardan como fuente verificada. La primera descarga PDF reclama la tarea de forma exclusiva para evitar procesarla dos veces. La comprobación de identidad puede rechazar una copia si los metadatos no aparecen en sus primeras páginas; el fallo no certifica que el artículo sea falso.

Los enlaces firmados que cambian de parámetros siguen contando como la misma ruta PDF. Campus no inicia automáticamente otro intento si esa ruta vuelve a la página editorial. Si la verificación del editor se repite después de completarla, el usuario puede cancelar la tarea; no se considera que haya terminado ni se presenta un PDF inexistente.

La verificación compara título, DOI y, cuando están disponibles, autores, año y revista contra el registro canónico usando los bytes capturados. No verifica científicamente las afirmaciones, no identifica por sí sola la versión publicada y no convierte extracción de texto en revisión completa. Inspeccionar tablas e imágenes y conservar el contexto sigue siendo necesario. `sourceUrlClaim` es una atribución bibliográfica; no se presenta el enlace firmado de descarga como prueba de identidad.

## Integración y privacidad

Solo `src/mcp/server.ts`, el host local por stdio, registra estas herramientas. La función compartida `registerResearchTools`, que importa el relay remoto, no las registra. No se lanza un navegador con sesiones de otros usuarios en un servidor compartido. Para ofrecer este flujo desde un host remoto hace falta un componente cliente local o una integración explícita del host con su navegador; esta PR no afirma implementar esa integración.

El navegador local es visible y usa Chromium normal. El respaldo remoto utiliza la resolución de CAPTCHA de Browserbase únicamente después de la aprobación. No se ignoran errores TLS, no se automatizan inicios de sesión y no se accede a contenido de pago con credenciales ajenas. Las solicitudes de navegación se comprueban como HTTPS público. La clave solo se envía a `api.browserbase.com`, sin seguir redirecciones; no se exportan cookies, claves, URL de conexión ni enlaces firmados en respuestas MCP. No se persisten contextos Browserbase, grabaciones ni registros de sesión desde la integración.

## Comprobación local

```sh
npm run build
CAMPUS_BROWSER_TESTS=1 node --import tsx --test tests/research-browser.test.ts
```

Las pruebas de navegador usan Chromium real contra un editor de ejemplo en loopback. Las pruebas Browserbase inyectan su transporte API para comprobar aprobación, aislamiento de credenciales, recuperación, cancelación durante creación y reutilización de la misma descarga. No necesitan claves reales ni facturan sesiones en CI. El permiso HTTP/loopback existe únicamente como dependencia inyectada en las pruebas; producción exige HTTPS público. Una prueba real con EvalYaks necesita una clave configurada y la aprobación directa del usuario; las pruebas con fixtures no acreditan acceso al editor.
