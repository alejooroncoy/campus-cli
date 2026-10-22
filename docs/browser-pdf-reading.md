# Reanudar una lectura después de una verificación humana

El cliente local de Campus puede mantener una tarea de lectura mientras el estudiante completa una verificación del editor en una ventana visible. Cuando esa misma ventana recibe el PDF, Campus lo captura, verifica su identidad bibliográfica y lee automáticamente el rango de páginas solicitado. La respuesta inicial devuelve un identificador de tarea; no necesita mantener una llamada MCP abierta durante la intervención humana.

## Uso

1. Iniciar `campus_research_start_browser_reading` con `doi`, la `url` editorial y, opcionalmente, `startPage` y `pageCount` (hasta 20).
2. El estudiante completa la verificación en la ventana local de Campus. Las sesiones del navegador de Codex, Chrome personal u otros clientes no se transfieren a esa ventana.
3. Campus sigue el enlace visible View PDF o Download PDF cuando está disponible, o captura el PDF que el estudiante abre manualmente. Admite una segunda verificación en el dominio del PDF: la tarea conserva el DOI y el rango solicitado mientras el usuario la completa.
4. Consultar `campus_research_browser_reading_status` con `jobId`. `awaiting_user` no acredita lectura; `ready` contiene `localFile`, SHA-256, identidad y texto de las páginas solicitadas. El PDF se guarda en `~/Downloads/campus-cli/research` o en `research` dentro de `CAMPUS_DOWNLOAD_DIR`, con nombre único y sin sobrescribir archivos.
5. Continuar con `campus_research_browser_read_pages`, el mismo `jobId`, `expectedSha256` y `nextPage` como `startPage`. No se vuelve a descargar al editor. Para comprobar un fragmento, usar `campus_research_browser_verify_evidence` con página, fragmento y esa misma huella.
6. `campus_research_cancel_browser_reading` cierra la ventana y libera los bytes. Conserva cualquier PDF ya guardado para que el usuario pueda abrirlo o adjuntarlo a Mendeley mediante una acción autorizada.

## Límites y estados

Las tareas y sus bytes pertenecen al proceso MCP local. Expiran quince minutos después de iniciarse; un reinicio requiere una tarea nueva. Se permiten dos tareas activas y cuatro conservadas. No se hace OCR. Los PDF aceptados tienen hasta 20 MB; el lector existente mantiene sus límites de tiempo y memoria. La captura de respuestas PDF se realiza por bloques y corta al alcanzar el límite; los archivos descargados mediante el mecanismo normal del navegador también se validan antes de analizarlos o guardarlos.

Una ventana cerrada cancela la espera. Los estados `failed`, `cancelled` y `expired` no devuelven texto de archivo. Un PDF ajeno al DOI, un HTML de bloqueo o un archivo demasiado grande no se guardan como fuente verificada. La primera descarga PDF reclama la tarea de forma exclusiva para evitar procesarla dos veces. La comprobación de identidad puede rechazar una copia si los metadatos no aparecen en sus primeras páginas; el fallo no certifica que el artículo sea falso.

La verificación compara título, DOI y, cuando están disponibles, autores, año y revista contra el registro canónico usando los bytes capturados. No verifica científicamente las afirmaciones, no identifica por sí sola la versión publicada y no convierte extracción de texto en revisión completa. Inspeccionar tablas e imágenes y conservar el contexto sigue siendo necesario. `sourceUrlClaim` es una atribución bibliográfica; no se presenta el enlace firmado de descarga como prueba de identidad.

## Integración y privacidad

Solo `src/mcp/server.ts`, el host local por stdio, registra estas herramientas. La función compartida `registerResearchTools`, que importa el relay remoto, no las registra. No se lanza un navegador con sesiones de otros usuarios en un servidor compartido. Para ofrecer este flujo desde un host remoto hace falta un componente cliente local o una integración explícita del host con su navegador; esta PR no afirma implementar esa integración.

El navegador es visible, aislado y usa Chromium normal. No aplica parches de fingerprint, no pulsa CAPTCHA ni ignora errores TLS. Las peticiones y redirecciones se comprueban como HTTPS público. No exporta cookies, cabeceras de sesión ni enlaces firmados a las respuestas MCP. El adaptador local se puede sustituir por una implementación del contrato `BrowserReadingOpen`, conservando la verificación y la continuación sobre los mismos bytes. Esta PR no configura ni factura sesiones Browserbase ni incluye un solucionador CAPTCHA.

## Comprobación local

```sh
npm run build
CAMPUS_BROWSER_TESTS=1 node --import tsx --test tests/research-browser.test.ts
```

La prueba de integración usa Chromium real contra un editor de ejemplo en loopback: espera una acción representativa del usuario, recibe un PDF por transferencia fragmentada y lee la página siguiente sin una segunda petición del archivo. El permiso HTTP/loopback existe únicamente como dependencia inyectada dentro de esa prueba; la implementación de producción exige HTTPS público. Los metadatos y el PDF de esa prueba son fixtures explícitos. No constituye una prueba de acceso real a Elsevier ni de resolución de un CAPTCHA real.
