import type * as THREE from 'three';
import type { SceneKind } from '../../lib/scenes';

export type RoomGeometry = 'box' | 'cylinder' | 'tapered' | 'sphere' | 'leaf' | 'plane';
export type RoomMaterial = 'paper' | 'floor' | 'wall' | 'teal' | 'sage' | 'wood' | 'clay' | 'orange' | 'brass' | 'leaf' | 'window' | 'ray' | 'blush' | 'mirror' | 'ink';
/** All meshes borrow the engine's small geometry/material pools. Rebuilds allocate only scene nodes. */
export type RoomKit = {
  piece(name: string, x?: number, y?: number, z?: number): THREE.Group;
  mesh(parent: THREE.Object3D, geometry: RoomGeometry, material: RoomMaterial, x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh;
  blob(parent: THREE.Object3D, x: number, z: number, sx: number, sz: number, y?: number): void;
};

function shell(kind: SceneKind, {piece, mesh}: RoomKit) {
  const base = piece('floating-base');
  mesh(base, 'box', 'paper', 0, -.07, 0, 5.6, .43, 4.45);
  mesh(base, 'box', 'floor', 0, .155, 0, 5.48, .04, 4.33);
  mesh(base, 'box', 'orange', 1.86, -.08, 2.232, .24, .055, .012);
  for (let i = 0; i < 5; i++) mesh(base, 'box', 'paper', -1.8 + i * .9, .178, 0, .012, .005, 4.3);
  const back = piece('back-wall', 0, 0, -2.06);
  mesh(back, 'box', 'wall', 0, 1.4, 0, 5.48, 2.48, .16);
  mesh(back, 'box', 'paper', 0, .28, .1, 5.4, .14, .07);
  const left = piece('cutaway-wall', -2.66, 0, -.3);
  mesh(left, 'box', 'wall', 0, 1.04, 0, .16, 1.73, 3.44);
  mesh(left, 'box', 'paper', .1, .28, 0, .07, .14, 3.4);
  const windowFrame = kind === 'dressing'
    ? piece('side-window', -2.55, 1.85, .24)
    : piece('window', kind === 'kitchen' ? -.35 : -1.03, 1.83, -1.94);
  if (kind === 'dressing') windowFrame.rotation.y = Math.PI / 2;
  const span = kind === 'dressing' ? 1.3 : kind === 'kitchen' ? 1.92 : 1.64;
  mesh(windowFrame, 'box', 'window', 0, 0, 0, span, 1.39, .035);
  for (const sign of [-1, 1]) {
    mesh(windowFrame, 'box', 'paper', sign * (span / 2 + .05), 0, .035, .1, 1.59, .1);
    mesh(windowFrame, 'box', 'paper', 0, sign * .745, .035, span + .2, .1, .1);
  }
  mesh(windowFrame, 'box', 'paper', 0, 0, .04, .055, 1.4, .08);
  mesh(windowFrame, 'box', 'paper', 0, -.08, .04, span, .055, .08);
  const shaft = mesh(windowFrame, 'plane', 'ray', .18, -.81, 1.25, span, 3, 1);
  shaft.rotation.x = -Math.PI / 3.2;
  shaft.rotation.z = -.13;
}

function plant({piece, mesh, blob}: RoomKit, x: number, z: number) {
  const pot = piece('plant', x, 0, z);
  mesh(pot, 'tapered', 'clay', 0, .4, 0, .48, .45, .48);
  mesh(pot, 'cylinder', 'leaf', 0, .89, 0, .035, .76, .035);
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.4;
    const leaf = mesh(pot, 'leaf', 'leaf', Math.cos(angle) * .19, .89 + i * .09, Math.sin(angle) * .19, .4, .12, .26);
    leaf.rotation.set(.1, -angle, .43 * (i % 2 ? 1 : -1));
  }
  blob(pot, 0, 0, 1.1, 1.1);
}

function rug({piece, mesh}: RoomKit, color: RoomMaterial, x: number, z: number, width: number, depth: number) {
  const group = piece('woven-rug', x, 0, z);
  mesh(group, 'box', color, 0, .192, 0, width, .025, depth);
  for (const sign of [-1, 1]) {
    mesh(group, 'box', 'paper', sign * (width / 2 - .1), .208, 0, .025, .008, depth - .1);
    for (let i = 0; i < 9; i++) mesh(group, 'box', 'paper', -width / 2 + .12 + i * (width - .24) / 8, .2, sign * (depth / 2 + .045), .028, .012, .11);
  }
}

function kitchenRoom({piece, mesh, blob}: RoomKit) {
    const counter = piece('counter', -1.34, 0, -1.36);
    mesh(counter, 'box', 'sage', 0, 0.62, 0, 2.18, 0.87, 0.83);
    mesh(counter, 'box', 'paper', 0, 1.1, 0, 2.3, 0.12, 0.96);
    mesh(counter, 'box', 'sage', 0, 0.22, 0.03, 2.07, 0.12, 0.75);
    for (const x of [-0.54, 0.54]) {
      mesh(counter, 'box', 'paper', x, 0.65, 0.428, 0.015, 0.73, 0.012);
      mesh(counter, 'box', 'brass', x + 0.15, 0.82, 0.46, 0.22, 0.028, 0.045);
    }
    blob(counter, 0, 0.15, 2.8, 1.4);

    const shelf = piece('shelf', 1.55, 1.62, -1.85);
    mesh(shelf, 'box', 'wood', 0, 0, 0.1, 1.65, 0.095, 0.54);
    mesh(shelf, 'box', 'teal', -0.52, -0.13, -0.05, 0.045, 0.28, 0.26);
    mesh(shelf, 'box', 'teal', 0.52, -0.13, -0.05, 0.045, 0.28, 0.26);
    mesh(shelf, 'cylinder', 'clay', 0.52, 0.20, 0.1, 0.23, 0.3, 0.23);
    mesh(shelf, 'cylinder', 'paper', 0.24, 0.15, 0.1, 0.19, 0.21, 0.19);

    const table = piece('table', 0.34, 0, 0.89);
    mesh(table, 'box', 'wood', 0, 0.91, 0, 2.35, 0.13, 1.25);
    mesh(table, 'box', 'paper', 0, 0.986, 0, 0.51, 0.018, 1.26);
    for (const x of [-0.93, 0.93]) for (const z of [-0.43, 0.43]) {
      const leg = mesh(table, 'box', 'wood', x, 0.52, z, 0.11, 0.69, 0.11);
      leg.rotation.z = x < 0 ? -0.06 : 0.06;
    }
    blob(table, 0, 0, 3.2, 2.05);

    const stool = piece('stool', 1.65, 0, 1.63);
    mesh(stool, 'cylinder', 'sage', 0, 0.57, 0, 0.56, 0.12, 0.56);
    for (const x of [-0.15, 0.15]) for (const z of [-0.15, 0.15]) mesh(stool, 'box', 'wood', x, 0.35, z, 0.055, 0.39, 0.055);
    blob(stool, 0, 0, 0.9, 0.9);

    const hook = piece('hook', -2.5, 1.35, 0.13);
    mesh(hook, 'box', 'wood', 0, 0.12, 0, 0.13, 0.09, 0.56);
    mesh(hook, 'cylinder', 'brass', 0.12, 0.12, 0, 0.08, 0.08, 0.08).rotation.z = Math.PI / 2;

    const sideboard = piece('sideboard', 2.1, 0, -0.1);
    mesh(sideboard, 'box', 'teal', 0, 0.47, 0, 0.83, 0.55, 0.69);
    mesh(sideboard, 'box', 'paper', 0, 0.78, 0, 0.91, 0.08, 0.76);
    mesh(sideboard, 'box', 'brass', 0, 0.49, 0.36, 0.18, 0.025, 0.04);
    blob(sideboard, 0, 0, 1.3, 1.15);

    const plant = piece('plant', -2.1, 0, 1.46);
    mesh(plant, 'tapered', 'clay', 0, 0.4, 0, 0.6, 0.45, 0.6);
    mesh(plant, 'cylinder', 'leaf', 0, 0.89, 0, 0.035, 0.76, 0.035);
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.4;
      const leaf = mesh(plant, 'leaf', 'leaf', Math.cos(angle) * 0.19, 0.89 + i * 0.09, Math.sin(angle) * 0.19, 0.4, 0.12, 0.26);
      leaf.rotation.set(0.1, -angle, 0.43 * (i % 2 ? 1 : -1));
    }
    blob(plant, 0, 0, 1.1, 1.1);

    const details = piece('details');
    // Little domestic details give the room scale without competing with products.
    mesh(details, 'box', 'clay', 2.15, 2.27, -1.94, 0.58, 0.57, 0.06);
    mesh(details, 'box', 'paper', 2.15, 2.27, -1.90, 0.46, 0.45, 0.02);
    mesh(details, 'cylinder', 'sage', 2.15, 2.27, -1.88, 0.23, 0.02, 0.23).rotation.x = Math.PI / 2;

}

function deskRoom(kit: RoomKit) {
  const {piece, mesh, blob} = kit;
  rug(kit, 'sage', -.1, .84, 3.6, 1.8);
  const desk = piece('writing-desk', -.45, 0, -.9);
  mesh(desk, 'box', 'wood', 0, .99, 0, 3.1, .14, 1.12);
  for (const x of [-1.32, 1.32]) for (const z of [-.4, .4]) mesh(desk, 'box', 'teal', x, .58, z, .085, .78, .085);
  mesh(desk, 'box', 'paper', .7, .85, 0, .9, .15, .75);
  mesh(desk, 'box', 'brass', .7, .85, .39, .18, .025, .035);
  blob(desk, 0, 0, 3.6, 1.9);

  const monitor = piece('desk-monitor', -.35, 1.06, -1.22);
  mesh(monitor, 'box', 'teal', 0, .5, 0, .89, .59, .07);
  mesh(monitor, 'box', 'mirror', 0, .5, .045, .79, .49, .012);
  mesh(monitor, 'box', 'paper', 0, .22, 0, .06, .39, .06);
  mesh(monitor, 'box', 'paper', 0, .035, .04, .4, .035, .23);
  mesh(monitor, 'box', 'sage', -.23, .57, .057, .23, .25, .008);
  mesh(monitor, 'box', 'paper', .12, .63, .057, .31, .03, .008);
  mesh(monitor, 'box', 'paper', .12, .54, .057, .31, .03, .008);

  const chair = piece('desk-chair', -.42, 0, .24);
  mesh(chair, 'box', 'clay', 0, .65, 0, .78, .17, .77);
  mesh(chair, 'box', 'clay', 0, 1.06, .32, .81, .73, .14);
  mesh(chair, 'box', 'paper', 0, 1.03, .234, .55, .42, .03);
  for (const x of [-.28, .28]) for (const z of [-.27, .27]) mesh(chair, 'box', 'wood', x, .39, z, .06, .4, .06);
  blob(chair, 0, 0, 1.3, 1.3);

  const pegboard = piece('pegboard', 1.7, 1.98, -1.94);
  mesh(pegboard, 'box', 'sage', 0, 0, 0, 1.3, 1.08, .06);
  for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) {
    mesh(pegboard, 'cylinder', 'paper', -.48 + x * .24, -.36 + y * .24, .038, .035, .015, .035).rotation.x = Math.PI / 2;
  }
  mesh(pegboard, 'box', 'wood', .03, -.32, .22, 1.44, .1, .66);
  mesh(pegboard, 'box', 'paper', -.35, .17, .04, .35, .36, .016).rotation.z = -.09;
  mesh(pegboard, 'box', 'clay', .28, .24, .04, .3, .25, .016).rotation.z = .1;

  const cabinet = piece('stationery-cabinet', 2.04, 0, .08);
  mesh(cabinet, 'box', 'sage', 0, .46, 0, .9, .53, .83);
  mesh(cabinet, 'box', 'wood', 0, .77, 0, 1, .08, .93);
  for (const y of [.34, .56]) {
    mesh(cabinet, 'box', 'paper', 0, y, .425, .79, .012, .01);
    mesh(cabinet, 'box', 'brass', 0, y + .07, .45, .17, .023, .04);
  }
  blob(cabinet, 0, 0, 1.3, 1.3);

  const table = piece('low-work-table', .1, 0, 1.37);
  mesh(table, 'box', 'paper', 0, .61, 0, 1.95, .1, .85);
  for (const x of [-.77, .77]) for (const z of [-.24, .24]) mesh(table, 'box', 'wood', x, .38, z, .07, .36, .07);
  blob(table, 0, 0, 2.4, 1.2);
  plant(kit, -2.12, 1.3);
}

function readingRoom(kit: RoomKit) {
  const {piece, mesh, blob} = kit;
  rug(kit, 'clay', -.2, .72, 3.6, 2.15);
  const chair = piece('reading-armchair', -.94, 0, .18);
  mesh(chair, 'box', 'sage', 0, .55, 0, 1.35, .47, 1.29);
  mesh(chair, 'box', 'sage', 0, 1.04, -.5, 1.32, .98, .3).rotation.x = -.1;
  mesh(chair, 'box', 'paper', 0, .8, .05, .94, .21, .91);
  for (const x of [-.61, .61]) mesh(chair, 'box', 'sage', x, .95, .03, .25, .48, 1.16);
  mesh(chair, 'box', 'blush', .19, 1.13, -.23, .49, .49, .19).rotation.z = -.17;
  for (const x of [-.49, .49]) for (const z of [-.42, .42]) mesh(chair, 'box', 'wood', x, .27, z, .11, .18, .11);
  blob(chair, 0, 0, 2.2, 2);

  const bookshelf = piece('bookcase', 1.83, 0, -1.55);
  mesh(bookshelf, 'box', 'wood', 0, 1.39, -.32, 1.35, 2.42, .08);
  for (const x of [-.64, .64]) mesh(bookshelf, 'box', 'wood', x, 1.39, 0, .08, 2.42, .7);
  for (const y of [.22, .87, 1.65, 2.59]) mesh(bookshelf, 'box', 'wood', 0, y, 0, 1.37, .08, .72);
  for (let i = 0; i < 6; i++) {
    const color: RoomMaterial = i % 3 === 0 ? 'teal' : i % 3 === 1 ? 'clay' : 'paper';
    mesh(bookshelf, 'box', color, -.47 + i * .17, .51, -.025, .13, .48 + (i % 2) * .07, .4);
    mesh(bookshelf, 'box', 'brass', -.47 + i * .17, .39, .18, .09, .017, .008);
  }
  blob(bookshelf, 0, 0, 1.8, 1.2);

  const side = piece('reading-side-table', .72, 0, .3);
  mesh(side, 'cylinder', 'wood', 0, .83, 0, .94, .1, .94);
  mesh(side, 'cylinder', 'brass', 0, .52, 0, .085, .56, .085);
  mesh(side, 'cylinder', 'teal', 0, .23, 0, .61, .08, .61);
  blob(side, 0, 0, 1.3, 1.3);

  const ottoman = piece('reading-ottoman', -.81, 0, 1.4);
  mesh(ottoman, 'box', 'sage', 0, .44, 0, 1.06, .4, .69);
  mesh(ottoman, 'box', 'wood', 0, .66, 0, .84, .04, .6);
  blob(ottoman, 0, 0, 1.6, 1.2);

  const console = piece('window-console', -1.36, 0, -1.55);
  mesh(console, 'box', 'wood', 0, 1.005, 0, 1.75, .09, .65);
  for (const x of [-.72, .72]) mesh(console, 'box', 'wood', x, .59, 0, .07, .76, .5);
  const stool = piece('reading-stool', 1.9, 0, 1.36);
  mesh(stool, 'cylinder', 'paper', 0, .54, 0, .76, .1, .76);
  for (const x of [-.22, .22]) for (const z of [-.22, .22]) mesh(stool, 'box', 'wood', x, .35, z, .06, .3, .06);
  blob(stool, 0, 0, 1.1, 1.1);

  const lamp = piece('reading-floor-lamp', -2.14, 0, .72);
  mesh(lamp, 'cylinder', 'teal', 0, .21, 0, .61, .07, .61);
  mesh(lamp, 'cylinder', 'brass', 0, 1.14, 0, .045, 1.84, .045);
  mesh(lamp, 'tapered', 'paper', 0, 2.02, 0, .78, .43, .78).rotation.z = Math.PI;
  mesh(lamp, 'sphere', 'window', 0, 1.86, 0, .22, .22, .22);
  plant(kit, -.02, -1.54);
}

function dressingRoom(kit: RoomKit) {
  const {piece, mesh, blob} = kit;
  rug(kit, 'blush', -.02, .72, 3.95, 2.07);
  const wardrobe = piece('open-wardrobe', -1.5, 0, -1.35);
  mesh(wardrobe, 'box', 'teal', 0, 1.39, -.43, 2.06, 2.42, .09);
  for (const x of [-1, 1]) mesh(wardrobe, 'box', 'wood', x, 1.39, 0, .1, 2.42, .94);
  for (const y of [.23, 2.6]) mesh(wardrobe, 'box', 'wood', 0, y, 0, 2.13, .1, .97);
  mesh(wardrobe, 'cylinder', 'brass', 0, 2.27, .22, .045, 1.97, .045).rotation.z = Math.PI / 2;
  // The rail stays visible behind the real garment meshes; empty hangers give it scale.
  for (const x of [-.82, .02, .83]) {
    const hanger = piece('wardrobe-hanger', -1.5 + x, 2.18, -1.13);
    mesh(hanger, 'cylinder', 'brass', 0, .04, 0, .018, .15, .018);
    mesh(hanger, 'box', 'brass', -.085, -.075, 0, .21, .018, .018).rotation.z = .43;
    mesh(hanger, 'box', 'brass', .085, -.075, 0, .21, .018, .018).rotation.z = -.43;
    mesh(hanger, 'box', 'brass', 0, -.12, 0, .34, .018, .018);
  }
  mesh(wardrobe, 'box', 'blush', .4, .39, .03, .58, .2, .6);
  mesh(wardrobe, 'box', 'paper', .4, .5, .03, .62, .025, .64);
  blob(wardrobe, 0, 0, 2.5, 1.55);

  const vanity = piece('vanity-table', 1.15, 0, -1.02);
  mesh(vanity, 'box', 'paper', 0, 1, 0, 1.98, .11, .98);
  mesh(vanity, 'box', 'wood', 0, .85, -.04, 1.83, .22, .74);
  for (const x of [-.79, .79]) for (const z of [-.31, .31]) mesh(vanity, 'cylinder', 'brass', x, .53, z, .055, .69, .055);
  for (const x of [-.46, .46]) mesh(vanity, 'box', 'brass', x, .85, .35, .21, .023, .04);
  blob(vanity, 0, 0, 2.55, 1.6);

  const mirror = piece('vanity-mirror', 1.15, 1.91, -1.78);
  mesh(mirror, 'box', 'brass', 0, 0, 0, 1.46, 1.35, .09);
  mesh(mirror, 'box', 'mirror', 0, 0, .054, 1.32, 1.21, .025);
  mesh(mirror, 'box', 'paper', .33, .12, .071, .12, .87, .006).rotation.z = -.36;
  mesh(mirror, 'box', 'paper', .14, .12, .071, .035, .87, .006).rotation.z = -.36;
  // Warm bulbs are simple emissive-colored primitives, not six expensive lights.
  for (const x of [-.81, .81]) for (const y of [-.46, 0, .46]) mesh(mirror, 'sphere', 'window', x, y, .08, .14, .14, .14);

  const stool = piece('vanity-stool', 1.14, 0, .11);
  mesh(stool, 'cylinder', 'blush', 0, .6, 0, .68, .16, .68);
  for (const x of [-.21, .21]) for (const z of [-.21, .21]) mesh(stool, 'cylinder', 'brass', x, .36, z, .045, .34, .045);
  blob(stool, 0, 0, 1.1, 1.1);

  const bench = piece('dressing-bench', -1.33, 0, 1.16);
  mesh(bench, 'box', 'blush', 0, .56, 0, 1.71, .16, .78);
  for (const x of [-.67, .67]) for (const z of [-.23, .23]) mesh(bench, 'box', 'wood', x, .35, z, .07, .28, .07);
  mesh(bench, 'box', 'wood', 0, .32, 0, 1.5, .05, .6);
  for (const x of [-.46, -.16]) {
    mesh(bench, 'sphere', 'teal', x, .38, .03, .19, .17, .36);
    mesh(bench, 'box', 'brass', x, .37, -.09, .15, .11, .12);
  }
  blob(bench, 0, 0, 2.2, 1.4);

  const accessory = piece('accessory-table', 1.64, 0, 1.16);
  mesh(accessory, 'cylinder', 'wood', 0, .69, 0, .87, .08, .87);
  mesh(accessory, 'cylinder', 'brass', 0, .43, 0, .065, .48, .065);
  mesh(accessory, 'cylinder', 'paper', 0, .21, 0, .56, .055, .56);
  blob(accessory, 0, 0, 1.2, 1.2);
}

/** Literal room layouts; all share the same shell dimensions and animation budget. */
export function buildRoomArchitecture(kind: SceneKind, kit: RoomKit): void {
  shell(kind, kit);
  if (kind === 'dressing') dressingRoom(kit);
  else if (kind === 'desk') deskRoom(kit);
  else if (kind === 'reading') readingRoom(kit);
  else kitchenRoom(kit);
}
