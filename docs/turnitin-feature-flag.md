# Pausa pública de Turnitin

La variable `CAMPUS_TURNITIN_SERVICE_ENABLED` está apagada por defecto. Se activa únicamente con el valor exacto `true`.

En el sitio estático se lee del entorno del proceso de compilación (Vercel o shell): oculta promociones de la landing, navegación pública/móvil, sitemap y descubrimiento Markdown/LLM. `/turnitin/` redirige al inicio y su Markdown deja de anunciar el servicio. El acceso directo a `/app/turnitin/` conserva el historial de pedidos, sin formulario de nuevos pedidos.

En el backend de `../campus-profes`, la misma variable pausa la creación de pedidos aunque la flag anterior `CAMPUS_TURNITIN_ENABLED` estuviera activa. El historial, las descargas autenticadas y la gestión de pedidos existentes se conservan. No elimina código, archivos, pedidos ni claves de cifrado. El panel de admin.campuscli.com y la política de privacidad conservan su funcionamiento e información sobre datos existentes.

Para reactivar: configurar `CAMPUS_TURNITIN_SERVICE_ENABLED=true` en el entorno de compilación del sitio y en el backend; mantener `CAMPUS_TURNITIN_ENABLED=true` y la configuración existente en el servidor. Recompilar/publicar el sitio y reiniciar/publicar el backend. Para pausar de nuevo, usar `false` y repetir ambos despliegues.

Validar con `npm run build --prefix site` y `node site/scripts/verify-turnitin-feature.mjs`. Para comprobar la reactivación, ejecutar ambos comandos con `CAMPUS_TURNITIN_SERVICE_ENABLED=true`. Las pruebas del backend están en `campus-profes/src/app/turnitin.test.ts`.
