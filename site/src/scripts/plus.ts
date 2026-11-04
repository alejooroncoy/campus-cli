import { getCampusSession } from './campus-session';
import { analyticsHeaders, track } from './analytics';
import { uploadError } from './turnitin-upload';
import type { CampusSession } from './campus-session';
import { mountPlusSurvey } from './plus-survey.ts';

type Order = {id:string;accountId:number;kind:string;cohort:string;status:string;amountCents:number;renewalCents:number;expiresAt:string;createdAt:string;activeUntil:string|null;note:string;isTest?:boolean;paymentMethod?:'flow'};
type SubscriptionState='none'|'active'|'expiring'|'expired';
type State = {orders:Order[];currentPlan:string;subscription:{activeUntil:string;renewalCents:number;isTest?:boolean}|null;subscriptionState?:SubscriptionState;renewableFrom?:string|null;admin:boolean;enabled:boolean;eligible:boolean;blocked:boolean;unavailable:boolean;flowAvailable?:boolean};
const money=(cents:number)=>`S/${cents/100}`;
const date=(value:string)=>new Date(value).toLocaleDateString('es-PE',{day:'numeric',month:'long',year:'numeric'});
const orderStatus:Record<string,string>={active:'Pagado',payment_review:'En revisión',rejected:'Observado'};
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
  const flowLink=find<HTMLAnchorElement>('flow-link'),flowResume=find<HTMLButtonElement>('flow-resume');
  const flowPrice=(order:Order)=>{
    text('flow-amount',money(order.amountCents));
    text('flow-renewal',`Después, ${money(order.renewalCents)} al mes. Sin cobros automáticos.`);
  };
  let lastView='';let expiryTracked=false;
  const show=(view:string)=>{root.querySelectorAll<HTMLElement>('[data-plus-view]').forEach(node=>node.hidden=node.dataset.plusView!==view);if(['guest','unavailable','university','loading'].includes(view))find('subscription').hidden=true;if(view!==lastView){lastView=view;track('campus_plus_step_viewed',{plus_step:view});if(view==='ready')track('campus_plus_offer_viewed',{location:'app'});}void survey.update(view,surveySession);};
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
      if(quote!.status==='payment_review'||quote!.status==='active'){quote=null;await load();return;}
      if(quote!.paymentMethod==='flow'){
        const url=new URL(value.checkoutUrl);
        if(url.protocol!=='https:'||!(url.hostname==='flow.cl'||url.hostname.endsWith('.flow.cl')))throw Error('No pudimos abrir el pago de Flow.');
        find('qa').hidden=true;flowPrice(quote!);flowLink.href=url.href;flowLink.hidden=false;flowResume.hidden=true;
        quote=null;pendingPayment=true;show('flow');message();
        track('campus_plus_checkout_viewed',{offer:value.order.cohort,amount_cents:value.order.amountCents});
        return;
      }
      form.reset();
      text('filename','Seleccionar comprobante');
      find('file-feedback').hidden=true;input.removeAttribute('aria-invalid');
      text('copy','Copiar número');
      text('offer',quote!.cohort==='founder'?'PROMOCIÓN · PRIMEROS 25 DE PAGO':'CAMPUS PLUS');
      text('amount',money(quote!.amountCents));text('pay-amount',money(quote!.amountCents));text('renewal',`Después, ${money(quote!.renewalCents)} al mes. Solo si decides renovar; sin cobros automáticos.`);
      text('expiry',`Precio reservado hasta las ${new Date(quote!.expiresAt).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}. Si vence antes de pagar, vuelve a comprobar tu precio.`);
      text('phone',value.phone);text('holder',value.holder);show('payment');message();
      track('campus_plus_checkout_viewed',{offer:quote!.cohort,amount_cents:quote!.amountCents});
      find('view="payment"')?.scrollIntoView?.({block:'start',behavior:'smooth'});
      root.querySelector<HTMLElement>('#plus-pay-title')?.focus({preventScroll:true});
    }catch(error){failure(error);}finally{busy=false;root.querySelectorAll<HTMLButtonElement>('[data-plus-checkout],[data-plus-renew],[data-plus-retry]').forEach(b=>b.disabled=false);expired();}
  }
  /** One panel for the paid month: where it stands, when renewal opens and what was paid. */
  function renderSubscription(state:State,email:string|undefined){
    const panel=find('subscription');
    const history=state.orders.filter(order=>orderStatus[order.status]&&!order.isTest);
    const subscription=state.subscription&&!state.subscription.isTest?state.subscription:null;
    if(!subscription&&!history.length||['guest','unavailable','university'].includes(lastView)){panel.hidden=true;return;}
    const phase=subscription?(state.subscriptionState??'active'):'none';
    const badge=find('sub-badge');
    badge.textContent=phase==='expired'?'Vencido':phase==='expiring'?'Vence pronto':phase==='active'?'Activo':'Sin plan';
    badge.dataset.tone=phase==='expiring'?'soon':phase==='expired'||phase==='none'?'ended':'ok';
    text('sub-until-label',phase==='expired'?'Venció el':'Vigente hasta');
    text('sub-until',subscription?date(subscription.activeUntil):'Sin mes activo');
    text('sub-renewal',subscription?`${money(subscription.renewalCents)} al mes, solo si tú pagas`:'Aún no tienes un mes pagado');
    text('sub-notice',phase==='expired'?'Te avisamos el día que venció. No enviaremos más correos.':subscription?`Te escribiremos${email?` a ${email}`:''} 7, 3 y 1 día antes de que venza.`:'Sin avisos hasta que actives Plus');
    text('sub-rule',phase==='active'&&state.renewableFrom?`Plus no se renueva solo: si no pagas otro mes, tu cuenta vuelve a Campus Free al terminar este. Podrás renovar desde el ${date(state.renewableFrom)} y el mes nuevo se suma a los días que te queden.`
      :phase==='expiring'?'Ya puedes renovar. El mes nuevo se suma a los días que te quedan. Si no pagas, tu cuenta vuelve a Campus Free al terminar este mes.'
      :phase==='expired'?'Tu cuenta volvió a Campus Free. Reactiva Plus cuando quieras. No hay cobros automáticos.':'Plus es un pago mensual sin cobros automáticos.');
    const list=find('sub-history');list.replaceChildren();
    for(const order of history){
      const item=document.createElement('li'),what=document.createElement('div'),amount=document.createElement('strong'),detail=document.createElement('span'),result=document.createElement('span');
      what.className='plus-history__what';
      amount.textContent=money(order.amountCents);
      detail.textContent=[date(order.createdAt),order.paymentMethod==='flow'?'QR de Flow':'Yape o Plin',order.status==='active'&&order.activeUntil?`cubre hasta el ${date(order.activeUntil)}`:''].filter(Boolean).join(' · ');
      result.className='plus-history__status';result.dataset.status=order.status;result.textContent=orderStatus[order.status];
      what.append(amount,detail);item.append(what,result);list.append(item);
    }
    find('sub-empty').hidden=history.length>0;
    panel.hidden=false;
  }
  async function load(quiet=false){
    if(!quiet)message('Comprobando tu cuenta…',false,true);
    try{
      const [session,config]=await Promise.all([getCampusSession(true),api('config')]);if(disposed)return;
      surveySession=session;
      find('qa').hidden=true;
      currentOwner=session.authenticated?session.analyticsId??session.email??'account':'guest';
      if(!session.authenticated){pendingPayment=false;show('guest');find('subscription').hidden=true;message();return;}
      if(!config.ordersAvailable){show('unavailable');message('No pudimos comprobar los pagos de Plus. No realices un pago nuevo.',true);return;}
      const state:State=await api('state');if(disposed)return;
      if(state.blocked||state.unavailable){show('unavailable');message(state.blocked?'Tu cuenta requiere revisión. Contacta a soporte.':'No pudimos verificar tu plan. Vuelve a comprobarlo.',true);return;}
      text('account',`Cuenta: ${session.email??'tu cuenta Campus'}`);
      const pending=state.orders.find(order=>order.status==='payment_review');
      const pendingFlow=state.orders.find(order=>order.status==='quoted'&&order.paymentMethod==='flow');
      find('qa').hidden=!(pending?.isTest||state.subscription?.isTest&&!state.orders.some(order=>order.status==='active'&&order.paymentMethod==='flow'));
      pendingPayment=Boolean(pending||pendingFlow);
      if(!pendingFlow){flowLink.removeAttribute('href');flowLink.hidden=true;}
      if(pending){show('pending');message();track('campus_plus_status_viewed',{plus_status:'payment_review',is_test:pending.isTest===true});}
      else if(pendingFlow){
        flowPrice(pendingFlow);flowResume.hidden=!flowLink.hidden;show('flow');message();
      }
      else if(state.currentPlan==='plus'){
        show('active');message();text('active-until',state.subscription?`Tu mes está activo hasta el ${date(state.subscription.activeUntil)}.`:'Tu cuenta ya tiene acceso a Campus Plus.');
        text('active-renewal',state.subscription?.isTest?'Acceso de prueba por 24 horas. No se registró ningún pago ni renovación.':state.subscription?`Tu próxima renovación: ${money(state.subscription.renewalCents)} por mes. Sin cobros automáticos.`:'Consulta el estado de tu cuenta en Mi perfil.');
        find('renew').hidden=!state.enabled||!state.eligible||!state.subscription||(state.subscriptionState??(new Date(state.subscription.activeUntil).getTime()>Date.now()+7*86400000?'active':'expiring'))==='active';
        track('campus_plus_status_viewed',{plus_status:'active'});
      }else if(!state.enabled){show('unavailable');message('La activación de Plus está pausada. No realices un pago nuevo.',true);}
      else if(!state.eligible){show('university');message();}
      else if(state.orders[0]?.status==='rejected'){
        show('rejected');text('rejection',state.orders[0].note);message();track('campus_plus_status_viewed',{plus_status:'rejected'});
      }else{
        const manualQuote=state.orders.some(order=>order.status==='quoted'&&!order.paymentMethod);
        const qr = Boolean(state.flowAvailable && !manualQuote);
        find('ready-copy').hidden = !qr;
        find('manual-overview').hidden = qr;
        show('ready');message();find('checkout').textContent=state.orders.some(o=>o.status==='quoted')?'Retomar instrucciones de pago':state.subscription?'Renovar mi mes':'Ver precio y cómo pagar';}
      renderSubscription(state,session.email);
    }catch(error){if(!disposed){show('unavailable');failure(error);}}
  }
  find<HTMLButtonElement>('checkout').onclick=()=>void checkout();find<HTMLButtonElement>('renew').onclick=()=>void checkout();find<HTMLButtonElement>('retry').onclick=()=>void checkout();
  flowResume.onclick=()=>void checkout();
  find<HTMLButtonElement>('requote').onclick=()=>void checkout();
  root.querySelectorAll<HTMLButtonElement>('[data-plus-refresh]').forEach(button=>button.onclick=()=>void load());
  find<HTMLButtonElement>('copy').onclick=async()=>{try{await navigator.clipboard.writeText(find('phone').textContent??'');text('copy','Copiado');message('Número copiado. Abre Yape o Plin para realizar el pago.');track('campus_plus_payment_copied');}catch{message('Selecciona el número y cópialo desde tu dispositivo.',true);}};
  input.onchange=()=>{const error=uploadError(Array.from(input.files??[]),'receipt',5*1024*1024);message(error??'',Boolean(error));text('filename',error?'Selecciona otro comprobante':input.files?.[0]?.name??'Seleccionar comprobante');input.setAttribute('aria-invalid',String(Boolean(error)));text('file-feedback',error??'Comprobante listo. Confirma la revisión y envíalo.');find('file-feedback').dataset.error=String(Boolean(error));find('file-feedback').hidden=false;track('campus_plus_receipt_selected',{valid:!error});};
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
  timer=setInterval(()=>{if(quote)expired();if(pendingPayment&&!busy&&document.visibilityState==='visible'&&++poll%10===0)void load(true);},1000);
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
