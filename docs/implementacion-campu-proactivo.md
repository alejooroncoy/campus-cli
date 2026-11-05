# Campu proactivo: operación del piloto

El relay ejecuta el seguimiento. La web solo verifica la cookie Campus y reenvía operaciones por el puente privado. El MCP captura la identidad autenticada: ningún argumento permite elegir un estudiante. Los tres cambios deben publicarse coordinadamente: `campus-cli-internal`, `campus-profes` y el sitio de `blackboard-cli`.

## Comportamiento implementado

- Opt-in por cuenta UPC habilitada en el piloto y con `mcpUnlimited=true` en el plan central. Preferencias por canal, categorías, cursos, trámites y zona horaria.
- Revisiones programadas a las 8, 12, 16 y 20 h locales. La primera activación se encola de inmediato; el resumen se genera una vez por semana, con recuperación si la cuenta estuvo desconectada el lunes. La hora es de programación, no una garantía de llegada.
- Asignaciones, notas, comentarios de rúbrica, contenidos recursivos y anuncios paginados. Solicitudes activas y cerradas de Mi UPC y la bandeja separada Mis Trámites. `PROCEDE` conserva su significado original; no demuestra entrega.
- El primer inventario establece la referencia. No anuncia todo el historial. Las transiciones 16→18→16 sí generan dos cambios. No se deducen eliminaciones de inventarios incompletos.
- Los documentos se leen de un curso por turno, con continuaciones cifradas y rotación entre cursos. Así un inventario extenso no monopoliza el worker. Se conserva la cobertura parcial; lo visual o estructurado pendiente se entrega a la IA del estudiante para completar la comprobación. Cada ciclo limita a 30 lotes por curso. La evidencia textual preparada se acota a 3 MiB y las continuaciones a 2 MiB por cuenta; superar estos límites mantiene cobertura parcial y deriva la ampliación a la IA del estudiante. Nunca certifica lo que dejó pendiente.
- Jev selecciona evidencia con Noul y verifica afirmaciones con Choice; Luna produce candidatos con JSON Schema. Las decisiones Jev se reutilizan por hash del contenido y versión durante siete días, en el estado cifrado de la cuenta. Solo se publican candidatos con IDs conocidos, cita literal y respaldo suficiente. Una rúbrica sola no certifica una fecha, ni un sílabo confirma que una tarea esté publicada. Faltas de credenciales, cuota o validación dejan el resumen determinista y las fuentes disponibles.
- Contexto canónico cifrado con AES-256-GCM y AAD por propietario. AtomicMemory almacena preparaciones derivadas con `user_id` seudónimo; su búsqueda devuelve referencias que se vuelven a resolver contra el estado canónico del propietario. Sin memoria externa, el MCP sigue funcionando.
- Historial de hasta 90 días; las revisiones de una misma semana actualizan el contexto y su revisión, conservando el enlace del aviso. Pausar conserva preparaciones. Eliminar borra también el snapshot, avisos, contexto y dispositivos; la purga externa permanece pendiente hasta confirmarse y espera las escrituras que estaban en curso.
- Outbox cifrado con consentimiento versionado, leases PostgreSQL y compare-and-swap. Correos con idempotency key estable; push con topic/tag estable; envíos con aceptación incierta quedan `uncertain` y no se repiten a ciegas. Los webhooks firmados registran entrega o rechazo. Una aceptación del proveedor no prueba que el estudiante lo haya visto.
- No envía entre las 22 y las 8 h. Máximo dos avisos prioritarios por día y un resumen agrupado; el semanal sustituye al resumen diario de esa jornada. Los enlaces abren detalles tras autenticación. Los canales externos contienen mensajes genéricos, sin notas ni archivos.
- Ninguna entrega académica, pago, solicitud administrativa, reserva ni mensaje a compañeros se ejecuta en este módulo.

## Activación

1. Revisar los tres cambios y pasar sus checks. Aplicar `018_proactive.sql` con el procedimiento de migraciones del relay (`campus-internal db-migrate`, usando la conexión migradora establecida). No usar `--baseline-existing` para esta migración nueva. La base debe contener `campus_core.accounts`.
2. Cargar las variables de `docs/campu-proactivo-env.example` en el gestor de secretos. La cuenta de servicio necesita las tablas de 018; la clave de cifrado es independiente de la del vault. No cambiarla sin recifrar los estados existentes.
3. En `campus-profes`, configurar `CAMPUS_PROACTIVE_WEB_ENABLED=1`, el mismo `CAMPUS_PROFES_BANNER_BRIDGE_TOKEN` y `CAMPUS_ACCOUNT_URL` apuntando al relay. El navegador nunca recibe ese secreto.
4. Habilitar `ENABLED=1`, `WORKER_ENABLED=1`, `SHADOW=1`; mantener los envíos apagados. Cargar una lista explícita de 10–20 cuentas canónicas, sin `*`. Cada estudiante activa después su propio consentimiento desde `/app/novedades/`.
5. Para preparación, configurar `TYPESAFE_API_KEY` y el `AI_GATEWAY_API_KEY` existente. Confirmar que el gateway ofrece `openai/gpt-6-luna`, que el crédito de US$40 corresponde a esa ruta y sus precios vigentes. Cargar ambas tarifas por millón de tokens; con tarifas vacías el adaptador no genera. `PREPARE_ENABLED=1` activa preparación incluso en shadow: reservar presupuesto antes de probar.
6. Canjear AtomicMemory y verificar sus condiciones y API key antes de activar `MEMORY_ENABLED=1`. El código usa el contrato Cloud v1 verificado contra el SDK 1.1.1. Ejecutar una comprobación controlada de ingestión, búsqueda y purga para dos sujetos sintéticos en la cuenta contratada.
7. Verificar dominio y remitente Resend, configurar el webhook firmado en `/v1/proactive/email-webhook` para entrega, rebote y queja, y cargar la clave HMAC de baja. Configurar un par VAPID estable. Probar push en Android y en iPhone/iPad con la PWA instalada; no se ha demostrado entrega física mediante los tests locales.
8. Pasar a `SHADOW=0`, `SEND_ENABLED=1` y habilitar únicamente el canal validado. Los avisos generados en shadow están cancelados y no se liberan retroactivamente. El siguiente aviso nuevo usa el consentimiento actual.
9. Publicar el sitio exclusivamente por PR a `main` y el workflow protegido `Publish site from checked main`; comprobar `/build-info.json` contra el SHA publicado. No publicar desde un directorio local con Vercel.

La implementación y sus pruebas locales no canjean premios, crean claves ni envían correos/push reales. TypeSafe y AtomicMemory necesitan credenciales de las cuentas del equipo antes de activar esas rutas.

## Presupuestos y diagnóstico

El ledger PostgreSQL reserva antes de llamar: 400 lecturas lógicas/día/cuenta por defecto, dos generaciones/día/cuenta, un límite de entrada Jev/cuenta/mes y 4.000 centavos globales para Luna durante el piloto. La reserva Luna usa bytes UTF-8 como cota conservadora de tokens de entrada y reserva el máximo de salida; no devuelve reservas después de un timeout. No controla el gasto que otros módulos hagan con la misma clave.

AtomicMemory reserva hasta 200.000 operaciones normales y un margen separado de 20.000 operaciones para purgas mensuales para dejar margen respecto de la cuota Pro documentada al diseñar el piloto. Confirmar la cuota real del premio antes de activarlo. Los logs `proactive.budget_threshold` indican cruces de 70%/90%; `proactive.budget_exhausted` indica rechazo de reservas. No contienen texto académico ni IDs de estudiante. El presupuesto global `luna-credit/pilot` no debe reiniciarse automáticamente: representa el máximo acumulado del piloto.

`GET /api/app/proactive/status` muestra estado y última revisión completa del propietario. `partial` no significa sin tareas. `connection_required` requiere renovar la conexión; se crea como máximo un aviso genérico de reconexión por siete días. `access_required` conserva los datos con su fecha y detiene consultas/envíos de contenido. Las purgas externas continúan aunque el seguimiento esté pausado.

Los eventos `proactive.review_committed` y `proactive.delivery_committed` registran estado, cobertura y contadores agregados; la web mide apertura de avisos, copia de pedidos, preferencias y eliminación, sin IDs de contexto ni contenido.

El worker limpia referencias de entrega de más de 30 días y ledgers diarios de más de 100 días/mensuales de más de 13 meses. El presupuesto acumulado del piloto queda intacto. No registrar prompts, extractos, notas, direcciones de correo ni endpoints push en observabilidad.

Para detener envíos de inmediato, apagar `SEND_ENABLED` y reiniciar el proceso con su cierre ordenado. Para detener lecturas, apagar `WORKER_ENABLED`; conservar un worker de mantenimiento mientras existan purgas pendientes. No borrar la base ni la clave de cifrado como método de pausa. Los errores de un proveedor no habilitan una alternativa local a las consultas universitarias.

## MCP

- `campus_get_week_brief`: resumen de una semana, hechos paginados, fuentes, cobertura y antigüedad.
- `campus_list_updates`: cambios detectados con valores anteriores, curso, fuente y fecha de detección; no afirma la fecha de publicación del profesor.
- `campus_get_prepared_context`: contexto por ID opaco; seguir `nextCursor` y `nextEvidenceCursor`.
- `campus_search_prepared_contexts`: búsqueda histórica propia; las referencias externas solo sirven si siguen existiendo y perteneciendo a la conexión autorizada.

El contexto distingue `lastCheckedAt` de `lastSuccessfulCheckAt`. La IA debe verificar fechas/estados vigentes con las herramientas de Blackboard antes de una decisión sobre una entrega.

## Qatom

La ruta opcional `/v1/proactive/qatom-fixture` acepta únicamente `{ "scenario": "week_brief" }` o `grade_change`, y requiere un token independiente. Devuelve datos ficticios y precio cero; no puede recibir una cuenta, leer PostgreSQL, acceder a Blackboard ni invocar IA. Sirve para probar el catálogo privado y contrato del premio. Registrar el endpoint HTTPS con ese esquema y precio cero solo en el entorno privado del equipo. No extenderlo a datos reales hasta verificar delegación por estudiante y condiciones comerciales. No asumir acumulación de Max y Pro ni que Qatom financie nuestros workers/tokens.

## Verificación local

Relay:

```sh
npx tsc -p tsconfig.relay.json --noEmit
npx tsx --test tests/proactive*.test.ts tests/web-mcp-guard.test.ts
```

La integración PostgreSQL se habilita con `CAMPUS_PROACTIVE_TEST_DATABASE_URL` y exige un host local y una base desechable llamada `campu_proactive_test`. Crea solamente el esquema mínimo de cuentas y la migración nueva. Nunca apuntarla a una base de trabajo real.

Web backend:

```sh
node --test src/app/proactive-http.test.ts src/app/auth.test.ts
```

Sitio (desde `site/`):

```sh
npm run check
npm run build
node scripts/proactive-e2e.mjs
node scripts/verify-offline-shell.mjs
node scripts/verify-session-cache.mjs
```

Los tests usan proveedores y notificaciones controlados. Se prueba el transporte MCP real y PostgreSQL real en local; esto no verifica los contratos comerciales, las credenciales de producción ni la entrega física a dispositivos.

## Resultado de la verificación de esta implementación

El 5 de noviembre de 2026 pasaron 29 pruebas del relay (incluyendo PostgreSQL local, transporte MCP, puente HTTP, firmas de webhooks, permisos y cierre ordenado) y 46 pruebas del backend web. El sitio compiló, pasó `astro check` sin errores y las pruebas de navegador a 390 y 1100 px. También pasaron el aislamiento de caché offline y los controles de sesión. No se hicieron llamadas de inferencia pagadas ni envíos reales; los adaptadores usaron respuestas controladas.
