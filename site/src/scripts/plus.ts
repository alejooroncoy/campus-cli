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
/** Same rule as the server, used only while an older server does not send subscriptionState. */
const phaseFromDate=(until:string):SubscriptionState=>{const left=new Date(until).getTime()-Date.now();return left<=0?'expired':left<=7*86400000?'expiring':'active';};
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
    text('flow-renewal',`Luego ${money(order.renewalCents)} por mes, solo si renuevas.`);
  };
  /** A started QR payment reads as unfinished; a new one reads as the next step. */
  const flowCopy=(resuming:boolean)=>{
    text('flow-kicker',resuming?'PAGO SIN TERMINAR':'PAGO CON QR');
    text('flow-title',resuming?'Termina tu pago.':'Paga con Yape o Plin.');
    text('flow-copy',resuming?'Flow todavía no confirma este pago. Si ya pagaste, actualiza el estado; si no, termínalo aquí. No se cobra dos veces.':'Escanea el QR con Yape o Plin. Plus se activa cuando Flow confirma el pago.');
  };
  let lastView='';let expiryTracked=false;
  const show=(view:string)=>{root.querySelectorAll<HTMLElement>('[data-plus-view]').forEach(node=>node.hidden=node.dataset.plusView!==view);if(['guest','unavailable','university','loading'].includes(view)){find('subscription').hidden=true;find('history-panel').hidden=true;}if(view!==lastView){lastView=view;track('campus_plus_step_viewed',{plus_step:view});if(view==='ready')track('campus_plus_offer_viewed',{location:'app'});}void survey.update(view,surveySession);};
  async function api(path:string,data?:unknown){
    const response=await fetch(`/api/app/plus/${path}`,{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000),
      headers:{...analyticsHeaders(),...(data===undefined?{}:{'content-type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});
    const body=await response.json();if(!response.ok)throw new Error(body.error??'No pudimos comprobar el pago.');return body;
  }
  function failure(error:unknown){if(disposed)return;message(error instanceof Error?error.message:'No pudimos conectar con Campus. Vuelve a intentarlo sin volver a pagar.',true);track('campus_flow_failed',{step:'plus',plus_step:lastView,error_kind:error instanceof TypeError?'network':'rejected'});}
  function expired(){const ended=quote!==null&&Date.now()>=new Date(quote.expiresAt).getTime();find<HTMLButtonElement>('submit').disabled=busy||ended;find('requote').hidden=!ended;if(ended&&!expiryTracked){expiryTracked=true;track('campus_plus_quote_expired',{plus_step:'payment'});}if(ended)message('Tu reserva de precio venció. Vuelve a comprobarlo antes de pagar. Si ya pagaste, contacta a soporte.',true);return ended;}
  async function checkout(resume=false){
    if(busy)return;busy=true;root.querySelectorAll<HTMLButtonElement>('[data-plus-checkout],[data-plus-renew],[data-plus-retry],[data-plus-flow-resume]').forEach(b=>b.disabled=true);message(resume?'Abriendo tu pago…':'Comprobando tu precio…',false,true);
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
        find('qa').hidden=true;
        if(resume){track('campus_plus_checkout_viewed',{offer:value.order.cohort,amount_cents:value.order.amountCents});location.assign(url.href);return;}
        flowPrice(quote!);flowCopy(false);flowLink.href=url.href;flowLink.hidden=false;flowResume.hidden=true;
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
    }catch(error){failure(error);}finally{busy=false;root.querySelectorAll<HTMLButtonElement>('[data-plus-checkout],[data-plus-renew],[data-plus-retry],[data-plus-flow-resume]').forEach(b=>b.disabled=false);expired();}
  }
  /** One panel for the paid month: where it stands, when renewal opens and what was paid. */
  function renderSubscription(state:State,email:string|undefined){
    const panel=find('subscription');
    const history=state.orders.filter(order=>orderStatus[order.status]&&!order.isTest);
    const facts=find('sub-facts');
    const subscription=state.subscription&&!state.subscription.isTest?state.subscription:null;
    if(['guest','unavailable','university'].includes(lastView)){panel.hidden=true;find('history-panel').hidden=true;return;}
    const phase=subscription?(state.subscriptionState??phaseFromDate(subscription.activeUntil)):'none';
    const badge=find('sub-badge');
    badge.textContent=phase==='expired'?'Plus vencido':phase==='expiring'?'Vence pronto':phase==='active'?'Activo':'';badge.hidden=phase==='none';
    badge.dataset.tone=phase==='expiring'?'soon':phase==='expired'||phase==='none'?'ended':'ok';
    text('sub-name',phase==='expired'||phase==='none'?'Campus Free':'Campus Plus');
    text('sub-until',subscription?date(subscription.activeUntil):'Sin mes activo');
    text('sub-renewal',subscription?`${money(subscription.renewalCents)} por 30 días`:'');
    const notice=`Te avisaremos${email?` a ${email}`:''} 7, 3 y 1 día antes.`;
    facts.hidden=phase==='none'||phase==='expired';
    text('sub-rule',phase==='active'?`No se renueva solo. ${state.renewableFrom?`Podrás renovar desde el ${date(state.renewableFrom)} y los días se suman a los que te quedan. `:''}${notice}`
      :phase==='expiring'&&lastView==='pending'?`Tu renovación está en revisión; los 30 días se suman cuando la confirmemos. ${notice}`
      :phase==='expiring'?`Ya puedes renovar: los 30 días nuevos se suman a los que te quedan. Si no renuevas, vuelves a Campus Free. ${notice}`
      :phase==='expired'?`Tu Plus venció el ${date(subscription!.activeUntil)} y tu cuenta volvió a Campus Free.`:'Todavía no tienes un mes de Plus pagado.');
    find('sub-actions').hidden=state.currentPlan!=='plus'||!subscription;
    const list=find('sub-history');list.replaceChildren();
    for(const order of history){
      const item=document.createElement('li'),what=document.createElement('div'),amount=document.createElement('strong'),detail=document.createElement('span'),result=document.createElement('span');
      what.className='plus-history__what';
      amount.textContent=money(order.amountCents);
      detail.textContent=[date(order.createdAt),order.paymentMethod==='flow'?'QR de Flow':'Yape o Plin',order.status==='active'&&order.activeUntil?`cubre hasta el ${date(order.activeUntil)}`:''].filter(Boolean).join(' · ');
      result.className='plus-history__status';result.dataset.status=order.status;result.textContent=orderStatus[order.status];
      what.append(amount,detail);
      if(order.status==='rejected'&&order.note){const note=document.createElement('span');note.className='plus-history__note';note.textContent=`Motivo: ${order.note}`;what.append(note);}
      item.append(what,result);list.append(item);
    }
    find('sub-empty').hidden=history.length>0;
    find('history-panel').hidden=history.length===0;
    // Without a paid month the action panel already says what to do: no empty plan card.
    panel.hidden=!subscription;
  }
  async function load(quiet=false){
    if(!quiet)message('Comprobando tu cuenta…',false,true);
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
      const pendingFlow=state.orders.find(order=>order.status==='quoted'&&order.paymentMethod==='flow');
      pendingPayment=Boolean(pending||pendingFlow);
      // Renewing is offered only from the active branch below; any other state starts without it.
      find('renew').hidden=true;
      if(!pendingFlow){flowLink.removeAttribute('href');flowLink.hidden=true;}
      if(pending){show('pending');message();track('campus_plus_status_viewed',{plus_status:'payment_review',is_test:pending.isTest===true});}
      else if(pendingFlow){
        flowPrice(pendingFlow);flowCopy(true);flowResume.hidden=!flowLink.hidden;show('flow');message();
      }
      else if(state.currentPlan==='plus'){
        show('active');message();text('active-until',state.subscription?.isTest?`Acceso de prueba hasta el ${date(state.subscription.activeUntil)}. No se registró ningún pago.`:state.subscription?`Tu mes está activo hasta el ${date(state.subscription.activeUntil)}.`:'Tu cuenta tiene acceso a Campus Plus.');
        find('renew').hidden=!state.enabled||!state.eligible||!state.subscription||(state.subscriptionState??phaseFromDate(state.subscription.activeUntil))==='active';
        track('campus_plus_status_viewed',{plus_status:'active'});
      }else if(!state.enabled){show('unavailable');message('La activación de Plus está pausada. No realices un pago nuevo.',true);}
      else if(!state.eligible){show('university');message();}
      else if(state.orders[0]?.status==='rejected'){
        show('rejected');text('rejection',state.orders[0].note);message();track('campus_plus_status_viewed',{plus_status:'rejected'});
      }else{
        const manualQuote=state.orders.some(order=>order.status==='quoted'&&!order.paymentMethod);
        const qr = Boolean(state.flowAvailable && !manualQuote);
        find('ready-copy').hidden = !qr;
        text('ready-title',state.subscription&&!state.subscription.isTest?'Renueva tu mes.':'Así activas tu mes.');
        // The three steps are for a first payment; someone renewing already knows them.
        find('manual-overview').hidden = qr || Boolean(state.subscription&&!state.subscription.isTest);
        show('ready');message();find('checkout').textContent=state.orders.some(o=>o.status==='quoted')?'Retomar instrucciones de pago':state.subscription?'Renovar mi mes':'Ver precio y cómo pagar';}
      // The test notice describes the panel on screen, never a past test the student is not looking at.
      find('qa').hidden=!(lastView==='pending'&&pending?.isTest||lastView==='active'&&state.subscription?.isTest&&!state.orders.some(order=>order.status==='active'&&order.paymentMethod==='flow'));
      renderSubscription(state,session.email);
      // One card per state: with a paid month the plan card carries the actions, so the active panel steps aside.
      if(lastView==='active'&&!find('subscription').hidden)find('view="active"').hidden=true;
      find('sub-connect').classList.toggle('app-button--secondary',!find('renew').hidden);
    }catch(error){if(!disposed){show('unavailable');failure(error);}}
  }
  find<HTMLButtonElement>('checkout').onclick=()=>void checkout();find<HTMLButtonElement>('renew').onclick=()=>void checkout();find<HTMLButtonElement>('retry').onclick=()=>void checkout();
  flowResume.onclick=()=>void checkout(true);
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
