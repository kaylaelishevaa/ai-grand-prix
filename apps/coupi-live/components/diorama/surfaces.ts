import * as THREE from 'three';

type Own = <T extends {dispose(): void}>(resource: T) => T;
export type SurfaceKind = 'plaster'|'stone'|'wood'|'fabric'|'ceramic'|'metal'|'water'|'foliage';

export const SURFACE_TEXTURE_SIZE=128;
/** Small deterministic finishes shared by every instance; no images or network. */
export function createSurfaceLibrary(own:Own) {
  const textures=new Map<string,THREE.DataTexture>(),materials=new Map<string,THREE.MeshStandardMaterial>();
  function texture(kind:string) {
    if(textures.has(kind))return textures.get(kind)!;
    const size=SURFACE_TEXTURE_SIZE,data=new Uint8Array(size*size*4);
    let seed=7149;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const noise=(seed>>>24)/255;
      const grain=x*.48+Math.sin(y*.045)*1.9+Math.sin(y*.11)*.24;
      const detail=kind==='wood'?Math.sin(grain)*.17+Math.sin(grain*4.1)*.055+noise*.07
        :kind==='fabric'?Math.sin(x*Math.PI/2)*Math.cos(y*Math.PI/2)*.16+noise*.075
        :kind==='water'?Math.sin(x*.15+y*.085+Math.sin(y*.14))*.22+Math.sin(y*.4)*.08
        :kind==='foliage'?Math.sin(x*.47)*Math.cos(y*.39)*.11+noise*.16
        :Math.sin(x*.13+y*.09)*.035+noise*.13;
      const value=Math.round(221+detail*65),offset=(y*size+x)*4;
      data[offset]=data[offset+1]=data[offset+2]=value;data[offset+3]=255;
    }
    const result=own(new THREE.DataTexture(data,size,size));result.wrapS=result.wrapT=THREE.RepeatWrapping;result.repeat.set(kind==='wood'?2:kind==='fabric'?7:3,kind==='wood'?1.5:kind==='fabric'?7:3);result.magFilter=THREE.LinearFilter;result.minFilter=THREE.LinearMipmapLinearFilter;result.generateMipmaps=true;result.needsUpdate=true;textures.set(kind,result);return result;
  }
  function paint(color:string,kind:SurfaceKind='plaster',identity='') {
    const key=`${color}:${kind}:${identity}`;
    if(materials.has(key))return materials.get(key)!;
    const roughness=kind==='metal'?.27:kind==='water'?.19:kind==='ceramic'?.29:kind==='wood'?.67:kind==='fabric'?.99:kind==='foliage'?.83:.88;
    const textured=kind!=='metal'&&kind!=='ceramic',finish=textured?texture(kind==='stone'?'plaster':kind):null;
    const material=own(new THREE.MeshStandardMaterial({color,roughness,metalness:kind==='metal'?.72:0,side:THREE.DoubleSide,map:kind==='wood'||kind==='fabric'||kind==='foliage'?finish:null,roughnessMap:kind==='water'?null:finish,bumpMap:finish,bumpScale:kind==='wood'?.018:kind==='fabric'?.014:kind==='water'?.022:kind==='foliage'?.025:.008,envMapIntensity:kind==='metal'?1.15:kind==='water'?.9:.55}));
    material.userData.surface=kind;materials.set(key,material);return material;
  }
  return {paint};
}

/** One static shadow pass after assembly; sway stays inexpensive between rebuilds. */
export function configureSunShadow(light:THREE.DirectionalLight,extent:number,mapSize=1024) {
  light.castShadow=true;light.shadow.mapSize.set(mapSize,mapSize);
  Object.assign(light.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:.2,far:50});
  light.shadow.normalBias=.018;light.shadow.bias=-.0002;light.shadow.radius=4.5;light.shadow.intensity=.84;
  light.shadow.camera.updateProjectionMatrix();
}
export function prepareSurfaceShadows(root:THREE.Object3D) {
  root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const materials=Array.isArray(object.material)?object.material:[object.material];const solid=materials.some(material=>material instanceof THREE.MeshStandardMaterial);object.castShadow=solid&&!materials.some(material=>material.userData.surface==='water');object.receiveShadow=solid;});
}
export function roomSurface(material:string):SurfaceKind {
  return material==='wood'?'wood':material==='brass'?'metal':material==='mirror'||material==='water'?'water':material==='floor'||material==='ground'?'stone':material==='blush'?'fabric':material==='sage'||material==='leaf'||material==='foliage'?'foliage':material==='paper'?'ceramic':'plaster';
}
