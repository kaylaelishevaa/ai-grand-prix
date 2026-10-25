import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getSku, reviewsForSku } from '../lib/catalog';
import { createProfile, eligibleCatalog } from '../lib/profile';
import { createProductMeshLibrary } from '../components/diorama/product-meshes';
import { productArt } from '../components/art';

const dressingProducts = {
  dateDress: 'dress-fabric',
  eveningBlouse: 'blouse-fabric',
  littleHandbag: 'handbag-strap',
  roseLipstick: 'lipstick-bullet',
  softCompact: 'compact-mirror',
  eveningPerfume: 'perfume-bottle',
  smallHoops: 'earring-hoop-1',
  blendingBrush: 'brush-bristles',
};

test('dressing products are explicit wardrobe/beauty context, with a complete outfit under the cap', () => {
  const available = eligibleCatalog(createProfile('date-catalog')).map(sku => sku.id);
  for (const id of Object.keys(dressingProducts)) {
    const sku = getSku(id)!;
    assert(sku, `${id} is available to the real scene service`);
    assert(['wardrobe', 'beauty'].includes(sku.category));
    assert(sku.vibeTags.includes('date-night'));
    assert.equal(sku.sensitive, undefined);
    assert(available.includes(id), `${id} is eligible without opening the sensitive quarantine`);
    assert.match(String(sku.facts.dataOrigin), /synthetic/);
    assert.match(sku.delivery, /simulation/);
    assert.match(productArt(sku.type, sku.color), new RegExp(`Illustration of ${sku.type}`));
  }
  const complete = ['dateDress', 'littleHandbag', 'roseLipstick', 'softCompact', 'smallHoops', 'blendingBrush'];
  assert.equal(complete.reduce((sum, id) => sum + getSku(id)!.price, 0), 115400);
});

test('each dressing SKU has a visible J-shaped corpus, including specific negative evidence', () => {
  for (const id of Object.keys(dressingProducts)) {
    const sku = getSku(id)!;
    const corpus = reviewsForSku(id);
    assert.equal(corpus.length, 16);
    assert.deepEqual(sku.reviewIds, corpus.map(review => review.id));
    assert.equal(corpus.filter(review => review.stars === 5).length, 12);
    assert.equal(corpus.filter(review => review.stars === 1).length, 2);
    assert.equal(corpus.filter(review => review.stars === 3).length, 1);
    assert.equal(corpus.filter(review => review.stars === 4).length, 1);
    assert(corpus.some(review => review.stars === 1 && review.helpful >= 200 && review.photo));
    assert(corpus.filter(review => review.text.length > 180).length >= 3);
    assert(corpus.filter(review => review.tags.includes('delivery')).length >= 4);
    assert(corpus.some(review => review.tags.includes('unopened') && !review.relevant));
    assert(corpus.every(review => review.skuId === id && sku.reviewIds.includes(review.id)));
  }
});

test('closet and vanity objects are distinct volumetric meshes with pooled GPU resources', () => {
  const resources = new Set<{ dispose(): void }>();
  const models = createProductMeshLibrary(resource => { resources.add(resource); return resource; });
  const buildAll = () => {
    for (const [id, feature] of Object.entries(dressingProducts)) {
      const sku = getSku(id)!;
      const model = models.build({ skuId: sku.id, type: sku.type, name: sku.name, color: sku.color });
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      assert(size.x > .1 && size.y > .1 && size.z > .02, `${id} has volume`);
      assert(model.getObjectByName(feature), `${id} includes its recognizable product feature`);
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const vertices = object.geometry.getAttribute('position');
        for (const coordinate of vertices.array) assert(Number.isFinite(coordinate), `${id} has finite vertices`);
      });
    }
  };
  try {
    buildAll();
    const warmResourceCount = resources.size;
    buildAll();
    assert.equal(resources.size, warmResourceCount, 'regeneration reuses all shared geometries and materials');
  } finally {
    resources.forEach(resource => resource.dispose());
  }
});
