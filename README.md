# campus-cli

[![npm version](https://img.shields.io/npm/v/campus-cli.svg)](https://www.npmjs.com/package/campus-cli)

Conecta tu campus universitario con tu terminal o cliente de IA mediante el relay de [Campus](https://campuscli.com).

**Versión 3.0.0.** Esta versión cambia la arquitectura: todos los comandos de datos y el MCP por stdio usan el relay autenticado. El servidor aplica el plan y el cupo de la cuenta en cada operación. Instalar la CLI no concede acceso gratuito ni permite omitir esos controles.

La política actual del relay conserva sus cinco consultas de prueba. Esta migración cierra la alternativa local de la nueva distribución; no cambia la política de pruebas del servidor ni puede retirar código o versiones 2.x ya descargados.

Campus es una integración no oficial. Blackboard, UPC, UPN y las demás universidades no patrocinan este proyecto. Canvas y Moodle siguen en el roadmap.

## Instalación y login

Requiere Node.js 22.13 o superior y un navegador para autorizar la cuenta.

```bash
npm install -g campus-cli@3.0.0
campus login
campus courses list --json
campus assignments list <courseId> --json
```

`campus login` autoriza tu cuenta Campus con OAuth y luego abre Playwright **en tu equipo** para entrar a tu universidad y completar el MFA. Pide consentimiento para enviar únicamente las cookies del campus al relay; no envía contraseñas ni cookies de Microsoft o Google. El relay verifica la identidad contra Blackboard antes de guardar la sesión cifrada y habilitar tu token MCP. `campus account login` es un alias. Las sesiones locales antiguas de Blackboard y de la cuenta Google no conceden acceso al relay: hace falta autorizarlo una vez.

Playwright se incluye como dependencia del cliente y busca Chrome/Edge locales; si hace falta, instala Chromium para el login. El navegador usa un contexto temporal y se cierra al capturar la sesión. El cliente guarda únicamente su autorización del relay en `~/.blackboard-cli/relay/`, con permisos privados y separada para cada URL del servicio.

## CLI

Tras instalar la versión 3.x, estos comandos están disponibles como `campus`, `campus-cli`, `blackboard` y `blackboard-upc`:

```bash
campus login
campus login --university upn-pe
campus status --json
campus whoami
campus courses list --json
campus courses contents <courseId> --parent <contentId> --json
campus courses grades <courseId> --json
campus assignments list <courseId> --json
campus assignments attempts <courseId> <columnId> --json
campus assignments feedback <courseId> --json
campus messages --course <courseId> --json
campus upn profile
campus upn grades <courseCode>
campus miupc courses
campus miupc grades --course <courseCode>
campus logout
```

Las respuestas se imprimen como JSON; `--json` se conserva por compatibilidad. Los códigos de Mi UPC y Mi Mundo UPN son distintos de los IDs de Blackboard. El relay decide qué herramientas ofrece según la universidad conectada. El login local comprueba la lista de universidades que admite ese relay antes de capturar cookies. La publicación inicial del contrato hospedado admite UPC y UPN; las universidades no anunciadas se rechazan explícitamente. Para una terminal automatizada, `--consent-session-upload` expresa el consentimiento; el usuario sigue completando el login y MFA en el navegador. Cuando expire la sesión universitaria, vuelve a ejecutar `campus login`.

Para descubrir el catálogo y ejecutar cualquier herramienta publicada:

```bash
campus tools list
campus tools call banner_get_weekly_schedule
campus tools call blackboard_get_course --args '{"courseId":"_100004_1"}'
campus tools call campus_archimate_guidance --args '{"topic":"overview"}'
campus tools call campus_mendeley_connect
```

`tools call` conserva el resultado MCP completo, incluidos enlaces, metadatos y mensajes de pago. Para leer otros endpoints públicos de Blackboard:

```bash
campus api GET /learn/api/public/v1/users/me
```

El relay actual ofrece lecturas de Blackboard. Las entregas y borradores se realizan en Aula Virtual; la CLI no ejecuta envíos ni cambios directos. La compatibilidad y los comandos que cambiaron se detallan en [la migración al relay](docs/relay-client.md).

## Descargas

```bash
campus download <courseId> <contentId> --out curso/semana1
campus download-folder <courseId> <folderId> --out curso --filter diapositivas
```

Los archivos se obtienen con enlaces temporales emitidos por el relay después de su autorización. Se guardan bajo `~/Downloads/campus-cli` o `CAMPUS_DOWNLOAD_DIR`, en subdirectorios relativos, con límites de tamaño y sin sobrescribir archivos. Los resultados MCP conservan los enlaces y recursos que publica el servicio.

## MCP por stdio

Primero ejecuta `campus login`. Después conecta tu cliente MCP con el ejecutable de esta versión:

```json
{
  "mcpServers": {
    "campus": {
      "command": "campus",
      "args": ["mcp"]
    }
  }
}
```

Para probar desde el checkout usa `node` como `command` y las rutas absolutas de `run.js` y el argumento `mcp`. El proceso reenvía el protocolo al relay: instrucciones, herramientas, recursos, resultados, cancelaciones y solicitudes de confirmación del cliente. No registra herramientas universitarias locales ni cambia a proveedores locales cuando hay un rechazo de pago, sesión o red.

Los clientes compatibles con MCP remoto pueden conectarse directamente a `https://mcp.campuscli.com/mcp` usando su flujo OAuth.

## Configuración

| Variable | Uso |
| --- | --- |
| `CAMPUS_RELAY_URL` | Endpoint MCP completo; por defecto `https://mcp.campuscli.com/mcp`. HTTPS obligatorio, salvo loopback para desarrollo. |
| `CAMPUS_DOWNLOAD_DIR` | Directorio raíz de las descargas de la CLI. |

La autorización OAuth/MCP no sigue redirecciones de red ni envía tokens a otro origen. Cambiar la URL del relay exige su propia autorización. `campus logout` elimina las credenciales locales de ese relay; no revoca otras conexiones de la cuenta.

## Desarrollo

```bash
npm run build
node --import tsx --test tests/relay-client.test.ts
npm pack --dry-run
```

El código fuente de los proveedores anteriores se conserva para mantener el núcleo privado y sus pruebas. La distribución npm 3.x incluye únicamente el cliente del relay y utilidades de descarga; no incluye el motor de consultas universitarias, sesiones heredadas ni los antiguos subpaths de biblioteca. El único módulo de universidad del cliente realiza la captura temporal de login. El backend hospedado continúa utilizando su artefacto de núcleo fijado por versión; no debe sustituirse por este paquete cliente.

Consulta [la documentación histórica 2.x](docs/cli-v2-legacy.md), [la migración 3.x](docs/relay-client.md) y [el registro de cambios](CHANGELOG.md).

Licencia ISC. Los términos del servicio hospedado y sus controles de acceso son independientes de la licencia del cliente.
