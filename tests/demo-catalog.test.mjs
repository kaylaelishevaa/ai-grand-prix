import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import catalog from '../data/catalog.json' with {type:'json'};
import {demoCatalog,isDemoProduct} from '../lib/demo-catalog.mjs';
import {searchProducts} from '../lib/nook-voice.mjs';
import {buildCards} from '../public/home.js';
const source=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');

function fixture(){
  const valid=demoCatalog(catalog).find(p=>p.productType==='lipstick');
  const retired={...valid,id:'retired-preview',preview:{...valid.preview,available:false}};
  const raw=[valid,retired],effective=demoCatalog(raw);
  const saved=JSON.stringify({version:1,collections:[{id:'mixed-old',name:'Pink picks',ids:[retired.id,valid.id],selectedId:retired.id,productType:'lipstick'},{id:'retired-only',name:'Old picks',ids:[retired.id],productType:'lipstick'}]});
  const context={window:{localStorage:{getItem:()=>saved,setItem(){}},COUPANG_PRODUCTS:effective},console};
  vm.createContext(context);
  for(const name of ['mobile-call-state.js','product-discovery.js','cold-start.js','purchase-pairings.js'])vm.runInContext(source(name),context);
  return {valid,retired,raw,effective,window:context.window};
}

test('preview eligibility rejects missing recipes, invalid images/crops and unsampled lip colors',()=>{
  const {valid}=fixture();
  assert(isDemoProduct(valid));
  assert.equal(isDemoProduct({...valid,productType:"unsupported"}),false);
  for(const preview of [undefined,{...valid.preview,available:false},{...valid.preview,image:'https://example.com/photo.jpg'},{...valid.preview,kind:'object'},{...valid.preview,color:undefined},{...valid.preview,crop:{x:.8,y:0,width:.5,height:1}}])assert.equal(isDemoProduct({...valid,preview}),false);
  assert(isDemoProduct({...valid,preview:{kind:'lip',image:valid.image,finish:'clear-balm'}}));
  assert.equal(isDemoProduct({...valid,preview:{kind:'lip',image:valid.image,finish:'unknown'}}),false);
});

test('the browser artifact and server search share the same preview-ready source catalog',()=>{
  const browser={window:{}};vm.runInNewContext(source('coupang-products.js'),browser);
  const effective=demoCatalog(catalog);
  assert.deepEqual(JSON.parse(JSON.stringify(browser.window.COUPANG_PRODUCTS)),effective);
  for(const type of new Set(effective.map(p=>p.productType))){
    const results=searchProducts({query:type});
    assert(results.products.every(isDemoProduct));
    assert(results.products.every(p=>effective.some(e=>e.id===p.id)));
  }
  const unchanged=JSON.stringify(catalog);demoCatalog(catalog);assert.equal(JSON.stringify(catalog),unchanged,'eligibility never rewrites source evidence');
});

test('old saved collections and untrusted recommendation IDs cannot restore retired preview products',()=>{
  const {valid,retired,effective,window}=fixture();
  const discovery=new window.CoupiDiscovery(effective),store=new window.NookCallState(effective);
  assert.equal(discovery.collections.length,1);assert.deepEqual(Array.from(discovery.collections[0].ids),[valid.id]);
  discovery.restoreCollection('mixed-old');assert.equal(discovery.current.id,valid.id);
  assert.equal(discovery.toggleCompare(retired.id).ok,false);
  discovery.recommend([retired],{sourceOnly:true,productType:'lipstick'});assert.equal(discovery.total,0);
  store.recommend([retired,valid]);assert.deepEqual(Array.from(store.queue,p=>p.id),[valid.id]);
});

test('worlds, checkout pairings and Home only resolve products from the effective demo catalog',()=>{
  const {valid,retired,effective,window}=fixture();
  const worlds=window.CoupiPreferences.buildWorlds(effective,{completed:true,interests:['beauty_play'],vibe:'mixed'});
  assert(worlds.flatMap(w=>w.products).every(p=>p.id!==retired.id));
  const pairings=window.CoupiPairings.select(effective,[retired.id]);assert.equal(pairings.length,0);
  const cards=buildCards({catalog:effective,orders:[{id:'blocked',items:[retired.id],status:'out_for_delivery',eta:'2026-10-26T12:00'},{id:'good',items:[valid.id],status:'out_for_delivery',eta:'2026-10-26T12:00'}]},new Date(2026,9,26,8));
  assert.equal(cards.length,1);assert.equal(cards[0].product.id,valid.id);
});


test('every shopping category offers at least six preview-ready demo products',()=>{
  const products=demoCatalog(catalog);
  for(const type of ['lipstick','lipbalm','glasses','chair','lamp','tshirt','hoodie','sweater']){
    assert(products.filter(p=>p.productType===type).length>=6,type);
  }
});
