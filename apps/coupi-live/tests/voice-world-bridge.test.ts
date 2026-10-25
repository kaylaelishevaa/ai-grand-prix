import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createProfile,deleteMemory} from '../lib/profile';
import {remember} from '../lib/memory';
import {getSku,getReview} from '../lib/catalog';
import {openVoiceWorldProduct,permittedVoiceWorlds,searchVoiceWorldProducts} from '../lib/server/voice-world-products';
import {teammateProfileContext} from '../lib/server/teammate-voice';
import {POST as worldProductsRoute} from '../app/api/products/world/route';
import {POST as profileRoute} from '../app/api/profile/route';
import approvedReferences from '../data/teammate-catalog.json';

test('live voice receives current world names and exact IDs, excluding diary and erased or quarantined evidence',()=>{
  let profile=remember(createProfile('voice-world'),{id:'story',text:'I like a slow cup of matcha.',source:'from our first call',confidence:.95,kind:'call'});
  profile.journey={hatched:true,interviewCount:5,interviewComplete:true,nextQuestion:'',processedCallIds:[],districts:[{id:'tea-world',name:'A quiet tea world',provenance:'from your story',sourceMemoryIds:['story'],createdAt:new Date().toISOString(),scene:{name:'A quiet tea world',explanation:'For tea.',items:[{skuId:'matcha',oneLiner:'A matcha ritual.'},{skuId:'mugs',oneLiner:'Your cup.'}]},journal:[{id:'private',at:'2026-10-25T01:00:00Z',kind:'note',note:'PRIVATE_DIARY_CONTENT'} as never]}]};
  const context=teammateProfileContext(profile);assert.equal(context.worlds.length,1);assert.deepEqual(context.worlds[0].products.map(item=>item.skuId),['matcha','mugs']);
  assert(!JSON.stringify(context).includes('PRIVATE_DIARY_CONTENT'));assert(!JSON.stringify(context).includes('journal'));
  profile.owned.push({skuId:'mugs',source:'approved',acquiredAt:new Date().toISOString()});
  assert.deepEqual(permittedVoiceWorlds(profile)[0].products.map(item=>item.skuId),['matcha']);
  assert.deepEqual(permittedVoiceWorlds(deleteMemory(profile,'story')),[]);
  profile.memoryLines[0].excludedFromAI=true;assert.deepEqual(permittedVoiceWorlds(profile),[]);
});

test('world search returns the same catalog and exact seeded review facts without a sourced-listing identity',()=>{
  const profile=createProfile('voice-search'),before=structuredClone(profile);
  const found=searchVoiceWorldProducts(profile,{query:'red socks',max_price:8000});
  assert.equal(found.catalog_namespace,'world-simulation');assert(found.products.some(product=>product.skuId==='socks'));
  for(const product of found.products){
    const sku=getSku(product.skuId)!;assert(sku);assert.equal(product.price,sku.price);assert(product.price<=8000);
    for(const review of product.reviews){assert.equal(getReview(review.id)?.skuId,sku.id);assert.equal(review.text,getReview(review.id)?.text);}
    assert(!('url' in product));assert(!('sourceImageUrl' in product));
  }
  assert.equal(searchVoiceWorldProducts(profile,{query:'unobtainium telescope'}).products.length,0);
  assert.deepEqual(profile,before,'Search does not create memories, XP or decisions');
});

test('open keeps sourced identity and zero reviews while checking current eligibility',()=>{
  const profile=createProfile('voice-open');assert.equal(openVoiceWorldProduct(profile,'kettle').ok,true);
  const sourced=openVoiceWorldProduct(profile,'1814412512');assert.equal(sourced.ok,true);if('product' in sourced&&sourced.product){assert.equal(sourced.product.skuId,'1814412512');assert.equal(sourced.product.origin,'coupang-reference');assert.equal(sourced.product.priceBasis,'historical-reference');assert.match(sourced.product.sourceUrl!,/^https:\/\/www.coupang.com\/vp\/products\/1814412512/);assert.deepEqual(sourced.product.reviewIds,[]);assert.deepEqual(sourced.product.reviews,[]);}
  assert.equal(openVoiceWorldProduct(profile,'9999999999').ok,false);
  assert.equal(openVoiceWorldProduct(profile,'detergent').ok,false);
  profile.owned.push({skuId:'kettle',source:'approved',acquiredAt:new Date().toISOString()});assert.equal(openVoiceWorldProduct(profile,'kettle').ok,false);
  profile.quarantine.push({category:'kitchen',sensitive:true,note:'private'});assert.equal(openVoiceWorldProduct(profile,'mugs').ok,false);
  assert.equal(profile.decisions.length,0);assert.equal(profile.xp,0);
});

test('world tool route rechecks persisted profile, is origin-bound, and works offline without model/network calls', {concurrency:false},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'coupi-voice-world-')),previousData=process.env.COUPI_DATA_DIR,previousOffline=process.env.DEMO_OFFLINE,previousFetch=globalThis.fetch;
  process.env.COUPI_DATA_DIR=directory;process.env.DEMO_OFFLINE='1';let calls=0,cookie='';
  globalThis.fetch=(async()=>{calls++;throw new Error('No network permitted');}) as typeof fetch;
  const origin='http://127.0.0.1:3007';
  async function send(handler:typeof worldProductsRoute,pathname:string,body:unknown,originValue=origin){
    const response=await handler(new Request(origin+pathname,{method:'POST',headers:{origin:originValue,'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)}));
    if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie')!.split(';')[0];return response;
  }
  try{
    const search=await send(worldProductsRoute,'/api/products/world',{action:'search',query:'kettle',max_price:50000});assert.equal(search.status,200);assert((await search.json()).products.length);
    const open=await send(worldProductsRoute,'/api/products/world',{action:'open',skuId:'kettle'});assert.equal((await open.json()).ok,true);
    for(const source of approvedReferences){
      const response=await send(worldProductsRoute,'/api/products/world',{action:'open',skuId:source.id});assert.equal(response.status,200,source.id);
      const result=await response.json();assert.equal(result.ok,true);assert.equal(result.product.skuId,source.id);assert.equal(result.product.name,source.name);assert.equal(result.product.sourceUrl,source.url);assert.equal(result.product.image,source.image);assert.deepEqual(result.product.preview,source.preview);assert.deepEqual(result.product.sourceReviewEvidence,source.reviewEvidence);assert.deepEqual(result.product.reviews,[]);
    }
    const worldOnly=await send(worldProductsRoute,'/api/products/world',{action:'open',skuId:'7434051500'});assert.equal(worldOnly.status,200);assert.equal((await worldOnly.json()).product.preview.available,false);
    for(const skuId of ['../1814412512','1814412512/other','<script>'])assert.equal((await send(worldProductsRoute,'/api/products/world',{action:'open',skuId})).status,400);
    const changed=await send(profileRoute,'/api/profile',{action:'swipe',swipe:{id:'voice-owned',skuId:'kettle',action:'nah',reason:'have one',source:'call'}});assert.equal(changed.status,200);
    const blocked=await send(worldProductsRoute,'/api/products/world',{action:'open',skuId:'kettle'});assert.equal((await blocked.json()).ok,false);
    const foreign=await send(worldProductsRoute,'/api/products/world',{action:'open',skuId:'mugs'},'https://attacker.test');assert.equal(foreign.status,403);
    assert.equal(calls,0);
  }finally{globalThis.fetch=previousFetch;if(previousData===undefined)delete process.env.COUPI_DATA_DIR;else process.env.COUPI_DATA_DIR=previousData;if(previousOffline===undefined)delete process.env.DEMO_OFFLINE;else process.env.DEMO_OFFLINE=previousOffline;await rm(directory,{recursive:true,force:true});}
});
