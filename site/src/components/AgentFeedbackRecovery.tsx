import {useEffect,useId,useRef,useState} from 'react';
import {track} from '../scripts/analytics';

const reasons=[['wrong_answer','No respondió mi pregunta'],['incorrect_information','La información era incorrecta'],['not_found','No encontró lo que buscaba'],['technical_problem','Se trabó o dio un error'],['other','Otro problema']] as const;
type FailureReason=typeof reasons[number][0];

export default function AgentFeedbackRecovery({traceId,pending,ensureFeedback}:{traceId:string;pending:boolean;ensureFeedback:()=>Promise<boolean>}){
 const [reason,setReason]=useState<FailureReason|''>(''),[details,setDetails]=useState(''),[phone,setPhone]=useState('');
 const [saving,setSaving]=useState(false),[saved,setSaved]=useState(false),[callback,setCallback]=useState(false),[error,setError]=useState(''),[closed,setClosed]=useState(false);
 const id=useId(),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 if(closed)return null;
 const support='https://wa.me/51946189585?text='+encodeURIComponent(`Hola, Campus no resolvió mi consulta. ¿Me pueden ayudar? Referencia: ${traceId}`);
 return <section className="app-agent-recovery" aria-labelledby={id+'-title'} data-agent-recovery>
  <h2 id={id+'-title'}>{saved?'Gracias por ayudarnos a mejorar':'¿Qué falló?'}</h2>
  {saved?<p role="status">{callback?'Guardamos tu WhatsApp para que el equipo pueda avisarte cuando resuelva este problema.':'Recibimos tu comentario para revisar qué pasó.'}</p>:<p>Cuéntanos para poder ayudarte. También puedes seguir preguntando en este chat.</p>}
  <div className="app-agent-recovery__actions">
   <a href={support} target="_blank" rel="noopener noreferrer" className="app-text-link" onClick={()=>track('campus_agent_support_opened',{trace_id:traceId})}>Hablar con soporte por WhatsApp</a>
   <button type="button" className="app-text-link" onClick={()=>{setClosed(true);document.getElementById('profes-message')?.focus();}}>Seguir consultando</button>
  </div>
  {!saved?<form onSubmit={async event=>{
    event.preventDefault();if(saving||pending)return;setSaving(true);setError('');
    try{
     if(!await ensureFeedback())throw Error('No pudimos guardar tu valoración. Inténtalo nuevamente o escribe a soporte.');
     const response=await fetch('/api/app/agent-feedback-followup',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
      body:JSON.stringify({traceId,...(reason?{failureReason:reason}:{}),details:details.trim(),...(phone.trim()?{whatsappPhone:phone.trim(),whatsappConsent:true}:{})}),signal:AbortSignal.timeout(8000)});
     const result=await response.json();if(!response.ok)throw Error(result.error??'No pudimos guardar tu comentario.');
     if(!active.current)return;
     setCallback(result.callbackRequested===true);setSaved(true);setPhone('');setDetails('');
     track('campus_agent_followup_saved',{trace_id:traceId,...(reason?{failure_reason:reason}:{}),callback_requested:result.callbackRequested===true});
    }catch(err){if(active.current)setError(err instanceof Error?err.message:'No pudimos guardar tu comentario. Inténtalo nuevamente o escribe a soporte.');}
    finally{if(active.current)setSaving(false);}
   }}>
    <fieldset disabled={saving}><legend>Elige lo que pasó (opcional)</legend>{reasons.map(([value,label])=><label key={value}><input type="radio" name={id+'-reason'} value={value} checked={reason===value} onChange={()=>setReason(value)}/>{label}</label>)}</fieldset>
    <label htmlFor={id+'-details'}>¿Qué necesitabas? (opcional)</label>
    <textarea id={id+'-details'} value={details} onChange={e=>setDetails(e.target.value)} maxLength={600} rows={3} disabled={saving} placeholder="Cuéntanos qué faltó o qué salió mal."/>
    <label htmlFor={id+'-phone'}>Tu WhatsApp para avisarte cuando lo resolvamos (opcional)</label>
    <input id={id+'-phone'} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e=>{setPhone(e.target.value);setError('');}} maxLength={32} disabled={saving} placeholder="+51 999 999 999" aria-describedby={id+'-permission'}/>
    <p id={id+'-permission'} className="app-agent-recovery__note">No necesitas crear una cuenta. Al guardar tu número, permites que el equipo te escriba por WhatsApp sobre la solución de este problema.</p>
    <button type="submit" className="app-button" disabled={saving||pending||!(reason||details.trim()||phone.trim())}>{saving?'Guardando…':phone.trim()?'Guardar número y avisarme':'Enviar comentario'}</button>
    {error?<p role="alert">{error}</p>:null}
   </form>:null}
 </section>;
}
