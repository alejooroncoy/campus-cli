import {assistantReturnPath,assistantConversationId} from './assistant-handoff';
import {track} from './analytics';

const generations=new WeakMap<HTMLElement,number>();
export async function renderMaterialsHandoff(root:HTMLElement|null,returnPath:string|null){
 if(!root)return;
 const generation=(generations.get(root)??0)+1;generations.set(root,generation);
 root.hidden=true;
 const request=root.querySelector<HTMLTextAreaElement>('[data-handoff-request]');
 const copy=root.querySelector<HTMLButtonElement>('[data-handoff-copy]');
 const status=root.querySelector<HTMLElement>('[data-handoff-status]');
 const back=assistantReturnPath(returnPath),id=assistantConversationId(back);
 if(request)request.value='';
 if(copy){copy.onclick=null;copy.disabled=false;}
 if(status)status.textContent='';
 if(!back||!id||!request||!copy||!status)return;
 try{
  // Every read checks the conversation owner. The task never enters URLs,
  // analytics, localStorage or a third-party request.
  const response=await fetch(`/api/app/profes/handoff/?conversationId=${encodeURIComponent(id)}`,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)return;
  const data=await response.json();
  if(generations.get(root)!==generation||!root.isConnected)return;
  if(data?.conversationId!==id||typeof data.request!=='string'||!data.request.trim()||data.request.length>2000)return;
  request.value=data.request;
  const link=root.querySelector<HTMLAnchorElement>('[data-handoff-return]');if(link)link.href=back;
  root.hidden=false;
  track('campus_materials_handoff_ready',{conversation_id:id,step:'connector'});
  copy.onclick=async()=>{
   if(generations.get(root)!==generation)return;
   try{
    await navigator.clipboard.writeText(`Usa Campus para continuar este pedido. Verifica mi conexión y consulta los materiales, tareas o datos publicados que necesites para responderlo. Si falta identificar el curso o hay varias coincidencias, pregunta solo ese dato. No inventes archivos ni fechas.\n\nMi pedido: ${data.request}`);
    if(generations.get(root)!==generation)return;
    status.textContent='Pedido copiado. Pégalo en tu IA con Campus conectado para continuar.';
    track('campus_materials_handoff_copied',{conversation_id:id,step:'connector'});
   }catch{if(generations.get(root)===generation)status.textContent='No pudimos copiarlo. Selecciona el texto de tu pedido y cópialo manualmente.';}
  };
 }catch{/* Connection instructions remain usable if this private read fails. */}
}
