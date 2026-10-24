/*
 * Nook live camera overlays. This engine runs locally. The separate, shopper-controlled
 * camera-snapshots module can share frames with Nori during an active call.
 * Tracking: Google MediaPipe Tasks Vision 0.10.14 (Apache-2.0).
 * https://github.com/google-ai-edge/mediapipe
 * https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js
 * https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js
 * Product photos are approximate 2D previews, not verified fit, scale, or colour.
 */
(function () {
  'use strict';
  const VERSION = '0.10.14';
  const LIBRARY = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`;
  const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
  const FACE = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  const POSE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  const OUTER_LIP = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185];
  const INNER_LIP = [78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191];
  const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
  let libraryPromise;
  async function runtime() {
    if (!libraryPromise) libraryPromise = import(LIBRARY).then(async mod => ({mod, files: await mod.FilesetResolver.forVisionTasks(WASM)})).catch(error => {libraryPromise = null; throw error;});
    return libraryPromise;
  }

  class NookCamera {
    constructor({video, canvas, onStatus = () => {}}) {
      if (!video || !canvas) throw new Error('NookCamera needs a video and a canvas element.');
      this.video = video;
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', {alpha:false});
      this.onStatus = onStatus;
      this.running = false;
      this.mode = 'none';
      this.modeSequence = 0;
      this.product = null;
      this.productPreview = null;
      this.productLoader = null;
      this.productSequence = 0;
      this.productLoading = false;
      this.options = {color:'#b5415a', opacity:0.5, scale:1, x:0.5, y:0.68, rotation:0, mirror:true, showGuides:false};
      this.models = {};
      this.loading = {};
      this.errors = {};
      this.stream = null;
      this.generation = 0;
      this.raf = null;
      this.lastDetect = 0;
      this.lastVideoTime = -1;
      this.lastLandmarks = null;
      this.actualFacingMode = 'user';
      this.cameraDeviceId = null;
      this.canFlip = null;
      this.lastCameraError = null;
      this._lastStatus = '';
      this._frame = this._frame.bind(this);
    }

    _status(text, kind = 'info') {
      const key = `${kind}:${text}`;
      if (key !== this._lastStatus) { this._lastStatus = key; this.onStatus(text, kind); }
    }

    async start({facingMode = 'user', portrait = false, strictFacing = false} = {}) {
      const previousDeviceId=this.cameraDeviceId;
      this.stop(false);
      this.lastCameraError=null;
      const generation = this.generation;
      if (!window.isSecureContext) { this._status('Camera access needs HTTPS or localhost. Open the secure demo link in a browser.', 'error'); return false; }
      if (!navigator.mediaDevices?.getUserMedia) { this._status('This browser does not expose camera access. Open the demo in Chrome or Safari.', 'error'); return false; }
      this._status('Waiting for your camera permission…', 'loading');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:strictFacing?{exact:facingMode}:{ideal:facingMode},width:{ideal:portrait?720:960},height:{ideal:portrait?1280:720}},audio:false});
        if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return false; }
        const settings=stream.getVideoTracks()[0]?.getSettings?.()||{};
        if(strictFacing&&((settings.facingMode&&settings.facingMode!==facingMode)||(!settings.facingMode&&previousDeviceId&&settings.deviceId===previousDeviceId))){stream.getTracks().forEach(track=>track.stop());const error=new Error('This device has no other camera available.');error.name='OverconstrainedError';throw error;}
        this.actualFacingMode=settings.facingMode||facingMode;
        this.cameraDeviceId=settings.deviceId||null;
        this.stream = stream;
        this.video.srcObject = stream;
        this.video.muted = true;
        this.video.playsInline = true;
        this.video.setAttribute('playsinline', '');
        await this.video.play();
        if (!this.video.videoWidth) await new Promise((resolve,reject) => {
          const timer = setTimeout(() => {cleanup(); reject(new Error('Camera started but no video frame arrived.'));}, 12000);
          const ready = () => {clearTimeout(timer); cleanup(); resolve();};
          const cleanup = () => this.video.removeEventListener('loadeddata',ready);
          this.video.addEventListener('loadeddata',ready,{once:true});
          if (this.video.readyState >= 2 && this.video.videoWidth) ready();
        });
        if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return false; }
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.running = true;
        if(navigator.mediaDevices.enumerateDevices)navigator.mediaDevices.enumerateDevices().then(devices=>{if(this.stream===stream)this.canFlip=devices.filter(device=>device.kind==='videoinput').length>1;}).catch(()=>{});
        this.lastVideoTime = -1;
        this.lastDetect = 0;
        stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {if(this.stream===stream){this.stop(false);this._status('The camera was disconnected or its permission was revoked. Start it again when ready.','error');}}, {once:true}));
        this.raf = requestAnimationFrame(this._frame);
        this._status('Camera is live. Preparing your selected overlay…', 'loading');
        // Keep the camera visible even while the tracking model downloads.
        this._prepare(this.mode, generation);
        return true;
      } catch (error) {
        if (generation !== this.generation) return false;
        this.stop(false);
        const messages = {
          NotAllowedError:'Camera permission was denied. Allow Camera in this site’s browser settings, then press Start camera. If using an embedded browser, open the demo in Chrome or Safari.',
          NotFoundError:'No camera was found. Connect a webcam or open the demo on your phone.',
          NotReadableError:'Your camera is busy or blocked by the system. Close other camera apps, then try again.',
          OverconstrainedError:'This camera could not use the requested settings. Try another camera or browser.'
        };
        this.lastCameraError={name:error.name||'CameraError',message:strictFacing&&error.name==='OverconstrainedError'?'A second camera is not available on this device.':messages[error.name]||error.message||'Camera could not start.'};
        this._status(this.lastCameraError.message, 'error');
        return false;
      }
    }

    stop(announce = true) {
      this.generation++;
      this.productSequence++;
      this.productLoader?.clear();
      if(this.productLoading){this.product=null;this.productPreview=null;}
      this.productLoading=false;
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.raf = null;
      if(this.stream) this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.video.pause();
      this.video.srcObject = null;
      for (const model of Object.values(this.models)) { try {model.close();} catch {} }
      this.models = {};
      this.loading = {};
      this.errors = {};
      this.lastLandmarks = null;
      if(this.ctx) this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
      if(announce) this._status('Camera stopped. Camera sharing is off.', 'info');
    }

    async setMode(mode) {
      if (!['none','makeup','glasses','clothes','desk'].includes(mode)) throw new Error('Unknown camera mode.');
      const sequence = ++this.modeSequence;
      if(mode==='none'||(this.product&&this.product.category!==mode))await this.setProduct(null);
      if(sequence!==this.modeSequence)return false;
      this.mode = mode;
      if(mode==='makeup'&&this.productPreview?.shadeColor)this.setOptions({color:this.productPreview.shadeColor});
      this.lastLandmarks = null;
      this.lastVideoTime = -1;
      this.lastDetect = 0;
      delete this.errors[mode];
      if(this.running) return this._prepare(mode, this.generation);
      this._status('Press Start camera when you are ready.', 'info');
    }

    async setProduct(product) {
      const token=++this.productSequence;
      this.product=null;this.productPreview=null;this.productLoading=false;
      if(!product){this.productLoader?.clear();return {ok:true,productId:null,kind:null};}
      if(!window.NookProductPreview)throw Error('Product previews did not load. Refresh this page.');
      if(!this.productLoader)this.productLoader=new window.NookProductPreview();
      this.product=product;this.productLoading=true;
      this._status('Preparing the actual product photo…','loading');
      try {
        const result=await this.productLoader.load(product);
        if(token!==this.productSequence||result.stale)return {ok:false,stale:true};
        this.productPreview=result;this.productLoading=false;
        if(result.shadeColor)this.setOptions({color:result.shadeColor});
        this._status(result.notice,'success');
        const {canvas,...details}=result;return details;
      } catch(error) {
        if(token!==this.productSequence)return {ok:false,stale:true};
        this.product=null;this.productPreview=null;this.productLoading=false;
        this._status(error.message||'Product preview is unavailable.','error');throw error;
      }
    }

    setOptions(options = {}) {
      const next = {...this.options};
      if(/^#[0-9a-f]{6}$/i.test(options.color || '')) next.color = options.color;
      for (const [key,min,max] of [['opacity',0,1],['scale',0.35,2.5],['x',0,1],['y',0,1],['rotation',-180,180]]) {
        if(Number.isFinite(Number(options[key])) && options[key] !== undefined) next[key] = clamp(Number(options[key]),min,max);
      }
      if(typeof options.mirror==='boolean') next.mirror = options.mirror;
      if(typeof options.showGuides==='boolean') next.showGuides = options.showGuides;
      this.options = next;
    }

    capture() {
      if(!this.running) return null;
      return this.canvas.toDataURL('image/png');
    }

    async _prepare(mode,generation) {
      if(mode === 'none') {this._status('Camera live.', 'success');return;}
      if(!this.productPreview){this._status('Choose a product and tap Try it to preview its photo.','info');return;}
      if(mode === 'desk') {this._status('Product photo ready. Tap its floor or desk position. Placement is approximate 2D.', 'success');return;}
      if(this.models[mode]) return;
      if(this.loading[mode]) return this.loading[mode];
      this._status(`Camera live. Loading ${['makeup','glasses'].includes(mode)?'face':'body'} tracking on your device…`, 'loading');
      const promise = (async () => {
        let model;
        try {
          const {mod,files} = await runtime();
          if(generation !== this.generation || !this.running) return;
          const isFace=['makeup','glasses'].includes(mode),Type = isFace ? mod.FaceLandmarker : mod.PoseLandmarker;
          const base = {baseOptions:{modelAssetPath:isFace?FACE:POSE,delegate:'GPU'},runningMode:'VIDEO',minTrackingConfidence:0.5};
          if(isFace) Object.assign(base,{numFaces:1,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});
          else Object.assign(base,{numPoses:1,outputSegmentationMasks:false});
          try {model = await Type.createFromOptions(files,base);}
          catch {base.baseOptions.delegate='CPU';model = await Type.createFromOptions(files,base);}
          if(generation !== this.generation || !this.running) {model.close();return;}
          this.models[mode] = model;
          delete this.errors[mode];
          if(this.mode===mode) this._status(isFace?'Face tracker ready. Face the camera in good light.':'Body tracker ready. Step back until both shoulders and hips are visible.', 'success');
        } catch (error) {
          if(generation !== this.generation) return;
          this.errors[mode] = error.message || 'Tracking download failed';
          if(this.mode===mode) this._status('Camera is live, but tracking could not load. Check your connection and select this mode again to retry. Desk placement still works.', 'error');
        } finally {
          if(generation===this.generation) delete this.loading[mode];
        }
      })();
      this.loading[mode] = promise;
      return promise;
    }

    _frame(now) {
      if(!this.running) return;
      this.raf = requestAnimationFrame(this._frame);
      if(this.video.readyState < 2 || !this.video.videoWidth) return;
      const {ctx,canvas,video,options} = this;
      if(canvas.width!==video.videoWidth || canvas.height!==video.videoHeight) {canvas.width=video.videoWidth;canvas.height=video.videoHeight;}
      const w=canvas.width,h=canvas.height;
      const model=this.models[this.mode];
      if(model && now-this.lastDetect>=66 && video.currentTime!==this.lastVideoTime) {
        this.lastDetect=now;
        this.lastVideoTime=video.currentTime;
        try {
          const result=model.detectForVideo(video,now);
          const detected=(['makeup','glasses'].includes(this.mode)?result.faceLandmarks:result.landmarks)?.[0]||null;
          this.lastLandmarks=this._smooth(detected);
          if(this.lastLandmarks) this._status(this.mode==='makeup'?'Product lip colour preview active. Colour from the listing photo is approximate.':this.mode==='glasses'?'Glasses follow your face. Turn gently; fit is approximate.':'Garment follows your shoulders and torso. Fit remains approximate.', 'success');
          else this._status(['makeup','glasses'].includes(this.mode)?'Looking for your face. Face the camera and improve the lighting.':'Looking for your body. Step back so your shoulders and hips are visible.', 'info');
        } catch(error) {
          this.lastLandmarks=null;
          this.errors[this.mode]=error.message;
          try {model.close();} catch {}
          delete this.models[this.mode];
          this._status('Camera is live, but tracking stopped. Select this mode again to reload it.', 'error');
        }
      }
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,w,h);
      if(options.mirror) {ctx.translate(w,0);ctx.scale(-1,1);}
      ctx.drawImage(video,0,0,w,h);
      if(this.mode==='makeup'&&this.lastLandmarks&&this.productPreview?.kind==='lip')this._makeup(this.lastLandmarks,w,h);
      ctx.restore();
      // Product photos are drawn in display coordinates, so printed logos are never mirrored.
      if(this.mode==='desk')this._desk(w,h);
      else if(this.mode==='clothes'&&this.lastLandmarks)this._clothes(this.lastLandmarks,w,h);
      else if(this.mode==='glasses'&&this.lastLandmarks)this._glasses(this.lastLandmarks,w,h);
    }

    _makeup(points,w,h) {
      const ctx=this.ctx, o=this.options;
      const path = indices => {indices.forEach((index,i)=>{const p=points[index];if(i)ctx.lineTo(p.x*w,p.y*h);else ctx.moveTo(p.x*w,p.y*h);});ctx.closePath();};
      if(!points[425]) return;
      ctx.save();
      ctx.globalAlpha=o.opacity;
      ctx.globalCompositeOperation='multiply';
      ctx.fillStyle=o.color;
      ctx.beginPath();path(OUTER_LIP);path(INNER_LIP);ctx.fill('evenodd');
      ctx.globalCompositeOperation='source-over';
      ctx.restore();
      if(o.showGuides) this._guides([...OUTER_LIP,...INNER_LIP].map(index=>points[index]),w,h);
    }

    _smooth(points) {
      if(!points)return null;
      if(!this.lastLandmarks||this.lastLandmarks.length!==points.length)return points.map(p=>({...p}));
      return points.map((p,i)=>{const old=this.lastLandmarks[i],distance=Math.hypot(p.x-old.x,p.y-old.y),alpha=distance>.07?.85:.55;return {...p,x:old.x+(p.x-old.x)*alpha,y:old.y+(p.y-old.y)*alpha,z:(old.z||0)+((p.z||0)-(old.z||0))*alpha};});
    }

    _glasses(points,w,h) {
      const preview=this.productPreview;if(!preview||preview.kind!=='glasses')return;
      const layout=window.NookProductPreview.glassesLayout(preview,points,w,h,this.options);
      if(!layout){this._status('Face forward slightly to align your glasses.','info');return;}
      const ctx=this.ctx;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=this.options.opacity;
      window.NookProductPreview.drawQuad(ctx,preview.canvas,layout.quad,4,2);ctx.restore();
    }

    _clothes(points,w,h) {
      const preview=this.productPreview;
      if(!preview||preview.kind!=='garment')return;
      const layout=window.NookProductPreview.garmentMesh(preview,points,w,h,this.options);
      if(!layout){this._status('Keep both shoulders and hips in view for the product photo.','info');return;}
      const ctx=this.ctx;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=this.options.opacity;
      window.NookProductPreview.drawQuad(ctx,preview.canvas,layout.quad,3,4);ctx.restore();
      this._headOverClothes(points,w,h);
      this._handsOverClothes(points,w,h);
    }

    _headOverClothes(points,w,h) {
      const ctx=this.ctx;if(typeof ctx.ellipse!=='function')return;
      const mask=window.NookProductPreview.headOcclusion(points,w,h,this.options);if(!mask)return;
      ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();ctx.ellipse(mask.x,mask.y,mask.rx,mask.ry,mask.rotation,0,Math.PI*2);ctx.clip();
      if(this.options.mirror){ctx.translate(w,0);ctx.scale(-1,1);}ctx.drawImage(this.video,0,0,w,h);ctx.restore();
    }

    _handsOverClothes(points,w,h) {
      const ctx=this.ctx;if(typeof ctx.clip!=='function')return;
      const p=i=>({x:(this.options.mirror?1-points[i].x:points[i].x)*w,y:points[i].y*h});
      const shoulder=Math.hypot((points[11].x-points[12].x)*w,(points[11].y-points[12].y)*h),radius=Math.max(5,shoulder*.075);
      for(const [wrist,index,pinky] of [[15,19,17],[16,20,18]]){
        if(![wrist,index,pinky].every(i=>points[i]&&(points[i].visibility??0)>.65))continue;
        const a=p(wrist),b=p(index),c=p(pinky),mid={x:(b.x+c.x)/2,y:(b.y+c.y)/2};
        if(Math.hypot(mid.x-a.x,mid.y-a.y)>shoulder*.45)continue;
        ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();ctx.arc((a.x+mid.x)/2,(a.y+mid.y)/2,Math.min(radius*1.7,Math.hypot(mid.x-a.x,mid.y-a.y)*.55+radius*.6),0,Math.PI*2);ctx.clip();
        if(this.options.mirror){ctx.translate(w,0);ctx.scale(-1,1);}ctx.drawImage(this.video,0,0,w,h);ctx.restore();
      }
    }

    _desk(w,h) {
      const preview=this.productPreview;
      if(!preview||preview.kind!=='object')return;
      const layout=window.NookProductPreview.objectLayout(preview,w,h,this.options),ctx=this.ctx;
      ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.translate(layout.x,layout.y);ctx.rotate(layout.rotation);
      if(preview.backgroundRemoved&&typeof ctx.ellipse==='function'){ctx.save();ctx.globalAlpha=this.options.opacity*.22;ctx.fillStyle='#101713';ctx.filter='blur(5px)';ctx.beginPath();ctx.ellipse(0,0,layout.width*.35,Math.max(3,layout.width*.045),0,0,Math.PI*2);ctx.fill();ctx.restore();}
      ctx.globalAlpha=this.options.opacity;
      ctx.drawImage(preview.canvas,-layout.width/2,-layout.height,layout.width,layout.height);
      ctx.restore();
    }

    _guides(points,w,h) {
      const ctx=this.ctx;ctx.save();ctx.fillStyle='#c9ff7a';ctx.strokeStyle='#28462e';ctx.lineWidth=1;
      for(const p of points) {ctx.beginPath();ctx.arc(p.x*w,p.y*h,2.3,0,Math.PI*2);ctx.fill();ctx.stroke();}ctx.restore();
    }
  }
  window.NookCamera = NookCamera;
})();
