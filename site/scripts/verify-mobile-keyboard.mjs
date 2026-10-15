import assert from 'node:assert/strict';
import {createKeyboardViewportState,watchMobileKeyboard} from '../src/scripts/mobile-keyboard.ts';
const base={width:320,layoutHeight:740,visibleHeight:740,offsetTop:0,scale:1,editing:false,mobile:true};
const read=createKeyboardViewportState();
assert.deepEqual(read(base),{open:false,inset:0});
assert.equal(read({...base,editing:true}).open,false);
assert.equal(read({...base,editing:true,visibleHeight:690}).open,false); // Browser toolbar.
assert.deepEqual(read({...base,editing:true,visibleHeight:420}),{open:true,inset:320}); // Visual-only keyboard.
assert.deepEqual(read({...base,editing:true,visibleHeight:420,offsetTop:60}),{open:true,inset:260}); // Browser pans the view.
assert.deepEqual(read({...base,editing:true,layoutHeight:420,visibleHeight:420}),{open:true,inset:0}); // Layout also resizes.
assert.deepEqual(read({...base,editing:true}),{open:false,inset:0}); // Dismissal without blur.
assert.equal(read({...base,editing:false,visibleHeight:420}).open,false);
assert.equal(read({...base,editing:true,visibleHeight:420,scale:2}).open,false);
assert.equal(read({...base,editing:true,visibleHeight:420,mobile:false}).open,false);
assert.equal(read({...base,width:700,layoutHeight:390,visibleHeight:390,editing:true}).open,false); // Orientation.
const withoutVisualViewport=createKeyboardViewportState();
withoutVisualViewport(base);
assert.equal(withoutVisualViewport({...base,editing:true,layoutHeight:420,visibleHeight:420}).open,true);
console.log('Keyboard geometry: visual/layout resize, panning, dismissal, toolbar, zoom, desktop and orientation passed.');


// Recreate page listeners while the keyboard remains open, as Astro does when
// replacing the body. The expanded reference and cleanup must survive the swap.
class Surface extends EventTarget {
  listeners = new Map();
  addEventListener(type, listener, options) { super.addEventListener(type,listener,options);this.listeners.set(listener,type); }
  removeEventListener(type, listener, options) { super.removeEventListener(type,listener,options);this.listeners.delete(listener); }
}
class Field { id='profes-message'; readOnly=false; disabled=false; }
const names=['window','document','HTMLTextAreaElement','HTMLInputElement','HTMLElement','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'];
const saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
try {
 const frames=new Map();let sequence=0;
 const visual=Object.assign(new Surface(),{height:740,offsetTop:0,scale:1});
 const media=Object.assign(new Surface(),{matches:true});
 const win=Object.assign(new Surface(),{innerWidth:320,innerHeight:740,visualViewport:visual,matchMedia:()=>media});
 const classes=new Set(),styles=new Map();
 const doc=Object.assign(new Surface(),{activeElement:new Field(),body:{classList:{toggle:(key,on)=>on?classes.add(key):classes.delete(key),remove:key=>classes.delete(key)},style:{setProperty:(key,value)=>styles.set(key,value),removeProperty:key=>styles.delete(key)}},querySelector:()=>null});
 Object.assign(globalThis,{window:win,document:doc,HTMLTextAreaElement:Field,HTMLInputElement:class {},HTMLElement:class {},ResizeObserver:class {observe(){} unobserve(){} disconnect(){}},requestAnimationFrame:fn=>{const id=++sequence;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
 const flush=()=>{for(const [id,fn] of [...frames]){frames.delete(id);fn();}};
 const shared=createKeyboardViewportState();
 let stop=watchMobileKeyboard(shared);
 assert.equal(classes.has('app-keyboard-open'),false);
 win.innerHeight=420;visual.height=420;win.dispatchEvent(new Event('resize'));flush();
 assert.equal(classes.has('app-keyboard-open'),true);
 stop();assert.equal(classes.has('app-keyboard-open'),false);
 assert.equal(win.listeners.size+visual.listeners.size+media.listeners.size+doc.listeners.size,0);
 stop=watchMobileKeyboard(shared); // The next page loads with the keyboard still open.
 assert.equal(classes.has('app-keyboard-open'),true);
 win.innerHeight=740;visual.height=740;win.dispatchEvent(new Event('pageshow'));flush();
 assert.equal(classes.has('app-keyboard-open'),false);
 visual.dispatchEvent(new Event('scroll'));assert.equal(frames.size,1);
 stop();assert.equal(frames.size,0);assert.equal(styles.size,0);
 assert.equal(win.listeners.size+visual.listeners.size+media.listeners.size+doc.listeners.size,0);
 console.log('Keyboard lifecycle: page swap while open, history restoration, close without blur, no duplicate listeners and pending-frame cleanup passed.');
} finally {for(const [name,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
