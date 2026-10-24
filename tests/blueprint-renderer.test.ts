import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {catalog} from '../lib/catalog';
import {BLUEPRINT_FLOOR_Y,BLUEPRINT_MATERIALS,BLUEPRINT_SHAPES,resolveBlueprintAnchors,validateSceneBlueprint} from '../lib/scene-blueprint';
import {createRoomGeometries,type RoomKit} from '../components/diorama/rooms';
import {buildBlueprintArchitecture,createBlueprintGeometryPool,createBlueprintTerrain,normalizeBlueprintProduct,blueprintCameraFit} from '../components/diorama/blueprint';
import {createProductMeshLibrary} from '../components/diorama/product-meshes';
import {cameraOrbit} from '../components/diorama/math';
import {atlasLayout,atlasCameraSpan} from '../components/diorama/atlas-layout';
import {fixtureBlueprint} from './fixtures/blueprint';

function setup() {
  const resources=new Set<{dispose():void}>(),own=<T extends{dispose():void}>(resource:T):T=>{resources.add(resource);return resource;};
  const base=createRoomGeometries(own),pool=createBlueprintGeometryPool(base,own),scene=new THREE.Group();
  const paint=Object.fromEntries(BLUEPRINT_MATERIALS.map(key=>[key,own(new THREE.MeshBasicMaterial({side:THREE.DoubleSide}))])) as Record<(typeof BLUEPRINT_MATERIALS)[number],THREE.MeshBasicMaterial>;
  const kit:Pick<RoomKit,'piece'|'blob'>={piece(name,x=0,y=0,z=0){const group=new THREE.Group();group.name=name;group.position.set(x,y,z);scene.add(group);return group;},blob(){}};
  return{own,resources,base,pool,scene,paint,kit,dispose(){resources.forEach(resource=>resource.dispose());}};
}

test('every generated primitive matches the centered unit bounds used by server validation',()=>{
  const fixture=setup();
  try{
    for(const shape of BLUEPRINT_SHAPES){const bounds=fixture.pool[shape].boundingBox!;for(const axis of ['x','y','z'] as const){assert(Math.abs(bounds.min[axis]+.5)<1e-6,`${shape}/${axis} minimum`);assert(Math.abs(bounds.max[axis]-.5)<1e-6,`${shape}/${axis} maximum`);}}
    fixture.base.arch.computeBoundingBox();
    assert.notEqual(fixture.base.arch.boundingBox!.min.y,-.5,'normalization must not mutate legacy pooled room geometry');
  }finally{fixture.dispose();}
});

test('model-authored concave terrain preserves x/z orientation, empty cutouts and exact floor height',()=>{
  const blueprint=fixtureBlueprint(['kettle','mugs']);
  blueprint.terrain.outline=[{x:-3,z:-2},{x:3,z:-2},{x:3,z:2},{x:.6,z:2},{x:.6,z:.2},{x:-.6,z:.2},{x:-.6,z:2},{x:-3,z:2}];
  const geometry=createBlueprintTerrain(blueprint),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);
  mesh.updateMatrixWorld(true);
  try{
    const bounds=geometry.boundingBox!;
    assert(Math.abs(bounds.max.y-BLUEPRINT_FLOOR_Y)<1e-6);
    assert(Math.abs(bounds.min.y-(BLUEPRINT_FLOOR_Y-blueprint.terrain.depth))<1e-6);
    for(const [x,z] of [[-2,1],[2,1],[0,-1]]){const hits=new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh);assert(hits.length);assert(Math.abs(hits[0].point.y-BLUEPRINT_FLOOR_Y)<1e-6);}
    assert.equal(new THREE.Raycaster(new THREE.Vector3(0,2,1),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length,0,'the generated notch stays open instead of becoming an authored oval floor');
  }finally{geometry.dispose();material.dispose();}
});

test('generated parts use the model transforms and real supports, with no authored room template',()=>{
  const f=setup(),blueprint=validateSceneBlueprint(fixtureBlueprint(['kettle','mugs','tray']),['kettle','mugs','tray']);
  const architecture=buildBlueprintArchitecture(blueprint,f.kit,f.pool,key=>f.paint[key]);
  try{
    f.scene.updateMatrixWorld(true);
    assert.equal(f.scene.children.length,blueprint.nodes.length+1);
    assert.equal(f.scene.getObjectByName('counter'),undefined);
    for(const node of blueprint.nodes){const part=f.scene.getObjectByName(`blueprint:${node.id}`)!;assert(part);assert.deepEqual(part.position.toArray(),[node.position.x,node.position.y,node.position.z]);assert.equal((part.children[0] as THREE.Mesh).geometry,f.pool[node.shape]);assert.deepEqual(part.children[0].scale.toArray(),[node.scale.x,node.scale.y,node.scale.z]);}
    for(const anchor of architecture.anchors.values()){
      const support=f.scene.getObjectByName(`blueprint:${anchor.supportId}`)!;
      const hit=new THREE.Raycaster(new THREE.Vector3(anchor.x,anchor.y+.05,anchor.z),new THREE.Vector3(0,-1,0),0,.1).intersectObject(support,true)[0];
      assert(hit,`${anchor.skuId} has actual supporting geometry`);assert(Math.abs(hit.point.y-anchor.y)<1e-6);
    }
  }finally{architecture.dispose();f.dispose();}
});

test('all catalog product meshes fit the validated footprint at every tested yaw and sit on their real bottom',()=>{
  const f=setup(),library=createProductMeshLibrary(f.own);
  try{
    for(const sku of catalog)for(const scale of [.55,1.15])for(const yaw of [-Math.PI/4,Math.PI/3]){
      const product=library.build({skuId:sku.id,type:sku.type,name:sku.name,color:sku.color});
      const anchor={skuId:sku.id,supportId:null,x:.7,z:-.5,y:BLUEPRINT_FLOOR_Y,yaw,scale};
      const dimensions=normalizeBlueprintProduct(product,anchor),placed=new THREE.Group();placed.position.set(anchor.x,anchor.y,anchor.z);placed.add(product);
      const bounds=new THREE.Box3().setFromObject(placed),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      assert(Math.hypot(size.x,size.z)<=.68*scale+1e-6,`${sku.id}: horizontal clearance`);
      assert(size.y<=scale+1e-6,`${sku.id}: vertical clearance`);
      assert(Math.abs(bounds.min.y-anchor.y)<1e-6,`${sku.id}: grounded bottom`);
      assert(Math.abs(center.x-anchor.x)<1e-6&&Math.abs(center.z-anchor.z)<1e-6,`${sku.id}: centered anchor`);
      assert(Math.abs(dimensions.height-size.y)<1e-6);
    }
  }finally{f.dispose();}
});

test('changed blueprints replace terrain without accumulating or disposing shared GPU resources',()=>{
  const f=setup(),pooled=f.resources.size;
  let lastTerrain:THREE.BufferGeometry|undefined;
  try{
    for(let i=0;i<12;i++){
      f.scene.clear();const blueprint=fixtureBlueprint(['kettle','mugs'],i%2);
      blueprint.terrain.outline[0].x+=i*.015;
      const architecture=buildBlueprintArchitecture(blueprint,f.kit,f.pool,key=>f.paint[key]);
      const terrain=(f.scene.getObjectByName('blueprint-terrain')!.children[0] as THREE.Mesh).geometry;
      assert.notEqual(terrain,lastTerrain);lastTerrain=terrain;
      let released=0;terrain.addEventListener('dispose',()=>released++);architecture.dispose();architecture.dispose();
      assert.equal(released,1);assert.equal(f.resources.size,pooled);
    }
  }finally{f.dispose();}
});

test('generated layouts and hotspot headroom fit mobile and desktop at all permitted parallax extremes',()=>{
  const bounds=new THREE.Box3(new THREE.Vector3(-3.8,-.9,-3.3),new THREE.Vector3(3.8,3.8,3.3));
  for(const [width,height] of [[390,520],[1180,660]]){
    const aspect=width/height,fit=blueprintCameraFit(bounds,aspect),camera=new THREE.OrthographicCamera(-fit.height*aspect/2,fit.height*aspect/2,fit.height/2,-fit.height/2,.1,60);
    for(const time of [0,6,15,35])for(const pointerX of [-1,1])for(const pointerY of [-1,1]){
      const orbit=cameraOrbit(time,pointerX,pointerY),yaw=Math.PI/4+orbit.yaw,pitch=Math.atan(1/Math.sqrt(2))+orbit.pitch;
      camera.position.set(fit.target.x+Math.sin(yaw)*Math.cos(pitch)*12,fit.target.y+Math.sin(pitch)*12,fit.target.z+Math.cos(yaw)*Math.cos(pitch)*12);camera.lookAt(fit.target);camera.updateMatrixWorld();
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y+.13])for(const z of [bounds.min.z,bounds.max.z]){const point=new THREE.Vector3(x,y,z).project(camera);assert(Math.abs(point.x)<.98&&Math.abs(point.y)<.98,`${width}px generated geometry and hotspots stay in frame`);}
    }
  }
});

test('generated blueprint geometry fits the connected atlas without changing its coordinate convention',()=>{
  const f=setup();
  try{
    for(const [width,height,compact] of [[1320,600,false],[800,540,false],[390,318,true]] as const){
      const layout=atlasLayout(6,compact),aspect=width/height,span=atlasCameraSpan(layout.length,compact,aspect),camera=new THREE.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,.1,80);
      for(const pointer of [-1,1]){
        const yaw=Math.PI/4+pointer*.054,pitch=.65+pointer*.025;camera.position.set(Math.sin(yaw)*Math.cos(pitch)*26,-.15+Math.sin(pitch)*26,Math.cos(yaw)*Math.cos(pitch)*26);camera.lookAt(0,-.15,0);camera.updateMatrixWorld();
        layout.forEach(position=>{f.scene.clear();f.scene.position.set(position.x,position.y,position.z);f.scene.scale.setScalar(position.scale);const blueprint=fixtureBlueprint(['kettle','mugs']);const architecture=buildBlueprintArchitecture(blueprint,f.kit,f.pool,key=>f.paint[key]);f.scene.updateMatrixWorld(true);
          f.scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const vertices=object.geometry.getAttribute('position');for(let index=0;index<vertices.count;index+=Math.max(1,Math.floor(vertices.count/16))){const point=new THREE.Vector3().fromBufferAttribute(vertices,index).applyMatrix4(object.matrixWorld).project(camera);assert(Math.abs(point.x)<.98&&Math.abs(point.y)<.98,`${width}px generated atlas fits`);}});architecture.dispose();});
      }
    }
  }finally{f.dispose();}
});
