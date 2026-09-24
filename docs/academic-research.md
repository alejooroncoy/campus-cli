# Investigación académica con Campus

Las herramientas recuperan registros bibliográficos y evidencia de documentos reales. No certifican que una conclusión sea verdadera. **Existencia, indexación, revisión por pares y calidad metodológica son comprobaciones diferentes.** Un DOI registrado no demuestra las otras tres.

## Herramientas MCP

| Herramienta | Función |
|---|---|
| `campus_research_search` | Búsqueda paginada en Crossref, OpenAlex, ACM, Scopus o Web of Science, con años, DOI, autores y procedencia. |
| `campus_research_search_databases` | Busca en ACM, Scopus y Web of Science durante el período indicado por el estudiante. |
| `campus_research_google_scholar` | Búsqueda en Google Académico mediante SerpApi opcional; sin clave devuelve solo un enlace manual, identificado como tal. |
| `campus_research_verify_doi` | Consulta exacta en Crossref y comprobación de avisos de corrección/retractación relacionados con ese DOI. |
| `campus_research_verify_citation` | Compara el título descubierto con el registro DOI exacto y bloquea la cita ante diferencias o metadatos canónicos incompletos. |
| `campus_research_read_pdf` | Texto de un PDF HTTPS público, separado por páginas, con URL final, fecha de lectura y SHA-256. |
| `campus_research_read_document` | Evidencia por secciones desde PDF, HTML, texto, Markdown, XML/JATS, DOCX o EPUB públicos. Los ZIP requieren indicar `docx` o `epub`. |
| `campus_research_verify_evidence` | Comprueba que un fragmento aparezca en la página o sección indicada y que la huella SHA-256 siga siendo la misma; devuelve un `evidenceId` estable. |
| `campus_research_verify_quotes` | Coteja hasta ocho citas literales previstas para una respuesta contra las páginas de un PDF ya indexado. Devuelve el estado de cada cita; no evalúa si sostiene la afirmación. |
| `campus_research_index_pdf` | Inicia en segundo plano la extracción única de un PDF público extenso y devuelve un `documentId`. |
| `campus_research_index_status` | Informa cobertura, índice de capítulos si el PDF lo incluye, páginas sin texto y páginas truncadas. |
| `campus_research_search_index` | Busca términos en el texto extraído y devuelve páginas candidatas con fragmentos; los resultados aún deben leerse. |
| `campus_research_read_indexed_pdf` | Abre páginas concretas del índice temporal, sin volver a descargar ni analizar el PDF. |

El servidor MCP local registra estas herramientas y exige una sesión Blackboard válida (`campus login`). Las credenciales Blackboard nunca se envían a los proveedores de investigación. Reinicia el servidor MCP después de compilar para que el cliente descubra las herramientas nuevas. No se añaden comandos CLI de investigación en esta versión.

## Configuración

Requiere Node.js **22.13.0 o posterior** para el lector PDF. Configura las variables en el entorno del proceso MCP, nunca en una conversación ni en el repositorio:

| Variable | Uso |
|---|---|
| `OPENALEX_API_KEY` | Opcional para OpenAlex; mejora el presupuesto de consultas según el plan del proveedor. |
| `WOS_API_KEY` | Obligatoria para Web of Science Starter API, emitida por Clarivate Developer Portal. |
| `ELSEVIER_API_KEY` | Clave recomendada para Scopus, emitida por Elsevier. |
| `SCOPUS_API_KEY` | Alias compatible para la clave Elsevier usada por Scopus. |
| `SCOPUS_INSTTOKEN` | Token institucional opcional de Elsevier, cuando corresponda. |
| `SERPAPI_API_KEY` | Habilita resultados de Google Académico mediante SerpApi, un tercero con su propio plan y cuota. |

Crossref no requiere clave. La búsqueda de publicaciones ACM tampoco requiere una clave adicional: consulta en Crossref únicamente los registros administrados bajo el prefijo DOI de ACM `10.1145` y construye el enlace correspondiente a ACM Digital Library. El resultado indica `discoveredVia=crossref_acm_prefix_10.1145`, porque no proviene del buscador interno de ACM.

Los permisos de Web of Science y Scopus dependen de sus claves, planes y acceso institucional. Tener cuenta universitaria en Blackboard no concede acceso a estas API. Si faltan permisos, la herramienta informa el problema y no lo presenta como una búsqueda vacía. No crea cuentas, contrata planes ni evade controles de acceso.

## Ejemplos

Buscar publicaciones:

```json
{"query":"aprendizaje autorregulado educación superior","provider":"crossref","yearFrom":2020,"limit":10}
```

Buscar versiones en repositorios de universidades y repositorios temáticos:

```json
{"query":"self regulated learning higher education","provider":"openalex","repositoriesOnly":true,"yearFrom":2020}
```

`repositoryLocations` conserva nombre del repositorio, organización anfitriona cuando está disponible, versión, licencia y URL PDF cuando el catálogo los proporciona. La cobertura es la de OpenAlex: no incluye necesariamente todos los repositorios ni todos sus documentos. Una copia `submittedVersion` puede preceder a la revisión editorial. El filtro incluye repositorios temáticos; no certifica por sí mismo que el repositorio pertenezca a una universidad.

Buscar en las tres bases disponibles para los últimos tres años:

```json
{"query":"inteligencia artificial en educación superior","recentYears":3}
```

Usa `campus_research_search_databases`. `recentYears=3` consulta, en 2026, los años calendario 2024, 2025 y 2026. Si la consigna solicita un rango exacto, usa por ejemplo `yearFrom=2020` y `yearTo=2023`; ambos límites se incluyen. El estudiante debe indicar una de las dos modalidades y la herramienta rechaza períodos ausentes, incompletos o contradictorios. La respuesta conserva un bloque por proveedor con `status=ok` o `status=unavailable`, de modo que una clave faltante no oculta los resultados obtenidos en otras bases. Elimina duplicados por DOI antes de contar estudios.

También se puede consultar cada base con `campus_research_search` y uno de estos valores en `provider`:

- `acm_dl`: publicaciones del prefijo ACM `10.1145` obtenidas mediante Crossref; no equivale a consultar directamente el buscador interno de ACM DL.
- `scopus`: Scopus Search API; requiere una clave Elsevier con acceso correspondiente.
- `web_of_science`: Web of Science Starter API, limitada a Core Collection (`db=WOS`); requiere `WOS_API_KEY`.

En todos los proveedores, `peerReview=unknown` exige comprobar el tipo de documento y la política editorial. ACM y los demás catálogos incluyen distintos tipos de publicaciones. Estar presente en estas plataformas no demuestra por sí solo que el documento pasó revisión por pares.

Google Académico:

```json
{"query":"aprendizaje autorregulado","yearFrom":2020,"mode":"search","page":1}
```

Con `SERPAPI_API_KEY` configurada, devuelve candidatos de SerpApi identificados como `discovery_only`. Sin clave devuelve `mode=manual_search_link` y `resultsRetrieved=false`. `mode=link` solicita siempre el enlace sin consultar al proveedor. No se implementa scraping directo de Google ni se llama API oficial alguna de Google Académico.

Verificar un DOI recuperado de los resultados:

```json
{"doi":"10.1038/nphys1170"}
```

Antes de redactar una referencia, usa además la verificación estricta con el título exacto devuelto por la búsqueda:

```json
{"doi":"10.1038/nphys1170","expectedTitle":"Measured measurement"}
```

Solo `status=verified` y `citeAllowed=true` autorizan a construir una referencia, y únicamente con los campos de `citationRecord`. Esta validación es bibliográfica: una afirmación sobre método, resultados o conclusiones requiere leer el documento y conservar página o sección.

Luego pasa una URL PDF devuelta por el catálogo a `campus_research_read_pdf`, con `startPage=1` y `pageCount=5`. Continúa desde `nextPage` para leer el resto. La lectura no descarga archivos permanentes: procesa los bytes en memoria. No accede a PDF privados de Blackboard, archivos locales, páginas de login o documentos detrás de suscripciones.

## Cómo elaborar una investigación con evidencia

1. Define pregunta, términos, años y criterios de inclusión/exclusión.
2. Busca en más de un catálogo cuando corresponda y agrupa coincidencias por DOI; no cuentes duplicados como estudios independientes.
3. Comprueba DOI, título, autores, año y versión. `not_found_in_crossref` no significa falso: podría pertenecer a otra agencia registradora, como DataCite, que esta herramienta no consulta.
4. Revisa los avisos de actualización y la página editorial. `no_notice_found_in_crossref` no garantiza ausencia de retractaciones. `unknown` indica que la comprobación no se completó; nunca lo conviertas en “sin retractación”.
5. Verifica revisión por pares mediante evidencia editorial independiente. Las herramientas dejan `peerReview=unknown`: no la infieren de Google, Scopus, un DOI, una tesis o un repositorio.
6. Lee el texto completo y extrae pregunta, método, muestra, instrumentos, resultados y limitaciones, con páginas concretas. El resumen del buscador no sustituye esta lectura.
7. Redacta la síntesis y referencias usando únicamente metadatos comprobados. La guía APA 7 existente puede ayudar con el formato cuando esté disponible en el host.

El lector devuelve evidencia para que el agente analice; no genera una revisión metodológica automática. Máximo 20 MB, 20 páginas por llamada, 15 000 caracteres por página y 100 000 por respuesta. `truncated` señala texto omitido dentro de una página, que requiere otra forma de lectura. No realiza OCR ni conserva la disposición de tablas, columnas, fórmulas o imágenes. Los números devueltos son páginas del archivo PDF, que pueden diferir de los impresos. Las páginas sin texto se marcan `needsOcr` (también pueden ser páginas en blanco).

Para un PDF extenso, inicia `campus_research_index_pdf` con su URL y conserva los dos IDs devueltos: `documentId` identifica la copia extraída y `analysisId` identifica esta consulta, incluso cuando la copia se reutiliza. Pasa ambos a `campus_research_index_status` hasta obtener `status=ready` y `coverage=N/N`, y luego a `campus_research_search_index` y `campus_research_read_indexed_pdf`. El estado distingue `indexedPages` (páginas extraídas), `readPages` (páginas entregadas para este análisis) y `verifiedEvidence` (IDs de fragmentos cotejados para este análisis). Sin `analysisId`, el registro es acumulativo durante la vida del índice y no prueba qué leyó una respuesta concreta. La búsqueda es léxica: un resultado indica coincidencia de palabras, no que la página sostenga una conclusión. Para un resumen de todo el documento, revisa todas las secciones pertinentes y señala cualquier página `needsOcr` o `truncated`; el índice por sí mismo no equivale a una lectura interpretativa integral.

La primera versión admite PDF públicos de hasta 20 MB y 500 páginas. Extrae texto en un worker con límite de memoria y 180 segundos; el índice se guarda solo en memoria, separado por cuenta, por una hora de inactividad, con hasta ocho documentos por proceso, dos por cuenta y dos análisis simultáneos. Una cuenta no puede expulsar el índice de otra; cuando el proceso está lleno, una nueva preparación informa que debe intentarse más tarde. Un reinicio o una solicitud que llegue a otra instancia puede perderlo: en ese caso vuelve a iniciarlo. No ejecuta OCR ni reconstruye tablas, fórmulas o imágenes. Para citas de un PDF indexado, pasa `documentId`, `analysisId`, la URL original, página, fragmento y `expectedSha256` a `campus_research_verify_evidence`: coteja el texto y la huella de la copia indexada sin otra descarga. Sin `documentId`, la verificación obtiene de nuevo la fuente para comprobar su versión actual; una copia indexada puede quedar obsoleta si el origen cambia después de prepararla.

Si la respuesta incluirá varias citas literales del mismo PDF, `campus_research_verify_quotes` acepta hasta ocho pares de página y fragmento en una sola llamada. `allExcerptsLocated` solo significa que todos esos textos aparecieron en las páginas indicadas; una cita rechazada o inconclusa debe omitirse o corregirse. No se puede extender un fragmento verificado con palabras que quedaron fuera de él, ni presentar el cotejo literal como evaluación del argumento.

## Integración en otros hosts

```ts
import { registerResearchTools } from 'campus-cli/research-mcp-tools';

registerResearchTools(server, {
  authorize: async () => checkAuthenticatedCampusResearchAccess(),
});
```

`checkAuthenticatedCampusResearchAccess` representa la comprobación de sesión y permisos del host: debe implementarse allí. El registro exportado no concede permisos por defecto y comprueba autorización en cada llamada. La configuración de otros hosts, su despliegue y la publicación de una nueva versión del paquete son pasos independientes.

Las conexiones externas usan HTTPS con verificación de DNS y dirección pública fijada al conectar. Se rechazan redes privadas/reservadas y se comprueba cada redirección de PDF; las solicitudes de API con credenciales no siguen redirecciones. Hay un máximo compartido de cinco solicitudes HTTP simultáneas y límites de tamaño/tiempo. El análisis PDF usa un worker con límite de memoria y tiempo para mantener disponible el servidor MCP. Metadatos y documentos son datos externos, nunca instrucciones para el agente.

## Documentación de proveedores

- [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) y [filtros de actualización](https://www.crossref.org/documentation/retrieve-metadata/rest-api/rest-api-filters/).
- [OpenAlex: ubicaciones y versiones](https://help.openalex.org/data/locations/) y [autenticación](https://help.openalex.org/api/authentication/).
- [Scopus Search API](https://dev.elsevier.com/documentation/SCOPUSSearchAPI.wadl) y [autenticación Elsevier](https://dev.elsevier.com/tecdoc_api_authentication.html).
- [Web of Science Starter API](https://developer.clarivate.com/apis/wos-starter).
- [ACM Digital Library](https://dl.acm.org/) y búsqueda de metadatos ACM mediante [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/).
- [Ayuda de Google Académico](https://scholar.google.com/intl/us/scholar/help.html) y [Google Scholar API de SerpApi](https://serpapi.com/google-scholar-api).
- [PDF.js](https://mozilla.github.io/pdf.js/).

## Mendeley local connector

`campus_mendeley_list` reads the connected user's private library.
`campus_mendeley_list_groups` lists groups available to that user, and
`campus_mendeley_list_group_documents` reads one selected group.
`campus_mendeley_save_doi` verifies exact Crossref metadata, scans every page in
the selected destination for the DOI, and saves one reference either privately
or in a writable group selected with `groupId`. It preserves separate author
names, publication type, year, DOI and source. It does not certify peer review,
upload PDFs, scrape Mendeley, or redistribute publisher content.
`campus_mendeley_save_reference` saves user-supplied metadata for a source without
a confirmed DOI. It requires the exact title and HTTPS article URL, accepts
optional publication details, scans the full destination for the same URL, and
can target a writable group with `groupId`. It does not fetch article metadata
or infer a DOI.

Register a Mendeley application at https://dev.mendeley.com/myapps.html with
`http://localhost:8765/mendeley/callback`, then provide `MENDELEY_CLIENT_ID`,
`MENDELEY_CLIENT_SECRET`, and `MENDELEY_REDIRECT_URI` in a protected environment.
Run `campus-mendeley-connect --env-file=/path/to/private.env` and open
the displayed authorization URL. The loopback callback checks a random state,
exchanges the code server-side and stores tokens with mode 600 in
`~/.campus-cli/mendeley-tokens.json` (override with `MENDELEY_TOKEN_FILE`). Tokens
refresh automatically. Never paste tokens into an MCP argument or commit them.

The local MCP server registers both tools and keeps its existing session gate.
The exported `registerMendeleyTools` requires an authorization callback and a
`MendeleyService` bound to that user's token store. The hosted relay does **not**
use the founder's local library: hosted student access still needs its own OAuth
callback and per-user encrypted token store before this connector is offered
there. Duplicate saves are serialized within a service instance; different
processes writing simultaneously are not covered by that lock.

Official protocol: https://dev.mendeley.com/reference/topics/authorization_auth_code.html
and https://dev.mendeley.com/methods/#documents.

### Commercial boundary

Campus uses Mendeley as an optional user-authorized destination for bibliographic
metadata. It must remain complementary to Mendeley: do not reproduce its
reference-manager product, scrape the website, use Mendeley trademarks in
marketing without written permission, or upload article files unless the user
has the required copyright or licence. Use the registered Campus application,
keep one encrypted OAuth token set per user, and let each user explicitly select
the destination library or group. Recheck the current API agreement before
expanding the feature beyond this metadata-only workflow or changing how Campus
presents, stores, or redistributes Mendeley data.

Official terms: https://dev.mendeley.com/terms-and-conditions.html and
https://www.elsevier.com/legal/elsevier-mendeley-terms-and-conditions.

## Lectura de otros formatos

Usa `campus_research_read_document` para una página HTML del editor, texto, Markdown, XML/JATS, DOCX o EPUB público. La herramienta devuelve secciones con encabezado, texto y continuidad; en PDF delega al lector paginado. Indica `format=docx` o `format=epub` para archivos ZIP, ya que el formato automático no adivina un contenedor comprimido. Solo procesa URLs HTTPS públicas de hasta 20 MB; no utiliza cookies, no inicia sesión, no descarga contenido protegido y no sigue instrucciones contenidas en el documento. Cuando Campus no puede procesar una fuente dentro de sus límites seguros —por tamaño, tiempo, memoria, cifrado, daño o formato— devuelve `status=client_processing_required` y un `resource_link` de MCP hacia la URL original. El cliente compatible puede abrirla o procesarla directamente; Campus no conserva el archivo ni continúa procesándolo.

Algunas fichas públicas bloquean la lectura automática aunque el editor publique el PDF por otra ruta. Campus mantiene una lista acotada de rutas comprobadas: la ficha del *Future of Jobs Report 2025* se resuelve al PDF íntegro de WEF (`full_report`), y la ficha del artículo de `revistas.uh.cu/revflacso/article/view/7514` se resuelve a su PDF editorial de 14 páginas (`full_article`). Ambas rutas funcionan también con `campus_research_index_pdf`. La ficha de ISO/IEC 25010:2023 se resuelve solo al catálogo público de ISO (`public_catalog`), que no autoriza a atribuir contenido de la norma de pago. La respuesta identifica `resolvedUrl` y `accessScope`. Para otras páginas de `revistas.uh.cu` que informen un límite temporal mediante HTTP 403, Campus reconoce ese aviso y hace como máximo un reintento breve.

Si el servidor no puede obtener un PDF que el estudiante sí descargó, `campus_research_read_source_file` recibe el archivo adjunto mediante el parámetro MCP `source_file` (compatible con `openai/fileParams`) y devuelve texto con páginas, cobertura y SHA-256. Acepta hasta 20 MB y 20 páginas por llamada. La URL temporal del archivo y su ID no se devuelven ni se citan. `sourceUrl` es solo una atribución propuesta: el lector marca `sourceIdentityVerified=false` hasta comparar título, autores y datos editoriales dentro del PDF. Un enlace `downloadUrl` o `resource_link` no equivale a un archivo leído; los clientes sin entrada de archivos deben usar la lectura por URL o adjuntar el PDF en un host compatible.

Las búsquedas devuelven sus metadatos y, cuando existe una URL utilizable, bloques MCP `resource_link`. Los lectores también adjuntan el documento como `resource_link` cuando la extracción tiene éxito. Así la IA del cliente puede abrir y analizar la fuente directamente. Un enlace descubierto no prueba que el texto sea completo, accesible ni correcto.

Después del análisis del cliente, pasa cada fragmento a `campus_research_verify_evidence` con la misma URL, la página PDF o sección, y preferiblemente el `sha256` devuelto por el lector. Campus rechaza el fragmento si el documento cambió o si el texto no aparece en el localizador. Un resultado `verified` demuestra integridad textual, no que la interpretación del cliente sea válida; la respuesta debe conservar `evidenceId`, URL, SHA-256 y página/sección.

```json
{"url":"https://repositorio.example.edu/articulo.pdf","page":8,"format":"pdf","excerpt":"Fragmento seleccionado por la IA cliente","expectedSha256":"[sha256 devuelto por la lectura]"}
```
