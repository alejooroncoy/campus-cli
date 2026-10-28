import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadSession,loadOrRefreshSession} from '../blackboard/auth/session.js';
import type {Session} from '../blackboard/types.js';
import {createClient} from '../blackboard/api/client.js';
import {getMe} from '../blackboard/api/courses.js';
import {launchPersistentContextSafe} from '../../browser-install.js';
import {authenticateMiupc,MiupcPortal,MiupcPortalError,miupcQuerySchema,loadMiupcPublicConfig,type MiupcQuery} from './service.js';
import {MiupcLegacyClient} from './legacy.js';
export async function queryLocalMiupc(raw:MiupcQuery){
  const query=miupcQuerySchema.parse(raw);
  let session=loadSession();
  // An expired local timestamp is not an identity assertion. The server must
  // still verify these cookies with users/me before any portal SSO is used.
  if(!session){try{const file=path.join(os.homedir(),'.blackboard-cli','session.json');if(!fs.lstatSync(file).isSymbolicLink())session=JSON.parse(fs.readFileSync(file,'utf8')) as Session;}catch{}}
  const reconnect=()=>new MiupcPortalError('MIUPC_RECONNECT_REQUIRED','Renueva tu acceso UPC con campus login --university upc-pe.');
  if(!session)throw reconnect();
  if((session.universityId??'upc-pe')!=='upc-pe')throw new MiupcPortalError('MIUPC_WRONG_UNIVERSITY','Mi UPC requiere una sesión UPC.');
  if(session.expiresAt&&session.expiresAt<=Date.now()){session=await loadOrRefreshSession();if(!session)throw reconnect();if((session.universityId??'upc-pe')!=='upc-pe')throw reconnect();}
  let me:any;try{me=await getMe(createClient(session));}catch{throw reconnect();}
  const expectedStudentCode=me.studentId??me.userName;
  if(typeof expectedStudentCode!=='string'||!/^U\d{9}$/i.test(expectedStudentCode))throw reconnect();
  const context=await launchPersistentContextSafe(path.join(os.homedir(),'.blackboard-cli','browser-profile'),{headless:true});
  let cookies;try{cookies=await context.cookies('https://login.microsoftonline.com');}finally{await context.close();}
  const access=await authenticateMiupc({universityId:'upc-pe',cookies,expectedStudentCode});
  const config=await loadMiupcPublicConfig();
  const legacy=new MiupcLegacyClient({universityId:'upc-pe',cookies,expectedStudentCode});
  return new MiupcPortal(access,{...config,readLegacyRequests:()=>legacy.read()}).query(query);
}
