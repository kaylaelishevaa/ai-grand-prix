import * as THREE from 'three';

type Product = { skuId: string; type: string; name: string; color?: string };
type Own = <T extends { dispose(): void }>(resource: T) => T;

/**
 * Stylized product models, not manufacturer CAD. All instances share this small
 * geometry/material pool; rebuilding a scene only creates lightweight meshes.
 */
export function createProductMeshLibrary(own: Own) {
  const cupProfile = [new THREE.Vector2(0, 0), new THREE.Vector2(.37, 0), new THREE.Vector2(.48, .08), new THREE.Vector2(.5, 1), new THREE.Vector2(.39, 1), new THREE.Vector2(.36, .14), new THREE.Vector2(0, .14)];
  const bowlProfile = [new THREE.Vector2(0, 0), new THREE.Vector2(.24, 0), new THREE.Vector2(.43, .3), new THREE.Vector2(.5, .66), new THREE.Vector2(.44, .66), new THREE.Vector2(.36, .28), new THREE.Vector2(0, .12)];
  const kettleProfile = [new THREE.Vector2(0, 0), new THREE.Vector2(.29, 0), new THREE.Vector2(.47, .15), new THREE.Vector2(.5, .51), new THREE.Vector2(.39, .78), new THREE.Vector2(.25, .86), new THREE.Vector2(0, .86)];
  const apron = new THREE.Shape();
  apron.moveTo(-.23, 0); apron.lineTo(.23, 0); apron.lineTo(.19, .43); apron.lineTo(.1, .58);
  apron.lineTo(.1, .74); apron.lineTo(-.1, .74); apron.lineTo(-.1, .58); apron.lineTo(-.19, .43); apron.closePath();
  const geometry = {
    box: own(new THREE.BoxGeometry(1, 1, 1)),
    cylinder: own(new THREE.CylinderGeometry(.5, .5, 1, 12)),
    cone: own(new THREE.CylinderGeometry(.22, .5, 1, 10)),
    sphere: own(new THREE.IcosahedronGeometry(.5, 1)),
    leaf: own(new THREE.IcosahedronGeometry(.5, 0)),
    ring: own(new THREE.TorusGeometry(.5, .095, 6, 18)),
    cup: own(new THREE.LatheGeometry(cupProfile, 12)),
    bowl: own(new THREE.LatheGeometry(bowlProfile, 12)),
    kettle: own(new THREE.LatheGeometry(kettleProfile, 14)),
    apron: own(new THREE.ExtrudeGeometry(apron, { depth: .027, bevelEnabled: false, steps: 1 })),
  };
  const palette = new Map<string, THREE.MeshLambertMaterial>();
  function paint(color: string) {
    let material = palette.get(color);
    if (!material) {
      material = own(new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide }));
      palette.set(color, material);
    }
    return material;
  }
  const cream = '#FFF3D8', teal = '#16424A', orange = '#E8681A', wood = '#B78C61';
  const dark = '#344945', green = '#78956A', clay = '#C38267', metal = '#B9BEB3';

  function build(item: Product) {
    const group = new THREE.Group();
    group.name = `product:${item.skuId}`;
    group.userData.skuId = item.skuId;
    group.userData.type = item.type;
    const type = item.type.toLowerCase();
    const main = item.color && /^#[0-9a-f]{3,8}$/i.test(item.color) ? item.color :
      /speaker|lamp|cooker/.test(type) ? teal : /tray|rattan|organizer/.test(type) ? wood : cream;
    function part(shape: keyof typeof geometry, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
      const mesh = new THREE.Mesh(geometry[shape], paint(color));
      mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); group.add(mesh); return mesh;
    }
    function cylinder(color: string, x: number, y: number, z: number, diameter: number, height: number) {
      return part('cylinder', color, x, y, z, diameter, height, diameter);
    }
    function ring(color: string, x: number, y: number, z: number, sx: number, sy: number, sz = sx) {
      return part('ring', color, x, y, z, sx, sy, sz);
    }
    function handle(x: number, y: number, z: number, color = main, size = .25) {
      return ring(color, x, y, z, size, size * 1.15, size * .8);
    }
    function cup(x: number, z: number, color = main, size = .4) {
      part('cup', color, x, 0, z, size, size * .85, size);
      handle(x + size * .48, size * .43, z, color, size * .48);
      cylinder(wood, x, size * .22, z, size * .68, .012);
    }
    function pot(x: number, z: number, size = .5) {
      part('cone', clay, x, size * .28, z, size, size * .56, size).rotation.z = Math.PI;
      cylinder(dark, x, size * .57, z, size * .8, .025);
      cylinder(green, x, size * 1.05, z, .025, size);
      for (let i = 0; i < 5; i++) {
        const angle = i * 2.4;
        const leaf = part('leaf', green, x + Math.cos(angle) * size * .23, size * (.85 + i * .1), z + Math.sin(angle) * size * .23, size * .54, size * .15, size * .32);
        leaf.rotation.set(.2, -angle, .5 * (i % 2 ? 1 : -1));
      }
    }

    if (type === 'kettle') {
      cylinder(dark, 0, .025, 0, .69, .05);
      part('kettle', main, 0, .05, 0, .64, .64, .64);
      handle(-.34, .36, 0, wood, .4).scale.y = .53;
      const spout = part('cone', main, .36, .36, 0, .19, .45, .19); spout.rotation.z = -.95;
      const mouth = cylinder(dark, .53, .49, 0, .085, .012); mouth.rotation.z = -.95;
      cylinder(main, 0, .61, 0, .37, .04);
      cylinder(wood, 0, .66, 0, .11, .07);
      cylinder(orange, .17, .09, .24, .035, .018).rotation.x = Math.PI / 2;
    } else if (type === 'mugs' || type === 'glass') {
      cup(-.18, -.05, main, .39);
      cup(.2, .13, type === 'glass' ? '#B4C9BF' : clay, .33);
    } else if (type === 'matcha') {
      part('bowl', main, -.1, .025, 0, .6, .53, .6);
      cylinder('#71894B', -.1, .22, 0, .39, .012);
      const stem = cylinder(wood, .28, .39, .05, .06, .29); stem.rotation.z = -.15;
      for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7;
        const tine = cylinder('#D9BC7D', .28 + Math.cos(angle) * .07, .18, .05 + Math.sin(angle) * .07, .016, .24);
        tine.rotation.z = Math.cos(angle) * -.13;
      }
    } else if (type === 'tray') {
      part('box', main, 0, .03, 0, .83, .06, .53);
      for (const x of [-.405, .405]) part('box', main, x, .09, 0, .045, .13, .57);
      for (const z of [-.26, .26]) part('box', main, 0, .09, z, .83, .13, .045);
      for (const x of [-.45, .45]) handle(x, .11, 0, main, .16).rotation.y = Math.PI / 2;
      part('box', '#DDC7A2', 0, .068, 0, .66, .014, .36);
    } else if (type === 'apron') {
      part('apron', main, 0, 0, 0, 1.35, 1.25, 1);
      ring(main, 0, 1.04, .012, .24, .32, .14);
      part('box', clay, 0, .32, .045, .3, .23, .026);
      for (const x of [-.1, .1]) part('box', '#DBCEAF', x, .49, .035, .013, .68, .012);
      for (const side of [-1, 1]) {
        const tie = part('box', main, side * .31, .59, .02, .22, .035, .025); tie.rotation.z = side * .27;
      }
      group.rotation.y = .5;
    } else if (type === 'speaker') {
      part('box', wood, 0, .27, 0, .75, .5, .31);
      part('box', main, 0, .27, .163, .69, .43, .025);
      cylinder(dark, -.13, .27, .187, .32, .022).rotation.x = Math.PI / 2;
      cylinder('#63776A', -.13, .27, .205, .24, .025).rotation.x = Math.PI / 2;
      for (let x = 0; x < 4; x++) for (let y = 0; y < 3; y++) {
        part('box', dark, -.23 + x * .065, .2 + y * .065, .221, .023, .023, .008);
      }
      cylinder(cream, .22, .35, .194, .083, .045).rotation.x = Math.PI / 2;
      cylinder(orange, .22, .21, .194, .045, .035).rotation.x = Math.PI / 2;
      part('box', cream, .22, .1, .19, .12, .025, .01);
      part('box', wood, 0, .57, 0, .35, .045, .07);
      for (const x of [-.16, .16]) part('box', wood, x, .525, 0, .045, .08, .07);
      for (const x of [-.25, .25]) part('box', dark, x, .015, 0, .1, .04, .22);
    } else if (type === 'lamp') {
      cylinder(main, 0, .035, 0, .51, .07);
      cylinder(wood, 0, .4, 0, .055, .7);
      part('cone', main, 0, .79, 0, .66, .36, .66);
      cylinder('#FFE5AA', 0, .61, 0, .51, .02);
      cylinder(orange, .16, .081, 0, .035, .025);
    } else if (type === 'cooker') {
      part('kettle', main, 0, 0, 0, .79, .67, .68);
      cylinder(main, 0, .58, 0, .7, .06);
      part('box', dark, 0, .68, 0, .35, .055, .11);
      for (const x of [-.15, .15]) part('box', dark, x, .635, 0, .05, .09, .11);
      part('box', dark, 0, .31, .315, .31, .19, .055);
      part('box', '#AFC49D', 0, .34, .35, .2, .07, .012);
      cylinder(orange, .065, .25, .35, .035, .015).rotation.x = Math.PI / 2;
    } else if (type === 'espresso') {
      part('box', main, 0, .35, -.08, .64, .7, .37);
      part('box', metal, 0, .04, .13, .68, .08, .6);
      part('box', metal, 0, .5, .17, .34, .12, .25);
      const lever = cylinder(dark, .2, .43, .24, .055, .3); lever.rotation.z = Math.PI / 2;
      cylinder(dark, -.18, .59, .12, .09, .04).rotation.x = Math.PI / 2;
      cup(0, .23, cream, .25);
    } else if (type === 'vase' || type === 'plant' || type === 'greens') {
      pot(0, 0, type === 'greens' ? .4 : .52);
    } else if (type === 'candle') {
      cylinder(main, 0, .22, 0, .36, .44);
      cylinder(cream, 0, .447, 0, .31, .017);
      cylinder(dark, 0, .48, 0, .014, .06);
      part('leaf', orange, 0, .55, 0, .07, .14, .055);
      part('box', cream, 0, .22, .182, .18, .13, .015);
    } else if (type === 'rattan' || type === 'organizer') {
      part('box', main, 0, .16, 0, .65, .29, .48);
      part('box', dark, 0, .313, 0, .52, .012, .35);
      for (let i = 0; i < 6; i++) part('box', '#DEC6A1', -.275 + i * .11, .16, .248, .017, .26, .013);
      for (let i = 0; i < 3; i++) part('box', '#DEC6A1', 0, .06 + i * .09, .253, .63, .015, .012);
      for (const x of [-.32, .32]) handle(x, .28, 0, wood, .22).rotation.y = Math.PI / 2;
    } else if (type === 'cushion') {
      part('sphere', main, 0, .14, 0, .79, .3, .66);
      part('box', clay, 0, .27, 0, .58, .014, .035);
    } else if (type === 'milk') {
      part('box', cream, 0, .29, 0, .29, .58, .26);
      part('cone', cream, 0, .64, 0, .3, .14, .27);
      cylinder(main, .065, .74, 0, .08, .06);
      part('box', main, 0, .32, .136, .23, .24, .014);
    } else if (type === 'tomato') {
      for (let i = 0; i < 3; i++) {
        const x = Math.cos(i * 2.1) * .18, z = Math.sin(i * 2.1) * .18;
        part('sphere', '#C85D3C', x, .14, z, .28, .27, .28);
        part('leaf', green, x, .285, z, .13, .025, .12);
      }
    } else if (type === 'tofu') {
      part('box', main, 0, .09, 0, .56, .18, .4);
      part('box', cream, 0, .19, 0, .47, .03, .31);
      part('box', teal, .12, .21, 0, .15, .012, .26);
    } else if (type === 'socks') {
      for (const x of [-.13, .13]) {
        part('box', main, x, .2, -.04, .18, .4, .13);
        part('box', main, x, .06, .06, .18, .12, .31);
        part('box', cream, x, .34, .03, .18, .035, .014);
      }
    } else {
      // Unknown catalog types remain three-dimensional, without inventing details.
      part('box', main, 0, .22, 0, .43, .44, .37);
      part('box', cream, 0, .25, .192, .27, .2, .016);
      part('box', orange, 0, .07, .192, .12, .025, .017);
    }
    return group;
  }

  return { build };
}
