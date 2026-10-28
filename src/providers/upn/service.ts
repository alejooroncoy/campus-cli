import { createHash, randomBytes, randomUUID, createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';
import { decodeHTML } from 'entities';

export const UPN_PORTAL = 'https://estudiante.upn.edu.pe';
export const UPN_API = 'https://estudiantebe.upn.edu.pe';
export const UPN_PROCEDURES_API = 'https://tramitesbe.upn.edu.pe';
const AUTHORITY = 'https://login.microsoftonline.com/48ba00e0-002e-4cb0-b501-07385d34ec34';
const TENANT = '48ba00e0-002e-4cb0-b501-07385d34ec34';
const CLIENT_ID = '585f490a-e2f6-4fe2-868e-99ea5e79662a';
const REDIRECT_URI = `${UPN_PORTAL}/auth/`;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === v;
}, 'Fecha inválida; usa YYYY-MM-DD');
export const upnCourseCode = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/);
const simple = <T extends string>(kind: T) => z.object({ kind: z.literal(kind) }).strict();
export const upnQuerySchema = z.discriminatedUnion('kind', [
  simple('profile'), simple('courses'), simple('periodSchedule'), simple('programs'), simple('history'), simple('calendar'),
  simple('services'), simple('documents'), simple('procedures'), simple('letters'), simple('enrollmentDocument'), simple('notices'),
  z.object({ kind: z.literal('procedureRequests'), scope: z.enum(['active','closed']).default('active') }).strict(),
  z.object({ kind: z.literal('procedureDetails'), procedure: z.literal('constancia_estudios'), programId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional() }).strict(),
  z.object({ kind: z.literal('weekSchedule'), weekStart: date.optional() }).strict(),
  z.object({ kind: z.literal('courseSchedule'), courseCode: upnCourseCode }).strict(),
  z.object({ kind: z.literal('grades'), courseCode: upnCourseCode }).strict(),
  z.object({ kind: z.literal('attendance'), courseCode: upnCourseCode }).strict(),
  z.object({ kind: z.literal('record'), programId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional() }).strict(),
]);
export type UpnQuery = z.infer<typeof upnQuerySchema>;
export type UpnFetch = typeof fetch;
export type UpnCookie = { name: string; value: string; domain: string; path?: string; expires?: number; secure?: boolean };
export class UpnPortalError extends Error {
  constructor(public readonly code: 'UPN_RECONNECT_REQUIRED' | 'UPN_UNAVAILABLE' | 'UPN_INVALID_RESPONSE' | 'UPN_NOT_ENROLLED' | 'UPN_WRONG_UNIVERSITY', message: string) {
    super(message); this.name = 'UpnPortalError';
  }
}
const reconnect = () => new UpnPortalError('UPN_RECONNECT_REQUIRED', 'Vuelve a conectar tu cuenta UPN para consultar Mi Mundo UPN.');
const invalid = () => new UpnPortalError('UPN_INVALID_RESPONSE', 'Mi Mundo UPN devolvió una respuesta no reconocida.');
const unavailable = () => new UpnPortalError('UPN_UNAVAILABLE', 'Mi Mundo UPN no respondió correctamente. Intenta nuevamente.');
type Row = Record<string, any>;
const object = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const array = (v: unknown): Row[] => {
  if (!Array.isArray(v) || !v.every(object)) throw invalid();
  return v;
};
const pick = (v: Row, fields: string[]): Row => Object.fromEntries(fields.filter(k => Object.hasOwn(v, k)).map(k => [k, v[k]]));
const scalar = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim() : null;
const plainText = (v: unknown): string | null => typeof v === 'string'
  ? decodeHTML(v).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<\/(?:p|li|div|h\d)>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').trim().slice(0, 12_000) : null;
/** Display-only links. Never pass service launch tokens or user-specific IDs to a model. */
export function upnPublicLink(v: unknown): string | null {
  if (typeof v !== 'string' || !v || v.length > 2048) return null;
  try {
    const u = new URL(v, UPN_PORTAL);
    if (u.protocol !== 'https:' || u.username || u.password || [...u.searchParams.keys()].some(k => /token|secret|session|authorization|signature|saml|idusuario|(?:^|_)sig$|(?:^|_)key$/i.test(k))) return null;
    u.hash = ''; return u.href;
  } catch { return null; }
}
const serviceItem = (s: Row): Row => ({ ...pick(s, ['id','nombre','abrir_nueva_pagina']), descripcion: plainText(s.descripcion), url: upnPublicLink(s.url), externalAccessVerified: false });
const requestStates = { active: ['PENDING_PAYMENT','UNDER_REVIEW','DOCS_OBSERVED','COMPLETED_PENDING_DOWNLOAD'], closed: ['COMPLETED','PAYMENT_EXPIRED','DOWNLOADED'] };
const studentCode = (v: unknown) => {
  if (typeof v !== 'string' || !/^N\d{8}$/i.test(v)) throw reconnect();
  return v.toUpperCase();
};
async function jsonResponse(response: Response): Promise<any> {
  if (!response.body) throw invalid();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 4 * 1024 * 1024) { await reader.cancel(); throw invalid(); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (e) { if (e instanceof UpnPortalError) throw e; throw invalid(); }
  finally { reader.releaseLock(); }
}
async function request(fetcher: UpnFetch, url: string | URL, options: RequestInit = {}) {
  try { return await fetcher(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(20_000) }); }
  catch { throw unavailable(); }
}
function jwtPart(part: string): Row {
  try { const value = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')); if (object(value)) return value; } catch {}
  throw reconnect();
}
export type UpnAccess = { accessToken: string; expiresAt: number; studentCode: string };
/** Existing SSO only. No password, interactive consent, or cross-university fallback. */
export async function authenticateUpn(input: { universityId: string; cookies: UpnCookie[]; expectedStudentCode: string }, fetcher: UpnFetch = fetch): Promise<UpnAccess> {
  if (input.universityId !== 'upn-pe') throw new UpnPortalError('UPN_WRONG_UNIVERSITY', 'Esta consulta requiere una sesión UPN.');
  const expected = studentCode(input.expectedStudentCode);
  const cookie = input.cookies.filter(c => {
    const domain = c.domain.replace(/^\./, '').toLowerCase();
    return (domain === 'login.microsoftonline.com' || domain === 'microsoftonline.com')
      && (!c.path || c.path === '/' || new URL(AUTHORITY).pathname.startsWith(c.path))
      && (c.expires === undefined || c.expires === -1 || c.expires * 1000 > Date.now())
      && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(c.name) && !/[;\r\n]/.test(c.value);
  }).map(c => `${c.name}=${c.value}`).join('; ');
  if (!cookie) throw reconnect();
  const verifier = randomBytes(32).toString('base64url'), state = randomUUID(), nonce = randomUUID();
  const authorization = new URL(`${AUTHORITY}/oauth2/v2.0/authorize`);
  authorization.search = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', response_mode: 'fragment',
    scope: 'openid profile User.Read', prompt: 'none', login_hint: `${expected.toLowerCase()}@upn.pe`,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state, nonce }).toString();
  const response = await request(fetcher, authorization, { headers: { cookie, 'user-agent': 'Mozilla/5.0' } });
  let location: URL;
  try { location = new URL(response.headers.get('location') ?? ''); } catch { throw reconnect(); }
  if (response.status !== 302 || location.origin + location.pathname !== REDIRECT_URI) throw reconnect();
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.get('state') !== state || !params.get('code') || params.has('error')) throw reconnect();
  const tokenResponse = await request(fetcher, `${AUTHORITY}/oauth2/v2.0/token`, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: UPN_PORTAL },
    body: new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code', code: params.get('code')!, code_verifier: verifier }) });
  if (!tokenResponse.ok) throw tokenResponse.status >= 500 ? unavailable() : reconnect();
  const token = await jsonResponse(tokenResponse);
  if (typeof token.access_token !== 'string' || typeof token.id_token !== 'string' || !Number.isFinite(token.expires_in) || token.expires_in <= 0) throw reconnect();
  const parts = token.id_token.split('.'); if (parts.length !== 3) throw reconnect();
  const header = jwtPart(parts[0]), claims = jwtPart(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || claims.nonce !== nonce || claims.aud !== CLIENT_ID || claims.tid !== TENANT
    || claims.iss !== `${AUTHORITY}/v2.0` || typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()
    || (typeof claims.nbf === 'number' && claims.nbf * 1000 > Date.now() + 60_000)
    || typeof claims.preferred_username !== 'string' || !/^n\d{8}@upn\.pe$/i.test(claims.preferred_username)
    || studentCode(claims.preferred_username.split('@')[0]) !== expected) throw reconnect();
  const keysResponse = await request(fetcher, `${AUTHORITY}/discovery/v2.0/keys`);
  if (!keysResponse.ok) throw unavailable();
  const keys = await jsonResponse(keysResponse);
  const jwk = Array.isArray(keys.keys) ? keys.keys.find((k: any) => k.kid === header.kid && k.kty === 'RSA' && k.use === 'sig') : undefined;
  try {
    if (!jwk || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw reconnect();
  } catch { throw reconnect(); }
  return { accessToken: token.access_token, expiresAt: Math.min(Date.now() + token.expires_in * 1000, claims.exp * 1000), studentCode: expected };
}

export function upnWeekRange(start?: string, now = new Date()): { start: string; end: string } {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const d = new Date(`${date.parse(start ?? local)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  const monday = d.toISOString().slice(0, 10); d.setUTCDate(d.getUTCDate() + 6);
  return { start: `${monday}T00:00:00Z`, end: `${d.toISOString().slice(0, 10)}T23:59:00Z` };
}
function normalizeCourse(c: Row): Row {
  if (!upnCourseCode.safeParse(c.codCurso).success || !/^\d{6}$/.test(c.periodo) || !/^\d{1,25}$/.test(c.seccion)) throw invalid();
  return { ...pick(c, ['codCurso','descCurso','periodo','seccion','creditos','modalidad','ciclo','statusCurso','tieneHorario','fechaInicio','fechaFin']),
    docente: Array.isArray(c.docente) ? c.docente.map((d: Row) => pick(d, ['nombresDocentes','apellidoPaternoDocente','apellidoMaternoDocente','descCategoriaDocente'])) : [],
    horario: Array.isArray(c.horario) ? c.horario.map((h: Row) => pick(h, ['fechaInicio','fechaFin','horaInicio','horaFin','codAula','branch','campus','modulo','diaNombre'])) : [] };
}
function normalizeSchedule(data: Row[]): Row[] {
  return data.map(day => ({ horario: pick(day.horario ?? {}, ['fechaInicio','fechaFin','diaNombre','diaNumero','codPeriodo']),
    detalleHorario: array(day.detalleHorario).map(c => pick(c, ['codCurso','codMateria','descripMateria','codSeccion','diaNombre','diaNumero','horaInicio','horaFin','fechaInicio','fechaFin','codAula','descripAula','codCampus','descripCampus','codEdificio','descripEdificio','modulo','modulo_tipo','modulo_nombre','descripcionModulo','modalidad','formatoClase','tipo_sesion'])) }));
}

/** One authenticated student. No user-supplied student code, URL, header or method. */
export class UpnPortal {
  private profilePromise?: Promise<Row>;
  private coursesPromise?: Promise<Row[]>;
  private programsPromise?: Promise<Row[]>;
  constructor(private readonly access: UpnAccess, private readonly fetcher: UpnFetch = fetch) { studentCode(access.studentCode); }
  private async get(path: string, params: Record<string, string> = {}, origin: string = UPN_API): Promise<any> {
    if (this.access.expiresAt <= Date.now()) throw reconnect();
    if (origin !== UPN_API && origin !== UPN_PROCEDURES_API) throw invalid();
    const url = new URL(path, origin); if (url.origin !== origin) throw invalid();
    url.search = new URLSearchParams(params).toString();
    const r = await request(this.fetcher, url, { headers: { Authorization: this.access.accessToken, origin: UPN_PORTAL, referer: `${UPN_PORTAL}/`, 'trace-id': randomUUID() } });
    if (r.status === 401 || r.status === 403) throw reconnect();
    if (!r.ok || r.status >= 300) throw unavailable();
    const body = await jsonResponse(r);
    // The requests API uses this exact semantic-failure envelope for an empty
    // list. Do not relax flag validation for any other route or error.
    if (origin === UPN_PROCEDURES_API && path === '/api/v1/tramites/solicitudes'
      && object(body) && body.flag === false && body.error === null
      && body.message === 'No se encontrarón resultados' && Array.isArray(body.data) && body.data.length === 0) return [];
    if (!object(body) || body.flag !== true || !Object.hasOwn(body, 'data')) throw invalid();
    return body.data;
  }
  private profile(): Promise<Row> {
    return this.profilePromise ??= (async () => {
      const data = array(await this.get('/Accesos/v1/data_alumno', { CodAlumno: this.access.studentCode }));
      const p = data[0]; if (!p || studentCode(p.codAlumno) !== this.access.studentCode) throw reconnect();
      return p;
    })();
  }
  private courses(): Promise<Row[]> {
    return this.coursesPromise ??= (async () => {
      const p = await this.profile();
      if (typeof p.codNivel !== 'string' || !/^[A-Z]{1,6}$/.test(p.codNivel) || !/^\d{6}$/.test(p.codPeriodoBanner)) throw invalid();
      return array(await this.get('/Cursos/v1/Detalle_Matriculas', { CodAlumno: this.access.studentCode, CodigoNivel: p.codNivel, CodPeriodo: p.codPeriodoBanner })).map(normalizeCourse);
    })();
  }
  private programs(): Promise<Row[]> {
    return this.programsPromise ??= (async () => {
      await this.profile();
      return array(await this.get(`/Cursos/v1/programas_inscritos/${this.access.studentCode}`));
    })();
  }
  async query(raw: UpnQuery): Promise<Record<string, unknown>> {
    const query = upnQuerySchema.parse(raw); const profile = await this.profile();
    let data: unknown; const notes: string[] = [];
    switch (query.kind) {
      case 'profile':
        data = { ...pick(profile, ['fullName','desProducto','codProductoActual','codNivel','status','codPeriodoBanner']),
          cycle: scalar(profile.ciclo), cycleSource: 'Mi Mundo UPN: ciclo',
          career: scalar(profile.desPrograma) ?? scalar(profile.desProducto),
          careerChangeHistory: 'not_available' };
        notes.push('El ciclo es el campo declarado por el portal. Un programa inscrito no confirma ni descarta un cambio anterior de carrera.'); break;
      case 'courses': data = await this.courses(); notes.push('Matrícula actual. Para períodos anteriores usa el historial; el filtro CodPeriodo no está verificado.'); break;
      case 'weekSchedule': {
        const range = upnWeekRange(query.weekStart);
        data = { range, days: normalizeSchedule(array(await this.get('/Horarios/v1/Horario_Alumno', { CodAlumno: this.access.studentCode, FechaSesion1: range.start, FechaSesion2: range.end }))) };
        notes.push('Horario publicado; no confirma cancelaciones o excepciones para una fecha.'); break;
      }
      case 'periodSchedule':
        data = array(await this.get('/Horarios/v1/Horario_Periodo', { CodAlumno: this.access.studentCode })).map(m => ({
          ...pick(m, ['modulo_key','modulo','modulo_tipo','descripcionModulo','fechaInicio','fechaFin']),
          cursos: array(m.cursos).map(c => ({ ...pick(c, ['nombreCurso','codMateria','codSeccion','descripcionTipo','fechaInicio','fechaFin','estado','cantidadVeces','codCampus','descripCampus','modulo_key','modalidad']),
            horarios: Array.isArray(c.horarios) ? c.horarios.map((h: Row) => pick(h, ['diaNombre','diaNumero','horaInicio','horaFin','fechaInicio','fechaFin','codAula','descripAula','campus','branch'])) : [] })) })); break;
      case 'courseSchedule': case 'grades': case 'attendance': {
        const course = (await this.courses()).find(c => c.codCurso.toUpperCase() === query.courseCode.toUpperCase());
        if (!course) throw new UpnPortalError('UPN_NOT_ENROLLED', 'El curso no aparece en la matrícula actual UPN.');
        const params = { CodAlumno: this.access.studentCode, CodCurso: course.codCurso, CodPeriodo: course.periodo };
        if (query.kind === 'courseSchedule') data = normalizeSchedule(array(await this.get(`/Horarios/v1/HorarioPorCurso/${this.access.studentCode}/${course.codCurso}/${course.seccion}`)));
        else if (query.kind === 'grades') {
          const g = await this.get('/Cursos/v1/Detalle_Curso', { ...params, Seccion: course.seccion });
          if (!object(g)) throw invalid();
          data = { course, assessments: array(g.notas).map(n => ({ ...pick(n, ['codTipoPrueba','desTipoPrueba','numPrueba','pesoPonderado','nota']), publicationStatus: 'unknown' })),
            finalGrade: g.notaFinal ?? null, formula: scalar(g.dscFormula) };
          notes.push('Se conservan las notas originales. 00 no distingue pendiente de cero publicado; las filas de promedio no son evaluaciones adicionales. No se confirma cierre por una fila PROMEDIO FINAL.');
        } else {
          const a = await this.get('/Cursos/v1/Inasistencias_Alumno', { ...params, CodSeccion: course.seccion });
          if (!object(a)) throw invalid();
          data = { course, ...pick(a, ['faltasPermitidas','cantidadFaltas','status']), sessions: array(a.inasistencias).map(s => pick(s, ['dia','inicio','fin','status'])) };
          notes.push('Códigos de estado conservados tal como los publica UPN.');
        } break;
      }
      case 'history':
        data = array(await this.get('/Cursos/v1/cursos_historicos', { CodAlumno: this.access.studentCode })).map(p => ({
          ...pick(p, ['progNombre','progPromedio']), periods: array(p.progDetalle).map(t => ({ ...pick(t, ['periodo','periodoDesc','promSemetre']),
            courses: array(t.historial).map(c => pick(c, ['cursoId','cursoNombre','notaFinal','estado','periodo','ciclo','credito'])) })) }));
        notes.push('Son registros por período; pueden existir cursos repetidos. No es un historial de cambios de carrera.'); break;
      case 'programs': data = (await this.programs()).map(p => pick(p, ['nivel','nivelDescripcion','periodoActivo','periodoInscrito','programaNombre','programaId','branch','campus','facultad'])); break;
      case 'record': {
        const programs = await this.programs();
        const selected = query.programId ? programs.find(p => p.programaId === query.programId) : programs.length === 1 ? programs[0] : undefined;
        if (!selected || !/^[A-Za-z0-9_-]{1,40}$/.test(selected.programaId)) throw new UpnPortalError('UPN_NOT_ENROLLED', 'Selecciona un programa de upn_list_programs.');
        data = { program: pick(selected, ['programaId','programaNombre']), records: array(await this.get('/Cursos/v1/record_academico', { CodAlumno: this.access.studentCode, CodPrograma: selected.programaId })).map(r => pick(r, ['creditosInscritos','creditosAprobados','creditosDesaproados','creditosPendientes','creditosConvalidados','totalDeCreditos','promedioPrograma','creditosConvalidadosInternos'])) }; break;
      }
      case 'calendar':
        if (typeof profile.codNivel !== 'string' || !/^[A-Z]{1,6}$/.test(profile.codNivel)) throw invalid();
        data = array(await this.get('/Informativos/v1/CalendarioAcademico', { cod_modalidad: profile.codNivel })).map(e => pick(e, ['activity','endDate','modality','PriorityStatus','startDate','now','tipoFecha','periodo','textoLegal']));
        notes.push('Calendario académico; no confirma tareas o entregas publicadas en Blackboard.'); break;
      case 'services': {
        const params = Object.fromEntries(Object.entries({ cod_modalidad: profile.codNivel, cod_campus: profile.codCampus, cod_facultad: profile.facultad,
          cod_carrera: profile.codProductoActual, status: profile.status, ciclo: profile.ciclo, cod_alumno: this.access.studentCode }).filter(([,v]) => typeof v === 'string' && v));
        const catalog = await this.get('/Masservicios/v1/GestorServicios', params);
        if (!object(catalog)) throw invalid();
        data = { featured: array(catalog.home).map(serviceItem), categories: array(catalog.internal).flatMap(section => array(section.categorias).map(c => ({
          ...pick(c, ['id','nombre']), descripcion: plainText(c.descripcion), services: array(c.servicios).map(serviceItem),
        }))) };
        notes.push('Catálogo publicado para el perfil. Un enlace a otro portal no prueba acceso a sus datos.'); break;
      }
      case 'documents':
        data = array(await this.get('/Documentos/v1/GestorDocumentos', { cod_modalidad: profile.codNivel, status: profile.status })).map(c => ({
          ...pick(c, ['id','nombre']), documents: array(c.documentos).map(d => ({ ...pick(d, ['id','titulo','tipo_documento','fecha_actualizacion','fecha_inicio','fecha_fin','type']),
            descripcion: plainText(d.descripcion), url: upnPublicLink(d.documento) ?? upnPublicLink(d.enlace) })),
        }));
        notes.push('Documentos normativos publicados, no certificados personales. Esta consulta no descarga ni lee el contenido de los PDF.'); break;
      case 'procedures': {
        const catalog = await this.get('/api/v1/tramites/todoslostramites', {}, UPN_PROCEDURES_API);
        if (!object(catalog)) throw invalid();
        const personalized = array(await this.get('/Tramites/v1/tramites_portal_v2', { CodAlumno: this.access.studentCode }));
        data = { catalog: array(catalog.tramites).map(t => ({ ...pick(t, ['id','titulo','codigo_tramite','mostrar_boton','es_nuevo']),
          descripcion: plainText(t.descripcion), requisitos: plainText(t.requisitos), url: upnPublicLink(t.url_boton), eligibility: 'not_evaluated' })),
          personalized: personalized.map(t => ({ ...pick(t, ['id','titulo','mostrarTramite','mostrarBotonPrincipal','estado','gradosDisponibles','ciclosPermitidos']),
            descripcion: plainText(t.descripcion), validationMessage: object(t.mensajeValidacion) ? { titulo: plainText(t.mensajeValidacion.titulo), descripcion: plainText(t.mensajeValidacion.descripcion) } : null,
            historyCount: Array.isArray(t.historialTramites) ? t.historialTramites.length : null, url: upnPublicLink(t.urlRedirect), eligibility: 'not_evaluated' })),
          studentContext: { status: scalar(profile.status), cycle: scalar(profile.ciclo) } };
        notes.push('La visibilidad y el botón del catálogo no acreditan elegibilidad. Se conservan los grados/ciclos permitidos sin inferir aprobación. No se crea ninguna solicitud.'); break;
      }
      case 'procedureDetails': {
        const programs = await this.get('/api/v1/tramites/programas', { tramite: query.procedure }, UPN_PROCEDURES_API);
        if (!object(programs)) throw invalid();
        const list = array(programs.programas);
        const selected = query.programId ? list.find(p => p.codigo === query.programId) : list.length === 1 ? list[0] : undefined;
        if (!selected || typeof selected.codigo !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(selected.codigo)) throw new UpnPortalError('UPN_NOT_ENROLLED', 'Selecciona un programa inscrito disponible para este trámite.');
        const detail = await this.get('/api/v1/tramites/elegibilidad/constancia_estudios/detalle', { programa: selected.codigo }, UPN_PROCEDURES_API);
        if (!object(detail) || typeof detail.precio !== 'number' || typeof detail.tiempoEntrega !== 'string') throw invalid();
        data = { procedure: query.procedure, program: pick(selected, ['codigo','nombre']), purposes: plainText(detail.detalleValido), exclusions: plainText(detail.detalleNoValido),
          extra: plainText(detail.detalleExtra), publishedPrice: detail.precio, currencySymbol: scalar(detail.monedaSimbolo), deliveryTime: plainText(detail.tiempoEntrega), eligibility: 'not_evaluated' };
        notes.push('Condiciones publicadas al momento de consulta. No se probó elegibilidad personal ni se generó vista previa: el portal usa POST solicitudes para esa vista previa.'); break;
      }
      case 'procedureRequests': {
        const result = await this.get('/api/v1/tramites/solicitudes', { estado: requestStates[query.scope].join(',') }, UPN_PROCEDURES_API);
        const requests = Array.isArray(result) ? array(result) : object(result) ? array(result.solicitudes) : (() => { throw invalid(); })();
        data = { scope: query.scope, count: requests.length, requests: requests.map(r => pick(r, ['id_correlativo','tramite_nombre','tramite_titulo','tramite_estado','tramite_estado_des','codigo_servicio','fecha_creacion','fecha_solicitud','fecha_actualizacion'])) };
        notes.push('Lista de solicitudes existentes de la cuenta autenticada. Una lista vacía es un resultado válido. No crea solicitudes, pagos o descargas.'); break;
      }
      case 'letters': {
        const letters = array(await this.get('/Perfil/v1/CartaPresentacion/ConsultarCartaPresentacion', { CodAlumno: this.access.studentCode }));
        data = { count: letters.length, letters: letters.map(l => pick(l, ['presentationLetterId','titulo','estado','fechaRegistro','fechaCreacion','fechaVencimiento'])), portalUrl: `${UPN_PORTAL}/carta-de-presentacion` };
        notes.push('Consulta cartas existentes; no genera ni descarga una carta.'); break;
      }
      case 'enrollmentDocument': {
        const result = array(await this.get('/Perfil/v1/consolidadoMatricula', { name: this.access.studentCode }));
        data = { available: result.some(r => typeof r.url === 'string' && r.url.startsWith('https://')), portalUrl: `${UPN_PORTAL}/consolidado`, contentRead: false };
        notes.push('El portal devolvió la disponibilidad del consolidado. El enlace privado queda dentro de la consulta; no se descarga ni certifica el contenido del documento.'); break;
      }
      case 'notices': {
        const params = Object.fromEntries(Object.entries({ cod_modalidad: profile.codNivel, cod_campus: profile.codCampus, facultad: profile.facultad,
          cod_carrera: profile.codProductoActual, status: profile.status, ciclo: profile.ciclo, cod_alumno: this.access.studentCode }).filter(([,v]) => typeof v === 'string' && v));
        const notices = array(await this.get('/Informativos/v1/Gestor/Avisos', params));
        const categories = array(await this.get('/Home/v1/Notificaciones', { codAlumno: this.access.studentCode }));
        data = { notices: notices.map(n => ({ ...pick(n, ['tipo','titulo','prioridad']), description: plainText(n.descripcion), url: upnPublicLink(n.url) })),
          notificationCategories: categories.map(c => ({ ...pick(c, ['category','count']), notifications: array(c.data).map(n => ({ ...pick(n, ['id','titulo','fecha','estado']), message: plainText(n.mensaje ?? n.message), url: upnPublicLink(n.url) })) })) };
        notes.push('Consulta avisos y notificaciones; no marca mensajes como leídos.'); break;
      }
    }
    return { source: 'mi_mundo_upn', universityId: 'upn-pe', capturedAt: new Date().toISOString(), data, notes };
  }
}
