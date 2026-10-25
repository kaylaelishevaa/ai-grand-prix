import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {atlasLayout,atlasCameraSpan} from '../components/diorama/atlas-layout';
import {ATLAS_OVERVIEW_FOCUS,createAtlasCameraFocus,createAtlasPointerActivation} from '../components/diorama/atlas-focus';

test('hover smoothly approaches a bounded focus and leaving restores the whole overview',()=>{
  const layout=atlasLayout(6,true),focus=createAtlasCameraFocus(layout);
  assert.deepEqual(focus.update(0),ATLAS_OVERVIEW_FOCUS);
  focus.focus(5);const first={...focus.update(1/60)};
  assert(first.zoom>1&&first.zoom<1.28);assert(Math.abs(first.x)<Math.abs(layout[5].x*.38));
  for(let frame=0;frame<180;frame++){const state=focus.update(1/60);assert(state.zoom>=1&&state.zoom<=1.28);}
  const zoomed={...focus.update(0)};assert(Math.abs(zoomed.zoom-1.28)<.00001);
  focus.focus(null);const returning={...focus.update(1/60)};assert(returning.zoom<zoomed.zoom&&returning.zoom>1);
  for(let frame=0;frame<180;frame++)focus.update(1/60);
  const overview=focus.update(0);assert(Math.abs(overview.zoom-1)<.00001);assert(Math.hypot(overview.x,overview.y+.15,overview.z)<.0001);
});

test('reduced motion keeps the overview camera steady during focus changes',()=>{
  const focus=createAtlasCameraFocus(atlasLayout(6,true),true);
  for(const place of [0,5,2,null]){focus.focus(place);assert.deepEqual(focus.update(1),ATLAS_OVERVIEW_FOCUS);}
});

test('every focused island remains framed during the bounded zoom at phone and desktop sizes',()=>{
  for(const [width,height,compact] of [[390,295,true],[460,330,true],[1200,600,false]] as const)for(const count of [1,2,3,4,5,6]){
    const layout=atlasLayout(count,compact),aspect=width/height,span=atlasCameraSpan(count,compact,aspect);
    for(let index=0;index<count;index++){
      const focus=createAtlasCameraFocus(layout);focus.resize(span,aspect);focus.focus(index);for(let i=0;i<180;i++)focus.update(1/60);
      const f=focus.update(0),place=layout[index];
      for(const pointer of [-1,0,1]){
        const camera=new THREE.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,.1,80),yaw=Math.PI/4+pointer*.054,pitch=.65+pointer*.025;
        camera.zoom=f.zoom;camera.updateProjectionMatrix();camera.position.set(f.x+Math.sin(yaw)*Math.cos(pitch)*26,f.y+Math.sin(pitch)*26,f.z+Math.cos(yaw)*Math.cos(pitch)*26);camera.lookAt(f.x,f.y,f.z);camera.updateMatrixWorld();
        for(const x of [-4.15,4.15])for(const y of [-1,4])for(const z of [-3.6,3.6]){
          const p=new THREE.Vector3(place.x+x*place.scale,place.y+y*place.scale,place.z+z*place.scale).project(camera);
          assert(Math.abs(p.x)<1&&Math.abs(p.y)<1,`${width}px/${count} islands/focus${index}: selected architecture stays visible`);
        }
      }
    }
  }
});

test('one pointer activation enters its original island once; keyboard activation remains native',()=>{
  const activation=createAtlasPointerActivation();
  activation.start('river',7,150,200);
  assert.equal(activation.finish(7,151,201),'river');
  assert.equal(activation.consumeClick(1),true,'the browser click after pointer-up cannot enter twice');
  assert.equal(activation.consumeClick(0),false,'Enter/Space still activate the button');
  activation.start('cafe',8,180,220);assert.equal(activation.finish(8,180,252),null,'scrolling is not a tap');assert.equal(activation.consumeClick(1),true);
  activation.start('desk',9,100,200);activation.cancel();assert.equal(activation.finish(9,100,200),null);
  activation.start('date',10,100,200);assert.equal(activation.finish(11,100,200),null,'another pointer cannot steal the active island');assert.equal(activation.finish(10,100,200),'date');
});
