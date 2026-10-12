import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {parseMiupcConnection,rememberMiupcAttempt,savedMiupcAttempt,forgetMiupcAttempt,rememberMiupcReconnect,type MiupcConnection} from '../scripts/miupc-reconnect';

const endpoint = '/api/app/miupc/connect/';
const copy: Record<MiupcConnection['status'], string> = {
  pending_login:'Completa la verificación en la ventana segura. Este chat seguirá aquí.',
  saving:'Guardando tu conexión…', connected:'Conexión restablecida. Ya puedes seguir preguntando en este chat.',
  expired:'La ventana de verificación venció. Vuelve a conectar Mi UPC.',
  failed:'No pudimos completar la conexión. Puedes volver a intentarlo.',
  not_connected:'Vuelve a conectar Mi UPC para consultar tus notas.',
  upc_reconnect_required:'Actualiza tu acceso institucional UPC en otra pestaña. Tu conversación seguirá aquí.',
  reconnect_required:'Primero hay que actualizar tu acceso UPC. Ábrelo en otra pestaña; este chat seguirá aquí.',
  not_configured:'La reconexión no está disponible en este momento. Inténtalo más tarde.',
  busy:'Hay una consulta de Mi UPC en curso. Espera a que termine y vuelve a intentarlo.',
  not_supported:'Esta conexión está disponible para estudiantes de UPC.',
};
export default function MiupcReconnect({disabled,upcRequired,conversationId,noticeRevision,onConnected,onUpcAccessRestored,onDismiss}:{disabled:boolean;upcRequired:boolean;conversationId:string|null;noticeRevision:number;onConnected:()=>void;onUpcAccessRestored:()=>void;onDismiss:()=>void}) {
  const [connection,setConnection] = useState<MiupcConnection | null>(upcRequired?{status:'upc_reconnect_required'}:null);
  const [starting,setStarting] = useState(false);
  const [restoring,setRestoring]=useState(false);
  const restoringRequest=useRef(false);
  const [error,setError] = useState('');
  const [accessReady,setAccessReady]=useState(false);
  const [checkingAccess,setCheckingAccess]=useState(false);
  const accessRequest=useRef(false);
  const accessRestored=useRef(onUpcAccessRestored);accessRestored.current=onUpcAccessRestored;
  const popup = useRef<Window | null>(null);
  const navigated = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);
  const connected = useRef(onConnected); connected.current = onConnected;
  useEffect(()=>()=>{
    generation.current++; if(timer.current)clearTimeout(timer.current); abort.current?.abort();
    if(popup.current&&!navigated.current)popup.current.close();
  },[]);
  // Repeated tool notices must keep the current window and poll alive. A new
  // notice can reset a completed/failed card without unmounting an active login.
  useLayoutEffect(()=>{
    if((starting||restoring||['pending_login','saving'].includes(connection?.status??''))&&!upcRequired)return;
    generation.current++;if(timer.current)clearTimeout(timer.current);abort.current?.abort();
    accessRequest.current=false;setCheckingAccess(false);restoringRequest.current=false;setRestoring(false);setStarting(false);
    if(popup.current&&!navigated.current){popup.current.close();popup.current=null;}
    setConnection(upcRequired?{status:'upc_reconnect_required'}:null);setAccessReady(false);setError('');
  },[noticeRevision]);
  async function request(start:boolean,signal:AbortSignal) {
    const response = await fetch(endpoint,{method:start?'POST':'GET',credentials:'same-origin',cache:'no-store',
      ...(start?{headers:{'content-type':'application/json'},body:'{}'}:{}),
      signal:AbortSignal.any([signal,AbortSignal.timeout(50_000)])});
    if(!response.ok)throw Error(response.status===401?'Inicia sesión en Campus para reconectar.':'No pudimos comprobar la conexión. Inténtalo de nuevo.');
    return parseMiupcConnection(await response.json());
  }
  function update(data:MiupcConnection,current:number,signal:AbortSignal,attemptId?:string,expiresAt?:number) {
    if(current!==generation.current||signal.aborted)return;
    // A durable "connected" flag from an earlier login is not confirmation of
    // this verification. A worker restart must not silently mark it complete.
    if(attemptId && ['pending_login','saving','connected'].includes(data.status) && data.attemptId!==attemptId){setConnection({status:'failed'});setError('Se interrumpió la verificación. Vuelve a conectar Mi UPC.');return;}
    setConnection(data);setError('');
    if(['pending_login','saving'].includes(data.status))rememberMiupcAttempt(conversationId,data);
    else forgetMiupcAttempt(conversationId);
    if(['upc_reconnect_required','reconnect_required'].includes(data.status))rememberMiupcReconnect(conversationId,true);
    if(data.status==='connected'){
      popup.current?.close();popup.current=null;connected.current();return;
    }
    if(!['pending_login','saving'].includes(data.status))return;
    const deadline=data.expiresAt??expiresAt;
    // A failed status read does not end the owner's live verification.
    // Keep its action disabled and retry within a bounded recovery window.
    const retryUntil=data.status==='saving'?Math.max(deadline??0,Date.now()+120_000):deadline;
    const poll=()=>{timer.current=setTimeout(async()=>{
      if(current!==generation.current||signal.aborted)return;
      try{
        const next=await request(false,signal);
        if(current!==generation.current||signal.aborted)return;
        if(next.status==='pending_login'&&next.expiresAt&&Date.now()>=next.expiresAt){update({status:'expired'},current,signal);return;}
        update(next,current,signal,data.attemptId??attemptId,deadline);
      }
      catch(cause){
        if(current!==generation.current||signal.aborted)return;
        if(retryUntil&&Date.now()<retryUntil){setError('La conexión está tardando. Seguimos comprobando tu verificación…');poll();return;}
        setConnection({status:deadline&&Date.now()>=deadline?'expired':'failed'});setError(deadline&&Date.now()>=deadline?'':cause instanceof Error?cause.message:copy.failed);
      }
    },3000);};poll();
  }
  useEffect(()=>{
    const saved=savedMiupcAttempt(conversationId);
    if(!saved||upcRequired)return;
    const current=generation.current;const controller=new AbortController();abort.current=controller;
    restoringRequest.current=true;setRestoring(true);
    void request(false,controller.signal).then(data=>update(data,current,controller.signal,saved.attemptId,saved.expiresAt)).catch(()=>{
      if(current===generation.current&&!controller.signal.aborted){setError('No pudimos recuperar la verificación. Puedes volver a conectar Mi UPC.');}
    }).finally(()=>{restoringRequest.current=false;if(current===generation.current)setRestoring(false);});
  },[]);
  async function start() {
    if(starting||restoringRequest.current||disabled)return;
    const current=++generation.current;
    if(timer.current)clearTimeout(timer.current);abort.current?.abort();
    const controller=new AbortController();abort.current=controller;
    // Open during the user gesture so browsers do not block a later async open.
    // The blank window has no access back to Campus when it reaches Browserbase.
    popup.current=window.open('about:blank','_blank');navigated.current=false;
    if(popup.current)popup.current.opener=null;
    setStarting(true);setConnection(null);setError('');
    try{
      const data=await request(true,controller.signal);
      if(current!==generation.current||controller.signal.aborted)return;
      if(data.loginUrl&&popup.current&&!popup.current.closed){popup.current.location.replace(data.loginUrl);navigated.current=true;}
      else{popup.current?.close();popup.current=null;}
      update(data,current,controller.signal);
    }catch(cause){
      if(current===generation.current&&!controller.signal.aborted){
        if(!navigated.current)popup.current?.close();popup.current=null;
        setConnection({status:'failed'});setError(cause instanceof Error?cause.message:copy.failed);
      }
    }finally{if(current===generation.current)setStarting(false);}
  }
  async function checkAuthorization(){
    if(accessRequest.current||disabled)return;
    accessRequest.current=true;setCheckingAccess(true);setError('');
    const current=generation.current;const controller=new AbortController();abort.current=controller;
    try{
      const response=await fetch(endpoint,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(50_000)])});
      const data=response.ok?await response.json():null;
      if(current!==generation.current||controller.signal.aborted)return;
      // This checks the live UPC grant, not completion of a Browserbase login.
      // A durable connected flag must never pretend this verification finished.
      if(data&&['connected','not_connected','pending_login','saving'].includes(data.status)){
        setConnection(null);setAccessReady(true);accessRestored.current();
      }else setError(data?.status==='upc_reconnect_required'||data?.status==='reconnect_required'?'Tu acceso UPC aún no se ha actualizado. Completa la conexión en la otra pestaña.':'No pudimos comprobar el acceso UPC. Inténtalo de nuevo.');
    }catch(cause){if(current===generation.current&&!controller.signal.aborted)setError('No pudimos comprobar el acceso UPC. Inténtalo de nuevo.');}
    finally{accessRequest.current=false;if(current===generation.current)setCheckingAccess(false);}
  }
  useEffect(()=>{
    if(!['upc_reconnect_required','reconnect_required'].includes(connection?.status??''))return;
    const returned=()=>{if(document.visibilityState==='visible')void checkAuthorization();};
    window.addEventListener('focus',returned);document.addEventListener('visibilitychange',returned);
    return()=>{window.removeEventListener('focus',returned);document.removeEventListener('visibilitychange',returned);};
  },[connection?.status,disabled]);
  const waiting=starting||restoring||connection?.status==='pending_login'||connection?.status==='saving';
  const done=connection?.status==='connected'||accessReady;
  const needsUpcAccess=connection?.status==='upc_reconnect_required'||connection?.status==='reconnect_required';
  return <aside className="app-miupc-reconnect" aria-label="Reconexión de Mi UPC">
    <div><strong>{accessReady?'Acceso UPC actualizado':done?'Mi UPC está conectado':needsUpcAccess?'Actualiza tu acceso UPC':'Mi UPC necesita verificar tu acceso'}</strong>
      <p role="status" aria-live="polite">{accessReady?'Ya puedes volver a preguntar por tus notas en esta conversación.':restoring?'Recuperando la verificación…':checkingAccess?'Comprobando tu acceso UPC…':starting?'Preparando la ventana segura…':error||(connection?copy[connection.status]:'Reconecta para consultar tus notas. Tu conversación y lo que estás escribiendo se conservan.')}</p>
    </div>
    <div className="app-miupc-reconnect__actions">
      {needsUpcAccess?<a href="https://profes.campuscli.com/?conectar=banner" target="_blank" rel="noopener noreferrer">Actualizar acceso UPC ↗</a>:done?<button type="button" onClick={onDismiss}>Listo</button>:<button type="button" onClick={()=>void start()} disabled={disabled||waiting}>{restoring?'Recuperando…':starting?'Preparando…':waiting?'Esperando verificación…':'Reconectar Mi UPC'}</button>}
      {needsUpcAccess?<button type="button" onClick={()=>void checkAuthorization()} disabled={disabled||checkingAccess}>{checkingAccess?'Comprobando…':'Ya actualicé mi acceso'}</button>:null}
      {connection?.loginUrl?<a href={connection.loginUrl} target="_blank" rel="noopener noreferrer">Abrir ventana de verificación ↗</a>:null}
    </div>
  </aside>;
}
