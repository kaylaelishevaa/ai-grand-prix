import test from 'node:test';
import assert from 'node:assert/strict';
import {worldTemplates} from '../data/world-templates';
import {getSku,reviewsForSku} from '../lib/catalog';
import {resolveSceneKind} from '../lib/scenes';
import {existsSync} from 'node:fs';
import {getReferenceProduct} from '../lib/reference-catalog';

test('curated worlds retain distinct contexts and only exact photo-backed product references',()=>{
  assert.deepEqual(new Set(worldTemplates.map(t=>t.scene.kind)),new Set(['dressing','kitchen','desk','reading']));
  assert.equal(new Set(worldTemplates.map(t=>t.id)).size,worldTemplates.length);
  for(const template of worldTemplates){
    assert.equal(resolveSceneKind(template.scene),template.scene.kind);
    assert(template.scene.items.length>=3&&template.scene.items.length<=6);
    assert.equal(new Set(template.scene.items.map(item=>item.skuId)).size,template.scene.items.length);
    for(const item of template.scene.items){
      const sku=getSku(item.skuId);assert(sku);assert(!sku.sensitive&&!sku.ownedByDefault);
      assert.equal(item.oneLiner,sku.description);
      assert.equal(sku.origin,'coupang-reference');assert.equal(sku.priceBasis,'historical-reference');
      const source=getReferenceProduct(sku.id);assert(source);assert.equal(sku.sourceUrl,source.url);
      assert(sku.image&&existsSync('public'+sku.image),`${sku.id} must have its actual listing photo`);
      assert.equal(sku.image,source.image);assert.deepEqual(sku.reviewIds,[]);assert.deepEqual(reviewsForSku(sku.id),[]);
      assert.equal(sku.facts.deliveryStatus,'unknown');
    }
  }
});


test('starter bundles stay relevant to each occasion and within their stated reference-price budgets',()=>{
  const expected:Record<string,{types:string[];budget:number;context:string}>={
    'before-the-date':{types:['tshirt','sweater','lipstick','glasses'],budget:150000,context:'home'},
    'dinner-under-lights':{types:['mugs','cushion','sweater'],budget:100000,context:'rooftop'},
    'slow-sunday':{types:['kettle','mugs','cushion'],budget:100000,context:'home'},
    'creative-corner':{types:['chair','lamp','mugs','cushion'],budget:200000,context:'studio'},
    'rainy-day-cafe':{types:['mugs','lamp','cushion','sweater'],budget:100000,context:'cafe'},
    'by-the-river':{types:['glasses','tshirt','mugs','cushion'],budget:100000,context:'riverside'},
  };
  assert.equal(worldTemplates.length,6);
  for(const template of worldTemplates){
    const skus=template.scene.items.map(item=>getSku(item.skuId)!);const rule=expected[template.id];assert(rule);
    assert.deepEqual(skus.map(sku=>sku.type),rule.types);
    assert(skus.reduce((sum,sku)=>sum+sku.price,0)<=rule.budget,`${template.id} reference total respects its stated budget`);
    assert.equal(template.scene.context?.setting,rule.context);
    assert.match(template.prompt,/photo-backed/);
  }
});
