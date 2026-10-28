import { z } from 'zod';
import { upnCourseCode, upnQuerySchema, type UpnQuery } from './service.js';

const course = { courseCode: upnCourseCode.describe('Código de upn_list_courses; nunca un ID de Blackboard.') };
export const UPN_TOOLS = [
  { name: 'upn_get_profile', title: 'Ver ciclo y carrera UPN', kind: 'profile', schema: {}, description: 'Read Mi Mundo UPN academic profile, including the portal-declared cycle and career. Does not establish career-change history.' },
  { name: 'upn_list_courses', title: 'Ver cursos matriculados UPN', kind: 'courses', schema: {}, description: 'List current Mi Mundo UPN enrollment: course codes, sections, credits, teachers and published meetings. Use upn_get_academic_history for previous periods.' },
  { name: 'upn_get_weekly_schedule', title: 'Ver horario semanal UPN', kind: 'weekSchedule', schema: { weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Fecha YYYY-MM-DD de la semana; por defecto la actual en Lima.') }, description: 'Read the published UPN class timetable for a week: days, times and available rooms. This is not a task/deadline calendar and does not confirm cancellations.' },
  { name: 'upn_get_period_schedule', title: 'Ver horario del período UPN', kind: 'periodSchedule', schema: {}, description: 'Read current Mi Mundo UPN timetable grouped by module and course.' },
  { name: 'upn_get_course_schedule', title: 'Ver horario de un curso UPN', kind: 'courseSchedule', schema: course, description: 'Read the published timetable for one currently enrolled Mi Mundo UPN course.' },
  { name: 'upn_get_grades', title: 'Ver notas de un curso UPN', kind: 'grades', schema: course, description: 'Read current UPN course assessments and weights. Raw 00 has unknown publication status; a PROMEDIO FINAL row does not establish a closed final grade.' },
  { name: 'upn_get_attendance', title: 'Ver asistencias UPN', kind: 'attendance', schema: course, description: 'Read attendance sessions, raw status codes and permitted absences for one currently enrolled UPN course.' },
  { name: 'upn_get_academic_history', title: 'Ver historial académico UPN', kind: 'history', schema: {}, description: 'Read UPN course history by period, grades, credits and status. Repeated courses are separate records. Does not prove career changes.' },
  { name: 'upn_list_programs', title: 'Ver programas inscritos UPN', kind: 'programs', schema: {}, description: 'Read programs registered to the authenticated UPN student; not an audit of past career changes.' },
  { name: 'upn_get_academic_record', title: 'Ver créditos y promedio UPN', kind: 'record', schema: { programId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional().describe('Programa de upn_list_programs; puede omitirse si solo hay uno.') }, description: 'Read UPN registered, passed, pending and transferred credits and program average for a registered program.' },
  { name: 'upn_get_academic_calendar', title: 'Ver calendario académico UPN', kind: 'calendar', schema: {}, description: 'Read UPN academic calendar activities and dates; does not establish Blackboard assignment publication or deadlines.' },
  { name: 'upn_list_services', title: 'Ver servicios UPN', kind: 'services', schema: {}, description: 'Read the Mi Mundo UPN service catalog for this profile. Links to other portals do not prove authenticated access there.' },
  { name: 'upn_list_documents', title: 'Ver reglamentos y documentos UPN', kind: 'documents', schema: {}, description: 'List published regulations, manuals and statutes with document links. Does not read PDF content or list personal certificates.' },
  { name: 'upn_list_procedures', title: 'Ver catálogo de trámites UPN', kind: 'procedures', schema: {}, description: 'Read the general and personalized procedure catalogs. A visible button does not establish eligibility. Does not create applications.' },
  { name: 'upn_get_procedure_details', title: 'Consultar constancia de estudios UPN', kind: 'procedureDetails', schema: { procedure: z.literal('constancia_estudios').default('constancia_estudios'), programId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional() }, description: 'Read published purposes, exclusions, price and delivery time for a study certificate and a registered program. Does not certify eligibility or create a preview/application.' },
  { name: 'upn_list_procedure_requests', title: 'Consultar estado de trámites UPN', kind: 'procedureRequests', schema: { scope: z.enum(['active','closed']).default('active') }, description: 'Read existing active or closed procedure requests of this account. Empty lists are valid. No payments, request creation or document downloads.' },
  { name: 'upn_list_letters', title: 'Consultar cartas de presentación UPN', kind: 'letters', schema: {}, description: 'List existing presentation letters. Does not create or download a letter.' },
  { name: 'upn_get_enrollment_document', title: 'Consultar consolidado de matrícula UPN', kind: 'enrollmentDocument', schema: {}, description: 'Check whether the enrollment summary document is available and link to its official portal view. Does not return signed private URLs or read PDF contents.' },
  { name: 'upn_list_notices', title: 'Consultar avisos UPN', kind: 'notices', schema: {}, description: 'Read notices and notification categories without marking messages read.' },
] as const;
export type UpnToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
export type UpnToolOptions = {
  execute?: (query: UpnQuery) => Promise<Record<string, unknown>>;
  wrap?: (name: string, args: Record<string, unknown>, run: () => Promise<UpnToolResult>) => Promise<UpnToolResult>;
};
/** Structurally typed so the hosted relay can reuse the same schemas and contract. */
export function registerUpnTools(server: { registerTool: (...args: any[]) => any }, options: UpnToolOptions = {}) {
  for (const tool of UPN_TOOLS) {
    server.registerTool(tool.name, { title: tool.title, description: tool.description,
      inputSchema: tool.schema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    async (args: Record<string, unknown>) => {
      const query = upnQuerySchema.parse({ ...args, kind: tool.kind });
      const run = async (): Promise<UpnToolResult> => {
        const execute = options.execute ?? (await import('./local.js')).queryLocalUpn;
        return { content: [{ type: 'text', text: JSON.stringify(await execute(query)) }] };
      };
      return options.wrap ? options.wrap(tool.name, args, run) : run();
    });
  }
}
