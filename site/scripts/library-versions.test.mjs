import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keepBothOperation} from '../src/lib/library-versions.ts';
import {watchLibraryVersions} from '../src/lib/library-version-sync.ts';
test('keep-both retries survive reopen, new work pointers and changed editor steps',async()=>{
 const files=[new File(['PDF A'],'a.pdf'),new File(['PDF B'],'b.pdf')];
 const snapshot={fields:{title:'',score:'18',feedback:'A'},criteria:[{name:'',comment:'Incomplete rubric'}],current:{id:'old',revision:1},stage:2,requestId:'old'};
 const first=await keepBothOperation(snapshot,files);
 const reopened={...snapshot,current:null,stage:1,requestId:'new'};
 assert.deepEqual(await keepBothOperation(reopened,files,JSON.parse(JSON.stringify(first))),first);
});

const settle=()=>new Promise(resolve=>setImmediate(resolve));
function syncing(refresh) {
 const window=new EventTarget(),document=new EventTarget();
 let allowed=true,tick, timers=0;
 const sync=watchLibraryVersions({window,document,active:()=>allowed,refresh,interval:callback=>{
  tick=callback;timers++;return ()=>{tick=undefined;timers--;};
 }});
 return {window,document,sync,allow:value=>{allowed=value;},tick:()=>tick?.(),timers:()=>timers};
}
test('a device reconnect reads deletions without writing its original draft or files',async()=>{
 const original={fields:{score:'18',feedback:'Feedback original'},criteria:[{name:'Modelado',score:'6'}],files:[new File(['PDF original'],'original.pdf')]};
 const before=JSON.stringify(original);
 let server=['copy'],visible=['copy'],reads=0;
 const s=syncing(async()=>{reads++;visible=[...server];});
 s.allow(false);server=[];
 s.tick();s.window.dispatchEvent(new Event('focus'));await settle();
 assert.deepEqual(visible,['copy']);assert.equal(reads,0);
 s.allow(true);s.window.dispatchEvent(new Event('online'));await settle();
 assert.deepEqual(visible,[]);assert.equal(reads,1);
 s.tick();s.document.dispatchEvent(new Event('visibilitychange'));await settle();
 assert.deepEqual(visible,[]);assert.equal(JSON.stringify(original),before);
 assert.equal(await original.files[0].text(),'PDF original');s.sync.stop();
});
test('concurrent notifications serialize reads and request the latest list after an older response',async()=>{
 let unblock,reads=0,visible;
 const blocked=new Promise(resolve=>{unblock=resolve;});
 const s=syncing(async()=>{const n=++reads;if(n===1)await blocked;visible=n;});
 s.window.dispatchEvent(new Event('online'));s.window.dispatchEvent(new Event('focus'));s.tick();
 assert.equal(reads,1);unblock();await settle();
 assert.equal(reads,2);assert.equal(visible,2);s.sync.stop();
});
test('failed reads retry, background pages do not poll and returning pages refresh immediately',async()=>{
 let reads=0;
 const s=syncing(async()=>{if(++reads===1)throw new Error('offline');});
 s.tick();await settle();s.tick();await settle();assert.equal(reads,2);
 s.window.dispatchEvent(new Event('pagehide'));assert.equal(s.timers(),0);
 s.tick();await settle();assert.equal(reads,2);
 s.window.dispatchEvent(new Event('pageshow'));await settle();assert.equal(reads,3);assert.equal(s.timers(),1);
 s.sync.stop();s.window.dispatchEvent(new Event('online'));s.window.dispatchEvent(new Event('pageshow'));s.sync.refresh();await settle();
 assert.equal(s.timers(),0);assert.equal(reads,3);
});
test('same filename and size never hide changed content; changed metadata has a fresh retry identity',async()=>{
 const snapshot={fields:{title:'T',score:'18'},criteria:[]},file=new File(['AAA'],'a.pdf');
 const first=await keepBothOperation(snapshot,[file]);
 for(const [value,files] of [[snapshot,[new File(['BBB'],'a.pdf')]],[{...snapshot,fields:{...snapshot.fields,score:'19'}},[file]],[{...snapshot,criteria:[{comment:'changed'}]},[file]],[snapshot,[]]]){
  const next=await keepBothOperation(value,files,first);assert.notEqual(next.id,first.id);assert.notEqual(next.signature,first.signature);
 }
});
