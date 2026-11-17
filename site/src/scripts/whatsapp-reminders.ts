import {getCampusSession} from './campus-session';

let cleanup=()=>{};
function mount(){
  cleanup();
  const candidate=document.querySelector<HTMLElement>('[data-whatsapp-reminders]');if(!candidate)return;
  const root:HTMLElement=candidate;
  let disposed=false,busy=false;
  const find=<T extends HTMLElement=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
  const summary=find('[data-wa-summary]'),toggle=find<HTMLInputElement>('[data-wa-enabled]'),form=find<HTMLFormElement>('[data-wa-pack]');
  async function api(path='',value?:unknown){
    const r=await fetch('/api/app/whatsapp'+path,{method:value===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
      headers:value===undefined?{}:{'content-type':'application/json'},body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(25000)});
    const result=await r.json();if(!r.ok)throw Error(result.error??'No pudimos comprobar tus avisos.');return result;
  }
  async function load(){
    try{
      const session=await getCampusSession();if(disposed)return;
      if(!session.authenticated){root.hidden=true;return;}
      root.hidden=false;
      const s=await api();if(disposed)return;
      find('[data-wa-unavailable]').hidden=s.available;
      find('[data-wa-link-needed]').hidden=!s.available||!s.subscribed||s.linked;
      find('[data-wa-optin]').hidden=!s.available||!s.subscribed||!s.linked;
      toggle.checked=s.enabled;toggle.disabled=false;
      form.hidden=!s.available||!s.paymentsAvailable||!s.subscribed||!s.linked||s.pack;
      summary.textContent=!s.subscribed?'Los recordatorios están incluidos con Plus vigente.':
        `Resumen semanal incluido${s.weeklySent?` (${s.weeklySent} enviado${s.weeklySent===1?'':'s'} este mes)`:''}. `+
        (s.pack?`Avisos extra: ${s.used} de ${s.quota} usados este mes. Te quedan ${s.remaining}.`:'Sin avisos extra este mes.');
      find('[data-wa-reset]').textContent='Los avisos extra se renuevan el '+new Date(s.resetsAt).toLocaleDateString('es-PE',{timeZone:'America/Lima',day:'numeric',month:'long'})+'. Los avisos no usados no se acumulan.';
    }catch(e){if(!disposed){summary.textContent=e instanceof Error?e.message:'No pudimos comprobar tus avisos.';toggle.disabled=true;form.hidden=true;}}
  }
  toggle.onchange=async()=>{
    if(busy)return;busy=true;toggle.disabled=true;const enabled=toggle.checked;
    try{await api('/preferences',{enabled,...(enabled?{consent:true}:{})});if(!disposed)await load();}
    catch(e){if(!disposed){toggle.checked=!enabled;summary.textContent=e instanceof Error?e.message:'No pudimos guardar tus preferencias.';}}
    finally{busy=false;if(!disposed)toggle.disabled=false;}
  };
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!form.reportValidity())return;busy=true;
    const button=form.querySelector<HTMLButtonElement>('button')!;button.disabled=true;summary.textContent='Preparando tu pago de S/5…';
    try{
      const result=await api('/checkout',{consent:true});if(disposed)return;
      const url=new URL(result.checkoutUrl);
      if(url.protocol!=='https:'||url.username||url.password||!(url.hostname==='flow.cl'||url.hostname.endsWith('.flow.cl')))throw Error('No pudimos abrir el pago.');
      location.assign(url.href);
    }catch(e){if(!disposed)summary.textContent=e instanceof Error?e.message:'No pudimos abrir el pago.';}
    finally{busy=false;if(!disposed)button.disabled=false;}
  };
  const changed=()=>{disposed=true;root.hidden=true;void Promise.resolve().then(mount);};
  window.addEventListener('campus:session-updated',changed);
  // Al volver de WhatsApp tras vincular el número, se vuelve a comprobar.
  const back=()=>{if(document.visibilityState==='visible'&&!busy&&!find('[data-wa-link-needed]').hidden)void load();};
  document.addEventListener('visibilitychange',back);
  void load();cleanup=()=>{disposed=true;window.removeEventListener('campus:session-updated',changed);document.removeEventListener('visibilitychange',back);};
}
document.addEventListener('astro:page-load',mount);document.addEventListener('astro:before-swap',()=>cleanup());mount();
