import {useState} from 'react';
import {analyticsHeaders,track} from '../scripts/analytics';
import AgentFeedbackRecovery from './AgentFeedbackRecovery';
export default function AgentFeedback({traceId,onResolved}:{traceId:string;onResolved?:()=>void}){
  const [state,setState]=useState<'ready'|'sending'|'done'|'error'>('ready');
  const [choice,setChoice]=useState<'resolved'|'not_resolved'|null>(null);
  async function send(reason:'resolved'|'not_resolved'){
    if(state==='done')return choice===reason;
    if(state==='sending')return false;setChoice(reason);setState('sending');
    try{
      const response=await fetch('/api/app/product-feedback',{method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/json',...analyticsHeaders()},body:JSON.stringify({kind:'agent',reason,traceId}),signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error();setState('done');track('campus_feedback_submitted',{feedback_kind:'agent',reason,trace_id:traceId});if(reason==='resolved')onResolved?.();
      return true;
    }catch{setState('error');return false;}
  }
  return <div className="app-profes-ai__feedback" role="group" aria-label="Valorar la respuesta">
    {state==='done'?<p role="status">Gracias por contarnos.</p>:<>
      <span>¿Resolviste lo que necesitabas?</span>
      <button type="button" className="app-profes-ai__feedback-option" disabled={state==='sending'} onClick={()=>void send('resolved')}>Sí</button>
      <button type="button" className="app-profes-ai__feedback-option" disabled={state==='sending'} onClick={()=>void send('not_resolved')}>Todavía no</button>
      {state==='error'?<p role="status">No pudimos guardar tu respuesta. Puedes intentarlo nuevamente.</p>:null}
    </>}
    {choice==='not_resolved'?<AgentFeedbackRecovery traceId={traceId} pending={state==='sending'} ensureFeedback={()=>send('not_resolved')}/>:null}
  </div>;
}

