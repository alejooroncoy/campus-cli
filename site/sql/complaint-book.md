# Libro de Reclamaciones de Campus

La página pública es `/reclamos/`. La función de Vercel registra la hoja en Postgres antes de mostrar una copia imprimible. Resend avisa a atención con el correlativo; no recibe el contenido de la hoja. Si el aviso falla, la hoja sigue en el registro.

Para habilitar el formulario:

Los datos públicos de la persona natural que opera Campus están en `src/lib/complaint-book.mjs`. La página, el registro y la constancia usan esa misma identificación.

1. Aplica `complaint-book.sql` en la base autorizada. Crea roles privados separados de escritura y lectura y aplica los permisos indicados en el SQL. Configura la conexión del rol escritor en Vercel (con TLS si es remota). Genera la clave de cifrado con `openssl rand -hex 32` y guárdala en el gestor de secretos. Conserva una copia segura: las hojas existentes requieren esa misma clave para leerse.
2. Configura el remitente verificado de Resend y asegúrate de que atención revise el buzón de avisos (por defecto, `info@campuscli.com`). Comprueba el registro y la notificación con una hoja ficticia en un entorno de pruebas antes de activar la recepción pública.

El equipo autorizado puede ejecutar `node scripts/read-complaint-book.mjs` desde `site/` para ver los últimos 100 correlativos, o agregar el correlativo como argumento para leer una hoja. Usa la conexión del rol lector y la clave de cifrado únicamente en un entorno privado. Revisa también el registro aunque no lleguen alertas y conserva evidencia de las respuestas fuera del buzón de notificaciones. Evita adjuntar hojas a incidencias públicas o registros de diagnóstico.
