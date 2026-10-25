/* Camera snapshots for Nori. Only the active call may send the returned images.
 * This module never requests media, opens a connection, or persists a frame.
 */
(() => {
  'use strict';
  const MAX_EDGE = 480;
  const MAX_IMAGE_CHARS = 22000;
  const JPEG_PREFIX = 'data:image/jpeg;base64,';
  const MODES = new Set(['none','makeup','clothes','desk','glasses']);

  function fingerprint(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {hash ^= value.charCodeAt(i);hash = Math.imul(hash,16777619);}
    return (hash >>> 0).toString(16);
  }

  class NookCameraSnapshots {
    constructor({video, previewCanvas = null, getContext = () => ({cameraRunning:false}), isEnabled = () => false, document: ownerDocument = typeof document === 'undefined' ? null : document, canvasFactory} = {}) {
      if (!video) throw new Error('Camera snapshots require the existing video element.');
      Object.assign(this,{video,previewCanvas,getContext,isEnabled,document:ownerDocument});
      this.canvasFactory = canvasFactory || (() => this.document?.createElement('canvas'));
      this.scratch = new Map();
      this.lastFingerprint = null;
      this.lastPreparedAt = 0;
    }

    _allowed(context) {
      const video = this.video;
      return this.isEnabled() === true && context?.cameraRunning === true &&
        this.document?.hidden !== true &&
        (!this.document?.visibilityState || this.document.visibilityState === 'visible') &&
        video.readyState >= 2 && video.paused !== true &&
        Number.isFinite(video.videoWidth) && Number.isFinite(video.videoHeight) &&
        video.videoWidth > 0 && video.videoHeight > 0;
    }

    _encode(source, mirrored, name, sourceWidth, sourceHeight) {
      if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) return null;
      let canvas = this.scratch.get(name);
      if (!canvas) {
        canvas = this.canvasFactory();
        if (!canvas?.getContext || !canvas.toDataURL) return null;
        this.scratch.set(name,canvas);
      }
      const originalEdge = Math.max(sourceWidth,sourceHeight);
      const initialEdge = Math.min(MAX_EDGE,originalEdge);
      // Bound every item separately so raw + preview fit below a 64 KiB data-channel message.
      for (const factor of [1,.8,.6,.4,.25,.15]) {
        const edge = Math.max(1,Math.round(initialEdge*factor));
        canvas.width = Math.max(1,Math.round(sourceWidth*edge/originalEdge));
        canvas.height = Math.max(1,Math.round(sourceHeight*edge/originalEdge));
        const ctx = canvas.getContext('2d',{alpha:false});
        if (!ctx) return null;
        ctx.save();
        try {
          ctx.setTransform(1,0,0,1,0,0);
          ctx.clearRect(0,0,canvas.width,canvas.height);
          if (mirrored) {ctx.translate(canvas.width,0);ctx.scale(-1,1);}
          ctx.drawImage(source,0,0,canvas.width,canvas.height);
        } finally {ctx.restore();}
        for (const quality of [.55,.4,.27]) {
          const dataUrl = canvas.toDataURL('image/jpeg',quality);
          if (dataUrl.startsWith(JPEG_PREFIX) && dataUrl.length > JPEG_PREFIX.length && dataUrl.length <= MAX_IMAGE_CHARS) {
            return {dataUrl,width:canvas.width,height:canvas.height};
          }
        }
      }
      return null;
    }

    capture(reason = 'interval') {
      try {
        const context = this.getContext();
        if (!this._allowed(context)) return null;
        const mode = MODES.has(context.mode) ? context.mode : 'none';
        const mirror = context.mirror === true;
        const raw = this._encode(this.video,mirror,'camera',this.video.videoWidth,this.video.videoHeight);
        if (!raw) return null;
        const images = [{dataUrl:raw.dataUrl,kind:'camera'}];
        // The preview is already mirrored by the camera engine. Never mirror it twice.
        if (mode !== 'none' && this.previewCanvas?.width > 0 && this.previewCanvas?.height > 0) {
          let preview;
          try {preview = this._encode(this.previewCanvas,false,'tryon_preview',this.previewCanvas.width,this.previewCanvas.height);} catch {preview = null;}
          if (preview) images.push({dataUrl:preview.dataUrl,kind:'tryon_preview'});
        }
        if (!this._allowed(context)) return null;
        const now = Date.now();
        const signature = `${mode}:${mirror}:${images.map(image=>fingerprint(image.dataUrl)).join(':')}`;
        if (reason === 'interval' && signature === this.lastFingerprint && now-this.lastPreparedAt < 10000) return null;
        this.lastFingerprint = signature;
        this.lastPreparedAt = now;
        return {
          images,
          metadata:{
            capturedAt:new Date(now).toISOString(),mode,mirror,
            width:raw.width,height:raw.height,
            sourceWidth:this.video.videoWidth,sourceHeight:this.video.videoHeight,
            reason:typeof reason === 'string' ? reason.slice(0,40) : 'interval',
            previewIncluded:images.length === 2,
            previewIsVirtual:images.length === 2,
          },
        };
      } catch {return null;}
    }

    clear() {
      for (const canvas of this.scratch.values()) {
        try {canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);} catch {}
        canvas.width = 0;canvas.height = 0;
      }
      this.scratch.clear();
      this.lastFingerprint = null;
      this.lastPreparedAt = 0;
    }
  }
  window.NookCameraSnapshots = NookCameraSnapshots;
})();
