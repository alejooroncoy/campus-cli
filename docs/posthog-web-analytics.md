# Web Analytics de Campus

Proyecto: [539784](https://us.posthog.com/project/539784/web).

El sitio conserva los eventos `campus_*` existentes y envía `$pageview` y
`$pageleave` con el mismo cliente `posthog-js-lite`, identidad y sesión.
No se inicializa un segundo SDK. La navegación de Astro no duplica la vista
inicial; los cambios de ruta cierran la vista anterior y BFCache abre otra.

### Installation Health (5 de noviembre de 2026)

El cliente recoge la geometría del documento mediante listeners pasivos de
scroll/resize. Envía los ocho campos estándar `$prev_pageview_*` de scroll y
contenido en `$pageleave`, junto a `$prev_pageview_id`. Las fracciones van de 0
a 1; cada ruta empieza con una medición nueva y `astro:before-swap` cierra la
vista antes de reemplazar el documento. No se inspecciona el contenido de
mensajes, formularios ni paneles desplazables internos.

La dependencia oficial `web-vitals` mide CLS, FCP, INP y LCP con un solo juego
de observadores por documento. Los resultados se agrupan durante un máximo de
cinco segundos y se envían como `$web_vitals` al mismo cliente, con únicamente
los valores numéricos `$web_vitals_{CLS,FCP,INP,LCP}_value`. Se vacía el buffer
al ocultar o salir de la página. No se exportan entradas de PerformanceObserver,
atribución del DOM, selectores, texto ni URLs de recursos. Se conserva la ruta
segura de la carga medida al navegar con Astro; BFCache inicia otro contexto.
Las etiquetas de campaña quedan limitadas a `$pageview`, incluso al restaurar.
Las métricas disponibles dependen del navegador y de que haya interacción.

La salida real del documento inicia un envío `fetch` con `keepalive` dentro
del callback de `pagehide`/visibilidad, usando el transporte del SDK sin esperar
su cola asíncrona ni la compresión. El resto de los envíos conserva la compresión.
Se mantienen las cookies excluidas y los UUID originales en la cola persistente
hasta recibir confirmación; un fallo permite reintentar en una visita posterior.
Las solicitudes coincidentes conservan el mismo UUID para la deduplicación.
`analytics-unload.test.mjs` verifica scroll y las cuatro métricas contra un
servidor HTTP local, navegando a una página sin analítica y sin interceptar los
envíos. Una simulación de `pagehide` no comprueba este comportamiento.

El proxy Vercel existente `/c-events` se conserva. Una comprobación GET de
`https://campuscli.com/c-events/batch/` devolvió el error de ingestión esperado
`400 request missing data payload`, sin enviar eventos. Se añade desde la
configuración real `$lib_custom_api_host`, propiedad estándar que PostHog usa
para detectar el proxy; ningún evento puede sobrescribirla. No hace falta
crear otro proxy ni cambiar DNS.

La configuración aplicada y verificada el 5 de noviembre de 2026 para el
proyecto 539784 es `app_urls` con
`https://campuscli.com` (conservando cualquier entrada existente),
`autocapture_web_vitals_opt_in: true` y
`autocapture_web_vitals_allowed_metrics: ["CLS", "FCP", "INP", "LCP"]`.
El usuario confirmó ambos ajustes antes de aplicarlos mediante
`project-settings-update`; una lectura posterior confirmó su persistencia.
El cliente lite recoge las métricas localmente;
activar el ajuste remoto por sí solo no las añade a una versión anterior.

Verificación: `npm run test:analytics`, `npm run test:analytics:transport`,
`npm run check` y `npm run build`. Las pruebas de transporte interceptan todas
las solicitudes y verifican FCP/LCP reales, scroll de ida/vuelta, reinicio por
ruta, correlación con la vista/sesión y eliminación de información privada.
Publicación mediante PR a `main` y el workflow protegido
`Publish site from checked main`, con verificación de `/build-info.json`. Los checks de salud se recalculan por
horario: tras desplegar y recibir eventos nuevos, los avisos pueden permanecer
hasta su siguiente ejecución.

Fuentes: [Web Vitals](https://posthog.com/docs/web-analytics/web-vitals),
[detección del proxy](https://github.com/PostHog/posthog/blob/master/products/web_analytics/backend/temporal/health_checks/reverse_proxy.py),
[detección de scroll](https://github.com/PostHog/posthog/blob/master/products/web_analytics/backend/temporal/health_checks/scroll_depth.py).


`$current_url`, `$pathname` y `$prev_pageview_pathname` usan familias de rutas
cerradas. Los nombres de profesores, documentos, conversaciones, parámetros
OAuth, búsquedas y fragmentos nunca se exportan. El referrer conserva solo su
origen. De las UTMs solo se admite la fuente `meta` con un ID numérico de campaña. El dispositivo se agrupa
en Desktop/Mobile/Tablet. La geolocalización, autocaptura y grabación de
sesiones siguen desactivadas. Los filtros de cuentas internas y de prueba
existentes se conservan.

Para la serie de Viva Engage, la vista de entrada admite únicamente
`utm_source=viva_engage`, `utm_medium=social`, `utm_campaign=grupo_de_la_u`
y uno de estos `utm_content`: `remontada_upecinos`, `mejoralo_upecinos`,
`remontada_virtualidad`, `mejoralo_virtualidad`, `remontada_working_student`
o `mejoralo_working_student`. Se rechazan parámetros repetidos o valores
distintos, y no se exporta la URL con su cadena de consulta. Esta atribución
de visitas no modifica la atribución de pagos y no recupera visitas anteriores.

La campaña de WhatsApp «Mismo prompt» admite la combinación exacta
`utm_source=whatsapp`, `utm_medium=social` y `utm_campaign=mismo_prompt` en la
vista de entrada. Rechaza etiquetas repetidas y `utm_content`. Para medirla en
PostHog, filtra el evento `$pageview` por `utm_source = whatsapp` y
`utm_campaign = mismo_prompt`. El conteo total mide vistas y el conteo de
usuarios únicos mide el alcance observado en el sitio. Esta campaña registra
visitas y sigue las mismas reglas de privacidad y atribución que Viva Engage.

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

### Canal de la primera visita

Además de la cookie de OAuth, el navegador guarda en `localStorage`
(`campus_entry_first_v1`, 30 días) el primer canal observado: la primera
visita gana. Solo una visita `direct` (sin referrer) cede ante un canal real
posterior, para que un marcador no oculte una campaña. Respeta la baja de
analítica: se borra al leerla o en la siguiente visita, y también en cada
`resetAnalytics` (cierre de sesión o cambio de cuenta en un navegador compartido).
Guarda solo valores del contrato cerrado: `entry_channel` (`mcp`, `campaign`,
`referral`, `direct`), `entry_source` (dominio del referrer, cliente de IA o
fuente de campaña admitida), `entry_campaign` (etiqueta o ID admitido) y
`entry_landing` (familia de ruta, nunca slug ni consulta). No se admiten UTMs
arbitrarias; solo las campañas ya listadas arriba. El contrato valida la
fuente según el canal: cliente de IA conocido (`mcp`), `meta` o `email`
(`campaign`, con ID numérico) o un hostname (solo `referral`).

Atención al comparar: la cookie de OAuth que lee el backend es la entrada de la
sesión (24 h), mientras que los eventos del navegador llevan la primera entrada
de 30 días. Los dos modelos pueden diferir para una misma persona.

La cookie `campus_entry` de OAuth incluye ahora `entry_landing`. Estas cuatro
propiedades se adjuntan en el navegador a `campus_account_access_completed`,
`campus_plus_checkout_viewed`, `campus_plus_checkout_started`,
`campus_plus_submit_started`, `campus_turnitin_submit_started` y
`campus_turnitin_submitted`. `campus_auth_completed` lo emite el backend de
campus-profes a partir de esa cookie: para que lleve `entry_landing` el backend
debe copiarla (pendiente en ese repositorio).

#### Logins sin `$pageview` previo

Hipótesis, sin comprobar contra los datos de producción: `campus_auth_completed`
se emite al terminar OAuth, y no todos los accesos pasan por el sitio.
1. **CLI y MCP**: `campus login` y la conexión desde ChatGPT/Claude/Gemini
   empiezan en el relay o en el proveedor, sin cargar ninguna página, así que
   no hay vista ni cookie `campus_entry`.
2. **Baja de analítica o bloqueadores**: el sitio no envía vistas ni cookie.
3. **Bots**: el cliente descarta sus eventos.
4. **Primera visita en otra sesión o dispositivo** (el `distinct_id` anónimo no
   se une al perfil).
Para separar causas, cruza cada login con el `$pageview` del mismo
`$session_id` y con la presencia de `entry_channel` en el evento.

#### Consulta de ejemplo: logins por canal

```sql
SELECT
  coalesce(properties.entry_channel, 'sin_canal') AS canal,
  coalesce(properties.entry_source, '') AS fuente,
  count() AS logins,
  uniq(person_id) AS personas
FROM events
WHERE event = 'campus_auth_completed'
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY canal, fuente
ORDER BY logins DESC
```

Para la conversión a Plus por canal usa `campus_plus_checkout_started` con el
mismo desglose.

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
