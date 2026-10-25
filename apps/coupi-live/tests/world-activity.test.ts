import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createProfile,deleteMemory,sanitizeProfileForAI,eligibleCatalog} from '../lib/profile';
import {getSku} from '../lib/catalog';
import {likedProductIds,weeklyLocalWorlds,activityForWorld,worldSubject} from '../lib/world-activity';
import {updateWorldActivity} from '../lib/server/world-activity';
import {generateWorld,validateWorld} from '../lib/server/world';
import {structuredCall} from '../lib/server/llm';
import {saveProfile} from '../lib/server/store';
import {POST} from '../app/api/world/activity/route';
import {fixtureBlueprint} from './fixtures/blueprint';
import type {Profile,CallMeta} from '../lib/types';
const now=new Date('2026-10-25T01:00:00Z'),worldId='template:slow-sunday';
const initial=()=>createProfile(randomUUID(),now);
const save=(profile:Profile,skuId='7434051500',requestId='save-'+skuId)=>updateWorldActivity(profile,{action:'productLike',worldId,requestId,skuId,liked:true},now).profile;
const meta:CallMeta={cached:false,offline:false,model:'fixture',inputTokens:0,outputTokens:0,latencyMs:1,cacheKey:'fixture'};
const bundle=['7434051500','1539744911','8059518763','7915055185','345674940'];
const district=(ids=bundle)=>({name:'An afternoon with my cups',explanation:'A setting for the products you saved.',sourceMemoryIds:['memory-1'],items:ids.map(skuId=>({skuId,oneLiner:getSku(skuId)!.description})),blueprint:fixtureBlueprint(ids)});
function provider(value:unknown,inputs:unknown[]=[]):typeof structuredCall{return(async(request:Parameters<typeof structuredCall>[0])=>{inputs.push(request.input);return{data:request.validate(value),meta};}) as typeof structuredCall;}

test('private world notes and reviews persist without becoming product evidence, preferences or orders',()=>{
 const start=initial();let next=updateWorldActivity(start,{action:'comment',worldId,requestId:'note',text:'  Our rainy anniversary <script>private</script>  '},now).profile;
 next=updateWorldActivity(next,{action:'review',worldId,requestId:'review',rating:4,text:'More plants, please.'},now).profile;
 const record=activityForWorld(next,worldId);assert.equal(record.comments.length,1);assert.equal(record.comments[0].text,'Our rainy anniversary <script>private</script>');assert.equal(record.review?.rating,4);
 assert.deepEqual(next.memoryLines,start.memoryLines);assert.equal(next.xp,start.xp);assert.deepEqual(next.owned,start.owned);assert.deepEqual(next.decisions,[]);
 assert(!JSON.stringify(sanitizeProfileForAI(next)).includes('anniversary'));assert(!JSON.stringify(sanitizeProfileForAI(next)).includes('More plants'));
 const erased=updateWorldActivity(next,{action:'deleteComment',worldId,requestId:'delete',commentId:record.comments[0].id},now).profile;
 assert.equal(activityForWorld(erased,worldId).comments.length,0);assert.equal(activityForWorld(start,worldId).comments.length,0);
});

test('product likes contribute only exact product choice and deletion changes future world context',()=>{
 const start=initial(),saved=save(start);assert.deepEqual(likedProductIds(saved),['7434051500']);assert.equal(saved.traits['choice:7434051500'],1);assert.deepEqual(Object.keys(saved.traits),['choice:7434051500']);
 assert.match(saved.memoryLines[0].source,/saved world products/);assert.equal(saved.xp,0);assert.deepEqual(saved.decisions,[]);assert.deepEqual(saved.owned,start.owned);
 const deleted=deleteMemory(saved,saved.worldActivity!.products[0].memoryId,now);assert.deepEqual(likedProductIds(deleted),[]);assert.equal(deleted.traits['choice:7434051500'],undefined);
 const retry=save(deleted);assert.deepEqual(likedProductIds(retry),[]);assert.equal(retry.revision,deleted.revision);
 const explicit=save(deleted,'7434051500','explicit-save-again');assert.deepEqual(likedProductIds(explicit),['7434051500']);assert.equal(explicit.traits['choice:7434051500'],1);
 const removed=updateWorldActivity(explicit,{action:'productLike',worldId,requestId:'remove',skuId:'7434051500',liked:false},now).profile;assert.deepEqual(likedProductIds(removed),[]);assert.equal(removed.traits['choice:7434051500'],undefined);
});

test('thirty forgotten, owned and quarantined historical favorites free slots without resurrecting evidence',()=>{
 let profile=initial();
 const eligible=eligibleCatalog(profile),groups=['home','wardrobe','groceries'].map(category=>eligible.filter(sku=>sku.category===category).slice(0,10));
 assert(groups.every(items=>items.length===10));const products=groups.flat();
 profile.journey={hatched:true,interviewCount:0,interviewComplete:false,nextQuestion:'',processedCallIds:[],districts:Array.from({length:5},(_,index)=>({id:'test-'+index,name:'A saved world '+index,provenance:'Explicit test selection',sourceMemoryIds:[],createdAt:now.toISOString(),scene:{name:'A saved world '+index,explanation:'A selected collection.',items:products.slice(index*6,index*6+6).map(sku=>({skuId:sku.id,oneLiner:sku.description}))}}))};
 const events=products.map((sku,index)=>({action:'productLike' as const,worldId:'district:test-'+Math.floor(index/6),requestId:'historical-'+index,skuId:sku.id,liked:true}));
 for(const event of events)profile=updateWorldActivity(profile,event,now).profile;
 assert.equal(likedProductIds(profile).length,30);assert.throws(()=>save(profile,'7434051500','over-cap'),/30 favorite/);
 // All three kinds of stale records used to consume the cap indefinitely.
 profile.quarantine.push({category:'home',sensitive:true,note:'Keep this category private'});
 profile.owned.push(...groups[1].map(sku=>({skuId:sku.id,source:'approved' as const,acquiredAt:now.toISOString()})));
 const erasedIds=groups[2].map(sku=>profile.worldActivity!.products.find(item=>item.skuId===sku.id)!.memoryId);
 for(const id of erasedIds)profile=deleteMemory(profile,id,now);
 assert.equal(profile.worldActivity!.products.length,30);assert.deepEqual(likedProductIds(profile),[]);
 const priorMemory=structuredClone(profile.memoryLines),priorReceipts=structuredClone(profile.worldActivity!.receipts),next=save(profile,'7434051500','new-active');
 assert.deepEqual(likedProductIds(next),['7434051500']);assert.deepEqual(next.worldActivity!.products.map(item=>item.skuId),['7434051500']);
 assert.deepEqual(next.memoryLines.slice(0,-1),priorMemory);assert.deepEqual(next.worldActivity!.receipts.slice(0,-1),priorReceipts);
 assert(erasedIds.every(id=>!next.memoryLines.some(line=>line.id===id)));assert.equal(next.xp,0);assert.deepEqual(next.decisions,[]);
 const lateRetry=updateWorldActivity(next,events[20],now).profile;assert.equal(lateRetry.revision,next.revision);assert.deepEqual(likedProductIds(lateRetry),['7434051500']);assert(!lateRetry.memoryLines.some(line=>line.id===erasedIds[0]));
});

test('world identity, product membership, ownership and quarantine are enforced before a reaction',()=>{
 const start=initial();assert.equal(worldSubject(start,'district:someone-elses-world'),undefined);
 assert.throws(()=>updateWorldActivity(start,{action:'like',worldId:'district:someone-elses-world',requestId:'foreign',liked:true},now),/unavailable/);
 for(const skuId of ['detergent','skinCream','not-a-sku','dateDress'])assert.throws(()=>save(start,skuId),/available product/);
 const saved=save(start);saved.owned.push({skuId:'7434051500',source:'approved',acquiredAt:now.toISOString()});assert.deepEqual(likedProductIds(saved),[]);assert.throws(()=>save(saved,'7434051500','owned'),/available product/);
 const quarantined=save(initial());quarantined.quarantine.push({category:getSku('7434051500')!.category,sensitive:true,note:'Private'});assert.deepEqual(likedProductIds(quarantined),[]);
 assert.throws(()=>save(quarantined,'7434051500','private'),/unavailable|available product/);
});

test('action replay is idempotent and changed payloads cannot reuse a receipt',()=>{
 const input={action:'like' as const,worldId,requestId:'like',liked:true};const first=updateWorldActivity(initial(),input,now).profile;
 assert.equal(updateWorldActivity(first,input,now).profile.revision,first.revision);
 assert.throws(()=>updateWorldActivity(first,{...input,liked:false},now),/already used/);
 const unlike=updateWorldActivity(first,{...input,requestId:'unlike',liked:false},now).profile;
 assert.equal(activityForWorld(updateWorldActivity(unlike,input,now).profile,worldId).likedAt,null);
 assert.throws(()=>updateWorldActivity(first,{action:'review',worldId,requestId:'invalid',rating:6,text:''},now));
 assert.throws(()=>updateWorldActivity(first,{action:'comment',worldId,requestId:'empty',text:'  '},now));
});

test('weekly labels never invent public popularity and ignore expired or future likes',()=>{
 const start=initial();assert.equal(weeklyLocalWorlds(start,now).label,'This week’s picks');assert.match(weeklyLocalWorlds(start,now).note,/no public popularity/);
 const saved=updateWorldActivity(start,{action:'like',worldId,requestId:'like',liked:true},now).profile;
 assert.deepEqual(weeklyLocalWorlds(saved,now).worldIds,[worldId]);assert.equal(weeklyLocalWorlds(saved,now).label,'Your week’s favorites');
 assert.equal(weeklyLocalWorlds(saved,new Date(now.getTime()+8*86400000)).label,'This week’s picks');assert.equal(weeklyLocalWorlds(saved,new Date(now.getTime()-1)).label,'This week’s picks');
});

test('product-led world creates one 5–6-item bundle from saved preferences without completing first call',async()=>{
 const start=save(initial()),inputs:unknown[]=[];
 const result=await generateWorld(start,{requestId:'create',selectedSkuIds:['7434051500']},{call:provider({districts:[district()]},inputs)});
 assert.equal(result.districts.length,1);assert.equal(result.districts[0].scene.items.length,5);assert(result.districts[0].scene.items.some(item=>item.skuId==='7434051500'));
 assert.equal(result.profile.journey!.interviewComplete,false);assert.equal(result.profile.journey!.interviewCount,0);assert.equal(result.profile.xp,0);assert.deepEqual(result.profile.decisions,[]);
 assert(result.districts[0].sourceMemoryIds.includes(start.worldActivity!.products[0].memoryId));
 assert.equal(deleteMemory(result.profile,start.worldActivity!.products[0].memoryId,now).journey!.districts.length,0);
 assert.deepEqual((inputs[0] as {selectedSkuIds:string[]}).selectedSkuIds,['7434051500']);assert.match(JSON.stringify(inputs[0]),/preference, not ownership/);
 const retry=await generateWorld(result.profile,{requestId:'create',selectedSkuIds:['7434051500']},{call:provider({},inputs)});assert.equal(retry.profile.revision,result.profile.revision);assert.equal(inputs.length,1);
 await assert.rejects(()=>generateWorld(result.profile,{requestId:'create',selectedSkuIds:['7434051500'],command:'different'},{call:provider({},inputs)}),/request changed/);
});

test('required selected products and five-product minimum are validated independently of model output',()=>{
 const profile=save(initial()),allowed=eligibleCatalog(profile),memory=[{id:'memory-1',text:'7434051500'}];
 assert.throws(()=>validateWorld({districts:[district(['1539744911','8059518763','7915055185','345674940','6994027284'])]},allowed,memory,{min:1,max:1},150000,undefined,['7434051500']),/selected product/);
 assert.throws(()=>validateWorld({districts:[district(['7434051500','1539744911'])]},allowed,memory,{min:1,max:1},150000,undefined,['7434051500']),/5–6/);
});

test('remix excludes the other original products and rejects impossible, private or erased anchors before any call',async()=>{
 const profile=save(initial()),inputs:unknown[]=[];
 const output=await generateWorld(profile,{requestId:'remix',selectedSkuIds:['7434051500'],avoidSkuIds:['55518713']},{call:provider({districts:[district()]},inputs)});assert.equal(output.districts.length,1);
 const prompt=inputs[0] as {catalog:{id:string}[];avoidSkuIds:string[]};assert(!prompt.catalog.some(sku=>sku.id==='55518713'));assert.deepEqual(prompt.avoidSkuIds,['55518713']);
 const before=inputs.length;
 for(const input of [{requestId:'too-cheap',selectedSkuIds:['7434051500'],command:'under ₩1'},{requestId:'dupe',selectedSkuIds:['7434051500','7434051500']},{requestId:'conflict',selectedSkuIds:['7434051500'],avoidSkuIds:['7434051500']},{requestId:'unknown',selectedSkuIds:['7434051500'],avoidSkuIds:['made-up']}])await assert.rejects(()=>generateWorld(profile,input,{call:provider({},inputs)}));
 const erased=deleteMemory(profile,profile.worldActivity!.products[0].memoryId,now);await assert.rejects(()=>generateWorld(erased,{requestId:'erased',selectedSkuIds:['7434051500']},{call:provider({},inputs)}),/first call/);
 assert.equal(inputs.length,before);
});

test('unconfirmed interview answers are not included by explicit product-led creation',async()=>{
 const profile=save(initial()),inputs:unknown[]=[];profile.journey={hatched:true,interviewCount:0,interviewComplete:false,nextQuestion:'Tell me more',processedCallIds:[],districts:[],personalizationDraft:{id:'draft',startedAt:now.toISOString(),answerCount:1,reviewReady:false,candidates:[{id:'draft-note',text:'UNCONFIRMED PRIVATE STORY',source:'first call',createdAt:now.toISOString(),confidence:.9,batchId:'draft',traitKeys:[]}]}};
 const result=await generateWorld(profile,{requestId:'explicit',selectedSkuIds:['7434051500']},{call:provider({districts:[district()]},inputs)});
 assert(!JSON.stringify(inputs).includes('UNCONFIRMED PRIVATE STORY'));assert.equal(result.profile.journey!.personalizationDraft!.candidates.length,1);assert.equal(result.profile.journey!.interviewComplete,false);
});

test('activity route persists per session, rejects cross-origin and never accepts client profile injection',{concurrency:false},async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'coopy-activity-')),old=process.env.COUPI_DATA_DIR;
 try{process.env.COUPI_DATA_DIR=root;const owner=initial(),other=initial();owner.journey={hatched:true,interviewCount:0,interviewComplete:false,nextQuestion:'',processedCallIds:[],districts:[{id:'private-world',name:'Mine',provenance:'my choice',sourceMemoryIds:[],createdAt:now.toISOString(),scene:{name:'Mine',explanation:'Private',items:[{skuId:'7434051500',oneLiner:'cups'}]}}]};await saveProfile(owner);await saveProfile(other);
  const send=async(body:unknown,id=owner.id,origin='http://localhost:3007')=>{const response=await POST(new Request('http://localhost:3007/api/world/activity',{method:'POST',headers:{'content-type':'application/json',origin,cookie:'coupi_profile='+id},body:JSON.stringify(body)}));return{status:response.status,data:await response.json()};};
  const body={action:'comment',worldId:'district:private-world',requestId:'route',text:'My private note'};
  assert.equal((await send(body)).status,200);assert.equal((await send(body,other.id)).status,404);assert.equal((await send({...body,requestId:'cross'},owner.id,'https://foreign.example')).status,403);assert.equal((await send({...body,profile:owner})).status,400);
  const disk=JSON.parse(await readFile(path.join(root,owner.id+'.json'),'utf8'));assert.equal(disk.worldActivity.worlds[0].comments[0].text,'My private note');assert.equal(JSON.parse(await readFile(path.join(root,other.id+'.json'),'utf8')).worldActivity,undefined);
  const duplicate=await send(body);assert.equal(duplicate.data.profile.worldActivity.worlds[0].comments.length,1);
 }finally{if(old===undefined)delete process.env.COUPI_DATA_DIR;else process.env.COUPI_DATA_DIR=old;await rm(root,{recursive:true,force:true});}
});
