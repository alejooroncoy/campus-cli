import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadError, setupTurnitinUploads } from '../src/scripts/turnitin-upload.ts';
const MB = 1024 * 1024;
const pdf = new File(['%PDF-1.4 fixture'], 'Trabajo.PDF', {type:'application/pdf'});
const image = new File(['fixture image'], 'comprobante.png', {type:'image/png'});

test('file selection accepts PDF/DOCX documents and image/PDF receipts with separate limits', () => {
  assert.equal(uploadError([pdf],'document',20*MB),null);
  assert.equal(uploadError([{name:'trabajo.docx',size:20*MB}],'document',20*MB),null);
  assert.equal(uploadError([image],'receipt',5*MB),null);
  assert.match(uploadError([image],'document',20*MB),/PDF o Word/);
  assert.match(uploadError([{name:'trabajo.pdf.exe',size:1}],'document',20*MB),/PDF o Word/);
  assert.match(uploadError([{name:'pago.pdf',size:5*MB+1}],'receipt',5*MB),/5 MB/);
  assert.match(uploadError([{name:'trabajo.pdf',size:20*MB+1}],'document',20*MB),/20 MB/);
  assert.match(uploadError([{name:'trabajo.pdf',size:0}],'document',20*MB),/vacío/);
  assert.match(uploadError([pdf,pdf],'document',20*MB),/solo archivo/);
});

// Event targets keep these interaction tests independent of a browser package.
function fixture() {
  const tokens = new Set();
  const name={textContent:'Seleccionar archivo'};
  const error={textContent:'',hidden:true};
  const remove={hidden:true};
  const input=new EventTarget();
  Object.assign(input,{name:'document',files:[],disabled:false,attributes:{},clicks:0,
    matches(){return this.disabled;},setAttribute(key,value){this.attributes[key]=value;},click(){this.clicks++;}});
  Object.defineProperty(input,'value',{set(value){if(value==='')this.files=[];}});
  const zone=new EventTarget();
  Object.assign(zone,{focused:false,focus(){this.focused=true;},querySelector(selector){return selector==='input[type=file]'?input:name;},
    classList:{add:x=>tokens.add(x),remove:x=>tokens.delete(x),toggle:(x,on)=>on?tokens.add(x):tokens.delete(x)}});
  const form={querySelectorAll:()=>[zone],querySelector:selector=>selector.includes('upload-error')?error:remove};
  const controls=setupTurnitinUploads(form,()=>20*MB);
  const event=(type,values={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,values);zone.dispatchEvent(e);return e;};
  return {zone,input,name,error,remove,tokens,controls,event};
}

const previousTransfer=globalThis.DataTransfer;
globalThis.DataTransfer=class { files=[];items={add:file=>this.files.push(file)}; };
process.on('exit',()=>{globalThis.DataTransfer=previousTransfer;});

test('dropping and pasting replace the selected document, reject multiple files, and allow removal', () => {
  const f=fixture();
  assert.equal(f.event('drop',{dataTransfer:{types:['Files'],files:[pdf]}}).defaultPrevented,true);
  assert.equal(f.name.textContent,pdf.name);assert.equal(f.remove.hidden,false);
  const docx=new File(['fixture'],'trabajo.docx');
  assert.equal(f.event('paste',{clipboardData:{files:[docx]}}).defaultPrevented,true);
  assert.equal(f.input.files[0],docx);
  f.event('drop',{dataTransfer:{types:['Files'],files:[pdf,pdf]}});
  assert.equal(f.input.files[0],docx);assert.match(f.error.textContent,/solo archivo/);
  f.event('paste',{clipboardData:{files:[]}});
  assert.match(f.error.textContent,/portapapeles/);assert.equal(f.input.files[0],docx);
  f.remove.onclick();assert.equal(f.input.files.length,0);assert.equal(f.remove.hidden,true);assert.equal(f.zone.focused,true);
});

test('picker validation, keyboard activation, disabled submission and reset preserve a usable form', () => {
  const f=fixture();
  f.input.files=[image];f.input.dispatchEvent(new Event('change'));
  assert.equal(f.input.files.length,0);assert.match(f.error.textContent,/PDF o Word/);
  f.event('keydown',{key:'Enter'});assert.equal(f.input.clicks,1);
  f.input.files=[pdf];f.input.dispatchEvent(new Event('change'));
  assert.equal(f.controls.validate(),true);assert.equal(f.error.hidden,true);
  f.input.disabled=true;
  f.event('paste',{clipboardData:{files:[image]}});
  assert.equal(f.input.files[0],pdf);
  assert.equal(f.event('drop',{dataTransfer:{types:['Files'],files:[image]}}).defaultPrevented,true);
  assert.equal(f.input.files[0],pdf);
  f.controls.reset();assert.equal(f.remove.hidden,true);assert.equal(f.tokens.has('ti-upload--selected'),false);
});

test('staff report selections require PDFs and allow up to 20 MB each',()=>{
  for(const kind of ['similarity','ai']){
    assert.equal(uploadError([pdf],kind,20*MB),null);
    assert.match(uploadError([image],kind,20*MB),/informe PDF/);
    assert.match(uploadError([{name:'informe.docx',size:100}],kind,20*MB),/informe PDF/);
    assert.match(uploadError([{name:'informe.pdf',size:20*MB+1}],kind,20*MB),/20 MB/);
    assert.match(uploadError([pdf,pdf],kind,20*MB),/solo archivo/);
  }
});
