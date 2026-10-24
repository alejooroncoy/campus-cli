# Mi UPC y Mis Trámites en Campus

Se añadieron **31 consultas de lectura** a CLI y MCP. La sesión UPC guardada se renueva con el flujo normal cuando vence, se verifica contra Blackboard y se usa para autenticar Mi UPC mediante Microsoft SSO. Una sesión UPN se rechaza antes de enviar credenciales. No se cambia la universidad ni la cuenta del estudiante.

La validación real se hizo con una cuenta UPC de Pregrado (UG/AC), el 24 de octubre de 2026. Otras modalidades y esquemas sin ejemplo positivo necesitan validación adicional. El calendario de facturación solo se ofrece para la modalidad verificada AC.

## Uso desde terminal

```sh
campus login --university upc-pe  # si todavía no hay sesión UPC
campus miupc profile
campus miupc courses
campus miupc attendance --course CODIGO_DE_MIUPC
campus miupc grades --course CODIGO_DE_MIUPC
campus miupc weekly-schedule
campus miupc academic-status
campus miupc academic-history
campus miupc curriculum
campus miupc electives --offset 0 --limit 30
campus miupc procedures
campus miupc procedure-details --procedure constancia_matricula
campus miupc procedure-requests
campus miupc procedure-requests --closed
campus miupc legacy-procedure-requests
campus miupc payments
campus miupc invoices --year 2026
campus miupc --help
```

Los códigos de curso se obtienen de `miupc courses`; son diferentes de los IDs de Blackboard. No se aceptan códigos de otros estudiantes, URLs, métodos HTTP o consultas arbitrarias.

## Consultas MCP

| Área | Herramientas |
|---|---|
| Perfil y navegación | `miupc_get_profile`, `miupc_list_programs`, `miupc_list_menu` |
| Matrícula y horario | `miupc_list_courses`, `miupc_get_period_schedule`, `miupc_get_weekly_schedule`, `miupc_list_periods`, `miupc_get_academic_calendar` |
| Notas y asistencia | `miupc_get_grades`, `miupc_get_attendance` |
| Avance | `miupc_get_academic_history`, `miupc_get_academic_status`, `miupc_get_curriculum`, `miupc_list_electives`, `miupc_get_delegate_record` |
| Trámites | `miupc_list_procedures`, `miupc_get_procedure_details`, `miupc_list_procedure_requests`, `miupc_list_legacy_procedure_requests` |
| Finanzas | `miupc_list_payments`, `miupc_list_invoices`, `miupc_get_billing_calendar` |
| Servicios y reservas | `miupc_list_services`, `miupc_list_documents`, `miupc_list_reservations`, `miupc_list_reservation_services`, `miupc_list_advisors` |
| Informativo | `miupc_list_notifications`, `miupc_list_notices`, `miupc_list_publications`, `miupc_get_planning_content` |

Electivos y publicaciones tienen paginación. Los campos de texto publicados se normalizan a texto plano y se limitan a 16 000 caracteres por campo. Publicaciones devuelve resúmenes por defecto y permite `includeBody`. Los horarios semanales usan fechas de Lima; el horario del período conserva las fechas publicadas y puede ser más extenso.

## Interpretación correcta

- **Tardanzas:** no se encontró un contador o estado verificable. Se devuelve `tardiness.status=not_available` y `count=null`. Nunca calcular tardanzas restando clases programadas, asistidas y faltas.
- **Asíncronos:** la respuesta específica sin asistencia se informa como `not_reported`, con resumen nulo. No equivale a cero faltas.
- **Notas:** `null` permanece nulo. La fórmula y los pesos originales se conservan. Blackboard sigue siendo la fuente del detalle de entregas y retroalimentación; Banner mantiene el historial oficial.
- **Períodos:** matrícula, período Banner y período catálogo son campos distintos y se usan en sus respectivos endpoints.
- **Carrera:** ciclo y programa actuales no demuestran ni descartan un cambio de carrera anterior.
- **Malla y electivos:** catálogo y requisitos no confirman cupos ni oferta de secciones. Los convalidados se revisan en situación académica.
- **Trámites:** consultar las dos bandejas. La nueva de Mi UPC puede estar vacía mientras Mis Trámites contiene registros. Power Apps y Sócrates no están incluidos en esas dos respuestas. `PROCEDE` no prueba por sí solo que el documento fue entregado.
- **Condiciones de trámites:** certificado de estudios, constancia de matrícula y constancia con asignaturas tienen detalle verificado. Precio, plazo y visibilidad no constituyen validación de elegibilidad. No se genera vista previa porque el portal puede crear una solicitud al hacerlo.
- **Pagos:** moneda, montos, mora y estados se conservan sin agregaciones entre monedas. Los comprobantes `ANULADO` no se cuentan como pagos realizados. La API de filtros omite el año actual: se permite además el año calendario de Lima, como la vista del portal.
- **Reservas y enlaces:** una respuesta explícita de “no reservas” es válida; un error no significa una bandeja vacía. Los enlaces del catálogo no acreditan acceso al servicio externo.

## Relay y protección de sesión

El relay registra las 31 herramientas únicamente para una conexión UPC (incluye conexiones antiguas sin universidad explícita). UPN conserva sus 19 herramientas. El usuario de Campus se vincula a su propia conexión y a su identidad Blackboard; los argumentos MCP nunca eligen al estudiante.

El worker abre el grant SSO cifrado ligado a conexión/universidad. OAuth usa PKCE, estado, nonce y verificación criptográfica del ID token. Mi UPC y Mis Trámites mantienen credenciales temporales solo en memoria; no reemplazan grants de Blackboard, UPN o Banner. Mis Trámites sigue exclusivamente los redirects de autenticación observados: el único POST permitido es la aserción SAML hacia `/Saml2/Acs`. Se comprueba el propietario en el HTML antes de devolver filas y se incluyen las filas ocultas de la paginación del documento. Esto no certifica un historial histórico completo.

Las consultas de datos son GET contra orígenes fijos. No se crea ninguna solicitud, vista previa, pago o reserva; no se modifican datos ni se marcan notificaciones como leídas. No se exponen cookies, tokens, enlaces privados firmados, documentos de identidad, contactos personales ni identificadores internos de los clientes de facturación. El límite de salida hacia proveedores es cuatro llamadas simultáneas.

## Cobertura pendiente

No equivale al 100% de todos los sistemas UPC. Power Apps exige una aceptación de términos que no se realizó; Sócrates y los servicios externos requieren revisión propia. La guía `/matricula` quedó cargando al 0%; el rol de exámenes respondió con `unsupported locale setting`, por lo que no se afirmó que no hubiera exámenes. EPE, registros positivos de reservas y solicitudes de la bandeja nueva, detalle/descarga de solicitudes y documentos personales necesitan ejemplos autorizados adicionales. Las operaciones de envío o pago requieren un trabajo y autorización específicos.

La exploración y la matriz completa están en [el informe](../recon/mi-upc-2026-10-24.md). Son APIs internas sin contrato de estabilidad: cambios del portal deben producir un error explícito y volver a validarse.
