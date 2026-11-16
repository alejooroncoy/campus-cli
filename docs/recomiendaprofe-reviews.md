# Recomienda Profe UPC: reseñas en las fichas de Campus

El usuario manifestó en este chat el 15/11/2026 que cuenta con autorización para
reutilizar los comentarios de Recomienda Profe UPC
(`recomienda-profe-upc-frontend.vercel.app`). La implementación se basa en esa
manifestación y no la presenta como licencia ni como garantía jurídica.

## Origen de los datos

La web pública consume una API sin autenticación bajo `/api`:

- `GET /api/professors`: 177 profesores con `_id`, `slug`, nombre, cursos y recuento.
- `GET /api/reviews/professor/{_id}`: reseñas aprobadas del profesor (nota y
  dificultad de 1 a 10, recomendación, curso, carrera, periodo y fecha). Usa el
  `_id`, no el slug.

`robots.txt` permite todo. Se pidió una ficha cada 0,4 s y solo de los 96
profesores con reseñas. El 15/11/2026 se obtuvieron 144 reseñas, todas aprobadas,
con texto y sin datos de contacto.

## Vinculación con el catálogo de Campus

No se escribió nada en la base de datos ni en el backend. La vinculación vive en el
snapshot `site/src/data/recomiendaprofe-reviews.json`, con el `professorId` y el
`professorSlug` de Campus. La ficha solo muestra reseñas cuando ambos coinciden.

Reglas para aceptar un vínculo, consultando la API pública de Campus en modo de
solo lectura:

1. El mismo slug existe en Campus y los nombres normalizados coinciden.
2. Si no, todas las palabras del nombre de la fuente aparecen en un único
   candidato. Si hay varios, se desempata por el mismo curso.
3. Si no, el nombre y un apellido coinciden con un único candidato que dicta el
   mismo curso.
4. Si no, coinciden tres o más palabras con un único candidato.

Revisión manual del 15/11/2026 (`manual.json`): se añadieron 14 profesores con
erratas en el nombre o el apellido (Castañera → Castañeda, Ludoweing → Ludowieg,
Castilllo → Castillo…). En todos coincide el curso o el área, salvo «Julia Magna»
y «Juan Lobo Collantes», que el usuario aprobó expresamente. Las reseñas firmadas
por dos docentes de un taller de Arquitectura («A / B») se muestran en la ficha
de cada uno, con «Reseña compartida con …». Solo se vincula al docente que dicta ese
mismo taller según el catálogo (TI para Taller 1, TIII para Taller 3).

Resultado: 96 fichas y 139 reseñas distintas (145 tarjetas, porque 6 reseñas
compartidas salen en dos fichas). Quedan fuera 5 reseñas: «Meneses / Ferraro» y
«Antezano / Gerardo Haro» (nadie dicta ese taller en el catálogo ni en las secciones
visibles de Banner de 2025-2 a 2026-2), «Juan Alcazar Flores» y «Mallku Inti Torres
Apaza» (no están en el catálogo ni en las secciones visibles de Banner 2026-1; Banner
esconde las secciones llenas, así que no es prueba de que no existan).

«Zuleika Barrera» se vinculó después a Zuleika Helen Barreda Razuri: Banner la
muestra dictando TI (Taller 1) en 2025-2 y 2026-1.

## Presentación

Las reseñas entran en la lista unificada «Opiniones y puntuaciones», con
«Fuente: Recomienda Profe», curso, si lo recomienda, fecha y enlace a la ficha de
origen. Cada reseña guarda su propio enlace, porque una ficha de Campus puede reunir
varias fichas de la fuente. Las compartidas añaden «Reseña compartida con …». La escala ya es de 1 a 10 y la media entra como una fuente más en el
promedio conjunto. Cuentan para el umbral de indexación y el sitemap.

## Actualizar

Los scripts y el volcado completo están en `output/recomienda-profe-2026-11-15/`,
que git no sigue: `fetch_rp.py` → `match_rp.py` → `match2_rp.py` → `decide_rp.py`
→ `build_rp_json.py` (lee también `manual.json`). Se ejecutan con `python3 -I`. Revisa `decisions.json` antes de
sustituir el snapshot. Para retirar una reseña o un profesor, quita su entrada
del JSON y publica.
