import { Command } from 'commander';
import { queryLocalUpn } from './local.js';
import type { UpnQuery } from './service.js';

export function upnCommands(program: Command) {
  const upn = program.command('upn').description('Consultas académicas de Mi Mundo UPN con la sesión UPN guardada (JSON)');
  const run = async (query: UpnQuery) => console.log(JSON.stringify(await queryLocalUpn(query), null, 2));
  for (const [name, kind, description] of [
    ['profile', 'profile', 'Ciclo declarado y carrera'], ['courses', 'courses', 'Cursos matriculados actuales'],
    ['period-schedule', 'periodSchedule', 'Horario del período por módulo'], ['history', 'history', 'Cursos y notas por período'],
    ['programs', 'programs', 'Programas inscritos'], ['calendar', 'calendar', 'Calendario académico'],
    ['services', 'services', 'Catálogo de servicios'], ['documents', 'documents', 'Reglamentos, manuales y estatutos'],
    ['procedures', 'procedures', 'Catálogo de trámites'], ['letters', 'letters', 'Cartas de presentación existentes'],
    ['enrollment-document', 'enrollmentDocument', 'Disponibilidad del consolidado de matrícula'], ['notices', 'notices', 'Avisos y notificaciones'],
  ] as const) upn.command(name).description(description).action(() => run({ kind }));
  upn.command('schedule').description('Horario de clases semanal').option('--week-start <date>', 'Fecha YYYY-MM-DD; por defecto semana actual en Lima')
    .action(opts => run({ kind: 'weekSchedule', weekStart: opts.weekStart }));
  for (const [name, kind, description] of [
    ['course-schedule', 'courseSchedule', 'Horario de un curso'], ['grades', 'grades', 'Notas y ponderaciones de un curso'],
    ['attendance', 'attendance', 'Asistencias y faltas permitidas'],
  ] as const) upn.command(`${name} <courseCode>`).description(description).action(courseCode => run({ kind, courseCode }));
  upn.command('record').description('Créditos y promedio del programa').option('--program <id>', 'Identificador de upn programs')
    .action(opts => run({ kind: 'record', programId: opts.program }));
  upn.command('procedure-details').description('Condiciones publicadas para la constancia de estudios; no crea una solicitud').option('--program <id>', 'Código de un programa inscrito')
    .action(opts => run({ kind: 'procedureDetails', procedure: 'constancia_estudios', programId: opts.program }));
  upn.command('requests').description('Solicitudes de trámite existentes').option('--closed', 'Consultar solicitudes cerradas')
    .action(opts => run({ kind: 'procedureRequests', scope: opts.closed ? 'closed' : 'active' }));
}
