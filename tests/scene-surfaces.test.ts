import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSurfaceLibrary,prepareSurfaceShadows,configureSunShadow} from '../components/diorama/surfaces';
import {buildRoomArchitecture,createRoomGeometries,type RoomKit} from '../components/diorama/rooms';

test('material details are deterministic offline, pooled, and independently recolorable per blueprint role',()=>{
  const resources=new Set<{dispose():void}>(),own=<T extends{dispose():void}>(r:T):T=>{resources.add(r);return r;};
  try{
    const library=createSurfaceLibrary(own),wood=library.paint('#bba588','wood');
    const count=resources.size;
    for(let i=0;i<100;i++)assert.equal(library.paint('#bba588','wood'),wood);
    assert.equal(resources.size,count,'rebuilding does not allocate another map/material');
    assert.equal((wood.bumpMap as THREE.DataTexture).image.width,64);assert.equal((wood.bumpMap as THREE.DataTexture).image.height,64);
    const other=createSurfaceLibrary(own).paint('#bba588','wood');
    assert.deepEqual((wood.bumpMap as THREE.DataTexture).image.data,(other.bumpMap as THREE.DataTexture).image.data,'rehearsals share the same local finish');
    const structure=library.paint('#ffffff','plaster','structure'),accent=library.paint('#ffffff','plaster','accent');
    structure.color.set('#125662');assert.equal(accent.color.getHexString(),'ffffff','palette changes never bleed into another generated role');
    assert.equal(structure.bumpMap,accent.bumpMap,'semantic roles still share texture memory');
    assert(wood.roughness>library.paint('#bba588','ceramic').roughness);
  }finally{resources.forEach(r=>r.dispose());}
});

test('real furniture casts and receives bounded soft shadows, transparent water and blob planes do not occlude',()=>{
  const resources=new Set<{dispose():void}>(),own=<T extends{dispose():void}>(r:T):T=>{resources.add(r);return r;};
  try{
    const library=createSurfaceLibrary(own),root=new THREE.Group(),geometry=own(new THREE.BoxGeometry());
    const solid=new THREE.Mesh(geometry,library.paint('#cccccc','stone'));
    const water=new THREE.Mesh(geometry,library.paint('#668899','water'));
    const blob=new THREE.Mesh(geometry,own(new THREE.MeshBasicMaterial({transparent:true,opacity:.2})));
    root.add(solid,water,blob);prepareSurfaceShadows(root);
    assert(solid.castShadow&&solid.receiveShadow);assert(!water.castShadow&&water.receiveShadow);assert(!blob.castShadow&&!blob.receiveShadow);
    const sun=new THREE.DirectionalLight();configureSunShadow(sun,6);
    assert.equal(sun.shadow.mapSize.x,1024);assert.equal(sun.shadow.camera.left,-6);assert.equal(sun.shadow.camera.right,6);assert(sun.shadow.normalBias>0);
    sun.dispose();
  }finally{resources.forEach(r=>r.dispose());}
});

test('indoor and cafe settings have grounded joinery, outdoor landscapes retain their authored terrain',()=>{
  const geometries=createRoomGeometries(),material=new THREE.MeshBasicMaterial(),root=new THREE.Group();
  const kit:RoomKit={piece(name,x=0,y=0,z=0){const part=new THREE.Group();part.name=name;part.position.set(x,y,z);root.add(part);return part;},mesh(parent,g,_m,x,y,z,sx,sy,sz){const mesh=new THREE.Mesh(geometries[g],material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;},blob(){}};
  try{
    for(const setting of ['home','cafe','riverside'] as const){root.clear();buildRoomArchitecture('reading',kit,{type:setting==='home'?'space':setting==='cafe'?'place':'outdoor',setting,label:'Test'});assert.equal(!!root.getObjectByName('floor-joinery'),setting!=='riverside');}
  }finally{Object.values(geometries).forEach(g=>g.dispose());material.dispose();}
});
