/** Camera-plane positions make the journey readable at both landscape and phone widths. */
export function atlasLayout(count:number,compact=false) {
  const places=count===1?[{u:0,v:0}]:compact
    ? [{u:-.15,v:3.0},{u:.15,v:-3.4}]
    : count===2?[{u:-3.35,v:.9},{u:3.35,v:-.9}]
        : count===3?[{u:-4,v:-1.4},{u:0,v:2.7},{u:4,v:-1.4}]
          : [{u:-4.5,v:-1.1},{u:-1.55,v:3.7},{u:3.8,v:2.3},{u:3,v:-3.45}];
  return places.slice(0,Math.min(count,compact?2:4)).map((point,index)=>({
    x:(point.u-point.v)/Math.SQRT2,z:(-point.u-point.v)/Math.SQRT2,
    y:compact?0:Math.sin(index*1.7)*.14,scale:compact?.62:.67,
    fallbackX:compact?50:index===0?19:index===1?39:index===2?76:72,
    fallbackY:count===1?58:compact?index===0?35:79:count===2?60:index===0?64:index===1?34:index===2?43:84,
  }));
}

export function atlasCameraSpan(count:number,compact:boolean,aspect:number) {
  if(compact)return Math.max(count===1?8.2:10.5,7.3/Math.max(.1,aspect));
  return Math.max(count===1?7.9:count<4?10.2:11.4,(count===1?9.7:count===2?13.8:15.9)/Math.max(.1,aspect));
}
