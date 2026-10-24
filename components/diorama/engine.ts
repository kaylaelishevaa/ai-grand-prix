import * as THREE from 'three';
import { assignRoomSlots, cameraOrbit, clamp, createFrameBudgetMonitor, damp, spring01 } from './math';
import { createProductMeshLibrary } from './product-meshes';
import { buildRoomArchitecture } from './rooms';
import type { SceneKind } from '../../lib/scenes';

export type DioramaPhase = 'dawn' | 'noon' | 'store' | 'night';
export type DioramaItem = { skuId: string; type: string; name: string; imageUrl?: string; color?: string };
export type DioramaProjection = { skuId: string; x: number; y: number; scale: number; visible: boolean; opacity: number };
export type DioramaOptions = {
  phase: DioramaPhase;
  kind?: SceneKind;
  items: DioramaItem[];
  /** CSS-pixel hotspot anchors; position a DOM card immediately above each point. */
  onProjection: (projections: DioramaProjection[]) => void;
  onFailure: (reason?: string) => void;
  onReady?: () => void;
  reducedMotion?: boolean;
};
export type DioramaController = {
  setItems(items: DioramaItem[], kind?: SceneKind): void;
  setPhase(phase: DioramaPhase): void;
  setPointer(x: number, y: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
};

type Piece = { group: THREE.Group; position: THREE.Vector3; rotation: THREE.Euler };
type Anchor = { object: THREE.Object3D; projection: DioramaProjection };

const lighting: Record<DioramaPhase, { sky: string; ground: string; key: string; intensity: number; window: string }> = {
  dawn: { sky: '#ffe2d6', ground: '#b99886', key: '#ffe0bd', intensity: 2.4, window: '#f8d5b7' },
  noon: { sky: '#fff8f0', ground: '#a2ae96', key: '#fff0d3', intensity: 2.6, window: '#f8edd0' },
  store: { sky: '#e7f1e7', ground: '#91a399', key: '#f3f5e5', intensity: 2.35, window: '#cce2d8' },
  night: { sky: '#88859c', ground: '#27464b', key: '#f4c48c', intensity: 1.8, window: '#e8ae78' },
};

/**
 * Small, deliberately constrained scene renderer. Images stay in accessible DOM
 * billboards, so an unavailable product image can never taint the WebGL canvas.
 */
export function createDiorama(canvas: HTMLCanvasElement, options: DioramaOptions): DioramaController | null {
  const resources = new Set<{ dispose(): void }>();
  const own = <T extends { dispose(): void }>(resource: T): T => { resources.add(resource); return resource; };
  let partialRenderer: THREE.WebGLRenderer | undefined;
  let cleanup: (() => void) | undefined;
  function releaseResources() {
    // A failed context must not prevent the remaining resources from releasing.
    for (const resource of resources) { try { resource.dispose(); } catch { /* continue cleanup */ } }
    resources.clear();
    try { partialRenderer?.dispose(); } catch { /* context may already be gone */ }
    try { partialRenderer?.forceContextLoss(); } catch { /* unsupported or already lost */ }
  }
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    partialRenderer = renderer;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    const scene = new THREE.Scene();
    const room = new THREE.Group();
    scene.add(room);
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 60);
    const target = new THREE.Vector3(0, 1.55, 0);
    const projected = new THREE.Vector3();
    const hemisphere = new THREE.HemisphereLight('#fff8f0', '#a2ae96', 2.5);
    const sun = new THREE.DirectionalLight('#fff0d3', 2.6);
    sun.position.set(-3, 7, 4);
    scene.add(hemisphere, sun);

    const geometries = {
      box: own(new THREE.BoxGeometry(1, 1, 1)),
      cylinder: own(new THREE.CylinderGeometry(0.5, 0.5, 1, 10)),
      tapered: own(new THREE.CylinderGeometry(0.45, 0.32, 1, 10)),
      sphere: own(new THREE.IcosahedronGeometry(0.5, 1)),
      leaf: own(new THREE.IcosahedronGeometry(0.5, 0)),
      plane: own(new THREE.PlaneGeometry(1, 1)),
    };
    const materials = {
      paper: own(new THREE.MeshLambertMaterial({ color: '#fff8f0', flatShading: true })),
      floor: own(new THREE.MeshLambertMaterial({ color: '#e9ddc8', flatShading: true })),
      wall: own(new THREE.MeshLambertMaterial({ color: '#eadbc4', flatShading: true })),
      teal: own(new THREE.MeshLambertMaterial({ color: '#16424a', flatShading: true })),
      sage: own(new THREE.MeshLambertMaterial({ color: '#91a88d', flatShading: true })),
      wood: own(new THREE.MeshLambertMaterial({ color: '#bf9370', flatShading: true })),
      clay: own(new THREE.MeshLambertMaterial({ color: '#c57e64', flatShading: true })),
      orange: own(new THREE.MeshLambertMaterial({ color: '#e8681a', flatShading: true })),
      brass: own(new THREE.MeshLambertMaterial({ color: '#d0b16c', flatShading: true })),
      leaf: own(new THREE.MeshLambertMaterial({ color: '#637f5c', flatShading: true })),
      blush: own(new THREE.MeshLambertMaterial({ color: '#dfb4aa', flatShading: true })),
      mirror: own(new THREE.MeshLambertMaterial({ color: '#adc6c0', flatShading: true })),
      ink: own(new THREE.MeshLambertMaterial({ color: '#31545a', flatShading: true })),
      window: own(new THREE.MeshBasicMaterial({ color: '#f8edd0' })),
      ray: own(new THREE.MeshBasicMaterial({ color: '#ffe8b8', transparent: true, opacity: 0.11, depthWrite: false, side: THREE.DoubleSide })),
    };

    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = shadowCanvas.height = 128;
    const context = shadowCanvas.getContext('2d');
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 6, 64, 64, 62);
      gradient.addColorStop(0, 'rgba(22,66,74,0.4)');
      gradient.addColorStop(0.5, 'rgba(22,66,74,0.13)');
      gradient.addColorStop(1, 'rgba(22,66,74,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    const shadowTexture = own(new THREE.CanvasTexture(shadowCanvas));
    const shadowMaterial = own(new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.52, polygonOffset: true, polygonOffsetFactor: -1 }));
    const baseShadow = new THREE.Mesh(geometries.plane, shadowMaterial);
    baseShadow.rotation.x = -Math.PI / 2;
    baseShadow.position.y = -0.56;
    baseShadow.scale.set(7.4, 6, 1);
    scene.add(baseShadow);

    const pieces: Piece[] = [];
    function piece(name: string, x = 0, y = 0, z = 0) {
      const group = new THREE.Group();
      group.name = `room:${name}`;
      group.position.set(x, y, z);
      room.add(group);
      pieces.push({ group, position: group.position.clone(), rotation: group.rotation.clone() });
      return group;
    }
    function mesh(parent: THREE.Object3D, geometry: keyof typeof geometries, material: keyof typeof materials, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
      const object = new THREE.Mesh(geometries[geometry], materials[material]);
      object.position.set(x, y, z);
      object.scale.set(sx, sy, sz);
      parent.add(object);
      return object;
    }
    function blob(parent: THREE.Object3D, x: number, z: number, sx: number, sz: number, y = 0.171) {
      const object = new THREE.Mesh(geometries.plane, shadowMaterial);
      object.rotation.x = -Math.PI / 2;
      object.position.set(x, y, z);
      object.scale.set(sx, sz, 1);
      parent.add(object);
    }

    let currentKind: SceneKind = options.kind || 'kitchen';
    let pendingKind: SceneKind | null = null;
    let furnitureCount = 0;
    function buildRoom(kind: SceneKind) {
      room.clear();
      pieces.length = 0;
      buildRoomArchitecture(kind, { piece, mesh, blob });
      // Builders may rotate a whole window or furniture group after creating it.
      for (const part of pieces) part.rotation.copy(part.group.rotation);
      furnitureCount = pieces.length;
    }
    buildRoom(currentKind);

    const productLibrary = createProductMeshLibrary(own);
    const productBounds = new THREE.Box3();
    let productGroups: THREE.Group[] = [];
    let anchors: Anchor[] = [];
    let projections: DioramaProjection[] = [];
    let pendingItems: DioramaItem[] | null = null;
    let currentItems = options.items.slice(0, 6);
    let clock = 0;
    let rebuildStart: number | null = null;
    let swapped = false;
    let firstAssembly = true;
    let width = 1;
    let height = 1;
    let targetX = 0;
    let targetY = 0;
    let pointerX = 0;
    let pointerY = 0;
    let lastFrame: number | null = null;
    let animationFrame = 0;
    let disposed = false;
    let ready = false;
    let readyAt = 0;
    const frameBudget = createFrameBudgetMonitor();
    const reducedMotion = !!options.reducedMotion;

    function placeItems(items: DioramaItem[]) {
      for (const group of productGroups) room.remove(group);
      productGroups = [];
      pieces.splice(furnitureCount);
      const slots = assignRoomSlots(items, currentKind);
      anchors = items.map((item, index) => {
        const slot = slots[index];
        const product = productLibrary.build(item);
        product.scale.setScalar(slot.scale ?? 1);
        // A wrapper keeps product proportions separate from the assembly spring.
        const model = new THREE.Group();
        model.name = `placed:${item.skuId}`;
        model.add(product);
        const surfaces: Record<string, number> = { counter: 1.165, hook: .56, 'table-left': 1.002, 'table-right': 1.002, shelf: 1.672, sideboard: .825 };
        productBounds.setFromObject(product);
        const top = productBounds.max.y;
        const surface = slot.hangAt !== undefined ? slot.hangAt - top : slot.surface ?? surfaces[slot.key] ?? slot.y;
        model.position.set(slot.x, surface, slot.z);
        room.add(model);
        productGroups.push(model);
        pieces.push({ group: model, position: model.position.clone(), rotation: model.rotation.clone() });
        const object = new THREE.Object3D();
        object.position.set(0, top + .13, 0);
        model.add(object);
        if (item.type !== 'apron' && item.type !== 'towel' && slot.hangAt === undefined) {
          const contact = new THREE.Mesh(geometries.plane, shadowMaterial);
          contact.rotation.x = -Math.PI / 2;
          contact.position.y = .006;
          const footprint = slot.scale ?? 1;
          contact.scale.set(.95 * footprint, .8 * footprint, 1);
          model.add(contact);
        }
        return { object, projection: { skuId: item.skuId, x: 0, y: 0, scale: 1, visible: false, opacity: 0 } };
      });
      projections = anchors.map(anchor => anchor.projection);
      // A new selection subtly changes the room's materials as well as its cards.
      const colors = items.map(item => item.color || '').join(' ').toLowerCase();
      const names = items.map(item => item.name).join(' ').toLowerCase();
      const minimal = /minimal|steel|white|silver|black/.test(`${colors} ${names}`);
      materials.sage.color.set(minimal ? '#acb4ad' : '#91a88d');
      materials.wood.color.set(minimal ? '#ccb89a' : '#bf9370');
      materials.clay.color.set(minimal ? '#b8afa1' : '#c57e64');
      materials.floor.color.set(currentKind === 'dressing' ? '#eddbd0' : minimal ? '#e5e3d6' : '#e9ddc8');
    }

    function setPhase(phase: DioramaPhase) {
      const light = lighting[phase] || lighting.noon;
      hemisphere.color.set(light.sky);
      hemisphere.groundColor.set(light.ground);
      hemisphere.intensity = phase === 'night' ? 1.8 : 2.5;
      sun.color.set(light.key);
      sun.intensity = light.intensity;
      materials.window.color.set(light.window);
      materials.ray.color.set(light.window);
      materials.ray.opacity = phase === 'night' ? 0.07 : 0.11;
      materials.wall.color.set(phase === 'night' ? '#b2a9b5' : phase === 'store' ? '#dce3d5' : '#eadbc4');
    }

    function resize(nextWidth: number, nextHeight: number) {
      if (disposed) return;
      width = Math.max(1, nextWidth);
      height = Math.max(1, nextHeight);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const viewHeight = Math.max(7.8, 7.65 / aspect);
      camera.left = -viewHeight * aspect / 2;
      camera.right = viewHeight * aspect / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      frameBudget.reset();
    }

    function restorePieces() {
      for (const part of pieces) {
        part.group.position.copy(part.position);
        part.group.rotation.copy(part.rotation);
        part.group.scale.setScalar(1);
        part.group.visible = true;
      }
    }

    function applyPendingRoom() {
      if (pendingKind !== null && pendingKind !== currentKind) {
        currentKind = pendingKind;
        buildRoom(currentKind);
        productGroups = [];
      }
      pendingKind = null;
      if (pendingItems) currentItems = pendingItems;
      pendingItems = null;
      placeItems(currentItems);
    }

    function animatePieces() {
      if (reducedMotion) {
        if (pendingItems) {
          applyPendingRoom();
        }
        restorePieces();
        firstAssembly = false;
        rebuildStart = null;
        return;
      }
      if (rebuildStart !== null) {
        const age = clock - rebuildStart;
        if (age >= 0.42 && !swapped) {
          applyPendingRoom();
          swapped = true;
        }
        for (let index = 0; index < pieces.length; index++) {
          const part = pieces[index];
          if (age < 0.42) {
            const dropDelay = (pieces.length - index - 1) / Math.max(1, pieces.length - 1) * .12;
            const drop = clamp((age - dropDelay) / 0.30, 0, 1);
            part.group.position.y = part.position.y - drop * drop * 4;
            part.group.rotation.z = part.rotation.z + drop * (index % 2 ? 0.15 : -0.12);
            part.group.scale.setScalar(1 - drop * 0.1);
            part.group.visible = drop < 0.96;
          } else {
            const progress = clamp((age - 0.42 - index / Math.max(1, pieces.length - 1) * 0.43) / 0.65, 0, 1);
            const spring = spring01(progress);
            part.group.visible = progress > 0;
            part.group.position.y = part.position.y + (1 - spring) * 2.6;
            part.group.rotation.z = part.rotation.z + (1 - spring) * (index % 2 ? 0.08 : -0.08);
            part.group.scale.setScalar(0.78 + spring * 0.22);
          }
        }
        if (age >= 1.5) {
          restorePieces();
          rebuildStart = null;
        }
      } else if (firstAssembly) {
        for (let index = 0; index < pieces.length; index++) {
          const part = pieces[index];
          const progress = clamp((clock - index / Math.max(1, pieces.length - 1) * 0.35) / 0.65, 0, 1);
          const spring = spring01(progress);
          part.group.visible = progress > 0;
          part.group.position.y = part.position.y + (1 - spring) * 1.8;
          part.group.scale.setScalar(0.83 + spring * 0.17);
        }
        if (clock >= 1) {
          firstAssembly = false;
          restorePieces();
        }
      }
    }

    function projectItems() {
      room.updateMatrixWorld(true);
      for (let index = 0; index < anchors.length; index++) {
        const anchor = anchors[index];
        anchor.object.getWorldPosition(projected);
        projected.project(camera);
        const projection = anchor.projection;
        projection.x = (projected.x * 0.5 + 0.5) * width;
        projection.y = (-projected.y * 0.5 + 0.5) * height;
        projection.scale = clamp(width / 660, 0.67, 1);
        projection.visible = projected.z > -1 && projected.z < 1 && projected.x > -1.1 && projected.x < 1.1;
        let opacity = 1;
        if (rebuildStart !== null) {
          const age = clock - rebuildStart;
          opacity = age < 0.42 ? 1 - clamp(age / 0.15, 0, 1) : clamp((age - 0.7 - index * 0.035) / 0.25, 0, 1);
        } else if (firstAssembly) opacity = clamp((clock - 0.5 - index * 0.035) / 0.25, 0, 1);
        projection.opacity = opacity;
      }
      options.onProjection(projections);
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(animationFrame);
      document.removeEventListener('visibilitychange', visibilityChanged);
      canvas.removeEventListener('webglcontextlost', contextLost);
      releaseResources();
      scene.clear();
    }

    function fail(reason: string) {
      if (disposed) return;
      dispose();
      options.onFailure(reason);
    }

    function contextLost(event: Event) {
      event.preventDefault();
      fail('context-lost');
    }

    function visibilityChanged() {
      frameBudget.reset();
      lastFrame = null;
      cancelAnimationFrame(animationFrame);
      if (!document.hidden && !disposed) animationFrame = requestAnimationFrame(frame);
    }

    function frame(timestamp: number) {
      if (disposed || document.hidden) return;
      const delta = lastFrame === null ? 0 : Math.min((timestamp - lastFrame) / 1000, 0.1);
      lastFrame = timestamp;
      clock += delta;
      if (frameBudget.sample(timestamp, ready && timestamp - readyAt >= 350 && width > 1 && height > 1)) {
        fail('slow');
        return;
      }
      pointerX = damp(pointerX, targetX, 4.5, delta);
      pointerY = damp(pointerY, targetY, 4.5, delta);
      const orbit = reducedMotion ? { yaw: 0, pitch: 0 } : cameraOrbit(clock, pointerX, pointerY);
      const yaw = Math.PI / 4 + orbit.yaw;
      const pitch = Math.atan(1 / Math.sqrt(2)) + orbit.pitch;
      const radius = 12;
      camera.position.set(Math.sin(yaw) * Math.cos(pitch) * radius, target.y + Math.sin(pitch) * radius, Math.cos(yaw) * Math.cos(pitch) * radius);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      room.position.y = reducedMotion ? 0 : Math.sin(clock * 0.7) * 0.025;
      animatePieces();
      try {
        renderer.render(scene, camera);
        projectItems();
      } catch {
        fail('render');
        return;
      }
      if (!ready) {
        ready = true;
        readyAt = timestamp;
        options.onReady?.();
      }
      animationFrame = requestAnimationFrame(frame);
    }

    cleanup = dispose;
    setPhase(options.phase);
    placeItems(currentItems);
    resize(canvas.clientWidth || 640, canvas.clientHeight || 480);
    canvas.addEventListener('webglcontextlost', contextLost, false);
    document.addEventListener('visibilitychange', visibilityChanged);
    animationFrame = requestAnimationFrame(frame);

    return {
      setItems(items, kind = currentKind) {
        if (disposed) return;
        pendingItems = items.slice(0, 6);
        pendingKind = kind;
        restorePieces();
        firstAssembly = false;
        swapped = false;
        rebuildStart = clock;
      },
      setPhase,
      setPointer(x, y) {
        targetX = Number.isFinite(x) ? clamp(x, -1, 1) : 0;
        targetY = Number.isFinite(y) ? clamp(y, -1, 1) : 0;
      },
      resize,
      dispose,
    };
  } catch {
    // No controller is available to the React wrapper until initialization returns.
    if (cleanup) cleanup();
    else releaseResources();
    options.onFailure(partialRenderer ? 'initialization' : 'webgl');
    return null;
  }
}
