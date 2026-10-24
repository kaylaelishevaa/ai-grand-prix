import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile,deleteMemory,eligibleCatalog} from '../lib/profile';
import {remember} from '../lib/memory';
import {districtBudget,generateWorld,validateWorld} from '../lib/server/world';
import {structuredCall} from '../lib/server/llm';
import type {Profile,CallMeta} from '../lib/types';
import {getSku} from '../lib/catalog';
const now=new Date('2026-10-25T01:00:00.000Z');
const meta:CallMeta={cached:false,offline:false,model:'fixture',inputTokens:0,outputTokens:0,latencyMs:1,cacheKey:'fixture'};
function profile(){let value=createProfile('world',now);value=remember(value,{id:'mornings',text:'I make matcha slowly on weekend mornings.',source:'from our first call',confidence:0.9,kind:'call'},now);value.journey={hatched:true,interviewCount:5,interviewComplete:true,nextQuestion:'',districts:[],processedCallIds:[]};return value;}
const district=(name='Your Mornings')=>({name,explanation:'A place for your morning matcha.',sourceMemoryIds:['memory-1'],items:[{skuId:'matcha',oneLiner:'For your morning matcha.'},{skuId:'mugs',oneLiner:'A pair for your table.'}]});
function provider(output:unknown,inputs:unknown[]=[]):typeof structuredCall {
  return (async(request:Parameters<typeof structuredCall>[0])=>{inputs.push(request.input);return{data:request.validate(output),meta};}) as typeof structuredCall;
}

test('world validation rejects invented provenance, SKU IDs, duplicates and overspending',()=>{
  const allowed=eligibleCatalog(profile()),memories=[{id:'memory-1',text:'Mornings'}];
  const validate=(value:unknown)=>validateWorld(value,allowed,memories,{min:2,max:4},150000);
  assert.equal(validate({districts:[district(),district('Your Kitchen')]}).districts.length,2);
  assert.throws(()=>validate({districts:[district()]}),/district count/);
  assert.throws(()=>validate({districts:[{...district(),sourceMemoryIds:['invented']},district('Kitchen')]}),/provenance/);
  for(const skuId of ['not-real','detergent','skinCream'])assert.throws(()=>validate({districts:[{...district(),items:[{skuId,oneLiner:'A thing.'},{skuId:'mugs',oneLiner:'A mug.'}]},district('Kitchen')]}),/product/);
  assert.throws(()=>validate({districts:[{...district(),items:[{skuId:'mugs',oneLiner:'One.'},{skuId:'mugs',oneLiner:'Two.'}]},district('Kitchen')]}),/product/);
  assert.throws(()=>validateWorld({districts:[district(),district('Kitchen')]},allowed,memories,{min:2,max:4},20000),/budget/);
});

test('explicit scene budgets are hard caps in supported natural forms',()=>{
  assert.equal(districtBudget('under ₩100k total',150000),100000);
  assert.equal(districtBudget('budget: 30,000',150000),30000);
  assert.equal(districtBudget('under KRW 29.9k',150000),29900);
  assert.equal(districtBudget('3만원 이하',150000),30000);
  assert.equal(districtBudget('under 500k',150000),150000);
  assert.equal(districtBudget('make it quiet',150000),150000);
});

test('world persists initial districts, named additions and rebuilds without duplicate retry mutations',async()=>{
  const inputs:unknown[]=[];
  const first=await generateWorld(profile(),{requestId:'initial'},{call:provider({districts:[district(),district('Your Kitchen')]},inputs)});
  assert.equal(first.districts.length,2);assert.equal(first.profile.journey!.districts.length,2);
  assert.match(first.districts[0].provenance,/I make matcha/);assert.deepEqual(first.districts[0].sourceMemoryIds,['mornings']);
  assert.equal(first.profile.xp,0);
  const duplicate=await generateWorld(first.profile,{requestId:'initial'},{call:provider({},inputs)});
  assert.equal(inputs.length,1);assert.equal(duplicate.districts.length,2);
  const added=await generateWorld(first.profile,{requestId:'desk',command:'A desk for my quiet mornings'},{call:provider({districts:[district('Your Desk')]},inputs)});
  assert.equal(added.districts.length,3);
  const rebuilt=await generateWorld(added.profile,{requestId:'rebuild',districtId:added.districts[0].id,command:'keep my morning corner simple'},{call:provider({districts:[district('Simple Mornings')]},inputs)});
  assert.equal(rebuilt.districts.length,3);assert.equal(rebuilt.districts[0].id,first.districts[0].id);assert.equal(rebuilt.districts[0].name,'Simple Mornings');
  assert.equal(rebuilt.profile.owned.length,1);assert.equal(rebuilt.profile.decisions.length,0);
});

test('deleted and quarantined memories never enter the next world prompt or its provenance',async()=>{
  let initial=profile();
  initial=remember(initial,{id:'desk',text:'I work from a small desk.',source:'from your call, 25 Oct',confidence:0.9,kind:'call'},now);
  initial=remember(initial,{id:'private',text:'personal-care cream preference',source:'from your call, 25 Oct',confidence:0.9,kind:'call'},now);
  const after=deleteMemory(initial,'mornings',now),inputs:unknown[]=[];
  const output=await generateWorld(after,{requestId:'after-forget'},{call:provider({districts:[district('Your Desk'),district('Quiet Work')]},inputs)});
  const prompt=JSON.stringify(inputs[0]);assert(!prompt.includes('matcha slowly'));assert(!prompt.includes('cream preference'));
  assert(output.districts.every(item=>item.sourceMemoryIds.length===1&&item.sourceMemoryIds[0]==='desk'));
  assert(!prompt.includes('old district'));
});

test('unfinished interview and impossible caps fail before any provider call',async()=>{
  const unfinished=createProfile('first',now),inputs:unknown[]=[];
  await assert.rejects(()=>generateWorld(unfinished,{requestId:'early'},{call:provider({},inputs)}),/finish our first call/);
  await assert.rejects(()=>generateWorld(profile(),{requestId:'cheap',command:'under ₩1'},{call:provider({},inputs)}),/cannot fit/);
  assert.equal(inputs.length,0);
});

test('a new date-night district uses catalog wardrobe and beauty items and persists dressing architecture',async()=>{
  const initial=profile(),inputs:unknown[]=[];
  initial.journey!.districts=[{id:'morning-room',name:'Your Mornings',provenance:'from your story',sourceMemoryIds:['mornings'],scene:{name:'Your Mornings',explanation:'Your morning matcha.',kind:'kitchen',items:district().items},createdAt:now.toISOString()}];
  const dateIds=['dateDress','littleHandbag','roseLipstick','softCompact'];
  for(const id of dateIds)assert(getSku(id),`The date product ${id} must exist in the catalog.`);
  const output={districts:[{name:'Your Getting-Ready Corner',explanation:'A closet and vanity for the date you described.',sourceMemoryIds:['memory-2'],items:dateIds.map(skuId=>({skuId,oneLiner:getSku(skuId)!.description}))}]};
  const result=await generateWorld(initial,{requestId:'date-room',command:'A date-night closet and makeup corner under ₩100k'},{call:provider(output,inputs)});
  const added=result.districts.at(-1)!;
  assert.equal(result.districts.length,2);assert.equal(added.scene.kind,'dressing');
  assert.deepEqual(added.scene.items.map(item=>item.skuId),dateIds);
  assert(added.scene.items.reduce((sum,item)=>sum+getSku(item.skuId)!.price,0)<=100000);
  assert.deepEqual(added.sourceMemoryIds,['district-command:date-room']);
  assert.match(added.provenance,/date-night closet and makeup/);
  const request=inputs[0] as {command:string;catalog:{id:string;category:string}[]};
  assert.match(request.command,/date-night/);
  for(const id of dateIds)assert(request.catalog.some(item=>item.id===id));
  assert(!request.catalog.some(item=>item.id==='skinCream'));
  assert(!request.catalog.some(item=>item.id==='kettle'||item.id==='milk'));
});

test('closet plus makeup needs both product categories, while explicit no-makeup keeps cosmetics out',async()=>{
  const initial=profile();
  const allowed=eligibleCatalog(initial),memory=[{id:'memory-1',text:'a closet and makeup vanity'}];
  const allClothes={districts:[{name:'A closet',explanation:'Getting ready.',sourceMemoryIds:['memory-1'],items:[{skuId:'dateDress',oneLiner:'A dress.'},{skuId:'littleHandbag',oneLiner:'A bag.'}]}]};
  assert.throws(()=>validateWorld(allClothes,allowed,memory,{min:1,max:1},150000,{wardrobe:true,beauty:true}),/both wardrobe and beauty/);
  initial.journey!.districts=[{id:'old',name:'Your Mornings',provenance:'from your story',sourceMemoryIds:['mornings'],scene:{name:'Your Mornings',explanation:'Morning.',items:district().items},createdAt:now.toISOString()}];
  const inputs:unknown[]=[],result=await generateWorld(initial,{requestId:'no-cosmetics',command:'A simple wardrobe, no makeup'},{call:provider(allClothes,inputs)});
  assert.equal(result.districts.at(-1)!.scene.kind,'dressing');
  const input=inputs[0] as {catalog:{id:string}[]};
  assert(!input.catalog.some(item=>['roseLipstick','softCompact','blendingBrush'].includes(item.id)));
  assert(input.catalog.some(item=>item.id==='dateDress'));
});
