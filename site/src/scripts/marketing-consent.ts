type Preference = { consent:boolean; version:1; observedAt:number; fbc?:string; fbp?:string };
const storageKey='campus_marketing_v1', cookie='campus_marketing', ttl=30*86400_000;
let pending: Promise<void> | undefined;
let landingClick: string | undefined;
let syncAgain=false;
let generation=0;
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
  generation++;
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
// Account settings return only the choice and its lifetime, never Meta matching IDs.
export async function accountMarketingPreference(): Promise<boolean> {
  const owner=generation;
  const response=await fetch('/api/app/marketing',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('MARKETING_PREFERENCE_UNAVAILABLE');
  const data=await response.json();
  if(typeof data.enabled!=='boolean')throw Error('INVALID_MARKETING_PREFERENCE');
  const existing=read();
  if(owner===generation && Number.isSafeInteger(data.observedAt) && Number.isSafeInteger(data.expiresAt)
    && data.observedAt<=Date.now()+60000 && data.expiresAt>Date.now()
    && (!existing || data.observedAt>=existing.observedAt)) {
    const p:Preference={consent:data.enabled,version:1,observedAt:data.observedAt};
    if(p.consent && existing?.consent){p.fbc=existing.fbc;p.fbp=existing.fbp;}
    try { write(p); } catch { /* Account choice remains available without local storage. */ }
  }
  return data.enabled;
}
export async function setAccountMarketingPreference(consent:boolean): Promise<void> {
  if(consent && (navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl===true)
    throw Error('MARKETING_DISABLED_BY_BROWSER');
  const owner=generation,p:Preference={consent,version:1,observedAt:Date.now()};
  if(consent){
    p.fbp=read()?.fbp??`fb.1.${Date.now()}.${crypto.getRandomValues(new Uint32Array(1))[0]}`;
    p.fbc=landingClick?`fb.1.${Date.now()}.${landingClick}`:read()?.fbc;
  }
  const response=await fetch('/api/app/marketing',{method:'POST',credentials:'same-origin',
    headers:{'content-type':'application/json'},body:JSON.stringify(p),signal:AbortSignal.timeout(8000)});
  if(response.status!==200)throw Error('MARKETING_PREFERENCE_NOT_SAVED');
  if(owner!==generation)return; // A request started before logout cannot restore browser consent.
  landingClick=undefined;
  try { write(p); } catch { /* The account choice was saved; browser storage is optional. */ }
}
export function setupMarketingConsent() {
  if(typeof window==='undefined')return;
  const mount=()=>{
    landingClick=metaClickId(location.search)??landingClick;
    if((navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl===true){
      try { write({consent:false,version:1,observedAt:Date.now()}); void syncMarketingPreference(); } catch { /* Optional storage. */ }
      return;
    }
    const existing=read();
    if(existing){
      if(existing.consent && landingClick){existing.fbc=`fb.1.${Date.now()}.${landingClick}`;landingClick=undefined;}
      try { write(existing); } catch { /* Optional storage. */ }
    }
  };
  mount();document.addEventListener('astro:page-load',mount);
  document.addEventListener('campus:marketing-reset',mount);
}
