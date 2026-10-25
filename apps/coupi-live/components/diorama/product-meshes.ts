import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {createSurfaceLibrary,type SurfaceKind} from './surfaces';

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
  const dress = new THREE.Shape();
  dress.moveTo(-.34, 0); dress.lineTo(.34, 0); dress.lineTo(.15, .65);
  dress.lineTo(.2, .94); dress.lineTo(.1, 1.04); dress.lineTo(0, .91);
  dress.lineTo(-.1, 1.04); dress.lineTo(-.2, .94); dress.lineTo(-.15, .65); dress.closePath();
  const blouse = new THREE.Shape();
  blouse.moveTo(-.24, 0); blouse.lineTo(.24, 0); blouse.lineTo(.23, .51);
  blouse.lineTo(.4, .31); blouse.lineTo(.51, .42); blouse.lineTo(.28, .77);
  blouse.lineTo(.1, .84); blouse.lineTo(0, .74); blouse.lineTo(-.1, .84);
  blouse.lineTo(-.28, .77); blouse.lineTo(-.51, .42); blouse.lineTo(-.4, .31);
  blouse.lineTo(-.23, .51); blouse.closePath();
  const tshirt=new THREE.Shape();
  tshirt.moveTo(-.24,0);tshirt.lineTo(.24,0);tshirt.lineTo(.24,.52);tshirt.lineTo(.38,.43);tshirt.lineTo(.49,.65);tshirt.lineTo(.25,.82);tshirt.lineTo(.105,.86);tshirt.quadraticCurveTo(0,.7,-.105,.86);tshirt.lineTo(-.25,.82);tshirt.lineTo(-.49,.65);tshirt.lineTo(-.38,.43);tshirt.lineTo(-.24,.52);tshirt.closePath();
  // The lipstick's exposed tip is slanted geometry, not a flat picture.
  const lipstick = new THREE.CylinderGeometry(.5, .5, 1, 24);
  const bulletPositions = lipstick.getAttribute('position');
  for (let index = 0; index < bulletPositions.count; index++) {
    if (bulletPositions.getY(index) > 0) bulletPositions.setY(index, .5 + bulletPositions.getX(index) * .65);
  }
  lipstick.computeVertexNormals();
  const geometry = {
    box: own(new RoundedBoxGeometry(1,1,1,3,.035)),
    cylinder: own(new THREE.CylinderGeometry(.5, .5, 1, 24)),
    cone: own(new THREE.CylinderGeometry(.22, .5, 1, 32)),
    sphere: own(new THREE.SphereGeometry(.5,20,12)),
    leaf: own(new THREE.IcosahedronGeometry(.5, 0)),
    ring: own(new THREE.TorusGeometry(.5, .095, 10, 28)),
    cup: own(new THREE.LatheGeometry(cupProfile, 24)),
    bowl: own(new THREE.LatheGeometry(bowlProfile, 24)),
    kettle: own(new THREE.LatheGeometry(kettleProfile, 28)),
    apron: own(new THREE.ExtrudeGeometry(apron, { depth: .027, bevelEnabled: false, steps: 1 })),
    dress: own(new THREE.ExtrudeGeometry(dress, { depth: .065, bevelEnabled: false, steps: 1 })),
    blouse: own(new THREE.ExtrudeGeometry(blouse, { depth: .055, bevelEnabled: false, steps: 1 })),
    tshirt:own(new THREE.ExtrudeGeometry(tshirt,{depth:.055,bevelEnabled:true,bevelThickness:.007,bevelSize:.006,bevelSegments:2,steps:1})),
    lipstick: own(lipstick),
  };
  const surfaces=createSurfaceLibrary(own);
  function paint(color:string,finish:SurfaceKind='ceramic') {return surfaces.paint(color,color==='#B9BEB3'||color==='#C6A166'||color==='#CCA768'?'metal':color==='#B78C61'?'wood':finish);}
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
      const finish:SurfaceKind=/apron|dress|blouse|shirt|hoodie|sweater|cushion|socks|towel|handbag|chair/.test(type)?'fabric':/book|speaker|keyboard|headphone/.test(type)?'plaster':'ceramic';
      const mesh = new THREE.Mesh(geometry[shape], paint(color,finish));
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
      part('cup', color, x, 0, z, size, size * .85, size).name='mug-body';
      handle(x + size * .48, size * .43, z, color, size * .48).name='mug-handle';
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
      part('kettle', main, 0, .05, 0, .64, .64, .64).name='kettle-body';
      handle(-.34, .36, 0, wood, .4).scale.y = .53;
      const spout = part('cone', main, .36, .36, 0, .19, .45, .19); spout.rotation.z = -.95;
      const mouth = cylinder(dark, .53, .49, 0, .085, .012); mouth.rotation.z = -.95;
      cylinder(main, 0, .61, 0, .37, .04);
      cylinder(wood, 0, .66, 0, .11, .07);
      cylinder(orange, .17, .09, .24, .035, .018).rotation.x = Math.PI / 2;
    } else if (type === 'mug') {
      cup(0,0,main,.55);
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
    } else if (type === 'dress' || type === 'blouse') {
      part(type, main, 0, 0, -.035, 1, 1, 1).name = `${type}-fabric`;
      const shoulderY = type === 'dress' ? 1.05 : .85;
      for (const side of [-1, 1]) {
        const hanger = part('box', wood, side * .12, shoulderY + .08, 0, .28, .025, .028);
        hanger.rotation.z = -side * .35;
      }
      ring(metal, 0, shoulderY + .22, 0, .12, .15, .08).name = 'hanger-hook';
      if (type === 'dress') {
        part('box', '#47665F', 0, .65, .041, .31, .025, .022).name = 'dress-waist-seam';
        for (const side of [-1, 0, 1]) {
          const fold = part('box', '#365B52', side * .13, .29, .042, .017, .55, .025);
          fold.rotation.z = -side * .16;
        }
        for (const side of [-1, 1]) part('box', main, side * .115, 1.05, 0, .025, .13, .035);
      } else {
        part('box', '#E8D8C0', 0, .38, .038, .038, .69, .019).name = 'blouse-placket';
        for (let index = 0; index < 5; index++) cylinder(cream, 0, .12 + index * .12, .058, .025, .015).rotation.x = Math.PI / 2;
        for (const side of [-1, 1]) {
          const collar = part('leaf', cream, side * .066, .76, .06, .17, .16, .045);
          collar.rotation.z = side * .25;
        }
      }
      group.rotation.y = .2;
    } else if(type==='tshirt'||type==='hoodie'||type==='sweater'){
      part(type==='tshirt'?'tshirt':'blouse',main,0,0,-.03,1,1,1).name=`${type}-fabric`;
      for(const side of [-1,1]){const hanger=part('box',wood,side*.12,.9,0,.28,.022,.028);hanger.rotation.z=-side*.35;}
      ring(metal,0,1.07,0,.11,.14,.07).name='hanger-hook';
      part('box',main,0,.025,.035,.46,.034,.035).name='garment-hem';
      if(type==='hoodie'){
        part('sphere',main,0,.84,-.015,.32,.31,.18).name='hood';
        part('sphere',dark,0,.86,.076,.19,.21,.018).name='hood-opening';
        for(const side of [-1,1])part('box',cream,side*.07,.68,.067,.012,.19,.012);
        part('box',main,0,.23,.056,.31,.17,.032).name='kangaroo-pocket';
      }else if(type==='sweater'){
        ring(main,0,.81,.039,.21,.15,.036).name='ribbed-neckline';
        for(let i=0;i<9;i++)part('box',main,-.19+i*.047,.037,.058,.01,.07,.009);
      }else ring(main,0,.805,.039,.22,.16,.029).name='tee-neckline';
      group.rotation.y=.15;
    } else if(type==='glasses'){
      for(const side of [-1,1]){
        ring(dark,side*.19,.17,.11,.32,.23,.075).name=side<0?'left-eyeglass-frame':'right-eyeglass-frame';
        part('sphere','#C8D7CF',side*.19,.17,.108,.26,.17,.014).name='eyeglass-lens';
        const temple=part('box',dark,side*.35,.17,-.115,.025,.026,.46);temple.rotation.y=-side*.08;temple.name='eyeglass-temple';
        part('box',metal,side*.355,.17,.11,.043,.023,.028);
      }
      part('box',dark,0,.18,.11,.085,.027,.026).name='eyeglass-bridge';
    } else if(type==='chair'){
      part('box',main,0,.62,.025,.72,.115,.64).name='chair-seat';
      const back=part('box',main,0,.98,-.28,.62,.64,.105);back.rotation.x=-.1;back.name='chair-back';
      for(const side of [-1,1]){
        part('box',dark,side*.37,.69,0,.038,.31,.045);
        part('box',dark,side*.37,.85,.005,.085,.055,.4).name='chair-armrest';
      }
      cylinder(metal,0,.36,0,.08,.43).name='chair-gas-lift';
      cylinder(dark,0,.19,0,.13,.15);
      for(let i=0;i<5;i++){
        const angle=i*Math.PI*2/5,spoke=part('box',dark,Math.sin(angle)*.19,.105,Math.cos(angle)*.19,.045,.045,.39);spoke.rotation.y=angle;
        const wheel=cylinder(dark,Math.sin(angle)*.37,.055,Math.cos(angle)*.37,.105,.07);wheel.rotation.z=Math.PI/2;wheel.rotation.y=angle;wheel.name='chair-caster';
      }
    } else if(type==='lipbalm'){
      cylinder(main,-.09,.2,0,.2,.4).name='lipbalm-tube';
      cylinder(cream,-.09,.42,0,.17,.08).name='lipbalm-stick';
      cylinder('#E0B0A0',-.09,.47,0,.145,.035);
      cylinder(main,.2,.13,.02,.21,.26).name='lipbalm-cap';
      part('box',cream,-.09,.22,.103,.065,.13,.007);
    } else if (type === 'handbag') {
      part('box', main, 0, .25, 0, .64, .43, .27).name = 'handbag-body';
      part('sphere', main, 0, .25, 0, .75, .5, .34);
      part('box', '#704735', 0, .39, .153, .58, .19, .035).name = 'handbag-flap';
      ring(main, 0, .57, 0, .39, .36, .24).name = 'handbag-strap';
      part('box', '#C6A166', 0, .31, .18, .08, .065, .025).name = 'handbag-clasp';
      for (const side of [-1, 1]) cylinder('#C6A166', side * .23, .47, .02, .045, .055);
    } else if (type === 'lipstick') {
      cylinder(teal, -.07, .17, 0, .21, .34).name = 'lipstick-case';
      cylinder('#CCA768', -.07, .37, 0, .185, .085);
      cylinder('#AB8349', -.07, .42, 0, .15, .03);
      part('lipstick', main, -.07, .54, 0, .13, .28, .13).name = 'lipstick-bullet';
      cylinder(teal, .2, .19, .035, .22, .38).name = 'lipstick-cap';
      cylinder('#CCA768', .2, .028, .035, .222, .035);
      part('box', cream, .2, .21, .15, .055, .04, .012);
    } else if (type === 'compact') {
      cylinder(main, 0, .06, .08, .58, .12).name = 'compact-base';
      cylinder('#B8955F', 0, .125, .08, .48, .025);
      cylinder('#DDBD93', 0, .145, .08, .43, .025).name = 'compact-powder';
      const hinge = cylinder('#B8955F', 0, .12, -.18, .055, .3); hinge.rotation.z = Math.PI / 2;
      const lid = new THREE.Group(); lid.position.set(0, .13, -.18); lid.rotation.x = -.4;
      // Move the shared meshes into an open, hinged lid group.
      for (const [color, diameter, depth, z, name] of [[main, .58, .07, 0, 'compact-lid'], ['#B8CCC5', .48, .016, .045, 'compact-mirror']] as const) {
        const disc = cylinder(color, 0, .28, z, diameter, depth); disc.rotation.x = Math.PI / 2;
        disc.name = name; lid.add(disc);
      }
      const reflection = part('box', '#E8EFE5', -.09, .31, .06, .027, .26, .008); reflection.rotation.z = -.45; lid.add(reflection);
      group.add(lid);
    } else if (type === 'perfume') {
      part('box', '#D4B596', 0, .28, 0, .37, .46, .23).name = 'perfume-bottle';
      part('box', main, 0, .22, .01, .29, .3, .18).name = 'perfume-liquid';
      for (const x of [-.17, .17]) part('box', '#E9D4B6', x, .28, .115, .028, .42, .02);
      part('box', '#FFF3DD', 0, .28, .13, .21, .17, .012).name = 'perfume-label';
      part('box', teal, 0, .28, .139, .1, .018, .006);
      cylinder('#C6A166', 0, .54, 0, .12, .08);
      part('box', teal, 0, .65, 0, .21, .15, .19).name = 'perfume-cap';
    } else if (type === 'earrings') {
      for (const side of [-1, 1]) {
        const hoop = ring(main, side * .17, .2, 0, .25, .31, .17); hoop.name = `earring-hoop-${side}`; hoop.rotation.y = side * .2;
        part('sphere', '#E6CA8C', side * .17, .355, 0, .065, .065, .065);
        cylinder(main, side * .17, .35, -.035, .018, .08).rotation.x = Math.PI / 2;
      }
    } else if (type === 'makeupbrush') {
      cylinder(main, 0, .22, 0, .075, .44).name = 'brush-handle';
      cylinder('#C8A169', 0, .48, 0, .105, .15).name = 'brush-ferrule';
      part('sphere', '#8D735D', 0, .65, 0, .24, .31, .2).name = 'brush-bristles';
      for (let index = 0; index < 7; index++) {
        const angle = index * Math.PI * 2 / 7;
        const bristle = cylinder('#B69A7B', Math.cos(angle) * .07, .67, Math.sin(angle) * .05, .013, .18);
        bristle.rotation.z = -Math.cos(angle) * .15;
      }
      group.rotation.z = -.12;
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
      part('cone', main, 0, .79, 0, .66, .36, .66).name='lamp-shade';
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
      part('sphere', main, 0, .15, 0, .79, .3, .66).name='cushion-body';
      const piping=ring(main,0,.15,0,.665,.55,.08);piping.rotation.x=Math.PI/2;piping.name='cushion-piping';
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
