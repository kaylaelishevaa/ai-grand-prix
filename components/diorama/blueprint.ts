import * as THREE from 'three';
import {
  BLUEPRINT_FLOOR_Y, BLUEPRINT_PRODUCT_HEIGHT, BLUEPRINT_PRODUCT_RADIUS,
  BLUEPRINT_SHAPES, resolveBlueprintAnchors,
  type BlueprintNode, type ResolvedBlueprintAnchor, type SceneBlueprint,
} from '../../lib/scene-blueprint';
import type {RoomGeometry, RoomKit} from './rooms';

type Shape = BlueprintNode['shape'];
type MaterialKey = BlueprintNode['material'];
export type BlueprintGeometryPool = Record<Shape, THREE.BufferGeometry>;
export type BlueprintArchitecture = {
  anchors: Map<string, ResolvedBlueprintAnchor>;
  /** Only terrain is unique per plan; primitive geometry and paint stay pooled. */
  dispose(): void;
};

/** Authored rooms retain their original proportions. Generated primitives use
 * a separate small pool whose outer bounds exactly match the JSON unit box. */
export function createBlueprintGeometryPool(
  source: Record<RoomGeometry, THREE.BufferGeometry>,
  own: <T extends {dispose(): void}>(resource: T) => T = resource => resource,
): BlueprintGeometryPool {
  return Object.fromEntries(BLUEPRINT_SHAPES.map(shape => {
    const geometry = source[shape].clone();
    geometry.computeBoundingBox();
    const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return [shape, own(geometry)];
  })) as BlueprintGeometryPool;
}

/** Preserve the model's polygon, including concave edges, without accepting
 * executable geometry or changing the server's x/z coordinate convention. */
export function createBlueprintTerrain(blueprint: SceneBlueprint): THREE.BufferGeometry {
  const shape = new THREE.Shape(blueprint.terrain.outline.map(point => new THREE.Vector2(point.x, -point.z)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: blueprint.terrain.depth, steps: 1, bevelEnabled: false, curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, BLUEPRINT_FLOOR_Y - blueprint.terrain.depth, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** One validated plan, assembled from pooled primitive shapes. No kind/template
 * branch participates in this path: the model authored every node transform. */
export function buildBlueprintArchitecture(
  blueprint: SceneBlueprint,
  kit: Pick<RoomKit, 'piece' | 'blob'>,
  pool: BlueprintGeometryPool,
  material: (key: MaterialKey) => THREE.Material,
): BlueprintArchitecture {
  const terrainGeometry = createBlueprintTerrain(blueprint);
  const terrain = kit.piece('blueprint-terrain');
  terrain.add(new THREE.Mesh(terrainGeometry, material('ground')));
  const bounds = terrainGeometry.boundingBox!, center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const underside = new THREE.Mesh(pool.oval, material('ground'));
  underside.position.set(center.x, bounds.min.y + .04, center.z);
  underside.scale.set(size.x * .83, .32, size.z * .83);
  terrain.add(underside);
  kit.blob(terrain, center.x, center.z, size.x * 1.13, size.z * 1.13, bounds.min.y - .14);
  for (const node of blueprint.nodes) {
    const part = kit.piece(`blueprint:${node.id}`, node.position.x, node.position.y, node.position.z);
    part.rotation.set(node.rotation.x, node.rotation.y, node.rotation.z, 'XYZ');
    part.userData.blueprintNodeId = node.id;
    part.userData.support = node.support;
    if (node.motion !== 'none') part.userData.motion = node.motion;
    const mesh = new THREE.Mesh(pool[node.shape], material(node.material));
    mesh.scale.set(node.scale.x, node.scale.y, node.scale.z);
    part.add(mesh);
  }
  let disposed = false;
  return {
    anchors: new Map(resolveBlueprintAnchors(blueprint).map(anchor => [anchor.skuId, anchor])),
    dispose() {if (!disposed) {disposed = true; terrainGeometry.dispose();}},
  };
}

/** A circular footprint remains valid at every yaw. Actual mesh bounds, not
 * guessed SKU dimensions, determine the bottom and the hotspot's height. */
export function normalizeBlueprintProduct(product: THREE.Group, anchor: ResolvedBlueprintAnchor) {
  product.rotation.y = anchor.yaw;
  const bounds = new THREE.Box3().setFromObject(product);
  const size = bounds.getSize(new THREE.Vector3());
  const factor = Math.min(
    BLUEPRINT_PRODUCT_RADIUS * 2 / Math.max(.0001, Math.hypot(size.x, size.z)),
    BLUEPRINT_PRODUCT_HEIGHT / Math.max(.0001, size.y),
  ) * anchor.scale;
  product.scale.multiplyScalar(factor);
  bounds.setFromObject(product);
  const center = bounds.getCenter(new THREE.Vector3());
  const height = bounds.max.y - bounds.min.y;
  product.position.add(new THREE.Vector3(-center.x, -bounds.min.y, -center.z));
  product.updateMatrixWorld(true);
  return {height, radius: BLUEPRINT_PRODUCT_RADIUS * anchor.scale};
}

/** Fit the actual authored layout at the full permitted parallax extremes. */
export function blueprintCameraFit(bounds: THREE.Box3, aspect: number) {
  const padded = bounds.clone().expandByScalar(.16);
  const target = padded.getCenter(new THREE.Vector3());
  let halfWidth = 0, halfHeight = 0;
  for (const yawOffset of [-8, 0, 8]) for (const pitchOffset of [-4.6, 0, 4.6]) {
    const yaw = Math.PI / 4 + yawOffset * Math.PI / 180;
    const pitch = Math.atan(1 / Math.sqrt(2)) + pitchOffset * Math.PI / 180;
    for (const x of [padded.min.x, padded.max.x]) for (const y of [padded.min.y, padded.max.y]) for (const z of [padded.min.z, padded.max.z]) {
      const dx = x - target.x, dy = y - target.y, dz = z - target.z;
      halfWidth = Math.max(halfWidth, Math.abs(Math.cos(yaw) * dx - Math.sin(yaw) * dz));
      halfHeight = Math.max(halfHeight, Math.abs(-Math.sin(yaw) * Math.sin(pitch) * dx + Math.cos(pitch) * dy - Math.cos(yaw) * Math.sin(pitch) * dz));
    }
  }
  return {target, height: Math.max(5.2, halfHeight * 2.12, halfWidth * 2.12 / Math.max(.1, aspect))};
}
