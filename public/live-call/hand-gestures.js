/* On-device hand swipes. Reuses the camera video; never requests or uploads media.
 * Google MediaPipe Tasks Vision 0.10.14, Apache-2.0.
 * https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
 */
(() => {
  'use strict';
  const VERSION = '0.10.14';
  const LIBRARY = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`;
  const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  let runtimePromise;
  function loadRuntime() {
    if (!runtimePromise) runtimePromise = import(LIBRARY).then(async mod => ({
      mod, files: await mod.FilesetResolver.forVisionTasks(WASM),
    })).catch(error => {runtimePromise = null; throw error;});
    return runtimePromise;
  }

  // Separate, deterministic motion recognition makes false-positive cases testable.
  class NookSwipeDetector {
    constructor() {
      this.samples = [];
      this.cooldownUntil = 0;
      this.needsNeutral = false;
      this.neutralSince = null;
      this.neutralPoint = null;
      this.lastTime = -Infinity;
    }
    // Preserve the post-swipe lock when a product changes immediately after a swipe.
    reset() {this.samples = []; this.neutralSince = null; this.neutralPoint = null;}
    update(sample, now) {
      if (!Number.isFinite(now) || now <= this.lastTime) return null;
      const gap = now - this.lastTime;
      this.lastTime = now;
      const valid = sample && sample.open !== false && (sample.confidence ?? 1) >= 0.65 &&
        Number.isFinite(sample.x) && Number.isFinite(sample.y) && sample.x >= 0 && sample.x <= 1 && sample.y >= 0 && sample.y <= 1;
      if (!valid) {
        this.samples = [];
        this.neutralPoint = null;
        if (this.neutralSince === null) this.neutralSince = now;
        if (now - this.neutralSince >= 200) this.needsNeutral = false;
        return null;
      }
      const point = {x: sample.mirror ? 1 - sample.x : sample.x, y: sample.y, time: now};
      if (this.needsNeutral) {
        this.samples = [];
        // A deliberate pause in the middle, or lowering/closing the hand, rearms it.
        if (point.x >= 0.35 && point.x <= 0.65 && this.neutralPoint &&
            Math.hypot(point.x - this.neutralPoint.x, point.y - this.neutralPoint.y) < 0.045) {
          if (this.neutralSince === null) this.neutralSince = now;
          if (now - this.neutralSince >= 300) this.needsNeutral = false;
        } else {this.neutralSince = null; this.neutralPoint = point;}
        return null;
      }
      this.neutralSince = null;
      this.neutralPoint = null;
      if (now < this.cooldownUntil) {this.samples = []; return null;}
      if (gap > 350) this.samples = [];
      const previous = this.samples[this.samples.length - 1];
      if (previous && Math.abs(point.x - previous.x) > 0.32) {this.samples = [point]; return null;}
      this.samples.push(point);
      this.samples = this.samples.filter(item => now - item.time <= 1000);
      if (this.samples.length < 3) return null;
      const first = this.samples[0];
      const dx = point.x - first.x;
      const ys = this.samples.map(item => item.y);
      if (Math.max(...ys) - Math.min(...ys) >= 0.22 || now - first.time < 150) return null;
      if (Math.abs(dx) < 0.20) return null;
      const direction = Math.sign(dx);
      const steps = this.samples.slice(1).map((item, index) => item.x - this.samples[index].x);
      const deliberateSteps = steps.filter(step => step * direction >= 0.03).length;
      const pathLength = steps.reduce((sum, step) => sum + Math.abs(step), 0);
      if (deliberateSteps < 2 || Math.abs(dx) / Math.max(pathLength, 0.001) < 0.8) return null;
      this.samples = [];
      this.cooldownUntil = now + 1200;
      this.needsNeutral = true;
      return direction > 0 ? 'right' : 'left';
    }
    updateLandmarks(points, now, mirror = false) {
      const required = [0,5,6,8,9,10,12,13,14,16,17,18,20];
      if (!Array.isArray(points) || required.some(i => !points[i] || !Number.isFinite(points[i].x) || !Number.isFinite(points[i].y))) return this.update(null, now);
      const wrist = points[0];
      const distance = point => Math.hypot(point.x - wrist.x, point.y - wrist.y);
      const extended = [[8,6],[12,10],[16,14],[20,18]].filter(([tip,pip]) => distance(points[tip]) > distance(points[pip]) * 1.18 + 0.012).length;
      const palmWidth = Math.hypot(points[5].x - points[17].x, points[5].y - points[17].y);
      const indices = [0,5,9,13,17];
      const x = indices.reduce((sum,i) => sum + points[i].x, 0) / indices.length;
      const y = indices.reduce((sum,i) => sum + points[i].y, 0) / indices.length;
      return this.update({x,y,mirror,open:extended >= 3 && palmWidth >= 0.035}, now);
    }
  }

  class NookHandGestures {
    constructor({video, onSwipe = () => {}, onStatus = () => {}, getMirror = () => true, isEnabled = () => true, runtimeLoader = loadRuntime} = {}) {
      if (!video) throw new Error('Hand swipes need the existing camera video.');
      Object.assign(this, {video,onSwipe,onStatus,getMirror,isEnabled,runtimeLoader});
      this.detector = new NookSwipeDetector();
      this.model = null;
      this.running = false;
      this.generation = 0;
      this.pending = null;
      this.frameId = null;
      this.lastDetect = -Infinity;
      this.lastVideoTime = -1;
      this._lastStatus = '';
      this._frame = this._frame.bind(this);
    }
    _status(message, kind = 'info') {
      if (`${kind}:${message}` === this._lastStatus) return;
      this._lastStatus = `${kind}:${message}`;
      this.onStatus(message, kind);
    }
    async start() {
      if (this.running) return true;
      if (this.pending) return this.pending;
      const generation = ++this.generation;
      this._status('Preparing hand swipes…', 'loading');
      this.pending = (async () => {
        let model;
        try {
          const {mod,files} = await this.runtimeLoader();
          if (generation !== this.generation) return false;
          const options = {baseOptions:{modelAssetPath:MODEL,delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:0.65,minHandPresenceConfidence:0.65,minTrackingConfidence:0.65};
          try {model = await mod.HandLandmarker.createFromOptions(files, options);}
          catch (error) {
            if (generation !== this.generation) return false;
            options.baseOptions.delegate = 'CPU';
            model = await mod.HandLandmarker.createFromOptions(files, options);
          }
          if (generation !== this.generation) {model.close(); return false;}
          this.model = model;
          this.detector = new NookSwipeDetector();
          this.lastDetect = -Infinity;
          this.lastVideoTime = -1;
          this.running = true;
          this.frameId = requestAnimationFrame(this._frame);
          this._status('Open palm · swipe left or right', 'ready');
          return true;
        } catch {
          if (generation !== this.generation) return false;
          try {model?.close();} catch {}
          this.model = null;
          this.running = false;
          this._status('Hand swipes unavailable. Swipe the card instead.', 'error');
          return false;
        } finally {if (generation === this.generation) this.pending = null;}
      })();
      return this.pending;
    }
    stop() {
      this.generation++;
      this.running = false;
      this.pending = null;
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
      try {this.model?.close();} catch {}
      this.model = null;
      this.detector.reset();
      this._status('Hand swipes off', 'off');
    }
    reset() {this.detector.reset();}
    _frame(now) {
      if (!this.running || !this.model) return;
      this.frameId = requestAnimationFrame(this._frame);
      if (!this.isEnabled()) {this.detector.reset(); return;}
      if (this.video.readyState < 2 || !this.video.videoWidth || this.video.paused || now - this.lastDetect < 100 || this.video.currentTime === this.lastVideoTime) return;
      this.lastDetect = now;
      this.lastVideoTime = this.video.currentTime;
      try {
        const result = this.model.detectForVideo(this.video, now);
        const direction = this.detector.updateLandmarks(result.landmarks?.[0], now, this.getMirror());
        if (direction) {
          this._status(direction === 'right' ? 'Added · lower your hand to reset' : 'Skipped · lower your hand to reset', 'swipe');
          this.onSwipe(direction);
        } else if (!this.detector.needsNeutral && now >= this.detector.cooldownUntil) {
          this._status('Open palm · swipe left or right', 'ready');
        }
      } catch {
        this.stop();
        this._status('Hand tracking paused. Swipe the card instead.', 'error');
      }
    }
  }
  window.NookSwipeDetector = NookSwipeDetector;
  window.NookHandGestures = NookHandGestures;
})();
