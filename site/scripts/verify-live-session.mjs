import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[new URL('../src/scripts/live-session.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});
let timer,reloads=0,cleared=false;
const events=[],listeners=new Map(),docListeners=new Map();
globalThis.window={setInterval:fn=>{timer=fn;return 1;},clearInterval:()=>{cleared=true;},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),dispatchEvent:event=>events.push(event)};
globalThis.document={visibilityState:'visible',addEventListener:(name,fn)=>docListeners.set(name,fn),removeEventListener:name=>docListeners.delete(name)};
globalThis.location={reload:()=>reloads++};
globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
let value={authenticated:true,email:'fixture-b@example.org',aiReady:true,plan:'free',usage:{remaining:0}};
globalThis.fetch=async()=>({ok:true,json:async()=>value});
const api=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const stop=api.watchLiveCampusSession();await flush();
value={...value,plan:'plus',usage:{remaining:100}};timer();await flush();
assert.equal(events.length,1);assert.equal(events[0].detail.plan,'plus');assert.equal(reloads,0);
value={...value,plan:'free',usage:{remaining:0}};timer();await flush();assert.equal(events.length,2);assert.equal(events[1].detail.plan,'free');assert.equal(reloads,0);
value={...value,accessUnavailable:true};timer();await flush();assert.equal(events.length,2);
value={...value,accessUnavailable:false,email:'other@example.org'};timer();await flush();assert.equal(reloads,1);assert.equal(events.length,2);
stop();assert.equal(cleared,true);assert.equal(listeners.size,0);assert.equal(docListeners.size,0);
console.log('Live plan: same-owner upgrade updates display without reload; outage preserves state; foreign owner reloads; cleanup passed.');

// A failed first lookup must not permanently disable revalidation.
let fetches=0;globalThis.fetch=async()=>{if(++fetches===1)throw Error('offline');return {ok:true,json:async()=>value};};
const retryApi=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text+'\n// retry fixture').toString('base64')}`);
const stopRetry=retryApi.watchLiveCampusSession();await flush();const oldReloads=reloads;timer();await flush();assert.equal(fetches,2);assert.equal(reloads,oldReloads);assert.equal(events.at(-2).type,"campus:session-recovered");assert.equal(events.at(-1).type,"campus:session-updated");stopRetry();
console.log('Live plan: initial connection failure recovers on the next check.');
