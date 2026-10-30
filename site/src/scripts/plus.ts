import { getCampusSession } from './campus-session';
import { analyticsHeaders, track } from './analytics';
import { uploadError } from './turnitin-upload';
import type { CampusSession } from './campus-session';
import { mountPlusSurvey } from './plus-survey.ts';

type Order = {id:string;accountId:number;kind:string;cohort:string;status:string;amountCents:number;renewalCents:number;expiresAt:string;activeUntil:string|null;note:string;isTest?:boolean};
type State = {orders:Order[];currentPlan:string;subscription:{activeUntil:string;renewalCents:number;isTest?:boolean}|null;admin:boolean;enabled:boolean;eligible:boolean;blocked:boolean;unavailable:boolean};
const money=(cents:number)=>`S/${cents/100}`;
const date=(value:string)=>new Date(value).toLocaleDateString('es-PE',{day:'numeric',month:'long',year:'numeric'});
let cleanup=()=>{};
function mount(){
  cleanup();
  const candidate=document.querySelector<HTMLElement>('[data-plus-root]');if(!candidate)return;
  const root=candidate;
  const survey=mountPlusSurvey(root);
  let surveySession:CampusSession|undefined;
  const find=<T extends HTMLElement>(key:string)=>root.querySelector<T>(`[data-plus-${key}]`)!;
  const text=(key:string,value:string)=>{find(key).textContent=value;};
  const status=find('message'),form=find<HTMLFormElement>('form'),input=form.elements.namedItem('receipt') as HTMLInputElement;
  let disposed=false,quote:Order|null=null,timer:ReturnType<typeof setInterval>|undefined,busy=false,pendingPayment=false,poll=0,currentOwner:string|undefined;
  const message=(value='',error=false,loading=false)=>{
    status.dataset.error=String(error);status.dataset.loading=String(loading);status.setAttribute('aria-busy',String(loading));
    if(loading){const accessible=document.createElement('span');accessible.className='app-sr-only';accessible.textContent=value;const skeleton=document.createElement('span');skeleton.className='app-skeleton plus-message__skeleton';skeleton.setAttribute('aria-hidden','true');status.replaceChildren(accessible,skeleton);}
    else status.textContent=value;
  };
  let lastView='';let expiryTracked=false;
  const show=(view:string)=>{root.querySelectorAll<HTMLElement>('[data-plus-view]').forEach(node=>node.hidden=node.dataset.plusView!==view);if(view!==lastView){lastView=view;track('campus_plus_step_viewed',{plus_step:view});if(view==='ready')track('campus_plus_offer_viewed',{location:'app'});}void survey.update(view,surveySession);};
  async function api(path:string,data?:unknown){
    const response=await fetch(`/api/app/plus/${path}`,{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000),
      headers:{...analyticsHeaders(),...(data===undefined?{}:{'content-type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});
    const body=await response.json();if(!response.ok)throw new Error(body.error??'No pudimos comprobar el pago.');return body;
  }
  function failure(error:unknown){if(disposed)return;message(error instanceof Error?error.message:'No pudimos conectar con Campus. Vuelve a intentarlo sin volver a pagar.',true);track('campus_flow_failed',{step:'plus',plus_step:lastView,error_kind:error instanceof TypeError?'network':'rejected'});}
  function expired(){const ended=quote!==null&&Date.now()>=new Date(quote.expiresAt).getTime();find<HTMLButtonElement>('submit').disabled=busy||ended;find('requote').hidden=!ended;if(ended&&!expiryTracked){expiryTracked=true;track('campus_plus_quote_expired',{plus_step:'payment'});}if(ended)message('Tu reserva de precio venció. Vuelve a comprobarlo antes de pagar. Si ya pagaste, contacta a soporte.',true);return ended;}
  async function checkout(){
    if(busy)return;busy=true;root.querySelectorAll<HTMLButtonElement>('[data-plus-checkout],[data-plus-renew],[data-plus-retry]').forEach(b=>b.disabled=true);message('Comprobando tu precio…',false,true);
    void survey.update('payment');
    track('campus_plus_checkout_started',{plus_step:lastView});
    try{
      const value=await api('checkout',{});expiryTracked=false;if(disposed)return;
      quote=value.order;
      find('qa').hidden=!quote!.isTest;
      if(quote!.status==='payment_review'){await load();return;}
      form.reset();
      text('filename','Seleccionar comprobante');
      text('offer',quote!.cohort==='founder'?'PROMOCIÓN · PRIMEROS 25 DE PAGO':'CAMPUS PLUS');
      text('amount',money(quote!.amountCents));text('renewal',`Después, ${money(quote!.renewalCents)} al mes. Sin cobros automáticos.`);
      text('expiry',`Precio reservado hasta las ${new Date(quote!.expiresAt).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}. Si vence antes de pagar, vuelve a comprobar tu precio.`);
      text('phone',value.phone);text('holder',value.holder);show('payment');message();
      track('campus_plus_checkout_viewed',{offer:quote!.cohort,amount_cents:quote!.amountCents});
      find('view="payment"')?.scrollIntoView?.({block:'start',behavior:'smooth'});
    }catch(error){failure(error);}finally{busy=false;root.querySelectorAll<HTMLButtonElement>('[data-plus-checkout],[data-plus-renew],[data-plus-retry]').forEach(b=>b.disabled=false);expired();}
  }
  async function load(){
    message('Comprobando tu cuenta…',false,true);
    try{
      const [session,config]=await Promise.all([getCampusSession(true),api('config')]);if(disposed)return;
      surveySession=session;
      find('qa').hidden=true;
      currentOwner=session.authenticated?session.analyticsId??session.email??'account':'guest';
      if(!session.authenticated){pendingPayment=false;show('guest');message();return;}
      if(!config.ordersAvailable){show('unavailable');message('No pudimos comprobar los pagos de Plus. No realices un pago nuevo.',true);return;}
      const state:State=await api('state');if(disposed)return;
      if(state.blocked||state.unavailable){show('unavailable');message(state.blocked?'Tu cuenta requiere revisión. Contacta a soporte.':'No pudimos verificar tu plan. Vuelve a comprobarlo.',true);return;}
      text('account',`Cuenta: ${session.email??'tu cuenta Campus'}`);
      const pending=state.orders.find(order=>order.status==='payment_review');
      find('qa').hidden=!(pending?.isTest||state.subscription?.isTest);
      pendingPayment=Boolean(pending);
      if(pending){show('pending');message();track('campus_plus_status_viewed',{plus_status:'payment_review',is_test:pending.isTest===true});}
      else if(state.currentPlan==='plus'){
        show('active');message();text('active-until',state.subscription?`Tu mes está activo hasta el ${date(state.subscription.activeUntil)}.`:'Tu cuenta ya tiene acceso a Campus Plus.');
        text('active-renewal',state.subscription?.isTest?'Acceso de prueba por 24 horas. No se registró ningún pago ni renovación.':state.subscription?`Tu próxima renovación: ${money(state.subscription.renewalCents)} por mes. Sin cobros automáticos.`:'Consulta el estado de tu cuenta en Mi perfil.');
        find('renew').hidden=!state.enabled||!state.eligible||!state.subscription||new Date(state.subscription.activeUntil).getTime()>Date.now()+7*86400000;
        track('campus_plus_status_viewed',{plus_status:'active'});
      }else if(!state.enabled){show('unavailable');message('La activación de Plus está pausada. No realices un pago nuevo.',true);}
      else if(!state.eligible){show('university');message();}
      else if(state.orders[0]?.status==='rejected'){
        show('rejected');text('rejection',state.orders[0].note);message();track('campus_plus_status_viewed',{plus_status:'rejected'});
      }else{show('ready');message();find('checkout').textContent=state.orders.some(o=>o.status==='quoted')?'Retomar mi pago':state.subscription?'Renovar mi mes':'Ver mi precio';}
    }catch(error){if(!disposed){show('unavailable');failure(error);}}
  }
  find<HTMLButtonElement>('checkout').onclick=()=>void checkout();find<HTMLButtonElement>('renew').onclick=()=>void checkout();find<HTMLButtonElement>('retry').onclick=()=>void checkout();
  find<HTMLButtonElement>('requote').onclick=()=>void checkout();
  root.querySelectorAll<HTMLButtonElement>('[data-plus-refresh]').forEach(button=>button.onclick=()=>void load());
  find<HTMLButtonElement>('copy').onclick=async()=>{try{await navigator.clipboard.writeText(find('phone').textContent??'');message('Número copiado.');track('campus_plus_payment_copied');}catch{message('Selecciona el número y cópialo desde tu dispositivo.',true);}};
  input.onchange=()=>{const error=uploadError(Array.from(input.files??[]),'receipt',5*1024*1024);message(error??'',Boolean(error));text('filename',error?'Selecciona otro comprobante':input.files?.[0]?.name??'Seleccionar comprobante');track('campus_plus_receipt_selected',{valid:!error});};
  form.onsubmit=async(event)=>{
    event.preventDefault();if(!quote||busy||expired())return;
    const error=uploadError(Array.from(input.files??[]),'receipt',5*1024*1024);if(error){message(error,true);return;}
    if(!(form.elements.namedItem('consent') as HTMLInputElement).checked){message('Confirma la revisión de tu comprobante.',true);return;}
    busy=true;expired();find<HTMLButtonElement>('submit').setAttribute('aria-busy','true');find<HTMLButtonElement>('submit').setAttribute('aria-label','Enviando comprobante…');find<HTMLElement>('submit-label').hidden=true;find<HTMLElement>('submit-skeleton').hidden=false;message('Enviando comprobante…',false,true);track('campus_plus_submit_started',{offer:quote.cohort,amount_cents:quote.amountCents});
    try{
      const file=input.files![0];const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
      await api('orders',{quoteId:quote.id,consent:true,receipt:{name:file.name,base64}});if(disposed)return;form.reset();quote=null;await load();
    }catch(error){failure(error);}finally{busy=false;find<HTMLButtonElement>('submit').removeAttribute('aria-busy');find<HTMLButtonElement>('submit').removeAttribute('aria-label');find<HTMLElement>('submit-label').hidden=false;find<HTMLElement>('submit-skeleton').hidden=true;expired();}
  };
  timer=setInterval(()=>{if(quote)expired();if(pendingPayment&&!busy&&document.visibilityState==='visible'&&++poll%20===0)void load();},1000);
  const changed=(event:Event)=>{
    const session=(event as CustomEvent<CampusSession>).detail;
    const owner=session.authenticated?session.analyticsId??session.email??'account':'guest';
    if(currentOwner!==undefined&&owner!==currentOwner){
      survey.dispose();disposed=true;quote=null;form.reset();show('loading');message('Actualizando la cuenta…',false,true);location.reload();
    }
  };
  window.addEventListener('campus:session-updated',changed);
  void load();
  cleanup=()=>{survey.dispose();disposed=true;if(timer)clearInterval(timer);window.removeEventListener('campus:session-updated',changed);};
}
document.addEventListener('astro:page-load',mount);document.addEventListener('astro:before-swap',()=>cleanup());mount();
