# ProfeMatch: comentarios breves con su fuente

El usuario manifestó en este chat el 23/10/2026 que cuenta con autorización expresa
del creador de ProfeMatch. La implementación se basa en esa manifestación; no
presenta un enlace de atribución como sustituto de una licencia ni como garantía
jurídica. Esta autorización no se extiende a MisProfesores.

## Alcance

Se leen únicamente fichas públicas UPC previamente vinculadas en
`professor_source` y `professor_source_candidate` con `status='matched'`, mismo
profesor y universidad. No se incorporan identidades pendientes ni se crean
asociaciones de cursos. El backend debe seguir confirmando el profesor, slug,
fuente y curso en cada respuesta para mostrar una captura editorial.

Cada tarjeta muestra un **fragmento literal** de hasta 240 caracteres, puntuación
original /5, apodo público, mes que publica la fuente y enlace a la ficha. No son
resúmenes generados ni reseñas verificadas por Campus. La fuente no publica
permalinks por comentario: no se inventan enlaces individuales. El apodo y mes
permiten localizar la opinión dentro de la ficha enlazada.

Los comentarios vacíos, duplicados y marcadores pendientes no producen tarjetas.
Textos con datos de contacto se reservan para revisión, sin copiar esos datos.
Las estadísticas de Campus no se alteran. Los enlaces desde cursos del catálogo
requieren coincidencia exacta normalizada; una sigla o nombre parecido no basta.

## Actualización manual y reproducible

1. Exportar en modo de solo lectura las coincidencias confirmadas (source_id,
   source_url, source_name, raw_course, professor_id, professor_slug).
2. Ejecutar desde `site/`:

   ```sh
   node scripts/collect-profematch-excerpts.mjs matches.json collected.json --authorized
   ```

3. Revisar `complete`, errores, fecha y textos antes de sustituir
   `src/data/profematch-excerpts.json`. Una ejecución incompleta no debe publicarse.
4. Compilar, ejecutar `npm run test:app` y verificar móvil/tablet.

El colector comprueba canonical, universidad, identidad de la fuente, curso y
robots.txt; usa HTML público y una petición cada 800 ms, sin API privadas. Para
ante 403/429. No se realiza scraping en las peticiones del visitante ni durante
el build. Las capturas son fechadas; no se presentan como sincronización en vivo.
Para una retirada, eliminar la entrada del conjunto editorial y publicar; si
se revoca la vinculación en el backend, la entrada deja de mostrarse también.

## Lote del 23 de octubre de 2026

269 fichas confirmadas, correspondientes a 238 profesores; 446 comentarios con
texto en 226 profesores. Cero errores de lectura y cero datos de contacto
retenidos. Los profesores sin comentarios públicos conservan únicamente sus
puntuaciones externas. En Juan Carlos Morales hay 13 fragmentos de Base de Datos
y 5 de HCI; cada grupo conserva su fuente y escala. No se ha creado un vínculo
entre la etiqueta HCI de la fuente y el curso IHC del catálogo.
