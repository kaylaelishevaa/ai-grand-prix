import * as THREE from 'three';

export const IMMERSIVE_CAMERA={yaw:Math.PI/4,pitch:.58};
/** Tight fit to cached physical vertices across the allowed orbit. A union box
 * invents empty corners above broad ground and makes a phone scene too small. */
export function immersiveCameraFit(products:THREE.Box3,room:THREE.Box3,aspect:number,viewportHeight=430,geometryPoints?:readonly THREE.Vector3[]){
  const focus=room.isEmpty()?products.clone():room.clone();if(!products.isEmpty())focus.union(products);
  if(focus.isEmpty())focus.set(new THREE.Vector3(-3,.18,-2),new THREE.Vector3(3,3,2));
  const points=geometryPoints?.length?geometryPoints:([focus.min.x,focus.max.x].flatMap(x=>[focus.min.y,focus.max.y].flatMap(y=>[focus.min.z,focus.max.z].map(z=>new THREE.Vector3(x,y,z)))));
  const target=focus.getCenter(new THREE.Vector3()),right=new THREE.Vector3(Math.cos(IMMERSIVE_CAMERA.yaw),0,-Math.sin(IMMERSIVE_CAMERA.yaw)),up=new THREE.Vector3(-Math.sin(IMMERSIVE_CAMERA.yaw)*Math.sin(IMMERSIVE_CAMERA.pitch),Math.cos(IMMERSIVE_CAMERA.pitch),-Math.cos(IMMERSIVE_CAMERA.yaw)*Math.sin(IMMERSIVE_CAMERA.pitch));
  const poses=[-8,0,8].flatMap(dy=>[-4.6,0,4.6].map(dp=>{const yaw=IMMERSIVE_CAMERA.yaw+dy*Math.PI/180,pitch=IMMERSIVE_CAMERA.pitch+dp*Math.PI/180;return{rx:Math.cos(yaw),rz:-Math.sin(yaw),ux:-Math.sin(yaw)*Math.sin(pitch),uy:Math.cos(pitch),uz:-Math.cos(yaw)*Math.sin(pitch)};}));
  function extent(){let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;for(const pose of poses)for(const point of points){const dx=point.x-target.x,dy=point.y-target.y,dz=point.z-target.z,x=dx*pose.rx+dz*pose.rz,y=dx*pose.ux+dy*pose.uy+dz*pose.uz;left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y);}return{left,right,bottom,top};}
  // Center the actual projected silhouette, including asymmetrical foliage/walls.
  for(let i=0;i<2;i++){const e=extent();target.addScaledVector(right,(e.left+e.right)/2).addScaledVector(up,(e.bottom+e.top)/2);}
  const e=extent(),topReserve=Math.min(.12,25/Math.max(1,viewportHeight));
  const height=Math.max(3.4,2*Math.max(Math.abs(e.left),Math.abs(e.right))/(Math.max(.1,aspect)*.92),2*Math.max(Math.abs(e.bottom),Math.abs(e.top))/(.92-topReserve));
  target.addScaledVector(up,height*topReserve/2);
  return{target,height};
}
