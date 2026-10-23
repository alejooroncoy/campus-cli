# Fichas de profesores y respuestas — 23 octubre 2026

Implementación local basada en las revisiones actuales de producción, sin desplegar ni escribir en la base remota.

## Diseño

Referencias consultadas en Mobbin:

- [Uxcel: reseñas con respuesta en contexto](https://mobbin.com/screens/21f0f0cb-7ba0-4111-89a7-ebee6bd4c3c0).
- [MasterClass: conversación debajo del comentario](https://mobbin.com/screens/02343b93-1887-419e-ae36-dcda84376c0a).

La ficha da prioridad a las reseñas de Campus, con una entrada visible para escribir y respuestas bajo cada reseña. La columna lateral contiene las puntuaciones externas compactas y los cursos. MisProfesores conserva sus comentarios, enlaces y paginación; su bloque se abre al llegar con un cursor. Cada fuente conserva su escala y media. La cabecera deja de flotar sobre el contenido en estas fichas.

## Respuestas

Las reseñas son los comentarios principales; las respuestas se agrupan un nivel debajo. No se responde a comentarios importados de otras plataformas. La lectura es pública y publicar requiere una cuenta con UPC confirmada. Se usa el moderador existente y se ocultan los hilos cuyo comentario principal deja de ser público. La API nunca devuelve la identidad de la cuenta. Un máximo de 10 respuestas por hora se aplica con bloqueo transaccional de la cuenta. Las claves de solicitud evitan duplicar un envío al reintentar.

El formulario conserva el borrador por reseña, mantiene el texto tras un error, muestra el estado de moderación y permite cargar conversaciones largas en páginas de 20 respuestas. OAuth vuelve a la ficha y a la reseña elegida.

## Backend y publicación pendiente

La implementación complementaria está en [campus-profes PR #123](https://github.com/alejooroncoy/campus-profes/pull/123):

- `sql/165_native_review_replies.sql`: nueva tabla, índices y clave de reintento.
- `src/app/review-replies.ts`: lectura pública, privacidad, moderación, límites y persistencia.
- `src/app/review-replies-http.ts`: GET/POST `/api/app/profes/reviews/:id/replies/`.
- Integración en `http.ts`, retorno OAuth y pruebas.

Para publicar, aplicar la migración y desplegar el backend antes del frontend. No se ha ejecutado ninguna migración remota ni desplegado estos cambios. No se modifica la puntuación ni el contenido de las reseñas existentes.

## Validación

- Compilación Astro y renderizadores de fichas: 15 pruebas aprobadas.
- Suite backend: 301 pruebas aprobadas; 13 pruebas de integración omitidas sin sus servicios configurados.
- Las pruebas nuevas de respuestas sí se ejecutaron con PostgreSQL local: paginación, cuentas de otra universidad, moderación, registros ocultos, reintentos, límites y errores HTTP.
- Navegador: 320, 375, 768, 1024 y 1440 px sin desbordamiento, envío en memoria, recarga, borrador tras error, lectura sin sesión y reintento de carga. Sin errores JavaScript.

## Reproducir

Desde `site/`:

```sh
npm ci
npm run build
node --test scripts/professor-pages.test.mjs
node scripts/review-replies.e2e.mjs
node scripts/preview-professor-conversations.mjs
```

La prueba E2E inicia su propio puerto temporal y cierra su servidor. La vista previa usa por defecto `http://127.0.0.1:4397/profes/upc/juan-carlos-morales-arevalo/`. Lee los perfiles públicos reales; las respuestas son datos de prueba en memoria con un aviso visible. Nunca reenvía escrituras a producción.

Las capturas y medidas quedan en `output/professor-conversations/`.

## Comentarios autorizados de ProfeMatch

El usuario indicó autorización expresa del creador para mostrarlos con enlace de origen. Se incorporó `public-profematch-comments.ts` al lector de fuentes ya vinculadas y verificadas del backend. Lee el endpoint público sin sesión que utiliza la propia web (`GET /api/profesores/:id`), valida ID y universidad y conserva la puntuación sobre 5 y las fechas de la fuente. Omite identidades y enmascara contactos. No usa cookies ni endpoints privados ni mezcla puntuaciones con Campus. El HTML SEO no contiene las respuestas, por lo que no se usa para inferir que una reseña no tiene respuestas.

La lectura tiene caché de 15 minutos, máximo de dos solicitudes simultáneas, tamaño y tiempo acotados. Si ProfeMatch no responde o cambia el formato, la ficha de Campus sigue funcionando y muestra el enlace de origen con un estado de indisponibilidad; no inventa un recuento de cero comentarios.

La vista previa de Juan Carlos Morales contiene 13 comentarios públicos de Base de Datos y 5 de HCI, consultados el 23 de octubre de 2026. Se muestran por curso con el enlace de fuente junto a los textos. El número de comentarios puede ser menor que el total de valoraciones. Los comentarios importados no reciben respuestas de Campus en esta versión.

Se añadieron pruebas de formato de fuente, privacidad, caché, errores, tamaño máximo, escape HTML y atribución. El renderizador completa ahora 15 pruebas, además de las 8 pruebas de comentarios completos de ProfeMatch. La vista previa utiliza una captura de datos públicos en `output/professor-conversations/profematch-preview.json`; producción utilizará el lector del backend al desplegarlo.

## Subcomentarios y diseño común

El lector conserva cada `respuestas` bajo el ID de su reseña, con identificadores separados por fuente, profesor, reseña y respuesta. No relaciona comentarios por coincidencias de texto. Mantiene descendientes, limita profundidad y tamaño, elimina duplicados dentro del hilo y distingue respuestas vacías de respuestas no disponibles. La moderación de un comentario principal también excluye sus descendientes.

Las tres fuentes comparten cabecera de tarjeta, avatar, puntuación, contexto, texto y fecha. Campus y ProfeMatch usan el mismo renderizador de respuesta y estilos de hilo. Las respuestas externas se despliegan en contexto; el enlace «Responder en ProfeMatch» continúa la conversación en su sitio de origen. Los formularios de Campus solo publican en reseñas propias.

Verificación al 23 de octubre: las fichas 5 y 57 entregan 18 comentarios y ninguna respuesta pública. Las pruebas de jerarquía usan un caso ficticio separado; `thread-fixture.png` está marcado como prueba y no representa contenido de estudiantes. Se verificó apertura de ambos niveles y ausencia de desbordamiento a 320, 375 y 1440 px. Pruebas backend focalizadas: 43 aprobadas. Astro: 0 errores y 0 advertencias (42 sugerencias previas).

## Compatibilidad con la publicación actual

La ficha conserva la copia completa ya publicada de ProfeMatch cuando el backend confirma exactamente la fuente, el profesor y el curso, y todavía no entrega comentarios en vivo. Esa copia usa el mismo diseño, indica su fecha y remite las respuestas a la fuente. Una respuesta en vivo exitosa tiene prioridad, incluso si no contiene comentarios. Se conservan los enlaces de cursos con coincidencia exacta, sin inferir alias.

Las pruebas del sitio (`test:app`), Astro y el recorrido del navegador pasan sobre la rama principal actualizada. Los enlaces «Leer comentarios» abren automáticamente el bloque de destino y usan un icono discreto de 14 px. La dependencia transitiva Zod del sitio se actualiza dentro de su rango permitido para superar la comprobación de seguridad de CI.
