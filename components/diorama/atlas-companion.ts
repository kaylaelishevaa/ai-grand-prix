import * as THREE from 'three';
import {clamp,damp} from './math';

type PlacePosition={x:number;y:number;z:number;scale:number};
/** Hovering changes only the companion's destination; it never enters a world. */
export function atlasCompanionTarget(layout:PlacePosition[],index:number|null){
  const place=index===null?undefined:layout[index];
  return place?{x:place.x+place.scale*.8,y:place.y+place.scale*1.8+.35,z:place.z+place.scale*2.15}:layout.length===1?{x:2.1,y:1.35,z:2.0}:{x:.6,y:1.35,z:.55};
}

/** The same round body, tiny ears and big eyes as the 3D hatch, using atlas pools. */
export function createAtlasCompanion(geometry:{sphere:THREE.BufferGeometry;arch:THREE.BufferGeometry},paint:(color:string)=>THREE.Material){
  const group=new THREE.Group();group.name='coupy-overview-companion';
  const body=new THREE.Group();group.add(body);
  const teal=paint('#347D78'),cream=paint('#FFF5D9'),ink=paint('#16424A'),cheek=paint('#E1A778');
  function part(parent:THREE.Group,material:THREE.Material,size:[number,number,number],position:[number,number,number]){const mesh=new THREE.Mesh(geometry.sphere,material);mesh.scale.set(...size);mesh.position.set(...position);parent.add(mesh);return mesh;}
  part(body,teal,[1.36,1.14,1.18],[0,0,0]);
  for(const side of [-1,1])part(body,teal,[.34,.52,.32],[side*.43,.51,0]).rotation.z=-side*.38;
  const eyes:THREE.Group[]=[];
  for(const x of [-.225,.225]){const eye=new THREE.Group();eye.position.set(x,.12,.52);body.add(eye);eyes.push(eye);part(eye,cream,[.236,.35,.11],[0,0,0]);part(eye,ink,[.092,.2,.054],[.018,-.006,.045]);part(body,cheek,[.19,.066,.04],[x*1.55,-.15,.48]);}
  const smile=new THREE.Mesh(geometry.arch,ink);smile.scale.setScalar(.164);smile.rotation.z=Math.PI;smile.position.set(0,-.185,.575);body.add(smile);
  const destination=new THREE.Vector3(.6,1.35,.55),position=destination.clone();group.position.copy(position);group.scale.setScalar(.86);
  return{group,focus(target:{x:number;y:number;z:number}){destination.set(target.x,target.y,target.z);},update(time:number,delta:number,yaw:number,reducedMotion:boolean){
    const drift=reducedMotion?0:Math.sin(time*1.5)*.11;
    if(reducedMotion)position.copy(destination);else{position.x=damp(position.x,destination.x,3.6,delta);position.y=damp(position.y,destination.y,3.6,delta);position.z=damp(position.z,destination.z,3.6,delta);}
    group.position.set(position.x,position.y+drift,position.z);group.rotation.set(-.1,yaw,0);
    body.rotation.z=reducedMotion?0:clamp((destination.x-position.x)*-.08,-.13,.13);
    const breath=reducedMotion?0:Math.sin(time*1.8)*.025;body.scale.set(1-breath,1+breath,1);
    const cycle=time%6.7,blink=!reducedMotion&&cycle>5.8&&cycle<5.98?.12:1;eyes.forEach(eye=>{eye.scale.y=blink;});
  }};
}
