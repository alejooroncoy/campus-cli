import { useEffect, useRef, useState, type FormEvent } from 'react';

type ProductId = 'ai' | 'similarity' | 'both';
type Config = {enabled:boolean;ordersAvailable:boolean;products:{id:ProductId;label:string;amountCents:number}[];availability?:Partial<Record<ProductId,number>>;phone:string;holder:string;maxDocumentBytes:number;maxReceiptBytes:number};
const money=(cents:number)=>`S/${(cents/100).toLocaleString('es-PE')}`;
async function configuration():Promise<Config> {
 const response=await fetch('/api/app/turnitin/config',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('No pudimos comprobar la disponibilidad. No realices el pago.');
 const config=await response.json() as Config;
 if(!Array.isArray(config.products)||!config.availability||!Number.isSafeInteger(config.maxDocumentBytes)||!Number.isSafeInteger(config.maxReceiptBytes))throw Error('No pudimos comprobar la disponibilidad. No realices el pago.');
 return config;
}
const available=(config:Config,product:ProductId)=>config.enabled&&config.ordersAvailable&&typeof config.availability?.[product]==='number'&&config.availability[product]!>0;
async function encode(file:File) {
 const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('No pudimos leer el archivo.'));reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(file);});
 return {name:file.name,base64:data.slice(data.indexOf(',')+1)};
}
export default function TurnitinChat({close}:{close:()=>void}) {
 const [config,setConfig]=useState<Config|null>(null),[product,setProduct]=useState<ProductId>('both');
 const [document,setDocument]=useState<File|null>(null),[receipt,setReceipt]=useState<File|null>(null);
 const [review,setReview]=useState(false),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[order,setOrder]=useState<string|null>(null);
 const [uncertain,setUncertain]=useState(false);
 const request=useRef<string|null>(null),submitting=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;configuration().then(c=>{if(alive.current)setConfig(c);}).catch(e=>{if(alive.current)setError(e.message);});return()=>{alive.current=false;};},[]);
 const offer=config?.products.find(item=>item.id===product);
 const reset=()=>{setReview(false);setConsent(false);request.current=null;setError('');};
 const submit=async(event:FormEvent)=>{event.preventDefault();if(submitting.current||!config||!offer||!document||!receipt||!consent||!request.current)return;
  submitting.current=true;setBusy(true);setError('');
  try {if(!uncertain){const fresh=await configuration(),current=fresh.products.find(item=>item.id===product);setConfig(fresh);
   if(!current||!available(fresh,product)||current.amountCents!==offer.amountCents){reset();throw Error('La disponibilidad o el precio cambiaron. Revisa los datos de nuevo antes de confirmar.');}}
   const [doc,proof]=await Promise.all([encode(document),encode(receipt)]);
   setUncertain(true);
   const response=await fetch('/api/app/turnitin/orders',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:request.current,report:product,amountCents:offer.amountCents,consent:true,document:doc,receipt:proof}),signal:AbortSignal.timeout(60000)});
   const data=await response.json().catch(()=>({}));
   if(!response.ok){
    // A first-attempt client rejection proves this attempt was rejected. A
    // previous ambiguous attempt can have succeeded, so retain its request ID.
    if(!uncertain&&[400,401,403,409,413,415,422,429].includes(response.status))setUncertain(false);
    throw Error(data.error||'No pudimos confirmar el envío. Reintenta sin cambiar los archivos.');
   }
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.order?.id??''))throw Error('No pudimos comprobar el pedido. Reintenta sin cambiar los archivos.');
   setOrder(data.order.id);setUncertain(false);
  } catch(e){setError(e instanceof Error?e.message:'No pudimos completar el envío.');} finally{submitting.current=false;setBusy(false);}
 };
 return <section aria-label="Solicitar revisión de Turnitin" className="app-profes-ai__turnitin">
  <h2>Solicitar revisión de Turnitin</h2><button type="button" onClick={close} disabled={busy||uncertain}>Cerrar</button>
  {order?<p role="status">Recibimos tu pedido. El comprobante está pendiente de validación; consulta el estado en <a href="/app/turnitin/">Mis revisiones</a>.</p>:<>
   {!config&&!error?<p role="status">Comprobando disponibilidad…</p>:null}
   {error?<p role="alert">{error}{uncertain?<> Reintenta con los mismos archivos para verificar si el pedido fue recibido o consulta <a href="/app/turnitin/">Mis revisiones</a>.</>:null}</p>:null}
   {config?<form onSubmit={submit}>
    <fieldset disabled={busy||review}><legend>Elige el informe y los archivos</legend>
     <label>Informe <select value={product} onChange={e=>{setProduct(e.target.value as ProductId);reset();}}>{config.products.map(p=><option value={p.id} key={p.id}>{p.label} · {money(p.amountCents)}</option>)}</select></label>
     <label>Documento PDF o DOCX <input type="file" accept=".pdf,.docx" onChange={e=>{setDocument(e.target.files?.[0]??null);reset();}} /></label>
     <label>Comprobante PNG, JPG o PDF <input type="file" accept=".png,.jpg,.jpeg,.pdf" onChange={e=>{setReceipt(e.target.files?.[0]??null);reset();}} /></label>
    </fieldset>
    {offer&&available(config,product)?<p>Precio: {money(offer.amountCents)}. Yape o Plin: {config.phone}. Titular: {config.holder}. Verifica los datos antes de pagar.</p>:<p>No hay disponibilidad confirmada para esta opción. No realices el pago.</p>}
    {!review?<button type="button" disabled={!offer||!available(config,product)||!document?.size||document.size>config.maxDocumentBytes||!receipt?.size||receipt.size>config.maxReceiptBytes||busy} onClick={()=>{request.current=crypto.randomUUID();setReview(true);}}>Revisar antes de enviar</button>:<>
     <p>Revisa: {document?.name}, {receipt?.name}, {offer?.label} por {offer?money(offer.amountCents):''}. El pago se valida manualmente.</p>
     <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={busy} /> Autorizo a Campus a procesar estos archivos mediante TurnitPro y acepto las <a href="/turnitin/#como-funciona">condiciones</a> y la <a href="/privacidad/">política de privacidad</a>.</label>
     <button type="button" disabled={busy||uncertain} onClick={reset}>Cambiar datos</button><button type="submit" disabled={busy||!consent}>Confirmar y enviar</button>
    </>}
   </form>:null}
  </>}
 </section>;
}
