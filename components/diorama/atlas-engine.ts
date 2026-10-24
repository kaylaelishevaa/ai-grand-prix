import * as THREE from 'three';
import {buildRoomArchitecture,createRoomGeometries,type RoomKit,type RoomMaterial} from './rooms';
import {createProductMeshLibrary} from './product-meshes';
import {assignRoomSlots,clamp,createFrameBudgetMonitor,damp,spring01} from './math';
import {atlasLayout,atlasCameraSpan} from './atlas-layout';
import {getSceneMood} from '@/lib/scene-moods';
import {buildBlueprintArchitecture,createBlueprintGeometryPool,normalizeBlueprintProduct} from './blueprint';
import {resolveSceneContext} from '@/lib/world-context';
import {getSku} from '@/lib/catalog';
import {resolveSceneKind} from '@/lib/scenes';
import type {SceneResult} from '@/lib/types';

export type AtlasPlace={id:string;name:string;scene:SceneResult};
export type AtlasProjection={id:string;x:number;y:number;visible:boolean};
export type AtlasController={resize:(width:number,height:number)=>void;setPointer:(x:number,y:number)=>void;setActive:(active:boolean)=>void;dispose:()=>void};

/** A single shared renderer joins all the little places into one traversable landscape. */
export function createWorldAtlas(canvas:HTMLCanvasElement,places:AtlasPlace[],options:{compact:boolean;reducedMotion:boolean;onReady:()=>void;onFailure:()=>void;onProjection:(points:AtlasProjection[])=>void}):AtlasController|null {
  const resources=new Set<{dispose():void}>();
  const own=<T extends{dispose():void}>(resource:T):T=>{resources.add(resource);return resource;};
  let renderer:THREE.WebGLRenderer|undefined,frameId=0,disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;cancelAnimationFrame(frameId);document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('webglcontextlost',lost);resources.forEach(resource=>{try{resource.dispose();}catch{}});try{renderer?.dispose();renderer?.forceContextLoss();}catch{}};
  let active=true,last:number|null=null,elapsed=0,ready=false;
  const frameBudget=createFrameBudgetMonitor();
  function visibility(){last=null;frameBudget.reset();if(!document.hidden&&active&&!disposed){cancelAnimationFrame(frameId);frameId=requestAnimationFrame(frame);}}
  function lost(event:Event){event.preventDefault();dispose();options.onFailure();}
  let draw=(_timestamp:number)=>{};
  function frame(timestamp:number){if(disposed||!active||document.hidden)return;draw(timestamp);if(!disposed)frameId=requestAnimationFrame(frame);}
  try{
    renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setClearColor(0x000000,0);
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
    const scene=new THREE.Scene(),landscape=new THREE.Group();scene.add(landscape);
    const generated=places.some(place=>!!place.scene.blueprint);
    scene.add(new THREE.HemisphereLight(generated?'#ffffff':'#fff6e6',generated?'#8b9393':'#849792',generated?1.8:2.4));
    const sun=new THREE.DirectionalLight(generated?'#fff8f0':'#fff0da',generated?1.7:2.5);sun.position.set(-8,12,7);scene.add(sun);
    const geometries=createRoomGeometries(own),blueprintGeometries=createBlueprintGeometryPool(geometries,own),products=createProductMeshLibrary(own);
    const materialCache=new Map<string,THREE.MeshLambertMaterial>();
    const paint=(color:string)=>{if(!materialCache.has(color))materialCache.set(color,own(new THREE.MeshLambertMaterial({color,flatShading:true,side:THREE.DoubleSide})));return materialCache.get(color)!;};
    const shadeCanvas=document.createElement('canvas');shadeCanvas.width=shadeCanvas.height=64;
    const context=shadeCanvas.getContext('2d');if(context){const gradient=context.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(30,45,53,.32)');gradient.addColorStop(.5,'rgba(30,45,53,.12)');gradient.addColorStop(1,'rgba(30,45,53,0)');context.fillStyle=gradient;context.fillRect(0,0,64,64);}
    const shadow=own(new THREE.MeshBasicMaterial({map:own(new THREE.CanvasTexture(shadeCanvas)),transparent:true,depthWrite:false,opacity:.5}));
    const layout=atlasLayout(places.length,options.compact),groups:THREE.Group[]=[],anchors:THREE.Object3D[]=[],weather:THREE.Group[]=[],rainy:boolean[]=[];
    const motions:{object:THREE.Object3D;rotation:THREE.Euler;position:THREE.Vector3;type:string;offset:number}[]=[];
    const bounds=new THREE.Box3();
    places.slice(0,layout.length).forEach((place,index)=>{
      const kind=resolveSceneKind(place.scene),context=resolveSceneContext(place.scene),mood=getSceneMood(kind,context),position=layout[index],blueprint=place.scene.blueprint;
      const group=new THREE.Group();group.position.set(position.x,position.y,position.z);group.scale.setScalar(position.scale);landscape.add(group);groups.push(group);
      const kit:RoomKit={
        piece(name,x=0,y=0,z=0){const part=new THREE.Group();part.name=`room:${name}`;part.position.set(x,y,z);group.add(part);return part;},
        mesh(parent,geometry,material,x,y,z,sx,sy,sz){const object=new THREE.Mesh(geometries[geometry],paint(mood.palette[material]));object.position.set(x,y,z);object.scale.set(sx,sy,sz);parent.add(object);return object;},
        blob(parent,x,z,sx,sz,y=.171){const object=new THREE.Mesh(geometries.plane,shadow);object.rotation.x=-Math.PI/2;object.position.set(x,y,z);object.scale.set(sx,sz,1);parent.add(object);},
      };
      const architecture=blueprint?own(buildBlueprintArchitecture(blueprint,kit,blueprintGeometries,key=>paint(blueprint.palette[key]))):null;
      if(!blueprint)buildRoomArchitecture(kind,kit,context);
      if(blueprint){const light=new THREE.PointLight(blueprint.atmosphere.lightColor,blueprint.atmosphere.intensity*2.2,position.scale*7,2);light.position.set(position.x,position.y+2.8,position.z+.6);scene.add(light);}
      group.traverse(object=>{if(object.userData.motion)motions.push({object,rotation:object.rotation.clone(),position:object.position.clone(),type:object.userData.motion,offset:index*2+motions.length*.3});});
      const items=place.scene.items.flatMap(item=>{const sku=getSku(item.skuId);return sku?[{skuId:sku.id,type:sku.type,name:sku.name,color:sku.color}]:[];}).slice(0,6);
      const slots=assignRoomSlots(items,kind);
      const surfaces:Record<string,number>={counter:1.165,hook:.56,'table-left':1.002,'table-right':1.002,shelf:1.672,sideboard:.825};
      items.forEach((item,itemIndex)=>{const slot=slots[itemIndex],model=products.build(item),anchor=architecture?.anchors.get(item.skuId);if(blueprint&&!anchor)throw new Error('Generated atlas is missing a product anchor.');if(anchor){normalizeBlueprintProduct(model,anchor);const placed=new THREE.Group();placed.position.set(anchor.x,anchor.y,anchor.z);placed.add(model);group.add(placed);}else{model.scale.setScalar(slot.scale??1);bounds.setFromObject(model);model.position.set(slot.x,slot.hangAt!==undefined?slot.hangAt-bounds.max.y:slot.surface??surfaces[slot.key]??slot.y,slot.z);group.add(model);}});
      // The label grows from the ground in front of the place, never from a product frame.
      const anchor=new THREE.Object3D();anchor.position.set(1.5,-.05,2.5);group.add(anchor);anchors.push(anchor);
      const islandShadow=new THREE.Mesh(geometries.plane,shadow);islandShadow.rotation.x=-Math.PI/2;islandShadow.position.set(position.x,-.64,position.z);islandShadow.scale.set(7.5*position.scale,6*position.scale,1);landscape.add(islandShadow);
      const air=new THREE.Group();air.position.copy(group.position);landscape.add(air);weather.push(air);
      const isRainy=blueprint?/\b(rain|rainy|drizzle|showers)\b/i.test(blueprint.atmosphere.weatherLabel):kind==='reading';rainy.push(isRainy);
      if(isRainy){
        const coordinates:number[]=[];for(let i=0;i<32;i++){const x=Math.sin(i*2.41)*2,y=.3+(i%8)*.27,z=Math.cos(i*1.61)*1.5;coordinates.push(x,y,z,x-.04,y-.22,z);}
        const geometry=own(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(coordinates,3));
        air.add(new THREE.LineSegments(geometry,own(new THREE.LineBasicMaterial({color:blueprint?.atmosphere.skyTop||'#94c2cf',transparent:true,opacity:.4,depthWrite:false}))));
      }else{
        for(let i=0;i<7;i++){const dot=new THREE.Mesh(geometries.sphere,paint(blueprint?.atmosphere.lightColor||(kind==='dressing'?'#ffc976':kind==='desk'?'#f4e0c3':'#fff0ab')));dot.position.set(Math.sin(i*2.1)*2,.7+(i%4)*.4,Math.cos(i*1.4)*1.3);dot.scale.setScalar(.025+i%2*.012);air.add(dot);}
      }
    });
    // A winding path makes the space legible as a journey. Its stones share one geometry.
    for(let index=0;index<layout.length-1;index++){
      const a=layout[index],b=layout[index+1];
      const start=new THREE.Vector3(a.x,-.23,a.z),end=new THREE.Vector3(b.x,-.23,b.z);
      const middle=start.clone().lerp(end,.5);middle.x+=(index%2?-.9:.9);middle.z+=.7;
      const curve=new THREE.CatmullRomCurve3([start,middle,end]);
      for(let stone=0;stone<20;stone++){
        const p=curve.getPoint(stone/19),mesh=new THREE.Mesh(geometries.oval,paint(stone%4===0?'#d2ac82':'#e4d0b5'));
        mesh.position.copy(p);mesh.scale.set(.23,.035,.15);mesh.rotation.y=stone*.37;landscape.add(mesh);
      }
    }
    // Small drifting cloud banks soften the route between places.
    const clouds=new THREE.Group();landscape.add(clouds);
    const cloudMaterial=own(new THREE.MeshBasicMaterial({color:'#fffaf0',transparent:true,opacity:.3,depthWrite:false}));
    for(let i=0;i<8;i++){const cloud=new THREE.Mesh(geometries.oval,cloudMaterial);cloud.position.set(Math.sin(i*2.5)*6,-.65,Math.cos(i*1.9)*5);cloud.scale.set(1.6+(i%3)*.35,.16,.72);clouds.add(cloud);}
    const camera=new THREE.OrthographicCamera(-9,9,5,-5,.1,80),target=new THREE.Vector3(0,-.15,0),projected=new THREE.Vector3();
    let width=1,height=1,pointerX=0,pointerY=0,targetX=0,targetY=0;
    const resize=(w:number,h:number)=>{width=Math.max(1,w);height=Math.max(1,h);renderer!.setSize(width,height,false);const aspect=width/height;const viewHeight=atlasCameraSpan(places.length,options.compact,aspect);camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.updateProjectionMatrix();};
    draw=(timestamp:number)=>{
      const dt=last===null?0:Math.min((timestamp-last)/1000,.05);last=timestamp;elapsed+=dt;
      if(ready&&elapsed>2&&frameBudget.sample(timestamp,true)){dispose();options.onFailure();return;}
      pointerX=damp(pointerX,targetX,2.5,dt);pointerY=damp(pointerY,targetY,2.5,dt);
      const yaw=Math.PI/4+(options.reducedMotion?0:pointerX*.045+Math.sin(elapsed*.14)*.009),pitch=.65+(options.reducedMotion?0:pointerY*.025);
      camera.position.set(Math.sin(yaw)*Math.cos(pitch)*26,-.15+Math.sin(pitch)*26,Math.cos(yaw)*Math.cos(pitch)*26);camera.lookAt(target);
      groups.forEach((group,index)=>{const p=layout[index],progress=options.reducedMotion?1:clamp((elapsed-index*.12)/1.25,0,1),amount=spring01(progress);group.position.y=p.y-(1-amount)*1.5;group.scale.setScalar(p.scale*(.82+.18*amount));});
      if(!options.reducedMotion){clouds.position.x=Math.sin(elapsed*.08)*.18;weather.forEach((air,index)=>{air.position.y=layout[index].y+(rainy[index]?-(elapsed*.24% .45):Math.sin(elapsed*.5+index)*.05);});motions.forEach(motion=>{const sway=Math.sin(elapsed*.7+motion.offset);motion.object.rotation.z=motion.rotation.z+sway*(motion.type==='curtain'?.018:motion.type==='tree'||motion.type==='sway'?.012:.008);if(motion.type==='paper'||motion.type==='water'||motion.type==='float')motion.object.position.y=motion.position.y+sway*.018;});}
      scene.updateMatrixWorld();camera.updateMatrixWorld();renderer!.render(scene,camera);
      options.onProjection(anchors.map((anchor,index)=>{anchor.getWorldPosition(projected);projected.project(camera);return{id:places[index].id,x:clamp((projected.x*.5+.5)*width,22,width-22),y:Math.min((-projected.y*.5+.5)*height,height-30),visible:elapsed>.7&&Math.abs(projected.x)<1&&Math.abs(projected.y)<1};}));
      if(!ready){ready=true;options.onReady();}
    };
    canvas.addEventListener('webglcontextlost',lost);document.addEventListener('visibilitychange',visibility);
    resize(canvas.clientWidth||800,canvas.clientHeight||600);frameId=requestAnimationFrame(frame);
    return{resize,setPointer(x,y){targetX=clamp(x,-1,1);targetY=clamp(y,-1,1);},setActive(next){active=next;last=null;frameBudget.reset();cancelAnimationFrame(frameId);if(next&&!document.hidden&&!disposed)frameId=requestAnimationFrame(frame);},dispose};
  }catch{dispose();return null;}
}
