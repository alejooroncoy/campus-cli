import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LibraryDraftStore, DraftConflictError, libraryDraftKey } from '../src/lib/library-draft.ts';
function fixture() {
 const data = new Map(), blobs = new Map();
 const storage = { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value), removeItem: key => data.delete(key) };
 let writes=0;
 const files={ read:async key=>blobs.get(key), write:async(key,value)=>{writes++;blobs.set(key,value)}, remove:async key=>{blobs.delete(key)} };
 return {data, blobs, storage, files, get writes(){return writes}, open:(key='account-a')=>new LibraryDraftStore(key,storage,files)};
}
test('incomplete raw input is committed before an async save resolves; files are reusable after reopening',async()=>{
 const f=fixture(), a=f.open(); await a.load();
 const file=new File(['example'], 'trabajo.pdf', {type:'application/pdf',lastModified:123});
 const incomplete={fields:{title:'Mi',summary:'',score:'0',maxScore:''},criteria:[{name:'',score:'0',maxScore:'',comment:'a medias'}],stage:2};
 const pending=a.save(incomplete,[file]);
 assert.deepEqual(JSON.parse(f.data.get('account-a')).snapshot,incomplete);
 await pending;
 for(let n=0;n<10;n++)await a.save({...incomplete,fields:{...incomplete.fields,title:'Mi '+n}});
 assert.equal(f.writes,1,'typing does not rewrite file blobs');
 const recovered=await f.open().load();
 assert.equal(recovered.snapshot.fields.title,'Mi 9');assert.equal(recovered.snapshot.fields.score,'0');
 assert.equal(recovered.snapshot.criteria[0].comment,'a medias');assert.equal(recovered.snapshot.stage,2);
 assert.equal(recovered.filesMissing,false);assert.equal(await recovered.files[0].text(),'example');
});
test('account keys are stable, distinct and do not expose the account email',async()=>{
 const a=await libraryDraftKey(' Student@Example.com '), b=await libraryDraftKey('other@example.com');
 assert.equal(a,await libraryDraftKey('student@example.com'));assert.notEqual(a,b);assert.ok(!a.includes('student'));
 const f=fixture();await f.open(a).load();await f.open(a).save({title:'Privado'});
 assert.equal(await f.open(b).load(),null);
});
test('another tab cannot overwrite or discard newer recovery data without explicit takeover',async()=>{
 const f=fixture(),a=f.open(),b=f.open();await a.load();await b.load();
 await a.save({title:'Tab A'});
 assert.throws(()=>b.save({title:'Tab B'}),DraftConflictError);assert.throws(()=>b.clear(),DraftConflictError);
 assert.equal((await f.open().load()).snapshot.title,'Tab A');
 await b.save({title:'Tab B'},[],true);
 assert.throws(()=>a.save({title:'old'}),DraftConflictError);
 assert.equal((await f.open().load()).snapshot.title,'Tab B');
});
test('clearing during a pending file write never resurrects the draft',async()=>{
 const f=fixture();let release;const blocked=new Promise(resolve=>{release=resolve});
 const a=new LibraryDraftStore('account-a',f.storage,{...f.files,write:async(key,value)=>{await blocked;await f.files.write(key,value)}});
 await a.load();const saving=a.save({title:'Discard me'},[new File(['a'],'a.pdf')]);
 const clearing=a.clear();assert.equal(f.storage.getItem('account-a'),null);release();await saving;await clearing;
 assert.equal(await f.open().load(),null);assert.equal(f.blobs.size,0);
});
test('quota errors are surfaced; text survives a failed or missing file write without claiming file recovery',async()=>{
 const f=fixture(),failed=new LibraryDraftStore('account-a',f.storage,{...f.files,write:async()=>{throw new Error('QuotaExceededError')}});
 await failed.load();await assert.rejects(failed.save({title:'Keep this text'},[new File(['a'],'a.pdf')]),/Quota/);
 const recovered=await f.open().load();assert.equal(recovered.snapshot.title,'Keep this text');assert.equal(recovered.filesMissing,true);assert.deepEqual(recovered.files,[]);
 const denied=new LibraryDraftStore('denied',{...f.storage,setItem:()=>{throw new Error('Denied')}},f.files);await denied.load();assert.throws(()=>denied.save({title:'x'}),/Denied/);
});
test('a fresh server-backed draft can drop local files and clear safely without a later resurrection',async()=>{
 const f=fixture(),a=f.open();await a.load();await a.save({current:null},[new File(['a'],'a.pdf')]);
 await a.save({current:{id:'saved',revision:2},stage:3},[]);
 const restored=await f.open().load();assert.equal(restored.snapshot.current.revision,2);assert.deepEqual(restored.files,[]);assert.equal(f.blobs.size,0);
 await a.clear();assert.equal(await f.open().load(),null);
});

test('late file completion from another tab cannot replace the file referenced by the newest draft',async()=>{
 const f=fixture();let release;const blocked=new Promise(resolve=>{release=resolve});
 const a=new LibraryDraftStore('account-a',f.storage,{...f.files,write:async(key,value)=>{await blocked;await f.files.write(key,value)}});
 await a.load();const first=a.save({title:'A'},[new File(['A'],'a.pdf')]);
 const b=f.open();await b.load();await b.save({title:'B'},[new File(['B'],'b.pdf')]);
 release();await first;
 const recovered=await f.open().load();assert.equal(recovered.snapshot.title,'B');assert.equal(await recovered.files[0].text(),'B');
});
