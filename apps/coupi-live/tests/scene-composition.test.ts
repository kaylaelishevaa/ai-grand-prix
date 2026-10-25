import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildRoomArchitecture,createRoomGeometries,type RoomKit} from '../components/diorama/rooms';
import {createProductMeshLibrary} from '../components/diorama/product-meshes';
import {assignRoomSlots,cameraOrbit} from '../components/diorama/math';
import {solidMeshes,visibleGeometryBounds,visibleGeometryPoints,productSurfacePoint} from '../components/diorama/composition';
import {IMMERSIVE_CAMERA,immersiveCameraFit} from '../components/diorama/scene-camera';
import {worldTemplates} from '../data/world-templates';
import {getSku} from '../lib/catalog';
import {resolveSceneKind} from '../lib/scenes';
import {resolveSceneContext} from '../lib/world-context';

function fixture(){const resources=new Set<{dispose():void}>(),own=<T extends{dispose():void}>(r:T):T=>{resources.add(r);return r;},geometries=createRoomGeometries(own),material=own(new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),room=new THREE.Group(),library=createProductMeshLibrary(own);
const kit:RoomKit={piece(name,x=0,y=0,z=0){const group=new THREE.Group();group.name=name;group.position.set(x,y,z);room.add(group);return group;},mesh(parent,shape,_material,x,y,z,sx,sy,sz){const mesh=new THREE.Mesh(geometries[shape],material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;},blob(){}};
return{room,kit,library,dispose(){resources.forEach(r=>r.dispose());}};}

test('all six phone compositions contain their complete visible geometry and each product has an unobstructed hotspot surface',()=>{
 const f=fixture();try{for(const template of worldTemplates){
  f.room.clear();const kind=resolveSceneKind(template.scene),context=resolveSceneContext(template.scene);buildRoomArchitecture(kind,f.kit,context);
  const foundation=f.room.getObjectByName('organic-island');if(foundation)foundation.children[2].visible=false;
  const items=template.scene.items.map(item=>getSku(item.skuId)!),slots=assignRoomSlots(items,kind,context),products=items.map((sku,i)=>{
   const model=new THREE.Group(),product=f.library.build({skuId:sku.id,type:sku.type,name:sku.name}),slot=slots[i];product.scale.setScalar(slot.scale??1);const bounds=new THREE.Box3().setFromObject(product);model.add(product);model.name=sku.id;
   const surface=slot.hangAt!==undefined?slot.hangAt-bounds.max.y:slot.surface??({counter:1.165,hook:.56,'table-left':1.002,'table-right':1.002,shelf:1.672,sideboard:.825}[slot.key]||slot.y);model.position.set(slot.x,surface,slot.z);f.room.add(model);return model;
  });
  const points=visibleGeometryPoints(f.room),bounds=visibleGeometryBounds(f.room),all=solidMeshes(f.room),productBounds=new THREE.Box3();products.forEach(product=>productBounds.union(visibleGeometryBounds(product)));
  for(const [width,height] of [[390,430],[436,360],[460,430],[1180,660]]){
   const aspect=width/height,fit=immersiveCameraFit(productBounds,bounds,aspect,height,points),camera=new THREE.OrthographicCamera(-fit.height*aspect/2,fit.height*aspect/2,fit.height/2,-fit.height/2,.1,60);
   for(const [px,py,time] of [[-1,-1,6],[1,1,6],[-1,1,20],[1,-1,20],[0,0,0]]){
    const orbit=cameraOrbit(time,px,py),yaw=IMMERSIVE_CAMERA.yaw+orbit.yaw,pitch=IMMERSIVE_CAMERA.pitch+orbit.pitch;camera.position.set(fit.target.x+Math.sin(yaw)*Math.cos(pitch)*12,fit.target.y+Math.sin(pitch)*12,fit.target.z+Math.cos(yaw)*Math.cos(pitch)*12);camera.lookAt(fit.target);camera.updateMatrixWorld();
    let minX=1,maxX=-1,minY=1,maxY=-1;
    for(const point of points){const p=point.clone().project(camera);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);assert(Math.abs(p.x)<.96&&p.y<.9&&p.y>-.95,`${template.id}: entire physical scene stays within frame (${p.x},${p.y})`);}
    if(px===0)assert((maxX-minX)/2>.72||(maxY-minY)/2>.72,`${template.id}: scene should fill the phone, not float in excessive whitespace`);
    for(const product of products){const anchor=productSurfacePoint(product,camera,all);assert(anchor.hit,`${template.id}/${product.name}: product must be visible rather than a dot on scenery (${px},${py})`);}
   }
  }
 }}finally{f.dispose();}
});

test('camera bounds omit invisible foundations and transparent shadow planes',()=>{
 const root=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial();const actual=new THREE.Mesh(geometry,material);root.add(actual);
 const hidden=new THREE.Mesh(geometry,material);hidden.position.y=50;hidden.visible=false;root.add(hidden);
 const shadowMaterial=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false}),shadow=new THREE.Mesh(geometry,shadowMaterial);shadow.scale.setScalar(100);root.add(shadow);
 assert.equal(visibleGeometryBounds(root).max.y,.5);assert.equal(solidMeshes(root).length,1);geometry.dispose();material.dispose();shadowMaterial.dispose();
});
