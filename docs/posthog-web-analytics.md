# Web Analytics de Campus

Proyecto: [539784](https://us.posthog.com/project/539784/web).

El sitio conserva los eventos `campus_*` existentes y envía `$pageview` y
`$pageleave` con el mismo cliente `posthog-js-lite`, identidad y sesión.
No se inicializa un segundo SDK. La navegación de Astro no duplica la vista
inicial; los cambios de ruta cierran la vista anterior y BFCache abre otra.

`$current_url`, `$pathname` y `$prev_pageview_pathname` usan familias de rutas
cerradas. Los nombres de profesores, documentos, conversaciones, parámetros
OAuth, búsquedas y fragmentos nunca se exportan. El referrer conserva solo su
origen. De las UTMs solo se admite la fuente `meta` con un ID numérico de campaña. El dispositivo se agrupa
en Desktop/Mobile/Tablet. La geolocalización, autocaptura y grabación de
sesiones siguen desactivadas. Los filtros de cuentas internas y de prueba
existentes se conservan.

Las vistas y salidas incluyen el agente de usuario del navegador en
`$raw_user_agent`, para que PostHog pueda clasificar tráfico automatizado. Sin él,
PostHog clasifica el agente vacío como Automation.

## Origen del acceso web

El sitio conserva la primera entrada observada en la pestaña durante un máximo
de 24 horas. Envía al inicio de OAuth solo el dominio externo, la campaña de Meta
admitida, el cliente de un enlace MCP reconocido o la categoría `direct` si no
hay referrer. Las navegaciones internas y el proveedor de inicio de sesión no
sustituyen esa entrada. Una cookie limitada a las rutas de autenticación permite
conservar el origen aunque la visita anónima no se vincule al perfil de PostHog.

Tras un acceso válido, campus-profes emite `campus_auth_completed` con la
identidad Campus y las propiedades `entry_channel`, `entry_source` y, cuando
corresponde, `entry_campaign`. Las propiedades ausentes indican que no se
observó el origen. Para analizar nuevos usuarios, toma el primer acceso observado
por cuenta con todo el historial disponible antes de filtrar por fechas. Esto
mide el primer acceso registrado y no la fecha de creación de la cuenta.

Despliega primero el backend de campus-profes y después el sitio. Para verificarlo
en producción, abre una sesión de navegador limpia, llega desde un enlace
externo, entra y comprueba las propiedades del evento de acceso en PostHog.

## Configuración y despliegue

Publicar los cambios mediante PR y el despliegue automático de `main`. Una
publicación manual de un checkout antiguo reemplaza el sitio completo, no solo
la analítica, y puede restaurar pantallas y bloqueos ya eliminados. Verificar
el commit asociado a `campuscli.com` y el onboarding después de publicar.

- Configurar `PUBLIC_POSTHOG_KEY` con el **project token** de 539784. Nunca usar
  una personal API key en el frontend. El sitio envía eventos por `/c-events`
  en su propio dominio; las reglas de `site/vercel.json` los remiten a PostHog US.
- El valor local vive en `site/.env`, ignorado por Git. Para producción,
  configurar la variable en el proyecto de hosting **antes de compilar**.
- El transporte usa `credentials: omit` para no enviar cookies del sitio por
  el proxy. Vercel factura las solicitudes y transferencia que pasan por él.
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
