import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile,deleteMemory} from '../lib/profile';
import {acceptsProfileUpdate,rebuildProductAnchors} from '../lib/world-navigation';
import {updateWorldActivity} from '../lib/server/world-activity';
import {generateWorld} from '../lib/server/world';
import {getSku} from '../lib/catalog';
import {fixtureBlueprint} from './fixtures/blueprint';
import type {structuredCall} from '../lib/server/llm';
const now=new Date('2026-10-25T01:00:00Z');

test('a late world response cannot replace a newer revision or another household member',()=>{
  const current=createProfile('member-a',now),older={...current,revision:current.revision-1},other={...current,id:'member-b',revision:999};
  assert.equal(acceptsProfileUpdate(null,current),true);
  assert.equal(acceptsProfileUpdate(current,older),false);
  assert.equal(acceptsProfileUpdate(current,other),false);
  assert.equal(acceptsProfileUpdate(current,{...current,revision:current.revision+1}),true);
});

test('a fresh shopper can reimagine a product-led world without completing their interview',async()=>{
  let profile=updateWorldActivity(createProfile('product-builder',now),{action:'productLike',worldId:'template:slow-sunday',requestId:'save-mugs',skuId:'mugs',liked:true},now).profile;
  const ids=['mugs','matcha','cottonApron','bambooTray','smallCandle'];
  const call=(async(request:Parameters<typeof structuredCall>[0])=>({data:request.validate({districts:[{name:'My tea afternoon',explanation:'A place for the saved mugs.',sourceMemoryIds:['memory-1'],items:ids.map(skuId=>({skuId,oneLiner:getSku(skuId)!.description})),blueprint:fixtureBlueprint(ids)}]}),meta:{cached:false,offline:false,model:'fixture',inputTokens:0,outputTokens:0,latencyMs:1,cacheKey:'fixture'}})) as typeof structuredCall;
  profile=(await generateWorld(profile,{requestId:'create',command:'Tea in a quiet room',selectedSkuIds:['mugs']},{call})).profile;
  const id=profile.journey!.districts[0].id;
  const selectedSkuIds=rebuildProductAnchors(profile,id);assert.deepEqual(selectedSkuIds,['mugs']);
  const rebuilt=await generateWorld(profile,{requestId:'rebuild',districtId:id,command:'Give the room soft morning light',selectedSkuIds},{call});
  assert.equal(rebuilt.profile.journey!.interviewComplete,false);assert.equal(rebuilt.districts.length,1);
  assert(rebuilt.districts[0].scene.items.some(item=>item.skuId==='mugs'));
  const forgotten=deleteMemory(profile,profile.worldActivity!.products[0].memoryId,now);
  assert.deepEqual(rebuildProductAnchors(forgotten,id),[]);
});
