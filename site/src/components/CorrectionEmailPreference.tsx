import{useEffect,useId,useRef,useState}from'react';
import{getCampusSession,type CampusSession}from'../scripts/campus-session';
export default function CorrectionEmailPreference(){
 const[value,setValue]=useState<boolean|null>(null),[saving,setSaving]=useState(false),[status,setStatus]=useState('');
 const generation=useRef(0),id=useId();
 useEffect(()=>{
  let owner:string|null=null;
  async function refresh(session:CampusSession){
   if(session.accessUnavailable)return;
   const next=session.authenticated?(session.analyticsId??session.email?.toLowerCase()??null):null;
   if(owner===next&&next)return;owner=next;const version=++generation.current;setValue(null);setSaving(false);setStatus('');
   if(!next)return;
   try{const r=await fetch('/api/app/correction-preferences',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();const data=await r.json();if(version===generation.current&&data.authenticated)setValue(data.enabled===true);}catch{if(version===generation.current)setStatus('No pudimos consultar tu preferencia de avisos. Recarga para intentarlo nuevamente.');}
  }
  void getCampusSession().then(refresh).catch(()=>{});
  const update=(event:Event)=>void refresh((event as CustomEvent<CampusSession>).detail);window.addEventListener('campus:session-updated',update);
  return()=>{generation.current++;window.removeEventListener('campus:session-updated',update);};
 },[]);
 if(value===null)return status?<p role="status">{status}</p>:null;
 return <section className="app-correction-preference" aria-labelledby="correction-emails-title">
  <h2 id="correction-emails-title">Avisos de correcciones</h2>
  <label htmlFor={id}><input id={id} type="checkbox" checked={value} disabled={saving} onChange={async event=>{
   const enabled=event.target.checked,previous=value,version=generation.current;setValue(enabled);setSaving(true);setStatus('');
   try{const r=await fetch('/api/app/correction-preferences',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({enabled}),signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();if(version===generation.current)setStatus('Preferencia guardada.');}catch{if(version===generation.current){setValue(previous);setStatus('No pudimos guardar el cambio. Inténtalo nuevamente.');}}finally{if(version===generation.current)setSaving(false);}
  }}/>Permitir que el equipo me avise por correo si corrige un problema relacionado con mis chats.</label>
  <p>Esta preferencia es para seguimiento de correcciones, no para promociones.</p>
  {status?<p role="status">{status}</p>:null}
 </section>;
}
