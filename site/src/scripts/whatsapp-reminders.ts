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
    // Con barra final: el sitio usa trailingSlash y sin ella cada consulta pasa por un 308.
    const r=await fetch('/api/app/whatsapp'+path+'/',{method:value===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
      headers:value===undefined?{}:{'content-type':'application/json'},body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(25000)});
    const result=await r.json();if(!r.ok)throw Error(result.error??'No pudimos comprobar tus avisos.');return result;
  }
  // El estado va en verde; un error, en rojo.
  const say=(text:string,error=false)=>{summary.textContent=text;if(error)summary.dataset.error='true';else delete summary.dataset.error;};
  async function load(){
    try{
      const session=await getCampusSession();if(disposed)return;
      if(!session.authenticated){root.hidden=true;return;}
      root.hidden=false;
      const s=await api();if(disposed)return;
      root.dataset.state=!s.subscribed?'free':!s.available?'unavailable':!s.linked?'link':s.enabled?'on':'off';
      // Una sola acción por estado: Plus, correo mientras WhatsApp no está, vincular el número o encenderlo.
      // En /app/plus/ el pago ya está arriba: no se repite el botón.
      find('[data-wa-upsell]').hidden=s.subscribed||location.pathname.startsWith('/app/plus');
      find('[data-wa-unavailable]').hidden=!s.subscribed||s.available;
      find('[data-wa-link-needed]').hidden=!s.available||!s.subscribed||s.linked;
      find('[data-wa-optin]').hidden=!s.available||!s.subscribed||!s.linked;
      toggle.checked=s.enabled;toggle.disabled=false;
      find('[data-wa-pack-wrap]').hidden=!s.available||!s.paymentsAvailable||!s.subscribed||!s.linked||!s.enabled||s.pack;
      const sent=s.weeklySent?` · ${s.weeklySent} resumen${s.weeklySent===1?'':'es'} este mes`:'';
      const until=new Date(s.resetsAt).toLocaleDateString('es-PE',{timeZone:'America/Lima',day:'numeric',month:'long'});
      say(!s.subscribed||!s.available||!s.linked||!s.enabled?'':
        s.pack?`Activo${sent} · Avisos al momento: te quedan ${s.remaining} de ${s.quota} hasta el ${until}`:`Activo${sent}`);
      find('[data-wa-reset]').textContent=`Valen hasta el ${until}; los que no uses no se acumulan. Si se acaban, el resumen semanal sigue llegando.`;
    }catch(e){if(!disposed){say(e instanceof Error?e.message:'No pudimos comprobar tus avisos.',true);toggle.disabled=true;find('[data-wa-pack-wrap]').hidden=true;}}
  }
  toggle.onchange=async()=>{
    if(busy)return;busy=true;toggle.disabled=true;const enabled=toggle.checked;
    try{await api('/preferences',{enabled,...(enabled?{consent:true}:{})});if(!disposed)await load();}
    catch(e){if(!disposed){toggle.checked=!enabled;say(e instanceof Error?e.message:'No pudimos guardar tus preferencias.',true);}}
    finally{busy=false;if(!disposed)toggle.disabled=false;}
  };
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!form.reportValidity())return;busy=true;
    const button=form.querySelector<HTMLButtonElement>('button')!;button.disabled=true;say('Preparando tu pago de S/5…');
    try{
      const result=await api('/checkout',{consent:true});if(disposed)return;
      const url=new URL(result.checkoutUrl);
      if(url.protocol!=='https:'||url.username||url.password||!(url.hostname==='flow.cl'||url.hostname.endsWith('.flow.cl')))throw Error('No pudimos abrir el pago.');
      location.assign(url.href);
    }catch(e){if(!disposed)say(e instanceof Error?e.message:'No pudimos abrir el pago.',true);}
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
