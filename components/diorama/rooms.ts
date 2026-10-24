import * as THREE from 'three';
import type { SceneKind } from '../../lib/scenes';
import type {SceneContext} from '../../lib/world-context';

export type RoomGeometry = 'box' | 'cylinder' | 'tapered' | 'sphere' | 'leaf' | 'plane' | 'oval' | 'arch' | 'ring' | 'island' | 'wallArc';
export type RoomMaterial = 'paper' | 'floor' | 'wall' | 'teal' | 'sage' | 'wood' | 'clay' | 'orange' | 'brass' | 'leaf' | 'window' | 'ray' | 'blush' | 'mirror' | 'ink';
export type RoomKit = {
  piece(name: string, x?: number, y?: number, z?: number): THREE.Group;
  mesh(parent: THREE.Object3D, geometry: RoomGeometry, material: RoomMaterial, x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh;
  blob(parent: THREE.Object3D, x: number, z: number, sx: number, sz: number, y?: number): void;
};

/** The terrain is rounded and asymmetric, with a flat surface for grounded furniture. */
export function createRoomGeometries(own:<T extends {dispose():void}>(resource:T)=>T = resource=>resource):Record<RoomGeometry,THREE.BufferGeometry> {
  const island=new THREE.CylinderGeometry(.5,.43,1,48,1);
  const positions=island.getAttribute('position');
  for(let index=0;index<positions.count;index++){
    const x=positions.getX(index),z=positions.getZ(index),angle=Math.atan2(z,x);
    const offset=1+.075*Math.sin(angle*3+.7)+.035*Math.cos(angle*5-.3);
    positions.setXYZ(index,x*offset,positions.getY(index),z*offset);
  }
  island.computeVertexNormals();
  return {
    box:own(new THREE.BoxGeometry()),cylinder:own(new THREE.CylinderGeometry(.5,.5,1,18)),
    tapered:own(new THREE.CylinderGeometry(.45,.32,1,14)),sphere:own(new THREE.IcosahedronGeometry(.5,1)),
    leaf:own(new THREE.IcosahedronGeometry(.5,0)),plane:own(new THREE.PlaneGeometry()),
    oval:own(new THREE.SphereGeometry(.5,16,10)),arch:own(new THREE.TorusGeometry(.5,.055,6,24,Math.PI)),
    ring:own(new THREE.TorusGeometry(.5,.025,6,32)),island:own(island),
    wallArc:own(new THREE.CylinderGeometry(.5,.5,1,32,1,true,Math.PI*.5,Math.PI*1.06)),
  };
}

function island(kind:SceneKind,{piece,mesh}:RoomKit){
  const land=piece('organic-island');
  const shape=kind==='reading'?[7.3,6.35]:kind==='dressing'?[6.9,5.9]:kind==='desk'?[7.1,5.95]:[7.25,6.05];
  mesh(land,'island','floor',0,-.1,0,shape[0],.55,shape[1]).rotation.y=kind==='desk'?.24:kind==='reading'?-.3:.1;
  mesh(land,'island',kind==='reading'?'sage':'paper',-.14,.185,.02,shape[0]*.97,.055,shape[1]*.96).rotation.y=kind==='reading'?-.3:.1;
  // A tapering underside gives the scene the silhouette of a small floating landscape.
  mesh(land,'oval','floor',.1,-.43,.05,shape[0]*.89,.8,shape[1]*.85);
  const stones=piece('arrival-stones');
  for(let i=0;i<6;i++){
    const x=-2.45+i*.48,z=2.08+Math.sin(i*.8)*.32;
    mesh(stones,'island',i%2?'floor':'paper',x,.24,z,.47,.08,.33).rotation.y=.2+i*.22;
  }
}

function tree(kit:RoomKit,x:number,z:number,size:number,tint:RoomMaterial='leaf',shape='round'){
  const {piece,mesh,blob}=kit;
  const group=piece('tree',x,.15,z);group.userData.motion='tree';
  mesh(group,'tapered','wood',0,size*.64,0,size*.14,size*1.28,size*.14).rotation.z=-.075;
  for(let i=0;i<3;i++){
    const angle=i*2.3;
    const branch=mesh(group,'cylinder','wood',Math.cos(angle)*size*.16,size*(.9+i*.12),Math.sin(angle)*size*.15,size*.06,size*.52,size*.06);
    branch.rotation.z=(i%2?1:-1)*.65;
  }
  const crowns=shape==='tall'?[[0,1.75,0,.72,1.45],[.2,1.35,.16,.65,1.05],[-.22,1.3,-.1,.7,.95]]:[[0,1.5,0,1.2,.88],[-.35,1.3,.15,.9,.75],[.34,1.3,-.1,.9,.75],[.18,1.7,.05,.85,.73]];
  crowns.forEach(([cx,cy,cz,sx,sy])=>mesh(group,'oval',tint,cx*size,cy*size,cz*size,sx*size,sy*size,sx*size*.86));
  blob(group,0,0,size*1.8,size*1.5,.04);
  return group;
}

function shrub(kit:RoomKit,x:number,z:number,size:number,tint:RoomMaterial='sage'){
  const group=kit.piece('low-garden',x,.19,z);
  kit.mesh(group,'oval',tint,0,.18*size,0,.85*size,.55*size,.65*size);
  kit.mesh(group,'oval','leaf',.3*size,.16*size,.06*size,.5*size,.43*size,.5*size);
  for(let i=0;i<3;i++)kit.mesh(group,'sphere',i%2?'blush':'orange',-.22+i*.18,.4*size,-.07,.11,.11,.11);
}

function pottedPlant(kit:RoomKit,x:number,z:number,size=1){
  const {piece,mesh}=kit,group=piece('potted-leaves',x,.19,z);group.userData.motion='leaf';
  mesh(group,'tapered','clay',0,.22*size,0,.42*size,.44*size,.42*size);
  for(let i=0;i<5;i++){
    const a=i*2.4;
    mesh(group,'cylinder','leaf',Math.cos(a)*.09,.56*size,Math.sin(a)*.09,.025,.65*size,.025).rotation.z=Math.cos(a)*.3;
    const leaf=mesh(group,'oval',i%2?'sage':'leaf',Math.cos(a)*.19,.78*size+i*.045,Math.sin(a)*.19,.3*size,.58*size,.09*size);leaf.rotation.set(.25,a,.35*Math.cos(a));
  }
}

function ovalTop(kit:RoomKit,parent:THREE.Group,material:RoomMaterial,x:number,y:number,z:number,width:number,depth:number,thickness=.1){
  return kit.mesh(parent,'cylinder',material,x,y,z,width,thickness,depth);
}
function archedPortal(kit:RoomKit,name:string,x:number,z:number,width:number,height:number,material:RoomMaterial,angle=0){
  const group=kit.piece(name,x,.18,z);group.rotation.y=angle;
  const radius=width/2,shoulder=height-radius;
  kit.mesh(group,'arch',material,0,shoulder,0,width,width,.22);
  for(const sign of [-1,1])kit.mesh(group,'cylinder',material,sign*radius,shoulder/2,0,.12,shoulder,.12);
  return group;
}
function roundRug(kit:RoomKit,tint:RoomMaterial,x:number,z:number,width:number,depth:number){
  const group=kit.piece('woven-rug',x,.22,z);
  ovalTop(kit,group,tint,0,0,0,width,depth,.025);
  const trim=kit.mesh(group,'ring','paper',0,.018,0,width*.93,depth*.93,1);trim.rotation.x=-Math.PI/2;
}
function lantern(kit:RoomKit,x:number,y:number,z:number){
  const group=kit.piece('lantern',x,y,z);group.userData.motion='lantern';
  kit.mesh(group,'cylinder','brass',0,.23,0,.018,.46,.018);
  kit.mesh(group,'oval','window',0,-.035,0,.29,.36,.29);
  kit.mesh(group,'cylinder','brass',0,.135,0,.16,.025,.16);
}

function kitchenWorld(kit:RoomKit,scenic=true){
  const {piece,mesh,blob}=kit;
  if(scenic){
  const pergola=archedPortal(kit,'garden-pergola',-.5,-1.88,4.5,2.9,'wood');
  for(let i=0;i<6;i++)mesh(pergola,'cylinder','wood',-2+i*.8,2.66,.15,.055,1.1,.055).rotation.x=Math.PI/2;
  tree(kit,-2.68,-1.58,1.45,'leaf');tree(kit,2.62,-1.64,1.12,'sage');
  shrub(kit,-2.6,1.18,.78);shrub(kit,2.5,1.8,.73);
  const fruit=piece('citrus-fruit',-2.68,2.35,-1.58);
  for(let i=0;i<5;i++)mesh(fruit,'sphere','orange',Math.sin(i*2)*.47,Math.cos(i*1.3)*.21,Math.cos(i*2)*.44,.16,.16,.16);
  }
  const counter=piece('counter',-1.34,0,-1.36);
  ovalTop(kit,counter,'sage',0,.67,0,2.13,.89,.9);
  ovalTop(kit,counter,'paper',0,1.105,0,2.3,.99,.12);
  mesh(counter,'arch','floor',0,.56,.39,.68,.68,.65);
  blob(counter,0,0,2.5,1.5);
  const table=piece('table',.34,0,.89);
  ovalTop(kit,table,'wood',0,.942,0,2.62,1.63,.12);
  mesh(table,'tapered','paper',0,.57,0,.76,.73,.76);
  mesh(table,'box','paper',.08,1.007,0,.38,.01,1.46).rotation.y=.13;
  blob(table,0,0,3,2);
  const chair=piece('breakfast-chair',1.67,0,1.72);
  ovalTop(kit,chair,'sage',0,.56,0,.61,.61,.11);
  mesh(chair,'arch','wood',0,.8,.2,.6,.65,.5);
  for(const x of [-.2,.2])for(const z of [-.18,.18])mesh(chair,'cylinder','wood',x,.37,z,.055,.33,.055);
  const side=piece('sideboard',2.15,0,.1);
  ovalTop(kit,side,'teal',0,.785,0,1.05,.96,.08);mesh(side,'tapered','sage',0,.49,0,.67,.55,.67);
  const shelf=piece('shelf',1.48,0,-1.56);
  ovalTop(kit,shelf,'wood',0,1.632,0,1.13,.83,.08);
  mesh(shelf,'cylinder','wood',0,.9,0,.09,1.42,.09);
  const hook=piece('hook',-2.18,0,.18);
  mesh(hook,'cylinder','wood',0,.94,0,.07,1.52,.07);mesh(hook,'cylinder','brass',.01,1.51,.03,.06,.28,.06).rotation.x=Math.PI/2;
  pottedPlant(kit,-2.62,.43,.9);
  const basket=piece('breakfast-basket',-.6,0,2.06);ovalTop(kit,basket,'clay',0,.38,0,.54,.38,.3);mesh(basket,'arch','wood',0,.6,0,.43,.43,.5);
}

function deskWorld(kit:RoomKit){
  const {piece,mesh,blob}=kit;
  roundRug(kit,'sage',-.2,.45,4.3,3.5);
  const portal=archedPortal(kit,'coral-studio-arch',-1.17,-1.9,2.32,3.25,'clay');
  mesh(portal,'arch','paper',0,2.09,.06,2.05,2.05,.6);
  tree(kit,-2.72,-.55,1.24,'sage','tall');pottedPlant(kit,2.5,1.63,1.1);
  const desk=piece('writing-desk',-.45,0,-.9);
  ovalTop(kit,desk,'paper',0,.99,0,3.2,1.5,.14);
  for(const x of [-1.12,1.12]){mesh(desk,'cylinder','teal',x,.6,0,.1,.7,.1);ovalTop(kit,desk,'teal',x,.26,0,.6,.72,.05);}
  blob(desk,0,0,3.6,1.8);
  const monitor=piece('desk-monitor',-.4,1.06,-1.29);
  mesh(monitor,'box','teal',0,.41,0,.76,.49,.06);mesh(monitor,'box','mirror',0,.41,.038,.68,.4,.013);
  mesh(monitor,'cylinder','teal',0,.17,0,.045,.3,.045);ovalTop(kit,monitor,'teal',0,.02,.05,.3,.2,.035);
  const chair=piece('desk-chair',-.42,0,.24);
  ovalTop(kit,chair,'clay',0,.65,0,.83,.83,.16);mesh(chair,'oval','clay',0,.98,.28,.83,.78,.19).rotation.x=.13;
  for(const x of [-.27,.27])for(const z of [-.24,.24])mesh(chair,'cylinder','wood',x,.42,z,.06,.4,.06);
  const easel=piece('pegboard',1.76,0,-1.62);
  mesh(easel,'box','wood',0,1.99,-.12,1.15,.89,.05).rotation.x=-.07;
  mesh(easel,'box','paper',0,1.99,-.082,1.06,.81,.018).rotation.x=-.07;
  mesh(easel,'oval','clay',-.24,2.05,-.025,.38,.5,.01);mesh(easel,'oval','teal',.2,1.9,-.024,.42,.32,.01);
  ovalTop(kit,easel,'wood',0,1.67,.05,1.26,.8,.08);
  for(const x of [-.47,.47])mesh(easel,'cylinder','wood',x,.99,-.1,.055,1.58,.055).rotation.z=x<0?-.08:.08;
  const cabinet=piece('stationery-cabinet',2.04,0,.08);
  ovalTop(kit,cabinet,'clay',0,.77,0,1.12,1.05,.08);mesh(cabinet,'tapered','paper',0,.5,0,.67,.5,.67);
  const low=piece('low-work-table',.1,0,1.37);ovalTop(kit,low,'wood',0,.61,0,2.12,1.15,.1);
  for(const x of [-.72,.72])mesh(low,'tapered','clay',x,.42,0,.28,.35,.4);
  const papers=piece('ideas-in-the-air',1.3,2.72,-2.03);papers.userData.motion='paper';
  for(let i=0;i<3;i++){const paper=mesh(papers,'box',i%2?'blush':'paper',-.44+i*.45,Math.sin(i)*.2,.05*i,.32,.39,.013);paper.rotation.set(.1+i*.08,0,-.17+i*.13);}
  const sun=piece('studio-sun',2.65,2.79,-1.9);mesh(sun,'cylinder','orange',0,0,0,.89,.07,.89).rotation.x=Math.PI/2;
  shrub(kit,-1.9,2.0,.8,'clay');
}

function readingWorld(kit:RoomKit,scenic=true){
  const {piece,mesh,blob}=kit;
  // The shelter is an open curved gesture, framed by forest, not a room cutaway.
  if(scenic){
  const canopy=archedPortal(kit,'rain-shelter',-.85,-.64,2.8,2.94,'teal',-.15);
  mesh(canopy,'arch','wood',0,1.54,.12,2.62,2.62,4.2);
  tree(kit,-2.65,-1.55,1.3,'leaf','tall');tree(kit,2.6,-1.79,1.28,'teal','tall');tree(kit,-2.83,1.03,1.0,'sage');
  }
  roundRug(kit,'wood',-.15,.5,3.8,3.6);
  const chair=piece('reading-armchair',-.94,0,.18);
  mesh(chair,'oval','sage',0,.58,0,1.47,.76,1.39);mesh(chair,'oval','sage',0,1.08,-.41,1.41,1.22,.44).rotation.x=-.12;
  mesh(chair,'oval','paper',0,.8,.12,1.05,.21,.94);for(const x of [-.6,.6])mesh(chair,'oval','sage',x,.91,.07,.3,.53,1.05);
  mesh(chair,'oval','blush',.2,1.12,-.17,.54,.52,.2).rotation.z=-.2;
  blob(chair,0,0,2,1.9);
  const bookshelf=piece('bookcase',1.83,0,-1.55);
  // Two floating timber rounds on a sculptural trunk, each a grounded product perch.
  mesh(bookshelf,'tapered','wood',0,.96,-.15,.42,1.55,.42).rotation.z=-.1;
  ovalTop(kit,bookshelf,'wood',0,.87,0,1.27,.95,.08);ovalTop(kit,bookshelf,'wood',0,1.65,0,1.33,.95,.08);
  for(let i=0;i<4;i++)mesh(bookshelf,'box',i%2?'paper':'clay',-.39+i*.19,.59,.06,.15,.47,.4).rotation.z=(i-1)*.06;
  const side=piece('reading-side-table',.72,0,.3);ovalTop(kit,side,'wood',0,.83,0,1.03,1.03,.1);mesh(side,'tapered','teal',0,.51,0,.45,.56,.45);
  const ottoman=piece('reading-ottoman',-.81,0,1.4);mesh(ottoman,'oval','sage',0,.48,0,1.2,.5,.84);ovalTop(kit,ottoman,'wood',0,.66,0,.98,.74,.04);
  const console=piece('window-console',-1.36,0,-1.55);ovalTop(kit,console,'wood',0,1.005,0,1.84,.86,.09);mesh(console,'tapered','teal',0,.62,0,.66,.73,.55);
  const stool=piece('reading-stool',1.9,0,1.36);ovalTop(kit,stool,'paper',0,.54,0,.88,.88,.1);mesh(stool,'tapered','wood',0,.38,0,.41,.3,.41);
  const lamp=piece('reading-floor-lamp',-2.14,0,.72);ovalTop(kit,lamp,'teal',0,.24,0,.62,.62,.08);
  mesh(lamp,'cylinder','brass',0,1.18,0,.045,1.8,.045);mesh(lamp,'tapered','paper',0,2.04,0,.82,.44,.82).rotation.z=Math.PI;
  mesh(lamp,'oval','window',0,1.86,0,.29,.25,.29);
  if(scenic){
  const pond=piece('forest-pond',.37,.24,2.24);ovalTop(kit,pond,'mirror',0,0,0,2.25,.88,.025);pond.userData.motion='water';
  for(let i=0;i<3;i++){const ripple=mesh(pond,'ring','paper',-.58+i*.6,.019,Math.sin(i)*.1,.42,.24,1);ripple.rotation.x=-Math.PI/2;}
  shrub(kit,2.65,1.49,.88);shrub(kit,-1.92,2.12,.75,'leaf');
  }
  const books=piece('open-book',.12,.25,1.83);mesh(books,'box','paper',0,.01,0,.48,.035,.3).rotation.z=.07;
}

function dressingWorld(kit:RoomKit,scenic=true){
  const {piece,mesh,blob}=kit;
  roundRug(kit,'blush',-.02,.55,4.5,3.5);
  const rail=piece('open-wardrobe',-1.5,0,-1.35);
  // A brass garment arch is open to the evening: no enclosing retail cabinet.
  for(const x of [-1.04,1.04])mesh(rail,'cylinder','brass',x,1.3,.22,.045,2.23,.045);
  mesh(rail,'cylinder','brass',0,2.27,.22,.045,2.08,.045).rotation.z=Math.PI/2;
  for(const x of [-1.04,1.04])ovalTop(kit,rail,'wood',x,.21,.22,.44,.56,.04);
  for(const x of [-.83,.02,.82]){
    const hanger=piece('wardrobe-hanger',-1.5+x,2.18,-1.13);
    mesh(hanger,'cylinder','brass',0,.04,0,.018,.15,.018);
    for(const sign of [-1,1])mesh(hanger,'cylinder','brass',sign*.085,-.075,0,.018,.21,.018).rotation.z=sign*1.14;
    mesh(hanger,'cylinder','brass',0,-.12,0,.018,.34,.018).rotation.z=Math.PI/2;
  }
  archedPortal(kit,'evening-curtain-arch',-1.42,-1.85,2.6,3.04,'clay');
  const curtain=piece('evening-curtains',-1.42,.18,-1.91);curtain.userData.motion='curtain';
  for(const sign of [-1,1])for(let i=0;i<3;i++)mesh(curtain,'oval',i%2?'paper':'blush',sign*(1.03+i*.13),1.27,0,.21,2.5,.16);
  const vanity=piece('vanity-table',1.15,0,-1.02);ovalTop(kit,vanity,'paper',0,1,0,2.17,1.4,.11);
  for(const x of [-.68,.68]){mesh(vanity,'cylinder','brass',x,.62,0,.05,.72,.05);ovalTop(kit,vanity,'brass',x,.24,0,.43,.6,.04);}
  blob(vanity,0,0,2.6,1.6);
  const mirror=piece('vanity-mirror',1.15,1.98,-1.79);
  mesh(mirror,'oval','brass',0,0,0,1.46,1.63,.12);mesh(mirror,'oval','mirror',0,0,.06,1.29,1.45,.04);
  mesh(mirror,'box','paper',.29,.1,.085,.065,.86,.008).rotation.z=-.36;
  for(const side of [-1,1])for(const y of [-.43,.05,.51])mesh(mirror,'oval','window',side*.74,y,.08,.11,.11,.11);
  const stool=piece('vanity-stool',1.14,0,.11);ovalTop(kit,stool,'blush',0,.6,0,.75,.75,.16);mesh(stool,'tapered','brass',0,.38,0,.35,.28,.35);
  const bench=piece('dressing-bench',-1.33,0,1.16);ovalTop(kit,bench,'blush',0,.56,0,1.93,1.04,.16);
  for(const x of [-.62,.62])mesh(bench,'tapered','wood',x,.36,0,.18,.27,.42);
  const accessory=piece('accessory-table',1.64,0,1.16);ovalTop(kit,accessory,'wood',0,.69,0,.98,.98,.08);mesh(accessory,'tapered','brass',0,.43,0,.39,.48,.39);
  if(scenic){
  tree(kit,2.72,-1.4,1.35,'leaf');shrub(kit,-2.53,1.42,.85,'sage');
  const city=piece('distant-city',.25,.18,-2.68);
  for(let i=0;i<7;i++){
    const h=.42+(i%3)*.22;mesh(city,'box',i%2?'sage':'teal',-1.65+i*.54,h/2,0,.38,h,.28);
    mesh(city,'box','window',-1.65+i*.54,h*.65,.146,.04,.07,.008);
  }
  const fairy=piece('evening-light-string',.23,2.87,-1.95);
  for(let i=0;i<7;i++){
    const x=-2.4+i*.8,y=-.23*Math.cos((i-3)/3*Math.PI/2);mesh(fairy,'cylinder','brass',x,y,0,.012,.8,.012).rotation.z=Math.PI/2;
    lantern(kit,x+.23,2.87+y,-1.95);
  }
  const moon=piece('evening-moon',2.25,3.08,-2.48);mesh(moon,'oval','window',0,0,0,.42,.42,.07);
  }
}

function indoorSetting(kit:RoomKit,kind:SceneKind){
  const {piece,mesh}=kit;
  const wall=piece('curved-home-interior',0,.18,-.04);
  mesh(wall,'wallArc','wall',0,1.2,0,6.3,2.4,5.1);
  const window=archedPortal(kit,'arched-home-window',kind==='dressing'?2:-.35,-2.36,1.45,2.82,'paper');
  mesh(window,'oval','mirror',0,1.8,-.03,1.2,1.5,.04);
  mesh(window,'box','paper',0,1.69,.015,.045,1.5,.035);
  mesh(window,'box','paper',0,1.6,.015,1.19,.045,.035);
  const pendant=piece('home-pendant',.1,2.8,.08);
  mesh(pendant,'cylinder','brass',0,.28,0,.018,.56,.018);
  mesh(pendant,'tapered','paper',0,-.06,0,.64,.3,.64).rotation.z=Math.PI;
  mesh(pendant,'oval','window',0,-.17,0,.27,.12,.27);
  pottedPlant(kit,-2.65,.73,1.1);pottedPlant(kit,2.65,-1.59,.9);
}
function rooftopSetting(kit:RoomKit){
  const {piece,mesh}=kit;
  const rail=piece('rooftop-balustrade',0,.18,-.18);
  mesh(rail,'wallArc','wall',0,.34,0,6.6,.68,5.8);
  const skyline=piece('rooftop-skyline',.13,.18,-2.74);
  for(let i=0;i<8;i++){
    const h=.45+(i%3)*.21;mesh(skyline,'box',i%2?'teal':'sage',-2.1+i*.59,h/2,0,.36,h,.27);
    mesh(skyline,'box','window',-2.1+i*.59,h*.68,.14,.05,.08,.01);
  }
  const string=piece('rooftop-string-lights',0,2.85,-1.98);
  for(let i=0;i<7;i++){const x=-2.4+i*.8,y=-.25*Math.cos((i-3)*.35);mesh(string,'cylinder','brass',x,y,0,.014,.81,.014).rotation.z=Math.PI/2;lantern(kit,x,2.85+y,-1.98);}
  const candles=piece('dinner-candles',.34,1.01,.89);
  for(const x of [-.1,.12]){mesh(candles,'cylinder','paper',x,.13,0,.07,.26,.07);mesh(candles,'oval','window',x,.29,0,.045,.08,.045);}
  shrub(kit,-2.6,.9,.9,'sage');pottedPlant(kit,2.65,-1.12,1.1);
}
function cafeSetting(kit:RoomKit){
  const {piece,mesh}=kit;
  const cafe=piece('cafe-frontage',0,.18,-2.2);
  mesh(cafe,'wallArc','teal',0,1.24,.7,6.3,2.48,2.6);
  archedPortal(kit,'cafe-glazed-door',-.8,-2.03,1.7,2.89,'wood');
  const glass=piece('cafe-window-glass',-.8,1.84,-2.05);mesh(glass,'oval','mirror',0,0,0,1.52,1.7,.04);mesh(glass,'box','paper',0,0,.03,.04,1.65,.03);
  const awning=piece('striped-cafe-awning',0,2.68,-1.99);
  for(let i=0;i<9;i++)mesh(awning,'box',i%2?'paper':'clay',-2.16+i*.54,0,.24,.54,.07,1.15).rotation.x=.2;
  const sign=piece('cafe-round-sign',2.59,2.33,-1.75);mesh(sign,'cylinder','brass',0,0,0,.63,.07,.63).rotation.x=Math.PI/2;
  mesh(sign,'cylinder','window',0,0,.044,.49,.012,.49).rotation.x=Math.PI/2;
  lantern(kit,-1.92,2.57,-1.44);pottedPlant(kit,-2.65,.73,1.2);shrub(kit,2.64,1.65,.7,'sage');
}
function riversideSetting(kit:RoomKit){
  const {piece,mesh}=kit;
  const water=piece('riverside-water',-.05,.17,2.48);water.userData.motion='water';
  ovalTop(kit,water,'mirror',0,0,0,5.6,1.45,.04);
  for(let i=0;i<5;i++){const ripple=mesh(water,'ring','paper',-1.9+i*.88,.025,Math.sin(i)*.2,.55,.2,1);ripple.rotation.x=-Math.PI/2;}
  tree(kit,-2.71,-1.42,1.3,'leaf');tree(kit,2.65,-1.6,1.13,'sage');
  const blanket=piece('picnic-blanket',.16,.22,1.7);ovalTop(kit,blanket,'blush',0,0,0,2.4,.8,.025);
  for(let side=0;side<2;side++){
    const reeds=piece('river-reeds',side?2.58:-2.63,.2,1.96);
    for(let i=0;i<5;i++){mesh(reeds,'cylinder','leaf',Math.sin(i)*.15,.37+i*.035,Math.cos(i)*.13,.025,.74+i*.07,.025).rotation.z=(i-2)*.07;mesh(reeds,'oval','wood',Math.sin(i)*.15,.73+i*.07,Math.cos(i)*.13,.055,.17,.055);}
  }
  shrub(kit,-2.62,.9,.75);shrub(kit,2.66,.85,.78);
}

/** Product-placement kind and setting are independent: a dinner can be at home or above a city. */
export function buildRoomArchitecture(kind:SceneKind,kit:RoomKit,context?:SceneContext):void{
  island(kind,kit);
  const setting=context?.setting;
  const scenic=!setting||setting==='garden'||setting==='forest';
  if(kind==='dressing')dressingWorld(kit,scenic);
  else if(kind==='reading')readingWorld(kit,scenic);
  else if(kind==='desk')deskWorld(kit);
  else kitchenWorld(kit,scenic);
  if(setting==='home')indoorSetting(kit,kind);
  else if(setting==='rooftop')rooftopSetting(kit);
  else if(setting==='cafe')cafeSetting(kit);
  else if(setting==='riverside')riversideSetting(kit);
}
