import os from 'node:os';
import path from 'node:path';
import { loadSession } from '../blackboard/auth/session.js';
import { createClient } from '../blackboard/api/client.js';
import { getMe } from '../blackboard/api/courses.js';
import { launchPersistentContextSafe } from '../../browser-install.js';
import { authenticateUpn, UpnPortal, UpnPortalError, upnQuerySchema, type UpnQuery } from './service.js';

/** The ordinary CLI's existing login profile; never switch the student's account. */
export async function queryLocalUpn(query: UpnQuery) {
  query = upnQuerySchema.parse(query);
  const session = loadSession();
  if (!session) throw new UpnPortalError('UPN_RECONNECT_REQUIRED', 'No hay sesión activa. Ejecuta campus login --university upn-pe.');
  if (session.universityId !== 'upn-pe') throw new UpnPortalError('UPN_WRONG_UNIVERSITY', 'La sesión actual es de otra universidad. Mi Mundo UPN requiere iniciar sesión con UPN.');
  let me: any;
  try { me = await getMe(createClient(session)); }
  catch { throw new UpnPortalError('UPN_RECONNECT_REQUIRED', 'Renueva la sesión UPN con campus login.'); }
  const expectedStudentCode = me.studentId ?? me.userName;
  if (typeof expectedStudentCode !== 'string' || !/^N\d{8}$/i.test(expectedStudentCode)) throw new UpnPortalError('UPN_RECONNECT_REQUIRED', 'No se pudo verificar la identidad UPN. Ejecuta campus login.');
  const context = await launchPersistentContextSafe(path.join(os.homedir(), '.blackboard-cli', 'browser-profile'), { headless: true });
  let cookies;
  try { cookies = await context.cookies('https://login.microsoftonline.com'); }
  finally { await context.close(); }
  const access = await authenticateUpn({ universityId: 'upn-pe', cookies, expectedStudentCode });
  return new UpnPortal(access).query(query);
}
