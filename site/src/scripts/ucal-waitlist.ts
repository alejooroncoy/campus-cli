async function requestNotice(body:Record<string,unknown>){
  const response=await fetch('/api/ucal-waitlist',{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.ok!==true)throw Error(typeof data?.error==='string'?data.error:'No pudimos completar la solicitud. Inténtalo nuevamente.');
}
const form=document.querySelector<HTMLFormElement>('[data-ucal-signup]');
if(form){
  const button=form.querySelector<HTMLButtonElement>('[data-ucal-submit]')!;
  const status=form.querySelector<HTMLElement>('[data-ucal-status]')!;
  const pending=document.querySelector<HTMLElement>('[data-ucal-pending]')!;
  button.disabled=false;
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(button.disabled)return;
    const data=new FormData(form);
    button.disabled=true;status.textContent='Enviando confirmación…';
    try{
      await requestNotice({action:'subscribe',email:data.get('email'),consent:data.get('consent')==='on'?'ucal-availability-v1':null,website:data.get('website')??''});
      form.hidden=true;pending.hidden=false;form.reset();
      pending.setAttribute('tabindex','-1');pending.focus();
    }catch(error){status.textContent=error instanceof Error?error.message:'No pudimos completar la solicitud.';}
    finally{button.disabled=false;}
  });
  document.querySelector('[data-ucal-retry]')?.addEventListener('click',()=>{pending.hidden=true;form.hidden=false;status.textContent='';form.querySelector<HTMLInputElement>('[name="email"]')?.focus();});
}
const notice=document.querySelector<HTMLElement>('[data-ucal-notice]');
if(notice){
  const params=new URLSearchParams(location.search),action=params.get('action'),token=params.get('token');
  history.replaceState(null,'',location.pathname);
  const button=notice.querySelector<HTMLButtonElement>('[data-notice-action]')!;
  const title=notice.querySelector<HTMLElement>('[data-notice-title]')!;
  const description=notice.querySelector<HTMLElement>('[data-notice-description]')!;
  const status=notice.querySelector<HTMLElement>('[data-notice-status]')!;
  const valid=action==='confirm'?/^[A-Za-z0-9_-]{43}$/.test(token??''):action==='unsubscribe'?/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(token??''):false;
  if(valid){
    title.textContent=action==='confirm'?'Confirma tu correo.':'¿Quieres retirar tu inscripción?';
    description.textContent=action==='confirm'?'Confirma para que podamos avisarte cuando puedas empezar en Campus con tu acceso UPC.':'Eliminaremos tu correo de esta lista y no recibirás el aviso.';
    button.textContent=action==='confirm'?'Confirmar mi correo':'Eliminar mi inscripción';button.hidden=false;
    button.addEventListener('click',async()=>{
      button.disabled=true;status.textContent='Procesando…';
      try{await requestNotice({action,token});button.hidden=true;status.textContent='';title.textContent=action==='confirm'?'Listo. Estás en la lista.':'Tu inscripción fue eliminada.';description.textContent=action==='confirm'?'Te avisaremos a ese correo cuando puedas empezar en Campus con tu acceso UPC. Puedes darte de baja desde el enlace de nuestros correos.':'No recibirás el aviso de esta lista.';}
      catch(error){status.textContent=error instanceof Error?error.message:'No pudimos completar la solicitud.';button.disabled=false;}
    });
  }
}
