import {BLUEPRINT_FLOOR_Y,BLUEPRINT_PRODUCT_HEIGHT,BLUEPRINT_PRODUCT_RADIUS,blueprintNodeCorners,resolveBlueprintAnchors,validateSceneBlueprint,type SceneBlueprint} from './scene-blueprint';
import type {SceneResult} from './types';

/** Renderer-independent, fixed isometric geometry for the no-WebGL projection. */
export interface ProjectionPoint {x:number;y:number;z:number;}
export interface ProjectedPoint {x:number;y:number;depth:number;}
export interface ProjectionFit {width:number;height:number;scale:number;offsetX:number;offsetY:number;}
export type ProjectionShape = 'box'|'cylinder'|'tapered'|'sphere'|'leaf'|'oval'|'arch'|'ring'|'wallArc';
export type ProjectionFace = ProjectionPoint[];

/** Matches the Three renderer: yaw π/4, elevation atan(1/√2), Y points up. */
export function projectWorldPoint(point:ProjectionPoint):ProjectedPoint {
  return {x:(point.x-point.z)/Math.sqrt(2),y:(point.x+point.z)/Math.sqrt(6)-point.y*Math.sqrt(2/3),depth:(point.x+point.y+point.z)/Math.sqrt(3)};
}
export function fitProjection(points:ProjectionPoint[],width:number,height:number,padding=32):ProjectionFit {
  const safeWidth=Math.max(1,width),safeHeight=Math.max(1,height);
  const projected=points.map(projectWorldPoint);
  const minX=Math.min(...projected.map(p=>p.x),0),maxX=Math.max(...projected.map(p=>p.x),0);
  const minY=Math.min(...projected.map(p=>p.y),0),maxY=Math.max(...projected.map(p=>p.y),0);
  const inset=Math.max(0,Math.min(padding,safeWidth*.2,safeHeight*.2));
  const scale=Math.min((safeWidth-inset*2)/Math.max(.01,maxX-minX),(safeHeight-inset*2)/Math.max(.01,maxY-minY));
  return {width:safeWidth,height:safeHeight,scale,offsetX:safeWidth/2-(minX+maxX)/2*scale,offsetY:safeHeight/2-(minY+maxY)/2*scale};
}
export function projectIntoFrame(point:ProjectionPoint,fit:ProjectionFit):ProjectedPoint {
  const projected=projectWorldPoint(point);
  return {x:fit.offsetX+projected.x*fit.scale,y:fit.offsetY+projected.y*fit.scale,depth:projected.depth};
}

/** Scale, then Euler XYZ rotation, then translation; no executable scene instructions. */
export function transformBlueprintPoint(point:ProjectionPoint,position:ProjectionPoint,scale:ProjectionPoint,rotation:ProjectionPoint):ProjectionPoint {
  let x=point.x*scale.x,y=point.y*scale.y,z=point.z*scale.z;
  // THREE.Euler's default XYZ matrix applies Z to the vector first.
  const cz=Math.cos(rotation.z),sz=Math.sin(rotation.z);[x,y]=[x*cz-y*sz,x*sz+y*cz];
  const cy=Math.cos(rotation.y),sy=Math.sin(rotation.y);[x,z]=[x*cy+z*sy,-x*sy+z*cy];
  const cx=Math.cos(rotation.x),sx=Math.sin(rotation.x);[y,z]=[y*cx-z*sx,y*sx+z*cx];
  return {x:x+position.x,y:y+position.y,z:z+position.z};
}
const p=(x:number,y:number,z:number):ProjectionPoint=>({x,y,z});
function extrude(outline:{x:number;y:number}[]):ProjectionFace[] {
  const front=outline.map(v=>p(v.x,v.y,.5)),back=outline.map(v=>p(v.x,v.y,-.5));
  return [front,back.toReversed(),...front.map((v,i)=>{const j=(i+1)%front.length;return [v,front[j],back[j],back[i]];})];
}
function cylinder(topRadius=.5,segments=10,bottomRadius=.5):ProjectionFace[] {
  const lower=Array.from({length:segments},(_,i)=>p(Math.cos(i/segments*Math.PI*2)*bottomRadius,-.5,Math.sin(i/segments*Math.PI*2)*bottomRadius));
  const upper=Array.from({length:segments},(_,i)=>p(Math.cos(i/segments*Math.PI*2)*topRadius,.5,Math.sin(i/segments*Math.PI*2)*topRadius));
  return [lower,upper.toReversed(),...lower.map((v,i)=>{const j=(i+1)%segments;return [v,upper[i],upper[j],lower[j]];})];
}
function sphere(segments=10,rings=5):ProjectionFace[] {
  const rows=Array.from({length:rings+1},(_,i)=>Array.from({length:segments},(_,j)=>{
    const latitude=-Math.PI/2+i/rings*Math.PI,longitude=j/segments*Math.PI*2;
    return p(Math.cos(latitude)*Math.cos(longitude)*.5,Math.sin(latitude)*.5,Math.cos(latitude)*Math.sin(longitude)*.5);
  }));
  return rows.slice(0,-1).flatMap((row,i)=>row.map((v,j)=>[v,row[(j+1)%segments],rows[i+1][(j+1)%segments],rows[i+1][j]]));
}
function torus(half=false,segments=16):ProjectionFace[] {
  const tube=half?.055:.025,arc=half?Math.PI:Math.PI*2,radial=6;
  const vertices=Array.from({length:segments+1},(_,i)=>Array.from({length:radial},(_,j)=>{
    const theta=i/segments*arc,phi=j/radial*Math.PI*2,radius=.5+tube*Math.cos(phi);
    return p(radius*Math.cos(theta),radius*Math.sin(theta),tube*Math.sin(phi));
  }));
  return vertices.slice(0,-1).flatMap((row,i)=>row.map((point,j)=>[point,vertices[i+1][j],vertices[i+1][(j+1)%radial],row[(j+1)%radial]]));
}
function wallArc(segments=16):ProjectionFace[] {
  const points=Array.from({length:segments+1},(_,i)=>{const theta=Math.PI*.5+i/segments*Math.PI*1.06;return {x:Math.sin(theta)*.5,z:Math.cos(theta)*.5};});
  return points.slice(0,-1).map((point,i)=>[p(point.x,-.5,point.z),p(point.x,.5,point.z),p(points[i+1].x,.5,points[i+1].z),p(points[i+1].x,-.5,points[i+1].z)]);
}
function icosahedron(detail=0):ProjectionFace[] {
  const t=(1+Math.sqrt(5))/2;
  const points=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(([x,y,z])=>p(x,y,z));
  const indices=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  const normalize=(v:ProjectionPoint)=>{const n=Math.hypot(v.x,v.y,v.z)*2;return p(v.x/n,v.y/n,v.z/n);};
  let faces=indices.map(indices=>indices.map(index=>normalize(points[index])));
  if(detail){const middle=(a:ProjectionPoint,b:ProjectionPoint)=>normalize(p((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2));faces=faces.flatMap(([a,b,c])=>{const ab=middle(a,b),bc=middle(b,c),ca=middle(c,a);return [[a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]];});}
  return faces;
}
function normalizeFaces(faces:ProjectionFace[]):ProjectionFace[] {
  const points=faces.flat(),bounds=Object.fromEntries((['x','y','z'] as const).map(axis=>[axis,{min:Math.min(...points.map(p=>p[axis])),max:Math.max(...points.map(p=>p[axis]))}])) as Record<'x'|'y'|'z',{min:number;max:number}>;
  return faces.map(face=>face.map(point=>Object.fromEntries((['x','y','z'] as const).map(axis=>[axis,(point[axis]-(bounds[axis].min+bounds[axis].max)/2)/(bounds[axis].max-bounds[axis].min)])) as unknown as ProjectionPoint));
}
const geometryCache=new Map<string,ProjectionFace[]>();
/** Unit bounding boxes are the schema contract. Geometry is authored here, never model SVG. */
export function blueprintUnitFaces(shape:ProjectionShape,thumbnail=false):ProjectionFace[] {
  const key=shape+':'+thumbnail,known=geometryCache.get(key);if(known)return known;
  let faces:ProjectionFace[];
  switch(shape){
    case 'box':faces=extrude([{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}]);break;
    case 'cylinder':faces=cylinder(.5,thumbnail?8:12);break;
    case 'tapered':faces=cylinder(.5,thumbnail?8:14,.32/.9);break;
    case 'sphere':faces=icosahedron(thumbnail?0:1);break;
    case 'oval':faces=sphere(thumbnail?8:12,thumbnail?4:6);break;
    case 'leaf':faces=icosahedron(0);break;
    case 'arch':faces=torus(true,thumbnail?8:16);break;
    case 'ring':faces=torus(false,thumbnail?12:20);break;
    case 'wallArc':faces=wallArc(thumbnail?10:20);break;
    default:throw new Error('Unknown blueprint primitive.');
  }
  faces=normalizeFaces(faces);geometryCache.set(key,faces);return faces;
}
export function faceDepth(points:ProjectionPoint[]):number {
  return points.reduce((sum,point)=>sum+projectWorldPoint(point).depth,0)/Math.max(1,points.length);
}
export function faceShade(color:string,points:ProjectionPoint[],intensity=1):string {
  if(!/^#[0-9a-f]{6}$/i.test(color))return '#16424a';
  const [a,b,c]=points;
  if(!a||!b||!c)return color;
  const u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
  const normal={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x};
  const length=Math.hypot(normal.x,normal.y,normal.z)||1;
  const diffuse=Math.max(0,(-normal.x*.35+normal.y*.8+normal.z*.48)/length);
  const factor=Math.max(.58,Math.min(1.1,.7+diffuse*.31+(intensity-1)*.07));
  return '#'+[1,3,5].map(index=>Math.round(Math.min(255,parseInt(color.slice(index,index+2),16)*factor)).toString(16).padStart(2,'0')).join('');
}

export interface BlueprintProjectedFace {nodeId:string;points:string;fill:string;depth:number;}
export interface BlueprintProjectedProduct {skuId:string;x:number;y:number;width:number;height:number;depth:number;supportY:number;}
export interface BlueprintProjection {fit:ProjectionFit;terrain:BlueprintProjectedFace[];faces:BlueprintProjectedFace[];products:BlueprintProjectedProduct[];}
export type BlueprintPaintEntry = {kind:'face';face:BlueprintProjectedFace}|{kind:'product';product:BlueprintProjectedProduct};

/** Scenery can occlude catalog illustrations; both share one far-to-near painter pass. */
export function blueprintPaintOrder(projection:Pick<BlueprintProjection,'faces'|'products'>):BlueprintPaintEntry[] {
  const entries:BlueprintPaintEntry[]=[...projection.faces.map(face=>({kind:'face' as const,face})),...projection.products.map(product=>({kind:'product' as const,product}))];
  const depth=(entry:BlueprintPaintEntry)=>entry.kind==='face'?entry.face.depth:entry.product.depth;
  return entries.sort((a,b)=>depth(a)-depth(b));
}

/** A saved browser profile gets the same geometry validation as a new response. */
export function validatedBlueprintForScene(scene:SceneResult):SceneBlueprint|null {
  if(!scene.blueprint)return null;
  try{return validateSceneBlueprint(scene.blueprint,scene.items.map(item=>item.skuId));}catch{return null;}
}

export function createBlueprintProjection(blueprint:SceneBlueprint,width=900,height=620,thumbnail=false):BlueprintProjection {
  const plan=validateSceneBlueprint(blueprint,blueprint.anchors.map(anchor=>anchor.skuId));
  const anchors=resolveBlueprintAnchors(plan);
  const top=plan.terrain.outline.map(point=>p(point.x,BLUEPRINT_FLOOR_Y,point.z));
  const bottom=top.map(point=>p(point.x,BLUEPRINT_FLOOR_Y-plan.terrain.depth,point.z));
  const bounds=[...top,...bottom,...plan.nodes.flatMap(blueprintNodeCorners),...anchors.flatMap(anchor=>{
    const r=BLUEPRINT_PRODUCT_RADIUS*anchor.scale,h=BLUEPRINT_PRODUCT_HEIGHT*anchor.scale;
    return [-1,1].flatMap(x=>[-1,1].flatMap(z=>[0,h].map(y=>p(anchor.x+x*r,anchor.y+y,anchor.z+z*r))));
  })];
  const fit=fitProjection(bounds,width,height,thumbnail?12:32);
  const projectFace=(points:ProjectionFace,color:string,nodeId:string):BlueprintProjectedFace=>({nodeId,depth:faceDepth(points),fill:faceShade(color,points,plan.atmosphere.intensity),points:points.map(point=>{const at=projectIntoFrame(point,fit);return `${at.x.toFixed(2)},${at.y.toFixed(2)}`;}).join(' ')});
  const terrain=top.map((point,index)=>{const next=(index+1)%top.length;return projectFace([point,bottom[index],bottom[next],top[next]],plan.palette.ground,'terrain-side');}).sort((a,b)=>a.depth-b.depth);
  terrain.push({...projectFace(top,plan.palette.ground,'terrain-top'),fill:plan.palette.ground});
  const faces=plan.nodes.flatMap(node=>blueprintUnitFaces(node.shape,thumbnail).map(face=>projectFace(face.map(point=>transformBlueprintPoint(point,node.position,node.scale,node.rotation)),plan.palette[node.material],node.id))).sort((a,b)=>a.depth-b.depth);
  const products=anchors.map(anchor=>{const at=projectIntoFrame(anchor,fit);return {skuId:anchor.skuId,x:at.x,y:at.y,width:fit.scale*anchor.scale*.95,height:fit.scale*anchor.scale*.86,depth:at.depth,supportY:anchor.y};}).sort((a,b)=>a.depth-b.depth);
  return {fit,terrain,faces,products};
}
