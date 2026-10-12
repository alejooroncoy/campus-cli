export type MiupcConnection = {
  status: 'pending_login' | 'saving' | 'connected' | 'expired' | 'failed' | 'not_connected' | 'not_configured' | 'reconnect_required' | 'busy' | 'not_supported' | 'upc_reconnect_required';
  loginUrl?: string;
  expiresAt?: number;
  attemptId?: string;
};
const statuses = new Set(['pending_login','saving','connected','expired','failed','not_connected','not_configured','reconnect_required','busy','not_supported','upc_reconnect_required']);
export function parseMiupcConnection(value: unknown): MiupcConnection {
  if (!value || typeof value !== 'object') throw Error('No pudimos comprobar la conexión.');
  const data = value as Record<string, unknown>;
  if (typeof data.status !== 'string' || !statuses.has(data.status)) throw Error('No pudimos comprobar la conexión.');
  const result: MiupcConnection = {status:data.status as MiupcConnection['status']};
  if (typeof data.expiresAt === 'number' && Number.isFinite(data.expiresAt)) result.expiresAt = data.expiresAt;
  if (typeof data.attemptId === 'string' && /^[0-9a-f-]{36}$/i.test(data.attemptId)) result.attemptId = data.attemptId;
  if (['pending_login','saving','connected'].includes(result.status) && (!result.attemptId || !result.expiresAt)) throw Error('No pudimos confirmar esta verificación. Vuelve a intentarlo.');
  if (data.loginUrl !== undefined && result.status === 'pending_login') {
    if (typeof data.loginUrl !== 'string') throw Error('No pudimos abrir la ventana segura.');
    const url = new URL(data.loginUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'www.browserbase.com' || url.username || url.password) throw Error('No pudimos abrir la ventana segura.');
    result.loginUrl = url.href;
  }
  return result;
}
// Only notice categories and correlation IDs are retained, never live URLs.
const noticePrefix='campus-miupc-reconnect:';
const attemptPrefix='campus-miupc-attempt:';
type Attempt={attemptId:string;expiresAt:number};
const memoryNotices=new Map<string,'1'|'upc'>();
const memoryAttempts=new Map<string,Attempt>();
function notice(conversationId:string|null){
  if(!conversationId)return null;
  try{const stored=sessionStorage.getItem(noticePrefix+conversationId);if(stored==='1'||stored==='upc')return stored;}catch{/* Memory fallback. */}
  return memoryNotices.get(conversationId)??null;
}
export function rememberMiupcReconnect(conversationId:string|null,upcRequired=false){
  if(!conversationId||!/^[0-9a-f-]{36}$/i.test(conversationId))return;
  const value=upcRequired?'upc':'1';memoryNotices.set(conversationId,value);
  try{sessionStorage.setItem(noticePrefix+conversationId,value);}catch{/* Keep the notice in memory. */}
}
export function requiresUpcReconnect(conversationId:string|null){return notice(conversationId)==='upc';}
export function hasMiupcReconnectNotice(conversationId:string|null){return notice(conversationId)!==null;}
export function clearMiupcReconnectNotices(scope:'all'|'upc'='all'){
  for(const [id,value] of memoryNotices)if(scope==='all'||value==='upc'){memoryNotices.delete(id);memoryAttempts.delete(id);}
  if(scope==='all')memoryAttempts.clear();
  try{
    for(const key of Object.keys(sessionStorage))if(key.startsWith(noticePrefix)&&(scope==='all'||sessionStorage.getItem(key)==='upc')){sessionStorage.removeItem(key);sessionStorage.removeItem(attemptPrefix+key.slice(noticePrefix.length));}
    if(scope==='all')for(const key of Object.keys(sessionStorage))if(key.startsWith(attemptPrefix))sessionStorage.removeItem(key);
  }catch{/* Memory was cleared even if storage is denied. */}
}
export function rememberMiupcAttempt(conversationId:string|null,data:MiupcConnection){
  if(!conversationId||!data.attemptId||!Number.isFinite(data.expiresAt))return;
  const attempt={attemptId:data.attemptId,expiresAt:data.expiresAt!};memoryAttempts.set(conversationId,attempt);
  try{sessionStorage.setItem(attemptPrefix+conversationId,JSON.stringify(attempt));}catch{/* Memory fallback. */}
}
export function savedMiupcAttempt(conversationId:string|null):Attempt|null{
  if(!conversationId)return null;
  // Verification belongs to the account, so every affected chat can resume it.
  const attempts=[...memoryAttempts.values()];
  try{for(const key of Object.keys(sessionStorage))if(key.startsWith(attemptPrefix)){
    try{
      const data=JSON.parse(sessionStorage.getItem(key)??'null');
      if(data&&typeof data.attemptId==='string'&&/^[0-9a-f-]{36}$/i.test(data.attemptId)&&typeof data.expiresAt==='number'&&Number.isFinite(data.expiresAt))attempts.push({attemptId:data.attemptId,expiresAt:data.expiresAt});
    }catch{/* Ignore malformed optional metadata. */}
  }}catch{/* Retain the in-memory candidates. */}
  return attempts.sort((a,b)=>b.expiresAt-a.expiresAt)[0]??null;
}
export function forgetMiupcAttempt(conversationId:string|null){
  const attempt=savedMiupcAttempt(conversationId);if(!attempt)return;
  for(const [id,data] of memoryAttempts)if(data.attemptId===attempt.attemptId)memoryAttempts.delete(id);
  try{for(const key of Object.keys(sessionStorage))if(key.startsWith(attemptPrefix)){
    try{if(JSON.parse(sessionStorage.getItem(key)??'null')?.attemptId===attempt.attemptId)sessionStorage.removeItem(key);}catch{/* Ignore malformed metadata. */}
  }}catch{/* Memory was already cleared. */}
}
