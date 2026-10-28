import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {decodeHTML} from 'entities';
import {MIUPC_API,MIUPC_PORTAL,MIUPC_PROCEDURES_API,MiupcPortalError,type MiupcAccess,type MiupcFetch} from './auth.js';
export * from './auth.js';
type Row=Record<string,any>;
const simple=<T extends string>(kind:T)=>z.object({kind:z.literal(kind)}).strict();
export const miupcCourseCode=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/);
export const miupcProcedure=z.enum(['certificado_estudios','constancia_matricula','constancia_matricula_asignaturas']);
export const miupcQuerySchema=z.discriminatedUnion('kind',[
  simple('profile'),simple('programs'),simple('menu'),simple('courses'),simple('schedule'),simple('periods'),simple('calendar'),
  simple('history'),simple('academicStatus'),simple('curriculum'),simple('services'),simple('documents'),simple('procedures'),
  simple('legacyRequests'),simple('notifications'),simple('notices'),simple('reservations'),simple('reservationServices'),simple('advisors'),
  simple('delegates'),simple('payments'),simple('billingCalendar'),simple('planning'),
  z.object({kind:z.literal('weekSchedule'),weekStart:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()}).strict(),
  z.object({kind:z.literal('electives'),offset:z.number().int().min(0).max(5000).default(0),limit:z.number().int().min(1).max(100).default(30)}).strict(),
  z.object({kind:z.literal('attendance'),courseCode:miupcCourseCode}).strict(),
  z.object({kind:z.literal('grades'),courseCode:miupcCourseCode}).strict(),
  z.object({kind:z.literal('procedureRequests'),scope:z.enum(['active','closed']).default('active')}).strict(),
  z.object({kind:z.literal('procedureDetails'),procedure:miupcProcedure,programId:z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional()}).strict(),
  z.object({kind:z.literal('publications'),type:z.enum(['news','communications','novelties']).default('news'),offset:z.number().int().min(0).max(5000).default(0),limit:z.number().int().min(1).max(50).default(10),includeBody:z.boolean().default(false)}).strict(),
  z.object({kind:z.literal('invoices'),year:z.number().int().min(2000).max(2100).optional()}).strict(),
]);
export type MiupcQuery=z.infer<typeof miupcQuerySchema>;
export function miupcWeekRange(date?:string,now=new Date()){
  const day=date??new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const start=new Date(day+'T00:00:00Z');if(!Number.isFinite(start.getTime())||start.toISOString().slice(0,10)!==day)throw new MiupcPortalError('MIUPC_INVALID_RESPONSE','Fecha inválida. Usa YYYY-MM-DD.');
  start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);const end=new Date(start);end.setUTCDate(end.getUTCDate()+6);
  return{start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
}
const meetingFields=['titulo','nrc','descripMetodoEducativo','descripMateria','codSeccion','descripPartePeriodo','desModalidad','descripAula','descripCampus','descripEdificio','fechaInicio','fechaFin','diaNombre','diaNumero','horaInicio','horaFin','codCurso','modulo','fechaInicioCurso','fechaFinCurso','estado','tipoClase'];
const invalid=()=>new MiupcPortalError('MIUPC_INVALID_RESPONSE','Mi UPC devolvió una respuesta no reconocida.');
const unavailable=()=>new MiupcPortalError('MIUPC_UNAVAILABLE','Mi UPC no respondió correctamente. Intenta nuevamente.');
const reconnect=()=>new MiupcPortalError('MIUPC_RECONNECT_REQUIRED','Vuelve a conectar tu cuenta UPC para consultar Mi UPC.');
const object=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
const rows=(v:unknown):Row[]=>{if(!Array.isArray(v)||!v.every(object))throw invalid();return v;};
const pick=(v:Row,fields:string[]):Row=>Object.fromEntries(fields.filter(k=>Object.hasOwn(v,k)).map(k=>[k,v[k]]));
const text=(v:unknown):string|null=>typeof v==='string'?decodeHTML(v).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<\/(?:p|li|div|h\d)>|<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').trim().slice(0,16000):null;
export function miupcPublicLink(v:unknown):string|null{
  if(typeof v!=='string'||!v||v.length>2048)return null;
  try{const u=new URL(v,MIUPC_PORTAL);if(u.protocol!=='https:'||u.username||u.password||[...u.searchParams.keys()].some(k=>/token|secret|session|auth|signature|saml|idusuario|codigoalumno|codalumno|codusuario|pidm|(?:^|_)sig$|(?:^|_)key$/i.test(k)))return null;u.hash='';return u.href;}catch{return null;}
}
// Only applied inside whitelisted academic or published-content structures.
// Never apply to the full profile, client/payment envelope or credentials.
function safeTree(v:unknown,depth=0):unknown{
  if(depth>10)throw invalid();
  if(v===null||typeof v==='number'||typeof v==='boolean')return v;
  if(typeof v==='string')return /^https?:\/\//i.test(v)?miupcPublicLink(v):text(v);
  if(Array.isArray(v)){if(v.length>5000)throw invalid();return v.map(x=>safeTree(x,depth+1));}
  if(object(v))return Object.fromEntries(Object.entries(v).filter(([k])=>!/token|password|secret|authorization|pidm|alumno_codigo|alumno_nombres|codalumno|codusuario|codigousuario|codigopersona|codigo_usuario|id_persona|codigodocente|numerointerno|numeroimportacion|clientenumero|clientenombre|criteria|celular|telefono|correo|email|direccion|documentident|fechanacimiento|ruc|foto/i.test(k)).map(([k,x])=>[k,safeTree(x,depth+1)]));
  throw invalid();
}
const serviceItem=(s:Row)=>({...pick(s,['id','nombre','abrir_nueva_pagina']),description:text(s.descripcion),url:miupcPublicLink(s.url),externalAccessVerified:false});
const invoiceFields=['fechaDocumento','fechaVencimiento','montoMora','montoPagado','montoTotal','montoDescuentos','numeroDocumento','tipoDocumento','voucherPeriodo','estadoDocumento','estadoDocumentoDes','cuota','monedaDocumento','simboloMoneda','totalFacturado'];
const invoice=(d:Row)=>({...pick(d,invoiceFields),description:Array.isArray(d.descripcion)?d.descripcion.map((x:Row)=>text(x.texto)).filter(Boolean).join(' / '):text(d.descripcion)});
export const miupcRequestStates={active:['PENDING_PAYMENT','COMPLETED_PENDING_DOWNLOAD','PAYMENT_CONFIRMED','GENERATING_DOCUMENT'],closed:['COMPLETED','PAYMENT_EXPIRED']} as const;
export async function loadMiupcPublicConfig(fetcher:MiupcFetch=fetch):Promise<{apiKey:string}>{
  let response:Response;try{response=await fetcher(MIUPC_PORTAL+'/',{redirect:'manual',headers:{'user-agent':'Mozilla/5.0'},signal:AbortSignal.timeout(20000)});}catch{throw unavailable();}
  if(!response.ok)throw unavailable();const html=await response.text();if(html.length>2_000_000)throw invalid();
  const key=html.match(/\bapiKey:"([^"\\]{1,200})"/)?.[1];
  if(!key||!html.includes('baseURL:"'+MIUPC_API+'/"')||!html.includes('tramiteBaseURL:"'+MIUPC_PROCEDURES_API+'/"'))throw invalid();
  return{apiKey:key};
}
export type MiupcLegacyIdentity={studentCode:string;givenName:string|null};
export class MiupcPortal{
  private profilePromise?:Promise<Row>;private coursesPromise?:Promise<Row[]>;
  private readonly fetcher:MiupcFetch;
  constructor(private readonly access:MiupcAccess,private readonly options:{apiKey:string;fetcher?:MiupcFetch;readLegacyRequests?:(identity:MiupcLegacyIdentity)=>Promise<Row>}){
    if(!/^U\d{9}$/.test(access.studentCode))throw reconnect();
    if(typeof options.apiKey!=='string'||!options.apiKey||/[\r\n]/.test(options.apiKey))throw invalid();this.fetcher=options.fetcher??fetch;
  }
  private async get(path:string,params:Record<string,string>={},origin:string=MIUPC_API):Promise<Row>{
    if(this.access.expiresAt<=Date.now())throw reconnect();if(origin!==MIUPC_API&&origin!==MIUPC_PROCEDURES_API)throw invalid();
    const u=new URL(path,origin);if(u.origin!==origin)throw invalid();u.search=new URLSearchParams(params).toString();
    let r:Response;try{r=await this.fetcher(u,{method:'GET',redirect:'manual',headers:{authorization:this.access.accessToken,...(origin===MIUPC_API?{'api-lambda-key':this.options.apiKey}:{}),origin:MIUPC_PORTAL,referer:MIUPC_PORTAL+'/', 'user-agent':'Mozilla/5.0','trace-id':randomUUID()},signal:AbortSignal.timeout(20000)});}catch{throw unavailable();}
    if(r.status===401||r.status===403)throw reconnect();if(!r.ok||!r.body)throw unavailable();
    const reader=r.body.getReader();const chunks:Uint8Array[]=[];let length=0;
    try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>4*1024*1024){await reader.cancel();throw invalid();}chunks.push(part.value);}}finally{reader.releaseLock();}
    let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw invalid();}
    if(!object(body)||typeof body.flag!=='boolean'||!Object.hasOwn(body,'data'))throw invalid();return body;
  }
  private async read(path:string,params:Record<string,string>={},origin:string=MIUPC_API):Promise<any>{const b=await this.get(path,params,origin);if(b.flag!==true)throw invalid();return b.data;}
  private profile():Promise<Row>{return this.profilePromise??=(async()=>{const p=rows(await this.read('/Accesos/v1/data_alumno',{CodUsuario:this.access.studentCode,CodigoNivel:'UG',plataforma:'web'}))[0];
    if(!p||typeof p.codUsuario!=='string'||p.codUsuario.toUpperCase()!==this.access.studentCode||String(p.codAlumno)!==this.access.studentCode.slice(1))throw reconnect();
    for(const k of ['codNivel','codModalidadEstActual','codPeriodoActual','codPeriodoBanner','codPrograma','codPeriodoBannerCatalogo','pidm','idBanner','codCampus','facultadId','codProductoActual','codLineaNegocio','status'])if(typeof p[k]!=='string'||!p[k]||p[k].length>80)throw invalid();return p;})();}
  private courses():Promise<Row[]>{return this.coursesPromise??=(async()=>{const p=await this.profile();return rows(await this.read('/Cursos/v1/MisCursos',{CodModalEst:p.codModalidadEstActual,CodUsuario:this.access.studentCode,CodAlumno:p.codAlumno,CodPeriodo:p.codPeriodoBanner,CodigoNivel:p.codNivel,CodigoPrograma:p.codPrograma,IDBanner:p.idBanner,PIDM:p.pidm})).map(c=>{
    if(!object(c.curso)||!miupcCourseCode.safeParse(c.curso.codCurso).success||!/^\d{6}$/.test(c.curso.periodo)||!/^\d{1,25}$/.test(c.curso.seccion))throw invalid();
    return{course:pick(c.curso,['codCurso','descEspecialCurso','seccion','periodo','modalidad','creditos','tieneHorario','es_asincrono','cursado_por']),teachers:rows(c.profe).map(d=>pick(d,['nombresDocente','apellidosDocente','docentePrincipal'])),meetings:safeTree(rows(c.horarios))};});})();}
  async query(raw:MiupcQuery):Promise<Record<string,unknown>>{
    const q=miupcQuerySchema.parse(raw);const p=await this.profile();let data:unknown;const notes:string[]=[];
    const context={cod_modalidad:p.codModalidadEstActual,cod_campus:p.codCampus,facultad:p.facultadId,cod_carrera:p.codProductoActual,status:p.status,cod_alumno:this.access.studentCode};
    switch(q.kind){
      case'profile':data={...pick(p,['fullName','desPrograma','codPrograma','codNivel','desNivel','desCiclo','ciclo','desEstadoAlumno','desTipoAlumno','desTipoAprendizaje','desTipoIngreso','codPeriodoActual','codPeriodoBanner','codPeriodoBannerDescripcion','codPeriodoBannerCatalogo','desCampus','egresado']),careerChangeHistory:'not_available'};notes.push('Ciclo y carrera declarados por el portal. No acredita ni descarta cambios anteriores de carrera.');break;
      case'programs':data=rows(p.programas).map(r=>({...pick(r,['codPrograma','descripcion']),periods:safeTree(r.periodos)}));break;
      case'menu':data=rows(await this.read('/Home/v1/Menu',{status:p.status,CodigoNivel:p.codNivel})).map(m=>({...pick(m,['id','nombre','es_nuevo']),url:miupcPublicLink(m.url),children:rows(m.submenu).map(s=>({...pick(s,['id','nombre','es_nuevo']),url:miupcPublicLink(s.url)}))}));notes.push('Menú publicado. Un enlace no prueba acceso al sistema enlazado ni que una operación esté implementada en Campus.');break;
      case'courses':data=await this.courses();break;
      case'grades':case'attendance':{
        const c=(await this.courses()).find(c=>c.course.codCurso.toUpperCase()===q.courseCode.toUpperCase());if(!c)throw new MiupcPortalError('MIUPC_NOT_ENROLLED','El curso no aparece en la matrícula actual UPC.');
        const params={CodLineaNegocio:p.codLineaNegocio,CodModalEst:p.codModalidadEstActual,CodUsuario:this.access.studentCode,CodAlumno:p.codAlumno,CodCurso:c.course.codCurso,CodPeriodo:c.course.periodo,CodigoNivel:p.codNivel,idBanner:p.idBanner};
        if(q.kind==='attendance'){
          const b=await this.get('/Cursos/v1/Inasistencias_Alumno',params);
          if(b.flag===false&&b.error?.codigo_error==='CURSOSINASIS3'&&object(b.data)&&Object.keys(b.data).length===0)data={course:c.course,status:'not_reported',summary:null,records:[],tardiness:{status:'not_available',count:null}};
          else{if(b.flag!==true||!object(b.data))throw invalid();data={course:c.course,status:'reported',summary:pick(b.data,['clasesProgramadas','clasesInasistidas','clasesDictadas','clasesAsistidas','porcentajeInasistidas']),records:rows(b.data.registrosInasistidas).map(r=>pick(r,['fecha','hora','estado'])),tardiness:{status:'not_available',count:null}};}
          notes.push('Se conservan los totales y estados originales. La API verificada informa inasistencias; no aporta un contador de tardanzas. La diferencia entre sesiones programadas, asistidas e inasistidas no demuestra tardanzas ni faltas adicionales.');
        }else{
          const b=await this.get('/Cursos/v1/Detalle_Curso',{...params,Seccion:c.course.seccion});
          if(b.flag===false&&b.error?.codigo_error==='CURSOSNOTAS3'&&Array.isArray(b.data)&&b.data.length===0)data={course:c.course,status:'not_published',assessments:[],finalGrade:null};
          else{if(b.flag!==true||!object(b.data))throw invalid();data={course:c.course,status:'reported',assessments:rows(b.data.notas).map(r=>pick(r,['codTipoPrueba','desTipoPrueba','numPrueba','pesoPonderado','nota','observacion','es_dpi'])),finalGrade:b.data.notaFinal??null,formula:text(b.data.dscFormula)};}
          notes.push('Notas y pesos originales de Mi UPC. null no es cero; una fila de resumen o un promedio calculado no acredita cierre definitivo. Estas notas no sustituyen el detalle de evaluación y retroalimentación de Blackboard.');
        }break;
      }
      case'schedule':case'weekSchedule':{
        const r=rows(await this.read('/Horarios/v1/Horario_Alumno_Banner',{CodLineaNegocio:p.codLineaNegocio,CodModalEst:p.codModalidadEstActual,CodUsuario:this.access.studentCode,CodAlumno:p.codAlumno,CodPeriodo:p.codPeriodoBanner,CodigoNivel:p.codNivel,idBanner:p.idBanner,PIDM:p.pidm,CodigoPrograma:p.codPrograma}));
        const week=q.kind==='weekSchedule'?miupcWeekRange(q.weekStart):undefined;
        data={...(week?{week}:{}),periods:r.map(v=>({days:rows(v.listaGeneral).map(g=>({day:safeTree(g.horario),meetings:rows(g.detalleHorario).filter(m=>!week||(typeof m.fechaInicio==='string'&&m.fechaInicio.slice(0,10)>=week.start&&m.fechaInicio.slice(0,10)<=week.end)).map(m=>safeTree(pick(m,meetingFields)))})),modules:rows(v.segmentacionModulos).map(m=>({name:m.nombre_modulo,courses:rows(m.data).map(c=>safeTree(pick(c,['titulo','nrc','codCurso','fechaInicioCurso','fechaFinCurso','estado','es_asincrono'])))})),regular:v.segmentacionRegular,holidays:safeTree(v.feriados)}))};notes.push('Horario del período con fechas y feriados publicados. No confirma cancelaciones de clase ni publicación de tareas de Blackboard.');break;
      }
      case'periods':data=await this.read('/Horarios/v1/ListarPeriodo',{modalidad:p.codModalidadEstActual});break;
      case'calendar':data=safeTree(await this.read('/Informativos/v1/CalendarioAcademico',{cod_modalidad:p.codModalidadEstActual,periodo:p.codPeriodoBanner}));notes.push('Calendario académico general; no establece fechas de entrega de tareas Blackboard.');break;
      case'history':data=rows(await this.read('/Cursos/v1/Historial_Notas',{CodigoUsuario:this.access.studentCode,CodigoAlumno:p.codAlumno,CodigoNivel:p.codNivel,PIDM:p.pidm,CodigoPrograma:p.codPrograma,solo_nombres_carreras:'false'})).map(v=>safeTree(pick(v,['codigo_programa','descripcion_programa','promedio_global_acumulado','periodo_academico','flag_convalidados'])));notes.push('Historial de Mi UPC por período. La pantalla indica que los convalidados se revisan en Situación Académica; no deben contarse como cursos ausentes o reprobados.');break;
      case'academicStatus':data=safeTree(await this.read('/Cursos/v1/Situacion_Academica',{idBanner:p.idBanner,codNivel:p.codNivel,codPrograma:p.codPrograma,codPeriodo:p.codPeriodoBanner,codPeriodoActual:p.codPeriodoActual,PIDM:p.pidm}));notes.push('Situación publicada, cumplimiento curricular y requisitos de egreso. No certifica que un trámite de grado sea elegible o esté aprobado.');break;
      case'curriculum':{
        const r=await this.read('/Cursos/v1/Malla_Curricular_Alumno',{codNivel:p.codNivel,codPrograma:p.codPrograma,codPeriodo:p.codPeriodoBannerCatalogo});if(!object(r))throw invalid();data=safeTree(pick(r,['codigos_horarios','niveles','total_creditos_obligatorios','total_creditos','total_creditos_electivos']));notes.push('Malla del período catálogo propio, que difiere del período de matrícula y del período Banner. No confirma cupos.');break;
      }
      case'electives':{const r=await this.read('/Cursos/v1/Electivos_Programa',{codPrograma:p.codPrograma,codPeriodo:p.codPeriodoBannerCatalogo});if(!object(r))throw invalid();const list=rows(r.electivos);data={total:list.length,offset:q.offset,hasMore:q.offset+q.limit<list.length,items:list.slice(q.offset,q.offset+q.limit).map(c=>safeTree(pick(c,['materia','numeroCurso','titulo','nombreLargo','totalCreditos','totalHoras','nivel','silabo','requisitos','requisitos_format'])))};notes.push('Catálogo de electivos del programa; no es una oferta de secciones ni confirma cupos o habilitación personal.');break;}
      case'services':{const r=await this.read('/Masservicios/v1/GestorServicios',{cod_modalidad:p.codModalidadEstActual,cod_campus:p.codCampus,cod_facultad:p.facultadId,cod_carrera:p.codProductoActual,cod_alumno:this.access.studentCode,status:p.status});if(!object(r))throw invalid();data={featured:rows(r.home).map(serviceItem),categories:rows(r.internal).flatMap(s=>rows(s.categorias).map(c=>({id:c.id,name:c.nombre,services:rows(c.servicios).map(serviceItem)})))};notes.push('Catálogo de enlaces, sin abrir ni acreditar acceso a portales externos.');break;}
      case'documents':data=rows(await this.read('/Documentos/v1/GestorDocumentos',{cod_modalidad:p.codModalidadEstActual,status:p.status})).map(c=>({id:c.id,name:c.nombre,documents:rows(c.documentos).map(d=>({...pick(d,['id','titulo','tipo_documento']),description:text(d.descripcion),url:miupcPublicLink(d.enlace)}))}));notes.push('Metadatos y enlaces del repositorio; no acredita lectura del PDF ni documentos personales.');break;
      case'procedures':{const r=await this.read('/Tramites/v1/tramites/todoslostramites',{programa:p.codPrograma,periodo:p.codPeriodoActual});if(!object(r))throw invalid();data={count:rows(r.tramites).length,procedures:rows(r.tramites).map(t=>({...pick(t,['id','titulo','tipo','categoria','precio','tiempo_entrega','es_nuevo','mostrar_boton']),description:text(t.descripcion),requirements:text(t.requisitos),url:miupcPublicLink(t.url_boton),eligibility:'not_evaluated'}))};notes.push('Precio y plazo publicados al consultar. Visibilidad o botón no prueba elegibilidad. Incluye enlaces a otros sistemas que se consultan por separado.');break;}
      case'procedureDetails':{
        const r=await this.read('/api/v1/tramites/programas',{},MIUPC_PROCEDURES_API);if(!object(r))throw invalid();const own=rows(r.programas);const program=q.programId?own.find(x=>x.codigo===q.programId):own.length===1?own[0]:undefined;
        if(!program||typeof program.codigo!=='string'||!/^[A-Za-z0-9_-]{1,40}$/.test(program.codigo))throw new MiupcPortalError('MIUPC_NOT_ENROLLED','Selecciona un programa propio disponible para este trámite.');
        const d=await this.read('/api/v1/tramites/elegibilidad/'+q.procedure+'/detalle',{programa:program.codigo},MIUPC_PROCEDURES_API);if(!object(d)||typeof d.precio!=='number'||typeof d.tiempoEntrega!=='string')throw invalid();
        data={procedure:q.procedure,program:pick(program,['codigo','descripcionCorta','descripcionEspecial']),title:text(d.titulo),description:text(d.descripcion),purposes:text(d.detalleValido),exclusions:text(d.detalleNoValido),extra:text(d.detalleExtra),publishedPrice:d.precio,currencySymbol:d.monedaSimbolo,deliveryTime:text(d.tiempoEntrega),eligibility:'not_evaluated'};
        notes.push('Condiciones publicadas, sin validar elegibilidad personal ni generar vista previa. La página oficial puede crear una solicitud por POST al cargar una vista previa; esta consulta no lo hace.');break;
      }
      case'procedureRequests':{
        const b=await this.get('/api/v1/tramites/solicitudes',{estado:miupcRequestStates[q.scope].join(',')},MIUPC_PROCEDURES_API);
        const empty=b.flag===false&&b.error===null&&b.message==='No se encontrarón resultados'&&Array.isArray(b.data)&&b.data.length===0;
        if(b.flag!==true&&!empty)throw invalid();const list=Array.isArray(b.data)?rows(b.data):object(b.data)?rows(b.data.solicitudes):(()=>{throw invalid();})();
        data={system:'miupc_new',scope:q.scope,count:list.length,requests:list.map(r=>pick(r,['id_correlativo','tramite_nombre','tramite_titulo','tramite_estado','tramite_estado_des','fecha_creacion','fecha_solicitud','fecha_actualizacion','fecha_expiracion'])),otherSystems:[{system:'mis_tramites_upc',tool:'miupc_list_legacy_procedure_requests',url:'https://mistramites.upc.edu.pe/Bandeja/Index'},{system:'power_apps_upc',verified:false},{system:'socrates',verified:false}]};notes.push('Solo bandeja nueva de Mi UPC. Una lista vacía no demuestra ausencia de solicitudes en Mis Trámites, Power Apps o Sócrates. No crea, paga ni descarga solicitudes.');break;
      }
      case'legacyRequests':if(!this.options.readLegacyRequests)throw new MiupcPortalError('MIUPC_UNAVAILABLE','La lectura de Mis Trámites necesita su contexto SSO.');data=await this.options.readLegacyRequests({studentCode:this.access.studentCode,givenName:text(p.nombresImag)});notes.push('Bandeja separada de Mis Trámites. Estados originales: PROCEDE no equivale por sí mismo a entregado. Solo se leen las filas del documento autenticado.');break;
      case'notifications':data=rows(await this.read('/Home/v1/Notificaciones',{codAlumno:this.access.studentCode,poblacion:p.codModalidadEstActual,ciclo:p.ciclo})).map(c=>({category:c.category,count:c.count,items:safeTree(rows(c.data))}));notes.push('No marca notificaciones como leídas.');break;
      case'notices':data=rows(await this.read('/Informativos/v1/Gestor/Avisos',{...context,ciclo:p.ciclo})).map(n=>({...pick(n,['id','tipo','titulo','prioridad']),description:text(n.descripcion),url:miupcPublicLink(n.url)}));break;
      case'publications':{const path={news:'Noticias',communications:'Comunicados',novelties:'Novedades'}[q.type];const list=rows(await this.read('/Informativos/v1/Informativo/'+path));data={type:q.type,total:list.length,offset:q.offset,hasMore:q.offset+q.limit<list.length,items:list.slice(q.offset,q.offset+q.limit).map(n=>({...pick(n,['id','tipo','categoria','titulo','date_updated']),summary:text(n.descripcion_corta),...(q.includeBody?{body:text(n.body)}:{}),url:miupcPublicLink(n.url_externa)}))};break;}
      case'advisors':{const r=await this.read('/Home/v1/ConoceATuPTC',{modalidad:p.codModalidadEstActual,codigo_de_carrera:p.codProductoActual,codigo_de_campus:p.codCampus,codigo_de_facultad:p.facultadId,codigo_de_alumno:this.access.studentCode});data=rows(r).map(a=>({...pick(a,['nombre','apellidos','campus','ubicacion','tipo_de_asesor']),institutionalEmail:typeof a.correo==='string'&&/@upc\.edu\.pe$/i.test(a.correo)?a.correo:null}));break;}
      case'delegates':{const r=await this.read('/Cursos/v1/ServicioDelegados',{CodAlumno:p.codAlumno,PIDM:p.pidm,CodigoPrograma:p.codPrograma,CodigoNivel:p.codNivel});if(!object(r)||String(r.alumno_codigo).replace(/^u/i,'')!==p.codAlumno)throw invalid();data=safeTree(pick(r,['periodos','detalle','total_creditos_acumulados']));notes.push('Registros propios de acreditación publicados. No registra una candidatura ni acredita a otra persona.');break;}
      case'payments':{
        const groups=rows(await this.read('/Pagos/v1/MisPagosInterna/'+this.access.studentCode));const documents=groups.flatMap(g=>rows(g.clientes).flatMap(c=>rows(c.documentos).map(invoice)));
        data={count:documents.length,documents,portalUrl:MIUPC_PORTAL+'/mis-pagos'};notes.push('Documentos pendientes publicados al consultar. Se conservan moneda, estado, mora y montos originales; no se suman monedas ni estados distintos. No inicia un pago.');break;
      }
      case'invoices':{
        const filters=rows(await this.read('/Pagos/v1/ComprobanteParametros'))[0];if(!filters)throw invalid();const years=rows(filters.list_anios);const currentYear=Number(new Intl.DateTimeFormat('en',{timeZone:'America/Lima',year:'numeric'}).format(new Date()));const availableYears=[...new Set([currentYear,...years.map(y=>y.anio)])];const year=q.year??years.find(y=>y.default===true)?.anio??currentYear;
        if(!availableYears.includes(year))throw new MiupcPortalError('MIUPC_NOT_ENROLLED','El año no está disponible en los filtros de comprobantes.');
        const groups=rows(await this.read(`/Pagos/v1/ComprobantesPagos/${this.access.studentCode}/-/-/-/-/-/${year}/-/-`));const documents=groups.flatMap(g=>rows(g.documentos).map(invoice));data={year,availableYears,count:documents.length,documents};notes.push('Conserva COBRADO y ANULADO como estados distintos. No descarga ni genera comprobantes y no suma los anulados como pagos realizados.');break;
      }
      case'billingCalendar':{
        if(p.codModalidadEstActual!=='AC')throw new MiupcPortalError('MIUPC_UNAVAILABLE','La modalidad de facturación de esta cuenta requiere verificar su contrato.');
        data=safeTree(await this.read('/Pagos/v1/Facturacion/CalendarioDePagos',{modalidad:'pregrado-upc'}));notes.push('Calendario publicado para Pregrado; conserva los períodos y programas por separado. No confundir con un estado personal de deuda.');break;
      }
      case'reservations':{
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','');const b=await this.get('/Reservas/v1/obtener_reservas_v2',{pidm_estudiante:p.pidm,fecha:today});
        if(b.flag===false&&b.message==='No tienes reservas'&&b.data===null&&b.error?.titulo==='Aún no tienes reservas programadas')data={status:'reported',count:0,reservations:[]};else if(b.flag!==true)throw invalid();else data={status:'reported',reservations:safeTree(b.data)};
        notes.push('Consulta reservas existentes desde la fecha de consulta en Lima. Una respuesta no disponible no equivale a un historial sin reservas. No crea ni cancela reservas.');break;
      }
      case'reservationServices':data=rows(await this.read('/Masservicios/v1/MasReservas')).map(s=>safeTree(pick(s,['id','nombre','titulo','descripcion','url','seccion','abrir_nueva_pagina'])));notes.push('Catálogo de accesos para reservas; no confirma cupos, disponibilidad ni acceso autenticado a servicios externos.');break;
      case'planning':data=safeTree(await this.read('/Home/v1/PlanificacionPage',{modalidad:p.codModalidadEstActual}));notes.push('Contenido publicado de planificación. No crea planes ni modifica matrícula en Banner.');break;
    }
    return{source:'miupc',universityId:'upc-pe',capturedAt:new Date().toISOString(),data,notes};
  }
}
