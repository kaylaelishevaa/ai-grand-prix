import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog, getReview} from '../lib/catalog';
import {buildComparison, compareProducts, ComparisonError, selectContender} from '../lib/comparison';
import {applySwipe, createProfile, deleteMemory} from '../lib/profile';

test('comparison fit preserves a negative source even when the net taste tally is positive', () => {
  const now = new Date();
  let profile = createProfile('audit-negative-evidence', now);
  for (let i = 0; i < 3; i++) {
    profile = applySwipe(profile, {id: `like-${i}`, skuId: 'apron', action: 'ooh', source: 'audit deck'}, now);
  }
  profile = applySwipe(profile, {id: 'negative', skuId: 'apron', action: 'nah', reason: 'not my style', source: 'audit deck'}, now);
  assert(profile.traits['kitchen:vibe:warm-neutrals'] > 0);
  const fit = compareProducts(profile, 'apron', 'cottonApron').dimensions.find(d => d.key === 'fit')!;
  assert.match(fit.left, /Conflicts with:.*dislikes.*not my style/);
  assert(!fit.left.includes('Matches: “dislikes'));
});

test('forgetting a swap never lets its request ID silently succeed with a different choice', () => {
  const now = new Date();
  let profile = createProfile('audit-erased-replay', now);
  profile = selectContender(profile, {fromSkuId: 'apron', skuId: 'cottonApron', requestId: 'same', origin: 'scene'}, now).profile;
  profile = deleteMemory(profile, 'comparison-swap:same', now);
  profile = selectContender(profile, {fromSkuId: 'apron', skuId: 'compare-apron-1', requestId: 'later', origin: 'scene'}, now).profile;
  const before = structuredClone(profile);
  assert.throws(
    () => selectContender(profile, {fromSkuId: 'apron', skuId: 'compare-apron-1', requestId: 'same', origin: 'call'}, now),
    error => error instanceof ComparisonError && error.status === 409,
  );
  assert.deepEqual(profile, before);
});

test('durability shows the most helpful wash-related failure alongside positive use evidence', () => {
  const profile = createProfile('audit-use-evidence');
  const dimension = compareProducts(profile, 'blendingBrush', 'compare-powder-brush-1').dimensions.find(d => d.key === 'durability')!;
  const negativeId = 'compare-powder-brush-1-R04';
  const negative = getReview(negativeId)!;
  assert.equal(negative.stars, 1);
  assert(negative.helpful >= 200);
  assert.match(negative.text, /after the second wash/);
  assert(dimension.rightReviewIds.includes(negativeId));
  assert(dimension.right.includes(negative.text));
});

test('every fresh eligible product actually displays two or more earned same-purpose contenders', () => {
  const profile = createProfile('audit-visible-coverage');
  for (const sku of catalog.filter(item => !item.sensitive && !item.ownedByDefault)) {
    const comparison = buildComparison(profile, sku.id);
    assert(comparison.contenders.length >= 2, `${sku.id} needs visible alternatives, not only catalog siblings`);
    assert(comparison.contenders.length <= 4);
    assert(comparison.contenders.every(option => option.badge.kind !== 'your-choice'));
  }
});
