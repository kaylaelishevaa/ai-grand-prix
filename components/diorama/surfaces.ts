import * as THREE from 'three';

type Own = <T extends {dispose(): void}>(resource: T) => T;
export type SurfaceKind = 'plaster'|'stone'|'wood'|'fabric'|'ceramic'|'metal'|'water'|'foliage';

/** Subtle, local material detail. Three shared 64px maps; no images or network. */
export function createSurfaceLibrary(own:Own) {
  const textures=new Map<string,THREE.DataTexture>(),materials=new Map<string,THREE.MeshStandardMaterial>();
  function texture(kind:string) {
    if(textures.has(kind))return textures.get(kind)!;
    const size=64,data=new Uint8Array(size*size*4);
    let seed=7149;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const noise=(seed>>>24)/255;
      const detail=kind==='wood'?Math.sin(x*.63+Math.sin(y*.12)*.7)*.35+Math.sin(x*1.91)*.08+noise*.11:kind==='fabric'?((x%3===0||y%3===0)?.36:0)+noise*.1:noise*.22;
      const value=Math.round((kind==='wood'?184:kind==='fabric'?205:192)+detail*65),offset=(y*size+x)*4;
      data[offset]=data[offset+1]=data[offset+2]=value;data[offset+3]=255;
    }
    const result=own(new THREE.DataTexture(data,size,size));result.wrapS=result.wrapT=THREE.RepeatWrapping;result.repeat.set(3,3);result.needsUpdate=true;textures.set(kind,result);return result;
  }
  function paint(color:string,kind:SurfaceKind='plaster',identity='') {
    const key=`${color}:${kind}:${identity}`;
    if(materials.has(key))return materials.get(key)!;
    const roughness=kind==='metal'?.31:kind==='water'?.24:kind==='ceramic'?.36:kind==='wood'?.74:kind==='fabric'?.98:.86;
    const textured=kind==='wood'||kind==='fabric'||kind==='stone'||kind==='plaster';
    const material=own(new THREE.MeshStandardMaterial({color,roughness,metalness:kind==='metal'?.48:kind==='water'?.12:0,side:THREE.DoubleSide,map:kind==='wood'||kind==='fabric'?texture(kind):null,bumpMap:textured?texture(kind==='stone'?'plaster':kind):null,bumpScale:kind==='wood'?.04:kind==='fabric'?.028:.01}));
    material.userData.surface=kind;materials.set(key,material);return material;
  }
  return {paint};
}

/** One static shadow pass after assembly; sway stays inexpensive between rebuilds. */
export function configureSunShadow(light:THREE.DirectionalLight,extent:number,mapSize=1024) {
  light.castShadow=true;light.shadow.mapSize.set(mapSize,mapSize);
  Object.assign(light.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:.2,far:50});
  light.shadow.normalBias=.025;light.shadow.bias=-.0003;light.shadow.radius=3;
  light.shadow.camera.updateProjectionMatrix();
}
export function prepareSurfaceShadows(root:THREE.Object3D) {
  root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const materials=Array.isArray(object.material)?object.material:[object.material];const solid=materials.some(material=>material instanceof THREE.MeshStandardMaterial);object.castShadow=solid&&!materials.some(material=>material.userData.surface==='water');object.receiveShadow=solid;});
}
export function roomSurface(material:string):SurfaceKind {
  return material==='wood'?'wood':material==='brass'?'metal':material==='mirror'||material==='water'?'water':material==='floor'||material==='ground'?'stone':material==='blush'?'fabric':material==='sage'||material==='leaf'||material==='foliage'?'foliage':material==='paper'?'ceramic':'plaster';
}
