import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../public/camera-snapshots.js',import.meta.url),'utf8');
const PREFIX='data:image/jpeg;base64,';
function harness({mode='none',mirror=true,encoder}={}) {
  let now=100000,enabled=true;
  const doc={hidden:false,visibilityState:'visible'};
  const context={mode,mirror,cameraRunning:true};
  const video={readyState:2,paused:false,videoWidth:720,videoHeight:1280};
  const preview={width:720,height:1280};
  const canvases=[];
  const kernel={window:{},Date:class extends Date{constructor(value){super(value??now);}static now(){return now;}}};
  vm.runInNewContext(source,kernel);
  const snapshots=new kernel.window.NookCameraSnapshots({video,previewCanvas:preview,getContext:()=>context,isEnabled:()=>enabled,document:doc,canvasFactory:()=>{
    const operations=[];
    const canvas={width:0,height:0,operations,lastSource:null,
      getContext(){return {save(){operations.push(['save']);},restore(){operations.push(['restore']);},setTransform(...args){operations.push(['setTransform',...args]);},clearRect(...args){operations.push(['clearRect',...args]);},translate(...args){operations.push(['translate',...args]);},scale(...args){operations.push(['scale',...args]);},drawImage(source,...args){canvas.lastSource=source;operations.push(['drawImage',source,...args]);}};},
      toDataURL(type,quality){operations.push(['encode',type,quality,canvas.width,canvas.height]);return encoder?encoder(canvas,quality):PREFIX+(canvas.lastSource===video?'A':'B').repeat(1000);},
    };canvases.push(canvas);return canvas;
  }});
  return {snapshots,doc,context,video,preview,canvases,setEnabled:value=>{enabled=value;},advance:ms=>{now+=ms;}};
}

test('no capture or encoding before consent, from a stopped camera, or while the document is hidden',()=>{
  for(const change of [h=>h.setEnabled(false),h=>{h.context.cameraRunning=false;},h=>{h.doc.hidden=true;},h=>{h.doc.visibilityState='hidden';},h=>{h.doc.visibilityState='prerender';},h=>{h.video.paused=true;},h=>{h.video.readyState=1;},h=>{h.video.videoWidth=0;}]){
    const h=harness();change(h);assert.equal(h.snapshots.capture('tool'),null);assert.equal(h.canvases.length,0);
  }
});

test('raw camera is mirrored once, resized proportionally, and carries fresh source metadata',()=>{
  const h=harness();const result=h.snapshots.capture('speech');assert.equal(result.images.length,1);assert.equal(result.images[0].kind,'camera');assert.equal(result.metadata.width,270);assert.equal(result.metadata.height,480);assert.equal(result.metadata.sourceWidth,720);assert.equal(result.metadata.sourceHeight,1280);assert.equal(result.metadata.mirror,true);assert.equal(result.metadata.capturedAt,'1970-01-01T00:01:40.000Z');assert.equal(result.metadata.reason,'speech');assert.ok(h.canvases[0].operations.some(op=>op[0]==='scale'&&op[1]===-1));assert.equal(h.canvases[0].lastSource,h.video);
});

test('active virtual try-on is sent separately from raw video and is not mirrored twice',()=>{
  for(const mode of ['makeup','clothes','desk','glasses']){const h=harness({mode});const result=h.snapshots.capture();assert.equal(result.metadata.mode,mode);assert.equal(result.images.length,2);assert.equal(result.images[0].kind,'camera');assert.equal(result.images[1].kind,'tryon_preview');assert.equal(result.metadata.previewIsVirtual,true);assert.equal(h.canvases[1].lastSource,h.preview);assert.equal(h.canvases[1].operations.some(op=>op[0]==='scale'),false);assert.notEqual(result.images[0].dataUrl,result.images[1].dataUrl);}
});

test('compression reduces quality and dimensions until every image fits the transport budget',()=>{
  const h=harness({mode:'desk',encoder:(canvas,quality)=>PREFIX+'A'.repeat(Math.ceil(canvas.width*canvas.height*quality))});const result=h.snapshots.capture();assert.equal(result.images.length,2);assert.ok(result.images.every(image=>image.dataUrl.length<=22000));assert.ok(result.images.reduce((sum,image)=>sum+image.dataUrl.length,0)<=44000);assert.ok(result.metadata.height<480);assert.ok(h.canvases.every(canvas=>canvas.operations.filter(op=>op[0]==='encode').length>3));
});

test('oversized or invalid encoded camera images fail closed',()=>{
  for(const encoded of [PREFIX+'A'.repeat(22001),'data:,','data:image/png;base64,AAAA']){const h=harness({encoder:()=>encoded});assert.equal(h.snapshots.capture(),null);}
});

test('a preview encoding error preserves the usable raw snapshot without claiming a preview exists',()=>{
  const h=harness({mode:'clothes',encoder:canvas=>{if(canvas.lastSource===h.preview)throw Error('preview unavailable');return PREFIX+'A'.repeat(100);}});const result=h.snapshots.capture();assert.equal(result.images.length,1);assert.equal(result.metadata.previewIncluded,false);
});

test('unchanged interval frames are suppressed for ten seconds, while explicit requests remain fresh',()=>{
  const h=harness();assert.ok(h.snapshots.capture());h.advance(3000);assert.equal(h.snapshots.capture(),null);assert.ok(h.snapshots.capture('tool'));h.advance(9000);assert.equal(h.snapshots.capture(),null);h.advance(1000);assert.ok(h.snapshots.capture());assert.equal('lastDataUrl' in h.snapshots,false);assert.match(h.snapshots.lastFingerprint,/^none:true:[a-f0-9]+$/);
});

test('clear erases only scratch pixels and comparison state, never camera or preview sources',()=>{
  const h=harness({mode:'desk'});assert.ok(h.snapshots.capture());const scratch=[...h.canvases];h.snapshots.clear();assert.ok(scratch.every(canvas=>canvas.width===0&&canvas.height===0));assert.equal(h.snapshots.lastFingerprint,null);assert.equal(h.preview.width,720);assert.equal(h.preview.height,1280);assert.equal(h.video.paused,false);assert.ok(h.snapshots.capture());assert.equal(h.canvases.length,4);
});

test('losing sharing permission during preparation discards the encoded frame',()=>{
  let h;h=harness({encoder:()=>{h.setEnabled(false);return PREFIX+'A'.repeat(100);}});assert.equal(h.snapshots.capture('tool'),null);
});
