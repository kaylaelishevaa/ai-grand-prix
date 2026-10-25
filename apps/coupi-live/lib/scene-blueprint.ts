import {z} from 'zod';

export const BLUEPRINT_FLOOR_Y=.18;
export const BLUEPRINT_PRODUCT_RADIUS=.34;
export const BLUEPRINT_PRODUCT_HEIGHT=1;
export const BLUEPRINT_BOUNDS={x:3.8,z:3.3,minY:BLUEPRINT_FLOOR_Y,maxY:3.8} as const;
export const BLUEPRINT_SHAPES=['box','cylinder','tapered','sphere','leaf','oval','arch','ring','wallArc'] as const;
export const BLUEPRINT_MATERIALS=['ground','structure','wood','foliage','accent','water'] as const;
const hex=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const position=z.object({x:z.number().min(-3.8).max(3.8),y:z.number().min(.18).max(3.8),z:z.number().min(-3.3).max(3.3)}).strict();
const scale=z.object({x:z.number().min(.04).max(7.6),y:z.number().min(.04).max(7.6),z:z.number().min(.04).max(6.6)}).strict();
const angle=z.number().min(-Math.PI).max(Math.PI);
const rotation=z.object({x:angle,y:angle,z:angle}).strict();
const nodeFields={id:z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),label:z.string().min(1).max(60),material:z.enum(BLUEPRINT_MATERIALS),position,scale};
const nodeSchema=z.object({...nodeFields,shape:z.enum(BLUEPRINT_SHAPES),rotation,motion:z.enum(['none','sway','float']),support:z.boolean().describe('True only for a box or cylinder with rotation.x=0, rotation.z=0 and motion=none. Oval, arch, sphere, leaf, tapered, ring and wallArc are decoration: support=false. Use a shallow upright cylinder for an oval tabletop.')}).strict();
const point=z.object({x:z.number().min(-3.8).max(3.8),z:z.number().min(-3.3).max(3.3)}).strict();
const palette=z.object({ground:hex,structure:hex,wood:hex,foliage:hex,accent:hex,water:hex}).strict();
export const sceneBlueprintSchema=z.object({
  version:z.literal(1),designNote:z.string().min(1).max(320),
  terrain:z.object({outline:z.array(point).min(8).max(14),depth:z.number().min(.3).max(.9)}).strict(),
  palette,
  atmosphere:z.object({skyTop:hex,skyBottom:hex,lightColor:hex,intensity:z.number().min(.6).max(2),timeLabel:z.string().min(1).max(45),weatherLabel:z.string().min(1).max(60)}).strict(),
  nodes:z.array(nodeSchema).min(8).max(36),
  anchors:z.array(z.object({skuId:z.string().min(1).max(100),supportId:z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).nullable(),x:z.number().min(-3.8).max(3.8),z:z.number().min(-3.3).max(3.3),yaw:angle,scale:z.number().min(.55).max(1.15)}).strict()).min(2).max(6),
}).strict();
export type WorldBlueprint=z.infer<typeof sceneBlueprintSchema>;
export type SceneBlueprint=WorldBlueprint;
export type BlueprintNode=WorldBlueprint['nodes'][number];
export type BlueprintAnchor=WorldBlueprint['anchors'][number];
export type ResolvedBlueprintAnchor=BlueprintAnchor&{y:number};
export interface BlueprintPoint {x:number;z:number;}
const EPS=1e-7;
const rounded=(value:number)=>Math.round(value*1000)/1000;
export class BlueprintValidationError extends Error {constructor(message:string){super(message);this.name='BlueprintValidationError';}}
/** Never include arbitrary model/user strings in persisted diagnostics or retry feedback. */
export function blueprintValidationFeedback(error:unknown):string {
  if(error instanceof BlueprintValidationError)return error.message.slice(0,4800);
  if(error instanceof z.ZodError)return 'Schema constraint failed: '+error.issues.slice(0,5).map(issue=>{
    const path=issue.path.filter(part=>typeof part==='number'||(typeof part==='string'&&/^[a-zA-Z]{1,40}$/.test(part))).join('.');
    const bounds=issue as unknown as {minimum?:unknown;maximum?:unknown};
    return `${path||'result'} (${issue.code}${typeof bounds.minimum==='number'?`, minimum ${bounds.minimum}`:''}${typeof bounds.maximum==='number'?`, maximum ${bounds.maximum}`:''})`;
  }).join('; ')+'. Supports require box/cylinder, rotation.x=rotation.z=0, motion=none. Follow every declared field bound.';
  if(error instanceof SyntaxError)return 'The output was not complete valid JSON. Return one complete object with the required blueprint.';
  const allowed=['Invalid district count','Duplicate district','Invented provenance','Invalid or duplicate product','District exceeds your budget','A closet and makeup request needs both wardrobe and beauty products','Invalid scene SKU','Incomplete structured output'];
  if(error instanceof Error&&allowed.includes(error.message))return error.message==='Incomplete structured output'?'Output was incomplete or hit its token limit. Use fewer concise nodes and return a complete blueprint.':error.message;
  return 'The structured world did not satisfy geometry, product, budget or provenance validation. Recheck the declared constraints.';
}
const cross=(a:BlueprintPoint,b:BlueprintPoint,c:BlueprintPoint)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function onSegment(a:BlueprintPoint,b:BlueprintPoint,p:BlueprintPoint){return Math.abs(cross(a,b,p))<EPS&&p.x>=Math.min(a.x,b.x)-EPS&&p.x<=Math.max(a.x,b.x)+EPS&&p.z>=Math.min(a.z,b.z)-EPS&&p.z<=Math.max(a.z,b.z)+EPS;}
function intersects(a:BlueprintPoint,b:BlueprintPoint,c:BlueprintPoint,d:BlueprintPoint){
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  return (abC*abD<0&&cdA*cdB<0)||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
}
function edgeDistance(p:BlueprintPoint,a:BlueprintPoint,b:BlueprintPoint){
  const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/length)):0;
  return Math.hypot(p.x-(a.x+t*dx),p.z-(a.z+t*dz));
}
export function blueprintPointInside(point:BlueprintPoint,outline:BlueprintPoint[],margin=0):boolean {
  let inside=false;
  for(let i=0,j=outline.length-1;i<outline.length;j=i++){
    const a=outline[i],b=outline[j];
    if(margin>0&&edgeDistance(point,a,b)<margin-EPS)return false;
    if(onSegment(a,b,point))return margin<=0;
    if((a.z>point.z)!==(b.z>point.z)&&point.x<(b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return inside;
}
/** Canonical primitives have a centered unit bounding box; Euler order is Three.js XYZ. */
export function blueprintNodeCorners(node:BlueprintNode){
  const {x:rx,y:ry,z:rz}=node.rotation,result:{x:number;y:number;z:number}[]=[];
  for(const sx of [-.5,.5])for(const sy of [-.5,.5])for(const sz of [-.5,.5]){
    const x=sx*node.scale.x,y=sy*node.scale.y,z=sz*node.scale.z;
    const zx=x*Math.cos(rz)-y*Math.sin(rz),zy=x*Math.sin(rz)+y*Math.cos(rz);
    const yx=zx*Math.cos(ry)+z*Math.sin(ry),yz=-zx*Math.sin(ry)+z*Math.cos(ry);
    result.push({x:yx+node.position.x,y:zy*Math.cos(rx)-yz*Math.sin(rx)+node.position.y,z:zy*Math.sin(rx)+yz*Math.cos(rx)+node.position.z});
  }
  return result;
}
export function blueprintAnchorFitsSupport(anchor:BlueprintAnchor,node:BlueprintNode):boolean {
  const radius=BLUEPRINT_PRODUCT_RADIUS*anchor.scale,dx=anchor.x-node.position.x,dz=anchor.z-node.position.z;
  const x=dx*Math.cos(node.rotation.y)-dz*Math.sin(node.rotation.y),z=dx*Math.sin(node.rotation.y)+dz*Math.cos(node.rotation.y);
  const a=node.scale.x/2-radius,b=node.scale.z/2-radius;
  if(a<0||b<0)return false;
  return node.shape==='box'?Math.abs(x)<=a+EPS&&Math.abs(z)<=b+EPS:Math.hypot(x/(node.scale.x/2),z/(node.scale.z/2))+radius/Math.min(node.scale.x/2,node.scale.z/2)<=1+EPS;
}
/** Product Y is a derived fact, never a guessed model field. */
export function resolveBlueprintAnchors(blueprint:WorldBlueprint):ResolvedBlueprintAnchor[]{
  return blueprint.anchors.map(anchor=>{
    const support=anchor.supportId?blueprint.nodes.find(node=>node.id===anchor.supportId):undefined;
    if(anchor.supportId&&!support)throw new BlueprintValidationError('Blueprint product support does not exist.');
    return {...anchor,y:support?support.position.y+support.scale.y/2:BLUEPRINT_FLOOR_Y};
  });
}
export function validateSceneBlueprint(value:unknown,skuIds:string[]):WorldBlueprint {
  const blueprint=sceneBlueprintSchema.parse(value),outline=blueprint.terrain.outline;
  const area=Math.abs(outline.reduce((sum,p,index)=>{const q=outline[(index+1)%outline.length];return sum+p.x*q.z-q.x*p.z;},0))/2;
  if(area<8)throw new BlueprintValidationError(`Terrain area ${rounded(area)} is below 8 square units.`);
  for(let i=0;i<outline.length;i++){
    const next=(i+1)%outline.length;if(Math.hypot(outline[i].x-outline[next].x,outline[i].z-outline[next].z)<.18)throw new BlueprintValidationError('Blueprint terrain edges are too short.');
    for(let j=i+1;j<outline.length;j++){
      const end=(j+1)%outline.length;if(j===next||end===i)continue;
      if(intersects(outline[i],outline[next],outline[j],outline[end]))throw new BlueprintValidationError(`Terrain edges ${i}-${next} and ${j}-${end} intersect. Order vertices around one simple perimeter.`);
    }
  }
  const issues:string[]=[];
  const issue=(message:string)=>{if(issues.length<12)issues.push(message);};
  const nodeIds=new Set<string>();
  for(const node of blueprint.nodes){
    if(nodeIds.has(node.id))issue(`Node ID ${node.id} is duplicated.`);nodeIds.add(node.id);
    if(!blueprintPointInside(node.position,outline))issue(`Node ${node.id} center x=${rounded(node.position.x)},z=${rounded(node.position.z)} is outside the terrain.`);
    const corners=blueprintNodeCorners(node);
    if(corners.some(p=>Math.abs(p.x)>3.8+EPS||Math.abs(p.z)>3.3+EPS||p.y<BLUEPRINT_FLOOR_Y-EPS||p.y>3.8+EPS)){
      const ranges=['x','y','z'].map(axis=>{const values=corners.map(p=>p[axis as 'x'|'y'|'z']);return `${axis}=[${rounded(Math.min(...values))},${rounded(Math.max(...values))}]`;}).join(',');
      issue(`Node ${node.id} rotated bounds ${ranges}; allowed x=[-3.8,3.8],y=[.18,3.8],z=[-3.3,3.3]. Move or shrink this node.`);
    }
    if(node.support){
      if(!['box','cylinder'].includes(node.shape)||Math.abs(node.rotation.x)>EPS||Math.abs(node.rotation.z)>EPS||node.motion!=='none')issue(`Support ${node.id} must be a stationary upright box/cylinder; shape=${node.shape},rotation.x/z=${rounded(node.rotation.x)}/${rounded(node.rotation.z)},motion=${node.motion}.`);
      if(corners.some(p=>!blueprintPointInside(p,outline)))issue(`Support ${node.id} bounding footprint exceeds terrain; x/z size=${rounded(node.scale.x)}/${rounded(node.scale.z)}, center=${rounded(node.position.x)}/${rounded(node.position.z)}. Move inward or shrink it.`);
    }
  }
  const ids=blueprint.anchors.map(anchor=>anchor.skuId);
  if(new Set(ids).size!==ids.length||ids.length!==skuIds.length||skuIds.some(id=>!ids.includes(id)))issue('Blueprint anchors must match every selected product exactly once.');
  for(const anchor of blueprint.anchors){
    if(!skuIds.includes(anchor.skuId))continue;
    const radius=BLUEPRINT_PRODUCT_RADIUS*anchor.scale;
    if(!blueprintPointInside(anchor,outline,radius+.02))issue(`Product ${anchor.skuId} at x=${rounded(anchor.x)},z=${rounded(anchor.z)} needs terrain-edge clearance ${rounded(radius+.02)}.`);
    let top=BLUEPRINT_FLOOR_Y;
    if(anchor.supportId){
      const support=blueprint.nodes.find(node=>node.id===anchor.supportId);
      if(!support?.support){issue(`Product ${anchor.skuId} refers to ${anchor.supportId}, which is missing or not support=true.`);continue;}
      top=support.position.y+support.scale.y/2;
      if(!blueprintAnchorFitsSupport(anchor,support))issue(`Product ${anchor.skuId} at x=${rounded(anchor.x)},z=${rounded(anchor.z)},radius=${rounded(radius)} does not fit support ${support.id} (${support.shape},center=${rounded(support.position.x)}/${rounded(support.position.z)},size=${rounded(support.scale.x)}/${rounded(support.scale.z)},yaw=${rounded(support.rotation.y)}). Center it or enlarge the support safely.`);
    }
    if(top+BLUEPRINT_PRODUCT_HEIGHT*anchor.scale>3.8+EPS)issue(`Product ${anchor.skuId} top=${rounded(top+BLUEPRINT_PRODUCT_HEIGHT*anchor.scale)} exceeds y=3.8. Lower its support.`);
  }
  const resolved=blueprint.anchors.filter(anchor=>skuIds.includes(anchor.skuId));
  for(let i=0;i<resolved.length;i++)for(let j=i+1;j<resolved.length;j++){
    const actual=Math.hypot(resolved[i].x-resolved[j].x,resolved[i].z-resolved[j].z),minimum=BLUEPRINT_PRODUCT_RADIUS*(resolved[i].scale+resolved[j].scale)+.10;
    if(actual<minimum)issue(`Products ${resolved[i].skuId}/${resolved[j].skuId} are ${rounded(actual)} apart; need at least ${rounded(minimum)} horizontal separation.`);
  }
  if(issues.length)throw new BlueprintValidationError(issues.map((message,index)=>`${index+1}. ${message}`).join('\n'));
  return blueprint;
}

/** The model authors the world; this bounded compiler resolves contact and product packing. */
export function compileSceneBlueprint(value:unknown,skuIds:string[]):WorldBlueprint {
  const blueprint=sceneBlueprintSchema.parse(value);
  const ids=blueprint.anchors.map(anchor=>anchor.skuId);
  if(new Set(ids).size!==ids.length||ids.length!==skuIds.length||skuIds.some(id=>!ids.includes(id)))throw new BlueprintValidationError('Blueprint anchors must match every selected product exactly once.');
  // Never shrink, reshape or move the scenery in X/Z. Unsupported primitives
  // remain exactly as authored decoration; they cannot carry product anchors.
  // The existing placement pass below reassigns those anchors to valid surfaces.
  for(const node of blueprint.nodes){
    if(node.support&&(!['box','cylinder'].includes(node.shape)||Math.abs(node.rotation.x)>EPS||Math.abs(node.rotation.z)>EPS||node.motion!=='none'))node.support=false;
    const bottom=Math.min(...blueprintNodeCorners(node).map(point=>point.y));
    if(bottom<BLUEPRINT_FLOOR_Y-EPS)node.position.y+=BLUEPRINT_FLOOR_Y-bottom;
  }
  const supports=blueprint.nodes.filter(node=>node.support&&['box','cylinder'].includes(node.shape)&&Math.abs(node.rotation.x)<=EPS&&Math.abs(node.rotation.z)<=EPS&&node.motion==='none');
  const bounds=blueprint.nodes.map(node=>{const points=blueprintNodeCorners(node);return{minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))};});
  const placed:BlueprintAnchor[]=[];
  const fits=(anchor:BlueprintAnchor):boolean=>{
    const radius=BLUEPRINT_PRODUCT_RADIUS*anchor.scale;
    if(!blueprintPointInside(anchor,blueprint.terrain.outline,radius+.02))return false;
    if(placed.some(other=>Math.hypot(anchor.x-other.x,anchor.z-other.z)<BLUEPRINT_PRODUCT_RADIUS*(anchor.scale+other.scale)+.10-EPS))return false;
    if(anchor.supportId){
      const support=supports.find(node=>node.id===anchor.supportId);
      return !!support&&support.position.y+support.scale.y/2+BLUEPRINT_PRODUCT_HEIGHT*anchor.scale<=3.8+EPS&&blueprintAnchorFitsSupport(anchor,support);
    }
    // A floor candidate must not intersect the authored scenery at product height.
    const top=BLUEPRINT_FLOOR_Y+BLUEPRINT_PRODUCT_HEIGHT*anchor.scale;
    return !bounds.some(box=>box.maxY>BLUEPRINT_FLOOR_Y+EPS&&box.minY<top-EPS&&Math.hypot(Math.max(box.minX-anchor.x,0,anchor.x-box.maxX),Math.max(box.minZ-anchor.z,0,anchor.z-box.maxZ))<radius+.02-EPS);
  };
  const scaleChoices=(scale:number)=>{
    const values=[scale];for(let next=scale-.1;next>.55+EPS;next-=.1)values.push(Math.round(next*1000)/1000);
    if(scale>.55+EPS)values.push(.55);return values;
  };
  const nearest=(points:BlueprintPoint[],origin:BlueprintPoint)=>points.sort((a,b)=>Math.hypot(a.x-origin.x,a.z-origin.z)-Math.hypot(b.x-origin.x,b.z-origin.z)||a.x-b.x||a.z-b.z);
  const onSupport=(anchor:BlueprintAnchor,support:BlueprintNode,scale:number):BlueprintAnchor[]=>{
    const radius=BLUEPRINT_PRODUCT_RADIUS*scale,halfX=support.scale.x/2,halfZ=support.scale.z/2;
    const innerX=halfX-radius,innerZ=halfZ-radius;if(innerX<0||innerZ<0)return[];
    const angle=support.rotation.y,dx=anchor.x-support.position.x,dz=anchor.z-support.position.z;
    let x=dx*Math.cos(angle)-dz*Math.sin(angle),z=dx*Math.sin(angle)+dz*Math.cos(angle);
    if(support.shape==='box'){x=Math.max(-innerX,Math.min(innerX,x));z=Math.max(-innerZ,Math.min(innerZ,z));}
    else{const distance=Math.hypot(x/halfX,z/halfZ),limit=Math.max(0,1-radius/Math.min(halfX,halfZ));if(distance>limit&&distance>0){x*=limit/distance;z*=limit/distance;}}
    const local:BlueprintPoint[]=[{x,z},{x:0,z:0}];
    for(let ix=0;ix<=8;ix++)for(let iz=0;iz<=8;iz++)local.push({x:-innerX+2*innerX*ix/8,z:-innerZ+2*innerZ*iz/8});
    const points=local.map(point=>({x:support.position.x+point.x*Math.cos(angle)+point.z*Math.sin(angle),z:support.position.z-point.x*Math.sin(angle)+point.z*Math.cos(angle)}));
    return nearest(points,anchor).map(point=>({...anchor,...point,scale,supportId:support.id}));
  };
  for(const anchor of blueprint.anchors){
    // Preserve an already sound placement exactly; replaying a compiled plan cannot drift.
    if(fits(anchor)){placed.push(anchor);continue;}
    let selected:BlueprintAnchor|undefined;
    const ordered=[...supports].sort((a,b)=>Number(b.id===anchor.supportId)-Number(a.id===anchor.supportId)||Math.hypot(a.position.x-anchor.x,a.position.z-anchor.z)-Math.hypot(b.position.x-anchor.x,b.position.z-anchor.z)||a.id.localeCompare(b.id));
    for(const support of ordered){
      for(const scale of scaleChoices(anchor.scale)){
        selected=onSupport(anchor,support,scale).find(fits);if(selected)break;
      }
      if(selected)break;
    }
    if(!selected){
      // Fixed bounded search on the authored terrain, not a replacement room or layout.
      const points:BlueprintPoint[]=[{x:anchor.x,z:anchor.z}];
      for(let ix=0;ix<=38;ix++)for(let iz=0;iz<=33;iz++)points.push({x:-3.8+ix*.2,z:-3.3+iz*.2});
      const orderedPoints=nearest(points,anchor);
      for(const scale of scaleChoices(anchor.scale)){
        selected=orderedPoints.map(point=>({...anchor,...point,scale,supportId:null})).find(fits);if(selected)break;
      }
    }
    if(!selected)throw new BlueprintValidationError(`Product ${anchor.skuId} has no clear placement on the authored supports or terrain, even at scale=.55. Add usable support capacity or clear terrain space.`);
    placed.push(selected);
  }
  blueprint.anchors=placed;
  // The exact same strict gate applies to authored and compiled plans.
  return validateSceneBlueprint(blueprint,skuIds);
}

export const BLUEPRINT_INSTRUCTIONS=`Alongside each scene, DESIGN its own new 3D geometry blueprint. Do not select a prebuilt room template. Decorative scenery is an imagined miniature design, not merchandise, a reconstruction of the user's real home, or a claim about factual room dimensions; you may invent its artistic arrangement. The catalog-only facts rule applies to the selected products and user facts, not to decorative design. Compose a clear diagonal journey from the requested activity: an arrival path, one recognizable focal structure assembled from related primitives, useful supports integrated into that structure, a few organic landmarks and intentional negative space. Different requests must change actual geometry, placement, silhouette and atmosphere, not merely rename the same room. Prefer round/curved architecture, organic island edges, arches, foliage and varied heights; avoid isolated product pedestals, rows of square shelves or disconnected primitive piles. Use 12–24 purposeful nodes, never more than 36. The products are separate real mesh objects inserted by code; do not duplicate them with decorative nodes. When previousDistrict is supplied, edit that world's existing place/activity and geometry unless the user explicitly requests a different place or activity. Preserve its recognizable composition while applying the requested changes.
Blueprint rules: version 1; declarative JSON only, no URLs, code, shaders or external resources. Terrain is a simple non-self-intersecting 8–14-point polygon with area >=8, all x within -3.8..3.8 and z within -3.3..3.3; depth .3–.9, top y=.18. Each primitive has a centered unit bounding box scaled by scale{x,y,z}; Euler XYZ rotations are radians in -PI..PI. Every node's rotated bounding box must remain within x±3.8,z±3.3,y .18..3.8, and each scale component is >=.04. Node centers are inside the terrain. Colors are six-digit hex; material references one of ground/structure/wood/foliage/accent/water. Atmosphere is designed light/weather mood, never a claim about the user's real weather or location. At least 8 nodes are required. IDs are unique lowercase letters/digits/hyphens starting with a letter.
Exactly one anchor for each selected SKU, no extra products. Anchors give x,z,yaw and scale .55–1.15; code computes y. supportId=null puts a product on the terrain at y=.18. Otherwise supportId names a node with support=true: only a stationary box or cylinder, rotation.x=rotation.z=0, with top y=position.y+scale.y/2. Products have radius .34*anchor.scale and maximum height 1*scale. Each anchor must fit INSIDE the support footprint with that full radius as margin, inside the terrain with radius+.02 margin, and leave at least sum-of-radii+.10 horizontal distance from every other product. Support tops must leave height for products below y3.8. Make generous supports and place anchors centrally; never float products or attach them to decorative arches. Keep palette, sky gradients and light distinct for the scene's mood.`;
