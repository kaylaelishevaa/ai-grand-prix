import test from 'node:test';
import assert from 'node:assert/strict';
import originalCatalog from '../data/catalog.json';
import comparisonCatalog from '../data/comparison-catalog.json';
import legacyReferences from '../data/teammate-catalog.json';
import latestReferences from '../data/verified-catalog.json';
import sceneReferences from '../data/scene-reference-catalog.json';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {catalog,syntheticCatalog,getSku,reviews,reviewsForSku,comparisonCandidatesForSku,reviewStats} from '../lib/catalog';
import {adaptReferenceProduct,getReferenceProduct,pricedReferenceSkus,referenceProducts} from '../lib/reference-catalog';
import {samePurpose} from '../lib/comparison-groups';
import {buildComparison,compareProducts,selectContender} from '../lib/comparison';
import {createProfile,eligibleCatalog} from '../lib/profile';
import {addDecision} from '../lib/guardrails';
import {actOnCommerce,quoteCheckout} from '../lib/server/commerce';
import {validateWorld} from '../lib/server/world';
import {fixtureBlueprint} from './fixtures/blueprint';
import type {AccountState} from '../lib/account-types';
import type {CheckoutInput} from '../lib/commerce-types';
import {AppError} from '../lib/server/errors';

const now=new Date('2026-10-25T05:00:00Z');
function checkoutFixture(skuId:string){
  let profile=createProfile('reference-order',now);profile=addDecision(profile,skuId,'from your call',now).profile;
  const account:AccountState={id:'reference-household',version:1,members:[{profileId:profile.id,label:'Sample member'}],addresses:[{id:'home',label:'Sample home',line:'Sample address',postcode:'00000',area:'Demo area',dawnEligible:true,sample:true}],payments:[{id:'mock',label:'CoopyPay mock',last4:'0007',sample:true}],defaultAddressId:'home',defaultPaymentId:'mock',wowMember:true,householdBudget:150000,notifications:{dailyLimit:0,quietHours:true},licenses:{[profile.id]:{}},permissionLog:[],updatedAt:now.toISOString()};
  const input:CheckoutInput={decisionIds:profile.decisions.map(item=>item.id),addressId:'home',paymentMethodId:'mock',deliveryKind:'standard',deliveryInstruction:'Sample doorstep'};
  return{profile,account,input};
}
const errorCode=(code:string)=>(error:unknown)=>error instanceof AppError&&error.code===code;

test('priced source records preserve exact IDs and historical evidence without mutating synthetic data',()=>{
  assert.equal(referenceProducts.length,new Set([...legacyReferences,...latestReferences,...sceneReferences].map(product=>product.id)).size);assert.equal(pricedReferenceSkus.length,referenceProducts.filter(product=>product.price!==null).length);
  assert.equal(catalog.length,syntheticCatalog.length+pricedReferenceSkus.length);assert.deepEqual(syntheticCatalog,[...originalCatalog,...comparisonCatalog]);
  assert.equal(reviews.length,1202);
  for(const raw of referenceProducts){
    assert.equal(getReferenceProduct(raw.id),raw);
    const sku=getSku(raw.id);
    if(raw.price===null){assert.equal(sku,undefined);continue;}
    assert(sku);assert.equal(sku.id,raw.id);assert.equal(sku.price,raw.price);
    assert.equal(sku.origin,'coupang-reference');assert.equal(sku.priceBasis,'historical-reference');
    assert.equal(sku.sourceUrl,raw.url);assert.equal(sku.sourceNote,raw.sourceNote);assert.equal(sku.checkedAt,raw.checkedAt);assert.equal(sku.image,raw.image);
    assert.deepEqual(sku.palette,[]);assert.deepEqual(sku.vibeTags,[]);assert.equal(sku.color,undefined);
    assert.deepEqual(sku.reviewIds,[]);assert.deepEqual(reviewsForSku(sku.id),[]);assert.equal(reviewStats(sku.id).average,null);
    assert.equal(sku.facts.deliveryStatus,'unknown');assert.equal(sku.facts.stockStatus,'unverified');assert.match(sku.delivery,/unknown/);
    for(const [index,attribute] of raw.verifiedAttributes.entries())assert.equal(sku.facts['listingAttribute'+(index+1)],attribute);
    for(const invented of ['deliveryHours','capacityCups','lifespan','durabilityScore','pricePerWearAt30Uses'])assert.equal(sku.facts[invented],undefined);
  }
});

test('missing and invalid prices cannot turn into a free product or guessed numeric-ID checkout',()=>{
  const raw=referenceProducts.find(product=>product.price!==null)!;
  for(const price of [null,0,-1,NaN,Infinity,10.5])assert.equal(adaptReferenceProduct({...raw,price}),null);
  assert.equal(adaptReferenceProduct({...raw,priceStatus:'unverified'}),null);
  const missing={...raw,id:'unpriced-test-listing',price:null};
  assert.equal(adaptReferenceProduct(missing),null);assert.equal(getSku(missing.id),undefined);
  assert(!eligibleCatalog(createProfile('unknown-price',now)).some(item=>item.id===missing.id));
  for(const skuId of [missing.id,'99999999999']){
    const {profile,account,input}=checkoutFixture(skuId);assert.equal(profile.decisions.length,0);
    const decision={id:'forged',skuId,source:'forged',addedAt:now.toISOString(),lockedUntil:null,approvedAt:null};
    profile.decisions.push(decision);input.decisionIds=[decision.id];
    assert.throws(()=>quoteCheckout(profile,account,input,now),errorCode('CHECKOUT_EXCLUDED'));
  }
});

test('source comparisons use only same-purpose sourced products and do not award unknown delivery or reviews',()=>{
  const profile=createProfile('reference-comparison',now);
  for(const sku of pricedReferenceSkus){
    const candidates=comparisonCandidatesForSku(sku.id);
    assert(candidates.every(other=>other.origin==='coupang-reference'&&samePurpose(sku,other)));
    const result=buildComparison(profile,sku.id);
    assert.equal(result.contenders.length,Math.min(4,candidates.length));
    for(const option of [result.main,...result.contenders]){
      assert(!['fastest','most-loved','best-value'].includes(option.badge.kind));
      assert.deepEqual(option.badge.reviewIds,[]);assert.equal(option.reviewSummary.count,0);assert.equal(option.reviewSummary.average,null);
    }
  }
  const lipstick=getSku('1814412512')!;
  assert.equal(comparisonCandidatesForSku(lipstick.id).length,pricedReferenceSkus.filter(sku=>sku.type==='lipstick').length-1);
  assert(!samePurpose(lipstick,getSku('roseLipstick')!));
  assert.throws(()=>compareProducts(profile,lipstick.id,'roseLipstick'),/same job/);
  assert(!samePurpose(getSku('7612276799')!,getSku('8561267958')!),'Eyeglasses and sunglasses are not silently interchangeable');
  const compared=compareProducts(profile,lipstick.id,'7322824636');
  assert.match(compared.dimensions.find(item=>item.key==='price')!.note,/Historical reference/);
  assert.doesNotMatch(compared.dimensions.find(item=>item.key==='delivery')!.note,/tied|Same listed delivery/);
  assert.match(compared.dimensions.find(item=>item.key==='quality')!.note,/Synthetic reviews are never assigned/);
  const selected=selectContender(profile,{fromSkuId:lipstick.id,skuId:'7322824636',origin:'scene',requestId:'source-choice'},now);
  assert.equal(selected.verdict.pickSkuId,'7322824636');assert.deepEqual(selected.verdict.citations,[]);
  assert.match(selected.verdict.reason,/historical reference price/);assert.match(selected.verdict.dissent,/unverified/);
});

test('a generated world accepts original sourced IDs without replacing them with fictional lookalikes',()=>{
  const ids=['1814412512','9474375760'];
  const scene={name:'Getting ready',explanation:'A sourced lipstick and T-shirt, without a promised fit.',sourceMemoryIds:['memory-1'],items:ids.map(skuId=>({skuId,oneLiner:getSku(skuId)!.description})),blueprint:fixtureBlueprint(ids)};
  const result=validateWorld({districts:[scene]},eligibleCatalog(createProfile('reference-world',now)),[{id:'memory-1',text:'I want a lipstick and T-shirt for getting ready.'}],{min:1,max:1},150000);
  assert.deepEqual(result.districts[0].items.map(item=>item.skuId),ids);
  assert(result.districts[0].items.every(item=>getSku(item.skuId)!.origin==='coupang-reference'));
});

test('one exact sourced SKU survives proposal, quote, approval and receipt with unknown delivery and historical price provenance',()=>{
  const raw=getReferenceProduct('1814412512')!,{profile,account,input}=checkoutFixture(raw.id);
  assert.equal(profile.decisions[0].skuId,raw.id);
  assert.throws(()=>quoteCheckout(profile,account,{...input,deliveryKind:'rocket'},now),errorCode('DELIVERY_NOT_ELIGIBLE'));
  assert.throws(()=>quoteCheckout(profile,account,{...input,deliveryKind:'dawn'},now),errorCode('DELIVERY_NOT_ELIGIBLE'));
  const quote=quoteCheckout(profile,account,input,now),line=quote.lines[0];
  assert.equal(line.skuId,raw.id);assert.equal(line.catalogPrice,raw.price);assert.equal(line.unitPrice,raw.price);
  assert.equal(line.origin,'coupang-reference');assert.equal(line.priceBasis,'historical-reference');assert.equal(line.sourceUrl,raw.url);assert.equal(line.sourceNote,raw.sourceNote);assert.equal(line.checkedAt,raw.checkedAt);
  assert.equal(quote.delivery.promisedAt,null);assert.match(quote.delivery.label,/unknown.*simulation/);assert.match(quote.delivery.basis,/without a delivery promise/);
  const action={action:'checkout' as const,...input,quoteId:quote.id,requestId:'reference-confirm'};
  const result=actOnCommerce(profile,account,action,now);
  assert.equal(result.order!.simulation,true);assert.deepEqual(result.order!.lines,quote.lines);
  assert(result.profile.owned.some(item=>item.skuId===raw.id));assert.equal(result.profile.xp,profile.xp);
  assert.equal(actOnCommerce(result.profile,account,action,now).order!.id,result.order!.id);
  assert.match(addDecision(result.profile,raw.id,'another call',now).blocked||'',/already|bought/i);
});


test('approved camera catalog owns overlaps while world-only sources retain evidence without preview promises',()=>{
  assert.deepEqual(referenceProducts.slice(0,legacyReferences.length).map(product=>product.id),legacyReferences.map(product=>product.id));
  assert.equal(new Set(referenceProducts.map(product=>product.id)).size,referenceProducts.length);
  for(const product of [...latestReferences,...sceneReferences]){
    const approved=legacyReferences.find(row=>row.id===product.id),expected=approved||product,actual=getReferenceProduct(product.id)!;
    if(approved)assert.deepEqual(actual,approved);
    else{assert.deepEqual({...actual,preview:product.preview},product);assert.equal(actual.preview.available,false);}
    const sku=getSku(product.id)!;assert(sku);assert.equal(sku.image,expected.image);assert.equal(sku.price,expected.price);
    assert.equal(createHash('sha256').update(readFileSync('public'+expected.image)).digest('hex'),expected.imageSha256);
    assert.deepEqual(sku.reviewIds,[]);assert.deepEqual(reviewsForSku(product.id),[]);
    assert.equal(sku.facts.deliveryStatus,'unknown');assert.equal(sku.facts.stockStatus,'unverified');
  }
});

test('all approved source variants adapt without changing IDs, product details or review evidence',()=>{
  assert.equal(legacyReferences.length,68);
  for(const source of legacyReferences){
    const actual=getReferenceProduct(source.id)!,sku=getSku(source.id)!;
    assert.deepEqual(actual,source);assert(sku);assert.equal(sku.id,source.id);assert.equal(sku.name,source.name);assert.equal(sku.type,source.productType);
    assert.equal(sku.sourceUrl,source.url);assert.equal(sku.image,source.image);assert.deepEqual(actual.reviewEvidence,source.reviewEvidence);
    assert.notEqual(actual.preview.available,false);assert.deepEqual(sku.reviewIds,[]);assert.deepEqual(reviewsForSku(source.id),[]);
  }
  for(const type of ['lipbalm','sweater']){
    const selected=pricedReferenceSkus.find(sku=>sku.type===type)!;assert(selected);
    const candidates=comparisonCandidatesForSku(selected.id);assert(candidates.length>0);assert(candidates.every(sku=>sku.type===type));
  }
});
