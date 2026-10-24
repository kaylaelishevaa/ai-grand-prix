import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, syntheticCatalog, reviews, getSku, reviewStats, reviewsForSku } from '../lib/catalog';
import { applySwipe, createProfile, deleteMemory, eligibleCatalog, installMemoryLines, markQuestionAnswered, sanitizeProfileForAI, scoreSku } from '../lib/profile';
import { addDecision, approveDecisions, detectOwnedRequest, effectiveNow, isDecisionLocked, localClock, lockUntilMorning, ownedMessage } from '../lib/guardrails';
import originalCatalog from '../data/catalog.json';
import originalReviews from '../data/reviews.json';
import comparisonCatalog from '../data/comparison-catalog.json';
import comparisonReviews from '../data/comparison-reviews.json';

const morning = new Date('2026-10-24T01:00:00.000Z'); // 10 AM Seoul.
function swipe(id: string, skuId: string, action: 'ooh' | 'skip' | 'nah', reason?: 'too pricey' | 'not my style' | 'have one') {
  return { id, skuId, action, reason, source: 'bus deck' };
}

test('catalog owns all original review IDs; exact complaint math remains visible', () => {
  assert.equal(originalCatalog.length, 43);
  assert.equal(originalReviews.length, 498);
  assert.equal(syntheticCatalog.length, originalCatalog.length + comparisonCatalog.length);
  assert.equal(catalog.length, syntheticCatalog.length + 17);
  assert.equal(reviews.length, originalReviews.length + comparisonReviews.length);
  assert.deepEqual(catalog.slice(0, originalCatalog.length), originalCatalog);
  assert.deepEqual(reviews.slice(0, originalReviews.length), originalReviews);
  assert.equal(new Set(reviews.map((review) => review.id)).size, reviews.length);
  for (const review of reviews) assert(getSku(review.skuId)?.reviewIds.includes(review.id));
  for (const sku of catalog) assert.deepEqual(sku.reviewIds, reviewsForSku(sku.id).map((review) => review.id));
  assert.equal(reviewStats('socksBudget').count, 17);
  assert.equal(reviewStats('socksBudget').tagCounts.pilling, 2);
  assert.equal(reviewStats('socksBudget').tagPercentages.pilling, 12);
  assert.equal(reviewStats('kettle').count, 16);
  assert.equal(reviewStats('kettle').tagCounts['loose-lid'], 2);
  assert.equal(reviewStats('kettle').tagPercentages['loose-lid'], 13);
  assert.deepEqual(reviews.filter((review) => review.tags.includes('pilling')).map((review) => review.id), ['B04', 'B14']);
});

test('curated-world essentials each have a complete visible review corpus', () => {
  for (const id of ['matcha', 'organizer', 'smallLamp', 'smallVase', 'rattan', 'cushion', 'smallCandle', 'cushionCover']) {
    const corpus = reviewsForSku(id);
    assert.equal(corpus.length, 16, `${id} has sixteen seeded reviews`);
    assert.equal(corpus.filter(review => review.stars === 5).length, 12);
    assert.equal(corpus.filter(review => review.stars === 1).length, 2);
    assert.equal(corpus.filter(review => review.stars === 3).length, 1);
    assert.equal(corpus.filter(review => review.stars === 4).length, 1);
    assert(corpus.some(review => review.stars === 1 && review.helpful >= 200 && review.photo));
    assert(corpus.filter(review => review.text.length > 180).length >= 4);
    assert(corpus.filter(review => review.tags.includes('delivery')).length >= 4);
    assert(corpus.some(review => review.tags.includes('unopened') && !review.relevant));
  }
});

test('swipe learning is idempotent and reason-specific instead of invented preference inference', () => {
  const initial = createProfile('test', morning);
  const liked = applySwipe(initial, swipe('like', 'apron', 'ooh'), morning);
  assert.equal(initial.swipes.length, 0);
  assert.equal(liked.xp, 10);
  assert(liked.traits['kitchen:vibe:warm-neutrals'] > 0);
  const duplicate = applySwipe(liked, swipe('like', 'apron', 'ooh'), morning);
  assert.equal(duplicate.xp, 10);
  assert.equal(duplicate.swipes.length, 1);
  const pricey = applySwipe(liked, swipe('price', 'lamp', 'nah', 'too pricey'), morning);
  assert.equal(pricey.traits['home:vibe:quiet-evenings'], undefined);
  assert(pricey.traits['home:priceBand:under-70k'] < 0);
  assert(pricey.traits['home:priceBand:under-30k'] > 0);
  const style = applySwipe(pricey, swipe('style', 'vase', 'nah', 'not my style'), morning);
  assert(style.traits['home:vibe:minimal'] < 0);
  assert.equal(style.traits['home:priceBand:under-70k'], pricey.traits['home:priceBand:under-70k']);
  const skipped = applySwipe(createProfile('skip', morning), swipe('skip', 'matcha', 'skip'), morning);
  assert(skipped.traits['kitchen:vibe:tea-ritual'] < 0);
  assert.equal(skipped.traits['kitchen:vibe:coffee-ritual'], undefined);
});

test('deleting memory removes its underlying evidence from the next AI input and ranking', () => {
  let profile = createProfile('erase', morning);
  for (let i = 0; i < 6; i++) profile = applySwipe(profile, swipe(`six-${i}`, 'apron', 'ooh'), morning);
  const key = 'kitchen:vibe:warm-neutrals';
  profile = installMemoryLines(profile, [{ text: 'Prefers warm neutrals', traitKeys: [key] }], 'from 6 swipes, bus deck', 'batch-6', morning);
  assert.equal(profile.summarizedSwipeCount, 6);
  const before = JSON.stringify(sanitizeProfileForAI(profile));
  const scoreBefore = scoreSku(profile, getSku('apron')!);
  const erased = deleteMemory(profile, profile.memoryLines.find(line=>line.text==='Prefers warm neutrals')!.id, morning);
  const after = sanitizeProfileForAI(erased);
  assert.equal(erased.memoryLines.length, 0);
  assert.equal(erased.traits[key], undefined);
  assert(erased.swipes.every((event) => !(key in event.contributions)));
  assert(!JSON.stringify(after).includes('Prefers warm neutrals'));
  assert.notEqual(JSON.stringify(after), before);
  assert(scoreSku(erased, getSku('apron')!) < scoreBefore);
  assert.throws(() => installMemoryLines(erased, [{ text: 'Prefers warm neutrals', traitKeys: [key] }], 'old evidence', 'bad'), /unknown, forgotten/);
  const relearned = applySwipe(erased, swipe('new-evidence', 'apron', 'ooh'), morning);
  assert.equal(relearned.traits[key], 2);
  assert(!relearned.forgottenTraitKeys.includes(key));
});

test('quarantine excludes both products and inferred traits from scenes, Today and model context', () => {
  const profile = createProfile('privacy', morning);
  profile.traits['personal-care:vibe:gentle'] = 8;
  profile.traits['category:personal-care'] = 4;
  profile.memoryLines = [{ id: 'sensitive', text: 'Sensitive personal care preference', traitKeys: ['personal-care:vibe:gentle'], source: 'seeded', batchId: 'sensitive', confidence: 0.9, createdAt: morning.toISOString() }];
  for (const mode of ['scene', 'today', 'ask'] as const) assert(!eligibleCatalog(profile, mode).some((sku) => sku.id === 'skinCream'));
  const safe = sanitizeProfileForAI(profile);
  assert(!JSON.stringify(safe).includes('personal-care'));
  assert.equal(safe.memoryLines.length, 0);
  assert.throws(() => applySwipe(profile, swipe('bad', 'skinCream', 'ooh')), /quarantined/);
  assert(addDecision(profile, 'skinCream', 'photo scan', morning).blocked);
});

test('owned detergent is blocked before an inference; approved goods and have-one share the guard', () => {
  const profile = createProfile('owned', morning);
  assert.equal(detectOwnedRequest(profile, 'Please buy laundry detergent')?.skuId, 'detergent');
  assert.equal(detectOwnedRequest(profile, '세제 사줘')?.skuId, 'detergent');
  assert.equal(detectOwnedRequest(profile, 'something', 'detergent')?.skuId, 'detergent');
  assert.match(ownedMessage(profile, 'detergent', morning), /3 weeks ago/);
  assert(addDecision(profile, 'detergent', 'ask', morning).blocked);
  assert.equal(profile.decisions.length, 0);
  const mine = applySwipe(profile, swipe('have', 'lamp', 'nah', 'have one'), morning);
  assert(addDecision(mine, 'lamp', 'stroll', morning).blocked);
  assert.equal(Object.keys(mine.traits).length, 0);
});

test('sleep-on-it boundaries use local time with an exclusive 7 AM unlock', () => {
  const profile = createProfile('clock', morning);
  assert.equal(lockUntilMorning(profile, new Date('2026-10-24T12:59:59Z')), null); // 21:59 Seoul.
  assert.equal(lockUntilMorning(profile, new Date('2026-10-24T13:00:00Z')), '2026-10-24T22:00:00.000Z');
  assert.equal(lockUntilMorning(profile, new Date('2026-10-24T21:59:59Z')), '2026-10-24T22:00:00.000Z');
  assert.equal(lockUntilMorning(profile, new Date('2026-10-24T22:00:00Z')), null);
  const added = addDecision(profile, 'kettle', 'ask', new Date('2026-10-24T13:00:00Z'));
  assert(added.decision);
  const blocked = approveDecisions(added.profile, [added.decision.id], new Date('2026-10-24T21:59:59Z'));
  assert.equal(blocked.approved.length, 0);
  assert(blocked.blocked.length);
  const morningApproval = approveDecisions(added.profile, [added.decision.id], new Date('2026-10-24T22:00:00Z'));
  assert.equal(morningApproval.approved.length, 1);
  assert.equal(morningApproval.profile.xp, profile.xp);
  assert(morningApproval.profile.owned.some((owned) => owned.skuId === 'kettle'));
  assert(addDecision(morningApproval.profile, 'kettle', 'ask', morning).blocked);
});

test('night lock follows daylight saving offsets across the next-morning boundary', () => {
  const profile = createProfile('dst', morning); profile.timezone = 'America/New_York';
  // Spring: March 7, 22:00 EST -> March 8, 07:00 EDT (8 elapsed hours).
  assert.equal(lockUntilMorning(profile, new Date('2026-03-08T03:00:00Z')), '2026-03-08T11:00:00.000Z');
  // Fall: Oct 31, 22:00 EDT -> Nov 1, 07:00 EST (10 elapsed hours).
  assert.equal(lockUntilMorning(profile, new Date('2026-11-01T02:00:00Z')), '2026-11-01T12:00:00.000Z');
});

test('pretend 2 AM remains locked even during real afternoon; turning the dev clock off restores real time', () => {
  const profile = createProfile('devclock', morning); profile.pretend2am = true;
  assert.equal(localClock(effectiveNow(profile, morning), profile.timezone).hour, 2);
  const added = addDecision(profile, 'tray', 'stroll', morning);
  assert(added.decision && isDecisionLocked(added.profile, added.decision, morning));
  assert.equal(approveDecisions(added.profile, [added.decision.id], morning).approved.length, 0);
  const normalTime = { ...added.profile, pretend2am: false };
  assert.equal(approveDecisions(normalTime, [added.decision.id], morning).approved.length, 1);
});

test('only swipes and completed questions give XP; duplicate questions, additions and approvals do not', () => {
  const initial = createProfile('xp', morning);
  const afterQuestion = markQuestionAnswered(initial, 'question-1', morning);
  assert.equal(afterQuestion.xp, 5);
  assert.equal(markQuestionAnswered(afterQuestion, 'question-1', morning).xp, 5);
  const added = addDecision(afterQuestion, 'mugs', 'ask', morning);
  assert(added.decision);
  assert.equal(added.profile.xp, 5);
  const approved = approveDecisions(added.profile, [added.decision.id], morning);
  assert.equal(approved.profile.xp, 5);
  assert.equal(approveDecisions(approved.profile, [added.decision.id], morning).profile.xp, 5);
});
