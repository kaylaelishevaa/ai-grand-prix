import test from 'node:test';
import assert from 'node:assert/strict';
import { assignRoomSlots, cameraOrbit, createFrameBudgetMonitor, damp, spring01 } from '../components/diorama/math';
import { createDiorama } from '../components/diorama/engine';
import { createProductMeshLibrary } from '../components/diorama/product-meshes';
import * as THREE from 'three';
import catalog from '../data/catalog.json';

test('isometric orbit stays bounded and idle yaw drifts at most half a degree per second', () => {
  const degree = Math.PI / 180;
  for (let time = 0; time < 180; time += 0.25) {
    for (const pointer of [-10, -1, 0, 1, 10]) {
      const orbit = cameraOrbit(time, pointer, pointer);
      assert.ok(Math.abs(orbit.yaw) <= 8 * degree + 1e-10);
      assert.ok(Math.abs(orbit.pitch) <= 4.6 * degree + 1e-10);
    }
    const speed = (cameraOrbit(time + 0.001, 0, 0).yaw - cameraOrbit(time, 0, 0).yaw) / 0.001;
    assert.ok(Math.abs(speed) <= 0.5 * degree + 1e-8);
  }
});

test('assembly spring overshoots gently then settles exactly; damping is framerate independent', () => {
  assert.equal(spring01(-1), 0);
  assert.equal(spring01(0), 0);
  assert.equal(spring01(1), 1);
  assert.equal(spring01(2), 1);
  const values = Array.from({ length: 100 }, (_, index) => spring01(index / 100));
  assert.ok(Math.max(...values) > 1.05);
  assert.ok(Math.max(...values) < 1.2);
  const twoSteps = damp(damp(0, 1, 4, 1 / 60), 1, 4, 1 / 60);
  assert.ok(Math.abs(twoSteps - damp(0, 1, 4, 1 / 30)) < 1e-12);
});

test('healthy rendering never falls back; continuous 25fps trips after three seconds', () => {
  const healthy = createFrameBudgetMonitor();
  for (let frame = 0; frame < 1200; frame++) assert.equal(healthy.sample(frame * 1000 / 60), false);
  const slow = createFrameBudgetMonitor();
  for (let frame = 0; frame < 75; frame++) assert.equal(slow.sample(frame * 40), false);
  let triggered = false;
  for (let frame = 75; frame <= 85; frame++) triggered ||= slow.sample(frame * 40);
  assert.equal(triggered, true);
});

test('sustained one-frame-per-second rendering also triggers the safety fallback', () => {
  const monitor = createFrameBudgetMonitor();
  assert.equal(monitor.sample(0), false);
  assert.equal(monitor.sample(1000), false);
  assert.equal(monitor.sample(2000), false);
  assert.equal(monitor.sample(3000), true);
});

test('a recovered frame window breaks the low-FPS streak', () => {
  const monitor = createFrameBudgetMonitor();
  let time = 0;
  monitor.sample(time);
  for (let frame = 0; frame < 50; frame++) { time += 40; assert.equal(monitor.sample(time), false); }
  for (let frame = 0; frame < 60; frame++) { time += 1000 / 60; assert.equal(monitor.sample(time), false); }
  for (let frame = 0; frame < 50; frame++) { time += 40; assert.equal(monitor.sample(time), false); }
});

test('hidden/loading time resets the measurement instead of counting against the GPU', () => {
  const monitor = createFrameBudgetMonitor();
  monitor.sample(0);
  for (let time = 40; time <= 2000; time += 40) assert.equal(monitor.sample(time), false);
  assert.equal(monitor.sample(62000, false), false);
  assert.equal(monitor.sample(63000), false);
  for (let time = 63040; time <= 65000; time += 40) assert.equal(monitor.sample(time), false);
});

test('products use their domestic locations and repeated categories get separate hotspots', () => {
  const slots = assignRoomSlots([
    { type: 'kettle', name: 'Cream kettle' },
    { type: 'apron', name: 'Linen apron' },
    { type: 'mug', name: 'Stoneware mugs' },
    { type: 'tray', name: 'Oak tray' },
    { type: 'speaker', name: 'Small radio' },
    { type: 'kettle', name: 'Second kettle' },
  ]);
  assert.deepEqual(slots.map(slot => slot.key), ['counter', 'hook', 'table-left', 'table-right', 'shelf', 'sideboard']);
  assert.equal(new Set(slots.map(slot => slot.key)).size, 6);
});

test('duplicate tableware cannot take a later apron hook or another product’s reserved surface', () => {
  const slots = assignRoomSlots([
    { type: 'kettle', name: 'Cream kettle' },
    { type: 'matcha', name: 'Matcha set' },
    { type: 'mugs', name: 'Stoneware mugs' },
    { type: 'tray', name: 'Oak tray' },
    { type: 'apron', name: 'Linen apron' },
    { type: 'vase', name: 'Clay vase' },
  ]);
  assert.deepEqual(slots.map(slot => slot.key), ['counter', 'table-left', 'shelf', 'table-right', 'hook', 'sideboard']);
});

test('multiple aprons hang separately, while extra tabletop products never occupy the hook', () => {
  const aprons = assignRoomSlots([
    { type: 'apron', name: 'Cream apron' },
    { type: 'apron', name: 'Sage apron' },
    { type: 'speaker', name: 'Radio' },
  ]);
  assert.equal(aprons[0].key, 'hook');
  assert.equal(aprons[1].key, 'hook');
  assert.notEqual(aprons[0].z, aprons[1].z);
  assert.equal(aprons[2].key, 'shelf');
  const mugs = assignRoomSlots(Array.from({ length: 6 }, (_, index) => ({ type: 'mugs', name: `Mugs ${index}` })));
  assert.ok(mugs.every(slot => slot.key !== 'hook'));
  assert.equal(new Set(mugs.map(slot => `${slot.x}:${slot.y}:${slot.z}`)).size, 6);
});

test('an unavailable WebGL context returns the fallback signal and removes constructor listeners', t => {
  t.mock.method(console, 'error', () => {});
  const attached = new Set<string>();
  const canvas = {
    width: 320, height: 280,
    getContext: () => null,
    setAttribute: () => {},
    addEventListener: (name: string) => attached.add(name),
    removeEventListener: (name: string) => attached.delete(name),
  } as unknown as HTMLCanvasElement;
  const failures: (string | undefined)[] = [];
  let ready = false;
  const engine = createDiorama(canvas, {
    phase: 'noon', items: [], onProjection: () => {},
    onReady: () => { ready = true; }, onFailure: reason => failures.push(reason),
  });
  assert.equal(engine, null);
  assert.deepEqual(failures, ['webgl']);
  assert.equal(ready, false);
  assert.equal(attached.size, 0);
});

test('every catalog item has a volumetric model, and rebuilding reuses its GPU resources', () => {
  const resources = new Set<{ dispose(): void }>();
  const library = createProductMeshLibrary(resource => { resources.add(resource); return resource; });
  let meshCount = 0;
  for (const sku of catalog) {
    const model = library.build({ skuId: sku.id, type: sku.type, name: sku.name, color: sku.color });
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    assert.equal(model.userData.skuId, sku.id);
    assert.ok(Number.isFinite(size.x + size.y + size.z), `${sku.id} has finite bounds`);
    assert.ok(size.x > .1 && size.y > .1 && size.z > .02, `${sku.id} is a 3D model`);
    model.traverse(object => { if (object instanceof THREE.Mesh) meshCount += 1; });
  }
  const pooledCount = resources.size;
  for (const sku of catalog) library.build({ skuId: sku.id, type: sku.type, name: sku.name, color: sku.color });
  assert.equal(resources.size, pooledCount, 'a full scene regeneration allocates no more geometry or materials');
  assert.ok(pooledCount < meshCount / 2, 'product meshes share a compact resource pool');
  resources.forEach(resource => resource.dispose());
});
