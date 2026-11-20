import {getCampusSession} from './campus-session';

/**
 * Lo mismo que hace el servidor (normalizePhone en campus-profes): nueve dígitos que empiezan en 9 son de Perú;
 * otro país va con "+". Devuelve el número listo para mostrar, o null si no se reconoce.
 */
export function previewPhone(raw:string){
  const text=raw.trim(),digits=text.replace(/[\s().-]/g,'').replace(/^\+/,'');
  if(!/^\d+$/.test(digits))return null;
  const phone=text.startsWith('+')?digits:/^9\d{8}$/.test(digits)?'51'+digits:/^519\d{8}$/.test(digits)?digits:'';
  if(!/^[1-9]\d{7,14}$/.test(phone)||phone==='51937751448')return null;
  return phone.startsWith('51')&&phone.length===11?`+51 ${phone.slice(2,5)} ${phone.slice(5,8)} ${phone.slice(8)}`:'+'+phone;
}

let cleanup=()=>{};
function mount(){
  cleanup();
  const candidate=document.querySelector<HTMLElement>('[data-whatsapp-reminders]');if(!candidate)return;
  const root:HTMLElement=candidate;
  let disposed=false,busy=false,needsPhone=false,editing=false,numberShown=false;
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
      // Sin número, el campo aparece directo; con número, solo al tocar "Cambiar número".
      needsPhone=s.available&&s.subscribed&&!s.linked;editing=false;
      find('[data-wa-optin]').hidden=!s.available||!s.subscribed||!s.linked;
      // A qué número llega, enmascarado en el servidor. Sin número (o con usuario de WhatsApp) se dice sin cifras.
      const number=find('[data-wa-number]');
      number.hidden=!s.available||!s.subscribed||!s.linked||typeof s.phone!=='string';numberShown=!number.hidden;showPhoneForm();
      if(typeof s.phone==='string')find('[data-wa-phone]').textContent=/\d/.test(s.phone)?s.phone:'tu WhatsApp vinculado';
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
  // Número de WhatsApp: se escribe aquí, se confirma una vez ("¿Es +51 …?") y se guarda. Un error de tipeo
  // mandaría el resumen a un desconocido, por eso el paso de confirmación.
  const phoneForm=find<HTMLFormElement>('[data-wa-phone-form]'),phoneInput=find<HTMLInputElement>('[data-wa-phone-input]'),
    phoneSubmit=find<HTMLButtonElement>('[data-wa-phone-submit]'),phoneHint=find('[data-wa-phone-hint]'),phoneCancel=find<HTMLButtonElement>('[data-wa-phone-cancel]');
  const hintText=phoneHint.textContent??'';
  let confirming:string|null=null;
  const hint=(text:string,error=false)=>{phoneHint.textContent=text;if(error){phoneHint.dataset.error='true';phoneInput.setAttribute('aria-invalid','true');}
    else{delete phoneHint.dataset.error;phoneInput.removeAttribute('aria-invalid');}};
  const resetPhone=()=>{confirming=null;phoneSubmit.textContent='Guardar';hint(hintText);};
  function showPhoneForm(){
    phoneForm.hidden=!(needsPhone||editing);phoneCancel.hidden=!editing;
    find('[data-wa-number]').hidden=editing||!numberShown;
    if(phoneForm.hidden){phoneInput.value='';resetPhone();}
  }
  find('[data-wa-change]').addEventListener('click',()=>{editing=true;showPhoneForm();phoneInput.focus();});
  phoneCancel.addEventListener('click',()=>{editing=false;showPhoneForm();find<HTMLButtonElement>('[data-wa-change]').focus();});
  phoneInput.addEventListener('input',()=>{if(confirming!==null||phoneHint.dataset.error)resetPhone();});
  phoneForm.onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    const shown=previewPhone(phoneInput.value);
    if(!shown){hint('Revisa el número: 9 dígitos si es de Perú, o con + y el código de país si es de otro.',true);phoneInput.focus();return;}
    if(confirming!==shown){confirming=shown;phoneSubmit.textContent='Sí, es mi número';hint(`¿Es ${shown}? Ahí te llegarán tus avisos.`);return;}
    busy=true;phoneSubmit.disabled=true;
    try{await api('/phone',{phone:phoneInput.value});if(disposed)return;editing=false;needsPhone=false;await load();}
    catch(e){if(!disposed){resetPhone();hint(e instanceof Error?e.message:'No pudimos guardar tu número.',true);}}
    finally{busy=false;if(!disposed)phoneSubmit.disabled=false;}
  };
  const changed=()=>{disposed=true;root.hidden=true;void Promise.resolve().then(mount);};
  window.addEventListener('campus:session-updated',changed);
  void load();cleanup=()=>{disposed=true;window.removeEventListener('campus:session-updated',changed);};
}
document.addEventListener('astro:page-load',mount);document.addEventListener('astro:before-swap',()=>cleanup());mount();
