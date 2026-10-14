import {getCampusSession,clearCampusSession,type CampusSession} from './campus-session';

const owner=(session:CampusSession)=>session.authenticated ? session.email?.toLowerCase() : 'guest';

// Revalidate server entitlements without replacing the chat or its draft.
// Cross-account updates must still clear private display state through reload.
export function watchLiveCampusSession(intervalMs=15000) {
  let stopped=false,pending=false;
  let previous:CampusSession|undefined;
  void getCampusSession().then(value=>{previous=value;}).catch(()=>{});
  const refresh=async()=>{
    if(stopped||pending||!previous)return;
    pending=true;
    try {
      const value=await getCampusSession(true);
      if(stopped||value.accessUnavailable)return;
      if(!owner(value)||owner(value)!==owner(previous)){
        clearCampusSession(false);
        location.reload();
        return;
      }
      previous=value;
      window.dispatchEvent(new CustomEvent('campus:session-updated',{detail:value}));
    } catch { /* Keep the draft and last display; server authorization stays authoritative. */ }
    finally { pending=false; }
  };
  const visible=()=>{if(document.visibilityState==='visible')void refresh();};
  const timer=window.setInterval(()=>void refresh(),intervalMs);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',visible);
  return ()=>{
    stopped=true;window.clearInterval(timer);
    window.removeEventListener('focus',refresh);
    document.removeEventListener('visibilitychange',visible);
  };
}
