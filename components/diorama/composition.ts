import * as THREE from 'three';

/** Shadows and invisible assembly helpers must not inflate the camera framing. */
export function solidMeshes(root:THREE.Object3D):THREE.Mesh[]{
  const meshes:THREE.Mesh[]=[];
  root.traverseVisible(object=>{if(!(object instanceof THREE.Mesh))return;const materials=Array.isArray(object.material)?object.material:[object.material];if(materials.every(material=>material.transparent&&!material.depthWrite))return;meshes.push(object);});
  return meshes;
}
export function visibleGeometryBounds(root:THREE.Object3D){
  root.updateMatrixWorld(true);const bounds=new THREE.Box3(),part=new THREE.Box3();
  for(const mesh of solidMeshes(root)){if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();if(mesh.geometry.boundingBox){part.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);bounds.union(part);}}
  return bounds;
}

/** Cached at rebuild time, so curved ground and canopy edges are framed by
 * actual vertices rather than empty corners of a large rectangular box. */
export function visibleGeometryPoints(root:THREE.Object3D){
  root.updateMatrixWorld(true);const points:THREE.Vector3[]=[];
  for(const mesh of solidMeshes(root)){const vertices=mesh.geometry.getAttribute('position');for(let index=0;index<vertices.count;index++)points.push(new THREE.Vector3().fromBufferAttribute(vertices,index).applyMatrix4(mesh.matrixWorld));}
  return points;
}

/** Find a point on actual product triangles, not an imaginary dot above a box.
 * The small grid also handles hollow handles/earrings whose centers are empty. */
export function productSurfacePoint(root:THREE.Object3D,camera:THREE.Camera,occluders?:THREE.Mesh[]){
  const meshes=solidMeshes(root),bounds=visibleGeometryBounds(root),center=bounds.getCenter(new THREE.Vector3());
  if(bounds.isEmpty())return{point:center,hit:false};
  let left=Infinity,right=-Infinity,top=-Infinity,bottom=Infinity;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new THREE.Vector3(x,y,z).project(camera);left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.max(top,p.y);bottom=Math.min(bottom,p.y);}
  const raycaster=new THREE.Raycaster();
  for(const [u,v] of [[.5,.5],[.5,.3],[.3,.5],[.7,.5],[.5,.7],[.3,.3],[.7,.3],[.3,.7],[.7,.7],[.15,.5],[.85,.5]]){
    raycaster.setFromCamera(new THREE.Vector2(left+(right-left)*u,bottom+(top-bottom)*v),camera);
    const hit=raycaster.intersectObjects(meshes,false)[0];if(hit){const blocker=occluders?raycaster.intersectObjects(occluders,false)[0]:undefined;if(!blocker||blocker.distance>=hit.distance-.015)return{point:hit.point.clone(),hit:true};}
  }
  return{point:center,hit:false};
}
