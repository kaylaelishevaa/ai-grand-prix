import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BLUEPRINT_SHAPES,blueprintNodeCorners,resolveBlueprintAnchors,validateSceneBlueprint} from '../lib/scene-blueprint';
import {blueprintPaintOrder,blueprintUnitFaces,createBlueprintProjection,faceShade,fitProjection,projectIntoFrame,projectWorldPoint,transformBlueprintPoint,validatedBlueprintForScene} from '../lib/blueprint-projection';
import {fixtureBlueprint} from './fixtures/blueprint';
import type {SceneResult} from '../lib/types';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {getSku} from '../lib/catalog';

const require=createRequire(import.meta.url),styleLoader=require.extensions['.css'];
require.extensions['.css']=()=>{};
const fallback=require('../components/SceneFallback.tsx') as typeof import('../components/SceneFallback');
if(styleLoader)require.extensions['.css']=styleLoader;else delete require.extensions['.css'];

const near=(a:number,b:number)=>assert(Math.abs(a-b)<1e-7,`${a} should match ${b}`);
const scene=(variant=0):SceneResult=>({name:'A newly composed place',explanation:'Test geometry',items:[{skuId:'kettle',oneLiner:'A listed kettle.'},{skuId:'mugs',oneLiner:'Listed mugs.'}],blueprint:fixtureBlueprint(['kettle','mugs'],variant)});

test('fixed projection matches the actual isometric Three camera',()=>{
  const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,60);
  camera.position.set(10,10,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  for(const point of [{x:0,y:0,z:0},{x:2,y:1,z:-1},{x:-3,y:.18,z:2},{x:.4,y:3.6,z:-2.2}]){
    const expected=new THREE.Vector3(point.x,point.y,point.z).project(camera),projected=projectWorldPoint(point);
    near(projected.x,expected.x*10);near(projected.y,-expected.y*10);
  }
});

test('node transform uses identical Euler XYZ order and bounds as the validated mesh contract',()=>{
  const position={x:.4,y:1.5,z:-.8},scale={x:1.1,y:.7,z:.4},rotation={x:.3,y:-.5,z:.7};
  const point={x:.5,y:-.5,z:.5};
  const result=transformBlueprintPoint(point,position,scale,rotation);
  const expected=new THREE.Vector3(point.x,point.y,point.z).multiply(new THREE.Vector3(scale.x,scale.y,scale.z)).applyEuler(new THREE.Euler(rotation.x,rotation.y,rotation.z,'XYZ')).add(new THREE.Vector3(position.x,position.y,position.z));
  near(result.x,expected.x);near(result.y,expected.y);near(result.z,expected.z);
  const node={...fixtureBlueprint(['kettle','mugs']).nodes[0],position,scale,rotation,support:false as const};
  assert(blueprintNodeCorners(node).some(corner=>Math.hypot(corner.x-result.x,corner.y-result.y,corner.z-result.z)<1e-7));
});

test('all fixed primitive glyphs have the canonical unit bounds at both detail levels',()=>{
  for(const shape of BLUEPRINT_SHAPES)for(const thumbnail of [false,true]){
    const faces=blueprintUnitFaces(shape,thumbnail),points=faces.flat();
    assert(faces.length>=6&&faces.length<=130,`${shape} keeps a small static SVG budget`);
    assert(points.every(point=>Object.values(point).every(Number.isFinite)));
    for(const axis of ['x','y','z'] as const){near(Math.min(...points.map(point=>point[axis])),-.5);near(Math.max(...points.map(point=>point[axis])),.5);}
  }
});

test('new geometry produces a different projection while every model node remains represented',()=>{
  const first=createBlueprintProjection(scene().blueprint!),second=createBlueprintProjection(scene(1).blueprint!);
  assert.notDeepEqual(first.faces,second.faces);
  assert.deepEqual([...new Set(first.faces.map(face=>face.nodeId))].sort(),scene().blueprint!.nodes.map(node=>node.id).sort());
  assert(first.faces.every(face=>/^#[0-9a-f]{6}$/i.test(face.fill)));
  assert(first.faces.every(face=>/^[\d., -]+$/.test(face.points)));
});

test('terrain outline is preserved and product touchpoints use the exact support heights',()=>{
  const blueprint=scene().blueprint!,projection=createBlueprintProjection(blueprint,390,430);
  const terrain=projection.terrain.find(face=>face.nodeId==='terrain-top')!;
  assert.equal(terrain.points.split(' ').length,blueprint.terrain.outline.length);
  for(const anchor of resolveBlueprintAnchors(blueprint)){
    const product=projection.products.find(product=>product.skuId===anchor.skuId)!;
    const actual=projectIntoFrame(anchor,projection.fit);
    near(product.x,actual.x);near(product.y,actual.y);near(product.supportY,.58);
    assert(product.x>25&&product.x<365&&product.y>25&&product.y<405);
  }
  const terrainProduct=structuredClone(blueprint);terrainProduct.anchors[0].supportId=null;
  near(createBlueprintProjection(terrainProduct).products.find(product=>product.skuId==='kettle')!.supportY,.18);
});

test('atlas thumbnails retain the same world and anchors, with fewer polygon faces',()=>{
  const blueprint=scene().blueprint!,full=createBlueprintProjection(blueprint),mini=createBlueprintProjection(blueprint,330,230,true);
  assert(mini.faces.length<=full.faces.length);
  assert.deepEqual(mini.products.map(product=>[product.skuId,product.supportY]),full.products.map(product=>[product.skuId,product.supportY]));
  assert.equal(mini.terrain.at(-1)!.fill,blueprint.palette.ground);
  assert.equal(mini.terrain.at(-1)!.points.split(' ').length,full.terrain.at(-1)!.points.split(' ').length);
});

test('overlapping scenery paints behind or in front of product art according to the shared camera depth',()=>{
  const blueprint=scene().blueprint!,anchor=resolveBlueprintAnchors(blueprint)[0];
  // Moving equally along X/Y/Z follows the camera ray: all three objects overlap on screen.
  for(const [index,id,delta,size] of [[1,'near-wall',.9,.8],[2,'far-wall',-.3,.18]] as const){
    blueprint.nodes[index]={...blueprint.nodes[index],id,shape:'box',position:{x:anchor.x+delta,y:anchor.y+delta,z:anchor.z+delta},scale:{x:size,y:size,z:size},support:false};
  }
  const inside=(x:number,y:number,points:string)=>{
    const polygon=points.split(' ').map(pair=>pair.split(',').map(Number));let contained=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const [ax,ay]=polygon[i],[bx,by]=polygon[j];
      if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)contained=!contained;
    }
    return contained;
  };
  for(const thumbnail of [false,true]){
    const projection=createBlueprintProjection(blueprint,390,430,thumbnail),product=projection.products.find(item=>item.skuId===anchor.skuId)!;
    const order=blueprintPaintOrder(projection),productIndex=order.findIndex(entry=>entry.kind==='product'&&entry.product.skuId===anchor.skuId);
    for(const wall of ['near-wall','far-wall']){
      const faces=projection.faces.filter(face=>face.nodeId===wall);
      assert(faces.some(face=>inside(product.x,product.y,face.points)),`${wall} actually overlaps the product's touchpoint`);
      for(const face of faces){
        const index=order.findIndex(entry=>entry.kind==='face'&&entry.face===face);
        assert(wall==='near-wall'?index>productIndex:index<productIndex,`${wall} paints on the correct side of product art`);
      }
    }
    const depths=order.map(entry=>entry.kind==='face'?entry.face.depth:entry.product.depth);
    assert.deepEqual(depths,[...depths].sort((a,b)=>a-b));
    assert.equal(order.length,projection.faces.length+projection.products.length);
  }
});

test('unsafe colors, shapes and mismatched anchors never enter the fallback renderer',()=>{
  const valid=scene();assert(validatedBlueprintForScene(valid));
  const malicious=structuredClone(valid);malicious.blueprint!.palette.ground='url(https://untrusted.example/pixel)';assert.equal(validatedBlueprintForScene(malicious),null);
  const shape=structuredClone(valid);(shape.blueprint!.nodes[0] as {shape:string}).shape='script';assert.equal(validatedBlueprintForScene(shape),null);
  const mismatched=structuredClone(valid);mismatched.blueprint!.anchors[0].skuId='another';assert.equal(validatedBlueprintForScene(mismatched),null);
  const missing={...valid,blueprint:undefined};assert.equal(validatedBlueprintForScene(missing),null);
  assert.equal(faceShade('url(https://untrusted.example)',[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0}]),'#16424a');
});

test('projection stays finite for tiny responsive stages and fits actual authored bounds',()=>{
  const blueprint=validateSceneBlueprint(scene().blueprint,['kettle','mugs']);
  for(const [width,height] of [[0,0],[240,320],[390,430],[1440,650]]){
    const projection=createBlueprintProjection(blueprint,width,height);
    assert(Object.values(projection.fit).every(Number.isFinite));assert(projection.fit.scale>0);
    for(const point of blueprint.nodes.flatMap(blueprintNodeCorners)){
      const projected=projectIntoFrame(point,projection.fit);
      assert(projected.x>=-1e-7&&projected.x<=Math.max(1,width)+1e-7);
      assert(projected.y>=-1e-7&&projected.y<=Math.max(1,height)+1e-7);
    }
  }
  assert(Number.isFinite(fitProjection([],390,430).scale));
});

test('generated reference products retain exact anchors and paint order as original listing photo frames',()=>{
  const ids=['7434051500','1539744911'],blueprint=fixtureBlueprint(ids),projection=createBlueprintProjection(blueprint,390,430);
  const html=renderToStaticMarkup(createElement(fallback.GeneratedBlueprintSVG,{blueprint,width:390,height:430,projection}));
  const actualOrder=[...html.matchAll(/data-blueprint-(node|product)="([^"]+)"/g)].map(match=>`${match[1]}:${match[2]}`);
  assert.deepEqual(actualOrder,blueprintPaintOrder(projection).map(entry=>entry.kind==='face'?`node:${entry.face.nodeId}`:`product:${entry.product.skuId}`));
  for(const product of projection.products){
    const sku=getSku(product.skuId)!;
    assert(html.includes(`src="${sku.image}"`),'use the exact locally bundled listing photograph');
    const frame=html.match(new RegExp(`<svg[^>]*data-blueprint-product="${sku.id}"[^>]*>`))?.[0];assert(frame);
    assert(frame.includes(`x="${product.x-product.width/2}"`)&&frame.includes(`y="${product.y-product.height*.85}"`));
    assert(frame.includes(`width="${product.width}"`)&&frame.includes(`height="${product.height}"`));
  }
  assert.match(html,/<foreignObject/);assert.doesNotMatch(html,/blueprint-product-art/);
});

test('authored fallback mixes exact reference photos with readable legacy synthetic illustrations',()=>{
  const prepared:SceneResult={name:'A morning',explanation:'Sourced mugs and a simulated kettle.',items:[{skuId:'7434051500',oneLiner:'Mugs'},{skuId:'kettle',oneLiner:'Kettle'}]};
  const html=renderToStaticMarkup(createElement(fallback.default,{scene:prepared,onSelect:()=>{}}));
  assert(html.includes(`src="${getSku('7434051500')!.image}"`));
  assert.equal((html.match(/data-product-source="listing-photo"/g)||[]).length,1);
  assert.match(html,/fallback-kettle/);assert.match(html,/class="fallback-product-art"><svg/);
  assert(html.includes('aria-label="Explore '+getSku('kettle')!.name+'"'));
});

test('missing or untrusted reference photos use local catalog photo fallbacks',()=>{
  const sku=getSku('7434051500')!,second=getSku('1539744911')!,saved=sku.image,secondSaved=second.image,blueprint=fixtureBlueprint([sku.id,second.id]);
  const prepared:SceneResult={name:'A morning',explanation:'Sourced mugs.',items:[{skuId:sku.id,oneLiner:'Mugs'}]};
  try{
    for(const image of [undefined,'https://untrusted.example/other.jpg','/scene-reference/products/illustration.svg','/scene-reference/products/../other.png']){
      sku.image=image;second.image=image;
      for(const html of [renderToStaticMarkup(createElement(fallback.GeneratedBlueprintSVG,{blueprint})),renderToStaticMarkup(createElement(fallback.default,{scene:prepared,onSelect:()=>{}}))]){
        assert.match(html,/<img[^>]+src="\/generated-products\/[a-zA-Z0-9_-]+\.webp"/);assert.doesNotMatch(html,/Photo unavailable|blueprint-product-art|class="fallback-product-art"><svg/);
        assert.doesNotMatch(html,/https:\/\/untrusted/);
      }
    }
  }finally{sku.image=saved;second.image=secondSaved;}
});
