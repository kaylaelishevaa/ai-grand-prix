import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildRoomArchitecture, type RoomKit, type RoomGeometry, type RoomMaterial } from '../components/diorama/rooms';
import { assignRoomSlots, cameraOrbit, layoutBillboards } from '../components/diorama/math';
import { createProductMeshLibrary } from '../components/diorama/product-meshes';
import type { SceneKind } from '../lib/scenes';

const kinds: SceneKind[] = ['kitchen', 'desk', 'reading', 'dressing'];
function fixture() {
  const scene = new THREE.Group();
  const geometries: Record<RoomGeometry, THREE.BufferGeometry> = {
    box: new THREE.BoxGeometry(), cylinder: new THREE.CylinderGeometry(.5, .5, 1, 10),
    tapered: new THREE.CylinderGeometry(.45, .32, 1, 10), sphere: new THREE.IcosahedronGeometry(.5, 1),
    leaf: new THREE.IcosahedronGeometry(.5, 0), plane: new THREE.PlaneGeometry(),
  };
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
      for (const name of ['floating-base', 'back-wall', ...required[kind]]) assert.ok(scene.getObjectByName(`room:${name}`), `${kind}: ${name}`);
      if (kind !== 'kitchen') assert.equal(scene.getObjectByName('room:counter'), undefined, `${kind} must not reuse a kitchen counter`);
      let meshCount = 0;
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        meshCount++;
        assert.ok(Object.values(geometries).includes(object.geometry), 'no per-furniture GPU geometry');
        assert.ok([...materials.values()].includes(object.material as THREE.MeshBasicMaterial), 'no per-furniture GPU material');
      });
      assert.ok(meshCount >= 40 && meshCount < 150, `${kind}: restrained mesh budget (${meshCount})`);
      const bounds = new THREE.Box3().setFromObject(scene);
      assert.ok(bounds.max.y <= 2.85, `${kind}: stays below the camera's headroom`);
    }
    assert.ok(materials.size <= 15);
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

test('six products per room keep their floating cards inside mobile and desktop camera framing', () => {
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
      for (const [width, height] of [[390, 420], [660, 560]]) {
        const aspect = width / height;
        const viewHeight = Math.max(7.8, 7.65 / aspect);
        const camera = new THREE.OrthographicCamera(-viewHeight * aspect / 2, viewHeight * aspect / 2, viewHeight / 2, -viewHeight / 2, .1, 60);
        for (const pointer of [-1, 0, 1]) {
          const orbit = cameraOrbit(6, pointer, pointer);
          const yaw = Math.PI / 4 + orbit.yaw, pitch = Math.atan(1 / Math.sqrt(2)) + orbit.pitch;
          camera.position.set(Math.sin(yaw) * Math.cos(pitch) * 12, 1.55 + Math.sin(pitch) * 12, Math.cos(yaw) * Math.cos(pitch) * 12);
          camera.lookAt(0, 1.55, 0); camera.updateMatrixWorld();
          items.forEach((item, index) => {
            const slot = slots[index];
            const model = products.build(item); model.scale.setScalar(slot.scale ?? 1);
            const top = new THREE.Box3().setFromObject(model).max.y;
            const kitchenSurfaces: Record<string, number> = {counter: 1.165, hook: .56, 'table-left': 1.002, 'table-right': 1.002, shelf: 1.672, sideboard: .825};
            const y = slot.hangAt ?? (slot.surface ?? kitchenSurfaces[slot.key] ?? slot.y) + top;
            const point = new THREE.Vector3(slot.x, y + .13, slot.z).project(camera);
            const xPx = (point.x * .5 + .5) * width, yPx = (-point.y * .5 + .5) * height;
            const scale = Math.max(.67, Math.min(1, width / 660));
            assert.ok(xPx > 40 * scale && xPx < width - 40 * scale, `${kind}/${item.type}: card horizontal fit at ${width}px`);
            assert.ok(yPx > 120 * scale && yPx < height - 12, `${kind}/${item.type}: card vertical fit at ${width}px (${yPx})`);
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
