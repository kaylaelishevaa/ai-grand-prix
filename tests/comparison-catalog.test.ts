import test from 'node:test';
import assert from 'node:assert/strict';
import originalCatalog from '../data/catalog.json';
import originalReviews from '../data/reviews.json';
import comparisonCatalog from '../data/comparison-catalog.json';
import comparisonReviews from '../data/comparison-reviews.json';
import { catalog, syntheticCatalog, reviews, getSku, getReview, reviewsForSku, comparisonCandidatesForSku, reviewStats } from '../lib/catalog';
import { comparisonGroupForSku, samePurpose } from '../lib/comparison-groups';
import type { SKU } from '../lib/types';

test('checked-in contenders extend the catalog without changing a single original record', () => {
  assert.equal(comparisonCatalog.length, 44);
  assert.equal(comparisonReviews.length, 704);
  assert.equal(syntheticCatalog.length, 87);
  assert.equal(catalog.length, 104);
  assert.equal(reviews.length, 1202);
  for (const original of originalCatalog) assert.deepEqual(getSku(original.id), original);
  for (const original of originalReviews) assert.deepEqual(getReview(original.id), original);
  assert.equal(new Set(catalog.map(sku => sku.id)).size, catalog.length);
  assert.equal(new Set(reviews.map(review => review.id)).size, reviews.length);
});

test('every eligible synthetic SKU has at least two actual substitutes, not unrelated category fillers', () => {
  for (const sku of syntheticCatalog.filter(item => !item.sensitive && !item.ownedByDefault)) {
    const candidates = comparisonCandidatesForSku(sku.id);
    assert(candidates.length >= 2, `${sku.id} needs two substitutes`);
    assert(candidates.length <= 3, `${sku.id} has a deliberately compact contender set`);
    assert(candidates.every(other => other.id !== sku.id && samePurpose(sku, other)));
  }
  for (const [left, right] of [
    ['roseLipstick', 'blendingBrush'], ['softCompact', 'roseLipstick'],
    ['greens', 'mushrooms'], ['greens', 'milk'], ['tofu', 'mushrooms'],
    ['cushion', 'cushionCover'], ['dateDress', 'eveningBlouse'],
  ]) assert(!samePurpose(getSku(left)!, getSku(right)!), `${left} is not a substitute for ${right}`);
  assert(samePurpose(getSku('lamp')!, getSku('rattan')!));
  assert(samePurpose(getSku('mugs')!, getSku('glass')!));
  assert.deepEqual(comparisonCandidatesForSku('detergent'), []);
  assert.deepEqual(comparisonCandidatesForSku('skinCream'), []);
  assert.deepEqual(comparisonCandidatesForSku('missing'), []);
  assert.deepEqual(comparisonCandidatesForSku('roseLipstick', [getSku('blendingBrush')!]), []);
});

test('unknown product types cannot accidentally join an existing functional group', () => {
  const unknown = { ...getSku('mushrooms')!, id: 'another-green-thing', facts: {} };
  assert.equal(comparisonGroupForSku(unknown), 'unmatched:another-green-thing');
  assert(!samePurpose(unknown, getSku('greens')!));
  assert(!samePurpose(unknown, getSku('mushrooms')!));
});

test('each synthetic contender has explicit useful facts and its own complete review corpus', () => {
  for (const raw of comparisonCatalog) {
    const sku = raw as unknown as SKU;
    assert.match(String(sku.facts.dataOrigin), /Synthetic demo.*not a verified merchant/);
    assert.equal(typeof sku.facts.comparisonGroup, 'string');
    assert(Object.keys(sku.facts).length >= 5);
    assert(sku.price > 0);
    const band = sku.price < 10000 ? 'under-10k' : sku.price < 30000 ? 'under-30k' : sku.price < 70000 ? 'under-70k' : 'premium';
    assert.equal(sku.priceBand, band);
    const corpus = reviewsForSku(sku.id);
    assert.equal(corpus.length, 16);
    assert.deepEqual(sku.reviewIds, corpus.map(review => review.id));
    assert(corpus.filter(review => review.stars === 5).length >= 12);
    assert.equal(corpus.filter(review => review.stars === 1).length, 2);
    assert(corpus.filter(review => review.stars === 3 || review.stars === 4).length <= 2);
    assert(corpus.filter(review => review.text.length > 180).length >= 4);
    assert(corpus.some(review => review.stars === 1 && review.helpful >= 200 && review.photo));
    assert(corpus.filter(review => review.tags.includes('delivery')).length >= 4);
    assert(corpus.some(review => review.tags.includes('unopened') && review.relevant === false));
    for (const review of corpus) {
      const postedDay = Number(review.date.slice(-2));
      for (const match of review.text.matchAll(/October (\d{1,2})/g)) {
        assert(Number(match[1]) <= postedDay, `${review.id} cannot describe future use`);
      }
    }
  }
  assert(comparisonCatalog.some(sku => sku.delivery.includes('in 3 days')));
  assert(comparisonCatalog.some(sku => sku.delivery === 'Rocket delivery · tomorrow by 7am'));
});

test('seeded dissent math and exact pilling evidence remain unchanged', () => {
  assert.equal(reviewStats('socksBudget').count, 17);
  assert.equal(reviewStats('socksBudget').tagCounts.pilling, 2);
  assert.equal(reviewStats('socksBudget').tagPercentages.pilling, 12);
  assert.deepEqual(reviews.filter(review => review.tags.includes('pilling')).map(review => review.id), ['B04', 'B14']);
  assert.equal(reviewStats('kettle').count, 16);
  assert.equal(reviewStats('kettle').tagCounts['loose-lid'], 2);
  assert.equal(reviewStats('kettle').tagPercentages['loose-lid'], 13);
});
