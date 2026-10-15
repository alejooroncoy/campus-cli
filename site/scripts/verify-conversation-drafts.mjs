import assert from 'node:assert/strict';
import {createConversationDrafts,restoreConversationDrafts,CONVERSATION_DRAFTS_KEY,markGuestDraftHandoff,GUEST_DRAFT_HANDOFF_KEY} from '../src/scripts/conversation-drafts.ts';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const values=new Map();
const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
let drafts=createConversationDrafts('account:fixture@example.org',storage);
drafts.set(a,'Borrador A');drafts.set(b,'Borrador B');drafts.set(null,'Consulta nueva');
drafts=createConversationDrafts('account:fixture@example.org',storage); // Reload or return from Inicio.
assert.equal(drafts.get(a),'Borrador A');assert.equal(drafts.get(b),'Borrador B');assert.equal(drafts.get(null),'Consulta nueva');
drafts.set(a,'');assert.equal(createConversationDrafts('account:fixture@example.org',storage).get(a),'');
assert.equal(createConversationDrafts('account:other@example.org',storage).get(b),'');
assert.equal(createConversationDrafts('guest',storage).get(b),'');
assert.equal(createConversationDrafts(null,storage).get(b),'');
const before=storage.getItem(CONVERSATION_DRAFTS_KEY);
const unknown=createConversationDrafts(null,storage);unknown.set(b,'Memory only');assert.equal(storage.getItem(CONVERSATION_DRAFTS_KEY),before);
const denied={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('full');}};
const memory=createConversationDrafts('guest',denied);memory.set(a,'Still editable');assert.equal(memory.get(a),'Still editable');
values.set(CONVERSATION_DRAFTS_KEY,'malformed');assert.equal(createConversationDrafts('guest',storage).get(a),'');
values.set(CONVERSATION_DRAFTS_KEY,JSON.stringify({owner:'guest',entries:[[a,17],['__proto__','bad'],[b,'x'.repeat(2001)],[null,'bad']]}));
assert.equal(createConversationDrafts('guest',storage).get(a),'');assert.equal(createConversationDrafts('guest',storage).get(b),'');
console.log('Conversation drafts: reload, Inicio return, distinct chats/new draft, account isolation, cleared drafts and denied/corrupt storage passed.');

values.clear();
const ownedA=createConversationDrafts('account:a',storage);ownedA.set(a,'Private A');
assert.equal(restoreConversationDrafts('account:b',storage,ownedA,true,a,'Private A').get(a),'');
const initial=createConversationDrafts();
assert.equal(restoreConversationDrafts('account:b',storage,initial,false,a,'Browser-restored private A').get(a),'');
initial.set(a,'Actually typed before session loaded');
assert.equal(restoreConversationDrafts('account:b',storage,initial,true,a,'Actually typed before session loaded').get(a),'Actually typed before session loaded');
console.log('Account changes: old owned memory and browser-restored fields cannot become another account draft; genuine pending edits are preserved.');

values.clear();
const guestDrafts=createConversationDrafts('guest',storage);guestDrafts.set(null,'Guest question before sign-in');
assert.equal(restoreConversationDrafts('account:new',storage,createConversationDrafts(),false,null,'').get(null),'');
markGuestDraftHandoff(storage);
assert.equal(restoreConversationDrafts('account:new',storage,createConversationDrafts(),false,null,'').get(null),'Guest question before sign-in');
assert.equal(storage.getItem(GUEST_DRAFT_HANDOFF_KEY),'null');
assert.equal(restoreConversationDrafts('account:other',storage,createConversationDrafts(),false,null,'').get(null),'');
values.clear();const privateDrafts=createConversationDrafts('account:old',storage);privateDrafts.set(null,'Private old account');markGuestDraftHandoff(storage);
assert.equal(restoreConversationDrafts('account:new',storage,createConversationDrafts(),false,null,'').get(null),'');
console.log('Guest sign-in: explicit same-tab handoff preserves the question once; unmarked guests and foreign account drafts never migrate.');

values.clear();const lockedGuest=createConversationDrafts('guest',storage);lockedGuest.set(null,'Guest private question');markGuestDraftHandoff(storage);
const consumptionDenied={getItem:storage.getItem,setItem:()=>{throw Error('Storage blocked');}};
assert.equal(restoreConversationDrafts('account:new',consumptionDenied,createConversationDrafts(),false,null,'').get(null),'');
console.log('Guest handoff fails closed when its one-time marker cannot be consumed.');
