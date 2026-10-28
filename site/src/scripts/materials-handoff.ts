import {assistantReturnPath,assistantConversationId} from './assistant-handoff';
import {track} from './analytics';
import type {CampusSession} from './campus-session';

type HandoffState={owner:string|null;back:string|null;loading:boolean;task:string|null};
const states=new WeakMap<HTMLElement,HandoffState>();
export async function renderMaterialsHandoff(root:HTMLElement|null,returnPath:string|null,session:CampusSession){
 if(!root||session.accessUnavailable)return;
 const request=root.querySelector<HTMLTextAreaElement>('[data-handoff-request]');
 const copy=root.querySelector<HTMLButtonElement>('[data-handoff-copy]');
 const status=root.querySelector<HTMLElement>('[data-handoff-status]');
 const back=assistantReturnPath(returnPath),id=assistantConversationId(back);
 const owner=session.authenticated?(session.analyticsId??session.email?.toLowerCase()??null):'guest';
 const clear=()=>{root.hidden=true;if(request)request.value='';if(copy){copy.onclick=null;copy.disabled=false;}if(status)status.textContent='';};
 let state=states.get(root);
 if(!state||!owner||state.owner!==owner||state.back!==back){
  clear();state={owner,back,loading:false,task:null};states.set(root,state);
 }
 if(!back||!id||!request||!copy||!status||state.loading)return;
 const current=state;const active=()=>states.get(root)===current&&root.isConnected;
 current.loading=true;
 try{
  // Every read checks the conversation owner. The task never enters URLs,
  // analytics, localStorage or a third-party request.
  const response=await fetch(`/api/app/profes/handoff/?conversationId=${encodeURIComponent(id)}`,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!active())return;
  if(response.status===401||response.status===403){clear();current.task=null;return;}
  if(!response.ok)return;
  const data=await response.json();
  if(!active())return;
  if(data?.conversationId!==id||typeof data.request!=='string'||!data.request.trim()||data.request.length>2000){clear();current.task=null;return;}
  // A routine session refresh must not destroy a selection or manual-copy fallback.
  if(current.task===data.request&&!root.hidden)return;
  current.task=data.request;
  request.value=data.request;
  status.textContent='';
  const link=root.querySelector<HTMLAnchorElement>('[data-handoff-return]');if(link)link.href=back;
  root.hidden=false;
  track('campus_materials_handoff_ready',{conversation_id:id,step:'connector'});
  copy.onclick=async()=>{
   if(!active()||current.task!==data.request)return;
   try{
    await navigator.clipboard.writeText(`Usa Campus para continuar este pedido. Verifica mi conexión y consulta los materiales, tareas o datos publicados que necesites para responderlo. Si falta identificar el curso o hay varias coincidencias, pregunta solo ese dato. No inventes archivos ni fechas.\n\nMi pedido: ${data.request}`);
    if(!active()||current.task!==data.request)return;
    status.textContent='Pedido copiado. Pégalo en tu IA con Campus conectado para continuar.';
    track('campus_materials_handoff_copied',{conversation_id:id,step:'connector'});
   }catch{if(active()&&current.task===data.request)status.textContent='No pudimos copiarlo. Selecciona el texto de tu pedido y cópialo manualmente.';}
  };
 }catch{/* Keep the last authorized task during a temporary same-owner read failure. */}
 finally{current.loading=false;}
}
