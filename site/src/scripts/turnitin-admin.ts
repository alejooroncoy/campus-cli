import { setupTurnitinUploads } from './turnitin-upload';
import { setupTurnitinReportViewer, type ReportKind } from './turnitin-report-viewer';
export type AdminOrder = {
  id: string; amountCents: number; status: string; documentName: string; receiptName?: string; note: string;
  createdAt: string; paidAt: string | null;
};
type Dependencies = {
  api: (path: string, input?: unknown) => Promise<any>;
  encode: (file: File | undefined, max: number) => Promise<{name: string; base64: string}>;
  maxDocumentBytes: () => number;
  reportCard: (order: AdminOrder, kind: ReportKind) => HTMLElement;
};
const labels: Record<string,string> = {payment_review:'Validar pago',processing:'Por entregar',completed:'Entregado',payment_rejected:'Pago observado'};
const money = (cents:number) => `S/${(cents/100).toLocaleString('es-PE')}`;
function el<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className='') {
  const node=document.createElement(tag);node.textContent=text;node.className=className;return node;
}
export function setupTurnitinAdmin(deps:Dependencies) {
  const panel=document.querySelector<HTMLElement>('[data-ti-admin]')!;
  const list=panel.querySelector<HTMLElement>('[data-ti-admin-orders]')!;
  const message=panel.querySelector<HTMLElement>('[data-ti-admin-status]')!;
  const count=panel.querySelector<HTMLElement>('[data-ti-admin-count]')!;
  const search=panel.querySelector<HTMLInputElement>('[data-ti-admin-search]')!;
  const refreshButton=panel.querySelector<HTMLButtonElement>('[data-ti-admin-refresh]')!;
  const more=panel.querySelector<HTMLButtonElement>('[data-ti-admin-more]')!;
  const filters=[...panel.querySelectorAll<HTMLButtonElement>('[data-ti-admin-filter]')];
  const cards=new Map<string,{signature:string;card:HTMLElement}>();
  let filter='payment_review',cursor:string|null=null,orders:AdminOrder[]=[];
  let version=0,disposed=false,loading=false,mutating=false,initialized=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  function announce(text:string,error=false) { message.textContent=text;message.hidden=!text;message.dataset.error=String(error); }
  function controls() {
    refreshButton.disabled=more.disabled=loading||mutating;
    search.disabled=mutating;
    for(const button of filters){button.disabled=mutating;button.setAttribute('aria-pressed',String(button.dataset.tiAdminFilter===filter));}
  }
  function download(order:AdminOrder,kind:string,text:string) {
    const link=el('a',text,'app-button app-button--secondary');link.href=`/api/app/turnitin/admin/orders/${order.id}/files/${kind}`;link.download='';return link;
  }
  function feedback(form:HTMLElement,text:string,error=false) {
    const node=form.querySelector<HTMLElement>('[data-ti-action-status]')!;node.textContent=text;node.hidden=!text;node.dataset.error=String(error);
  }
  function actionStatus() { const node=el('p','','ti-admin-action-status');node.dataset.tiActionStatus='';node.hidden=true;node.setAttribute('role','status');return node; }
  function showUpdatedOrder(order:AdminOrder) {
    filter=order.status;orders=[order];render();controls();
    count.textContent='Actualizando pedidos…';
  }
  function card(order:AdminOrder) {
    const node=el('article','','ti-order ti-admin-order');node.id=`ti-admin-order-${order.id}`;node.dataset.status=order.status;
    const head=el('div','','ti-order-heading');head.append(el('h3',order.documentName),el('span',labels[order.status]??order.status,'ti-tag'));node.append(head);
    const date=new Date(order.createdAt).toLocaleString('es-PE',{timeZone:'America/Lima',dateStyle:'short',timeStyle:'short'});
    node.append(el('p',`${money(order.amountCents)} · ${date} · Pedido ${order.id.slice(0,8)}`,'ti-small'));
    if(order.note)node.append(el('p',order.note,'ti-admin-observation'));
    const files=el('div','','ti-admin-files');
    const receipt=el('button','Ver comprobante','app-button');receipt.type='button';receipt.setAttribute('aria-label',`Ver comprobante de ${order.documentName}`);
    receipt.onclick=()=>setupTurnitinReportViewer()?.open({...order,admin:true},'receipt');
    files.append(receipt,download(order,'document','Descargar trabajo ↓'));node.append(files);
    if(order.status==='payment_review') {
      const form=el('form','','ti-admin-payment');const fields=el('fieldset');fields.append(el('legend','1 · Valida el pago'));
      const checkLabel=el('label','','ti-admin-verify');const check=el('input');check.type='checkbox';
      checkLabel.append(check,el('span',`Verifiqué el abono de ${money(order.amountCents)} en Yape/Plin.`));
      const accept=el('button','Confirmar pago y continuar →','app-button');accept.type='submit';accept.disabled=true;check.onchange=()=>{accept.disabled=!check.checked;};
      const rejected=el('details','','ti-admin-reject');rejected.append(el('summary','¿Hay un problema con el pago?'));
      const reason=el('label','Motivo de la observación');const note=el('textarea');note.rows=2;note.maxLength=500;note.placeholder='Indica qué debe corregir el cliente';reason.append(note);
      const reject=el('button','Observar pago','app-button app-button--secondary');reject.type='button';rejected.append(reason,reject);
      fields.append(el('p','Abre el comprobante y contrasta el monto con el abono recibido.','ti-field-help'),checkLabel,accept,rejected,actionStatus());form.append(fields);node.append(form);
      const review=async(accepted:boolean)=>{
        if(mutating||fields.disabled)return;
        if(accepted&&!check.checked){feedback(form,'Verifica el abono antes de confirmar.',true);return;}
        if(!accepted&&note.value.trim().length<5){feedback(form,'Indica el motivo de la observación (al menos 5 caracteres).',true);note.focus();return;}
        mutating=true;fields.disabled=true;controls();feedback(form,accepted?'Confirmando pago…':'Guardando observación…');
        try{
          const result=await deps.api(`admin/orders/${order.id}/review`,{accepted,note:note.value.trim()});
          announce(accepted?'Pago confirmado. Ahora carga los informes de similitud e IA.':'Pago observado. El cliente verá el motivo en su panel.');
          showUpdatedOrder(result.order);
          try{await refresh(false,result.order);}catch{announce(accepted?'Pago confirmado. Usa Actualizar pedidos para recargar la lista.':'Pago observado. Usa Actualizar pedidos para recargar la lista.',true);}
        }catch(error){feedback(form,(error as Error).message,true);}
        finally{mutating=false;fields.disabled=false;controls();}
      };
      form.onsubmit=event=>{event.preventDefault();void review(true);};reject.onclick=()=>void review(false);
    }
    if(order.status==='processing') {
      const form=el('form','','ti-admin-delivery');const fields=el('fieldset');fields.append(el('legend','2 · Entrega los dos informes'));
      fields.append(el('p','Selecciona un PDF para cada resultado. Comprueba que ambos corresponden a este trabajo.','ti-field-help'));
      const uploads=el('div','','ti-admin-upload-grid');
      for(const [kind,title] of [['similarity','Informe de similitud'],['ai','Informe de IA']]) {
        const group=el('div','','ti-admin-upload-group');const zone=el('label','','ti-upload');zone.dataset.tiUpload='';zone.tabIndex=0;zone.setAttribute('aria-label',`${title}: selecciona, arrastra o pega un PDF`);
        const label=el('span',title,'ti-upload-title');label.id=`ti-admin-${kind}-${order.id}`;
        const filename=el('span','Seleccionar PDF · Hasta 10 MB','ti-upload-name');filename.dataset.tiFilename=kind;
        const input=el('input');input.type='file';input.name=kind;input.accept='.pdf';input.required=true;input.tabIndex=-1;input.setAttribute('aria-labelledby',label.id);
        const error=el('p','','ti-upload-error');error.dataset.tiUploadError=kind;error.id=`${label.id}-error`;error.hidden=true;error.setAttribute('role','alert');input.setAttribute('aria-describedby',error.id);
        const remove=el('button',`Quitar ${title.toLowerCase()}`,'ti-remove-file');remove.type='button';remove.dataset.tiRemove=kind;remove.hidden=true;
        zone.append(label,filename,input);group.append(zone,remove,error);uploads.append(group);
      }
      const submit=el('button','Entregar informes y avisar al cliente →','app-button');submit.type='submit';submit.disabled=true;
      fields.append(uploads,el('p','Haz clic, arrastra o pega tus PDF. Puedes cambiar el archivo antes de enviarlo.','ti-upload-methods'),submit,actionStatus());form.append(fields);node.append(form);
      const uploadsController=setupTurnitinUploads(form,()=>deps.maxDocumentBytes());
      const selected=(kind:string)=>(form.elements.namedItem(kind) as HTMLInputElement).files?.[0];
      form.onchange=()=>{submit.disabled=!selected('similarity')||!selected('ai');feedback(form,'');};
      form.onsubmit=async event=>{
        event.preventDefault();if(mutating||!uploadsController.validate()||!form.reportValidity())return;
        mutating=true;fields.disabled=true;submit.setAttribute('aria-busy','true');submit.textContent='Enviando los dos informes…';controls();feedback(form,'Mantén esta página abierta hasta terminar la entrega.');
        try{
          const result=await deps.api(`admin/orders/${order.id}/complete`,{similarity:await deps.encode(selected('similarity'),deps.maxDocumentBytes()),ai:await deps.encode(selected('ai'),deps.maxDocumentBytes())});
          uploadsController.reset();announce('Informes entregados. El cliente ya puede verlos y descargarlos; recibirá el aviso por correo.');
          showUpdatedOrder(result.order);
          try{await refresh(false,result.order);}catch{announce('Informes entregados. Usa Actualizar pedidos para recargar la lista.',true);}
        }catch(error){feedback(form,(error as Error).message,true);}
        finally{mutating=false;fields.disabled=false;submit.removeAttribute('aria-busy');submit.textContent='Entregar informes y avisar al cliente →';controls();}
      };
    }
    if(order.status==='completed') {
      const details=el('details','','ti-order-reports');details.append(el('summary','Ver informes entregados'));
      const reports=el('div','','ti-file-grid');reports.append(deps.reportCard(order,'similarity'),deps.reportCard(order,'ai'));details.append(reports);node.append(details);
    }
    return node;
  }
  function render() {
    const fragment=document.createDocumentFragment();
    for(const order of orders) {
      const signature=JSON.stringify(order);let entry=cards.get(order.id);
      if(!entry||entry.signature!==signature){entry={signature,card:card(order)};cards.set(order.id,entry);}
      fragment.append(entry.card);
    }
    list.replaceChildren(fragment);
    if(!orders.length){const empty=el('div','','ti-empty');empty.append(el('h3',filter==='payment_review'&&!search.value?'No hay pagos por validar':'No hay pedidos con estos filtros'),el('p','Puedes consultar otro estado o buscar el nombre del trabajo.','ti-muted'));list.append(empty);}
    // Retain drafts when switching tabs, but discard unused detached cards.
    for(const [id,entry] of cards)if(!entry.card.isConnected&&!entry.card.querySelector<HTMLInputElement>('input[type=file]:valid')?.files?.length&&!entry.card.querySelector<HTMLTextAreaElement>('textarea')?.value&&!entry.card.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked)cards.delete(id);
  }
  async function refresh(append=false,follow?:AdminOrder) {
    const request=++version;loading=true;controls();
    try{
      if(!initialized&&!follow){const id=/^#ti-order-([0-9a-f-]{36})$/i.exec(location.hash)?.[1];if(id){try{follow=(await deps.api(`admin/orders/${id}`)).order;}catch{announce('No pudimos abrir el pedido del enlace. Busca el trabajo en el panel.',true);}if(disposed||request!==version)return;}}
      if(follow)filter=follow.status;
      const query=new URLSearchParams();if(filter!=='all')query.set('status',filter);if(search.value.trim())query.set('search',search.value.trim());if(append&&cursor)query.set('cursor',cursor);
      const result=await deps.api(`admin/orders?${query}`);if(disposed||request!==version)return;
      orders=append?[...new Map([...orders,...result.orders].map((order:AdminOrder)=>[order.id,order])).values()]:result.orders;
      if(follow&&!orders.some(order=>order.id===follow!.id))orders.unshift(follow);
      cursor=result.nextCursor??null;more.hidden=!cursor;
      const counts=result.counts??{all:orders.length,...Object.fromEntries(Object.keys(labels).map(status=>[status,orders.filter(order=>order.status===status).length]))};
      panel.querySelectorAll<HTMLElement>('[data-ti-admin-total]').forEach(node=>{node.textContent=String(counts[node.dataset.tiAdminTotal!]??0);});
      const total=counts[filter]??orders.length;count.textContent=`${orders.length} de ${total} ${total===1?'pedido':'pedidos'} · Más recientes primero`;
      initialized=true;render();controls();
      if(follow)document.getElementById(`ti-admin-order-${follow.id}`)?.scrollIntoView({block:'start'});
    }finally{if(request===version){loading=false;controls();}}
  }
  refreshButton.onclick=()=>{if(mutating)return;void refresh().then(()=>announce('Pedidos actualizados.')).catch(error=>announce(error.message,true));};
  more.onclick=()=>{if(cursor&&!loading&&!mutating)void refresh(true).catch(error=>announce(error.message,true));};
  for(const button of filters)button.onclick=()=>{if(mutating)return;filter=button.dataset.tiAdminFilter!;controls();void refresh().catch(error=>announce(error.message,true));};
  const searchNow=()=>{clearTimeout(timer);void refresh().catch(error=>announce(error.message,true));};
  search.oninput=()=>{clearTimeout(timer);timer=setTimeout(searchNow,300);};search.addEventListener('search',searchNow);
  const cleanup=()=>{disposed=true;version++;clearTimeout(timer);cards.clear();};document.addEventListener('astro:before-swap',cleanup,{once:true});window.addEventListener('pagehide',cleanup,{once:true});
  return {refresh};
}
