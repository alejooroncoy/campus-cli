# Campus Connect

Local companion for installing and managing reviewed MCP integrations through the Campus relay. The client runs on macOS and Windows and does not require campus-cli. Packet Tracer is the first independently downloaded integration.

This directory contains only the local client, its package builder, tests and public integration metadata. Campus account services, credentials, student data and backend code are not included.

## Build

Use Python 3.13 on the target operating system:

```sh
python -m pip install --require-hashes -r integrations/connect/requirements.lock
python -m pip install --no-deps --require-hashes -r integrations/connect/plugins/packet-tracer/requirements.lock
python integrations/connect/build.py --output connect-artifact
python -m unittest discover -s integrations/connect -p 'test_*.py'
```

The builder verifies the frozen executable with the real separate MCP package. Cisco Packet Tracer is installed separately; builds and offline tests do not install its extension or modify a laboratory.

The beta has no publisher signature/notarization. Each integration requires explicit local activation. Packages run with the current user's privileges; this is not an operating-system sandbox and arbitrary GitHub MCP servers cannot be imported. The upstream Packet Tracer MCP is pinned to 0.12.0 and its MIT notice is included. Campus fonts and brand assets are included for the client UI.

## Packet Tracer integration 0.2.1

The independently versioned package adds bounded IOS edits to existing routers and switches, configuration readback, new devices and links, host IPv4 configuration, activity status and saving a new `.pka` copy. The existing 21 operations remain available with package 0.2.0. New tools require a local package update and consent; Campus Connect itself stays at 0.2.0 on Windows and both Mac architectures.

The Campus adapter in `plugins/packet-tracer/editing.py` wraps the pinned vendor API. Raw CLI, JavaScript, arbitrary paths and overwrites remain unavailable. IOS batches may apply partially: inspect every result and read back before repeating. Saving checks that a new nonempty file exists; activity answers, grading and password protections are unchanged. WPA2/client profiles still require Cisco's UI and live verification.

## Packet Tracer package 0.2.2

Adds bounded DHCP/DNS/HTTP service operations, simulated client DNS/web checks, SSID settings, IOS config saving, SSHv2/ACL configuration, RSA generation with known prompts only and SSH login tests with lab secrets redacted from all result surfaces. Reads leave service state and wireless associations unchanged. Reopening accepts only existing workspace .pka files and never supplies an activity password. WPA2/client profiles retain the upstream API limitation. The host stays 0.2.0 and reviewed package versions keep their supported operations.

Package 0.2.3 preserves upstream error flags and late session failures after successful SSH authentication, and reports a disconnected bridge as an MCP error. Package 0.2.2 was superseded before the relay rollout; SSH tests require 0.2.3.

## Revisión visual MCP — paquete 0.2.4

`pt_review_layout` devuelve una captura PNG real del lienzo de Cisco y evidencia
de clústeres, inventario, nombres duplicados y equipos esperados fuera de su
clúster. Admite `cluster` (nombre exacto), `expected_devices` y `capture=false`
para consulta estructural. La captura solo incluye el lienzo lógico: no captura
el escritorio ni cambia conexiones, configuración, etiquetas o preferencias.
Si necesita seleccionar otro clúster, restaura la vista anterior incluso cuando
falla la captura. No acepta código, rutas locales ni correcciones automáticas.

El relay entrega el PNG como contenido MCP de imagen en ambos endpoints de job,
sin publicarlo mediante enlaces. No repite el base64 en el JSON. Los límites de
cola, cuentas y resultados se conservan; máximo 768 KB de PNG por respuesta.
Los objetos auxiliares de distribución eléctrica se cuentan por separado de los
equipos de red. Las alertas de solapamiento se estiman por coordenadas y pueden
ser falsos positivos: cero alertas no certifica legibilidad. La IA debe inspeccionar
la imagen antes de afirmar que una revisión visual pasó. Una captura ausente o datos parciales se informan como fallo, conservando la
evidencia disponible. La legibilidad se comprueba en la imagen.

La app 0.2.0 admite este paquete en Windows x64 y macOS Intel/Apple Silicon;
solo se actualiza la integración con consentimiento local. Las versiones
anteriores conservan sus operaciones revisadas y no ejecutan esta función.

Los nombres duplicados se detectan antes de resolver componentes por nombre. Su
pertenencia al clúster queda ambigua y la cobertura parcial; no se atribuye la
ubicación del primer equipo a todos los que comparten ese nombre.
