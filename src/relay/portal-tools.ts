// CLI labels only. Keep in sync with the provider contracts; covered by relay-client.test.ts.
export const UPN_RELAY_TOOLS = [
  {
    "name": "upn_get_profile",
    "kind": "profile",
    "description": "Read Mi Mundo UPN academic profile, including the portal-declared cycle and career. Does not establish career-change history."
  },
  {
    "name": "upn_list_courses",
    "kind": "courses",
    "description": "List current Mi Mundo UPN enrollment: course codes, sections, credits, teachers and published meetings. Use upn_get_academic_history for previous periods."
  },
  {
    "name": "upn_get_weekly_schedule",
    "kind": "weekSchedule",
    "description": "Read the published UPN class timetable for a week: days, times and available rooms. This is not a task/deadline calendar and does not confirm cancellations."
  },
  {
    "name": "upn_get_period_schedule",
    "kind": "periodSchedule",
    "description": "Read current Mi Mundo UPN timetable grouped by module and course."
  },
  {
    "name": "upn_get_course_schedule",
    "kind": "courseSchedule",
    "description": "Read the published timetable for one currently enrolled Mi Mundo UPN course."
  },
  {
    "name": "upn_get_grades",
    "kind": "grades",
    "description": "Read current UPN course assessments and weights. Raw 00 has unknown publication status; a PROMEDIO FINAL row does not establish a closed final grade."
  },
  {
    "name": "upn_get_attendance",
    "kind": "attendance",
    "description": "Read attendance sessions, raw status codes and permitted absences for one currently enrolled UPN course."
  },
  {
    "name": "upn_get_academic_history",
    "kind": "history",
    "description": "Read UPN course history by period, grades, credits and status. Repeated courses are separate records. Does not prove career changes."
  },
  {
    "name": "upn_list_programs",
    "kind": "programs",
    "description": "Read programs registered to the authenticated UPN student; not an audit of past career changes."
  },
  {
    "name": "upn_get_academic_record",
    "kind": "record",
    "description": "Read UPN registered, passed, pending and transferred credits and program average for a registered program."
  },
  {
    "name": "upn_get_academic_calendar",
    "kind": "calendar",
    "description": "Read UPN academic calendar activities and dates; does not establish Blackboard assignment publication or deadlines."
  },
  {
    "name": "upn_list_services",
    "kind": "services",
    "description": "Read the Mi Mundo UPN service catalog for this profile. Links to other portals do not prove authenticated access there."
  },
  {
    "name": "upn_list_documents",
    "kind": "documents",
    "description": "List published regulations, manuals and statutes with document links. Does not read PDF content or list personal certificates."
  },
  {
    "name": "upn_list_procedures",
    "kind": "procedures",
    "description": "Read the general and personalized procedure catalogs. A visible button does not establish eligibility. Does not create applications."
  },
  {
    "name": "upn_get_procedure_details",
    "kind": "procedureDetails",
    "description": "Read published purposes, exclusions, price and delivery time for a study certificate and a registered program. Does not certify eligibility or create a preview/application."
  },
  {
    "name": "upn_list_procedure_requests",
    "kind": "procedureRequests",
    "description": "Read existing active or closed procedure requests of this account. Empty lists are valid. No payments, request creation or document downloads."
  },
  {
    "name": "upn_list_letters",
    "kind": "letters",
    "description": "List existing presentation letters. Does not create or download a letter."
  },
  {
    "name": "upn_get_enrollment_document",
    "kind": "enrollmentDocument",
    "description": "Check whether the enrollment summary document is available and link to its official portal view. Does not return signed private URLs or read PDF contents."
  },
  {
    "name": "upn_list_notices",
    "kind": "notices",
    "description": "Read notices and notification categories without marking messages read."
  }
] as const;
export const MIUPC_RELAY_TOOLS = [
  {
    "name": "miupc_get_profile",
    "kind": "profile",
    "description": "Ciclo y carrera declarados. No acredita cambios anteriores de carrera."
  },
  {
    "name": "miupc_list_programs",
    "kind": "programs",
    "description": "Programas propios registrados."
  },
  {
    "name": "miupc_list_menu",
    "kind": "menu",
    "description": "Áreas y enlaces publicados. No acredita acceso a sistemas externos."
  },
  {
    "name": "miupc_list_courses",
    "kind": "courses",
    "description": "Matrícula actual, secciones, créditos y docentes. Los códigos son de Mi UPC, distintos de Blackboard."
  },
  {
    "name": "miupc_get_period_schedule",
    "kind": "schedule",
    "description": "Horario del período: fechas, horas, aulas, módulos y feriados publicados. No confirma cancelaciones."
  },
  {
    "name": "miupc_get_weekly_schedule",
    "kind": "weekSchedule",
    "description": "Horario de una semana en Lima, con fechas publicadas. No establece entregas Blackboard."
  },
  {
    "name": "miupc_list_periods",
    "kind": "periods",
    "description": "Períodos publicados para la modalidad propia."
  },
  {
    "name": "miupc_get_academic_calendar",
    "kind": "calendar",
    "description": "Calendario general, distinto de los vencimientos de tareas Blackboard."
  },
  {
    "name": "miupc_get_academic_history",
    "kind": "history",
    "description": "Historial por período, notas, créditos y méritos. Los convalidados se consultan en situación académica."
  },
  {
    "name": "miupc_get_academic_status",
    "kind": "academicStatus",
    "description": "Avance, cumplimiento curricular y requisitos de egreso publicados. No certifica elegibilidad para trámites."
  },
  {
    "name": "miupc_get_curriculum",
    "kind": "curriculum",
    "description": "Malla del período catálogo propio, créditos y requisitos. No confirma cupos."
  },
  {
    "name": "miupc_list_electives",
    "kind": "electives",
    "description": "Catálogo paginado de electivos del programa. No es disponibilidad de secciones ni cupos."
  },
  {
    "name": "miupc_get_grades",
    "kind": "grades",
    "description": "Notas, ponderaciones y fórmula de un curso matriculado. null no es cero. No sustituye retroalimentación Blackboard."
  },
  {
    "name": "miupc_get_attendance",
    "kind": "attendance",
    "description": "Inasistencias registradas de un curso propio y totales originales. Tardanzas no disponibles: nunca deducirlas de los totales."
  },
  {
    "name": "miupc_list_services",
    "kind": "services",
    "description": "Catálogo personalizado de servicios y enlaces, sin abrir sistemas externos."
  },
  {
    "name": "miupc_list_documents",
    "kind": "documents",
    "description": "Reglamentos y documentos publicados. Solo metadatos y enlaces, sin afirmar lectura del PDF."
  },
  {
    "name": "miupc_list_procedures",
    "kind": "procedures",
    "description": "Catálogo de trámites con precio y plazo publicados. Visibilidad no demuestra elegibilidad; no crea solicitudes."
  },
  {
    "name": "miupc_get_procedure_details",
    "kind": "procedureDetails",
    "description": "Condiciones publicadas de certificado de estudios o constancias de matrícula. No valida elegibilidad ni genera vista previa o solicitud."
  },
  {
    "name": "miupc_list_procedure_requests",
    "kind": "procedureRequests",
    "description": "Bandeja nueva de trámites activos o cerrados. Una lista vacía no excluye Mis Trámites, Power Apps o Sócrates."
  },
  {
    "name": "miupc_list_other_procedures",
    "kind": "otherProcedures",
    "description": "Otros trámites publicados y sus enlaces; no acredita acceso ni elegibilidad."
  },
  {
    "name": "miupc_list_procedure_access",
    "kind": "procedureAccess",
    "description": "Accesos rápidos publicados para trámites. No abre solicitudes."
  },
  {
    "name": "miupc_list_other_procedure_access",
    "kind": "otherProcedureAccess",
    "description": "Accesos rápidos de otros trámites. Solo catálogo."
  },
  {
    "name": "miupc_list_legacy_procedure_catalog",
    "kind": "legacyProcedureCatalog",
    "description": "Catálogo clásico publicado, separado de las bandejas personales."
  },
  {
    "name": "miupc_get_exam_schedule",
    "kind": "examSchedule",
    "description": "Consulta el rol de exámenes de Mi UPC. Si la fuente falla devuelve unavailable y exams:null; nunca equivale a sin exámenes."
  },
  {
    "name": "miupc_list_powerapps_procedures",
    "kind": "powerAppsCatalog",
    "description": "Grupos de trámites publicados en Power Apps. Visibilidad no acredita elegibilidad."
  },
  {
    "name": "miupc_list_powerapps_requests",
    "kind": "powerAppsRequests",
    "description": "Bandeja personal Power Apps con estados originales. Separada de Mi UPC, Mis Trámites y Sócrates; PROCEDE no implica entregado."
  },
  {
    "name": "miupc_list_legacy_procedure_requests",
    "kind": "legacyRequests",
    "description": "Bandeja autenticada de Mis Trámites UPC, separada de la nueva. Estados originales; PROCEDE no equivale a entregado. No abre detalle ni descarga."
  },
  {
    "name": "miupc_list_notifications",
    "kind": "notifications",
    "description": "Notificaciones sin marcarlas como leídas."
  },
  {
    "name": "miupc_list_notices",
    "kind": "notices",
    "description": "Avisos publicados para el perfil actual."
  },
  {
    "name": "miupc_list_publications",
    "kind": "publications",
    "description": "Noticias, comunicados o novedades paginados. includeBody permite leer el texto publicado."
  },
  {
    "name": "miupc_list_reservations",
    "kind": "reservations",
    "description": "Reservas propias existentes desde la fecha actual en Lima. No crea ni cancela reservas."
  },
  {
    "name": "miupc_list_reservation_services",
    "kind": "reservationServices",
    "description": "Catálogo de accesos para reservas. No confirma cupos o acceso autenticado externo."
  },
  {
    "name": "miupc_list_advisors",
    "kind": "advisors",
    "description": "Asesores institucionales publicados para el perfil; sin teléfonos personales."
  },
  {
    "name": "miupc_get_delegate_record",
    "kind": "delegates",
    "description": "Registro propio de acreditación como delegado. No lista alumnos ni registra candidaturas."
  },
  {
    "name": "miupc_list_payments",
    "kind": "payments",
    "description": "Documentos pendientes con moneda, estado, mora y montos originales. No inicia pagos."
  },
  {
    "name": "miupc_list_invoices",
    "kind": "invoices",
    "description": "Comprobantes por año. Conserva COBRADO y ANULADO: no sumar anulados como pagados. No descarga documentos."
  },
  {
    "name": "miupc_get_billing_calendar",
    "kind": "billingCalendar",
    "description": "Calendario publicado de facturación de Pregrado, distinto del estado personal de deuda."
  },
  {
    "name": "miupc_get_planning_content",
    "kind": "planning",
    "description": "Contenido publicado de planificación; no crea planes ni cambia matrícula Banner."
  }
] as const;
