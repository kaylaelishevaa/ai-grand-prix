import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/product-preview.js',import.meta.url),'utf8');
const engine=readFileSync(new URL('../public/camera-engine.js',import.meta.url),'utf8');
function fixture(){const context={window:{location:{origin:'https://nook.test'}},URL,Uint8Array,Uint32Array,Map,Number,Math,Error,setTimeout,clearTimeout,cancelAnimationFrame(){}};vm.createContext(context);vm.runInContext(source,context);return {Preview:context.window.NookProductPreview,context};}
function pixels(w,h,color=[255,255,255,255]){const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++)data.set(color,i*4);return {width:w,height:h,data};}
function color(image,x,y,rgb){image.data.set(rgb,(y*image.width+x)*4);}
const product=(id,type='lamp')=>({id,category:type==='lipstick'?'makeup':['hoodie','tshirt'].includes(type)?'clothes':'desk',productType:type,image:`/products/${id}.jpg`,preview:{background:'white'}});
function canvasFactory(image=pixels(10,10,[80,90,100,255])){return ()=>{const canvas={width:10,height:10};canvas.getContext=()=>({drawImage(){},getImageData(){return {width:canvas.width,height:canvas.height,data:image.data.slice()};},putImageData(){},clearRect(){}});return canvas;};}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

test('product assets are restricted to local image paths, including rejecting redirects encoded as URLs',()=>{const {Preview}=fixture();assert.equal(Preview.assetPath('/products/123.jpg','https://nook.test'),'/products/123.jpg');assert.equal(Preview.assetPath('https://nook.test/products/123.webp','https://nook.test'),'/products/123.webp');for(const value of ['https://other.test/products/123.jpg','data:image/png;base64,AA','//other.test/products/x.jpg','/products/../private.png','/products/a.jpg?url=https://other.test','/api/image.jpg'])assert.throws(()=>Preview.assetPath(value,'https://nook.test'));});

test('edge background removal preserves enclosed white product pixels and all colored product pixels',()=>{const {Preview}=fixture(),image=pixels(7,7);for(let y=1;y<=5;y++)for(let x=1;x<=5;x++)color(image,x,y,[20,40,60,255]);color(image,3,3,[255,255,255,255]);const result=Preview.removeEdgeWhite(image);assert.equal(result.removed,24);assert.equal(image.data[3],0);assert.equal(image.data[(3*7+3)*4+3],255);assert.deepEqual([...image.data.slice((2*7+2)*4,(2*7+2)*4+4)],[20,40,60,255]);assert.deepEqual({...Preview.alphaBounds(image)},{x:1,y:1,width:5,height:5});});

test('almost-white product is retained instead of turning into only its tiny logo',()=>{const {Preview}=fixture(),image=pixels(20,20);color(image,10,10,[20,20,20,255]);assert.equal(Preview.removeEdgeWhite(image).keptOriginal,true);assert.equal(image.data[3],255);});

test('lip color estimate uses chromatic red-family pixels and rejects a neutral packaging-only photo',()=>{const {Preview}=fixture(),image=pixels(10,10,[220,220,220,255]);for(let x=2;x<7;x++)color(image,x,5,[179,47,91,255]);assert.equal(Preview.estimateLipColor(image),'#b32f5b');assert.equal(Preview.estimateLipColor(pixels(10,10,[30,30,30,255])),null);});

test('image preparation uses real photo dimensions and rejects missing images instead of creating a generic object',async()=>{const {Preview}=fixture(),preview=new Preview({canvasFactory:canvasFactory(),loadImage:async()=>({width:10,height:10})});const result=await preview.load(product('1'));assert.equal(result.ok,true);assert.equal(result.productId,'1');assert.equal(result.kind,'object');assert.equal(result.width,10);assert.equal(result.height,10);await assert.rejects(preview.load({...product('2'),image:null}),/no preview image/);assert.equal(preview.current,null);});

test('latest product wins even when an earlier product photo finishes later',async()=>{const {Preview}=fixture(),a=deferred(),b=deferred(),preview=new Preview({canvasFactory:canvasFactory(),loadImage:path=>path.includes('/1.')?a.promise:b.promise});const old=preview.load(product('1')),current=preview.load(product('2'));b.resolve({width:10,height:10});assert.equal((await current).productId,'2');a.resolve({width:10,height:10});assert.equal((await old).stale,true);assert.equal(preview.current.productId,'2');});

test('clearing during image loading prevents any late product from becoming active',async()=>{const {Preview}=fixture(),pending=deferred(),preview=new Preview({canvasFactory:canvasFactory(),loadImage:()=>pending.promise});const load=preview.load(product('1'));preview.clear();pending.resolve({width:10,height:10});assert.equal((await load).stale,true);assert.equal(preview.current,null);});

test('object base uses displayed coordinates and stable aspect ratio, regardless of selfie mirroring',()=>{const {Preview}=fixture(),p={width:100,height:200,productType:'lamp'};const a=Preview.objectLayout(p,720,1280,{x:.8,y:.65,scale:1,mirror:true}),b=Preview.objectLayout(p,720,1280,{x:.8,y:.65,scale:1,mirror:false});assert.equal(a.x,576);assert.equal(a.y,832);assert.equal(a.width/a.height,.5);assert.deepEqual(a,b);assert(a.height<=1280*.8);});

test('garment preserves image aspect, follows displayed shoulders and gives hoodie space above shoulders',()=>{const {Preview}=fixture(),points=Array.from({length:25},()=>({x:.5,y:.5,visibility:1}));points[11]={x:.25,y:.25,visibility:1};points[12]={x:.55,y:.25,visibility:1};points[23]={x:.3,y:.65,visibility:1};points[24]={x:.5,y:.65,visibility:1};const tee=Preview.garmentLayout({width:400,height:500,productType:'tshirt'},points,720,1280,{mirror:true}),hood=Preview.garmentLayout({width:400,height:500,productType:'hoodie'},points,720,1280,{mirror:true});assert.equal(tee.x,432);assert.equal(tee.width/tee.height,.8);assert(hood.top<tee.top);points[11].visibility=.1;assert.equal(Preview.garmentLayout({width:400,height:500},points,720,1280,{}),null);});

test('camera stop invalidates product load; mode none clears existing selected photo',async()=>{const {context}=fixture(),pending=deferred();class Loader{clear(){}load(){return pending.promise;}}context.window.NookProductPreview=Loader;vm.runInContext(engine,context);const canvas={width:10,height:10,getContext:()=>({clearRect(){}})},camera=new context.window.NookCamera({video:{pause(){}},canvas});const loading=camera.setProduct(product('1'));camera.stop(false);pending.resolve({ok:true,kind:'object',productId:'1',canvas:{}});assert.equal((await loading).stale,true);assert.equal(camera.product,null);camera.product=product('2');camera.productPreview={kind:'object'};await camera.setMode('none');assert.equal(camera.product,null);assert.equal(camera.productPreview,null);});

test('camera uses selected product photo without a generic fallback and keeps photo text unmirrored',()=>{const {context}=fixture();vm.runInContext(engine,context);const calls=[],ctx={save(){},restore(){},setTransform(...args){calls.push(['transform',...args]);},translate(...args){calls.push(['translate',...args]);},rotate(...args){calls.push(['rotate',...args]);},drawImage(...args){calls.push(['image',...args]);}};const camera=new context.window.NookCamera({video:{},canvas:{getContext:()=>ctx}});camera._desk(720,1280);assert.equal(calls.length,0);const photo={};camera.productPreview={kind:'object',canvas:photo,width:300,height:600,productType:'lamp'};camera.setOptions({x:.8,y:.7,mirror:true});camera._desk(720,1280);const drawn=calls.find(call=>call[0]==='image');assert.equal(drawn[1],photo);assert.equal(drawn[2],-drawn[4]/2);assert.equal(drawn[3],-drawn[5]);assert.deepEqual(calls.find(call=>call[0]==='transform'),['transform',1,0,0,1,0,0]);assert.deepEqual(calls.find(call=>call[0]==='translate'),['translate',576,896]);});

test('light gray packshot backdrop adapts from the border without erasing enclosed white garment details',()=>{const {Preview}=fixture(),image=pixels(7,7,[246,246,246,255]);for(let y=1;y<=5;y++)for(let x=1;x<=5;x++)color(image,x,y,[50,55,65,255]);color(image,3,3,[255,255,255,255]);assert.equal(Preview.removeEdgeWhite(image).removed,24);assert.equal(image.data[3],0);assert.equal(image.data[(3*7+3)*4+3],255);});

test('background removal refuses colored or dark scene backgrounds',()=>{const {Preview}=fixture();for(const rgb of [[225,240,254,255],[150,150,150,255]]){const image=pixels(7,7,rgb);assert.equal(Preview.removeEdgeWhite(image).removed,0);assert.equal(image.data[3],255);}});

test('optional crop is strictly normalized and cannot read outside the source photo',()=>{const {Preview}=fixture();assert.deepEqual({...Preview.normalizedCrop({x:.1,y:.2,width:.8,height:.7})},{x:.1,y:.2,width:.8,height:.7});for(const crop of [{x:0,y:0,width:0,height:1},{x:.8,y:0,width:.3,height:1},{x:0,y:-.1,width:1,height:1},{x:0,y:0,width:Infinity,height:1},{x:'0',y:0,width:1,height:1},[]])assert.throws(()=>Preview.normalizedCrop(crop),/crop is invalid/);});

test('validated crop selects original source pixels before background extraction',async()=>{const {Preview}=fixture(),draws=[];const factory=()=>{const canvas={width:0,height:0,getContext:()=>({drawImage(...args){draws.push(args);},getImageData(){return pixels(canvas.width,canvas.height,[80,90,100,255]);},putImageData(){}})};return canvas;};const photo={width:100,height:200},preview=new Preview({canvasFactory:factory,loadImage:async()=>photo});const item=product('9');item.preview={background:'none',crop:{x:.1,y:.2,width:.8,height:.7}};const result=await preview.load(item);assert.equal(result.width,80);assert.equal(result.height,140);assert.equal(draws[0][0],photo);assert.deepEqual(draws[0].slice(1),[10,40,80,140,0,0,80,140]);});

test('conservative white-photo tolerance preserves bright near-white product pixels',()=>{const {Preview}=fixture(),image=pixels(7,7);for(let y=1;y<=5;y++)color(image,3,y,[253,253,253,255]);const result=Preview.removeEdgeWhite(image,{backgroundTolerance:0});assert.equal(result.removed,44);assert.equal(image.data[3],0);for(let y=1;y<=5;y++)assert.equal(image.data[(y*7+3)*4+3],255);});

test('clear glasses lenses remove folded temples and white corners while preserving the dark rim',()=>{
  const {Preview}=fixture(),image=pixels(100,50,[255,255,255,255]);
  for(const cx of [25,75]){for(let y=5;y<45;y++)for(let x=cx-21;x<=cx+21;x++){const outer=((x-cx)/21)**2+((y-25)/20)**2,inner=((x-cx)/18)**2+((y-25)/17)**2;if(outer<=1&&inner>=1)color(image,x,y,[15,15,15,255]);}for(let x=cx-10;x<cx+12;x++)color(image,x,25,[12,12,12,255]);}
  Preview.clearGlassesLenses(image,[{x:.25,y:.5,rx:.15,ry:.27},{x:.75,y:.5,rx:.15,ry:.27}]);
  assert.equal(image.data[(25*100+25)*4+3],0);assert.equal(image.data[(11*100+25)*4+3],0);assert.equal(image.data[(7*100+25)*4+3],255);assert.equal(image.data[(25*100+5)*4+3],255);
});

test('tinted lenses use a translucent photo-derived tint rather than opaque folded temples',()=>{
  const {Preview}=fixture(),image=pixels(100,50,[20,20,20,255]);
  Preview.clearGlassesLenses(image,[{x:.25,y:.5,rx:.15,ry:.3},{x:.75,y:.5,rx:.15,ry:.3}],'#afbb83');
  assert.deepEqual([...image.data.slice((25*100+25)*4,(25*100+25)*4+4)],[175,187,131,80]);assert.equal(image.data[3],255);
});

function face(){const p=Array.from({length:478},()=>({x:.5,y:.5,z:0}));p[33]={x:.35,y:.4,z:0};p[133]={x:.44,y:.4,z:0};p[263]={x:.65,y:.4,z:0};p[362]={x:.56,y:.4,z:0};p[168]={x:.5,y:.39,z:0};return p;}
test('glasses bridge follows the face, roll and scale; extreme yaw or absent face hides the product',()=>{
  const {Preview}=fixture(),points=face(),preview={width:400,height:150,frameWidth:.95,bridgeX:.5,bridgeY:.35};
  const a=Preview.glassesLayout(preview,points,720,1280,{scale:1}),b=Preview.glassesLayout(preview,points,720,1280,{scale:1.2});
  assert.equal(a.x,360);assert(b.width>a.width);assert.equal(a.quad.length,4);assert.equal(a.rotation,0);
  points[263].y=.43;assert(Preview.glassesLayout(preview,points,720,1280,{}).rotation>0);
  points[263].z=.4;assert.equal(Preview.glassesLayout(preview,points,720,1280,{}),null);assert.equal(Preview.glassesLayout(preview,null,720,1280,{}),null);
});

test('glasses packshot roll is corrected and selfie movement is mirrored once',()=>{
  const {Preview}=fixture(),points=face();for(const p of points)p.x-=.1;
  const a=Preview.glassesLayout({width:400,height:150,frameRoll:-10},points,720,1280,{mirror:false}),b=Preview.glassesLayout({width:400,height:150,frameRoll:-10},points,720,1280,{mirror:true});
  assert.equal(a.x,288);assert.equal(b.x,432);assert(Math.abs(a.rotation-Math.PI/18)<1e-10);assert(Math.abs(a.width-b.width)<1e-9);
});

test('garment mesh follows torso lean and hem width while retaining a bounded convex quad',()=>{
  const {Preview}=fixture(),points=Array.from({length:25},()=>({x:.5,y:.5,visibility:1}));points[11]={x:.25,y:.25,visibility:1};points[12]={x:.65,y:.26,visibility:1};points[23]={x:.4,y:.65,visibility:1};points[24]={x:.7,y:.66,visibility:1};
  const mesh=Preview.garmentMesh({width:400,height:500,productType:'tshirt'},points,720,1280,{});assert(mesh);
  const [a,b,c,d]=mesh.quad;assert((c.x+d.x)/2>(a.x+b.x)/2);assert(Math.hypot(c.x-d.x,c.y-d.y)<Math.hypot(a.x-b.x,a.y-b.y));assert(c.y>b.y);assert(d.y>a.y);
  points[11].visibility=.1;assert.equal(Preview.garmentMesh({width:400,height:500},points,720,1280,{}),null);
});

test('clothing head occlusion restores the mouth and chin but stops above the original shirt',()=>{
  const {Preview}=fixture(),p=Array.from({length:25},()=>({x:.5,y:.2,visibility:1}));p[2]={x:.45,y:.20,visibility:1};p[5]={x:.55,y:.21,visibility:1};p[7]={x:.4,y:.23,visibility:1};p[8]={x:.6,y:.24,visibility:1};p[9]={x:.48,y:.28,visibility:1};p[10]={x:.53,y:.28,visibility:1};p[11]={x:.3,y:.4,visibility:1};p[12]={x:.7,y:.42,visibility:1};
  const a=Preview.headOcclusion(p,720,1280,{}),b=Preview.headOcclusion(p,720,1280,{mirror:true});
  assert(a);assert(a.y+a.ry>.28*1280);assert(a.y+a.ry<.4*1280);assert(Math.abs(a.x+b.x-720)<1e-8);assert(a.rx<720*.2);p[9].visibility=.1;assert.equal(Preview.headOcclusion(p,720,1280,{}),null);
});

test('verified silhouettes preserve white product fabric while removing hangers and enclosed gaps',()=>{
  const {Preview}=fixture(),image=pixels(40,40),spec={keep:[[[.2,.2],[.8,.2],[.8,.9],[.2,.9]]],clear:[[[.4,.3],[.6,.3],[.6,.5],[.4,.5]]]};
  color(image,20,4,[130,70,20,255]); // A hanger outside the sourced garment outline.
  color(image,12,25,[245,244,246,255]);
  Preview.applySilhouette(image,spec);
  assert.equal(image.data[(4*40+20)*4+3],0);
  assert.equal(image.data[(16*40+20)*4+3],0);
  assert.deepEqual([...image.data.slice((25*40+12)*4,(25*40+12)*4+4)],[245,244,246,255]);
});

test('silhouette selection is tied to the exact product asset, not a generic replacement',()=>{
  const {Preview}=fixture(),p={id:'6431292464',image:'/products/6431292464.jpg',preview:{}};
  const mask=Preview.packshotMask(p,Preview.normalizedCrop());assert(mask.keep.length);assert.equal(mask.anchor.shoulderWidth,.52);
  assert.equal(Preview.packshotMask({...p,image:'/products/other.jpg'},Preview.normalizedCrop()),null);
  assert.equal(Preview.packshotMask({...p,id:'unknown'},Preview.normalizedCrop()),null);
  assert.throws(()=>Preview.rasterizePolygons([[[0,0],[1,0],[Infinity,1]]],10,10),/silhouette is invalid/);
});

test('transparent lens holes can seed neutral backdrop removal without changing dark rims',()=>{
  const {Preview}=fixture(),image=pixels(20,20);for(let y=3;y<17;y++)for(let x=3;x<17;x++)color(image,x,y,[10,10,10,255]);
  for(let y=6;y<14;y++)for(let x=6;x<14;x++)color(image,x,y,[255,255,255,255]);
  color(image,10,10,[255,255,255,0]);Preview.removeEdgeWhite(image,{transparentSeeds:true});
  assert.equal(image.data[(8*20+8)*4+3],0);assert.deepEqual([...image.data.slice((5*20+5)*4,(5*20+5)*4+4)],[10,10,10,255]);
});

test('gold edge matting removes white paper without turning warm metal into a white outline',()=>{
  const {Preview}=fixture(),image=pixels(3,1);color(image,1,0,[253,249,241,255]);color(image,2,0,[90,65,35,255]);
  Preview.cleanFrameBackdrop(image,'gold');assert.equal(image.data[3],0);assert(image.data[7]>0);assert(image.data[4]>image.data[6]);assert(image.data[6]<241);assert.deepEqual([...image.data.slice(8,12)],[90,65,35,255]);
});

test('unusable model or scene photos are rejected by the preview loader before loading any image',async()=>{
  const {Preview}=fixture();let loaded=false;const preview=new Preview({loadImage:async()=>{loaded=true;return {width:10,height:10};}});
  await assert.rejects(preview.load({...product('1','glasses'),preview:{available:false,unavailableReason:'A frontal packshot is needed.'}}),/frontal packshot/);assert.equal(loaded,false);
});

test('lip balm and sweater use the same product-photo pipelines without generic assets',async()=>{
  const {Preview}=fixture();const preview=new Preview({canvasFactory:canvasFactory(),loadImage:async()=>({width:10,height:10})});
  assert.equal((await preview.load({...product('1','lipbalm'),preview:{color:'#c75a74'}})).kind,'lip');
  assert.equal((await preview.load(product('2','sweater'))).kind,'garment');
});

test('white garment silhouette keeps the fabric and remaps source shoulder anchors after tight cropping',async()=>{
  const {Preview}=fixture(),preview=new Preview({canvasFactory:canvasFactory(pixels(640,640)),loadImage:async()=>({width:640,height:640})});
  const result=await preview.load({id:'7835573890',productType:'tshirt',image:'/products/7835573890.png',preview:{background:'white'}});
  assert.equal(result.cleanSilhouette,true);assert.equal(result.backgroundRemoved,true);assert(result.width>400&&result.width<600);assert(result.height>450&&result.height<600);
  assert(Math.abs(result.shoulderWidth-.5*640/result.width)<.0001);assert(result.shoulderY>.02&&result.shoulderY<.15);
});
