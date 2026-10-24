const MAX_PLACES=6;

/** An overview remains one landscape, including at a phone's actual width. */
export function atlasLayout(count:number,compact=false) {
  const size=Math.min(MAX_PLACES,Math.max(0,count));
  const points=size<=1?[{u:0,v:0}]:compact
    ? size===2?[{u:-.25,v:2.9},{u:.25,v:-2.9}]
      : size===3?[{u:0,v:3.8},{u:-2.4,v:-2.4},{u:2.4,v:-2.4}]
        : size===4?[{u:-2.4,v:3.2},{u:2.4,v:2.9},{u:-2.4,v:-3},{u:2.4,v:-3.3}]
          : [{u:-2.4,v:5.2},{u:2.4,v:4.9},{u:-2.4,v:.1},{u:2.4,v:-.2},...(size===5?[{u:0,v:-5.1}]:[{u:-2.4,v:-5},{u:2.4,v:-5.3}])]
    : size===2?[{u:-3.35,v:.9},{u:3.35,v:-.9}]
      : size===3?[{u:-4,v:-1.4},{u:0,v:2.7},{u:4,v:-1.4}]
        : size===4?[{u:-4.5,v:-1.1},{u:-1.55,v:3.7},{u:3.8,v:2.3},{u:3,v:-3.45}]
          : [{u:-5.1,v:2.7},{u:0,v:3.1},{u:5.1,v:2.7},{u:-5.1,v:-3.5},{u:0,v:-3.1},{u:5.1,v:-3.5}];
  const scale=compact?(size<=2?.62:size<=4?.48:.42):(size<=4?.67:.58);
  return points.slice(0,size).map((point,index)=>({
    x:(point.u-point.v)/Math.SQRT2,z:(-point.u-point.v)/Math.SQRT2,
    y:compact?0:Math.sin(index*1.7)*.14,scale,
    fallbackX:compact?(size<=2?50:size===3?[50,26,74][index]:size===5&&index===4?50:index%2===0?26:74):size===1?50:size===2?index===0?25:75:size===3?[21,50,79][index]:size===4?[19,39,76,72][index]:[17,50,83,17,50,83][index],
    fallbackY:compact?(size===1?61:size===2?[32,80][index]:size===3?[31,76,76][index]:size===4?[32,32,79,79][index]:[24,24,54,54,85,85][index]):size===1?58:size===2?60:size===3?[73,34,73][index]:size===4?[64,34,43,84][index]:[35,32,35,79,76,79][index],
  }));
}

/** Fit all six bounded islands at every permitted parallax angle. */
export function atlasCameraSpan(count:number,compact:boolean,aspect:number) {
  let halfWidth=0,halfHeight=0;
  for(const place of atlasLayout(count,compact))for(const offset of [-1,0,1]){
    const yaw=Math.PI/4+offset*.054,pitch=.65+offset*.025;
    for(const x of [-4.15,4.15])for(const y of [-1,4])for(const z of [-3.6,3.6]){
      const px=place.x+x*place.scale,py=place.y+y*place.scale+.15,pz=place.z+z*place.scale;
      halfWidth=Math.max(halfWidth,Math.abs(Math.cos(yaw)*px-Math.sin(yaw)*pz));
      halfHeight=Math.max(halfHeight,Math.abs(-Math.sin(yaw)*Math.sin(pitch)*px+Math.cos(pitch)*py-Math.cos(yaw)*Math.sin(pitch)*pz));
    }
  }
  return Math.max(6.5,halfHeight*2.12,halfWidth*2.12/Math.max(.1,aspect));
}
