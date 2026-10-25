import type {ProjectedTouchpoint} from './touchpoints';

/** A pointer-transparent listing preview stays inside the scene, never over its hit target. */
export function positionProductPreview(point:ProjectedTouchpoint,width:number,height:number) {
  const margin=12,topMargin=34,gap=28;
  const cardHeight=Math.min(190,Math.max(0,height-topMargin-margin));
  let cardWidth=Math.min(188,Math.max(0,width-margin*2));
  const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(Math.max(min,max),value));
  let x=point.x-cardWidth/2,y=point.y-gap-cardHeight;
  if(y<topMargin){
    if(point.y+gap+cardHeight<=height-margin)y=point.y+gap;
    else {
      const left=point.x-gap-margin,right=width-margin-point.x-gap;
      if(Math.max(left,right)>=144){
        cardWidth=Math.min(cardWidth,Math.max(left,right));
        x=left>=right?point.x-gap-cardWidth:point.x+gap;
        y=point.y-cardHeight/2;
      }else y=point.y<height/2?point.y+gap:point.y-gap-cardHeight;
    }
  }
  return {x:clamp(x,margin,width-margin-cardWidth),y:clamp(y,topMargin,height-margin-cardHeight),width:cardWidth,height:cardHeight};
}
