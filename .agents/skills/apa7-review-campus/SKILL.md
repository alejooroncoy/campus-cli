---
name: apa7-review-campus
description: Revisa citas, referencias y atribución de tablas o figuras en trabajos UPC con la guía oficial de Biblioteca UPC. Úsala cuando el estudiante pida revisar o corregir APA; distingue errores visibles de datos que requieren consultar la fuente.
---

# Revisión APA para Campus

Revisa el material que el estudiante proporcionó y entrega correcciones concretas,
conservando sus ideas. La autoridad es, en este orden: instrucciones explícitas del
docente o rúbrica; guía vigente de Biblioteca UPC; manual APA 7 para casos no
cubiertos. La fuente de entrada es [Citas — Biblioteca UPC](https://biblioteca.upc.edu.pe/citas-referencias-APA7/citas).

## Acceso desde el MCP

`campus_apa7_guidance({ "topic": "review" })` devuelve esta habilidad y
[las reglas revisadas de la UPC](references/upc-review-rules.json). El MCP entrega
instrucciones y evidencia; la IA cliente realiza la revisión del documento. La
respuesta de la herramienta por sí sola no significa que el trabajo fue leído.
Cuando esta habilidad ya llegó por esa llamada, úsala directamente.

Consulta en el archivo de reglas únicamente las secciones pertinentes. Para el
detalle de una sección usa `topic: "review", reviewSectionId: "figures"` (o un
ID de `reviewSkill.catalog`): devuelve reglas, `considerations.items`,
`considerations.warnings` y auditoría de bloques, notas, imágenes y enlaces.
Lee todas las indicaciones de `considerations.items` de las secciones pertinentes:
conservan esquemas, condiciones, alternativas y notas incrustadas, incluso cuando
no tienen ejemplo. No sustituyas esas indicaciones por los criterios resumidos ni
por una coincidencia con un modelo. [Las consideraciones y salvaguardas](references/upc-considerations.json)
separan pautas explícitas de advertencias condicionales sobre las discrepancias.
`semanticAudit` relaciona cada unidad y cada imagen con los
criterios que conserva; incluye criterios de otras secciones cuando una nota los
necesita. `relatedSectionIds` identifica las secciones relacionadas: recupera sus
consideraciones cuando el caso requiera ese detalle. Incluye los FAQ de citas y
referencias cuando revises autoría, ausencia de fecha o autor y casos especiales.
Usa esos criterios relacionados para no perder excepciones al consultar solo una
sección. [La matriz semántica](references/upc-semantic-coverage.json)
distingue contenido explícito, ejemplos, salvaguardas derivadas y apoyo normativo.
[El inventario de fuentes](references/upc-source-audit.json)
registra huellas y cobertura sin redistribuir los textos ni imágenes originales.
Para ampliar un caso no cubierto, pide al mismo MCP `topic: "reference"`
con `sourceType`, `caseId` o `referenceRuleId`; para una regla puntual de cita,
usa `topic: "citation"` con `citationRuleId`. Cada solicitud admite un solo
selector. Los modelos del manual son apoyo: si difieren de la convención UPC,
explica la adaptación institucional y aplica la prioridad indicada.

## Revisión

1. Identifica el texto, las referencias y la consigna disponibles. Si faltan,
   solicita solo el material necesario y revisa mientras tanto lo que sí existe.
   Para un trabajo de Blackboard, consulta los materiales y la rúbrica del curso.
2. Declara la cobertura: fragmento o documento completo, páginas leídas y elementos
   visuales inspeccionados. El texto extraído no demuestra márgenes, interlineado,
   sangría ni cursiva; marca esas propiedades como no verificables sin el formato.
3. Distingue cita textual, paráfrasis, traducción propia y contenido generado con
   IA. Comprueba autor, año, localizador cuando corresponda, puntuación, cantidad
   de autores y correspondencia con la lista de referencias. Cuenta solo las
   palabras del pasaje citado, excluyendo introducción y atribución. La traducción propia
   sigue las reglas de paráfrasis, no las de cita textual del original.
4. Comprueba referencias por su tipo real, no solo porque tengan URL. Verifica
   metadatos en la obra o registro editorial disponible. Aplica las excepciones:
   comunicaciones personales, participantes de investigación propia y fuente
   primaria no consultada en una cita secundaria no necesitan una entrada propia.
5. Para la UPC, escribe `s.f.` sin espacios; distingue obras sin fecha del mismo
   autor con `s.f.-a`, `s.f.-b`, coherentes en citas y referencias. Conserva el
   nombre institucional completo en referencias. No conviertas una sigla en
   autoría personal ni uses «Anónimo» si la obra no está firmada así.
6. En tablas y figuras distingue reproducción, adaptación, elaboración basada
   en fuentes y creación propia. Verifica la atribución correspondiente. No
   impongas la pauta de infografías de Arquitectura a otros programas.
   Revisa los paneles de figuras compuestas y sus fuentes por separado. Un mapa
   dinámico UPC usa descripción entre corchetes sin cursiva y recuperación.
7. Si no puedes comparar con la fuente, puedes corregir forma, pero no certificar
   la fidelidad de una paráfrasis o cita textual, el localizador, la existencia de
   la obra o sus metadatos. No inventes citas, DOI, fechas, páginas ni referencias.
   Si el texto visible de un enlace difiere de su destino, usa el `href` acreditado:
   no reconstruyas una URL desde una etiqueta truncada ni certifiques el destino
   sin comprobarlo. Una revisión APA no determina plagio ni el valor científico
   de una fuente.
8. Ante una discrepancia del ejemplo, aplica la regla y sus condiciones al trabajo.
   Los nombres, años, páginas y títulos ilustrativos no son respuestas esperadas.
   Una inconsistencia de metadatos permite señalar la duda, no elegir la variante
   más repetida. Comprueba el formato visible: espacios introducidos entre spans
   por un extractor no prueban una errata en la web. Distingue autores de una
   fuente y nombres de objetos representados antes de objetar la atribución.

## Resultado

Presenta los hallazgos con estos campos, en tabla si facilita la lectura:

- **Estado:** `cumple`, `corregir` o `no verificable`.
- **Ubicación y fragmento:** cita, entrada o tabla concreta del trabajo.
- **Corrección propuesta:** texto listo para copiar cuando los datos están
  comprobados; si faltan, señala qué dato confirmar sin completarlo por conjetura.
- **Regla y fuente:** sección y enlace oficial que justifican la decisión; indica
  si corresponde a la rúbrica, a una pauta UPC o al manual.

No afirmes cumplimiento global a partir de una muestra. Conserva las fechas de
consulta del archivo de reglas: son evidencia de una revisión anterior, no de
una consulta web en vivo. Ante una regla no cubierta o una posible actualización,
consulta la sección oficial correspondiente. No copies errores tipográficos de
los ejemplos ni conviertas una nota específica de un programa en regla general.
No envíes el trabajo a Blackboard como parte de esta revisión.

## Cobertura y discrepancias de la fuente

La captura revisada contiene 45 páginas UPC (31 APA y 14 jurídicas), 185 bloques,
1.105 unidades de texto, 82 etiquetas de pestañas/apartados y 14 imágenes
inspeccionadas. Su revisión por unidad se conserva en la matriz semántica, con
187 criterios y 24 discrepancias o ambigüedades registradas. Las unidades incluyen
ejemplos, esquemas y notas; no equivalen a 1.105 reglas independientes. Se
registran 98 enlaces de contenido. La guía colombiana complementaria se leyó
en sus 20 páginas, pero es otra jurisdicción: no sustituye los perfiles UPC.

Las consideraciones desarrollan 437 indicaciones en 399 unidades: 76 esquemas,
246 unidades de consideraciones, 16 notas incrustadas, 42 contextos/definiciones
y 19 remisiones normativas. Incluyen todas las 316 unidades clasificadas como
reglas en la matriz. Las otras 706 unidades tienen disposición no normativa:
ejemplos y sus datos concretos, encabezados, créditos y apoyos sin instrucciones.
Estos recuentos describen la captura, no reglas independientes ni pruebas de
comportamiento del agente.

Consulta `sourceIssues` y las salvaguardas de la sección antes de corregir: hay
contrastes de formato, inconsistencias internas y datos que necesitan el original.
Las 51 observaciones agrupadas se conservan como salvaguardas condicionales;
no equivalen a 51 errores confirmados. La separación aparente C/asación se
reclasificó como artefacto de extracción. Los ejemplos de la guía no permiten
certificar los metadatos de otra obra. Explica los
contrastes (incluida la capitalización UPC de REFERENCIAS) cuando sean relevantes.

La página APA sobre ChatGPT de 2023 está archivada. Las instrucciones de septiembre
de 2025 distinguen chat compartido de herramienta general y dejan de exigir versión
por defecto. Conserva la pauta UPC y el requisito del docente, y expón la
actualización; no declares incorrecto un formato sin indicar qué perfil aplicaste.
La autorización de IA depende del curso, no de que exista una referencia correcta.

Para referenciar esta guía sigue su modelo bibliográfico: noviembre de 2021, no
la fecha de actualización del sitio. Distingue los contrastes de cursiva en
simposios, de recuperación web y de los sufijos de mapas sin fecha; no resuelvas
una fuente ambigua inventando una condición universal.

El alcance solicitado es la guía UPC: `requestedScope: "upc-guide"`.
`allRequestedSourcesComplete` corresponde a la captura revisada de esas páginas,
notas e imágenes. Los libros, manuales y documentos externos enlazados son
apoyo; leerlos completos no es requisito para extraer la guía UPC. Sus pendientes
se registran aparte en `supportingPendingSourceIds` y no bloquean esta revisión.
No amplíes una extracción de la guía a una auditoría de todos los libros enlazados.
La cobertura guardada no certifica futuras modificaciones de la web ni la lectura
íntegra de los recursos externos.
