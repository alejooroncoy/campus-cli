import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTurnitinRequest } from '../src/scripts/turnitin-request.ts';
function fixture() {
  const input = Object.assign(new EventTarget(), { files: [] });
  const documentPanel = { dataset: { tiRequestStep: 'document' }, hidden: false };
  const paymentPanel = { dataset: { tiRequestStep: 'payment' }, hidden: true };
  const button = step => ({ dataset: { tiGoStep: step }, attrs: {}, setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];} });
  const documentButton=button('document'), paymentButton=button('payment'), back=button('document');
  const next={}, summary={textContent:''}, label={textContent:'Copiar'}, copy={querySelector:()=>label};
  const headings={document:{focused:false,focus(){this.focused=true;}},payment:{focused:false,focus(){this.focused=true;}}};
  let valid=false, validations=0;
  const form={elements:{namedItem:()=>input},scrollIntoView(){},
    querySelectorAll:s=>s==='[data-ti-request-step]'?[documentPanel,paymentPanel]:s.startsWith('.ti-request-progress')?[documentButton,paymentButton]:[documentButton,paymentButton,back],
    querySelector:s=>s==='[data-ti-document-summary]'?summary:s==='[data-ti-next]'?next:s==='[data-ti-copy-phone]'?copy:s.includes('h3')?headings[s.includes('"payment"')?'payment':'document']:null};
  const controls=setupTurnitinRequest(form,{validate:kind=>{assert.equal(kind,'document');validations++;return valid;}});
  return {input,documentPanel,paymentPanel,documentButton,paymentButton,back,next,summary,headings,controls,setValid:v=>{valid=v;},validations:()=>validations};
}
test('payment is gated by a valid document and back navigation preserves the chosen file',()=>{
  const f=fixture(); f.controls.start();
  assert.equal(f.controls.next(),false); assert.equal(f.paymentPanel.hidden,true);
  const file={name:'Trabajo.pdf'};f.input.files=[file]; f.setValid(true);
  assert.equal(f.controls.next(),true); assert.equal(f.documentPanel.hidden,true); assert.equal(f.paymentPanel.hidden,false);
  assert.equal(f.summary.textContent,'Trabajo.pdf'); assert.equal(f.paymentButton.attrs['aria-current'],'step');
  assert.equal(f.headings.payment.focused,true);
  f.back.onclick(); assert.equal(f.documentPanel.hidden,false); assert.equal(f.input.files[0],file);
  f.paymentButton.onclick(); assert.equal(f.controls.isPayment(),true);
  f.input.files=[]; f.input.dispatchEvent(new Event('change'));
  assert.equal(f.controls.isPayment(),false,'Removing the document returns to its visible, editable step');
  assert.equal(f.documentPanel.hidden,false);
});
test('changing a document updates the summary and reset restores the first step',()=>{
  const f=fixture();f.setValid(true);f.input.files=[{name:'Primero.pdf'}];f.controls.next();
  f.input.files=[{name:'Final.docx'}];f.input.dispatchEvent(new Event('change'));
  assert.equal(f.summary.textContent,'Final.docx');f.controls.reset();
  assert.equal(f.controls.isPayment(),false);assert.equal(f.documentPanel.hidden,false);assert.equal(f.paymentPanel.hidden,true);
});
