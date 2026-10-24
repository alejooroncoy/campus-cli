import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keepBothOperation} from '../src/lib/library-versions.ts';
test('keep-both retries survive reopen, new work pointers and changed editor steps',async()=>{
 const files=[new File(['PDF A'],'a.pdf'),new File(['PDF B'],'b.pdf')];
 const snapshot={fields:{title:'',score:'18',feedback:'A'},criteria:[{name:'',comment:'Incomplete rubric'}],current:{id:'old',revision:1},stage:2,requestId:'old'};
 const first=await keepBothOperation(snapshot,files);
 const reopened={...snapshot,current:null,stage:1,requestId:'new'};
 assert.deepEqual(await keepBothOperation(reopened,files,JSON.parse(JSON.stringify(first))),first);
});
test('same filename and size never hide changed content; changed metadata has a fresh retry identity',async()=>{
 const snapshot={fields:{title:'T',score:'18'},criteria:[]},file=new File(['AAA'],'a.pdf');
 const first=await keepBothOperation(snapshot,[file]);
 for(const [value,files] of [[snapshot,[new File(['BBB'],'a.pdf')]],[{...snapshot,fields:{...snapshot.fields,score:'19'}},[file]],[{...snapshot,criteria:[{comment:'changed'}]},[file]],[snapshot,[]]]){
  const next=await keepBothOperation(value,files,first);assert.notEqual(next.id,first.id);assert.notEqual(next.signature,first.signature);
 }
});
