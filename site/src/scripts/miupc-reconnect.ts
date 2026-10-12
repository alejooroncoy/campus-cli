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
// Store only the notice category, scoped to an already saved conversation. Live login
// capabilities, credentials and grade data never enter browser storage.
const noticePrefix = 'campus-miupc-reconnect:';
export function rememberMiupcReconnect(conversationId: string | null, upcRequired=false) {
  if (!conversationId || !/^[0-9a-f-]{36}$/i.test(conversationId)) return;
  try { sessionStorage.setItem(noticePrefix + conversationId, upcRequired?'upc':'1'); } catch { /* Notice still works in memory. */ }
}
export function requiresUpcReconnect(conversationId:string|null){
  try{return Boolean(conversationId&&sessionStorage.getItem(noticePrefix+conversationId)==='upc');}catch{return false;}
}
export function hasMiupcReconnectNotice(conversationId: string | null) {
  try { return Boolean(conversationId && ['1','upc'].includes(sessionStorage.getItem(noticePrefix + conversationId)??'')); } catch { return false; }
}
export function clearMiupcReconnectNotices(scope:"all"|"upc"="all") {
  try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(noticePrefix) && (scope==='all'||sessionStorage.getItem(key)==='upc')) {sessionStorage.removeItem(key);sessionStorage.removeItem(attemptPrefix+key.slice(noticePrefix.length));} if(scope==='all')for(const key of Object.keys(sessionStorage))if(key.startsWith(attemptPrefix))sessionStorage.removeItem(key); } catch { /* Private browsing. */ }
}

// Correlation metadata is not a login capability. Never retain the live URL.
const attemptPrefix='campus-miupc-attempt:';
export function rememberMiupcAttempt(conversationId:string|null,data:MiupcConnection){
  if(!conversationId||!data.attemptId||!Number.isFinite(data.expiresAt))return;
  try{sessionStorage.setItem(attemptPrefix+conversationId,JSON.stringify({attemptId:data.attemptId,expiresAt:data.expiresAt}));}catch{/* Optional storage. */}
}
export function savedMiupcAttempt(conversationId:string|null):{attemptId:string;expiresAt:number}|null{
  if(!conversationId)return null;
  try{
    // Mi UPC verification belongs to the account. Every affected chat can
    // resume the newest active attempt; each status read remains owner-bound.
    const attempts=Object.keys(sessionStorage).filter(key=>key.startsWith(attemptPrefix)).flatMap(key=>{
      try{
        const data=JSON.parse(sessionStorage.getItem(key)??'null');
        return data&&typeof data.attemptId==='string'&&/^[0-9a-f-]{36}$/i.test(data.attemptId)&&typeof data.expiresAt==='number'&&Number.isFinite(data.expiresAt)?[{attemptId:data.attemptId,expiresAt:data.expiresAt}]:[];
      }catch{return [];}
    });
    return attempts.sort((a,b)=>b.expiresAt-a.expiresAt)[0]??null;
  }catch{return null;}
}
export function forgetMiupcAttempt(conversationId:string|null){
  const attempt=savedMiupcAttempt(conversationId);
  if(!attempt)return;
  try{for(const key of Object.keys(sessionStorage))if(key.startsWith(attemptPrefix)){
    try{if(JSON.parse(sessionStorage.getItem(key)??'null')?.attemptId===attempt.attemptId)sessionStorage.removeItem(key);}catch{/* Ignore malformed optional metadata. */}
  }}catch{/* Optional storage. */}
}
