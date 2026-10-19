import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {parseMiupcConnection,rememberMiupcAttempt,savedMiupcAttempt,forgetMiupcAttempt,rememberMiupcReconnect,type MiupcConnection} from '../scripts/miupc-reconnect';

class ConnectionRequestError extends Error {
  constructor(message:string,readonly retryable:boolean){super(message);}
}
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
export default function MiupcReconnect({disabled,upcRequired,conversationId,noticeRevision,freshNotice,onNoticeSeen,onConnected,onUpcAccessRestored,onDismiss}:{disabled:boolean;upcRequired:boolean;conversationId:string|null;noticeRevision:number;freshNotice:boolean;onNoticeSeen:()=>void;onConnected:()=>void;onUpcAccessRestored:()=>void;onDismiss:()=>void}) {
  const [connection,setConnection] = useState<MiupcConnection | null>(upcRequired?{status:'upc_reconnect_required'}:null);
  const [starting,setStarting] = useState(false);
  const [restoring,setRestoring]=useState(false);
  const restoringRequest=useRef(false);
  const [error,setError] = useState('');
  const [accessReady,setAccessReady]=useState(false);
  const [checkGrades,setCheckGrades]=useState(false);
  const [checkingAccess,setCheckingAccess]=useState(false);
  const accessRequest=useRef(false);
  const accessRestored=useRef(onUpcAccessRestored);accessRestored.current=onUpcAccessRestored;
  const popup = useRef<Window | null>(null);
  const navigated = useRef(false);
  const generation = useRef(0);
  const observedNotice=useRef(noticeRevision);
  const uncertainStart=useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savingDeadline=useRef<number|null>(null);
  const abort = useRef<AbortController | null>(null);
  const connected = useRef(onConnected); connected.current = onConnected;
  useEffect(()=>()=>{
    generation.current++; if(timer.current)clearTimeout(timer.current); abort.current?.abort();
    if(popup.current&&!navigated.current)popup.current.close();
  },[]);
  // Repeated tool notices must keep the current window and poll alive. A new
  // notice can reset a completed/failed card without unmounting an active login.
  useLayoutEffect(()=>{
    onNoticeSeen();
    const newNotice=observedNotice.current!==noticeRevision;observedNotice.current=noticeRevision;
    if((starting||restoring||['pending_login','saving'].includes(connection?.status??''))&&!upcRequired)return;
    generation.current++;if(timer.current)clearTimeout(timer.current);abort.current?.abort();
    accessRequest.current=false;setCheckingAccess(false);restoringRequest.current=false;setRestoring(false);setStarting(false);
    if(upcRequired&&newNotice&&starting)uncertainStart.current=true;
    if(upcRequired&&newNotice)forgetMiupcAttempt(conversationId);
    if(popup.current&&(upcRequired||!navigated.current)){try{popup.current.close();}catch{/* Isolated windows may sever the handle. */}popup.current=null;}
    setConnection(upcRequired?{status:'upc_reconnect_required'}:null);setAccessReady(false);setCheckGrades(false);setError('');
  },[noticeRevision]);
  async function request(start:boolean,signal:AbortSignal,allowHistoric:boolean|'discover'=false) {
    const response = await fetch(endpoint,{method:start?'POST':'GET',credentials:'same-origin',cache:'no-store',
      ...(start?{headers:{'content-type':'application/json'},body:'{}'}:{}),
      signal:AbortSignal.any([signal,AbortSignal.timeout(50_000)])});
    if(!response.ok)throw new ConnectionRequestError(response.status===401?'Inicia sesión en Campus para reconectar.':'No pudimos comprobar la conexión. Inténtalo de nuevo.',response.status>=500||[408,429].includes(response.status));
    const data=await response.json();
    if(allowHistoric&&data?.status==='connected'&&!data.attemptId)return {status:allowHistoric==='discover'?'connected':'not_connected'} as MiupcConnection;
    try{return parseMiupcConnection(data);}catch(cause){throw new ConnectionRequestError(cause instanceof Error?cause.message:'No pudimos confirmar esta verificación.',false);}
  }
  function update(data:MiupcConnection,current:number,signal:AbortSignal,attemptId?:string,expiresAt?:number) {
    if(current!==generation.current||signal.aborted)return;
    // A durable "connected" flag from an earlier login is not confirmation of
    // this verification. A worker restart must not silently mark it complete.
    if(attemptId && ['pending_login','saving','connected'].includes(data.status) && data.attemptId!==attemptId){update({status:'failed'},current,signal);setError('Se interrumpió la verificación. Vuelve a conectar Mi UPC.');return;}
    if(data.status==='saving'){
      savingDeadline.current??=Date.now()+120_000;
      if(Date.now()>=savingDeadline.current){update({status:'failed'},current,signal);setError('La conexión no terminó de guardarse. Vuelve a comprobar Mi UPC.');return;}
    }else savingDeadline.current=null;
    setConnection(data);setError('');
    if(['pending_login','saving'].includes(data.status))rememberMiupcAttempt(conversationId,data);
    else {
      forgetMiupcAttempt(conversationId);
      try{popup.current?.close();}catch{/* Browser isolation can sever this handle. */}
      popup.current=null;
    }
    if(['upc_reconnect_required','reconnect_required'].includes(data.status))rememberMiupcReconnect(conversationId,true);
    if(data.status==='connected'){
      popup.current?.close();popup.current=null;connected.current();return;
    }
    if(!['pending_login','saving'].includes(data.status))return;
    const deadline=data.expiresAt??expiresAt;
    // A failed status read does not end the owner's live verification.
    // Keep its action disabled and retry within a bounded recovery window.
    const retryUntil=data.status==='saving'?savingDeadline.current:deadline;
    const poll=()=>{timer.current=setTimeout(async()=>{
      if(current!==generation.current||signal.aborted)return;
      try{
        const next=await request(false,signal);
        if(current!==generation.current||signal.aborted)return;
        if(next.status==='busy'&&retryUntil&&Date.now()<retryUntil){setError('Hay una consulta en curso. Seguimos comprobando tu verificación…');poll();return;}
        if(next.status==='pending_login'&&next.expiresAt&&Date.now()>=next.expiresAt){update({status:'expired'},current,signal);return;}
        update(next,current,signal,data.attemptId??attemptId,deadline);
      }
      catch(cause){
        if(current!==generation.current||signal.aborted)return;
        if((!(cause instanceof ConnectionRequestError)||cause.retryable)&&retryUntil&&Date.now()<retryUntil){setError('La conexión está tardando. Seguimos comprobando tu verificación…');poll();return;}
        update({status:deadline&&Date.now()>=deadline?'expired':'failed'},current,signal);setError(deadline&&Date.now()>=deadline?'':cause instanceof ConnectionRequestError?cause.message:copy.failed);
      }
    },3000);};poll();
  }
  useEffect(()=>{
    const saved=savedMiupcAttempt(conversationId);
    if(upcRequired||starting||restoring||['pending_login','saving'].includes(connection?.status??''))return;
    const current=generation.current;const controller=new AbortController();abort.current=controller;
    let retryUntil=saved?.expiresAt??0;
    const settled=()=>{if(current===generation.current){restoringRequest.current=false;setRestoring(false);}};
    const restore=()=>{
      if(current!==generation.current||controller.signal.aborted){settled();return;}
      if(Date.now()>=retryUntil){update({status:'expired'},current,controller.signal);settled();return;}
      const readSignal=AbortSignal.any([controller.signal,AbortSignal.timeout(Math.max(1,retryUntil-Date.now()))]);
      void request(false,readSignal,saved?false:'discover').then(data=>{
      if(current!==generation.current||controller.signal.aborted){settled();return;}
      if(!saved&&data.status==='connected'){
        // A connection made elsewhere is only a candidate: reading grades
        // provides the fresh proof, not an uncorrelated cached SDK flag.
        setCheckGrades(true);settled();return;
      }
      if(saved&&data.status==='busy'&&current===generation.current&&!controller.signal.aborted&&Date.now()<retryUntil){timer.current=setTimeout(restore,Math.min(3000,Math.max(1,retryUntil-Date.now())));return;}
      if((data.status==='busy'&&Date.now()>=retryUntil)||(data.status==='pending_login'&&data.expiresAt&&Date.now()>=data.expiresAt))data={status:'expired'};
      update(data,current,controller.signal,saved?.attemptId,saved?.expiresAt);settled();
    }).catch(cause=>{
      if(current!==generation.current||controller.signal.aborted){settled();return;}
      if(!saved||(cause instanceof ConnectionRequestError&&!cause.retryable)||Date.now()>=retryUntil){const expired=Date.now()>=retryUntil;update({status:expired?'expired':'failed'},current,controller.signal);if(!expired)setError(cause instanceof ConnectionRequestError?cause.message:'No pudimos recuperar la verificación. Puedes volver a conectar Mi UPC.');settled();return;}
      setError('La conexión está tardando. Seguimos recuperando tu verificación…');timer.current=setTimeout(restore,Math.min(3000,Math.max(1,retryUntil-Date.now())));
    });};
    const beginRestore=()=>{
      if(current!==generation.current||controller.signal.aborted||restoringRequest.current)return;
      if(!saved&&savedMiupcAttempt(conversationId))return;
      if(!saved)retryUntil=Date.now()+50_000;
      restoringRequest.current=true;setRestoring(true);setCheckGrades(false);restore();
    };
    if(saved||!freshNotice)beginRestore();
    const returned=()=>{if(document.visibilityState==='visible')beginRestore();};
    if(!saved){window.addEventListener('focus',returned);document.addEventListener('visibilitychange',returned);}
    return()=>{window.removeEventListener('focus',returned);document.removeEventListener('visibilitychange',returned);};
  },[noticeRevision]);
  async function reconcileStart(signal:AbortSignal,waitForActive=false){
    const deadline=Date.now()+120_000;
    for(;;){
      if(Date.now()>=deadline){
        if(waitForActive)return {status:'busy'} as MiupcConnection;
        throw new ConnectionRequestError('No pudimos confirmar esta nueva verificación. Vuelve a consultar tus notas o reconecta Mi UPC.',false);
      }
      try{
        const data=await request(false,AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,deadline-Date.now()))]),true);
        // Busy also covers grade readers. Their lease can coexist with an old
        // cached connected ID, so first observe an active verification ID.
        if(data.status==='not_connected'||(waitForActive&&data.status==='busy'))throw new ConnectionRequestError('Hay una conexión en curso.',true);
        if(data.status==='connected')throw new ConnectionRequestError('No pudimos confirmar esta nueva verificación. Vuelve a consultar tus notas o reconecta Mi UPC.',true);
        return data;
      }
      catch(cause){
        if(signal.aborted||(cause instanceof ConnectionRequestError&&!cause.retryable))throw cause;
        if(Date.now()>=deadline){if(waitForActive)return {status:'busy'} as MiupcConnection;throw cause;}
        await new Promise<void>((resolve,reject)=>{
          const cancelled=()=>{if(timer.current)clearTimeout(timer.current);reject(new DOMException('Aborted','AbortError'));};
          signal.addEventListener('abort',cancelled,{once:true});
          timer.current=setTimeout(()=>{signal.removeEventListener('abort',cancelled);resolve();},3000);
        });
      }
    }
  }
  async function start() {
    if(starting||restoringRequest.current||disabled)return;
    const current=++generation.current;
    if(timer.current)clearTimeout(timer.current);abort.current?.abort();
    const controller=new AbortController();abort.current=controller;
    // Open during the user gesture so browsers do not block a later async open.
    // The blank window has no access back to Campus when it reaches Browserbase.
    try{popup.current?.close();}catch{/* The browser may have severed the old window handle. */}
    popup.current=null;
    popup.current=window.open('about:blank','_blank');navigated.current=false;
    if(popup.current)popup.current.opener=null;
    setStarting(true);setConnection(null);setError('');
    try{
      let data:MiupcConnection;
      const reconcileOnly=uncertainStart.current;
      try{
        // A superseded POST can still materialize remotely. Reconcile it
        // before any replacement request, even after a notice transition.
        data=reconcileOnly?await reconcileStart(controller.signal,true):await request(true,controller.signal);
        if(current===generation.current&&!controller.signal.aborted&&!['busy','upc_reconnect_required','reconnect_required'].includes(data.status))uncertainStart.current=false;
      }
      catch(cause){
        // The POST may have created a login before its response was lost.
        // Discover the owner's existing attempt instead of starting another.
        if(controller.signal.aborted||(cause instanceof ConnectionRequestError&&!cause.retryable))throw cause;
        data=await reconcileStart(controller.signal);
      }
      if(data.status==='busy'&&!reconcileOnly)data=await reconcileStart(controller.signal,true);
      if(current!==generation.current||controller.signal.aborted)return;
      if(data.loginUrl&&popup.current&&!popup.current.closed){popup.current.location.replace(data.loginUrl);navigated.current=true;}
      else{popup.current?.close();popup.current=null;}
      update(data,current,controller.signal);
    }catch(cause){
      if(current===generation.current&&!controller.signal.aborted){
        if(!navigated.current)popup.current?.close();popup.current=null;
        setConnection({status:'failed'});setError(cause instanceof ConnectionRequestError?cause.message:copy.failed);
      }
    }finally{if(current===generation.current)setStarting(false);}
  }
  async function checkAuthorization(){
    if(accessRequest.current||disabled)return;
    accessRequest.current=true;setCheckingAccess(true);setError('');
    const current=generation.current;const controller=new AbortController();abort.current=controller;
    try{
      const response=await fetch(endpoint,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(50_000)])});
      let data=response.ok?await response.json():null;
      if(current!==generation.current||controller.signal.aborted)return;
      // This checks the live UPC grant, not completion of a Browserbase login.
      // A durable connected flag must never pretend this verification finished.
      if(data&&['connected','not_connected','pending_login','saving'].includes(data.status)){
        if(uncertainStart.current){
          if(!['pending_login','saving'].includes(data.status)){
            data=await reconcileStart(controller.signal,true);
            if(current!==generation.current||controller.signal.aborted)return;
            if(data.status==='busy')data=await request(false,controller.signal,true);
          }
          if(current!==generation.current||controller.signal.aborted)return;
          const recovered=parseMiupcConnection(data);
          if(['upc_reconnect_required','reconnect_required'].includes(recovered.status)){update(recovered,current,controller.signal);return;}
          uncertainStart.current=false;
          if(['pending_login','saving','busy'].includes(recovered.status)){
            rememberMiupcReconnect(conversationId,false);accessRestored.current();update(recovered,current,controller.signal);return;
          }
          // With no attempt after the bound, the fresh owner-bound read proves
          // authorization only. It must not claim Microsoft verification done.
        }
        if(['pending_login','saving'].includes(data.status)){
          // A cancelled POST may still have created a remote login. Once UPC
          // authorization is valid again, discover and resume that same attempt.
          const active=parseMiupcConnection(data);
          rememberMiupcReconnect(conversationId,false);accessRestored.current();
          update(active,current,controller.signal);return;
        }
        setConnection(null);setAccessReady(true);accessRestored.current();
      }else setError(data?.status==='upc_reconnect_required'||data?.status==='reconnect_required'?'Tu acceso UPC aún no se ha actualizado. Completa la conexión en la otra pestaña.':'No pudimos comprobar el acceso UPC. Inténtalo de nuevo.');
    }catch(cause){if(current===generation.current&&!controller.signal.aborted)setError('No pudimos comprobar el acceso UPC. Inténtalo de nuevo.');}
    finally{if(current===generation.current){accessRequest.current=false;setCheckingAccess(false);}}
  }
  useEffect(()=>{
    if(!['upc_reconnect_required','reconnect_required'].includes(connection?.status??''))return;
    const returned=()=>{if(document.visibilityState==='visible')void checkAuthorization();};
    window.addEventListener('focus',returned);document.addEventListener('visibilitychange',returned);
    return()=>{window.removeEventListener('focus',returned);document.removeEventListener('visibilitychange',returned);};
  },[connection?.status,disabled]);
  const waiting=starting||restoring||connection?.status==='pending_login'||connection?.status==='saving';
  const done=connection?.status==='connected'||accessReady||checkGrades;
  const needsUpcAccess=connection?.status==='upc_reconnect_required'||connection?.status==='reconnect_required';
  const statusLoading=starting||restoring||checkingAccess||connection?.status==='saving'||error.includes('Seguimos comprobando');
  const statusText=checkGrades?'Campus tiene una conexión guardada. Vuelve a preguntar por tus notas para comprobar el acceso actual.':accessReady?'Ya puedes volver a preguntar por tus notas en esta conversación.':restoring?'Recuperando la verificación…':checkingAccess?'Comprobando tu acceso UPC…':starting?'Preparando la ventana segura…':error||(connection?copy[connection.status]:'Reconecta para consultar tus notas. Tu conversación y lo que estás escribiendo se conservan.');
  return <aside className="app-miupc-reconnect" aria-label="Reconexión de Mi UPC">
    <div><strong>{checkGrades?'Comprueba tus notas':accessReady?'Acceso UPC actualizado':done?'Mi UPC está conectado':needsUpcAccess?'Actualiza tu acceso UPC':'Mi UPC necesita verificar tu acceso'}</strong>
      <p role="status" aria-live="polite" aria-busy={statusLoading}>{statusLoading?<><span className="app-sr-only">{statusText}</span><span className="app-skeleton app-skeleton--line" aria-hidden="true"/></>:statusText}</p>
    </div>
    <div className="app-miupc-reconnect__actions">
      {needsUpcAccess?<a href="https://profes.campuscli.com/?conectar=banner" target="_blank" rel="noopener noreferrer">Actualizar acceso UPC ↗</a>:done?<button type="button" onClick={onDismiss}>{checkGrades?'Seguir en el chat':'Listo'}</button>:<button type="button" onClick={()=>void start()} disabled={disabled||waiting}>{restoring?'Recuperando…':starting?'Preparando…':waiting?'Esperando verificación…':'Reconectar Mi UPC'}</button>}
      {needsUpcAccess?<button type="button" onClick={()=>void checkAuthorization()} disabled={disabled||checkingAccess}>{checkingAccess?'Comprobando…':'Ya actualicé mi acceso'}</button>:null}
      {connection?.loginUrl?<a href={connection.loginUrl} target="_blank" rel="noopener noreferrer">Abrir ventana de verificación ↗</a>:null}
    </div>
  </aside>;
}
