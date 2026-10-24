/* Product-photo preparation for local live previews. Original product pixels stay intact.
 * Only a light neutral background connected to an image edge may become transparent.
 */
(() => {
  'use strict';
  const TYPES = {lipstick:'lip',chair:'object',lamp:'object',tshirt:'garment',hoodie:'garment',glasses:'glasses'};
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function assetPath(value,origin=window.location?.origin || 'http://localhost') {
    if(typeof value!=='string'||!value)throw Error('This product has no preview image.');
    let url;try{url=new URL(value,origin);}catch{throw Error('This product image is unavailable.');}
    if(url.origin!==origin||!/^\/live-call\/products\/[a-z0-9][a-z0-9._-]*\.(?:png|jpe?g|webp)$/i.test(url.pathname)||url.search||url.hash)throw Error('Only verified local product images can be previewed.');
    return url.pathname;
  }
  function normalizedCrop(value) {
    if(value===undefined||value===null)return {x:0,y:0,width:1,height:1};
    if(typeof value!=='object'||Array.isArray(value)||['x','y','width','height'].some(key=>typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<0||value[key]>1)||value.width===0||value.height===0||value.x+value.width>1||value.y+value.height>1)throw Error('This product photo crop is invalid.');
    return {x:value.x,y:value.y,width:value.width,height:value.height};
  }
  function removeEdgeWhite(image,{backgroundColor,backgroundTolerance=8}={}) {
    const {data,width,height}=image,total=width*height;
    const tolerance=Number.isFinite(backgroundTolerance)&&backgroundTolerance>=0&&backgroundTolerance<=12?backgroundTolerance:8;
    const lightNeutral=rgb=>Math.min(...rgb)>=224&&Math.max(...rgb)-Math.min(...rgb)<=12;
    let background=/^#[0-9a-f]{6}$/i.test(backgroundColor||'')?[1,3,5].map(i=>parseInt(backgroundColor.slice(i,i+2),16)):null;
    if(!background||!lightNeutral(background)){
      const edge=[];
      const sample=i=>{const p=i*4,rgb=[data[p],data[p+1],data[p+2]];if(data[p+3]>8&&lightNeutral(rgb))edge.push(rgb);};
      for(let x=0;x<width;x++){sample(x);if(height>1)sample((height-1)*width+x);}for(let y=1;y<height-1;y++){sample(y*width);if(width>1)sample(y*width+width-1);}
      const perimeter=Math.max(1,width*2+Math.max(0,height-2)*2);
      if(edge.length<perimeter*.4)return {removed:0,keptOriginal:true};
      background=[0,1,2].map(channel=>edge.map(pixel=>pixel[channel]).sort((a,b)=>a-b)[Math.floor(edge.length/2)]);
    }
    const seen=new Uint8Array(total),queue=new Uint32Array(total);let head=0,tail=0,removed=0;
    const eligible=i=>{const n=i*4,rgb=[data[n],data[n+1],data[n+2]];return data[n+3]<8||(lightNeutral(rgb)&&rgb.every((value,channel)=>Math.abs(value-background[channel])<=tolerance));};
    const add=i=>{if(!seen[i]&&eligible(i)){seen[i]=1;queue[tail++]=i;}};
    for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}for(let y=0;y<height;y++){add(y*width);add(y*width+width-1);}
    while(head<tail){const i=queue[head++],x=i%width;if(data[i*4+3]>0)removed++;if(x>0)add(i-1);if(x<width-1)add(i+1);if(i>=width)add(i-width);if(i<total-width)add(i+width);}
    // An almost-white garment can be indistinguishable from its backdrop. Keep the photo instead of erasing it.
    if(removed/total>.975)return {removed:0,keptOriginal:true};
    for(let i=0;i<total;i++)if(seen[i])data[i*4+3]=0;
    return {removed,keptOriginal:false};
  }
  function alphaBounds(image) {
    const {data,width,height}=image;let left=width,top=height,right=-1,bottom=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    if(right<left)return null;
    return {x:left,y:top,width:right-left+1,height:bottom-top+1};
  }
  function estimateLipColor(image) {
    const buckets=new Map(),stride=Math.max(1,Math.floor(image.width*image.height/20000));
    for(let i=0;i<image.width*image.height;i+=stride){const p=i*4,r=image.data[p],g=image.data[p+1],b=image.data[p+2];if(image.data[p+3]<32||r<65||r<g*1.12||r<b*.92||Math.max(r,g,b)-Math.min(r,g,b)<35)continue;const key=`${r>>4},${g>>4},${b>>4}`,v=buckets.get(key)||{n:0,r:0,g:0,b:0};v.n++;v.r+=r;v.g+=g;v.b+=b;buckets.set(key,v);}
    const best=[...buckets.values()].sort((a,b)=>b.n-a.n)[0];if(!best||best.n<3)return null;
    return '#'+['r','g','b'].map(c=>Math.round(best[c]/best.n).toString(16).padStart(2,'0')).join('');
  }
  function objectLayout(preview,w,h,options={}) {
    const scale=clamp(Number(options.scale)||1,.35,2.5),isChair=preview.productType==='chair';
    const maxEdge=Math.min(w,h)*(isChair?.62:.48)*scale;
    const ratio=preview.width/preview.height;
    let height=maxEdge,width=height*ratio;
    if(width>w*.85){width=w*.85;height=width/ratio;}
    if(height>h*.8){height=h*.8;width=height*ratio;}
    return {x:clamp(Number.isFinite(Number(options.x))?Number(options.x):.5,0,1)*w,y:clamp(Number.isFinite(Number(options.y))?Number(options.y):.74,0,1)*h,width,height,rotation:(Number(options.rotation)||0)*Math.PI/180};
  }
  function garmentLayout(preview,points,w,h,options={}) {
    if(!points?.[24]||[11,12,23,24].some(i=>(points[i].visibility??1)<.4))return null;
    const mirror=options.mirror===true,p=i=>({x:(mirror?1-points[i].x:points[i].x)*w,y:points[i].y*h});
    let a=p(11),b=p(12);if(a.x>b.x)[a,b]=[b,a];
    const shoulders=Math.hypot(b.x-a.x,b.y-a.y),hips={x:(p(23).x+p(24).x)/2,y:(p(23).y+p(24).y)/2};
    const x=(a.x+b.x)/2,y=(a.y+b.y)/2,scale=clamp(Number(options.scale)||1,.35,2.5),hoodie=preview.productType==='hoodie';
    const shoulderFraction=clamp(Number(preview.shoulderWidth)|| (hoodie?.54:.60),.3,.9);
    const shoulderY=clamp(Number(preview.shoulderY)|| (hoodie?.27:.10),.02,.6);
    const imageRatio=preview.width/preview.height;
    let width=shoulders/shoulderFraction*scale,height=width/imageRatio;
    const torso=Math.max(shoulders*.75,Math.hypot(hips.x-x,hips.y-y));
    // Preserve the product's image aspect ratio; never stretch logos or fabricate fabric drape.
    const maxHeight=torso*(hoodie?1.9:1.6)*scale;
    if(height>maxHeight){height=maxHeight;width=height*imageRatio;}
    if(width<20||height<20)return null;
    return {x,y,width,height,top:-height*shoulderY,rotation:Math.atan2(b.y-a.y,b.x-a.x)+(Number(options.rotation)||0)*Math.PI/180};
  }
  function clearGlassesLenses(image,masks,tint) {
    if(!Array.isArray(masks)||masks.length!==2)return {cleared:0};
    const valid=masks.every(m=>m&&['x','y','rx','ry'].every(k=>Number.isFinite(m[k]))&&m.x>0&&m.x<1&&m.y>0&&m.y<1&&m.rx>0&&m.rx<.3&&m.ry>0&&m.ry<.48);
    if(!valid)return {cleared:0};
    const rgb=/^#[0-9a-f]{6}$/i.test(tint||'')?[1,3,5].map(i=>parseInt(tint.slice(i,i+2),16)):null;
    let cleared=0;
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
      const inside=masks.some(m=>{const dx=x-m.x*image.width,dy=y-m.y*image.height,angle=clamp(Number(m.rotation)||0,-30,30)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);return ((dx*c+dy*s)/(m.rx*image.width))**2+((-dx*s+dy*c)/(m.ry*image.height))**2<1;});
      if(inside){const n=(y*image.width+x)*4;if(image.data[n+3])cleared++;if(rgb){image.data[n]=rgb[0];image.data[n+1]=rgb[1];image.data[n+2]=rgb[2];image.data[n+3]=80;}else image.data[n+3]=0;}
    }
    // Clear the remaining bright lens interior up to the dark rim, including rounded corners
    // outside the conservative ellipse. The ellipse also removes folded temple bars.
    const total=image.width*image.height,seen=new Uint8Array(total),queue=new Uint32Array(total);let head=0,tail=0;
    const white=i=>{const n=i*4,r=image.data[n],g=image.data[n+1],b=image.data[n+2];return Math.min(r,g,b)>=230&&Math.max(r,g,b)-Math.min(r,g,b)<=18;};
    const add=i=>{if(!seen[i]&&white(i)){seen[i]=1;queue[tail++]=i;}};
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
      const inside=masks.some(m=>{const dx=x-m.x*image.width,dy=y-m.y*image.height,angle=clamp(Number(m.rotation)||0,-30,30)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);return ((dx*c+dy*s)/(m.rx*image.width))**2+((-dx*s+dy*c)/(m.ry*image.height))**2<1.03;});
      if(inside){const i=y*image.width+x;if(!seen[i]){seen[i]=1;queue[tail++]=i;}}
    }
    while(head<tail){const i=queue[head++],x=i%image.width,n=i*4;if(white(i)&&image.data[n+3]){image.data[n+3]=0;cleared++;}if(x>0)add(i-1);if(x<image.width-1)add(i+1);if(i>=image.width)add(i-image.width);if(i<total-image.width)add(i+image.width);}
    // Remove only near-white neutral fringe on the photographed cutout, not coloured rims.
    for(let i=0;i<total;i++){const n=i*4,r=image.data[n],g=image.data[n+1],b=image.data[n+2],low=Math.min(r,g,b);if(image.data[n+3]&&low>=225&&Math.max(r,g,b)-low<=16){const alpha=clamp((245-low)/20,0,1);image.data[n+3]=Math.round(image.data[n+3]*alpha);if(alpha>0)for(let j=0;j<3;j++)image.data[n+j]=clamp(Math.round((image.data[n+j]-255*(1-alpha))/alpha),0,255);}}
    return {cleared};
  }
  function glassesLayout(preview,points,w,h,options={}) {
    if(!points?.[263]||![33,133,263,362,168].every(i=>points[i]&&Number.isFinite(points[i].x)&&Number.isFinite(points[i].y)))return null;
    const point=i=>({x:(options.mirror?1-points[i].x:points[i].x)*w,y:points[i].y*h,z:(points[i].z||0)*w});
    let a=point(33),b=point(263);if(a.x>b.x)[a,b]=[b,a];
    const distance=Math.hypot(b.x-a.x,b.y-a.y);if(distance<w*.035||distance>w*.65)return null;
    const depth=(b.z-a.z)/distance,yaw=clamp(depth,-1.2,1.2);
    const nose=point(168),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const noseShift=(nose.x-mid.x)/distance;
    if(Math.abs(yaw)>.78||Math.abs(noseShift)>.29)return null;
    const scale=clamp(Number(options.scale)||1,.5,1.7),width=distance*1.48*scale/clamp(Number(preview.frameWidth)||.94,.65,1),height=width*preview.height/preview.width;
    if(!Number.isFinite(height)||height<5)return null;
    const rotation=Math.atan2(b.y-a.y,b.x-a.x)+((Number(options.rotation)||0)-clamp(Number(preview.frameRoll)||0,-30,30))*Math.PI/180;
    const bx=clamp(Number(preview.bridgeX)||.5,.25,.75),by=clamp(Number(preview.bridgeY)||.42,.12,.8);
    // The product's bridge follows the nose; outer-eye span supplies physical face-relative scale.
    const center={x:nose.x,y:nose.y+distance*.06},cos=Math.cos(rotation),sin=Math.sin(rotation);
    const convert=(u,v)=>{const x=(u-bx)*width,y=(v-by)*height*(1+(u-.5)*yaw*.22);return {x:center.x+x*cos-y*sin,y:center.y+x*sin+y*cos};};
    return {x:center.x,y:center.y,width,height,rotation,yaw,quad:[convert(0,0),convert(1,0),convert(1,1),convert(0,1)]};
  }
  function garmentMesh(preview,points,w,h,options={}) {
    const base=garmentLayout(preview,points,w,h,options);if(!base)return null;
    const p=i=>({x:(options.mirror?1-points[i].x:points[i].x)*w,y:points[i].y*h});
    let ls=p(11),rs=p(12),lh=p(23),rh=p(24);if(ls.x>rs.x)[ls,rs]=[rs,ls];if(lh.x>rh.x)[lh,rh]=[rh,lh];
    const shoulder={x:(ls.x+rs.x)/2,y:(ls.y+rs.y)/2},hip={x:(lh.x+rh.x)/2,y:(lh.y+rh.y)/2};
    const torso=Math.hypot(hip.x-shoulder.x,hip.y-shoulder.y);if(torso<20)return null;
    const dx=(hip.x-shoulder.x)/torso,dy=(hip.y-shoulder.y)/torso;
    const shoulderY=clamp(Number(preview.shoulderY)||(preview.productType==='hoodie'?.27:.1),.02,.6);
    const height=Math.min(base.height,torso*(preview.productType==='hoodie'?1.55:1.3)*clamp(Number(options.scale)||1,.35,2.5));
    const top={x:shoulder.x-dx*height*shoulderY,y:shoulder.y-dy*height*shoulderY};
    const bottom={x:shoulder.x+dx*height*(1-shoulderY),y:shoulder.y+dy*height*(1-shoulderY)};
    const hipRatio=Math.hypot(rh.x-lh.x,rh.y-lh.y)/Math.hypot(rs.x-ls.x,rs.y-ls.y);
    const hemWidth=base.width*clamp(hipRatio*.85,.66,1.02);
    const topAngle=base.rotation,bottomAngle=clamp(Math.atan2(rh.y-lh.y,rh.x-lh.x)-topAngle,-.28,.28)+topAngle;
    const edge=(c,width,angle,side)=>({x:c.x+Math.cos(angle)*width*.5*side,y:c.y+Math.sin(angle)*width*.5*side});
    return {...base,height,quad:[edge(top,base.width,topAngle,-1),edge(top,base.width,topAngle,1),edge(bottom,hemWidth,bottomAngle,1),edge(bottom,hemWidth,bottomAngle,-1)]};
  }
  function headOcclusion(points,w,h,options={}) {
    if(!points||![0,2,5,9,10,11,12].every(i=>points[i]&&Number.isFinite(points[i].x)&&Number.isFinite(points[i].y)&&(points[i].visibility??1)>.55))return null;
    const p=i=>({x:(options.mirror?1-points[i].x:points[i].x)*w,y:points[i].y*h});
    let a=p(2),b=p(5);if(a.x>b.x)[a,b]=[b,a];
    const eye={x:(a.x+b.x)/2,y:(a.y+b.y)/2},mouth={x:(p(9).x+p(10).x)/2,y:(p(9).y+p(10).y)/2};
    const shoulders=Math.hypot(p(11).x-p(12).x,p(11).y-p(12).y),eyeSpan=Math.hypot(b.x-a.x,b.y-a.y);
    if(shoulders<25||eyeSpan<4||mouth.y<eye.y)return null;
    const ears=[7,8].every(i=>points[i]&&(points[i].visibility??1)>.4)?Math.hypot(p(7).x-p(8).x,p(7).y-p(8).y):0;
    const faceWidth=clamp(Math.max(ears,eyeSpan*2,shoulders*.30),shoulders*.26,shoulders*.65);
    const rotation=clamp(Math.atan2(b.y-a.y,b.x-a.x),-.55,.55),dx=-Math.sin(rotation),dy=Math.cos(rotation);
    const top={x:eye.x-dx*faceWidth*.62,y:eye.y-dy*faceWidth*.62},bottom={x:mouth.x+dx*faceWidth*.30,y:mouth.y+dy*faceWidth*.30};
    const x=(top.x+bottom.x)/2,y=(top.y+bottom.y)/2,rx=faceWidth*.57,ry=Math.hypot(bottom.x-top.x,bottom.y-top.y)/2;
    const shoulderLimit=Math.min(p(11).y,p(12).y)-shoulders*.04;
    // Bound the mask above the shoulders so the previous shirt cannot be restored over the new one.
    return {x,y,rx,ry:Math.max(5,Math.min(ry,shoulderLimit-y)),rotation};
  }
  // Textured triangles allow a bounded live warp without inventing unseen product geometry.
  function drawQuad(ctx,image,quad,columns=3,rows=3) {
    if(!quad||quad.length!==4)return;
    const width=image.width,height=image.height;
    const at=(u,v)=>({x:(1-v)*((1-u)*quad[0].x+u*quad[1].x)+v*((1-u)*quad[3].x+u*quad[2].x),y:(1-v)*((1-u)*quad[0].y+u*quad[1].y)+v*((1-u)*quad[3].y+u*quad[2].y)});
    const triangle=(source,target)=>{
      const [a,b,c]=source,[p,q,r]=target,den=a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y);if(Math.abs(den)<.001)return;
      const affine=key=>[(p[key]*(b.y-c.y)+q[key]*(c.y-a.y)+r[key]*(a.y-b.y))/den,(p[key]*(c.x-b.x)+q[key]*(a.x-c.x)+r[key]*(b.x-a.x))/den,(p[key]*(b.x*c.y-c.x*b.y)+q[key]*(c.x*a.y-a.x*c.y)+r[key]*(a.x*b.y-b.x*a.y))/den];
      const tx=affine('x'),ty=affine('y');ctx.save();ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.lineTo(r.x,r.y);ctx.closePath();ctx.clip();ctx.transform(tx[0],ty[0],tx[1],ty[1],tx[2],ty[2]);ctx.drawImage(image,0,0);ctx.restore();
    };
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
      const u0=x/columns,u1=(x+1)/columns,v0=y/rows,v1=(y+1)/rows;
      const src=[{x:u0*width,y:v0*height},{x:u1*width,y:v0*height},{x:u1*width,y:v1*height},{x:u0*width,y:v1*height}],dst=[at(u0,v0),at(u1,v0),at(u1,v1),at(u0,v1)];
      triangle([src[0],src[1],src[2]],[dst[0],dst[1],dst[2]]);triangle([src[0],src[2],src[3]],[dst[0],dst[2],dst[3]]);
    }
  }
  class NookProductPreview {
    constructor({canvasFactory=()=>document.createElement('canvas'),loadImage,origin=window.location?.origin||'http://localhost'}={}) {this.canvasFactory=canvasFactory;this.imageLoader=loadImage||this._image.bind(this);this.origin=origin;this.sequence=0;this.current=null;}
    _image(path){return new Promise((resolve,reject)=>{const image=new Image();const timeout=setTimeout(()=>{image.onload=null;image.onerror=null;reject(Error('Product photo timed out. Try again.'));},12000);image.crossOrigin='anonymous';image.onload=()=>{clearTimeout(timeout);resolve(image);};image.onerror=()=>{clearTimeout(timeout);reject(Error('Product photo could not load. Try a different product.'));};image.src=path;});}
    clear(){this.sequence++;this.current=null;}
    async load(product) {
      const token=++this.sequence;this.current=null;
      const kind=TYPES[product?.productType];if(!kind)throw Error('Choose glasses, lipstick, a chair, lamp, T-shirt or hoodie from the catalog.');
      const path=assetPath(product.preview?.image||product.image,this.origin),crop=normalizedCrop(product.preview?.crop);
      const image=await this.imageLoader(path);if(token!==this.sequence)return {ok:false,stale:true};
      const sw=image.naturalWidth||image.width,sh=image.naturalHeight||image.height;if(!(sw>0&&sh>0))throw Error('Product photo has no usable pixels.');
      const sourceX=Math.min(sw-1,Math.floor(sw*crop.x)),sourceY=Math.min(sh-1,Math.floor(sh*crop.y)),sourceWidth=Math.max(1,Math.min(sw-sourceX,Math.round(sw*crop.width))),sourceHeight=Math.max(1,Math.min(sh-sourceY,Math.round(sh*crop.height)));
      const canvas=this.canvasFactory(),factor=Math.min(1,640/Math.max(sourceWidth,sourceHeight));canvas.width=Math.max(1,Math.round(sourceWidth*factor));canvas.height=Math.max(1,Math.round(sourceHeight*factor));
      const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('This browser cannot prepare product previews.');
      ctx.drawImage(image,sourceX,sourceY,sourceWidth,sourceHeight,0,0,canvas.width,canvas.height);
      let pixels;try{pixels=ctx.getImageData(0,0,canvas.width,canvas.height);}catch{throw Error('Product image could not be used safely in the camera.');}
      let shadeColor=null,shadeEstimated=false;
      if(kind==='lip'){shadeColor=/^#[0-9a-f]{6}$/i.test(product.preview?.color||'')?product.preview.color:estimateLipColor(pixels);if(!shadeColor)throw Error('This photo has no reliable lipstick colour to preview. Choose another lipstick.');shadeEstimated=product.preview?.shadeVerified!==true;}
      const removed=kind!=='lip'&&product.preview?.background==='white'?removeEdgeWhite(pixels,{backgroundColor:product.preview?.backgroundColor,backgroundTolerance:product.preview?.backgroundTolerance}):{removed:0};
      const lensResult=kind==='glasses'&&product.preview?.lensClear===true?clearGlassesLenses(pixels,product.preview?.lensMasks,product.preview?.lensTint):{cleared:0};
      if(removed.removed||lensResult.cleared)ctx.putImageData(pixels,0,0);
      const bounds=alphaBounds(pixels);if(!bounds)throw Error('Product image has no visible product.');
      let drawable=canvas;
      if(bounds.width!==canvas.width||bounds.height!==canvas.height){drawable=this.canvasFactory();drawable.width=bounds.width;drawable.height=bounds.height;drawable.getContext('2d').drawImage(canvas,bounds.x,bounds.y,bounds.width,bounds.height,0,0,bounds.width,bounds.height);}
      if(token!==this.sequence)return {ok:false,stale:true};
      const result={ok:true,productId:String(product.id),productType:product.productType,kind,canvas:drawable,width:drawable.width,height:drawable.height,backgroundRemoved:removed.removed>0,shadeColor,shadeEstimated,shoulderWidth:product.preview?.shoulderWidth,shoulderY:product.preview?.shoulderY,frameWidth:product.preview?.frameWidth,frameRoll:product.preview?.frameRoll,bridgeX:product.preview?.bridgeX===undefined?undefined:clamp((product.preview.bridgeX*canvas.width-bounds.x)/bounds.width,0,1),bridgeY:product.preview?.bridgeY===undefined?undefined:clamp((product.preview.bridgeY*canvas.height-bounds.y)/bounds.height,0,1),lensCleared:lensResult.cleared>0,notice:kind==='lip'?'Colour estimated from the listing photo; not an exact shade match.':'Actual listing photo, placed in 2D; not a fit or size guarantee.'};
      this.current=result;return result;
    }
  }
  Object.assign(NookProductPreview,{assetPath,normalizedCrop,removeEdgeWhite,alphaBounds,estimateLipColor,objectLayout,garmentLayout,clearGlassesLenses,glassesLayout,garmentMesh,drawQuad,headOcclusion});
  window.NookProductPreview=NookProductPreview;
})();
