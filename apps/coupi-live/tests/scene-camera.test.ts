import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {IMMERSIVE_CAMERA,immersiveCameraFit} from '../components/diorama/scene-camera';
import {cameraOrbit,assignRoomSlots} from '../components/diorama/math';
import {createProductMeshLibrary} from '../components/diorama/product-meshes';
import {worldTemplates} from '../data/world-templates';
import {getSku} from '../lib/catalog';
import {resolveSceneKind} from '../lib/scenes';
import {resolveSceneContext} from '../lib/world-context';

test('closer full-scene view keeps every catalog object and touchpoint inside the phone at all orbit limits',()=>{
  const resources=new Set<{dispose():void}>(),own=<T extends{dispose():void}>(r:T):T=>{resources.add(r);return r;},library=createProductMeshLibrary(own);
  const room=new THREE.Box3(new THREE.Vector3(-4,-.8,-3.5),new THREE.Vector3(4,3.6,3.5));
  try{for(const template of worldTemplates){
    const items=template.scene.items.map(item=>getSku(item.skuId)!),kind=resolveSceneKind(template.scene),slots=assignRoomSlots(items,kind,resolveSceneContext(template.scene)),group=new THREE.Group(),points:THREE.Vector3[]=[];
    items.forEach((sku,i)=>{const product=library.build({skuId:sku.id,type:sku.type,name:sku.name}),slot=slots[i];product.scale.setScalar(slot.scale??1);const box=new THREE.Box3().setFromObject(product);const surface=slot.hangAt!==undefined?slot.hangAt-box.max.y:slot.surface??({counter:1.165,hook:.56,'table-left':1.002,'table-right':1.002,shelf:1.672,sideboard:.825}[slot.key]||slot.y);product.position.set(slot.x,surface,slot.z);group.add(product);points.push(new THREE.Vector3(slot.x,surface+box.max.y+.13,slot.z));});
    const products=new THREE.Box3().setFromObject(group);
    for(const [width,height] of [[390,430],[460,430],[1180,660]]){const aspect=width/height,fit=immersiveCameraFit(products,room,aspect),camera=new THREE.OrthographicCamera(-fit.height*aspect/2,fit.height*aspect/2,fit.height/2,-fit.height/2,.1,60);
      for(const pointer of [-1,1])for(const time of [0,6,20]){const orbit=cameraOrbit(time,pointer,pointer),yaw=IMMERSIVE_CAMERA.yaw+orbit.yaw,pitch=IMMERSIVE_CAMERA.pitch+orbit.pitch;camera.position.set(fit.target.x+Math.sin(yaw)*Math.cos(pitch)*12,fit.target.y+Math.sin(pitch)*12,fit.target.z+Math.cos(yaw)*Math.cos(pitch)*12);camera.lookAt(fit.target);camera.updateMatrixWorld();for(const p of points){const projected=p.clone().project(camera);assert(Math.abs(projected.x)<.95&&Math.abs(projected.y)<.95,`${template.id}/${width}px product touchpoint in view`);}}
    }
  }}finally{resources.forEach(r=>r.dispose());}
});

test('sparse products do not cause a tall complete environment to be cropped',()=>{
  const room=new THREE.Box3(new THREE.Vector3(-4,-.4,-3.5),new THREE.Vector3(4,3.6,3.5)),products=new THREE.Box3(new THREE.Vector3(-.4,.625,-.2),new THREE.Vector3(.4,1.1,.5));
  const aspect=390/430,fit=immersiveCameraFit(products,room,aspect),camera=new THREE.OrthographicCamera(-fit.height*aspect/2,fit.height*aspect/2,fit.height/2,-fit.height/2,.1,60);
  const {yaw,pitch}=IMMERSIVE_CAMERA;camera.position.set(fit.target.x+Math.sin(yaw)*Math.cos(pitch)*12,fit.target.y+Math.sin(pitch)*12,fit.target.z+Math.cos(yaw)*Math.cos(pitch)*12);camera.lookAt(fit.target);camera.updateMatrixWorld();
  for(const x of [room.min.x,room.max.x])for(const z of [room.min.z,room.max.z]){const top=new THREE.Vector3(x,room.max.y,z).project(camera);assert(Math.abs(top.x)<.96&&top.y<.9&&top.y>-.95,'canopy stays within caption-safe framing');}
  assert(IMMERSIVE_CAMERA.pitch<Math.atan(1/Math.sqrt(2)));
  assert(Number.isFinite(immersiveCameraFit(new THREE.Box3(),room,1).height));
});
