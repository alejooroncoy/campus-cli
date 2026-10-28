import {Command} from 'commander';
import {MIUPC_TOOLS} from './mcp-tools.js';
import {queryLocalMiupc} from './local.js';
import {miupcQuerySchema} from './service.js';
export function miupcCommands(program:Command){
  const root=program.command('miupc').description('Consultas de Mi UPC y Mis Trámites con el SSO UPC guardado (JSON)');
  for(const tool of MIUPC_TOOLS){
    const name=tool.name.replace(/^miupc_(?:get_|list_)/,'').replaceAll('_','-');
    const cmd=root.command(name).description(tool.description);
    if(['attendance','grades'].includes(tool.kind))cmd.requiredOption('--course <code>','Código de miupc courses');
    if(tool.kind==='weekSchedule')cmd.option('--week-start <date>','Fecha YYYY-MM-DD');
    if(tool.kind==='procedureDetails')cmd.requiredOption('--procedure <name>','certificado_estudios, constancia_matricula o constancia_matricula_asignaturas').option('--program <id>','Programa propio');
    if(tool.kind==='procedureRequests')cmd.option('--closed','Solicitudes cerradas');
    if(tool.kind==='invoices')cmd.option('--year <year>','Año del comprobante');
    if(['publications','electives'].includes(tool.kind))cmd.option('--offset <n>','Desplazamiento').option('--limit <n>','Límite');
    if(tool.kind==='publications')cmd.option('--type <type>','news, communications o novelties').option('--include-body','Incluir texto completo');
    cmd.action(async opts=>{const q:Record<string,unknown>={kind:tool.kind};
      if(opts.course)q.courseCode=opts.course;if(opts.weekStart)q.weekStart=opts.weekStart;
      if(opts.procedure)q.procedure=opts.procedure;if(opts.program)q.programId=opts.program;
      if(tool.kind==='procedureRequests')q.scope=opts.closed?'closed':'active';
      for(const key of ['year','offset','limit'])if(opts[key]!==undefined)q[key]=Number(opts[key]);
      if(opts.type)q.type=opts.type;if(opts.includeBody)q.includeBody=true;
      console.log(JSON.stringify(await queryLocalMiupc(miupcQuerySchema.parse(q)),null,2));
    });
  }
}
