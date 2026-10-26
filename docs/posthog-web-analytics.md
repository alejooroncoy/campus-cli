# Web Analytics de Campus

Proyecto: [539784](https://us.posthog.com/project/539784/web).

El sitio conserva los eventos `campus_*` existentes y envía `$pageview` y
`$pageleave` con el mismo cliente `posthog-js-lite`, identidad y sesión.
No se inicializa un segundo SDK. La navegación de Astro no duplica la vista
inicial; los cambios de ruta cierran la vista anterior y BFCache abre otra.

`$current_url`, `$pathname` y `$prev_pageview_pathname` usan familias de rutas
cerradas. Los nombres de profesores, documentos, conversaciones, parámetros
OAuth, búsquedas y fragmentos nunca se exportan. El referrer conserva solo su
origen; no se envían UTMs ni parámetros de campañas. El dispositivo se agrupa
en Desktop/Mobile/Tablet. La geolocalización, autocaptura y grabación de
sesiones siguen desactivadas. Los filtros de cuentas internas y de prueba
existentes se conservan.

## Configuración y despliegue

- Configurar `PUBLIC_POSTHOG_KEY` con el **project token** de 539784 y
  `PUBLIC_POSTHOG_HOST` con el ingestion host que devuelve PostHog. Nunca usar
  una personal API key en el frontend.
- Los valores locales viven en `site/.env`, ignorado por Git. Para producción,
  configurar ambas variables en el proyecto de hosting **antes de compilar**.
- Compilar y desplegar el sitio. Las variables públicas de Astro se incorporan
  al bundle durante el build.
- El asistente del backend tiene su instrumentación de IA en campus-profes;
  consultar allí `docs/product-observability.md` y desplegar también ese servicio.
- Abrir una página, navegar a otra y comprobar los eventos estándar y sus
  propiedades en PostHog. Los eventos históricos `campus_page_viewed` no se
  convierten retroactivamente en `$pageview`.

En desarrollo y localhost solo se conserva el buffer local de depuración.
No se envían visitas de las pruebas a PostHog Cloud.

## Verificación

Desde `site/`: `npm run test:analytics`, `npm run test:analytics:transport`,
`npm run check` y `npm run build`. Las pruebas de transporte ejecutan el SDK
real en Chromium e interceptan todas las solicitudes localmente; verifican
navegación, duración, BFCache, identidad y eliminación de campos privados.

Referencias: [Web Analytics](https://posthog.com/docs/web-analytics/start-here),
[`$pageleave`](https://posthog.com/docs/health-checks/pageleave-events).
