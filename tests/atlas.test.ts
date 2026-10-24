import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {atlasLayout,atlasCameraSpan} from '../components/diorama/atlas-layout';
import {buildRoomArchitecture,createRoomGeometries,type RoomKit} from '../components/diorama/rooms';
import type {SceneKind} from '../lib/scenes';

test('atlas places use one legible journey with bounded pagination layouts',()=>{
  for(const compact of [false,true])for(const count of [1,2,3,4,12]){
    const layout=atlasLayout(count,compact);
    assert.equal(layout.length,Math.min(count,compact?2:4));
    assert.equal(new Set(layout.map(p=>`${p.x}:${p.z}`)).size,layout.length);
    assert(layout.every(p=>Number.isFinite(p.x+p.z+p.scale)&&p.scale>0));
    if(count===1)assert.equal(layout[0].x+layout[0].z,0);
  }
});

test('scenic geometry fits the atlas camera at desktop and phone widths',()=>{
  const resources=new Set<{dispose():void}>(),own=<T extends{dispose():void}>(resource:T):T=>{resources.add(resource);return resource;};
  const geometries=createRoomGeometries(own),material=own(new THREE.MeshBasicMaterial());
  const kinds:SceneKind[]=['kitchen','dressing','reading','desk'];
  try{
    for(const [width,height,compact] of [[1320,600,false],[800,540,false],[390,610,true]] as const){
      const layout=atlasLayout(compact?2:4,compact),aspect=width/height,span=atlasCameraSpan(layout.length,compact,aspect);
      const camera=new THREE.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,.1,80);
      for(const pointer of [-1,0,1]){
        const yaw=Math.PI/4+pointer*.054,pitch=.65+pointer*.025;
        camera.position.set(Math.sin(yaw)*Math.cos(pitch)*26,-.15+Math.sin(pitch)*26,Math.cos(yaw)*Math.cos(pitch)*26);camera.lookAt(0,-.15,0);camera.updateMatrixWorld();
        layout.forEach((position,index)=>{
          const scene=new THREE.Group();scene.position.set(position.x,position.y,position.z);scene.scale.setScalar(position.scale);
          const kit:RoomKit={piece(name,x=0,y=0,z=0){const group=new THREE.Group();group.name=name;group.position.set(x,y,z);scene.add(group);return group;},mesh(parent,geometry,_material,x,y,z,sx,sy,sz){const mesh=new THREE.Mesh(geometries[geometry],material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;},blob(){}};
          buildRoomArchitecture(kinds[index],kit);scene.updateMatrixWorld();
          scene.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const positions=object.geometry.getAttribute('position');for(let v=0;v<positions.count;v+=Math.max(1,Math.floor(positions.count/16))){const point=new THREE.Vector3().fromBufferAttribute(positions,v).applyMatrix4(object.matrixWorld).project(camera);assert(Math.abs(point.x)<.98,`${width}px scene ${index}: x ${point.x}`);assert(point.y<.98&&point.y>-.98,`${width}px scene ${index}: y ${point.y}`);}});
        });
      }
    }
  }finally{resources.forEach(resource=>resource.dispose());}
});
