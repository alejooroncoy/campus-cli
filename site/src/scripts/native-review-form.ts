function initReviewForm(){
 const root=document.querySelector<HTMLElement>('[data-review-form-root]');
 if(!root||root.dataset.bound)return;root.dataset.bound='true';
 const find=<T extends HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
 const editor=find<HTMLFormElement>('[data-review-editor]'),gate=find<HTMLElement>('[data-review-gate]'),confirm=find<HTMLElement>('[data-review-confirm]'),done=find<HTMLElement>('[data-review-done]'),error=find<HTMLElement>('[data-review-error]');
 const field=(name:string)=>editor.elements.namedItem(name) as HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;
 const preview=root.dataset.preview==='true';let sending=false;
 const step=(n:number)=>{root.querySelectorAll<HTMLElement>('[data-review-step]').forEach(el=>{if(Number(el.dataset.reviewStep)===n)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});};
 const showError=(message:string)=>{error.textContent=message;error.hidden=false;};
 const key=`campus-native-review:${root.dataset.professorSlug}`;
 const customCourse=find<HTMLElement>('[data-review-custom-course]');
 const courseSelect=field('courseId') as HTMLSelectElement;
 const courseName=field('courseName') as HTMLInputElement;
 const syncCustomCourse=()=>{const active=courseSelect.value==='__other__';customCourse.hidden=!active;courseName.required=active;};
 courseSelect.addEventListener('change',syncCustomCourse);
 const draft=()=>{try{sessionStorage.setItem(key,JSON.stringify({text:field('text').value,rating:field('rating').value,term:field('term').value,courseId:courseSelect.value,courseName:courseName.value}));}catch{}};
 async function session(){
  try{
   const data=preview?{authenticated:true,universityConfirmed:true,university:{shortName:'UPC'}}:await fetch('/api/app/session/',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw new Error();return r.json();});
   gate.replaceChildren();
   if(!data.authenticated){
    const p=document.createElement('p');p.textContent='Inicia sesión con Campus para escribir tu reseña. Volverás a este profesor después de entrar.';
    const login=document.createElement('a');login.className='button';login.href=`/api/app/auth/start?return=${encodeURIComponent(location.pathname)}`;login.textContent='Iniciar sesión con Campus';gate.append(p,login);step(1);return;
   }
   if(!data.universityConfirmed||data.university?.shortName!=='UPC'){
    const p=document.createElement('p');p.textContent='Confirma UPC como tu universidad en Mi perfil para dejar una reseña de este profesor.';
    const a=document.createElement('a');a.className='button';a.href=`/app/perfil/?universidad=pendiente&return=${encodeURIComponent(location.pathname)}`;a.textContent='Ir a Mi perfil';gate.append(p,a);step(1);return;
   }
   gate.hidden=true;editor.hidden=false;step(2);
   try{const saved=JSON.parse(sessionStorage.getItem(key)??'null');if(saved)for(const name of ['text','rating','term','courseId','courseName'])if(typeof saved[name]==='string')field(name).value=saved[name];syncCustomCourse();}catch{}
  }catch{gate.textContent='No pudimos comprobar tu cuenta. Recarga la página para volver a intentarlo.';}
 }
 editor.addEventListener('input',draft);
 editor.addEventListener('submit',event=>{
  event.preventDefault();if(!editor.reportValidity())return;
  const text=field('text').value.trim();if(text.length<10){showError('Escribe al menos 10 caracteres sobre tu experiencia.');return;}
  if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)||/(?:\+?51)?\s*9(?:[\s-]*\d){8}\b/.test(text)){showError('Quita correos y teléfonos del texto antes de compartirlo.');return;}
  error.hidden=true;find('[data-review-text]').textContent=text;
  const course=courseSelect;
  const courseLabel=course.value==='__other__'?courseName.value.trim():course.value?course.selectedOptions[0].textContent:'Curso no indicado';
  find('[data-review-context]').textContent=[courseLabel,field('term').value?`Ciclo ${field('term').value}`:null].filter(Boolean).join(' · ');
  find('[data-review-score]').textContent=field('rating').value?`Valoración al profesor: ${field('rating').value}/10`:'Sin puntuación numérica';
  editor.hidden=true;confirm.hidden=false;step(3);confirm.querySelector('h2')!.setAttribute('tabindex','-1');confirm.querySelector('h2')!.focus();confirm.scrollIntoView({block:'start'});
 });
 find('[data-review-edit]').addEventListener('click',()=>{if(sending)return;confirm.hidden=true;editor.hidden=false;error.hidden=true;step(2);field('text').focus();});
 find<HTMLButtonElement>('[data-review-submit]').addEventListener('click',async()=>{
  if(sending)return;sending=true;error.hidden=true;
  const button=find<HTMLButtonElement>('[data-review-submit]');button.disabled=true;button.setAttribute('aria-busy','true');
  try{
   const input={professorId:Number(root.dataset.professorId),text:field('text').value.trim(),...(courseSelect.value&&courseSelect.value!=='__other__'?{courseId:Number(courseSelect.value)}:{}),...(courseSelect.value==='__other__'?{courseName:courseName.value.trim()}:{}),...(field('rating').value?{rating:Number(field('rating').value)}:{}),...(field('term').value?{term:field('term').value}:{})};
   let message='Simulación completada. No se ha guardado ni publicado ninguna reseña.';
   if(!preview){const response=await fetch('/api/app/profes/reviews/',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok)throw new Error(result.error??'No pudimos recibir la reseña.');message=result.message;}
   confirm.hidden=true;done.hidden=false;find('[data-review-done-title]').textContent=preview?'Prueba del formulario completada':'Reseña recibida';find('[data-review-done-message]').textContent=message;
   try{sessionStorage.removeItem(key);}catch{}done.scrollIntoView({block:'start'});
  }catch(cause){showError(cause instanceof Error&&cause.name==='TimeoutError'?'No pudimos confirmar la recepción. Comprueba la ficha antes de volver a enviar.':cause instanceof Error?cause.message:'No pudimos enviar tu reseña.');}
  finally{sending=false;button.disabled=false;button.removeAttribute('aria-busy');}
 });
 void session();
}
async function initProfileMore(){
 const button=document.querySelector<HTMLButtonElement>('[data-profile-more]'),list=document.querySelector<HTMLElement>('[data-profile-reviews]');
 if(!button||!list||button.dataset.bound)return;button.dataset.bound='true';
 button.addEventListener('click',async()=>{
  if(button.disabled)return;button.disabled=true;const status=document.querySelector<HTMLElement>('[data-profile-status]')!;status.textContent='Cargando reseñas…';
  try{const url=new URL('/api/app/profes/community/',location.origin);url.search=new URLSearchParams({professorId:list.dataset.professorId!,beforeId:button.dataset.cursor!,limit:'12'}).toString();const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const data=await response.json();
   const {reviewCard}=await import('../lib/professor-pages.mjs');const parsed=new DOMParser().parseFromString(data.reviews.map((r:any)=>reviewCard(r,{profile:true})).join(''),'text/html');list.append(...Array.from(parsed.body.children).filter(el=>!el.id||!document.getElementById(el.id)));button.hidden=data.nextCursor===null;if(data.nextCursor)button.dataset.cursor=String(data.nextCursor);status.textContent='Reseñas cargadas.';
  }catch{status.textContent='No pudimos cargar más reseñas. Vuelve a intentarlo.';}finally{button.disabled=false;}
 });
}
initReviewForm();void initProfileMore();document.addEventListener('astro:page-load',()=>{initReviewForm();void initProfileMore();});
