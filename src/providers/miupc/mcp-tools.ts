import {z} from 'zod';
import {miupcQuerySchema,miupcCourseCode,miupcProcedure,type MiupcQuery} from './service.js';
const page={offset:z.number().int().min(0).max(5000).default(0),limit:z.number().int().min(1).max(100).default(30)};
const course={courseCode:miupcCourseCode.describe('Código de miupc_list_courses, nunca un ID Blackboard.')};
export const MIUPC_TOOLS=[
{name:"miupc_get_profile",kind:"profile",schema:{},description:"Ciclo y carrera declarados. No acredita cambios anteriores de carrera."},
{name:"miupc_list_programs",kind:"programs",schema:{},description:"Programas propios registrados."},
{name:"miupc_list_menu",kind:"menu",schema:{},description:"Áreas y enlaces publicados. No acredita acceso a sistemas externos."},
{name:"miupc_list_courses",kind:"courses",schema:{},description:"Matrícula actual, secciones, créditos y docentes. Los códigos son de Mi UPC, distintos de Blackboard."},
{name:"miupc_get_period_schedule",kind:"schedule",schema:{},description:"Horario del período: fechas, horas, aulas, módulos y feriados publicados. No confirma cancelaciones."},
{name:"miupc_get_weekly_schedule",kind:"weekSchedule",schema:{weekStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()},description:"Horario de una semana en Lima, con fechas publicadas. No establece entregas Blackboard."},
{name:"miupc_list_periods",kind:"periods",schema:{},description:"Períodos publicados para la modalidad propia."},
{name:"miupc_get_academic_calendar",kind:"calendar",schema:{},description:"Calendario general, distinto de los vencimientos de tareas Blackboard."},
{name:"miupc_get_academic_history",kind:"history",schema:{},description:"Historial por período, notas, créditos y méritos. Los convalidados se consultan en situación académica."},
{name:"miupc_get_academic_status",kind:"academicStatus",schema:{},description:"Avance, cumplimiento curricular y requisitos de egreso publicados. No certifica elegibilidad para trámites."},
{name:"miupc_get_curriculum",kind:"curriculum",schema:{},description:"Malla del período catálogo propio, créditos y requisitos. No confirma cupos."},
{name:"miupc_list_electives",kind:"electives",schema:page,description:"Catálogo paginado de electivos del programa. No es disponibilidad de secciones ni cupos."},
{name:"miupc_get_grades",kind:"grades",schema:course,description:"Notas, ponderaciones y fórmula de un curso matriculado. null no es cero. No sustituye retroalimentación Blackboard."},
{name:"miupc_get_attendance",kind:"attendance",schema:course,description:"Inasistencias registradas de un curso propio y totales originales. Tardanzas no disponibles: nunca deducirlas de los totales."},
{name:"miupc_list_services",kind:"services",schema:{},description:"Catálogo personalizado de servicios y enlaces, sin abrir sistemas externos."},
{name:"miupc_list_documents",kind:"documents",schema:{},description:"Reglamentos y documentos publicados. Solo metadatos y enlaces, sin afirmar lectura del PDF."},
{name:"miupc_list_procedures",kind:"procedures",schema:{},description:"Catálogo de trámites con precio y plazo publicados. Visibilidad no demuestra elegibilidad; no crea solicitudes."},
{name:"miupc_get_procedure_details",kind:"procedureDetails",schema:{procedure:miupcProcedure,programId:z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional()},description:"Condiciones publicadas de certificado de estudios o constancias de matrícula. No valida elegibilidad ni genera vista previa o solicitud."},
{name:"miupc_list_procedure_requests",kind:"procedureRequests",schema:{scope:z.enum(['active','closed']).default('active')},description:"Bandeja nueva de trámites activos o cerrados. Una lista vacía no excluye Mis Trámites, Power Apps o Sócrates."},
{name:"miupc_list_legacy_procedure_requests",kind:"legacyRequests",schema:{},description:"Bandeja autenticada de Mis Trámites UPC, separada de la nueva. Estados originales; PROCEDE no equivale a entregado. No abre detalle ni descarga."},
{name:"miupc_list_notifications",kind:"notifications",schema:{},description:"Notificaciones sin marcarlas como leídas."},
{name:"miupc_list_notices",kind:"notices",schema:{},description:"Avisos publicados para el perfil actual."},
{name:"miupc_list_publications",kind:"publications",schema:{type:z.enum(['news','communications','novelties']).default('news'),offset:page.offset,limit:z.number().int().min(1).max(50).default(10),includeBody:z.boolean().default(false)},description:"Noticias, comunicados o novedades paginados. includeBody permite leer el texto publicado."},
{name:"miupc_list_reservations",kind:"reservations",schema:{},description:"Reservas propias existentes desde la fecha actual en Lima. No crea ni cancela reservas."},
{name:"miupc_list_reservation_services",kind:"reservationServices",schema:{},description:"Catálogo de accesos para reservas. No confirma cupos o acceso autenticado externo."},
{name:"miupc_list_advisors",kind:"advisors",schema:{},description:"Asesores institucionales publicados para el perfil; sin teléfonos personales."},
{name:"miupc_get_delegate_record",kind:"delegates",schema:{},description:"Registro propio de acreditación como delegado. No lista alumnos ni registra candidaturas."},
{name:"miupc_list_payments",kind:"payments",schema:{},description:"Documentos pendientes con moneda, estado, mora y montos originales. No inicia pagos."},
{name:"miupc_list_invoices",kind:"invoices",schema:{year:z.number().int().min(2000).max(2100).optional()},description:"Comprobantes por año. Conserva COBRADO y ANULADO: no sumar anulados como pagados. No descarga documentos."},
{name:"miupc_get_billing_calendar",kind:"billingCalendar",schema:{},description:"Calendario publicado de facturación de Pregrado, distinto del estado personal de deuda."},
{name:"miupc_get_planning_content",kind:"planning",schema:{},description:"Contenido publicado de planificación; no crea planes ni cambia matrícula Banner."},

] as const;
type Result={content:Array<{type:'text';text:string}>;isError?:boolean};
export type MiupcToolOptions={execute?:(query:MiupcQuery)=>Promise<Record<string,unknown>>;wrap?:(name:string,args:Record<string,unknown>,run:()=>Promise<Result>)=>Promise<Result>};
export function registerMiupcTools(server:{registerTool:(...args:any[])=>any},options:MiupcToolOptions={}){
  for(const tool of MIUPC_TOOLS)server.registerTool(tool.name,{title:tool.name,description:tool.description,inputSchema:tool.schema,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async(args:Record<string,unknown>)=>{
    const query=miupcQuerySchema.parse({...args,kind:tool.kind});
    const run=async():Promise<Result>=>{const execute=options.execute??(await import('./local.js')).queryLocalMiupc;return{content:[{type:'text',text:JSON.stringify(await execute(query))}]};};
    return options.wrap?options.wrap(tool.name,args,run):run();
  });
}
