import {analyticsHeaders,track} from './analytics';
type Key='response_style'|'learning_preferences'|'study_goal'|'thesis_topic'|'schedule_constraints'|'academic_interests'|'career'|'entry_year';
type Memory={key:Key;content:string;updatedAt:string;expiresAt:string};
type Snapshot={enabled:boolean;revision:number;records:Memory[]};
const labels:Record<Key,string>={response_style:'Cómo prefieres las respuestas',learning_preferences:'Cómo aprendes',study_goal:'Tu meta de estudio',thesis_topic:'Tu tesis',schedule_constraints:'Tus horarios',academic_interests:'Tus intereses académicos',career:'Tu carrera declarada',entry_year:'Tu año de ingreso declarado'};
function init(){
 const root=document.querySelector<HTMLDetailsElement>('[data-memory-root]');if(!root||root.dataset.ready)return;root.dataset.ready='true';
 const list=root.querySelector<HTMLElement>('[data-memory-list]')!,status=root.querySelector<HTMLElement>('[data-memory-status]')!;
 const toggle=root.querySelector<HTMLButtonElement>('[data-memory-toggle]')!,clear=root.querySelector<HTMLButtonElement>('[data-memory-clear]')!;
 let snapshot:Snapshot|undefined,busy=false,loaded=false;
 function setBusy(value:boolean){busy=value;root!.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=value);}
 async function load(){
  if(busy)return;setBusy(true);status.textContent='Comprobando tu memoria…';
  try{const r=await fetch('/api/app/memory',{credentials:'same-origin',cache:'no-store',headers:analyticsHeaders()});if(!r.ok)throw Error();snapshot=await r.json();render();loaded=true;}
  catch{snapshot=undefined;list.replaceChildren();toggle.hidden=true;clear.hidden=true;status.textContent='No pudimos comprobar tu memoria. Vuelve a intentarlo.';}
  finally{setBusy(false);}
 }
 async function change(value:Record<string,unknown>){
  if(busy||!snapshot)return;setBusy(true);
  try{
   const r=await fetch('/api/app/memory',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',...analyticsHeaders()},body:JSON.stringify({revision:snapshot.revision,change:value})});
   if(r.status===409){setBusy(false);await load();status.textContent='Tu memoria cambió en otra consulta. Revisa la versión actual antes de editar.';return;}
   if(!r.ok){status.textContent=r.status===400?'Usa una declaración breve como “Prefiero respuestas breves”, sin datos sensibles.':'No se guardó el cambio. Vuelve a intentarlo.';return;}
   snapshot=await r.json();render();status.textContent=value.action==='disable'?'Memoria desactivada. No guardaremos ni usaremos recuerdos.':value.action==='enable'?'Memoria activada. Puedes contarle tus preferencias al asistente.':value.action==='clear'?'Olvidamos todos los recuerdos.':value.action==='forget'?'Recuerdo olvidado.':'Recuerdo actualizado.';
  }catch{status.textContent='No se pudo confirmar el cambio. Actualiza para comprobarlo antes de volver a editar.';}
  finally{setBusy(false);}
 }
 function button(text:string,action:()=>void){const b=document.createElement('button');b.type='button';b.className='app-text-link';b.textContent=text;b.addEventListener('click',action);return b;}
 function render(){
  if(!snapshot)return;list.replaceChildren();toggle.hidden=false;toggle.textContent=snapshot.enabled?'Desactivar memoria':'Activar memoria';clear.hidden=!snapshot.records.length;
  status.textContent=!snapshot.enabled?'Memoria desactivada. No guardaremos ni usaremos recuerdos.':snapshot.records.length?`${snapshot.records.length} ${snapshot.records.length===1?'recuerdo guardado':'recuerdos guardados'}.`:'Aún no hay recuerdos. Puedes decirle al asistente cómo prefieres aprender o cuál es tu meta.';
  for(const record of snapshot.records){
   if(!Object.hasOwn(labels,record.key))continue;
   const row=document.createElement('section');row.className='memory-record';
   const title=document.createElement('h3');title.textContent=labels[record.key];
   const text=document.createElement('p');text.textContent=record.content;
   const actions=document.createElement('div');actions.className='app-actions';
   const edit=button('Corregir',()=>{
    const form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('textarea');
    input.maxLength=240;input.required=true;input.value=record.content;input.id='memory-edit-'+record.key;label.htmlFor=input.id;label.textContent='Editar '+labels[record.key].toLowerCase();
    const save=document.createElement('button');save.type='submit';save.className='app-button app-button--secondary';save.textContent='Guardar';
    form.append(label,input,save,button('Cancelar',render));form.addEventListener('submit',e=>{e.preventDefault();void change({action:'remember',key:record.key,content:input.value});});
    text.hidden=true;actions.replaceWith(form);input.focus();
   });
   const forget=button('Olvidar',()=>{void change({action:'forget',key:record.key});});
   actions.append(edit,forget);row.append(title,text,actions);list.append(row);
  }
 }
 toggle.addEventListener('click',()=>{if(snapshot)void change({action:snapshot.enabled?'disable':'enable'});});
 clear.addEventListener('click',()=>{if(confirm('¿Olvidar todos los recuerdos? Tus conversaciones seguirán en el historial.'))void change({action:'clear'});});
 root.querySelector('[data-memory-refresh]')?.addEventListener('click',()=>{void load();});
 root.addEventListener('toggle',()=>{if(root.open&&!loaded){track('campus_memory_viewed');void load();}});
}
document.addEventListener('astro:page-load',init);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
