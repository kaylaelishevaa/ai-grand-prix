import test from 'node:test';
import assert from 'node:assert/strict';
import {worldTemplates} from '../data/world-templates';
import {getSku,reviewsForSku} from '../lib/catalog';
import {resolveSceneKind} from '../lib/scenes';

test('curated worlds have distinct room geometry and only inspectable catalog objects',()=>{
  assert.deepEqual(new Set(worldTemplates.map(t=>t.scene.kind)),new Set(['dressing','kitchen','desk','reading']));
  assert.equal(new Set(worldTemplates.map(t=>t.id)).size,worldTemplates.length);
  for(const template of worldTemplates){
    assert.equal(resolveSceneKind(template.scene),template.scene.kind);
    assert(template.scene.items.length>=2&&template.scene.items.length<=6);
    assert.equal(new Set(template.scene.items.map(item=>item.skuId)).size,template.scene.items.length);
    for(const item of template.scene.items){
      const sku=getSku(item.skuId);assert(sku);assert(!sku.sensitive&&!sku.ownedByDefault);
      assert.equal(item.oneLiner,sku.description);
      assert(reviewsForSku(sku.id).length>0,`${sku.id} must offer visible review evidence`);
    }
  }
});
