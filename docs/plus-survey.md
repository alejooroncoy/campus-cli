# Encuesta de activación de Plus

La encuesta `01a18cc9-dfcf-0000-9228-5fe27651e15d` se administra en
[PostHog Surveys](https://us.posthog.com/project/539784/surveys/01a18cc9-dfcf-0000-9228-5fe27651e15d).
Es de tipo API: Campus dibuja las preguntas con su estilo y PostHog conserva las respuestas.

## Entrega

- Solo en `/app/plus/`, estado `ready`, para una cuenta autenticada Free cuya audiencia
  verificada sea `customer`. No aparece para pruebas, internos, identidad sin clasificar,
  cuentas bloqueadas, pagos en curso o Plus activo.
- La app consulta la definición publicada y evalúa las flags de audiencia y de interacción
  de esa encuesta. Un borrador, una flag no habilitada o un fallo de red no muestra el bloque.
- La encuesta no se repite tras responder o cerrar: se informa al perfil de PostHog y
  se conserva además un marcador local asociado a la cuenta y la iteración.
- No carga la definición ni envía respuestas desde el desarrollo habitual en localhost.

## Prueba real en producción

`/app/plus/?survey_qa=1` permite una prueba con una cuenta autenticada Free cuya
audiencia del backend sea `test`. Usa exclusivamente la copia QA
`01a18d1a-1619-0000-4e77-51afff9780a6`, con sus propias preguntas, resultados y flags.
La flag QA debe estar habilitada y limitar `qa_account` a la identidad analítica exacta
de la cuenta de prueba. Esa identidad se obtiene de la sesión; no se toma de la URL.
El enlace no cambia el plan ni la clasificación de la cuenta. Clientes siguen usando
la encuesta pública, incluso si abren ese enlace. Internos y cuentas sin clasificar
no acceden a la copia QA. Sin el parámetro, las cuentas de prueba siguen excluidas.

Los eventos QA conservan `analytics_audience=test`, `is_test=true` y, al ejecutarse
en el sitio publicado, `environment=production`. No se mezclan con las respuestas
de la encuesta pública y los filtros del proyecto excluyen pruebas de análisis de
clientes. Detener la copia QA al terminar. La interfaz muestra una etiqueta QA
para distinguir la prueba; no hay interceptores ni sustitución de respuestas de sesión.

## Preguntas y respuestas

Admite una pregunta inicial de selección única y un comentario opcional posterior.
Se pueden editar textos y opciones desde PostHog conservando los IDs de las preguntas.
Otros tipos de pregunta o condiciones remotas no compatibles ocultan la encuesta en vez
de ignorar la configuración. El momento de entrega lo controla la pantalla de Plus.

Al elegir una opción se envía `survey sent` con `$survey_completed=false`; al terminar,
cerrar el comentario o continuar al pago se envía la respuesta final. Ambos eventos usan
el mismo `$survey_submission_id` y repiten las respuestas acumuladas, de modo que PostHog
los agrupe como una sola respuesta. Una navegación puede dejar solo la respuesta parcial;
la encuesta tiene habilitadas las respuestas parciales. El comentario se limita a 1000 caracteres.

Los únicos eventos permitidos son `survey shown`, `survey sent` y `survey dismissed`,
limitados a esta encuesta. Se eliminan otras propiedades y campos ajenos; el resto de la
analítica continúa sin admitir texto libre. La captura del SDK mantiene exclusivamente
los cambios de perfil aprobados (audiencia y estado de la encuesta).

## Publicación y verificación

La definición permanece en borrador mientras la integración se revisa en local.
Publicar el código mediante PR a main y el workflow protegido del sitio. Después lanzar
la encuesta desde PostHog para la audiencia revisada. Crear o lanzar la definición por sí
solo no despliega esta interfaz.

Verificar con `surveys-responses-list` y `survey-stats` que la primera respuesta real
corresponda a las preguntas correctas y que el comentario no genere otra respuesta.
Una prueba local intercepta todas las solicitudes y no demuestra recepción en PostHog.

Validación del código: `npm run check`, `npm run test:analytics`,
`npm run test:analytics:transport`, compilación del sitio y revisión móvil del bloque,
comentario, cierre, recarga y transición al pago. La regresión de Plus utiliza el servidor
aislado descrito en `campus-profes/docs/campus-plus-activation.md`.
El fixture actualizado está en [campus-profes #166](https://github.com/alejooroncoy/campus-profes/pull/166)
(commit `40f7b749a85439cdff3eadab5ccfc7c92a969b07`): incluye la declaración de universidad
y la redirección del login al perfil. Con ese fixture se completó la matriz de compra
de 390 y 1366 px, tanto en modo normal como QA, sin pagos reales.
