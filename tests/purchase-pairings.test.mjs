import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import catalog from '../data/catalog.json' with {type:'json'};
const context={window:{}};vm.runInNewContext(readFileSync(new URL('../public/purchase-pairings.js',import.meta.url),'utf8'),context);
const select=(...args)=>Array.from(context.window.CoupiPairings.select(...args));
test('pairings are trusted complementary products, never bought items or another purchase of the same type',()=>{
  for(const type of ['lipstick','lipbalm','glasses','tshirt','hoodie','sweater','chair','lamp']){
    const bought=catalog.find(p=>p.productType===type),picks=select(catalog,[bought.id]);
    assert(picks.length>0&&picks.length<=3);assert.equal(new Set(picks.map(p=>p.id)).size,picks.length);
    for(const p of picks){assert(catalog.includes(p));assert.notEqual(p.id,bought.id);assert.notEqual(p.productType,type);}
  }
});
test('chair/lamp bundle does not re-sell already purchased categories and empty/unknown receipts have no suggestions',()=>{
  const ids=['chair','lamp'].map(type=>catalog.find(p=>p.productType===type).id);
  assert.equal(select(catalog,ids).length,0);assert.equal(select(catalog,[]).length,0);assert.equal(select(catalog,['unknown']).length,0);
});
test('pairings honor budgets and excluded product types rather than inventing a fallback',()=>{
  const lipstick=catalog.find(p=>p.productType==='lipstick');
  const picks=select(catalog,[lipstick.id],{maxPrice:10000,excludedTypes:['glasses']});
  assert(picks.length>0);assert(picks.every(p=>p.price<=10000&&p.productType==='lipbalm'));
  assert.equal(select(catalog,[lipstick.id],{maxPrice:1}).length,0);
});
