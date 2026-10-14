import assert from 'node:assert/strict';
import {createKeyboardViewportState} from '../src/scripts/mobile-keyboard.ts';
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
