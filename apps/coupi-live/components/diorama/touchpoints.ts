export type ProjectedTouchpoint={skuId:string;x:number;y:number};
export type SceneTouchpoint=ProjectedTouchpoint&{anchorX:number;anchorY:number};

/** Six real 44px hit targets must never compete for the same screen pixels.
 * Stable SKU order makes the result independent of renderer traversal order. */
export function separateTouchpoints(points:ProjectedTouchpoint[],width:number,height:number):SceneTouchpoint[] {
  const margin=24,gap=46,minX=Math.min(margin,width/2),maxX=Math.max(minX,width-margin),minY=Math.min(margin,height/2),maxY=Math.max(minY,height-margin);
  const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
  const placed:SceneTouchpoint[]=[];
  for(const point of [...points].sort((a,b)=>a.skuId.localeCompare(b.skuId))){
    const x=clamp(point.x,minX,maxX),y=clamp(point.y,minY,maxY);
    const candidates=[{x,y}];
    for(let row=-3;row<=3;row++)for(let col=-3;col<=3;col++)candidates.push({x:clamp(x+col*gap,minX,maxX),y:clamp(y+row*gap,minY,maxY)});
    // The stage-wide reserve handles clusters against a corner without shrinking targets.
    for(let cy=minY;cy<=maxY;cy+=gap)for(let cx=minX;cx<=maxX;cx+=gap)candidates.push({x:cx,y:cy});
    candidates.sort((a,b)=>(a.x-x)**2+(a.y-y)**2-((b.x-x)**2+(b.y-y)**2)||a.y-b.y||a.x-b.x);
    const position=candidates.find(candidate=>placed.every(other=>Math.abs(candidate.x-other.x)>=gap-.001||Math.abs(candidate.y-other.y)>=gap-.001))||{x,y};
    placed.push({...position,skuId:point.skuId,anchorX:point.x,anchorY:point.y});
  }
  return points.flatMap(point=>{const result=placed.find(item=>item.skuId===point.skuId);return result?[result]:[];});
}
