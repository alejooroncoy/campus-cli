import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { authenticateUpn, UpnPortal, upnWeekRange, upnQuerySchema, UPN_API, type UpnFetch } from '../src/providers/upn/service.js';
import { registerUpnTools, UPN_TOOLS } from '../src/providers/upn/mcp-tools.js';
const student = 'N00000001';
const course = { codCurso: 'MARK100', descCurso: 'Curso de prueba', periodo: '226434', seccion: '22643412345', creditos: '4', modalidad: 'Presencial', docente: [{ nombresDocentes: 'Docente', emailDocente: 'private@example.test' }], horario: [] };
const access = { accessToken: 'private-access-token', expiresAt: Date.now() + 60_000, studentCode: student };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const ok = (data: unknown) => json({ flag: true, data });
function api(extra: (u: URL, init: RequestInit) => Response | Promise<Response>) {
  const seen: URL[] = [];
  const fetcher: UpnFetch = async (input, init = {}) => {
    const u = new URL(String(input)); seen.push(u);
    assert.equal(u.origin, UPN_API); assert.equal(init.redirect, 'manual');
    assert.equal(new Headers(init.headers).get('Authorization'), access.accessToken);
    assert.equal(init.method ?? 'GET', 'GET');
    if (u.pathname === '/Accesos/v1/data_alumno') return ok([{ codAlumno: student, fullName: 'Estudiante de prueba', ciclo: '8', desProducto: 'Programa de prueba', codNivel: 'UG', codPeriodoBanner: '226434', documenIdentida: 'private-id', correoPersonal: 'private@example.test' }]);
    if (u.pathname === '/Cursos/v1/Detalle_Matriculas') return ok([course]);
    return extra(u, init);
  };
  return { portal: new UpnPortal(access, fetcher), seen };
}

test('UPN profile exposes declared cycle and excludes contact, ID and tokens', async () => {
  const { portal } = api(() => { throw Error('unexpected'); });
  const result = await portal.query({ kind: 'profile' });
  assert.equal((result.data as any).cycle, '8');
  assert.equal((result.data as any).careerChangeHistory, 'not_available');
  assert.ok(!JSON.stringify(result).includes('private'));
});
test('UPN notes preserve zero strings and unknown publication; membership determines the student and section', async () => {
  const { portal, seen } = api(u => {
    assert.equal(u.pathname, '/Cursos/v1/Detalle_Curso');
    assert.equal(u.searchParams.get('CodAlumno'), student);
    assert.equal(u.searchParams.get('Seccion'), course.seccion);
    return ok({ notas: [{ codTipoPrueba: 'T3', desTipoPrueba: 'Trabajo 3', pesoPonderado: '30%', nota: '00' }], notaFinal: null, dscFormula: '' });
  });
  const result = await portal.query({ kind: 'grades', courseCode: 'mark100' });
  const data = result.data as any;
  assert.equal(data.assessments[0].nota, '00'); assert.equal(data.assessments[0].publicationStatus, 'unknown');
  assert.equal(data.finalGrade, null); assert.ok(!JSON.stringify(data).includes('private@example'));
  await assert.rejects(portal.query({ kind: 'grades', courseCode: 'OTHER100' }), (e: any) => e.code === 'UPN_NOT_ENROLLED');
  assert.equal(seen.filter(u => u.pathname.endsWith('Detalle_Curso')).length, 1);
});
test('UPN accepts only fixed operations and does not expose a historical enrollment filter or arbitrary student', () => {
  for (const q of [{ kind: 'courses', term: '202610' }, { kind: 'profile', studentId: 'N00000002' }, { kind: 'raw', url: 'https://evil.test' }, { kind: 'grades', courseCode: '../../delete' }]) assert.equal(upnQuerySchema.safeParse(q).success, false);
});
test('UPN weekly ranges use the Lima date, reject impossible dates, and cover one week', () => {
  assert.deepEqual(upnWeekRange(undefined, new Date('2026-10-26T01:00:00Z')), { start: '2026-10-19T00:00:00Z', end: '2026-10-25T23:59:00Z' });
  assert.deepEqual(upnWeekRange('2026-10-28'), { start: '2026-10-26T00:00:00Z', end: '2026-11-01T23:59:00Z' });
  assert.throws(() => upnWeekRange('2026-02-30'));
});
test('UPN does not accept an unregistered program', async () => {
  let records = 0;
  const { portal } = api(u => {
    if (u.pathname.includes('programas_inscritos')) return ok([{ programaId: 'TEST-UG', programaNombre: 'Programa' }]);
    records++; return ok([{ creditosAprobados: 40, promedioPrograma: 15 }]);
  });
  await assert.rejects(portal.query({ kind: 'record', programId: 'OTHER-UG' }), (e: any) => e.code === 'UPN_NOT_ENROLLED');
  assert.equal(records, 0);
  const result = await portal.query({ kind: 'record' }); assert.equal((result.data as any).records[0].creditosAprobados, 40);
});
test('UPN redirects, semantic failures and unknown schemas fail closed without upstream error text', async () => {
  for (const r of [new Response(null, { status: 302, headers: { location: 'https://aulavirtual.upc.edu.pe/' } }), json({ flag: false, message: 'secret-error-token' }), ok('unexpected')]) {
    const { portal } = api(() => r);
    await assert.rejects(portal.query({ kind: 'history' }), (e: any) => !e.message.includes('secret-error-token') && /^UPN_/.test(e.code));
  }
});
test('UPN profile identity mismatch is rejected before an academic request', async () => {
  const portal = new UpnPortal(access, async () => ok([{ codAlumno: 'N00000002', ciclo: '8' }]));
  await assert.rejects(portal.query({ kind: 'courses' }), (e: any) => e.code === 'UPN_RECONNECT_REQUIRED');
});

test('UPN SSO rejects UPC before any network request', async () => {
  await assert.rejects(authenticateUpn({ universityId: 'upc-pe', cookies: [], expectedStudentCode: student }, async () => { throw Error('must not fetch'); }), (e: any) => e.code === 'UPN_WRONG_UNIVERSITY');
});
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
async function sso(options: { badState?: boolean; wrongStudent?: boolean; invalidSignature?: boolean; redirect?: string } = {}) {
  let nonce = ''; let codeVerifier = ''; let state = ''; const requests: URL[] = [];
  const mock: UpnFetch = async (input, init = {}) => {
    const u = new URL(String(input)); requests.push(u);
    assert.equal(u.hostname, 'login.microsoftonline.com'); assert.equal(init.redirect, 'manual');
    if (u.pathname.endsWith('/authorize')) {
      nonce = u.searchParams.get('nonce')!; state = u.searchParams.get('state')!;
      assert.equal(u.searchParams.get('prompt'), 'none');
      assert.equal(new Headers(init.headers).get('cookie'), 'ESTSAUTH=existing-session');
      return new Response(null, { status: 302, headers: { location: options.redirect ?? `https://estudiante.upn.edu.pe/auth/#code=one-use-code&state=${options.badState ? 'wrong' : state}` } });
    }
    assert.equal(new Headers(init.headers).has('cookie'), false);
    if (u.pathname.endsWith('/token')) {
      codeVerifier = new URLSearchParams(String(init.body)).get('code_verifier')!; assert.ok(codeVerifier.length >= 43);
      const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
      const token = `${encode({ alg: 'RS256', kid: 'test-key' })}.${encode({ nonce, aud: '585f490a-e2f6-4fe2-868e-99ea5e79662a', tid: '48ba00e0-002e-4cb0-b501-07385d34ec34', iss: 'https://login.microsoftonline.com/48ba00e0-002e-4cb0-b501-07385d34ec34/v2.0', exp: Math.floor(Date.now()/1000)+3600, preferred_username: `${options.wrongStudent ? 'n00000002' : 'n00000001'}@upn.pe` })}`;
      const signature = options.invalidSignature ? Buffer.from('invalid') : sign('RSA-SHA256', Buffer.from(token), pair.privateKey);
      return json({ access_token: access.accessToken, id_token: `${token}.${signature.toString('base64url')}`, expires_in: 3600 });
    }
    return json({ keys: [{ ...pair.publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig' }] });
  };
  return { result: authenticateUpn({ universityId: 'upn-pe', expectedStudentCode: student, cookies: [{ name: 'ESTSAUTH', value: 'existing-session', domain: '.login.microsoftonline.com' }, { name: 'UPC', value: 'never-send', domain: '.upc.edu.pe' }] }, mock), requests };
}
test('UPN reuses only Microsoft cookies, validates a signed identity, and keeps PKCE private', async () => {
  const { result, requests } = await sso(); const a = await result;
  assert.equal(a.studentCode, student); assert.equal(a.accessToken, access.accessToken);
  assert.equal(requests.length, 3);
});
test('UPN rejects forged redirects, state mismatch, wrong accounts and invalid signatures', async () => {
  for (const options of [{ badState: true }, { wrongStudent: true }, { invalidSignature: true }, { redirect: 'https://estudiante.upn.edu.pe.evil.test/auth/#code=x' }]) {
    const { result } = await sso(options);
    await assert.rejects(result, (e: any) => e.code === 'UPN_RECONNECT_REQUIRED');
  }
});
test('UPN tools register only read operations and delegate identical validated queries to hosted execution', async () => {
  const calls: UpnQueryForTest[] = []; const handlers = new Map<string, Function>();
  type UpnQueryForTest = { kind: string };
  registerUpnTools({ registerTool(name, config, handler) { assert.equal(config.annotations.readOnlyHint, true); handlers.set(name, handler); } }, { execute: async q => { calls.push(q); return { data: { cycle: '8' } }; } });
  assert.equal(handlers.size, 19); assert.equal(UPN_TOOLS.length, 19);
  const result = await handlers.get('upn_get_profile')!({});
  assert.deepEqual(calls, [{ kind: 'profile' }]); assert.equal(JSON.parse(result.content[0].text).data.cycle, '8');
  await assert.rejects(handlers.get('upn_get_profile')!({ studentId: 'N00000002' }));
});

test('UPN tools work through the real MCP transport', async () => {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const server = new McpServer({ name: 'upn-test', version: '1' });
  registerUpnTools(server, { execute: async query => ({ source: 'mi_mundo_upn', universityId: 'upn-pe', data: query.kind === 'profile' ? { cycle: '8' } : [] }) });
  const client = new Client({ name: 'upn-test-client', version: '1' });
  const [a,b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a); await client.connect(b);
    const list = await client.listTools(); assert.equal(list.tools.length, 19);
    const result = await client.callTool({ name: 'upn_get_profile', arguments: {} });
    const content = result.content as Array<{ type: string; text?: string }>;
    assert.equal(JSON.parse(content[0].text!).data.cycle, '8');
    const bad = await client.callTool({ name: 'upn_get_grades', arguments: { courseCode: '../other-student' } });
    assert.equal(bad.isError, true);
  } finally { await client.close(); await server.close(); }
});

test('UPN administrative reads stay on their two pinned API origins and never create a request', async () => {
  const seen: URL[] = [];
  const portal = new UpnPortal(access, async (input, init={}) => {
    const u=new URL(String(input));seen.push(u);
    assert.ok(['https://estudiantebe.upn.edu.pe','https://tramitesbe.upn.edu.pe'].includes(u.origin));
    assert.equal(init.method??'GET','GET');assert.equal(init.redirect,'manual');
    if(u.pathname==='/Accesos/v1/data_alumno')return ok([{codAlumno:student,ciclo:'8',status:'ESTUDIANTE',codNivel:'UG',codCampus:'TEST',codProductoActual:'TEST-UG'}]);
    if(u.pathname==='/api/v1/tramites/programas')return ok({programas:[{codigo:'TEST-UG',nombre:'Programa'}]});
    if(u.pathname.endsWith('/detalle'))return ok({detalleValido:'<ul><li>Uso publicado</li></ul><script>bad()</script>',detalleNoValido:'No incluye notas',precio:45,monedaSimbolo:'S/',tiempoEntrega:'Máximo 10 días hábiles'});
    if(u.pathname==='/api/v1/tramites/solicitudes')return json({flag:false,error:null,message:'No se encontrarón resultados',data:[]});
    if(u.pathname.endsWith('/consolidadoMatricula'))return ok([{url:'https://example.test/private.pdf?token=secret'}]);
    if(u.pathname.endsWith('/ConsultarCartaPresentacion'))return json({flag:true,error:{titulo:'No tienes cartas'},data:[]});
    throw Error('unexpected path');
  });
  const detail=await portal.query({kind:'procedureDetails',procedure:'constancia_estudios'});
  assert.equal((detail.data as any).publishedPrice,45);assert.equal((detail.data as any).eligibility,'not_evaluated');
  assert.ok(!(detail.data as any).purposes.includes('bad'));
  for(const scope of ['active','closed'] as const){const r=await portal.query({kind:'procedureRequests',scope});assert.equal((r.data as any).count,0)}
  const enrolled=await portal.query({kind:'enrollmentDocument'});assert.equal((enrolled.data as any).available,true);assert.ok(!JSON.stringify(enrolled).includes('secret'));
  assert.equal((await portal.query({kind:'letters'})).data && ((await portal.query({kind:'letters'})).data as any).count,0);
  const before=seen.filter(u=>u.pathname.endsWith('/detalle')).length;
  await assert.rejects(portal.query({kind:'procedureDetails',procedure:'constancia_estudios',programId:'OTHER'}));
  assert.equal(seen.filter(u=>u.pathname.endsWith('/detalle')).length,before);
  assert.ok(!seen.some(u=>u.pathname.endsWith('/confirmar')||u.pathname.includes('/descargar')));
});

test('UPN catalogs retain visibility without claiming eligibility or external SSO access', async () => {
  const {portal}=api(u=>{
    if(u.pathname.endsWith('/GestorServicios'))return ok({home:[],internal:[{categorias:[{nombre:'Servicios',servicios:[{nombre:'Externo',url:'https://example.test/?token=private-link'}]}]}]});
    if(u.pathname.endsWith('/GestorDocumentos'))return ok([{nombre:'Reglamentos',documentos:[{titulo:'Documento',documento:'https://example.test/public.pdf',type:'application/pdf'}]}]);
    if(u.pathname.endsWith('/tramites_portal_v2'))return ok([{titulo:'Título',mostrarTramite:true,gradosDisponibles:['BACHILLER'],ciclosPermitidos:[],mensajeValidacion:{titulo:'Pendiente',descripcion:'<p>Revisar requisitos</p>'}}]);
    throw Error('unexpected path');
  });
  const services=await portal.query({kind:'services'});const service=(services.data as any).categories[0].services[0];
  assert.equal(service.url,null);assert.equal(service.externalAccessVerified,false);
  const docs=await portal.query({kind:'documents'});assert.equal((docs.data as any)[0].documents[0].url,'https://example.test/public.pdf');
});


test('UPN does not mistake a procedure failure for an empty request list', async () => {
  const portal=new UpnPortal(access,async input=>new URL(String(input)).pathname==='/Accesos/v1/data_alumno'
    ? ok([{codAlumno:student}]) : json({flag:false,error:{codigo:'DENIED'},message:'No se encontrarón resultados',data:[]}));
  await assert.rejects(portal.query({kind:'procedureRequests',scope:'active'}),(e:any)=>e.code==='UPN_INVALID_RESPONSE');
});

test('UPN procedure visibility and notices preserve meaning without changing student state', async () => {
  const portal=new UpnPortal(access,async(input,init={})=>{
    assert.equal(init.method??'GET','GET'); const u=new URL(String(input));
    if(u.pathname==='/Accesos/v1/data_alumno')return ok([{codAlumno:student,ciclo:'8'}]);
    if(u.pathname==='/api/v1/tramites/todoslostramites')return ok({tramites:[{titulo:'Constancia',url_boton:'/tramites/constancia-estudios'}]});
    if(u.pathname==='/Tramites/v1/tramites_portal_v2')return ok([{titulo:'Título',mostrarTramite:true,gradosDisponibles:['BACHILLER'],ciclosPermitidos:['8'],historialTramites:[]}]);
    if(u.pathname==='/Informativos/v1/Gestor/Avisos')return ok([{titulo:'Aviso',descripcion:'&lt;script&gt;bad()&lt;/script&gt;<p>Publicación</p>'}]);
    if(u.pathname==='/Home/v1/Notificaciones')return ok([{category:'General',count:0,data:[]}]);
    throw Error('unexpected request');
  });
  const procedures=(await portal.query({kind:'procedures'})).data as any;
  assert.equal(procedures.personalized[0].mostrarTramite,true);
  assert.equal(procedures.personalized[0].eligibility,'not_evaluated');
  assert.deepEqual(procedures.personalized[0].gradosDisponibles,['BACHILLER']);
  const notices=(await portal.query({kind:'notices'})).data as any;
  assert.equal(notices.notices[0].description,'Publicación');assert.equal(notices.notificationCategories[0].count,0);
});
