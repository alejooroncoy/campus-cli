import {useState} from 'react';
import {analyticsHeaders,track} from '../scripts/analytics';
export default function AgentFeedback({traceId,onResolved}:{traceId:string;onResolved?:()=>void}){
  const [state,setState]=useState<'ready'|'sending'|'done'|'error'>('ready');
  async function send(reason:'resolved'|'not_resolved'){
    if(state==='sending'||state==='done')return;setState('sending');
    try{
      const response=await fetch('/api/app/product-feedback',{method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/json',...analyticsHeaders()},body:JSON.stringify({kind:'agent',reason,traceId}),signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error();setState('done');track('campus_feedback_submitted',{feedback_kind:'agent',reason,trace_id:traceId});if(reason==='resolved')onResolved?.();
    }catch{setState('error');}
  }
  return <div className="app-profes-ai__feedback" role="group" aria-label="Valorar la respuesta">
    {state==='done'?<p role="status">Gracias por contarnos.</p>:<>
      <span>¿Resolviste lo que necesitabas?</span>{' '}
      <button type="button" className="app-text-link" disabled={state==='sending'} onClick={()=>void send('resolved')}>Sí</button>{' · '}
      <button type="button" className="app-text-link" disabled={state==='sending'} onClick={()=>void send('not_resolved')}>Todavía no</button>
      {state==='error'?<p role="status">No pudimos guardar tu respuesta. Puedes intentarlo nuevamente.</p>:null}
    </>}
  </div>;
}

