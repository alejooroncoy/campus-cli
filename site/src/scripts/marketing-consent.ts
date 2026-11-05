type Preference = { consent:boolean; version:1; observedAt:number; fbc?:string; fbp?:string };
const storageKey='campus_marketing_v1', cookie='campus_marketing', ttl=30*86400_000;
let pending: Promise<void> | undefined;
let landingClick: string | undefined;
let syncAgain=false;
export function metaClickId(search: string): string | undefined {
  const values=new URLSearchParams(search).getAll('fbclid');
  return values.length===1 && /^[A-Za-z0-9_-]{1,256}$/.test(values[0]) ? values[0] : undefined;
}
function read(): Preference | undefined {
  try {
    const p=JSON.parse(localStorage.getItem(storageKey)??'null');
    if(p?.version!==1 || typeof p.consent!=='boolean' || !Number.isSafeInteger(p.observedAt)
      || p.observedAt>Date.now() || p.observedAt<=Date.now()-ttl)return;
    return p;
  } catch { return; }
}
function write(p:Preference) {
  localStorage.setItem(storageKey,JSON.stringify(p));
  document.cookie=`${cookie}=${encodeURIComponent(JSON.stringify(p))}; Path=/api/app/; Max-Age=${Math.max(0,Math.floor((p.observedAt+ttl-Date.now())/1000))}; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;
}
export function clearMarketingPreference() {
  landingClick=undefined;
  try {
    localStorage.removeItem(storageKey);
    document.cookie=`${cookie}=; Path=/api/app/; Max-Age=0; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;
  } catch { /* Logout does not depend on optional storage. */ }
  document.dispatchEvent(new Event('campus:marketing-reset'));
}
export function syncMarketingPreference(): Promise<void> {
  if(pending){syncAgain=true;return pending;}
  pending=(async()=>{
    const p=read();if(!p)return;
    try {
      await fetch('/api/app/marketing',{method:'POST',credentials:'same-origin',keepalive:true,
        headers:{'content-type':'application/json'},body:JSON.stringify(p),signal:AbortSignal.timeout(8000)});
    } catch { /* The cookie is also read during OAuth and checkout. */ }
  })().finally(()=>{pending=undefined;if(syncAgain){syncAgain=false;void syncMarketingPreference();}});
  return pending;
}
export function setupMarketingConsent() {
  if(typeof window==='undefined')return;
  const mount=()=>{
    landingClick=metaClickId(location.search)??landingClick;
    const panel=document.querySelector<HTMLElement>('[data-marketing-consent]');
    if(!panel)return;
    const choose=(consent:boolean)=>{
      const p:Preference={consent,version:1,observedAt:Date.now()};
      if(consent){
        p.fbp=read()?.fbp??`fb.1.${Date.now()}.${crypto.getRandomValues(new Uint32Array(1))[0]}`;
        p.fbc=landingClick?`fb.1.${Date.now()}.${landingClick}`:read()?.fbc;
        landingClick=undefined;
      }
      try { write(p); panel.hidden=true; void syncMarketingPreference(); }
      catch { panel.hidden=true; } // Storage denied: no permission is persisted or sent.
    };
    if((navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl===true){choose(false);return;}
    const existing=read();
    if(existing){
      if(existing.consent && landingClick){existing.fbc=`fb.1.${Date.now()}.${landingClick}`;landingClick=undefined;}
      try { write(existing); } catch { /* Optional storage. */ }
    }
    // Offer on public pages before acquisition. Do not cover the assistant,
    // payment controls or support feedback while someone is using the app.
    // The explicit Privacy control can always open the preference panel.
    panel.hidden=Boolean(existing)||location.pathname.startsWith('/app/');
    if(!panel.dataset.bound){
      panel.dataset.bound='true';
      panel.querySelector('[data-marketing-accept]')?.addEventListener('click',()=>choose(true));
      panel.querySelector('[data-marketing-reject]')?.addEventListener('click',()=>choose(false));
    }
    document.querySelectorAll<HTMLElement>('[data-marketing-settings]').forEach(button=>{
      if(button.dataset.bound)return;button.dataset.bound='true';
      button.addEventListener('click',()=>{panel.hidden=false;panel.querySelector<HTMLButtonElement>('button')?.focus();});
    });
  };
  mount();document.addEventListener('astro:page-load',mount);
  document.addEventListener('campus:marketing-reset',mount);
}
