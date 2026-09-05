# Catálogo verificable de casos APA 7

Este documento es el registro de cobertura de Campus. No reproduce el manual:
convierte cada caso en campos, decisiones y modelos verificables. Una categoría
no se considera cubierta hasta que tenga cita narrativa, cita parentética,
referencia, excepciones, datos obligatorios y pruebas.

## Fuentes y trazabilidad

- Manual consultado con licencia en eLibro UPC: *Manual de publicaciones de la
  American Psychological Association* (4.ª edición en español, 2020).
- El visor de eLibro presenta un desplazamiento observado de 23 páginas entre
  el número del lector y la página impresa; se conserva siempre la sección y la
  página impresa como referencia conceptual.
- Para Campus, la prioridad sigue siendo: consigna/rúbrica del curso, guía UPC,
  manual APA y, por último, esta síntesis.
- No se almacena el texto completo del libro ni sus ejemplos extensos.

## Estados

- `inventariado`: el caso y su ubicación se comprobaron en el índice.
- `regla verificada`: se leyeron las especificaciones aplicables.
- `probado`: existen casos válidos, incompletos y ambiguos en pruebas.
- `bloqueado`: no debe generarse una referencia definitiva sin otra autoridad.

## Regla transversal de citación

Salvo las excepciones verificadas para comunicaciones personales y materiales
jurídicos, el tipo de soporte no cambia el sistema autor-fecha:

- narrativa: `Autor (Año)`;
- parentética: `(Autor, Año)`;
- cita textual: añade un localizador real (`p.`, `pp.`, párrafo, sección o marca
  de tiempo);
- la referencia solo puede producirse con metadatos recuperados o aportados por
  la persona; los campos desconocidos nunca se inventan.

Cada caso del catálogo debe enlazar esta regla y declarar cualquier desviación.

## Capítulo 1: principios de escritura, publicación y ética

Las secciones 1.1-1.25, pp. 4-26, están verificadas e implementadas en
`src/providers/academic/apa7-principles-ethics-rules.ts`. Las primeras diez
reglas distinguen artículos cuantitativos, cualitativos, mixtos, de réplica,
metaanálisis, revisión, teoría, metodología, otros géneros y trabajos o tesis
estudiantiles. Las quince restantes cubren planificación ética, comunicación
de resultados, correcciones y retractaciones, datos, confidencialidad,
duplicación, plagio y autoplagio, participantes, conflictos, crédito, orden de
autoría, revisión confidencial y derechos sobre manuscritos inéditos.

Cada caso enlaza la conducta ética con la cita y la referencia. La herramienta
distingue reutilización transparente de datos, publicación duplicada,
autoplagio y plagio; una coincidencia textual no decide por sí sola ninguno de
ellos. También impide convertir participantes o manuscritos confidenciales en
referencias recuperables, atribuir autoría honoraria, ocultar conflictos o
certificar aprobación, consentimiento u originalidad sin evidencia.

## Capítulo 8: reglas de citación verificadas

Las secciones 8.1-8.20 se verificaron en las pp. 259-274 y se convirtieron en
21 reglas: nivel de citación; plagio; autoplagio; correspondencia texto-lista;
versión consultada; fuentes primarias/secundarias; entrevistas; aula/intranet;
comunicación personal; conocimiento tradicional indígena; autor-fecha;
parentética/narrativa; varias obras; partes específicas; autor desconocido;
fechas dobles; año narrativo repetido; número de autores; ambigüedad con
`et al.`; mismo autor-fecha; y apellidos iguales.

En 8.7-8.9 la clasificación determina el resultado: una entrevista publicada
usa la referencia de su medio; una entrevista irrecuperable se cita solo como
comunicación personal; una entrevista con participantes propios no lleva cita
APA ni referencia. Un recurso de Blackboard lleva referencia únicamente si el
público destinatario puede recuperarlo; en caso contrario se trata como
comunicación personal. El conocimiento tradicional indígena no registrado se
contextualiza según su procedencia y no se fuerza a una referencia inexistente.

Las secciones 8.21-8.36 se leyeron directamente en el manual, pp. 274-284.
Campus las expone como 16 reglas estructuradas mediante `citationRuleId`, cada
una con condiciones de uso, ejemplos mínimos, tratamiento en referencias y
motivos de abstención. La implementación vive en
`src/providers/academic/apa7-citation-rules.ts`.

| Sección | Regla | Página impresa | Estado |
| --- | --- | ---: | --- |
| 8.21 | Abreviaturas de autores grupales | 274 | regla verificada y probada |
| 8.22 | Menciones generales de sitios, publicaciones y software común | 274-275 | regla verificada y probada |
| 8.23 | Principios del parafraseo | 275 | regla verificada y probada |
| 8.24 | Paráfrasis largas | 275-276 | regla verificada y probada |
| 8.25 | Principios de citas directas | 276-277 | regla verificada y probada |
| 8.26 | Citas cortas | 277 | regla verificada y probada |
| 8.27 | Citas en bloque | 277-279 | regla verificada y probada |
| 8.28 | Material sin números de página | 279-280 | regla verificada y probada |
| 8.29 | Precisión de las citas | 280 | regla verificada y probada |
| 8.30 | Modificaciones sin explicación | 280-281 | regla verificada y probada |
| 8.31 | Modificaciones que requieren explicación | 281-282 | regla verificada y probada |
| 8.32 | Citas que contienen otras referencias | 282-283 | regla verificada y probada |
| 8.33 | Material ya entrecomillado | 283 | regla verificada y probada |
| 8.34 | Permiso para citas largas | 283 | regla verificada y probada |
| 8.35 | Epígrafes | 283-284 | regla verificada y probada |
| 8.36 | Citas de participantes de investigación | 284 | regla verificada y probada |

Controles principales: no inventar localizadores; distinguir menos de 40 de 40
palabras o más; no convertir participantes propios en comunicaciones
personales; no añadir a referencias las fuentes internas de una cita que no se
consultaron; y no asumir que una cita APA concede permiso de reproducción.

## Capítulo 9: principios de la lista de referencias

Las secciones 9.1-9.6, pp. 287-291, están verificadas e implementadas en
`src/providers/academic/apa7-reference-rules.ts`. Cubren la selección de
categoría, la categoría web como último recurso, la equivalencia general entre
soportes en línea e impresos, los cuatro elementos y todas sus combinaciones de
datos faltantes, puntuación, y control de precisión/consistencia.

Hallazgos operativos: “estar en una web” no convierte un informe, artículo,
libro o conjunto de datos en página web; una referencia generalmente responde
quién, cuándo, qué y dónde; sin autor manda el título, sin fecha se usa `s. f.`,
sin título se describe la obra entre corchetes, y sin fuente recuperable se
aplica comunicación personal o se busca otra obra. No se coloca punto después
de DOI o URL y ningún generador automático sustituye la verificación contra la
obra original.

Las secciones 9.7-9.22, pp. 291-298, también están verificadas e implementadas.
Cubren definición y formato de autor; ortografía; roles; grupos; ausencia de
autor; definición, formato, actualización, recuperación y ausencia de fecha;
y definición, formato, series, descripciones y ausencia de título. Cada regla
incluye el impacto correspondiente en la cita en el texto.

Las secciones 9.23-9.37, pp. 299-306, están verificadas e implementadas. Cubren
definición y formato de fuente; publicaciones periódicas y datos faltantes;
números de artículo; capítulos editados; editoriales; bases/archivos;
ubicaciones; redes sociales; sitios web; decisión y formato de DOI/URL;
acortadores; y obras sin fuente recuperable.

Reglas críticas: DOI prevalece sobre URL; una copia impresa conserva el DOI si
la obra lo tiene; bases académicas comunes se omiten; bases exclusivas o de
circulación limitada sí pueden incluirse; las URL privadas o ligadas a sesión
se sustituyen por una página pública de acceso; y una obra irrecuperable no
genera una referencia ficticia.

Las secciones 9.38-9.52, pp. 307-313, están verificadas e implementadas.
Cubren obras en otros idiomas, traducciones, reimpresiones, reediciones,
obras religiosas y clásicas; formato y orden completo de la lista;
abreviaturas; bibliografías anotadas; y la excepción para estudios incluidos en
un metaanálisis. El capítulo 9 queda cubierto por 52 reglas verificadas, cada una
con efecto explícito sobre la cita y guardas contra datos inventados.

## Capítulo 2: elementos y formato del escrito

Las secciones 2.1-2.28, pp. 29-49, están verificadas e implementadas en
`src/providers/academic/apa7-format-rules.ts`. Distinguen los elementos
obligatorios de escritos profesionales y estudiantiles; las dos versiones de la
página de título; título, pie de autor, afiliación, nota del autor, título
abreviado, resumen, palabras clave, cuerpo, lista de referencias, notas al pie,
apéndices y materiales suplementarios. Cada regla explica además si afecta —o
no— las citas y referencias, y mantiene como primera autoridad la consigna o
plantilla del curso.

También cubren el orden de páginas, cornisa, tipografías permitidas, caracteres
especiales, interlineado, márgenes, alineación, sangrías, extensión,
organización, los cinco niveles exactos de encabezado y las etiquetas de
sección. El capítulo 2 queda cubierto por 28 reglas verificadas.

## Capítulo 3: estándares de presentación de investigaciones (JARS)

Las secciones 3.1-3.18, pp. 72-108, están verificadas e implementadas en
`src/providers/academic/apa7-reporting-rules.ts`. Cubren principios y
terminología JARS; resumen e introducción; expectativas, método, resultados y
discusión de investigación cuantitativa; módulos para diseños experimentales,
no experimentales y especiales; análisis especializados y metaanálisis
cuantitativo; expectativas, método, hallazgos, discusión y metasíntesis
cualitativa; y estudios de métodos mixtos.

Cada regla declara a qué diseño se aplica y separa tres obligaciones: qué debe
reportarse del estudio, qué materiales externos deben citarse y qué obras deben
aparecer en referencias. Los resultados y entrevistas del estudio propio no
reciben una referencia bibliográfica ficticia; instrumentos, métodos,
protocolos, conjuntos de datos, software y literatura ajenos sí conservan la
cita y referencia de su tipo real. Los JARS no prueban por sí solos que el
estudio esté bien diseñado o ejecutado y Campus nunca completa muestra,
procedimientos, análisis o resultados no documentados.

La verificación se contrastó con el capítulo 3 del manual y con los informes
abiertos oficiales de APA de 2018 para JARS-Quant y JARS-Qual/Mixed. Las
actualizaciones posteriores, como JARS-REC, deben etiquetarse como estándares
oficiales posteriores al manual de 2019 y no mezclarse silenciosamente con la
edición séptima.

## Capítulo 4: estilo de escritura y gramática en español

Las secciones 4.1-4.28, pp. 111-128, están verificadas e implementadas en
`src/providers/academic/apa7-writing-style-rules.ts`. Cubren continuidad,
transiciones, concisión, redundancia, longitud de oraciones y párrafos, tono,
coloquialismos, jerga, comparaciones lógicas y antropomorfismo; tiempos, voz y
modo verbales; concordancia; pronombres; subordinación; modificadores;
paralelismo; y las seis estrategias de preparación y revisión de borradores.

Esta parte usa expresamente la adaptación al español del manual. Campus no
traslada de forma automática una regla gramatical inglesa al español y remite a
una autoridad lingüística confiable cuando el capítulo no resuelve la duda.
Todas las reglas conservan significado, certeza y atribución: mejorar el estilo
no permite eliminar una cita, alterar el alcance de la fuente ni inventar una
referencia. La asistencia de correctores, compañeros o herramientas se somete
además a la política de integridad académica del curso.

## Capítulo 5: lenguaje libre de sesgo

Las secciones 5.1-5.10, pp. 132-150, están verificadas e implementadas en
`src/providers/academic/apa7-bias-free-language-rules.ts`. Cubren nivel de
especificidad, sensibilidad frente a etiquetas, edad, discapacidad, sexo y
género, participación en investigación, identidad racial y étnica, orientación
sexual, nivel socioeconómico e interseccionalidad.

Cada regla impide inferir identidades a partir de nombres, imágenes, idioma,
nacionalidad, apariencia o estereotipos y prioriza la autoidentificación y el
contexto. Campus distingue los datos de participantes —que normalmente no
generan citas ni referencias— de las definiciones, taxonomías, instrumentos y
afirmaciones externas, que sí deben citarse y aparecer en referencias. También
evita exponer características sensibles cuando no sean relevantes o puedan
permitir reidentificación.

## Capítulo 6: mecánica del estilo

Las secciones 6.1-6.52, pp. 153-198, están verificadas e implementadas en
`src/providers/academic/apa7-mechanics-rules.ts`. Se modeló individualmente
cada regla de puntuación, ortografía y guion; mayúsculas; cursiva;
abreviaturas; números; copia estadística y matemática; ecuaciones; y listas.

El tratamiento bibliográfico está integrado en cada caso: las reglas de punto,
coma, paréntesis, corchetes, comillas, cursiva, abreviaturas y números no pueden
alterar autores, fechas, localizadores, títulos, DOI o URL. También se distingue
entre un resultado estadístico propio y un método, fórmula, software o conjunto
de datos externo que sí necesita cita y referencia. En listas, una cita al final
de un elemento no se extiende automáticamente a toda la lista.

## Capítulo 7: tablas y figuras

Las secciones 7.1-7.21, pp. 201-230, están verificadas e implementadas en
`src/providers/academic/apa7-table-figure-rules.ts`. Cubren propósito, diseño,
elección entre texto y presentación gráfica, estructura común, llamados en el
texto, ubicación y el tratamiento de material reproducido o adaptado. Cada
regla separa expresamente: mención o cita, entrada en referencias y permiso de
derechos de autor. Una visualización propia no requiere fuente externa; una
reproducida o adaptada exige atribución y referencia, y puede necesitar además
autorización.

También cubren construcción y componentes de tablas; número, título,
encabezados, cuerpo, los tres tipos de notas, abreviaturas, intervalos de
confianza, bordes, sombreado, tablas largas o anchas, consistencia entre tablas
y la lista de verificación final. Las citas dentro de celdas o notas remiten a
la lista general de referencias, mientras que la nota general aloja la
atribución de una tabla reproducida o adaptada.

La sección 7.21 registra los tipos de tablas de muestra como decisiones por
propósito: datos demográficos, propiedades de variables, metaanálisis, diseños
complejos, descriptivos, chi-cuadrada, pruebas t, comparaciones, correlaciones,
ANOVA, análisis factorial, regresión, comparación de modelos, análisis
cualitativo y métodos mixtos. Campus no copia las tablas del manual: conserva
sus criterios y genera ejemplos nuevos con datos del estudiante.

Las secciones 7.22-7.36, pp. 231-256, completan las figuras: principios,
componentes, número, título, imagen, leyenda, notas, relación entre figuras,
fotografías y visualizaciones electrofisiológicas, radiológicas y genéticas.
También incluyen la lista de verificación y los modelos de gráficas, diagramas,
dibujos, mapas, plots, fotografías, paneles y datos biológicos. El capítulo 7
queda cubierto por 36 reglas verificadas.

Controles críticos añadidos: las figuras no dependen solo del color; su texto
interno usa tipografía sans serif legible normalmente entre 8 y 14 puntos; las
alteraciones sustanciales de una fotografía se declaran; y el consentimiento de
una persona identificable se comprueba por separado de los derechos de autor de
la fotografía. Campus conserva criterios y genera ejemplos propios, sin copiar
las imágenes del manual.

## Inventario del capítulo 10: ejemplos de referencias

| Sección | Grupo verificado en el índice | Página impresa | Estado | Citación | Referencia |
| --- | --- | ---: | --- | --- | --- |
| 10.1 | Publicaciones periódicas | 322 | regla verificada | autor-fecha; excepciones documentadas abajo | plantilla y 19 subcasos verificados |
| 10.2 | Libros y obras de consulta | 327 | regla verificada | autor/editor-fecha; excepciones verificadas | plantilla y 18 subcasos verificados |
| 10.3 | Capítulos de libros editados y entradas en obras de consulta | 332 | regla verificada | autor del capítulo/entrada; excepciones documentadas abajo | plantilla y 12 subcasos verificados |
| 10.4 | Informes y literatura gris | 335 | regla verificada | autor personal/grupal; excepciones verificadas | plantilla y 10 subcasos verificados |
| 10.5 | Sesiones y presentaciones de congresos | 338 | regla verificada | autor-fecha; fecha completa en referencia | plantilla y 4 subcasos verificados |
| 10.6 | Disertaciones y tesis | 339 | regla verificada | autor-fecha | plantilla y 3 subcasos verificados |
| 10.7 | Reseñas | 340 | regla verificada | autor de la reseña-fecha | plantilla y 3 subcasos verificados |
| 10.8 | Obras inéditas y obras publicadas informalmente | 341 | regla verificada | autor-fecha; estado documentado | plantilla y 5 subcasos verificados |
| 10.9 | Conjuntos de datos | 343 | regla verificada | autor/entidad-fecha o años de recolección | plantilla y 2 subcasos verificados |
| 10.10 | Software, aplicaciones móviles, aparatos y equipos | 344 | regla verificada | autor/entidad-fecha de versión | plantilla y 4 subcasos verificados |
| 10.11 | Pruebas, escalas e inventarios | 346 | regla verificada | autor/entidad-fecha | plantilla y 3 subcasos verificados |
| 10.12 | Obras audiovisuales | 348 | regla verificada | autor según rol del medio | plantilla y 7 subcasos verificados |
| 10.13 | Obras de audio | 350 | regla verificada | compositor/artista/anfitrión/entrevistado/orador | plantilla y 6 subcasos verificados |
| 10.14 | Obras visuales | 352 | regla verificada | artista/fotógrafo/autor-fecha | plantilla y 6 subcasos verificados |
| 10.15 | Redes sociales | 354 | regla verificada | titular de cuenta-fecha o s. f. | plantilla y 7 subcasos verificados |
| 10.16 | Páginas y sitios web | 356 | regla verificada | autor personal/grupal-fecha | plantilla y 5 subcasos verificados |

El capítulo también anuncia variaciones transversales en autor (p. 320), fecha
(p. 321), título (p. 321) y fuente (p. 322). Deben verificarse antes de cerrar
cualquier plantilla.

### 10.1 Publicaciones periódicas - regla verificada

Fuentes contrastadas: manual, pp. 322-326, y guía vigente de Biblioteca UPC,
sección "Artículos de revistas y periódicos". Si falta volumen, número, edición
o páginas, se omite el elemento; no se reemplaza con texto inventado.

Plantilla base de referencia:

`Autor, A. A., & Autor, B. B. (Fecha). Título del artículo. *Título de la publicación, volumen*(número), páginas o Artículo eLocator. DOI o URL`

Cita base: narrativa `Autor y Autor (Año)`; parentética
`(Autor & Autor, Año)`; con tres o más autores, `Autor et al. (Año)` o
`(Autor et al., Año)`.

| Caso del manual | Especificación de referencia | Particularidad de la cita |
| ---: | --- | --- |
| 1. Artículo científico con DOI | Plantilla base con DOI como `https://doi.org/...` | Cita base |
| 2. Artículo sin DOI con URL ajena a una base de datos | Termina con la URL recuperable del artículo | Cita base |
| 3. Artículo sin DOI procedente de la mayoría de bases académicas o impreso | Omite nombre de base y URL | Cita base |
| 4. Artículo con 21 o más autores | En referencias: primeros 19 autores, puntos suspensivos y último autor | En texto: primer autor + `et al.` |
| 5. Autores personales y grupales combinados | Conserva el nombre del grupo exactamente como aparece en la fuente | En texto aplica la regla por número de autores |
| 6. Artículo con número de artículo/eLocator | Sustituye páginas por `Artículo e...`; "Artículo" inicia con mayúscula | Cita base |
| 7. Publicación anticipada en línea | Añade `Publicación anticipada en línea` antes del DOI; se debe preferir luego la versión publicada | Cita base |
| 8. Artículo en prensa | Usa `(en prensa)` como fecha y no inventa volumen, número ni páginas aún inexistentes | `(Autor, en prensa)` / `Autor (en prensa)` |
| 9. Artículo en otro idioma | Mantiene título original y añade traducción entre corchetes cuando el idioma difiere del trabajo | Cita base |
| 10. Artículo reeditado en traducción | Identifica traductores y año original; añade nota de publicación original | Usa años `original/reedición` |
| 11. Artículo reimpreso de otra fuente | Registra la versión usada y, entre paréntesis, los datos de la publicación original | Usa años `original/reimpresión` |
| 12. Sección o edición especial | Editores en posición de autor; añade `[Sección especial]` o `[Edición especial]`; páginas solo para sección, no para edición completa | Cita por editor(es) |
| 13. Artículo de Cochrane | Se trata como artículo de publicación periódica y conserva su DOI | Cita base |
| 14. Artículo de UpToDate | Usa año de última actualización y fecha de recuperación porque cambia y no archiva versiones | Cita autor-año de actualización |
| 15. Artículo de revista no científica/magazine | Fecha disponible (año, mes o fecha completa), revista, volumen/número/páginas si existen y DOI/URL | Cita base con año |
| 16. Artículo de periódico | Fecha completa; periódico en cursiva; página para impreso o URL para la edición en línea | Cita base con año |
| 17. Entrada de blog | Fecha completa, título de entrada, nombre del blog y URL | Cita base con año |
| 18. Comentario en una publicación periódica en línea | Autor real o usuario; fecha; título o primeras 20 palabras; descripción entre corchetes que identifica el artículo; publicación y URL | Se cita el nombre o usuario del comentarista |
| 19. Editorial | Usa el formato de la publicación donde apareció y añade `[Editorial]` tras el título, salvo que la palabra ya esté en el título | Si está firmado, autor-fecha; si no, el título ocupa la posición de autor y gobierna la cita |

Controles anti-alucinación de 10.1:

- no convertir automáticamente un sitio de noticias en periódico: los sitios de
  noticias se resuelven como página web (caso 10.16);
- no añadir una base de datos académica ni su URL a artículos que funcionan como
  publicaciones periódicas normales;
- no fabricar DOI, volumen, número, páginas, eLocator ni fecha de recuperación;
- solo usar fecha de recuperación cuando el contenido está diseñado para cambiar
  y no existe una versión archivada estable.

### 10.2 Libros y obras de consulta - regla verificada

Fuentes contrastadas: manual, pp. 327-331, y guía vigente de Biblioteca UPC,
secciones "Libros" y "Obras de referencia". Se verificaron los ejemplos 20-37.
La implementación detallada vive en `src/providers/academic/apa7-book-cases.ts`.

Plantilla base:

`Autor, A. A. (Año). *Título del libro* (edición o volumen). Editorial. DOI/URL`

Casos cubiertos: libro con DOI; libro impreso o de base académica sin DOI;
ebook/audiolibro con URL; editor acreditado; libros editados; varias
editoriales; otro idioma; traducción y reedición; volumen de obra multivolumen;
serie; DSM/CIE; diccionario, tesauro o enciclopedia; antología; obra religiosa;
obra griega/romana antigua; y Shakespeare.

Controles anti-alucinación de 10.2:

- edición solo desde la segunda y únicamente si aparece en la obra;
- todas las editoriales se conservan en orden y se separan con punto y coma;
- si autor y editorial son iguales, se omite la editorial;
- no se añade plataforma/dispositivo a un ebook cuando el contenido coincide;
- no se añade base de datos ni URL a un libro común recuperado desde una base;
- reediciones, traducciones y clásicos exigen ambos años antes de usar
  `original/reedición` en la cita;
- fecha de recuperación solo para obras que cambian y no archivan versiones;
- títulos de series conceptualmente relacionadas no se agregan a la referencia.

### 10.3 Capítulos y entradas en obras de consulta - regla verificada

Fuente contrastada: manual, pp. 332-335, ejemplos 38-49. La implementación
detallada vive en `src/providers/academic/apa7-chapter-entry-cases.ts`.

Plantilla base:

`Autor del capítulo, A. A. (Año). Título del capítulo. En E. Editor (Ed.), *Título del libro* (edición, pp. xx-xx). Editorial. DOI/URL`

Casos cubiertos: capítulo con DOI; capítulo impreso o de base académica sin DOI;
capítulo electrónico con URL pública; capítulo en otro idioma; traducción y
reedición; reimpresión desde revista; reimpresión desde otro libro; capítulo de
obra multivolumen; obra incluida en antología; entrada de diccionario o
enciclopedia con autor grupal; entrada con autor individual; y Wikipedia.

Controles anti-alucinación de 10.3:

- el autor del capítulo o entrada gobierna la cita, no el editor del contenedor;
- no se añaden base de datos ni URL a capítulos comunes recuperados desde una
  base académica;
- traducciones, reediciones y reimpresiones exigen las fechas y procedencias de
  ambas versiones;
- una entrada dinámica sin archivo usa `s. f.` y fecha de recuperación; una
  versión estable o archivada no;
- Wikipedia debe citar la revisión archivada consultada; si no existe enlace
  permanente, se usa la URL actual con fecha de recuperación;
- no se inventan editores, páginas, edición, volumen, DOI ni URL.

### 10.4 Informes y literatura gris - regla verificada

Fuente: manual, pp. 335-337, ejemplos 50-59. Casos cubiertos: reporte de
agencia; reporte de autores individuales; reporte en serie; grupo de trabajo;
reporte anual; código de ética; subvención; informe temático; informe de
políticas; y comunicado de prensa.

Controles: autor y editorial iguales no se duplican; los organismos superiores
solo se incluyen como fuente si no están contenidos en el autor; números de
reporte/proyecto no se inventan; los tipos documentales se describen entre
corchetes cuando corresponda. Una solicitud de subvención no recuperable se
menciona en metodología, pero no se agrega a referencias.

### 10.5 Sesiones y presentaciones de congresos - regla verificada

Fuente: manual, pp. 338-339, ejemplos 60-63. Casos cubiertos: sesión,
presentación de escrito, cartel y contribución en simposio. Se incluyen todos
los contribuyentes acreditados, las fechas del congreso completo, el tipo entre
corchetes, el nombre y la ubicación del evento. Las actas publicadas formalmente
usan el formato de artículo, libro editado o capítulo que corresponda.

### 10.6 Disertaciones y tesis - regla verificada

Fuente: manual, pp. 339-340, ejemplos 64-66. Casos cubiertos: obra inédita,
obra publicada en base de datos y obra publicada en repositorio/archivo fuera
de una base. En inéditas, la universidad es la fuente; en publicadas, la
institución forma parte de la descripción entre corchetes. Base de datos,
repositorio, número de publicación y URL solo se incluyen cuando existen.

### 10.7 Reseñas - regla verificada

Fuente: manual, pp. 340-341, ejemplos 67-69. Casos cubiertos: reseña de
película en revista científica, reseña de libro en periódico y reseña de
episodio televisivo en sitio web. La publicación que contiene la reseña define
el formato exterior; entre corchetes se identifica la obra reseñada y sus
responsables. La cita corresponde al autor de la reseña, no al creador de la
obra reseñada.

### 10.8 Obras inéditas y publicadas informalmente - regla verificada

Fuente: manual, pp. 341-343, ejemplos 70-74. Casos cubiertos: manuscrito
inédito, en preparación, presentado para publicación, preprint/repositorio y
ERIC. El año es el de terminación o redacción del borrador; el estado se coloca
entre corchetes después del título, nunca como fecha. No se menciona la revista
a la que se envió un manuscrito. Si está disponible públicamente, se trata como
publicación informal; si se publica formalmente, se debe actualizar a la versión
final.

### 10.9 Conjuntos de datos - regla verificada

Fuente: manual, pp. 343-344, ejemplos 75-76. Se distinguen conjuntos
publicados y datos brutos inéditos. Para publicados se usa el año de publicación;
para inéditos, el año o rango de recolección. Versión, identificador, archivo,
fuente institucional, DOI y URL solo se agregan si existen. Una fecha de
recuperación se reserva para conjuntos diseñados para cambiar.

### 10.10 Software, aplicaciones, aparatos y equipos - regla verificada

Fuente: manual, pp. 344-346, ejemplos 77-80. Casos cubiertos: software,
aparato/equipo, aplicación móvil y entrada dentro de una aplicación. Software
de uso común no requiere referencia: se menciona nombre y versión en el texto
si es relevante. El software especializado, limitado o citado sí lleva
referencia. Versión, modelo, descripción, desarrollador/tienda y URL deben
corresponder exactamente a la versión utilizada.

### 10.11 Pruebas, escalas e inventarios - regla verificada

Fuente: manual, pp. 346-347, ejemplos 81-83. Se prioriza el manual u otra
literatura de apoyo. La prueba misma se referencia solo cuando no existe esa
literatura. Un registro de base de datos se cita únicamente si se utilizó su
información descriptiva o administrativa única; el mero acceso desde una base
no justifica añadirla a la referencia.

### 10.12 Obras audiovisuales - regla verificada

Fuente: manual, pp. 347-350, ejemplos 84-90. Casos cubiertos: película/video,
película en otro idioma, serie completa, episodio/webisodio, charla TED,
webinar grabado y video en línea. La autoría depende del medio: director,
productor ejecutivo, guionista/director, orador o cuenta que subió el video.
Una cita textual audiovisual usa marca de tiempo. Reproducir una imagen o clip
puede exigir permiso o atribución de derechos además de la cita APA.

### 10.13 Obras de audio - regla verificada

Fuente: manual, pp. 350-352, ejemplos 91-96. Casos cubiertos: álbum, canción,
pódcast completo, episodio, entrevista radial archivada y grabación de discurso.
En música clásica se acredita al compositor y se conservan año original y año
de la versión; en música moderna, al artista de grabación. En pódcasts se
acredita al anfitrión (o productor ejecutivo, según la obra), en entrevistas
archivadas al entrevistado y en discursos al orador. Plataforma y URL se omiten
cuando no son necesarias o no se conocen.

### 10.14 Obras visuales - regla verificada

Fuente: manual, pp. 352-353, ejemplos 97-102. Casos cubiertos: obra de museo,
clip art/stock, infografía, mapa, fotografía y diapositivas/notas. Una obra sin
título se describe entre corchetes. Los mapas dinámicos llevan fecha de
recuperación. Citar una imagen no concede automáticamente permiso para
reproducirla; los derechos se verifican por separado.

### 10.15 Redes sociales - regla verificada

Fuente: manual, pp. 354-356, ejemplos 103-109. Casos cubiertos: tweet, perfil,
publicación y página de Facebook, foto/video e historia destacada de Instagram,
y publicación en foro. Se conserva el contenido original hasta 20 palabras,
incluidos hashtags, enlaces y emojis, y se describe el medio entre corchetes.
Perfiles e historias destacadas cambiantes usan `s. f.` y fecha de recuperación.
Solo se cita el contenido original de la red; si la red fue únicamente el medio
para descubrir otra obra, se cita esa obra directamente.

### 10.16 Páginas y sitios web - regla verificada

Fuente: manual, pp. 356-358, ejemplos 110-114. Casos cubiertos: sitio de
noticias, autor grupal, autor individual, sin fecha y con fecha de recuperación.
Esta categoría se usa solo cuando ninguna categoría más específica corresponde.
Un sitio completo mencionado de manera general se identifica en el texto con su
URL, sin referencia. Si autor y sitio coinciden, el sitio se omite. La fecha de
recuperación se limita a páginas diseñadas para cambiar y sin versión archivada.

## Inventario jurídico del capítulo 11

Las secciones 11.1-11.12, pp. 361-377, están leídas e implementadas en
`src/providers/academic/apa7-legal-rules.ts`. Cubren la diferencia entre APA y
citación jurídica; formato general; cita en el texto; fallos; leyes y decretos;
material legislativo; material administrativo y ejecutivo; patentes;
constituciones y cartas; tratados; y los perfiles particulares de México y
Colombia. El catálogo conserva 12 reglas y no presenta los ejemplos de un país
como un estándar universal.

Hallazgos transversales: una referencia jurídica suele ordenar título,
fuente/identificador y fecha, y la cita en el texto usa normalmente título y
año. Se conservan citaciones paralelas e historia procesal cuando existen; el
año corresponde a la versión realmente consultada; un proyecto no se presenta
como ley; y una autoridad derogada, anulada o modificada no se trata como
vigente sin verificación.

Para Perú, `src/providers/academic/apa7-peru-legal-cases.ts` implementa 10
perfiles con campos obligatorios, cita narrativa, cita parentética, localizador
de cita textual, referencia, fuentes oficiales y motivos de abstención:

1. mención general de la Constitución;
2. artículo de la Constitución;
3. ley u otra norma con rango de ley;
4. reglamento o norma del Poder Ejecutivo;
5. proyecto de ley;
6. sentencia o resolución del Tribunal Constitucional;
7. sentencia, casación o resolución del Poder Judicial;
8. resolución o precedente administrativo;
9. patente; y
10. tratado o convención aplicable al Perú.

Estado para Campus Perú: `adaptación con fuente verificada`. Esto significa que
el patrón combina las reglas generales del capítulo 11 con metadatos oficiales
peruanos, pero no se presenta como un supuesto manual oficial peruano de APA.
Las fuentes de verificación son el Archivo Digital de la Legislación del
Congreso, el Diario Oficial El Peruano/SPIJ, el Tribunal Constitucional, el
Poder Judicial, Gob.pe por entidad, la Gaceta Electrónica de Propiedad
Industrial de Indecopi y el Archivo Nacional de Tratados de Cancillería. Ante
una rúbrica jurídica o institucional distinta, esa rúbrica prevalece.

## Capítulo 12: proceso de publicación, derechos y permisos

Las secciones 12.1-12.24, pp. 381-406, están verificadas e implementadas en
`src/providers/academic/apa7-publication-rules.ts`. Cubren adaptación de tesis,
selección y evaluación de revistas, proceso editorial y revisión por pares,
preparación y envío, correspondencia y certificaciones éticas; reproducción y
adaptación, estado de derechos, permiso, uso justo y formatos de atribución; y
pruebas de galera, derechos de la versión publicada, depósito abierto,
correcciones, difusión y promoción.

Cada regla separa cuatro planos: contenido editorial, cita, referencia y
permiso. La cita y la referencia no conceden derechos; una nota de atribución
no reemplaza la referencia; y una licencia o permiso no elimina la obligación
académica de atribuir. El “fair use” del manual se etiqueta como doctrina de
Estados Unidos y no se traslada por analogía a Perú. Campus exige verificar la
jurisdicción, titular, versión, licencia, política editorial y autorización
antes de concluir que un material puede reutilizarse o compartirse.

## Condición de finalización

La cobertura completa exige, para cada subcaso del capítulo 10 y cada caso
peruano admitido:

1. campos obligatorios, opcionales y prohibidos;
2. decisión cuando falta autor, fecha, título o fuente;
3. cita narrativa, parentética y textual cuando corresponda;
4. referencia con cursivas, puntuación y DOI/URL definidos;
5. referencia a sección y página de la fuente;
6. pruebas de un caso válido, uno incompleto y uno ambiguo;
7. respuesta de abstención cuando la evidencia no alcanza.
