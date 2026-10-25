import * as THREE from 'three';
import {clamp, createFrameBudgetMonitor, damp, spring01} from './math';

export type HatchPhase = 'dawn' | 'noon' | 'store' | 'night';
export interface HatchEngineOptions {
  hatched: boolean;
  phase: HatchPhase;
  reducedMotion: boolean;
  onReady(): void;
  onFailure(): void;
}
export interface HatchEngine {
  setHatched(value: boolean): void;
  setPhase(value: HatchPhase): void;
  setPointer(x: number, y: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** Shared jagged rim means the two low-poly shell pieces close into one complete egg. */
function eggShell(upper: boolean): THREE.BufferGeometry {
  const positions: number[] = [];
  const sides = 20, rings = 8;
  const point = (side: number, ring: number) => {
    const theta = side / sides * Math.PI * 2;
    const rim = Math.PI / 2 + (side % 2 ? .075 : -.075);
    const phi = upper ? rim * ring / rings : rim + (Math.PI - rim) * ring / rings;
    const radius = .64 * Math.sin(phi) * (1 - .17 * Math.cos(phi));
    return [Math.cos(theta) * radius, Math.cos(phi) * .89, Math.sin(theta) * radius];
  };
  for (let ring = 0; ring < rings; ring++) for (let side = 0; side < sides; side++) {
    const a = point(side, ring), b = point(side + 1, ring), c = point(side + 1, ring + 1), d = point(side, ring + 1);
    positions.push(...a, ...b, ...d, ...b, ...c, ...d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createHatchDiorama(canvas: HTMLCanvasElement, options: HatchEngineOptions): HatchEngine {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let partialRenderer: THREE.WebGLRenderer | undefined;
  let cleanup: (() => void) | undefined;
  try {
    const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power'});
    partialRenderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-2.25, 2.25, 2.25, -2.25, .1, 30);
    const geometry = <T extends THREE.BufferGeometry>(item: T): T => { geometries.add(item); return item; };
    const material = <T extends THREE.Material>(item: T): T => { materials.add(item); return item; };
    const matte = (color: string) => material(new THREE.MeshStandardMaterial({color, flatShading: true, roughness: 1, metalness: 0}));
    const paper = matte('#FFF8F0'), baseEdge = matte('#D9B991'), teal = matte('#387D76');
    const cream = matte('#FFF6D7'), ink = matte('#16424A'), blush = matte('#E6B477');
    const sphere = geometry(new THREE.IcosahedronGeometry(1, 2));
    const eyeSphere = geometry(new THREE.SphereGeometry(1, 12, 8));
    const baseGeometry = geometry(new THREE.CylinderGeometry(1.58, 1.53, .24, 12));
    const diskGeometry = geometry(new THREE.CylinderGeometry(1.57, 1.57, .065, 12));
    const floor = new THREE.Group();
    const base = new THREE.Mesh(baseGeometry, baseEdge); base.position.y = -.06; floor.add(base);
    const top = new THREE.Mesh(diskGeometry, paper); top.position.y = .095; floor.add(top);
    scene.add(floor);

    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
    const context = shadowCanvas.getContext('2d');
    if (context) {
      const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(22,66,74,.24)'); gradient.addColorStop(.45, 'rgba(22,66,74,.12)'); gradient.addColorStop(1, 'rgba(22,66,74,0)');
      context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
    }
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas); textures.add(shadowTexture);
    const shadowMaterial = material(new THREE.MeshBasicMaterial({map: shadowTexture, transparent: true, depthWrite: false}));
    const shadow = new THREE.Mesh(geometry(new THREE.PlaneGeometry(3.5, 3.5)), shadowMaterial);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.31; scene.add(shadow);
    const contactShadow = new THREE.Mesh(geometry(new THREE.PlaneGeometry(1.8, 1.8)), shadowMaterial);
    contactShadow.rotation.x = -Math.PI / 2; contactShadow.position.y = .133; floor.add(contactShadow);

    const egg = new THREE.Group(); egg.position.y = 1.02; floor.add(egg);
    const shellMaterial = material(new THREE.MeshStandardMaterial({color: '#F3DFC1', side: THREE.DoubleSide, flatShading: true, roughness: .95, transparent: true}));
    const shellTop = new THREE.Mesh(geometry(eggShell(true)), shellMaterial);
    const shellBottom = new THREE.Mesh(geometry(eggShell(false)), shellMaterial);
    egg.add(shellTop, shellBottom);
    const crackPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
      const theta = i / 20 * Math.PI * 2, phi = Math.PI / 2 + (i % 2 ? .075 : -.075);
      const radius = .645 * Math.sin(phi) * (1 - .17 * Math.cos(phi));
      crackPoints.push(new THREE.Vector3(Math.cos(theta) * radius, Math.cos(phi) * .89, Math.sin(theta) * radius));
    }
    const crackMaterial = material(new THREE.LineBasicMaterial({color: '#C09867', transparent: true, opacity: 0}));
    const crack = new THREE.Line(geometry(new THREE.BufferGeometry().setFromPoints(crackPoints)), crackMaterial);
    egg.add(crack);

    const coupi = new THREE.Group(); coupi.rotation.y = Math.PI / 4; floor.add(coupi);
    const part = (parent: THREE.Group, shape: THREE.BufferGeometry, surface: THREE.Material, size: [number, number, number], position: [number, number, number]) => {
      const mesh = new THREE.Mesh(shape, surface); mesh.scale.set(...size); mesh.position.set(...position); parent.add(mesh); return mesh;
    };
    part(coupi, sphere, teal, [.68, .57, .59], [0, 0, 0]);
    const earLeft = part(coupi, sphere, teal, [.17, .26, .16], [-.43, .51, 0]); earLeft.rotation.z = .38;
    const earRight = part(coupi, sphere, teal, [.17, .26, .16], [.43, .51, 0]); earRight.rotation.z = -.38;
    const eyes: THREE.Group[] = [];
    for (const x of [-.225, .225]) {
      const eye = new THREE.Group(); eye.position.set(x, .12, .52); coupi.add(eye); eyes.push(eye);
      part(eye, eyeSphere, cream, [.118, .175, .055], [0, 0, 0]);
      part(eye, eyeSphere, ink, [.046, .1, .027], [.018, -.006, .045]);
      part(coupi, eyeSphere, blush, [.095, .033, .02], [x * 1.55, -.15, .48]);
    }
    const smile = new THREE.Mesh(geometry(new THREE.TorusGeometry(.082, .012, 4, 12, Math.PI)), ink);
    smile.rotation.z = Math.PI; smile.position.set(0, -.185, .575); coupi.add(smile);
    const sparkle = part(floor, geometry(new THREE.OctahedronGeometry(.09)), matte('#E8681A'), [1, 1.6, 1], [.96, 1.65, .15]);

    const hemisphere = new THREE.HemisphereLight('#FFF3DE', '#7C9681', 2.6); scene.add(hemisphere);
    const key = new THREE.DirectionalLight('#FFE6CA', 2.1); key.position.set(-3, 6, 4); scene.add(key);
    let disposed = false, failed = false, frame = 0, ready = false;
    let hatched = options.hatched, hatchStart = options.hatched ? -Infinity : Infinity;
    let previous = performance.now(), elapsed = 0, pointerX = 0, pointerY = 0, orbitX = 0, orbitY = 0;
    const budget = createFrameBudgetMonitor({thresholdFps: 30, durationMs: 3000, windowMs: 500});
    const target = new THREE.Vector3(0, .78, 0), radius = 8;
    const setPhase = (phase: HatchPhase) => {
      const night = phase === 'night', cool = phase === 'store';
      hemisphere.color.set(night ? '#D0C4DD' : cool ? '#E4F2ED' : phase === 'dawn' ? '#FFE3D3' : '#FFF5DF');
      hemisphere.groundColor.set(night ? '#173D46' : '#83977D');
      hemisphere.intensity = night ? 1.6 : 2.6;
      key.color.set(night ? '#D2ADBC' : cool ? '#D5E5E0' : '#FFE6C9');
      key.intensity = night ? 2.4 : 2.1;
      baseEdge.color.set(night ? '#5E4C60' : '#D9B991');
    };
    setPhase(options.phase);

    function pose(timestamp: number) {
      const hatchProgress = !hatched ? 0 : hatchStart === -Infinity || options.reducedMotion ? 1 : clamp((timestamp - hatchStart) / 1500, 0, 1);
      const pop = spring01(clamp((hatchProgress - .25) / .66, 0, 1));
      const opened = spring01(clamp((hatchProgress - .18) / .74, 0, 1));
      floor.position.y = options.reducedMotion ? 0 : Math.sin(elapsed * .7) * .025;
      egg.visible = hatchProgress < 1;
      egg.rotation.z = hatchProgress > 0 ? Math.sin(hatchProgress * 63) * .065 * (1 - hatchProgress) : options.reducedMotion ? 0 : Math.sin(elapsed * 1.55) * .035;
      egg.scale.set(1 + Math.sin(hatchProgress * Math.PI) * .035, 1 - Math.sin(hatchProgress * Math.PI) * .035, 1);
      crackMaterial.opacity = clamp(hatchProgress * 8, 0, 1) * (1 - clamp((hatchProgress - .45) * 3, 0, 1));
      shellTop.position.set(-opened * .95, Math.sin(opened * Math.PI) * .65 - opened * 1.1, opened * .2);
      shellTop.rotation.z = opened * 1.15; shellTop.rotation.x = -.3 * opened;
      shellBottom.position.set(opened * .85, -opened * .68, opened * .28); shellBottom.rotation.z = -.7 * opened;
      shellMaterial.opacity = 1 - clamp((hatchProgress - .75) * 4, 0, 1);
      coupi.visible = hatchProgress > .25;
      const breath = hatchProgress >= 1 && !options.reducedMotion ? Math.sin(elapsed * 1.2) * .025 : 0;
      const squash = hatchProgress < 1 ? Math.sin(clamp((hatchProgress - .25) / .75, 0, 1) * Math.PI * 3) * .09 * (1 - hatchProgress) : 0;
      coupi.position.y = .68 + pop * .13 + Math.max(0, pop - 1) * .65;
      coupi.scale.set(Math.max(.001, pop * (1 - breath - squash)), Math.max(.001, pop * (1 + breath + squash)), Math.max(.001, pop));
      const blinkAt = elapsed % 6.7;
      const blink = options.reducedMotion ? 1 : blinkAt > 5.65 && blinkAt < 5.86 ? Math.max(.06, Math.abs((blinkAt - 5.755) / .105)) : 1;
      eyes.forEach(eye => eye.scale.y = blink);
      sparkle.visible = hatchProgress > .45;
      sparkle.scale.setScalar(hatchProgress >= 1 ? .75 : clamp((hatchProgress - .45) * 4, 0, 1));
      sparkle.rotation.y = options.reducedMotion ? .2 : elapsed * .25;
      sparkle.position.y = 1.65 + (options.reducedMotion ? 0 : Math.sin(elapsed * 1.3) * .045);
    }
    function render(timestamp: number, delta: number) {
      const bound = 8 * Math.PI / 180;
      const idle = options.reducedMotion ? 0 : Math.sin(elapsed / 6) * 3 * Math.PI / 180;
      orbitX = damp(orbitX, options.reducedMotion ? 0 : clamp(pointerX * bound + idle, -bound, bound), 4, delta);
      orbitY = damp(orbitY, options.reducedMotion ? 0 : pointerY * 3 * Math.PI / 180, 4, delta);
      const yaw = Math.PI / 4 + orbitX, pitch = .6154797 + orbitY;
      camera.position.set(Math.sin(yaw) * Math.cos(pitch) * radius, Math.sin(pitch) * radius + .78, Math.cos(yaw) * Math.cos(pitch) * radius);
      camera.lookAt(target); pose(timestamp); renderer.render(scene, camera);
      if (!ready) { ready = true; options.onReady(); }
    }
    function fail() { if (failed || disposed) return; failed = true; dispose(); options.onFailure(); }
    function tick(timestamp: number) {
      if (disposed) return;
      const delta = Math.min((timestamp - previous) / 1000, .05); previous = timestamp;
      if (!document.hidden) {
        elapsed += delta;
        if (budget.sample(timestamp, ready)) { fail(); return; }
        try { render(timestamp, delta); } catch { fail(); return; }
      } else budget.reset();
      if (!options.reducedMotion) frame = requestAnimationFrame(tick);
    }
    function onVisibility() { previous = performance.now(); budget.reset(); if (options.reducedMotion && !document.hidden && !disposed) tick(previous); }
    function onContextLost(event: Event) { event.preventDefault(); fail(); }
    function dispose() {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => item.dispose());
      renderer.dispose(); renderer.forceContextLoss(); scene.clear();
    }
    cleanup = dispose;
    document.addEventListener('visibilitychange', onVisibility);
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    const resize = (width: number, height: number) => {
      if (disposed || width < 1 || height < 1) return;
      const aspect = width / height, vertical = Math.max(1.68, 1.92 / Math.max(aspect, .65));
      camera.left = -vertical * aspect; camera.right = vertical * aspect; camera.top = vertical; camera.bottom = -vertical;
      camera.updateProjectionMatrix(); renderer.setSize(width, height, false); budget.reset();
      if (options.reducedMotion) { try { render(performance.now(), 1 / 60); } catch { fail(); } }
    };
    const bounds = canvas.getBoundingClientRect(); resize(bounds.width || 320, bounds.height || 280);
    frame = requestAnimationFrame(tick);
    return {
      setHatched(value) {
        if (disposed || value === hatched) return;
        hatched = value; hatchStart = value ? performance.now() : Infinity; budget.reset();
        if (options.reducedMotion) { try { render(performance.now(), 1 / 60); } catch { fail(); } }
      },
      setPhase(value) { if (!disposed) { setPhase(value); if (options.reducedMotion) { try { render(performance.now(), 1 / 60); } catch { fail(); } } } },
      setPointer(x, y) { pointerX = clamp(x, -1, 1); pointerY = clamp(y, -1, 1); },
      resize,
      dispose,
    };
  } catch (error) {
    // React has no engine handle until setup returns; clean up partial setup here.
    if (cleanup) cleanup();
    else {
      geometries.forEach(item => item.dispose());
      materials.forEach(item => item.dispose());
      textures.forEach(item => item.dispose());
      partialRenderer?.dispose();
      partialRenderer?.forceContextLoss();
    }
    throw error; // The component's initialization catch switches to its existing 2D fallback.
  }
}
