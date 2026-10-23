import {replyCard,reviewCard} from '../lib/professor-pages.mjs';
type Reply = {id:number;text:string;createdAt:string;authorLabel:string};
const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className='')=>{
 const el=document.createElement(tag);el.textContent=text;el.className=className;return el;
};
function initReplies(){
 const root=document.querySelector<HTMLElement>('[data-professor-profile]');
 if(!root||root.dataset.repliesBound)return;root.dataset.repliesBound='true';
 // Capturing toggle also handles reviews appended by the pagination button.
 root.addEventListener('toggle',event=>{
  const thread=event.target as HTMLDetailsElement;
  if(!thread.matches('[data-review-thread]')||!thread.open||thread.dataset.bound)return;
  thread.dataset.bound='true';bindThread(thread);
 },true);
 const pendingAnchors=new Map<string,Promise<HTMLElement|null>>();
 async function anchoredReview(id:string){
  const active=pendingAnchors.get(id);if(active)return active;
  const work=(async()=>{
   const list=root!.querySelector<HTMLElement>('[data-profile-reviews]');
   const reviewId=Number(id.slice('review-'.length));
   if(!list||!Number.isSafeInteger(reviewId)||reviewId<1||reviewId>=2147483647)return null;
   const url=new URL('/api/app/profes/community/',location.origin);
   url.search=new URLSearchParams({professorId:list.dataset.professorId!,beforeId:String(reviewId+1),limit:'1'}).toString();
   const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error('Review unavailable');
   const data=await response.json(),review=data.reviews?.[0];
   if(review?.id!==reviewId||review.professorId!==Number(list.dataset.professorId))return null;
   if(!root!.isConnected)return null;
   if(!document.getElementById(id))list.insertAdjacentHTML('beforeend',reviewCard(review,{profile:true}));
   return document.getElementById(id);
  })();
  pendingAnchors.set(id,work);
  try{return await work;}finally{pendingAnchors.delete(id);}
 }
 async function revealAnchor(hash:string,scroll=false){
  let id:string;try{id=decodeURIComponent(hash.slice(1));}catch{return;}
  let target=document.getElementById(id);
  if(!target&&/^review-[1-9]\d{0,9}$/.test(id)){
   const list=root!.querySelector<HTMLElement>('[data-profile-reviews]');if(!list)return;
   let status=root!.querySelector<HTMLElement>('[data-anchor-status]');
   if(!status){status=node('div','','prof-public__help');status.dataset.anchorStatus='';status.setAttribute('role','status');list.before(status);}
   status.textContent='Recuperando la reseña elegida…';
   try{target=await anchoredReview(id);status.textContent=target?'':'Esta reseña ya no está disponible.';}
   catch{
    const retry=node('button','Volver a recuperar la reseña','prof-public__text-button');retry.type='button';retry.addEventListener('click',()=>void revealAnchor(hash,true));
    status.replaceChildren(node('p','No pudimos recuperar la reseña elegida.'),retry);return;
   }
  }
  if(!target||!root!.contains(target))return;
  for(let parent=target.parentElement;parent&&parent!==root;parent=parent.parentElement){if(parent instanceof HTMLDetailsElement)parent.open=true;}
  if(/^review-[1-9]\d*$/.test(id))target.querySelector<HTMLDetailsElement>('[data-review-thread]')?.setAttribute('open','');
  if(scroll&&location.hash===hash)requestAnimationFrame(()=>target!.scrollIntoView({block:'start'}));
 }
 root.addEventListener('click',event=>{
  const anchor=(event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
  if(anchor)void revealAnchor(anchor.hash);
 });
 window.addEventListener('hashchange',()=>void revealAnchor(location.hash,true));
 void revealAnchor(location.hash,true);
}
function bindThread(thread:HTMLDetailsElement){
 const id=thread.dataset.reviewThread!,endpoint=`/api/app/profes/reviews/${id}/replies/`;
 const find=<T extends HTMLElement>(selector:string)=>thread.querySelector<T>(selector)!;
 const list=find('[data-reply-list]'),status=find('[data-reply-status]'),composer=find('[data-reply-composer]');
 const more=find<HTMLButtonElement>('[data-reply-more]'),retry=find<HTMLButtonElement>('[data-reply-retry]');
 const draftKey=`campus-reply:${id}`;let cursor:number|null=null,busy=false;
 const seen=new Set<number>();let retryAppend=false;
 let pendingLoad:Promise<void>|null=null;
 async function load(append=false){
  if(busy){if(!append){await pendingLoad;return load(false);}return;}
  busy=true;let release!:()=>void;pendingLoad=new Promise<void>(resolve=>{release=resolve;});
  more.disabled=true;retry.hidden=true;status.textContent='Cargando respuestas…';
  try{
   const response=await fetch(endpoint+(append&&cursor?`?after=${cursor}`:''),{cache:'no-store',signal:AbortSignal.timeout(10000)});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'No pudimos cargar las respuestas.');
   if(!Array.isArray(data.replies))throw new Error('No pudimos cargar las respuestas.');
   if(!append){list.replaceChildren();seen.clear();}
   for(const reply of data.replies as Reply[]){
    if(seen.has(reply.id))continue;seen.add(reply.id);
    const date=new Date(reply.createdAt);
    const dateLabel=Number.isFinite(date.getTime())?new Intl.DateTimeFormat('es-PE',{day:'numeric',month:'short',year:'numeric',timeZone:'America/Lima'}).format(date):'';
    // Shared escaped renderer keeps local and imported replies visually identical.
    list.insertAdjacentHTML('beforeend',replyCard({...reply,dateLabel}));
   }
   cursor=data.nextCursor;more.hidden=cursor===null;
   find('[data-thread-label]').textContent=`${data.count} ${data.count===1?'respuesta':'respuestas'} · Responder`;
   status.textContent=data.count?'':'Todavía no hay respuestas. Puedes iniciar la conversación.';
  }catch(error){status.textContent=error instanceof Error&&error.name!=='TimeoutError'?error.message:'La carga tardó demasiado. Vuelve a intentarlo.';retry.hidden=false;retryAppend=append;}
  finally{busy=false;more.disabled=false;release();pendingLoad=null;}
 }
 more.addEventListener('click',()=>void load(true));retry.addEventListener('click',()=>void load(retryAppend));
 async function setup(){
  composer.replaceChildren(node('p','Comprobando tu cuenta…','prof-public__help'));
  try{
   const response=await fetch('/api/app/session/',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error();const session=await response.json();composer.replaceChildren();
   if(!session.authenticated){
    const a=node('a','Entrar para responder','prof-public__text-button');a.href=`/api/app/auth/start?return=${encodeURIComponent(`${location.pathname}#review-${id}`)}`;
    composer.append(node('p','Lee libremente. Para responder, entra con tu cuenta Campus.','prof-public__help'),a);return;
   }
   if(!session.universityConfirmed||session.university?.shortName!=='UPC'){
    const a=node('a','Confirmar mi universidad','prof-public__text-button');a.href=`/app/perfil/?universidad=pendiente&return=${encodeURIComponent(location.pathname)}`;
    composer.append(node('p','Confirma UPC en tu perfil para participar.','prof-public__help'),a);return;
   }
   const form=node('form','','prof-public__reply-form'),label=node('label','Tu respuesta');
   const text=node('textarea');text.id=`reply-text-${id}`;text.name='text';text.rows=3;text.minLength=2;text.maxLength=1000;text.required=true;text.placeholder='Haz una pregunta o comparte algo que ayude.';label.htmlFor=text.id;
   const help=node('p','Tu nombre no se muestra. Evita datos personales.','prof-public__help');help.id=`reply-help-${id}`;text.setAttribute('aria-describedby',help.id);
   let requestId=crypto.randomUUID();
   try{const saved=JSON.parse(sessionStorage.getItem(draftKey)??'null');if(saved&&typeof saved.text==='string')text.value=saved.text;if(saved&&/^[0-9a-f-]{36}$/.test(saved.requestId))requestId=saved.requestId;}catch{}
   const save=()=>{try{sessionStorage.setItem(draftKey,JSON.stringify({text:text.value,requestId}));}catch{}};
   text.addEventListener('input',()=>{requestId=crypto.randomUUID();save();});
   const actions=node('div','','prof-public__reply-actions'),cancel=node('button','Cancelar','prof-public__text-button'),submit=node('button','Publicar respuesta','button');cancel.type='button';submit.type='submit';
   cancel.addEventListener('click',()=>{thread.open=false;thread.querySelector('summary')?.focus();});actions.append(cancel,submit);
   const result=node('p','','prof-public__reply-result');result.setAttribute('role','status');result.setAttribute('aria-live','polite');
   form.append(label,text,help,actions,result);composer.append(form);let sending=false;
   form.addEventListener('submit',async event=>{
    event.preventDefault();if(sending||!form.reportValidity())return;
    if(text.value.trim().length<2){result.textContent='Escribe al menos 2 caracteres.';return;}
    sending=true;text.readOnly=true;submit.disabled=true;cancel.disabled=true;result.textContent='Publicando…';save();
    try{
     const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({text:text.value.trim(),requestId}),signal:AbortSignal.timeout(15000)});
     const data=await response.json();if(!response.ok)throw new Error(data.error||'No pudimos publicar tu respuesta.');
     text.value='';requestId=crypto.randomUUID();try{sessionStorage.removeItem(draftKey);}catch{}
     result.textContent=data.message;await load();
     // A new reply may be beyond the first page; do not pretend it is visible.
     if(cursor&&!data.heldForModeration)result.textContent+=' Usa «Ver más respuestas» para verla al final de la conversación.';
    }catch(error){result.textContent=error instanceof Error&&error.name!=='TimeoutError'?error.message:'No pudimos confirmar el envío. Puedes reintentarlo: no se duplicará tu respuesta.';}
    finally{sending=false;text.readOnly=false;submit.disabled=false;cancel.disabled=false;}
   });
  }catch{
   const button=node('button','Volver a comprobar mi cuenta','prof-public__text-button');button.type='button';button.addEventListener('click',()=>void setup());composer.replaceChildren(node('p','No pudimos comprobar tu cuenta. Tu texto se conserva.','prof-public__help'),button);
  }
 }
 void load();void setup();
}
initReplies();document.addEventListener('astro:page-load',initReplies);
