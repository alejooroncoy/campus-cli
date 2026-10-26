import { Command } from 'commander';
import { Readable } from 'node:stream';
import { callRelayTool, withRelayClient } from './client.js';
import { RelayCredentialStore } from './auth.js';
import { loginLocally } from './local-login.js';
import { relayUrl } from './config.js';
import { downloadRoot, resolveDownloadDir, safeNewFilePath, writeNamedDownload } from '../security/files.js';
import { UPN_RELAY_TOOLS, MIUPC_RELAY_TOOLS } from './portal-tools.js';

export type RelayResult = Awaited<ReturnType<typeof callRelayTool>>;
export type RelayRunner = (name: string, args?: Record<string, unknown>) => Promise<RelayResult>;

function data(result: RelayResult): any {
  if (result.isError) throw new Error(JSON.stringify(result));
  if (result.structuredContent) return result.structuredContent;
  const content = result.content as Array<{ type: string; text?: string }>;
  if (content.length === 1 && content[0].type === 'text') {
    try { return JSON.parse(content[0].text!); } catch { /* payment/connection guidance is not data */ }
  }
  throw new Error(JSON.stringify(result));
}

function print(result: RelayResult): void {
  // Keep resource links, payment messages and other non-JSON output intact.
  let output: unknown = result;
  try { output = data(result); } catch { /* preserve the exact server result */ }
  console.log(JSON.stringify(output, null, 2));
  if (result.isError) process.exitCode = 1;
}

function jsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Los argumentos deben ser un objeto JSON.');
  return parsed;
}

export function relayCommands(program: Command, run: RelayRunner = callRelayTool): void {
  const login = async (opts: { university?: string; consentSessionUpload?: boolean }) => {
    console.error('Autorizando tu cuenta Campus e iniciando el login universitario local…');
    await loginLocally({ universityId: opts.university, consent: opts.consentSessionUpload });
    console.error('Sesión del relay guardada. Las consultas usan el plan y cupo de tu cuenta Campus.');
  };
  const logout = () => {
    new RelayCredentialStore(relayUrl()).clear();
    console.error('Sesión local del relay eliminada.');
  };
  const configureLogin = (command: Command) => command.option('--university <id>', 'Universidad: upc-pe, upn-pe o palermo-ar')
    .option('--consent-session-upload', 'Autorizar explícitamente el envío de la sesión al relay').action(login);
  configureLogin(program.command('login').description('Autorizar Campus y conectar tu universidad con Playwright local'));
  program.command('logout').description('Eliminar las credenciales del relay de este equipo').action(logout);
  const account = program.command('account').description('Cuenta conectada al relay de Campus');
  configureLogin(account.command('login').description('Alias de campus login'));
  account.command('logout').description('Alias de campus logout').action(logout);
  account.command('whoami').description('Comprobar la cuenta y conexión en el relay').action(async () => print(await run('campus_check_connection')));
  program.command('whoami').description('Perfil de estudiante a través del relay').action(async () => print(await run('blackboard_whoami')));
  program.command('status').description('Comprobar la conexión a través del relay').option('--json').action(async () => print(await run('campus_check_connection')));

  const tools = program.command('tools').description('Herramientas disponibles para tu cuenta en el relay');
  tools.command('list').description('Descubrir herramientas publicadas por el relay').action(async () => {
    console.log(JSON.stringify(await withRelayClient(async client => {
      const result: unknown[] = [];
      let cursor: string | undefined;
      do { const page = await client.listTools(cursor ? { cursor } : {}); result.push(...page.tools); cursor = page.nextCursor; } while (cursor);
      return { tools: result };
    }), null, 2));
  });
  tools.command('call <name>').description('Ejecutar una herramienta en el relay (resultado MCP completo)').option('--args <json>', 'Argumentos JSON', '{}')
    .action(async (name, opts) => {
      const result = await run(name, jsonObject(opts.args));
      console.log(JSON.stringify(result, null, 2));
      if (result.isError) process.exitCode = 1;
    });

  program.command('api <method> <path>').description('Consultar la API pública mediante el relay (solo GET)')
    .option('-q, --query <params>', 'Query string').option('-b, --body <json>', 'No disponible en el relay')
    .action(async (method, path, opts) => {
      if (method.toUpperCase() !== 'GET' || opts.body !== undefined) throw new Error('El relay solo permite lecturas GET de Blackboard.');
      print(await run('blackboard_raw_api', { path, ...(opts.query ? { query: opts.query } : {}) }));
    });
  program.command('api-docs').description('Ver las herramientas y esquemas vigentes del relay').action(async () => {
    console.log('Ejecuta campus tools list para ver los esquemas publicados por el relay.');
  });

  const courses = program.command('courses').description('Consultas de Blackboard mediante el relay (JSON)');
  courses.command('list').option('--json').option('--limit <n>', 'Compatibilidad: el relay controla el límite de cursos')
    .action(async () => print(await run('blackboard_list_courses')));
  for (const [command, tool] of [
    ['get <courseId>', 'blackboard_get_course'], ['announcements <courseId>', 'blackboard_list_announcements'],
    ['grades <courseId>', 'blackboard_get_grades'],
  ]) courses.command(command).option('--json').action(async courseId => print(await run(tool, { courseId })));
  courses.command('contents <courseId>').option('--json').option('--parent <parentId>').option('--type <type>')
    .action(async (courseId, opts) => {
      const result = await run('blackboard_list_contents', { courseId, ...(opts.parent ? { parentId: opts.parent } : {}) });
      if (!opts.type) { print(result); return; }
      const handler = { folder: 'folder', file: 'file', assignment: 'assignment', document: 'document', externallink: 'externallink' }[opts.type as string];
      if (!handler) throw new Error('Tipo de contenido desconocido.');
      const payload = data(result);
      if (!Array.isArray(payload.results)) throw new Error(JSON.stringify(result));
      console.log(JSON.stringify({ ...payload, results: payload.results.filter((item: any) => item.contentHandler?.id === `resource/x-bb-${handler}`) }, null, 2));
    });
  courses.command('members <courseId>').option('--json').option('--role <role>')
    .action(async (courseId, opts) => {
      if (opts.role) throw new Error('El relay devuelve los miembros visibles sin filtro por rol. Usa campus tools call blackboard_list_people.');
      print(await run('blackboard_list_people', { courseId }));
    });
  for (const [command, tool, hasMessage] of [
    ['discussions <courseId>', 'blackboard_list_discussions', false],
    ['discussion <courseId> <discussionId>', 'blackboard_get_discussion', false],
    ['discussion-messages <courseId> <discussionId>', 'blackboard_list_discussion_messages', false],
    ['discussion-replies <courseId> <discussionId> <messageId>', 'blackboard_list_discussion_replies', true],
  ] as const) {
    courses.command(command).option('--json').option('--title <title>').option('--gradable <value>')
      .option('--status <status>').option('--limit <n>').option('--offset <n>')
      .action(async (...values: any[]) => {
        const opts = values[values.length - 2];
        const args: Record<string, unknown> = { courseId: values[0] };
        if (command.includes('<discussionId>')) args.discussionId = values[1];
        if (hasMessage) args.messageId = values[2];
        for (const key of ['title', 'status']) if (opts[key] !== undefined) args[key] = opts[key];
        for (const key of ['limit', 'offset']) if (opts[key] !== undefined) args[key] = Number(opts[key]);
        if (opts.gradable !== undefined) {
          if (!['true', 'false'].includes(opts.gradable)) throw new Error('--gradable debe ser true o false');
          args.gradable = opts.gradable === 'true';
        }
        print(await run(tool, args));
      });
  }
  program.command('messages').description('List messages from your Blackboard inbox through the Campus relay').option('--json').option('--course <courseId>').option('--limit <n>').option('--offset <n>')
    .action(async opts => print(await run('blackboard_list_messages', {
      ...(opts.course ? { courseId: opts.course } : {}), ...(opts.limit ? { limit: Number(opts.limit) } : {}),
      ...(opts.offset ? { offset: Number(opts.offset) } : {}),
    })));

  const assignments = program.command('assignments').description('Evaluaciones de Blackboard mediante el relay');
  assignments.command('list [courseId]').description('List assignments and tasks in a course, or the relay weekly view').option('--json').option('--pending', 'No disponible: el relay no publica el estado completo de entrega')
    .action(async (courseId, opts) => {
      if (opts.pending) throw new Error('El relay publica las tareas con su estado. Usa campus assignments list <courseId> y revisa ese estado.');
      if (courseId) { print(await run('blackboard_list_assignments', { courseId })); return; }
      // The cross-course aggregation is itself a billed relay operation.
      print(await run('campus_get_week_data'));
    });
  assignments.command('attempts <courseId> <columnId>').option('--json')
    .action(async (courseId, columnId) => print(await run('blackboard_list_attempts', { courseId, columnId })));
  assignments.command('feedback <courseId> [columnId]').option('--json').option('--attempt <attemptId>')
    .action(async (courseId, columnId, opts) => {
      if (columnId || opts.attempt) throw new Error('El relay devuelve la retroalimentación del curso completo: campus assignments feedback <courseId>.');
      print(await run('blackboard_get_assignment_feedback', { courseId }));
    });
  assignments.command('submit <courseId> <columnId>').option('-f, --file <path>').option('-t, --text <content>')
    .option('-c, --comments <text>').option('--draft').option('--json').action(() => {
      throw new Error('El relay actual solo lee Blackboard; el envío y los borradores se realizan en Aula Virtual.');
    });

  const download = async (courseId: string, contentId: string, outputDir?: string) => {
    const directory = resolveDownloadDir(outputDir);
    const attachments = data(await run('blackboard_list_attachments', { courseId, contentId }));
    if (!Array.isArray(attachments.results)) throw new Error('El relay no devolvió una lista de archivos.');
    for (const file of attachments.results) {
      const result = await run('blackboard_get_download_link', { courseId, contentId, attachmentId: file.id, fileName: file.fileName });
      const ticket = data(result);
      safeNewFilePath(directory, ticket.fileName);
      const url = new URL(ticket.downloadUrl);
      if (url.origin !== relayUrl().origin || !url.pathname.startsWith('/d/')) throw new Error('Enlace de descarga ajeno al relay.');
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
      if (!response.ok || !response.body) throw new Error(`No se pudo descargar el archivo (${response.status}).`);
      const saved = await writeNamedDownload(Readable.fromWeb(response.body as any), directory, ticket.fileName, undefined, { root: downloadRoot() });
      console.log(JSON.stringify(saved));
    }
  };
  program.command('download <courseId> <contentId>').description('Descargar por enlaces del relay al directorio protegido de Campus')
    .option('-o, --out <dir>', 'Subdirectorio relativo bajo ~/Downloads/campus-cli')
    .action(async (courseId, contentId, opts) => download(courseId, contentId, opts.out));
  program.command('download-folder <courseId> <folderId>').description('Descargar archivos de una carpeta mediante el relay')
    .option('-o, --out <dir>', 'Subdirectorio relativo bajo ~/Downloads/campus-cli').option('--filter <keyword>')
    .action(async (courseId, folderId, opts) => {
      const visited = new Set<string>();
      const visit = async (parentId: string, depth: number) => {
        if (depth > 6 || visited.has(parentId)) return;
        visited.add(parentId);
        const contents = data(await run('blackboard_list_contents', { courseId, parentId }));
        if (!Array.isArray(contents.results)) throw new Error('El relay no devolvió contenidos de la carpeta.');
        for (const item of contents.results) {
          if (item.canListChildren === true) await visit(item.id, depth + 1);
          else if (item.contentHandler?.id === 'resource/x-bb-file' && (!opts.filter || item.title?.toLowerCase().includes(opts.filter.toLowerCase()))) await download(courseId, item.id, opts.out);
        }
      };
      await visit(folderId, 0);
    });

  portalCommands(program, 'upn', UPN_RELAY_TOOLS, run);
  portalCommands(program, 'miupc', MIUPC_RELAY_TOOLS, run);
}

function portalCommands(program: Command, prefix: string, definitions: ReadonlyArray<{ name: string; kind: string; description: string }>, run: RelayRunner) {
  const root = program.command(prefix).description(`Consultas ${prefix.toUpperCase()} mediante el relay (JSON)`);
  const upnNames: Record<string, string> = { weekSchedule: 'schedule', history: 'history', programs: 'programs', record: 'record', calendar: 'calendar', procedureRequests: 'requests' };
  for (const tool of definitions) {
    const name = (prefix === 'upn' ? upnNames[tool.kind] : undefined) ?? tool.name.replace(new RegExp(`^${prefix}_(?:get_|list_)`), '').replaceAll('_', '-');
    const positional = prefix === 'upn' && ['grades', 'attendance', 'courseSchedule'].includes(tool.kind);
    const cmd = root.command(`${name}${positional ? ' <courseCode>' : ''}`).description(tool.description);
    if (['grades', 'attendance'].includes(tool.kind) && !positional) cmd.requiredOption('--course <code>');
    if (tool.kind === 'weekSchedule') cmd.option('--week-start <date>');
    if (['record', 'procedureDetails'].includes(tool.kind)) cmd.option('--program <id>');
    if (tool.kind === 'procedureDetails' && prefix === 'miupc') cmd.requiredOption('--procedure <name>');
    if (tool.kind === 'procedureRequests') cmd.option('--closed');
    if (tool.kind === 'invoices') cmd.option('--year <year>');
    if (['publications', 'electives'].includes(tool.kind)) cmd.option('--offset <n>').option('--limit <n>');
    if (tool.kind === 'publications') cmd.option('--type <type>').option('--include-body');
    cmd.action(async (...values: any[]) => {
      const opts = values[values.length - 2];
      const args: Record<string, unknown> = {};
      if (positional) args.courseCode = values[0];
      for (const [option, argument] of [['course', 'courseCode'], ['weekStart', 'weekStart'], ['program', 'programId'], ['procedure', 'procedure'], ['type', 'type']]) if (opts[option] !== undefined) args[argument] = opts[option];
      for (const key of ['year', 'offset', 'limit']) if (opts[key] !== undefined) args[key] = Number(opts[key]);
      if (opts.includeBody) args.includeBody = true;
      if (tool.kind === 'procedureRequests') args.scope = opts.closed ? 'closed' : 'active';
      print(await run(tool.name, args));
    });
  }
}
