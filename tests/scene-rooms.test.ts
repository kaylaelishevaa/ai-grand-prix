import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildRoomArchitecture, createRoomGeometries, type RoomKit, type RoomGeometry, type RoomMaterial } from '../components/diorama/rooms';
import { assignRoomSlots, cameraOrbit, layoutBillboards } from '../components/diorama/math';
import { createProductMeshLibrary } from '../components/diorama/product-meshes';
import type { SceneKind } from '../lib/scenes';
import {SCENE_MOODS,getSceneMood} from '../lib/scene-moods';
import type {SceneContext} from '../lib/world-context';

const kinds: SceneKind[] = ['kitchen', 'desk', 'reading', 'dressing'];
function fixture() {
  const scene = new THREE.Group();
  const geometries=createRoomGeometries();
  const materials = new Map<RoomMaterial, THREE.MeshBasicMaterial>();
  const kit: RoomKit = {
    piece(name, x = 0, y = 0, z = 0) {
      const group = new THREE.Group();
      group.name = `room:${name}`;
      group.position.set(x, y, z);
      scene.add(group);
      return group;
    },
    mesh(parent, geometry, material, x, y, z, sx, sy, sz) {
      if (!materials.has(material)) materials.set(material, new THREE.MeshBasicMaterial());
      const mesh = new THREE.Mesh(geometries[geometry], materials.get(material));
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      parent.add(mesh);
      return mesh;
    },
    blob() {},
  };
  return { scene, kit, geometries, materials, dispose() { Object.values(geometries).forEach(g => g.dispose()); materials.forEach(m => m.dispose()); } };
}

test('each district builds a genuinely different, complete room from pooled geometry', () => {
  const required: Record<SceneKind, string[]> = {
    kitchen: ['counter', 'table', 'hook'],
    desk: ['writing-desk', 'desk-chair', 'pegboard', 'desk-monitor'],
    reading: ['reading-armchair', 'bookcase', 'reading-floor-lamp', 'reading-ottoman'],
    dressing: ['open-wardrobe', 'wardrobe-hanger', 'vanity-table', 'vanity-mirror', 'dressing-bench'],
  };
  const {scene, kit, geometries, materials, dispose} = fixture();
  try {
    for (let pass = 0; pass < 3; pass++) for (const kind of kinds) {
      scene.clear();
      buildRoomArchitecture(kind, kit);
      for (const name of ['organic-island', 'arrival-stones', ...required[kind]]) assert.ok(scene.getObjectByName(`room:${name}`), `${kind}: ${name}`);
      assert.equal(scene.getObjectByName('room:back-wall'),undefined,'open landscapes have no shared box wall');
      assert.equal(scene.getObjectByName('room:floating-base'),undefined,'terrain must not use the old rectangular tray');
      if (kind !== 'kitchen') assert.equal(scene.getObjectByName('room:counter'), undefined, `${kind} must not reuse a kitchen counter`);
      let meshCount = 0;
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        meshCount++;
        assert.ok(Object.values(geometries).includes(object.geometry), 'no per-furniture GPU geometry');
        assert.ok([...materials.values()].includes(object.material as THREE.MeshBasicMaterial), 'no per-furniture GPU material');
      });
      assert.ok(meshCount >= 40 && meshCount < 200, `${kind}: restrained mesh budget (${meshCount})`);
      const bounds = new THREE.Box3().setFromObject(scene);
      assert.ok(bounds.max.y <= 3.6, `${kind}: stays below the camera's headroom`);
    }
    assert.ok(materials.size <= 16);
  } finally { dispose(); }
});

test('date products hang from the wardrobe and cosmetics stay on the vanity', () => {
  const items = ['dress', 'blouse', 'lipstick', 'perfume', 'compact', 'makeupBrush'].map(type => ({type, name: type}));
  const slots = assignRoomSlots(items, 'dressing');
  assert.deepEqual(slots.slice(0, 2).map(slot => slot.key), ['wardrobe-left', 'wardrobe-right']);
  assert.ok(slots.slice(0, 2).every(slot => slot.hangAt === 2.27));
  assert.ok(slots.slice(2).every(slot => slot.key.startsWith('vanity-') && slot.surface === 1.055));
  assert.equal(new Set(slots.map(slot => `${slot.x}:${slot.y}:${slot.z}`)).size, items.length);
  const accessories = assignRoomSlots([{type: 'handbag', name: 'bag'}, {type: 'earrings', name: 'hoops'}], 'dressing');
  assert.deepEqual(accessories.map(slot => slot.key), ['dressing-bench', 'accessory-table']);
});

test('room slots sit on actual furniture surfaces, never float over an empty kitchen replacement', () => {
  const {scene, kit, dispose} = fixture();
  try {
    const sets: Record<SceneKind, string[]> = {
      kitchen: [],
      desk: ['notebook', 'lamp', 'speaker', 'vase', 'tray', 'mug'],
      reading: ['mug', 'speaker', 'notebook', 'tray', 'lamp', 'vase'],
      dressing: ['dress', 'blouse', 'lipstick', 'compact', 'handbag', 'earrings'],
    };
    for (const kind of kinds.slice(1)) {
      scene.clear(); buildRoomArchitecture(kind, kit); scene.updateMatrixWorld(true);
      for (const slot of assignRoomSlots(sets[kind].map(type => ({type, name: type})), kind)) {
        if (slot.hangAt !== undefined) continue;
        const surface = slot.surface!;
        const ray = new THREE.Raycaster(new THREE.Vector3(slot.x, surface + .025, slot.z), new THREE.Vector3(0, -1, 0), 0, .06);
        const intersections = ray.intersectObject(scene, true);
        assert.ok(intersections.length > 0, `${kind}/${slot.key}: expected a supporting surface at ${surface}`);
      }
    }
  } finally { dispose(); }
});

test('six product hotspots stay inside the expanded scenic camera at mobile and desktop sizes', () => {
  const resources = new Set<{dispose(): void}>();
  const products = createProductMeshLibrary(resource => { resources.add(resource); return resource; });
  const roomTypes: Record<SceneKind, string[]> = {
    kitchen: ['kettle', 'apron', 'mug', 'tray', 'speaker', 'vase'],
    desk: ['notebook', 'lamp', 'speaker', 'vase', 'tray', 'mug'],
    reading: ['mug', 'speaker', 'notebook', 'tray', 'lamp', 'vase'],
    dressing: ['dress', 'blouse', 'lipstick', 'compact', 'handbag', 'earrings'],
  };
  try {
    for (const kind of kinds) {
      const items = roomTypes[kind].map(type => ({skuId: type, type, name: type}));
      const slots = assignRoomSlots(items, kind);
      for (const [width, height] of [[390, 520], [1180, 660]]) {
        const aspect = width / height;
        const viewHeight = Math.max(6.3, 8.6 / aspect);
        const camera = new THREE.OrthographicCamera(-viewHeight * aspect / 2, viewHeight * aspect / 2, viewHeight / 2, -viewHeight / 2, .1, 60);
        for (const pointer of [-1, 0, 1]) {
          const orbit = cameraOrbit(6, pointer, pointer);
          const yaw = Math.PI / 4 + orbit.yaw, pitch = Math.atan(1 / Math.sqrt(2)) + orbit.pitch;
          camera.position.set(Math.sin(yaw) * Math.cos(pitch) * 12, 1.15 + Math.sin(pitch) * 12, Math.cos(yaw) * Math.cos(pitch) * 12);
          camera.lookAt(0, 1.15, 0); camera.updateMatrixWorld();
          items.forEach((item, index) => {
            const slot = slots[index];
            const model = products.build(item); model.scale.setScalar(slot.scale ?? 1);
            const top = new THREE.Box3().setFromObject(model).max.y;
            const kitchenSurfaces: Record<string, number> = {counter: 1.165, hook: .56, 'table-left': 1.002, 'table-right': 1.002, shelf: 1.672, sideboard: .825};
            const y = slot.hangAt ?? (slot.surface ?? kitchenSurfaces[slot.key] ?? slot.y) + top;
            const point = new THREE.Vector3(slot.x, y + .13, slot.z).project(camera);
            const xPx = (point.x * .5 + .5) * width, yPx = (-point.y * .5 + .5) * height;
            const scale = Math.max(.67, Math.min(1, width / 660));
            assert.ok(xPx > 16 && xPx < width - 16, `${kind}/${item.type}: card horizontal fit at ${width}px`);
            assert.ok(yPx > 16 && yPx < height - 16, `${kind}/${item.type}: card vertical fit at ${width}px (${yPx})`);
          });
        }
      }
    }
  } finally { resources.forEach(resource => resource.dispose()); }
});

test('clustered vanity cards fan out without moving dots, overlapping each other, or clipping', () => {
  for (const [width, height] of [[310, 300], [390, 420], [660, 560]]) {
    const scale = Math.max(.67, Math.min(1, width / 660));
    const anchors = Array.from({length: 6}, (_, index) => ({
      skuId: `cosmetic-${index}`, x: width * .55 + (index % 3) * 14, y: height * .48 + Math.floor(index / 3) * 22,
      width: 80 * scale, height: 94 * scale, scale,
    }));
    const layouts = layoutBillboards(anchors, width, height);
    for (let index = 0; index < layouts.length; index++) {
      const label = layouts[index], anchor = anchors[index];
      assert.equal(label.x, anchor.x); assert.equal(label.y, anchor.y);
      assert.ok(label.left >= 0 && label.top >= 0 && label.left + label.width <= width && label.top + label.height <= height);
      for (const other of layouts.slice(index + 1)) {
        assert.ok(label.left + label.width <= other.left || other.left + other.width <= label.left || label.top + label.height <= other.top || other.top + other.height <= label.top, `${width}px: ${label.skuId} and ${other.skuId} do not overlap`);
      }
      for (const dot of anchors) assert.ok(dot.x < label.left - 6 || dot.x > label.left + label.width + 6 || dot.y < label.top - 6 || dot.y > label.top + label.height + 6, 'every original product dot remains unobscured');
    }
    assert.deepEqual(layouts, layoutBillboards(anchors, width, height), 'packing is stable for identical camera projections');
  }
});


test('each landscape has its own color, light, weather and recognizable environmental anchor',()=>{
  assert.equal(new Set(kinds.map(kind=>SCENE_MOODS[kind].background)).size,4);
  assert.equal(new Set(kinds.map(kind=>SCENE_MOODS[kind].palette.floor)).size,4);
  assert.equal(new Set(kinds.map(kind=>SCENE_MOODS[kind].atmosphere)).size,4);
  const landmarks:Record<SceneKind,string[]>={kitchen:['garden-pergola','citrus-fruit'],dressing:['evening-curtain-arch','distant-city','evening-light-string'],reading:['forest-pond','rain-shelter'],desk:['coral-studio-arch','ideas-in-the-air']};
  const {scene,kit,dispose}=fixture();
  try{for(const kind of kinds){scene.clear();buildRoomArchitecture(kind,kit);for(const landmark of landmarks[kind])assert(scene.getObjectByName('room:'+landmark));}}finally{dispose();}
});


test('one furniture vocabulary can become an indoor room, a rooftop occasion, or a riverside picnic',()=>{
  const {scene,kit,dispose}=fixture();
  const contexts:SceneContext[]=[{type:'space',setting:'home',label:'home'},{type:'event',setting:'rooftop',label:'dinner'},{type:'outdoor',setting:'riverside',label:'picnic'},{type:'place',setting:'cafe',label:'cafe'}];
  const expected=['curved-home-interior','rooftop-balustrade','riverside-water','striped-cafe-awning'];
  try{
    contexts.forEach((context,i)=>{
      scene.clear();buildRoomArchitecture(i===3?'reading':'kitchen',kit,context);
      assert(scene.getObjectByName('room:'+expected[i]));
      assert.equal(scene.getObjectByName('room:garden-pergola'),undefined);
      if(i<3)assert(scene.getObjectByName('room:counter'));
      assert.notEqual(getSceneMood('kitchen',context).subtitle,SCENE_MOODS.kitchen.subtitle);
    });
    assert.notDeepEqual(getSceneMood('kitchen',contexts[0]).palette,getSceneMood('kitchen',contexts[1]).palette);
    assert.notDeepEqual(getSceneMood('kitchen',contexts[1]).palette,getSceneMood('kitchen',contexts[2]).palette);
  }finally{dispose();}
});
