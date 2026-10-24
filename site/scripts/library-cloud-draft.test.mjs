import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CloudDraftQueue, chooseCloudRecovery } from '../src/lib/library-cloud-draft.ts';
const copy=(revision,attempt)=>({scope:'account',revision,mutationId:attempt.mutationId,updatedAt:new Date().toISOString(),snapshot:attempt.snapshot,files:[]});
function queue(send,initial=0){const events=[];const q=new CloudDraftQueue(initial,send,{before:()=>events.push('before'),saved:c=>events.push(c.revision),failed:e=>{events.push('failed');if(e.status===409)q.paused=true}});return {q,events};}
test('only one mutation is in flight; newer typing retains uploaded files without reuploading',async()=>{
 let release;const blocked=new Promise(resolve=>{release=resolve}),sent=[];
 const {q}=queue(async attempt=>{sent.push(attempt);if(sent.length===1)await blocked;return copy(sent.length,attempt)});
 q.update({title:'A'},[new File(['file'],'work.pdf')]);const saving=q.flush();
 q.update({title:'B'});release();await saving;
 assert.equal(sent.length,2);assert.equal(sent[0].revision,0);assert.equal(sent[1].revision,1);assert.equal(sent[1].files,undefined);assert.equal(q.dirty,false);
});
test('lost response retries the same mutation before sending later edits',async()=>{
 const sent=[];let fail=true;const {q}=queue(async attempt=>{sent.push(attempt);if(fail){fail=false;throw new Error('offline')}return copy(sent.length,attempt)});
 q.update({title:'A'},[]);await assert.rejects(q.flush(),/offline/);assert.equal(q.dirty,true);
 q.update({title:'B'});await q.flush();
 assert.equal(sent.length,3);assert.equal(sent[0].mutationId,sent[1].mutationId);assert.equal(sent[2].snapshot.title,'B');assert.equal(q.dirty,false);
});
test('a concurrent-device conflict pauses writes until an explicit rebase',async()=>{
 let conflict=true;const sent=[];const {q}=queue(async attempt=>{sent.push(attempt);if(conflict)throw Object.assign(new Error('conflict'),{status:409});return copy(attempt.revision+1,attempt)},2);
 q.update({title:'Mine'},[new File(['x'],'x.pdf')]);await assert.rejects(q.flush(),/conflict/);
 assert.equal(q.paused,true);await assert.rejects(q.flush(),/conflicto/);assert.equal(sent.length,1);
 conflict=false;q.rebase(4);await q.flush();assert.equal(sent[1].revision,4);assert.equal(sent[1].files[0].name,'x.pdf');assert.equal(q.revision,5);
});
test('discard follows an in-flight save and writes a tombstone instead of resurrecting the editor',async()=>{
 let release;const blocked=new Promise(resolve=>{release=resolve}),sent=[];
 const {q}=queue(async attempt=>{sent.push(attempt);if(sent.length===1)await blocked;return copy(sent.length,attempt)});
 q.update({title:'A'},[new File(['file'],'work.pdf')]);const saving=q.flush();const discarding=q.discard();release();await saving;await discarding;
 assert.equal(sent.length,2);assert.equal(sent[1].snapshot,null);assert.deepEqual(sent[1].files,[]);assert.equal(q.dirty,false);
});
test('definitively invalid files can be replaced instead of retrying the rejected payload forever',async()=>{
 let invalid=true;const sent=[];const {q}=queue(async attempt=>{sent.push(attempt);if(invalid)throw Object.assign(new Error('invalid'),{status:400});return copy(1,attempt)});
 q.update({title:'A'},[new File(['bad'],'bad.pdf')]);await assert.rejects(q.flush(),/invalid/);invalid=false;
 q.update({title:'fixed'},[new File(['ok'],'good.pdf')]);await q.flush();assert.equal(sent[1].files[0].name,'good.pdf');assert.notEqual(sent[0].mutationId,sent[1].mutationId);
});
test('recovery reconciliation uses revision ancestry and mutation acknowledgment, never device clocks',()=>{
 assert.equal(chooseCloudRecovery(null,{revision:8,mutationId:'x'}),'remote');
 assert.equal(chooseCloudRecovery({cloudRevision:8,cloudDirty:true},{revision:8,mutationId:'x'}),'local');
 assert.equal(chooseCloudRecovery({cloudRevision:7,cloudDirty:true,cloudMutation:'x'},{revision:8,mutationId:'x'}),'local');
 assert.equal(chooseCloudRecovery({cloudRevision:7,cloudDirty:true},{revision:8,mutationId:'x'}),'conflict');
 assert.equal(chooseCloudRecovery({cloudRevision:7,cloudDirty:false},{revision:8,mutationId:'x'}),'remote');
 assert.equal(chooseCloudRecovery({cloudRevision:7,cloudDirty:false},{revision:0,mutationId:null}),'conflict');
 assert.equal(chooseCloudRecovery({},{revision:1,mutationId:'x'}),'conflict');
});

test('a pending discard resumes without resurrecting fields, while preserving a later version from another device',()=>{
 assert.equal(chooseCloudRecovery({cloudRevision:4,cloudMutation:'delete',cloudDirty:true,cloudDiscarded:true},{revision:4,mutationId:'old'}),'discard');
 assert.equal(chooseCloudRecovery({cloudRevision:4,cloudMutation:'delete',cloudDirty:true,cloudDiscarded:true},{revision:5,mutationId:'delete'}),'discard');
 assert.equal(chooseCloudRecovery({cloudRevision:4,cloudMutation:'delete',cloudDirty:true,cloudDiscarded:true},{revision:6,mutationId:'another-device'}),'remote');
});
