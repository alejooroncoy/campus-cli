# Reseñas de Campus para Blackboard

El formulario está en `/opiniones-campus/#compartir`, enlazado desde Conectar IA, Mi perfil y `/blackboard-chatgpt/#resenas`. Usa la sesión httpOnly de Campus. No depende de Plus ni de elegir universidad. Cada cuenta tiene una reseña editable; debe declarar experiencia con Blackboard en ChatGPT/Claude y autorizar el nombre público, estrellas y comentario. No se inventan testimonios ni se reutilizan calificaciones de profesores.

## Backend (campus-profes)

- `GET /api/app/blackboard-review`: reseña de la cuenta de la cookie; 401 sin sesión.
- `POST /api/app/blackboard-review`: `{publicName,rating,text,experienced:true,consent:true}`. Rating entero 1–5; nombre 2–80; comentario 10–1500; rechaza correos/teléfonos e identidades enviadas por el cliente. Origin exacto y JSON obligatorio. Una edición cada 30 segundos; el retiro no espera.
- `POST /api/app/blackboard-review/withdraw`: retira solo la reseña de esa cuenta.
- `GET /api/app/blackboard-reviews?page=1`: página pública de 10 reseñas, total y promedio calculados en una sola consulta. No lee sesiones ni devuelve cuentas o correos. Incluye todas las calificaciones publicadas sin filtrar por sentimiento.

La migración `161_campus_product_reviews.sql` crea una tabla independiente con una fila por cuenta, consentimiento, timestamps y estado de publicación. La baja de una cuenta elimina su reseña por FK. `hidden` permite retener spam o datos personales de forma manual; editar no elimina una retención. Aplicar la misma política a todas las estrellas. No hay clasificación con IA ni aprobación según si la opinión es favorable.

## Página pública

Astro compila la página como plantilla y el último paso del build la mueve a `.generated/blackboard-chatgpt.html`. Así Vercel no encuentra un HTML estático que tenga precedencia sobre el rewrite. La función Vercel `site/api/blackboard-chatgpt.js` consulta el feed público y sirve HTML con comentarios y JSON-LD en la misma respuesta. Conserva el Product existente y añade `review` y `aggregateRating` desde los mismos datos. Escapa HTML y JSON dentro de scripts. La paginación permite consultar todas las reseñas; el promedio y total abarcan todas las publicadas. No se emite puntuación si todavía no hay reseñas. Si falla la API, la página sigue disponible, indica el fallo y no inventa un estado vacío ni puntuaciones.

La caché pública dura hasta 60 segundos; no contiene información de sesión. Retirar una reseña la excluye de lista y promedio en la siguiente respuesta sin caché. Los buscadores actualizan sus copias a su propio ritmo. La ruta Markdown se conserva.

## Publicación

1. En `campus-profes`, revisar el destino de `node --env-file=.env scripts/apply-product-reviews-schema.ts` (dry run) y aplicar únicamente esta migración con `--apply --expected-host=<host-revisado>`. No aplicar todas las migraciones pendientes.
2. Desplegar el backend con los nuevos módulos, conservando `CAMPUS_APP_ORIGIN=https://campuscli.com`.
3. Desplegar `blackboard-cli/site` con las funciones y rewrites de `site/vercel.json`. `CAMPUS_REVIEWS_API_ORIGIN` es opcional y por defecto usa `https://profes.campuscli.com`; debe ser el origen de confianza del backend, nunca una URL del visitante. Las rutas privadas nuevas se reenvían por el mismo dominio para mantener la cookie. El login y la sesión existentes de `/api/app/*` deben seguir apuntando al backend de Campus.
4. Comprobar el formulario con una cuenta real. No publicar reseñas sintéticas para probar el SEO. Validar HTML público con Rich Results Test después de que exista una reseña real autorizada; después solicitar validación en Search Console si corresponde. El marcado correcto no garantiza que Google muestre estrellas.

En `astro dev` no se ejecutan las funciones ni los rewrites Vercel: se ve la plantilla. `astro preview` solo sirve archivos estáticos, por lo que esta ruta necesita Vercel local o `npm run app:local` en campus-profes, cuyo adaptador ejecuta la misma función contra la API local. Las pruebas unitarias ejecutan directamente la misma función desplegable. Con el proyecto Vercel configurado con Root Directory `site`, ejecutar `vercel build --standalone --local-config site/vercel.json` desde la raíz del repositorio, enlazada al proyecto, para revisar el bundle completo sin desplegar.

## Pruebas

- En `campus-profes`: `node --test src/app/product-reviews.test.ts`. Con `CAMPUS_APP_TEST_DATABASE_URL` exclusivamente local ejecuta también la prueba PostgreSQL en un esquema aleatorio que elimina al terminar.
- En `blackboard-cli/site`: `npm run build` y `node --test scripts/product-reviews.test.mjs`.
- Cubren consentimiento, CSRF, identidad por cookie, límites, concurrencia, edición, retiro, retención, todas las calificaciones, paginación, fallos del feed, caché y concordancia de HTML/JSON-LD, incluyendo intentos de inyección.
