import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {getSku} from '../lib/catalog';
import {createProfile} from '../lib/profile';
import {addDecision} from '../lib/guardrails';
import {buildComparison} from '../lib/comparison';
import type {MemoryLine} from '../lib/types';
import type {OrderLine} from '../lib/commerce-types';

// CSS is bundled by Next in the browser; these tests execute the actual React rendering and policy helpers.
const require=createRequire(import.meta.url),styleLoader=require.extensions['.css'];
require.extensions['.css']=()=>{};
const commerce=require('../components/CommercePages.tsx') as typeof import('../components/CommercePages');
const comparison=require('../components/VerdictComparison.tsx') as typeof import('../components/VerdictComparison');
const evidence=require('../components/ProductEvidence.tsx') as typeof import('../components/ProductEvidence');
if(styleLoader)require.extensions['.css']=styleLoader;else delete require.extensions['.css'];

const now=new Date('2026-10-25T05:00:00Z');
function selection(ids:string[]){let profile=createProfile('reference-ui',now);for(const skuId of ids)profile=addDecision(profile,skuId,'test',now).profile;return {profile,ids:profile.decisions.map(item=>item.id)};}

test('checkout UI defaults unknown sourced or mixed deliveries to the non-promising option',()=>{
  for(const skus of [['1814412512'],['1814412512','mugs'],['55518713']]){
    const {profile,ids}=selection(skus),delivery=commerce.checkoutDeliveryChoices(profile,ids);
    assert.deepEqual(delivery,{unknown:true,rocket:false,dawn:false,defaultKind:'standard'});
  }
  const known=selection(['mugs','kettle']);assert.deepEqual(commerce.checkoutDeliveryChoices(known.profile,known.ids),{unknown:false,rocket:true,dawn:true,defaultKind:'rocket'});
  assert.equal(commerce.checkoutDeliveryChoices(known.profile,['missing-decision']).defaultKind,'standard');
  assert.equal(commerce.checkoutDeliveryChoices(known.profile,[]).rocket,false);
});

test('order receipt renders its saved price basis and source URL instead of reconstructing a current offer',()=>{
  const sku=getSku('1814412512')!;
  const line:OrderLine={id:'saved-line',decisionId:'decision',skuId:sku.id,name:sku.name,category:sku.category,quantity:1,catalogPrice:12345,unitPrice:12000,discount:345,total:12000,deliveryFact:'Delivery unknown · check the sourced listing',origin:'coupang-reference',priceBasis:'historical-reference',sourceUrl:sku.sourceUrl+'&savedSnapshot=1',sourceNote:'Saved source snapshot',checkedAt:'2025-02-01'};
  const html=renderToStaticMarkup(createElement(commerce.OrderLines,{order:{lines:[line]}}));
  assert.match(html,/HISTORICAL REFERENCE PRICE/);assert.match(html,/₩12,345/);assert.match(html,/₩12,000/);
  assert.match(html,/savedSnapshot=1/);assert.match(html,/Current price, stock and delivery are unverified/);
  assert.match(html,/simulated saving/);assert(html.includes(`src="${sku.image}"`));
  assert.doesNotMatch(html,/Rocket|tomorrow by 7|₩7,470/);
});

test('reference contender markup uses actual photos and provenance with no fabricated review chips or speed award',()=>{
  const profile=createProfile('reference-comparison-ui',now);
  const html=renderToStaticMarkup(createElement(comparison.default,{profile,pickSkuId:'1814412512',onChange:()=>{}}));
  assert.match(html,/COUPANG REFERENCE/);assert.match(html,/HISTORICAL PRICE/);assert.match(html,/Original listing/);
  const expectedPhotos=buildComparison(profile,'1814412512').contenders.map(option=>getSku(option.skuId)!.image);
  assert(expectedPhotos.length>0);assert.deepEqual([...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1]),expectedPhotos);
  assert.match(html,/HISTORICAL REFERENCE PRICE/);assert.match(html,/reference option/);
  assert.doesNotMatch(html,/data-award="fastest"|data-award="most-loved"|Original seeded reviews|All reviews ·|% confidence/);
});

test('memory evidence labels describe its source rather than presenting a probability of truth',()=>{
  const line:MemoryLine={id:'memory',text:'I like this',source:'from your call',batchId:'call',kind:'call',createdAt:now.toISOString(),traitKeys:[],confidence:.9};
  assert.equal(comparison.memoryEvidenceLabel(line),'from your words');
  assert.equal(comparison.memoryEvidenceLabel({...line,confidence:.55}),'tentative — you can correct this');
  assert.equal(comparison.memoryEvidenceLabel({...line,kind:'swap'}),'learned from a choice');
  assert.equal(comparison.memoryEvidenceLabel({...line,confirmedAt:now.toISOString()}),'confirmed by you');
});


test('product images use only original reference photos and no fictional product illustration fallback',()=>{
  const real=getSku('1814412512')!,synthetic=getSku('kettle')!;
  const photo=renderToStaticMarkup(createElement(evidence.ProductVisual,{sku:real}));assert(photo.includes(real.image!));assert.doesNotMatch(photo,/Photo unavailable/);
  for(const sku of [synthetic,{...real,image:undefined},{...real,image:'https://example.test/lookalike.jpg'},{...real,image:'/verified-products/../other.svg'},{...synthetic,image:real.image}]){
    const html=renderToStaticMarkup(createElement(evidence.ProductVisual,{sku}));
    assert.match(html,/Photo unavailable/);assert.doesNotMatch(html,/<img|<linearGradient|data-product-art/);
  }
});
