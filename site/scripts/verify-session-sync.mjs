import assert from 'node:assert/strict';
import {notifySessionLogout,publishSessionIdentity,watchSessionChanges} from '../src/scripts/session-sync.ts';

const values=new Map(),listeners=new Map(),messages=[];
let denied=false,closed=false,channel;
globalThis.window={
  localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>{
    if(denied)throw Error('Storage blocked');values.set(key,value);
  }},
  addEventListener:(type,listener)=>listeners.set(type,listener),
  removeEventListener:(type,listener)=>{if(listeners.get(type)===listener)listeners.delete(type);},
};
globalThis.BroadcastChannel=class {
  constructor(){channel=this;}
  postMessage(message){messages.push(message);}
  close(){closed=true;}
};
let invalidations=0;
const stop=watchSessionChanges(()=>invalidations++);
const a={authenticated:true,email:'account-a@example.org'};
await publishSessionIdentity(a,()=>true);
assert.equal(messages.length,1);
assert.ok(![...values.values()].join('').includes(a.email));
await publishSessionIdentity(a,()=>true);
assert.equal(messages.length,1,'Same identity must not cause reload loops');
await publishSessionIdentity({authenticated:true,email:'account-b@example.org'},()=>false);
assert.equal(messages.length,1,'Stale session must not announce an identity');
await publishSessionIdentity({authenticated:false,accessUnavailable:true},()=>true);
assert.equal(messages.length,1,'Network failure is not a logout');
await publishSessionIdentity({authenticated:true,email:'account-b@example.org'},()=>true);
assert.equal(messages.length,2);
listeners.get('storage')({key:'unrelated'});
channel.onmessage({data:{type:'unrelated'}});
assert.equal(invalidations,0);
listeners.get('storage')({key:'campus-session-revision-v1'});
channel.onmessage({data:{type:'session-changed'}});
assert.equal(invalidations,2);
values.set('campus-session-revision-v1','corrupt');
await publishSessionIdentity(a,()=>true);
assert.equal(messages.length,3);
denied=true;
notifySessionLogout();
assert.equal(messages.length,4,'Logout must broadcast even when storage is blocked');
assert.deepEqual(messages,Array(4).fill({type:'session-changed'}));
stop();assert.equal(listeners.size,0);assert.equal(closed,true);
console.log('Session sync: identity changes, no reload loops, stale/network responses, storage fallback, payload privacy and cleanup passed.');
