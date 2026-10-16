import { getCampusSession } from './campus-session';
import { analyticsHeaders, track } from './analytics';
import { uploadError } from './turnitin-upload';
import type { CampusSession } from './campus-session';

type Order = {id:string;accountId:number;kind:string;cohort:string;status:string;amountCents:number;renewalCents:number;expiresAt:string;activeUntil:string|null;note:string};
type State = {orders:Order[];currentPlan:string;subscription:{activeUntil:string;renewalCents:number}|null;admin:boolean;enabled:boolean;eligible:boolean;blocked:boolean;unavailable:boolean};
const money=(cents:number)=>`S/${cents/100}`;
const date=(value:string)=>new Date(value).toLocaleDateString('es-PE',{day:'numeric',month:'long',year:'numeric'});
let cleanup=()=>{};
function mount(){
  cleanup();
  const candidate=document.querySelector<HTMLElement>('[data-plus-root]');if(!candidate)return;
  const root=candidate;
  const find=<T extends HTMLElement>(key:string)=>root.querySelector<T>(`[data-plus-${key}]`)!;
  const text=(key:string,value:string)=>{find(key).textContent=value;};
  const status=find('message'),form=find<HTMLFormElement>('form'),input=form.elements.namedItem('receipt') as HTMLInputElement;
  let disposed=false,quote:Order|null=null,timer:ReturnType<typeof setInterval>|undefined,busy=false,adminCursor:string|null=null,pendingPayment=false,poll=0,currentOwner:string|undefined;
  const message=(value='',error=false)=>{status.textContent=value;status.dataset.error=String(error);};
  const show=(view:string)=>{root.querySelectorAll<HTMLElement>('[data-plus-view]').forEach(node=>node.hidden=node.dataset.plusView!==view);};
  async function api(path:string,data?:unknown){
    const response=await fetch(`/api/app/plus/${path}`,{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000),
      headers:{...analyticsHeaders(),...(data===undefined?{}:{'content-type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});
    const body=await response.json();if(!response.ok)throw new Error(body.error??'No pudimos comprobar el pago.');return body;
  }
  function failure(error:unknown){if(disposed)return;message(error instanceof Error?error.message:'No pudimos conectar con Campus. Vuelve a intentarlo sin volver a pagar.',true);track('campus_flow_failed',{step:'plus',error_kind:'rejected'});}
  function expired(){const ended=quote!==null&&Date.now()>=new Date(quote.expiresAt).getTime();find<HTMLButtonElement>('submit').disabled=busy||ended;find('requote').hidden=!ended;if(ended)message('Tu reserva de precio venció. Vuelve a comprobarlo antes de pagar. Si ya pagaste, contacta a soporte.',true);return ended;}
  async function checkout(){
    if(busy)return;busy=true;root.querySelectorAll<HTMLButtonElement>('[data-plus-checkout],[data-plus-renew],[data-plus-retry]').forEach(b=>b.disabled=true);message('Comprobando tu precio…');
    try{
      const value=await api('checkout',{});if(disposed)return;
      quote=value.order;
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
    try{
      const [session,config]=await Promise.all([getCampusSession(true),api('config')]);if(disposed)return;
      currentOwner=session.authenticated?session.analyticsId??session.email??'account':'guest';
      if(!session.authenticated){pendingPayment=false;find('admin').hidden=true;find('admin-list').replaceChildren();show('guest');message();return;}
      if(!config.ordersAvailable){show('unavailable');message('No pudimos comprobar los pagos de Plus. No realices un pago nuevo.',true);return;}
      const state:State=await api('state');if(disposed)return;
      if(state.blocked||state.unavailable){show('unavailable');message(state.blocked?'Tu cuenta requiere revisión. Contacta a soporte.':'No pudimos verificar tu plan. Vuelve a comprobarlo.',true);return;}
      text('account',`Cuenta: ${session.email??'tu cuenta Campus'}`);
      const pending=state.orders.find(order=>order.status==='payment_review');
      pendingPayment=Boolean(pending);
      if(pending){show('pending');message();track('campus_plus_status_viewed',{plus_status:'payment_review'});}
      else if(state.currentPlan==='plus'){
        show('active');message();text('active-until',state.subscription?`Tu mes está activo hasta el ${date(state.subscription.activeUntil)}.`:'Tu cuenta ya tiene acceso a Campus Plus.');
        text('active-renewal',state.subscription?`Tu próxima renovación: ${money(state.subscription.renewalCents)} por mes. Sin cobros automáticos.`:'Consulta el estado de tu cuenta en Mi perfil.');
        find('renew').hidden=!state.enabled||!state.eligible||!state.subscription||new Date(state.subscription.activeUntil).getTime()>Date.now()+7*86400000;
        track('campus_plus_status_viewed',{plus_status:'active'});
      }else if(!state.enabled){show('unavailable');message('La activación de Plus está pausada. No realices un pago nuevo.',true);}
      else if(!state.eligible){show('university');message();}
      else if(state.orders[0]?.status==='rejected'){
        show('rejected');text('rejection',state.orders[0].note);message();track('campus_plus_status_viewed',{plus_status:'rejected'});
      }else{show('ready');message();find('checkout').textContent=state.orders.some(o=>o.status==='quoted')?'Retomar mi pago':state.subscription?'Renovar mi mes':'Ver mi precio';}
      find('admin').hidden=!state.admin;if(state.admin)await adminLoad(false);
    }catch(error){if(!disposed){show('unavailable');failure(error);}}
  }
  const element=(tag:string,value='',className='')=>{const node=document.createElement(tag);node.textContent=value;node.className=className;return node;};
  async function adminLoad(more:boolean){
    try{
      const value=await api(`admin/orders${more&&adminCursor?`?cursor=${encodeURIComponent(adminCursor)}`:''}`);if(disposed)return;
      const list=find('admin-list');if(!more)list.replaceChildren();adminCursor=value.nextCursor;find('admin-more').hidden=!adminCursor;
      for(const order of value.orders as Order[]){
        if(['quoted','expired'].includes(order.status))continue;
        const card=element('article');card.append(element('h3',`Cuenta ${order.accountId} · ${money(order.amountCents)}`),element('p',`${order.kind==='renewal'?'Renovación':'Primer mes'} · ${order.status==='payment_review'?'Por validar':order.status==='active'?'Activado':'Observado'}`),element('p',`Pedido: ${order.id}`,'plus-muted'));
        const receipt=element('a','Descargar comprobante','app-text-link') as HTMLAnchorElement;receipt.href=`/api/app/plus/admin/orders/${order.id}/receipt`;receipt.target='_blank';receipt.rel='noopener';card.append(receipt);
        if(order.status==='payment_review'){
          const check=document.createElement('input');check.type='checkbox';const label=element('label');label.append(check,element('span',`Verifiqué el abono real de ${money(order.amountCents)} en Yape o Plin.`));
          const note=document.createElement('textarea');note.maxLength=500;note.placeholder='Observación para el estudiante (obligatoria al rechazar)';note.setAttribute('aria-label','Observación del pago');
          const approve=element('button','Confirmar pago y activar','app-button') as HTMLButtonElement;approve.type='button';approve.disabled=true;check.onchange=()=>approve.disabled=!check.checked;
          const reject=element('button','Observar pago','app-button app-button--secondary') as HTMLButtonElement;reject.type='button';
          const actions=element('div','','plus-admin-actions'),feedback=element('p','','plus-muted');feedback.setAttribute('role','status');actions.append(approve,reject);card.append(label,note,actions,feedback);
          const review=async(accepted:boolean)=>{approve.disabled=true;reject.disabled=true;try{await api(`admin/orders/${order.id}/review`,{accepted,paymentVerified:check.checked,note:note.value});await adminLoad(false);message('Revisión guardada.');}catch(error){feedback.textContent=error instanceof Error?error.message:'No pudimos guardar la revisión.';}finally{approve.disabled=!check.checked;reject.disabled=false;}};
          approve.onclick=()=>void review(true);reject.onclick=()=>void review(false);
        }else if(order.note)card.append(element('p',order.note));
        list.append(card);
      }
      if(!list.childElementCount)list.append(element('p','No hay pagos enviados.','plus-muted'));
    }catch(error){failure(error);}
  }
  find<HTMLButtonElement>('checkout').onclick=()=>void checkout();find<HTMLButtonElement>('renew').onclick=()=>void checkout();find<HTMLButtonElement>('retry').onclick=()=>void checkout();
  find<HTMLButtonElement>('requote').onclick=()=>void checkout();
  root.querySelectorAll<HTMLButtonElement>('[data-plus-refresh]').forEach(button=>button.onclick=()=>void load());
  find<HTMLButtonElement>('admin-refresh').onclick=()=>void adminLoad(false);find<HTMLButtonElement>('admin-more').onclick=()=>void adminLoad(true);
  find<HTMLButtonElement>('copy').onclick=async()=>{try{await navigator.clipboard.writeText(find('phone').textContent??'');message('Número copiado.');track('campus_plus_payment_copied');}catch{message('Selecciona el número y cópialo desde tu dispositivo.',true);}};
  input.onchange=()=>{const error=uploadError(Array.from(input.files??[]),'receipt',5*1024*1024);message(error??'',Boolean(error));text('filename',error?'Selecciona otro comprobante':input.files?.[0]?.name??'Seleccionar comprobante');track('campus_plus_receipt_selected',{valid:!error});};
  form.onsubmit=async(event)=>{
    event.preventDefault();if(!quote||busy||expired())return;
    const error=uploadError(Array.from(input.files??[]),'receipt',5*1024*1024);if(error){message(error,true);return;}
    if(!(form.elements.namedItem('consent') as HTMLInputElement).checked){message('Confirma la revisión de tu comprobante.',true);return;}
    busy=true;expired();message('Enviando comprobante…');track('campus_plus_submit_started',{offer:quote.cohort,amount_cents:quote.amountCents});
    try{
      const file=input.files![0];const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
      await api('orders',{quoteId:quote.id,consent:true,receipt:{name:file.name,base64}});if(disposed)return;form.reset();quote=null;await load();
    }catch(error){failure(error);}finally{busy=false;expired();}
  };
  timer=setInterval(()=>{if(quote)expired();if(pendingPayment&&!busy&&document.visibilityState==='visible'&&++poll%20===0)void load();},1000);
  const changed=(event:Event)=>{
    const session=(event as CustomEvent<CampusSession>).detail;
    const owner=session.authenticated?session.analyticsId??session.email??'account':'guest';
    if(currentOwner!==undefined&&owner!==currentOwner){
      disposed=true;quote=null;form.reset();find('admin').hidden=true;find('admin-list').replaceChildren();show('loading');message('Actualizando la cuenta…');location.reload();
    }
  };
  window.addEventListener('campus:session-updated',changed);
  void load();
  cleanup=()=>{disposed=true;if(timer)clearInterval(timer);window.removeEventListener('campus:session-updated',changed);};
}
document.addEventListener('astro:page-load',mount);document.addEventListener('astro:before-swap',()=>cleanup());mount();
