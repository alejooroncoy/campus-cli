# Investigación académica con Campus

Las herramientas recuperan registros bibliográficos y evidencia de documentos reales. No certifican que una conclusión sea verdadera. **Existencia, indexación, revisión por pares y calidad metodológica son comprobaciones diferentes.** Un DOI registrado no demuestra las otras tres.

## Herramientas MCP

| Herramienta | Función |
|---|---|
| `campus_research_search` | Búsqueda paginada en Crossref, OpenAlex, ACM, IEEE Xplore, Scopus, Web of Science o ScienceDirect, con años, DOI, autores y procedencia. |
| `campus_research_search_databases` | Busca en IEEE Xplore, ACM, Scopus, Web of Science y ScienceDirect durante el período indicado por el estudiante. |
| `campus_research_google_scholar` | Búsqueda en Google Académico mediante SerpApi opcional; sin clave devuelve solo un enlace manual, identificado como tal. |
| `campus_research_verify_doi` | Consulta exacta en Crossref y comprobación de avisos de corrección/retractación relacionados con ese DOI. |
| `campus_research_read_pdf` | Texto de un PDF HTTPS público, separado por páginas, con URL final, fecha de lectura y SHA-256. |
| `campus_research_read_document` | Evidencia por secciones desde PDF, HTML, texto, Markdown, XML/JATS, DOCX o EPUB públicos. Los ZIP requieren indicar `docx` o `epub`. |

El servidor MCP local registra las cinco herramientas y exige una sesión Blackboard válida (`campus login`). Las credenciales Blackboard nunca se envían a los proveedores de investigación. Reinicia el servidor MCP después de compilar para que el cliente descubra las herramientas nuevas. No se añaden comandos CLI de investigación en esta versión.

## Configuración

Requiere Node.js **22.13.0 o posterior** para el lector PDF. Configura las variables en el entorno del proceso MCP, nunca en una conversación ni en el repositorio:

| Variable | Uso |
|---|---|
| `OPENALEX_API_KEY` | Opcional para OpenAlex; mejora el presupuesto de consultas según el plan del proveedor. |
| `IEEE_XPLORE_API_KEY` | Obligatoria para IEEE Xplore, emitida por IEEE Developer. |
| `WOS_API_KEY` | Obligatoria para Web of Science Starter API, emitida por Clarivate Developer Portal. |
| `ELSEVIER_API_KEY` | Clave recomendada para Scopus y ScienceDirect, emitida por Elsevier. |
| `SCOPUS_API_KEY` | Alias compatible para la clave Elsevier; también se acepta en ScienceDirect. |
| `SCOPUS_INSTTOKEN` | Token institucional opcional de Elsevier, cuando corresponda. |
| `SERPAPI_API_KEY` | Habilita resultados de Google Académico mediante SerpApi, un tercero con su propio plan y cuota. |

Crossref no requiere clave. La búsqueda de publicaciones ACM tampoco requiere una clave adicional: consulta en Crossref únicamente los registros administrados bajo el prefijo DOI de ACM `10.1145` y construye el enlace correspondiente a ACM Digital Library. El resultado indica `discoveredVia=crossref_acm_prefix_10.1145`, porque no proviene del buscador interno de ACM.

Los permisos de IEEE, Web of Science, Scopus y ScienceDirect dependen de sus claves, planes y acceso institucional. Tener cuenta universitaria en Blackboard no concede acceso a estas API. Si faltan permisos, la herramienta informa el problema y no lo presenta como una búsqueda vacía. No crea cuentas, contrata planes ni evade controles de acceso.

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

Buscar en las cinco bases pedidas para los últimos tres años:

```json
{"query":"inteligencia artificial en educación superior","recentYears":3}
```

Usa `campus_research_search_databases`. `recentYears=3` consulta, en 2026, los años calendario 2024, 2025 y 2026. Si la consigna solicita un rango exacto, usa por ejemplo `yearFrom=2020` y `yearTo=2023`; ambos límites se incluyen. El estudiante debe indicar una de las dos modalidades y la herramienta rechaza períodos ausentes, incompletos o contradictorios. La respuesta conserva un bloque por proveedor con `status=ok` o `status=unavailable`, de modo que una clave faltante no oculta los resultados obtenidos en otras bases. Elimina duplicados por DOI antes de contar estudios.

También se puede consultar cada base con `campus_research_search` y uno de estos valores en `provider`:

- `ieee_xplore`: API oficial IEEE Xplore; requiere `IEEE_XPLORE_API_KEY`.
- `acm_dl`: publicaciones del prefijo ACM `10.1145` obtenidas mediante Crossref; no equivale a consultar directamente el buscador interno de ACM DL.
- `scopus`: Scopus Search API; requiere una clave Elsevier con acceso correspondiente.
- `web_of_science`: Web of Science Starter API, limitada a Core Collection (`db=WOS`); requiere `WOS_API_KEY`.
- `science_direct`: ScienceDirect Search API; requiere una clave Elsevier con acceso correspondiente.

En todos los proveedores, `peerReview=unknown` exige comprobar el tipo de documento y la política editorial. IEEE Xplore incluye, además de artículos, actas, libros, cursos y estándares; ACM incluye distintos tipos de publicaciones; ScienceDirect contiene artículos y capítulos. Estar presente en estas plataformas no demuestra por sí solo que el documento pasó revisión por pares.

Google Académico:

```json
{"query":"aprendizaje autorregulado","yearFrom":2020,"mode":"search","page":1}
```

Con `SERPAPI_API_KEY` configurada, devuelve candidatos de SerpApi identificados como `discovery_only`. Sin clave devuelve `mode=manual_search_link` y `resultsRetrieved=false`. `mode=link` solicita siempre el enlace sin consultar al proveedor. No se implementa scraping directo de Google ni se llama API oficial alguna de Google Académico.

Verificar un DOI recuperado de los resultados:

```json
{"doi":"10.1038/nphys1170"}
```

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
- [IEEE Xplore Metadata API](https://developer.ieee.org/docs/read/Searching_the_IEEE_Xplore_Metadata_API) y [filtros por año](https://developer.ieee.org/docs/read/metadata_api_details/Filtering_Parameters).
- [Web of Science Starter API](https://developer.clarivate.com/apis/wos-starter).
- [ScienceDirect Search API V2](https://dev.elsevier.com/documentation/SCIDIRSearchAPI.wadl).
- [ACM Digital Library](https://dl.acm.org/) y búsqueda de metadatos ACM mediante [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/).
- [Ayuda de Google Académico](https://scholar.google.com/intl/us/scholar/help.html) y [Google Scholar API de SerpApi](https://serpapi.com/google-scholar-api).
- [PDF.js](https://mozilla.github.io/pdf.js/).

## Mendeley local connector

`campus_mendeley_list` reads the connected user's library. `campus_mendeley_save_doi`
verifies exact Crossref metadata, scans all library pages for the DOI, and saves
one private reference. It preserves separate author names, publication type,
year, DOI and source. It does not certify peer review or upload PDFs.

Register a Mendeley application at https://dev.mendeley.com/myapps.html with
`http://localhost:8765/mendeley/callback`, then provide `MENDELEY_CLIENT_ID`,
`MENDELEY_CLIENT_SECRET`, and `MENDELEY_REDIRECT_URI` in a protected environment.
Run `node --env-file=/path/to/private.env scripts/mendeley-connect.cjs` and open
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

## Lectura de otros formatos

Usa `campus_research_read_document` para una página HTML del editor, texto, Markdown, XML/JATS, DOCX o EPUB público. La herramienta devuelve secciones con encabezado, texto y continuidad; en PDF delega al lector paginado. Indica `format=docx` o `format=epub` para archivos ZIP, ya que el formato automático no adivina un contenedor comprimido. Solo procesa URLs HTTPS públicas de hasta 20 MB; no utiliza cookies, no inicia sesión, no descarga contenido protegido y no sigue instrucciones contenidas en el documento. Si un PDF supera el límite, responde con un `resource_link` de MCP hacia la URL original para que el cliente lo abra o procese directamente, sin que Campus descargue ni analice su contenido.
