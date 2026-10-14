import type {CampusSession} from './campus-session';
const KEY='campus-session-revision-v1';
const CHANNEL='campus-session-events-v1';
let channel:BroadcastChannel|undefined;

function broadcast() {
  try { channel?.postMessage({type:'session-changed'}); } catch { /* Storage events remain available. */ }
}
export function notifySessionLogout() {
  try { window.localStorage.setItem(KEY,JSON.stringify({identity:'guest',revision:crypto.randomUUID()})); } catch { /* BroadcastChannel is the fallback. */ }
  broadcast();
}
export async function publishSessionIdentity(session:CampusSession, current:()=>boolean) {
  try {
    if(session.accessUnavailable)return;
    const owner=session.authenticated ? session.email?.toLowerCase() : 'guest';
    if(!owner || typeof window==='undefined' || !('localStorage' in window))return;
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner));
    const identity=session.authenticated ? [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('') : 'guest';
    if(!current())return;
    let old:{identity?:string}|null=null;
    try { old=JSON.parse(window.localStorage.getItem(KEY)??'null'); } catch { /* Replace an invalid revision. */ }
    if(old?.identity===identity)return;
    window.localStorage.setItem(KEY,JSON.stringify({identity,revision:crypto.randomUUID()}));
    broadcast();
  } catch { /* Synchronization never grants access or blocks session loading. */ }
}

export function watchSessionChanges(invalidate:()=>void) {
  const storage=(event:StorageEvent)=>{if(event.key===KEY)invalidate();};
  window.addEventListener('storage',storage);
  try {
    channel=new BroadcastChannel(CHANNEL);
    channel.onmessage=event=>{if(event.data?.type==='session-changed')invalidate();};
  } catch { /* Storage events still synchronize ordinary tabs. */ }
  return ()=>{window.removeEventListener('storage',storage);channel?.close();channel=undefined;};
}
