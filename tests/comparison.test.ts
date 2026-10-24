import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {buildComparison,compareProducts,ComparisonError,selectContender} from '../lib/comparison';
import {catalog,comparisonCandidatesForSku,getReview,getSku,reviewsForSku} from '../lib/catalog';
import {samePurpose} from '../lib/comparison-groups';
import {createProfile,deleteMemory,eligibleCatalog} from '../lib/profile';
import {remember,PRICE_TRAIT,REVIEW_TRAIT} from '../lib/memory';
import {addDecision,isDecisionLocked} from '../lib/guardrails';
import {assignDelegation} from '../lib/delegation';
import {POST as compareRoute} from '../app/api/compare/route';
import {GET as getProfile,POST as postProfile} from '../app/api/profile/route';
import {POST as decisionRoute} from '../app/api/decisions/route';
import type {Profile} from '../lib/types';

const now=new Date();
const swap={fromSkuId:'kettle',skuId:'kettleAlt',requestId:'swap-1',origin:'ask' as const};
const avg=(id:string)=>{const rows=reviewsForSku(id);return rows.length?rows.reduce((sum,row)=>sum+row.stars,0)/rows.length:-Infinity;};

test('every fresh eligible catalog pick has 2–4 same-purpose contenders with one earned badge',()=>{
  const profile=createProfile('badge-test',now);
  for(const sku of eligibleCatalog(profile,'ask')){
    const result=buildComparison(profile,sku.id),pool=[sku,...comparisonCandidatesForSku(sku.id,eligibleCatalog(profile))];
    assert(result.contenders.length>=2&&result.contenders.length<=4,`${sku.id} needs 2–4 contenders`);
    for(const option of [result.main,...result.contenders]){
      const chosen=getSku(option.skuId)!;
      assert(samePurpose(sku,chosen));assert(!Array.isArray(option.badge));
      assert(!option.badge.label.includes('tied'),'UI owns the single tied suffix');
      assert(!['best-for-you','best-value'].includes(option.badge.kind),'no unsupported fit or common use assumption on an empty profile');
      if(option.badge.kind==='cheapest')assert.equal(chosen.price,Math.min(...pool.map(item=>item.price)));
      if(option.badge.kind==='most-loved'){
        assert.equal(avg(chosen.id),Math.max(...pool.map(item=>avg(item.id))));
        assert.deepEqual(option.badge.reviewIds,reviewsForSku(chosen.id).map(row=>row.id));
      }
      if(option.badge.kind==='fastest'){
        assert.match(chosen.delivery,/tomorrow by 7am/);
        assert.equal(option.badge.tied,pool.filter(item=>item.delivery.includes('tomorrow by 7am')).length>1);
      }
      for(const id of option.badge.reviewIds)assert.equal(getReview(id)?.skuId,chosen.id);
    }
  }
});

test('comparison eligibility never crosses functional purpose or leaks owned/quarantined options',()=>{
  const profile=createProfile('eligibility',now);
  profile.owned.push({skuId:'kettleAlt',source:'have-one',acquiredAt:now.toISOString()});
  assert(!buildComparison(profile,'kettle').contenders.some(item=>item.skuId==='kettleAlt'));
  assert.equal(buildComparison(profile,'kettleAlt').contenders.length,0);
  assert.equal(buildComparison(profile,'detergent').main.badge.label,'already owned');
  assert.equal(buildComparison(profile,'skinCream').main.badge.label,'unavailable');
  assert.throws(()=>compareProducts(profile,'roseLipstick','blendingBrush'),/same job/);
  assert.throws(()=>compareProducts(profile,'greens','mushrooms'),/same job/);
  assert.throws(()=>compareProducts(profile,'cushion','cushionCover'),/same job/);
  assert.throws(()=>selectContender(profile,{...swap,skuId:'detergent'}),error=>error instanceof ComparisonError&&error.code==='OWNED_ITEM');
  assert.throws(()=>selectContender(profile,{...swap,skuId:'skinCream'}),error=>error instanceof ComparisonError&&error.code==='QUARANTINED');
  assert.throws(()=>selectContender(profile,{...swap,skuId:'mugs'}),/same job/);
});

test('first-call text can supply visible fit evidence, and deleted or negative memory cannot earn that fit',()=>{
  let profile=remember(createProfile('first-call',now),{id:'first-call-answer',text:'I prefer warm neutrals and love cream.',source:'from our first call',confidence:0.95,kind:'call'},now);
  const result=buildComparison(profile,'kettle');
  assert.equal(result.main.badge.kind,'best-for-you');
  assert.deepEqual(result.main.badge.memoryIds,['first-call-answer']);
  assert.equal(result.main.fitReasons[0].source,'from our first call');
  const comparison=compareProducts(profile,'kettle','kettleAlt');
  assert(comparison.dimensions.find(item=>item.key==='fit')!.memoryIds.includes('first-call-answer'));
  profile=deleteMemory(profile,'first-call-answer',now);
  assert.notEqual(buildComparison(profile,'kettle').main.badge.kind,'best-for-you');
  profile=remember(profile,{id:'negative',text:"I don't like warm neutrals. I dislike cream.",source:'from our first call',confidence:0.95,kind:'call'},now);
  assert.notEqual(buildComparison(profile,'kettle').main.badge.kind,'best-for-you');
  assert.match(compareProducts(profile,'kettle','kettleAlt').dimensions.find(item=>item.key==='fit')!.left,/Conflicts/);
});

test('unmatched stories, incidental cream, health and scripted lines do not invent fit',()=>{
  for(const [text,kind] of [['I drink coffee with cream.','call'],['My sensitive skin needs cream.','call'],['I like cream.','scripted'],['I get up at six and feed the cat.','call']]){
    const profile=remember(createProfile('unknown',now),{id:'statement',text,source:'from our first call',confidence:0.95,kind},now);
    assert.equal(buildComparison(profile,'kettle').main.fitReasons.length,0,text);
  }
});

test('a socks budget and a whole-world total never become a candle price constraint',()=>{
  let profile=remember(createProfile('budget-scope',now),{id:'socks-budget',text:'Wants red crew socks under ₩8,000',source:'from your call, 25 Oct 2026',confidence:0.95,kind:'call'},now);
  profile=remember(profile,{id:'world-total',text:'Keep each little area under ₩100k total',source:'from our first call',confidence:0.95,kind:'call'},now);
  const candles=compareProducts(profile,'candle','smallCandle').dimensions.find(item=>item.key==='fit')!;
  assert.deepEqual(candles.memoryIds,[]);
  assert.match(candles.left,/No active memory/);
  const socks=compareProducts(profile,'socks','socksRunner').dimensions.find(item=>item.key==='fit')!;
  assert.deepEqual(socks.memoryIds,['socks-budget']);
  assert.match(socks.left,/Matches/);assert.match(socks.right,/Conflicts/);
  profile=remember(profile,{id:'item-cap',text:'I want every item under ₩8,000',source:'from your call, 25 Oct 2026',confidence:0.95,kind:'call'},now);
  const general=compareProducts(profile,'candle','smallCandle').dimensions.find(item=>item.key==='fit')!;
  assert(general.memoryIds.includes('item-cap'));
});

test('head-to-head reports all five dimensions with raw evidence and exact price math',()=>{
  const result=compareProducts(createProfile('dimensions',now),'socks','socksBudget');
  assert.deepEqual(result.dimensions.map(item=>item.key),['price','fit','quality','delivery','durability']);
  assert.equal(result.dimensions[0].delta,getSku('socksBudget')!.price-getSku('socks')!.price);
  const quality=result.dimensions.find(item=>item.key==='quality')!;
  assert.deepEqual(quality.leftReviewIds,reviewsForSku('socks').map(row=>row.id));
  assert.deepEqual(quality.rightReviewIds,reviewsForSku('socksBudget').map(row=>row.id));
  assert.match(result.dimensions.find(item=>item.key==='delivery')!.note,/tied/);
  const durability=result.dimensions.find(item=>item.key==='durability')!;
  assert(durability.rightReviewIds.includes('B04'));
  for(const id of durability.rightReviewIds)assert(durability.right.includes(getReview(id)!.text));
  assert.match(durability.note,/No lifetime score/);
});

test('switch regenerates its own dissent, literal counts and exact seeded citations',()=>{
  const profile=createProfile('dissent',now);
  const socks=selectContender(profile,{fromSkuId:'socks',skuId:'socksBudget',requestId:'pilling',origin:'scene'},now);
  assert.match(socks.verdict.dissent,/2 of 17 seeded reviews mention pilling \(12%\)/);
  assert.deepEqual(socks.verdict.citations,['B04','B14']);
  assert.match(socks.verdict.dissent,/less than your previous pick/);
  const kettle=selectContender(profile,{fromSkuId:'kettleAlt',skuId:'kettle',requestId:'lid',origin:'ask'},now);
  assert.match(kettle.verdict.dissent,/2 of 16 seeded reviews mention a loose lid \(13%\)/);
  assert.deepEqual(kettle.verdict.citations,['kettle-013','kettle-016']);
  assert(kettle.verdict.citations.every(id=>getReview(id)!.skuId==='kettle'));
  assert.equal(kettle.profile.decisions.length,0);
  assert.deepEqual(kettle.profile.lastVerdict,{requestId:'lid',pickSkuId:'kettle',runnerUpSkuId:'kettleAlt'});
});

test('swap learns only observed choice and tradeoff, is idempotent, and erasure removes effects',()=>{
  const original=createProfile('remember-swap',now),result=selectContender(original,swap,now);
  assert.equal(result.profile.xp,original.xp);
  const line=result.profile.memoryLines.find(item=>item.kind==='swap')!;
  assert.match(line.source,/^from your swap, /);
  assert.deepEqual(Object.keys(line.contributions!).sort(),['choice:kettleAlt',PRICE_TRAIT].sort());
  assert(!Object.keys(result.profile.traits).some(key=>key.includes(':palette:')));
  const repeated=selectContender(result.profile,swap,now);
  assert.deepEqual(repeated,result);
  const deleted=deleteMemory(result.profile,line.id,now);
  assert.equal(deleted.traits['choice:kettleAlt'],undefined);assert.equal(deleted.traits[PRICE_TRAIT],undefined);
  assert.notEqual(buildComparison(deleted,'kettleAlt').main.badge.kind,'best-for-you');
  assert.deepEqual(selectContender(deleted,swap,now).profile,deleted,'retry must not resurrect erased preference');
  const expensive=selectContender(original,{fromSkuId:'socksBudget',skuId:'socksRunner',requestId:'review-choice',origin:'ask'},now);
  assert.equal(expensive.profile.traits[REVIEW_TRAIT],1);
  assert.equal(expensive.profile.traits[PRICE_TRAIT],undefined);
  assert.throws(()=>selectContender(result.profile,{...swap,skuId:'compare-kettle-1'},now),/different choice/);
});

test('call swap replaces just its unassigned pending original, preserves other work and locks the replacement',()=>{
  let profile=createProfile('call-swap',now);
  profile=addDecision(profile,'kettle','from your call, 25 Oct 2026',now).profile;
  profile=addDecision(profile,'mugs','from your scene',now).profile;
  const untouched=structuredClone(profile.decisions.find(item=>item.skuId==='mugs')!);
  profile.pretend2am=true;
  const result=selectContender(profile,{...swap,origin:'call'},now);
  assert(!result.profile.decisions.some(item=>item.skuId==='kettle'));
  assert.deepEqual(result.profile.decisions.find(item=>item.skuId==='mugs'),untouched);
  const chosen=result.profile.decisions.find(item=>item.skuId==='kettleAlt')!;
  assert(isDecisionLocked(result.profile,chosen,now));assert.equal(chosen.approvedAt,null);
  assert.equal(result.profile.xp,profile.xp);assert.deepEqual(result.profile.owned,profile.owned);
  assert.deepEqual(selectContender(result.profile,{...swap,origin:'call'},now).profile,result.profile);
});

test('call selection does not remove a delegated or other-source original and preserves an existing target',()=>{
  let profile=addDecision(createProfile('protected',now),'kettle','from your call, 25 Oct 2026',now).profile;
  profile=assignDelegation(profile,{skuId:'kettle',budgetCap:40000,watchPrice:true,haggle:true,bundle:false,scheduleDelivery:true},now).profile;
  const original=structuredClone(profile.decisions[0]);
  profile=addDecision(profile,'kettleAlt','from your scene',now).profile;
  const target=structuredClone(profile.decisions.find(item=>item.skuId==='kettleAlt')!);
  const result=selectContender(profile,{...swap,origin:'call'},now);
  assert.deepEqual(result.profile.decisions.find(item=>item.skuId==='kettle'),original);
  assert.deepEqual(result.profile.decisions.find(item=>item.skuId==='kettleAlt'),target);
  const otherSource=addDecision(createProfile('other',now),'kettle','from your scene',now).profile;
  assert(selectContender(otherSource,{...swap,origin:'call'},now).profile.decisions.some(item=>item.skuId==='kettle'));
});

test('comparison HTTP route persists isolated swaps offline without any fetch, enforces guards and erasure', {concurrency:false},async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'coupi-comparison-'));
  const oldData=process.env.COUPI_DATA_DIR,oldOffline=process.env.DEMO_OFFLINE,oldFetch=globalThis.fetch;
  process.env.COUPI_DATA_DIR=root;process.env.DEMO_OFFLINE='1';
  let calls=0;globalThis.fetch=(async()=>{calls++;throw new Error('Comparison must not fetch');}) as typeof fetch;
  const origin='http://localhost:3000';let cookie='';
  async function send(handler:(request:Request)=>Promise<Response>,pathname:string,body?:Record<string,unknown>,useCookie=true){
    const response=await handler(new Request(origin+pathname,{method:body?'POST':'GET',headers:{origin,...(useCookie&&cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}));
    if(useCookie&&response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie')!.split(';')[0];
    return {status:response.status,body:await response.json() as {profile:Profile;verdict:any;code?:string}};
  }
  try{
    const initial=await send(getProfile,'/api/profile');assert.equal(initial.status,200);
    await send(postProfile,'/api/profile',{action:'settings',pretend2am:true});
    await send(decisionRoute,'/api/decisions',{action:'add',skuId:'kettle',source:'from your call, 25 Oct 2026'});
    const request={...swap,origin:'call'},first=await send(compareRoute,'/api/compare',request);
    assert.equal(first.status,200);assert.equal(first.body.verdict.pickSkuId,'kettleAlt');assert.equal(first.body.profile.xp,0);
    assert(first.body.profile.decisions.find(item=>item.skuId==='kettleAlt')?.lockedUntil);
    assert(!first.body.profile.decisions.some(item=>item.skuId==='kettle'));
    const repeat=await send(compareRoute,'/api/compare',request);assert.deepEqual(repeat.body,first.body);
    const disk=JSON.parse(await readFile(path.join(root,first.body.profile.id+'.json'),'utf8'));
    assert.equal(disk.lastVerdict.pickSkuId,'kettleAlt');
    const isolated=await send(getProfile,'/api/profile',undefined,false);assert.notEqual(isolated.body.profile.id,first.body.profile.id);assert.equal(isolated.body.profile.memoryLines.length,0);
    const line=first.body.profile.memoryLines.find(item=>item.kind==='swap')!;
    const deletion=await send(postProfile,'/api/profile',{action:'deleteMemory',lineId:line.id});
    assert.equal(deletion.body.profile.traits['choice:kettleAlt'],undefined);assert.equal(deletion.body.profile.traits[PRICE_TRAIT],undefined);
    const replay=await send(compareRoute,'/api/compare',request);assert.deepEqual(replay.body.profile,deletion.body.profile);
    for(const [skuId,status,code] of [['detergent',409,'OWNED_ITEM'],['skinCream',409,'QUARANTINED'],['mugs',400,'DIFFERENT_PURPOSE'],['unknown',400,'UNKNOWN_SKU']] as const){
      const invalid=await send(compareRoute,'/api/compare',{...request,requestId:'bad-'+skuId,skuId});assert.equal(invalid.status,status);assert.equal(invalid.body.code,code);
    }
    assert.equal((await send(compareRoute,'/api/compare',{...request,origin:'buy-now'})).status,400);
    assert.equal(calls,0);
  }finally{
    globalThis.fetch=oldFetch;if(oldData===undefined)delete process.env.COUPI_DATA_DIR;else process.env.COUPI_DATA_DIR=oldData;
    if(oldOffline===undefined)delete process.env.DEMO_OFFLINE;else process.env.DEMO_OFFLINE=oldOffline;
    await rm(root,{recursive:true,force:true});
  }
});
