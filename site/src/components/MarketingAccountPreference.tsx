import {useEffect,useId,useRef,useState} from 'react';
import {getCampusSession,type CampusSession} from '../scripts/campus-session';
import {accountMarketingPreference,setAccountMarketingPreference} from '../scripts/marketing-consent';

export default function MarketingAccountPreference(){
  const [value,setValue]=useState<boolean|null>(null),[saving,setSaving]=useState(false),[status,setStatus]=useState('');
  const [guest,setGuest]=useState(false),[blocked,setBlocked]=useState(false),[retry,setRetry]=useState(0);
  const generation=useRef(0),id=useId();
  useEffect(()=>{
    let owner:string|null=null;
    async function refresh(session:CampusSession){
      if(session.accessUnavailable)return;
      const next=session.authenticated?(session.analyticsId??session.email?.toLowerCase()??'account'):null;
      if(owner===next&&next)return;owner=next;const version=++generation.current;
      setGuest(!session.authenticated);setValue(null);setSaving(false);setStatus('');
      if(!session.authenticated)return;
      const gpc=(navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl===true;
      setBlocked(gpc);
      try{
        const enabled=await accountMarketingPreference();
        if(version===generation.current)setValue(gpc?false:enabled);
      }catch{if(version===generation.current)setStatus('No pudimos consultar tu preferencia. Vuelve a intentarlo.');}
    }
    const current=generation.current;
    void getCampusSession().then(refresh).catch(()=>{if(current===generation.current)setStatus('No pudimos comprobar tu cuenta. Vuelve a intentarlo.');});
    const update=(event:Event)=>void refresh((event as CustomEvent<CampusSession>).detail);
    window.addEventListener('campus:session-updated',update);
    return()=>{generation.current++;window.removeEventListener('campus:session-updated',update);};
  },[retry]);
  if(guest)return null;
  return <section className="app-panel app-account-preference app-marketing-preference" id="privacidad" aria-labelledby="marketing-preference-title">
    <h2 id="marketing-preference-title">Privacidad</h2>
    <label className="app-account-preference__choice" htmlFor={id}>
      <span>Medición de anuncios</span>
      <input id={id} type="checkbox" role="switch" aria-describedby={`${id}-details`} checked={value===true} disabled={value===null||saving||blocked} onChange={async event=>{
        const enabled=event.target.checked,previous=value,version=generation.current;
        setValue(enabled);setSaving(true);setStatus('');
        try{
          await setAccountMarketingPreference(enabled);
          if(version===generation.current)setStatus(enabled?'Medición activada.':'Medición desactivada.');
        }catch{if(version===generation.current){setValue(previous);setStatus('No pudimos guardar el cambio. Inténtalo nuevamente.');}}
        finally{if(version===generation.current)setSaving(false);}
      }}/>
    </label>
    <p id={`${id}-details`}>Permite compartir con Meta tu registro y los pasos de compra de Plus para medir nuestros anuncios. Tus datos académicos quedan fuera.</p>
    <p className="app-account-preference__note">Opcional. Puedes cambiarlo cuando quieras. <a className="app-text-link" href="/privacidad/#anuncios">Más información</a></p>
    <p role="status" aria-live="polite">{blocked?'Tu navegador ha pedido desactivar esta medición.':status||(value===null?'Consultando tu preferencia…':saving?'Guardando…':value?'Activada':'Desactivada')}</p>
    {value===null&&status?<button className="app-button app-button--secondary" type="button" onClick={()=>setRetry(n=>n+1)}>Volver a intentar</button>:null}
  </section>;
}
