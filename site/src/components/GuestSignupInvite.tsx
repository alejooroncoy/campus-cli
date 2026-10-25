import{useEffect,useId,useRef,useState}from'react';
import{assistantLoginHref}from'../scripts/assistant-handoff';
import{markGuestDraftHandoff}from'../scripts/conversation-drafts';
import{track}from'../scripts/analytics';
const seenKey='campus-guest-value-invite-v1';
let shown=false;
const wasShown=()=>{try{return shown||sessionStorage.getItem(seenKey)==='1';}catch{return shown;}};

export default function GuestSignupInvite({traceId}:{traceId:string}){
 const[visible,setVisible]=useState(()=>!wasShown()),[emails,setEmails]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const root=useRef<HTMLElement>(null),checkboxId=useId();
 const active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{
  if(!visible||!root.current)return;
  let recorded=false;const record=()=>{if(recorded)return;recorded=true;shown=true;try{sessionStorage.setItem(seenKey,'1');}catch{}track('campus_guest_signup_invite_viewed',{trace_id:traceId});};
  if(typeof IntersectionObserver==='undefined'){record();return;}
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){record();observer.disconnect();}},{threshold:0.2});observer.observe(root.current);return()=>observer.disconnect();
 },[visible,traceId]);
 if(!visible)return null;
 const href=assistantLoginHref(typeof window==='undefined'?'/app/asistente/':window.location.pathname);
 return <section ref={root} className="app-guest-signup" aria-labelledby="guest-signup-title" data-guest-signup-invite>
  <h2 id="guest-signup-title">Guarda este chat con tu cuenta gratis</h2>
  <p>Crea tu cuenta Campus Free para volver a esta conversación y recibir 25 consultas de bienvenida.</p>
  <label className="app-guest-signup__consent" htmlFor={checkboxId}><input id={checkboxId} type="checkbox" checked={emails} disabled={saving} onChange={event=>{setEmails(event.target.checked);setError('');}}/>Quiero que el equipo pueda avisarme por correo si corrige un problema relacionado con mis chats.</label>
  <p className="app-guest-signup__note">Los avisos son opcionales. Puedes cambiar esta preferencia en Mi perfil.</p>
  <div className="app-guest-signup__actions">
   <a className="app-button" href={href} aria-disabled={saving||undefined} onClick={async event=>{
    if(saving){event.preventDefault();return;}
    event.preventDefault();setSaving(true);setError('');try{
     const response=await fetch('/api/app/correction-preferences',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:emails,traceId}),signal:AbortSignal.timeout(8000)});
     if(!response.ok)throw Error();
    }catch{if(active.current){setSaving(false);setError('No pudimos guardar tu preferencia de avisos. Puedes reintentar o seguir como invitado.');}return;}
    if(!active.current)return;
    markGuestDraftHandoff();track('campus_guest_signup_started',{trace_id:traceId});
    window.location.assign(href);
   }}>{saving?'Guardando…':'Crear cuenta y guardar mi chat'}</a>
   <button type="button" className="app-text-link" disabled={saving} onClick={()=>{shown=true;try{sessionStorage.setItem(seenKey,'1');}catch{}setVisible(false);track('campus_guest_signup_dismissed',{trace_id:traceId});}}>Seguir como invitado</button>
  </div>
  {error?<p role="alert">{error}</p>:null}
 </section>;
}
