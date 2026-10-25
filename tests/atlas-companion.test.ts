import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {atlasCompanionTarget,createAtlasCompanion} from '../components/diorama/atlas-companion';
import {atlasLayout,atlasCameraSpan} from '../components/diorama/atlas-layout';
import {createRoomGeometries} from '../components/diorama/rooms';

function fixture(){const resources=new Set<{dispose():void}>(),own=<T extends{dispose():void}>(r:T):T=>{resources.add(r);return r;},geometry=createRoomGeometries(own),paint=new Map<string,THREE.Material>();const companion=createAtlasCompanion(geometry,color=>{if(!paint.has(color))paint.set(color,own(new THREE.MeshBasicMaterial({color})));return paint.get(color)!;});return{companion,resources,dispose(){resources.forEach(r=>r.dispose());}};}

test('hovering a place moves the pooled 3D companion nearby and leaving returns it to the overview',()=>{
  const f=fixture(),layout=atlasLayout(6,true),initial=atlasCompanionTarget(layout,null),target=atlasCompanionTarget(layout,4),count=f.resources.size;
  try{f.companion.focus(initial);f.companion.update(0,0,Math.PI/4,true);const start=f.companion.group.position.clone();f.companion.focus(target);f.companion.update(0,.016,Math.PI/4,false);assert(f.companion.group.position.distanceTo(start)>0);assert(f.companion.group.position.distanceTo(new THREE.Vector3(target.x,target.y,target.z))>.1,'hover glides rather than teleporting');
    f.companion.update(0,0,Math.PI/4,true);assert.deepEqual(f.companion.group.position.toArray(),[target.x,target.y,target.z],'reduced motion snaps without oscillation');
    f.companion.focus(initial);f.companion.update(0,0,Math.PI/4,true);assert.deepEqual(f.companion.group.position.toArray(),[initial.x,initial.y,initial.z]);
    for(let i=0;i<500;i++){f.companion.focus(atlasCompanionTarget(layout,i%6));f.companion.update(i/60,1/60,Math.PI/4,false);}assert.equal(f.resources.size,count,'hover and breathing allocate no geometries or textures');
  }finally{f.dispose();}
});

test('overview companion stays inside phone and desktop framing next to every world',()=>{
  const f=fixture();try{for(const [width,height,compact] of [[390,310,true],[460,310,true],[1200,600,false]] as const)for(const count of [1,2,3,4,6]){
    const layout=atlasLayout(count,compact),aspect=width/height,span=atlasCameraSpan(count,compact,aspect),camera=new THREE.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,.1,80),yaw=Math.PI/4,pitch=.65;camera.position.set(Math.sin(yaw)*Math.cos(pitch)*26,-.15+Math.sin(pitch)*26,Math.cos(yaw)*Math.cos(pitch)*26);camera.lookAt(0,-.15,0);camera.updateMatrixWorld();
    for(const index of [null,...layout.map((_,i)=>i)]){f.companion.focus(atlasCompanionTarget(layout,index));f.companion.update(0,0,yaw,true);f.companion.group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(f.companion.group);for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new THREE.Vector3(x,y,z).project(camera);assert(Math.abs(p.x)<1&&Math.abs(p.y)<1,`${count} places / ${width}px / companion ${index} stays in frame`);}}
  }}finally{f.dispose();}
});
