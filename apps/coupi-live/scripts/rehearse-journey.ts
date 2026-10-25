/** Genuine provider/cache rehearsal of the five-step journey. No model fixtures or browser-profile writes. */
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {extname} from 'node:path';
import {createProfile,eligibleCatalog} from '../lib/profile';
import {getSku,getReview} from '../lib/catalog';
import {handleCall} from '../lib/server/call';
import {generateWorld} from '../lib/server/world';
import {answerQuestion} from '../lib/server/services';
import {assignDelegation} from '../lib/delegation';
import {approveDecisions} from '../lib/guardrails';
import type {CallMeta} from '../lib/types';

// Noon in Seoul. The CLI clock is frozen so confidence decay, dates and cache inputs replay identically.
const REHEARSAL_TIME='2026-10-25T03:00:00.000Z';
const ANSWERS=[
  'I live alone. My mornings are slow: I make matcha, then have breakfast at my small kitchen counter.',
  'On weekends I cook at home. I like simple tofu soup and fresh greens, and I usually cook four evenings a week.',
  'I work from a small desk by a window. I like warm neutrals, natural materials and a clear surface.',
  'I am saving for a holiday. Keep any one little district under 150000 Korean won, and I prefer useful things over extras.',
  'I want easier mornings and a less cluttered desk. Small, practical pieces would help; I do not want more clutter.',
];

function argumentsFor(argv:string[]) {
  let photo:string|undefined,photoMessage='Can you help with what I’m looking at?';
  for(let index=0;index<argv.length;index++) {
    const arg=argv[index];
    if(arg==='--help'||arg==='-h')return{help:true,photo,photoMessage};
    if(arg.startsWith('--photo='))photo=arg.slice('--photo='.length);
    else if(arg==='--photo')photo=argv[++index];
    else if(arg.startsWith('--photo-message='))photoMessage=arg.slice('--photo-message='.length);
    else if(arg==='--photo-message')photoMessage=argv[++index]||'';
    else throw new Error(`Unknown option: ${arg}. Use --help.`);
    if((arg==='--photo'||arg.startsWith('--photo='))&&!photo)throw new Error('Give --photo a JPEG, PNG or WebP path.');
  }
  if(photoMessage.length>3000)throw new Error('Keep the photo message under 3000 characters.');
  return{help:false,photo,photoMessage};
}

function freezeClock() {
  const NativeDate=Date,fixed=NativeDate.parse(REHEARSAL_TIME);
  globalThis.Date=new Proxy(NativeDate,{
    construct(target,args){return Reflect.construct(target,args.length?args:[fixed]);},
    apply(){return new NativeDate(fixed).toString();},
    get(target,property,receiver){return property==='now'?()=>fixed:Reflect.get(target,property,receiver);},
  });
  return()=>{globalThis.Date=NativeDate;};
}

async function main() {
  const options=argumentsFor(process.argv.slice(2));
  if(options.help) {
    console.log(`COUPI journey rehearsal

  npm run rehearse:journey
  DEMO_OFFLINE=1 npm run rehearse:journey
  npm run rehearse:journey -- --photo=/absolute/path/fridge.jpg
  DEMO_OFFLINE=1 npm run rehearse:journey -- --photo=/absolute/path/fridge.jpg

Optional: --photo-message="what you want to say about the photo"

Uses the configured real OpenAI model and the existing response cache.
Keeps its demo profile in memory; never replaces your browser profile.
Freeze date: ${REHEARSAL_TIME}. Orders and negotiations remain local simulations.
Use identical wording/photo bytes/model/code online and offline.`);
    return;
  }
  const offline=process.env.DEMO_OFFLINE==='1';
  const restoreClock=freezeClock(),realFetch=globalThis.fetch;
  let networkAttempts=0;
  const meta:CallMeta[]=[];
  globalThis.fetch=(async(...args:Parameters<typeof fetch>)=>{
    networkAttempts++;
    if(offline)throw new Error('Offline rehearsal attempted network access.');
    return realFetch(...args);
  }) as typeof fetch;
  function record(value?:CallMeta) {
    if(!value)return;
    meta.push(value);
    if(offline)assert(value.offline&&value.cached,'Every offline model result must be a validated cache hit.');
  }
  try {
    const now=new Date(REHEARSAL_TIME);
    console.log(`COUPI journey · ${offline?'CACHE ONLY':'LIVE PROVIDER + RESPONSE CACHE'}`);
    console.log(`Demo clock: ${REHEARSAL_TIME} · in-memory profile · synthetic catalog/orders`);
    let profile=createProfile('journey-rehearsal-v1',now);
    profile=(await handleCall(profile,{action:'hatch',requestId:'journey-hatch-v1'},now)).profile;
    const start=await handleCall(profile,{action:'start',requestId:'journey-call-start-v1'},now);profile=start.profile;
    assert(profile.journey?.hatched);assert.equal(start.interviewCount,0);
    console.log('✓ 1 / Hatch → first call.');

    for(const [index,message] of ANSWERS.entries()) {
      const result=await handleCall(profile,{action:'message',requestId:`journey-answer-v1-${index+1}`,message},now);
      if(result.status!=='ok')throw new Error(`Interview answer ${index+1}: ${result.message}`);
      profile=result.profile;record(result.meta);
      assert.equal(result.interviewCount,index+1);
      assert(result.memories.some(line=>line.source==='from our first call'),'The answer should create a visible first-call memory.');
      assert(result.memories.every(line=>line.confidence>=0&&line.confidence<=1));
      console.log(`  answer ${index+1}/5 → ${result.memories.length} sourced ${result.memories.length===1?'memory':'memories'}`);
    }
    assert(profile.journey?.interviewComplete);assert.equal(profile.journey.interviewCount,5);
    console.log('✓ 2 / Five real answers → live memory with sources and confidence.');

    const world=await generateWorld(profile,{requestId:'journey-world-v1'});profile=world.profile;record(world.meta);
    assert(world.districts.length>=2&&world.districts.length<=4);
    const surviving=new Set(profile.memoryLines.map(line=>line.id));
    for(const district of world.districts) {
      assert(district.sourceMemoryIds.every(id=>surviving.has(id)));
      assert(district.scene.items.every(item=>getSku(item.skuId)));
      console.log(`  ${district.name} → ${district.scene.items.map(item=>item.skuId).join(', ')}`);
    }
    console.log('✓ 3 / World generation → 2–4 sourced districts.');

    const sceneItems=world.districts.flatMap(district=>district.scene.items);
    const item=sceneItems.find(row=>(getSku(row.skuId)?.reviewIds.length||0)>0)||sceneItems[0];
    const sku=getSku(item.skuId)!;
    const answer=await answerQuestion(profile,{requestId:'journey-focused-verdict-v1',pickSkuId:sku.id,question:`Evaluate this exact listed product, ${sku.name} (SKU ${sku.id}), for my current story. Use only available catalog facts and reviews, with an honest drawback and runner-up. I am inspecting this item, not asking you to invent dimensions or replace it.`});
    profile=answer.profile;
    if(answer.status!=='verdict'||!answer.verdict.pickSkuId) {
      throw new Error(answer.status==='clarify'?`The focused verdict needs clarification: ${answer.verdict.clarifyingQuestion}`:answer.status==='blocked'||answer.status==='fallback'?answer.message:'The focused verdict did not complete.');
    }
    record(answer.meta);assert.equal(answer.verdict.pickSkuId,sku.id);
    assert(answer.verdict.citations.every(id=>getReview(id)));
    console.log(`✓ 4 / ${sku.name} → focused verdict with ${answer.verdict.citations.length} real corpus citation IDs.`);

    const xp=profile.xp;
    const assignment=assignDelegation(profile,{skuId:sku.id,budgetCap:sku.price,watchPrice:true,haggle:true,bundle:true,scheduleDelivery:true,source:'journey rehearsal district'},now);
    if(assignment.blocked||!assignment.decision?.delegation)throw new Error(assignment.blocked||'No delegation plan was created.');
    profile=assignment.profile;
    const job=assignment.decision.delegation;
    assert.equal(assignment.decision.approvedAt,null);assert.equal(assignment.decision.lockedUntil,null);
    assert(job.quotedPrice>=job.floorPrice&&job.quotedPrice<=job.budgetCap);
    assert.equal(profile.xp,xp);
    const approval=approveDecisions(profile,[assignment.decision.id],now);
    assert.equal(approval.approved.length,1,approval.blocked.join(' '));profile=approval.profile;
    assert(profile.owned.some(owned=>owned.skuId===sku.id));assert.equal(profile.xp,xp);
    console.log(`✓ 5 / Delegate → code-bounded ${job.status} plan → explicit approval. XP unchanged.`);

    const beforeOwned=networkAttempts;
    const refused=await handleCall(profile,{action:'message',requestId:'journey-owned-v1',message:'Buy the everyday laundry detergent.'},now);
    assert.equal(refused.status,'blocked');assert.equal(networkAttempts,beforeOwned);assert.equal(refused.meta,undefined);
    console.log('✓ Owned detergent refused before a provider call.');

    const nightSku=eligibleCatalog(profile)[0];assert(nightSku,'A second eligible item is needed for the lock check.');
    const night=assignDelegation({...profile,pretend2am:true},{skuId:nightSku.id,budgetCap:nightSku.price,watchPrice:true,haggle:true,bundle:true,scheduleDelivery:true,source:'2am guard rehearsal'},now);
    assert(night.decision?.lockedUntil,'The 2am decision must be locked.');
    const held=approveDecisions(night.profile,[night.decision.id],now);
    assert.equal(held.approved.length,0);assert(held.blocked.some(message=>message.includes('7:00 AM')));assert.equal(held.profile.xp,profile.xp);
    console.log('✓ Pretend 2am delegation remains locked when approval is attempted.');

    if(options.photo) {
      const details=await stat(options.photo);if(details.size>8_000_000)throw new Error('Keep the photo under 8 MB.');
      const mime=({'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'} as Record<string,string>)[extname(options.photo).toLowerCase()];
      if(!mime)throw new Error('The photo must be JPEG, PNG or WebP.');
      const buffer=await readFile(options.photo);
      const result=await handleCall(profile,{action:'message',requestId:'journey-photo-v1',message:options.photoMessage,image:{buffer,mime}},now);
      if(result.status!=='ok')throw new Error(`Photo call: ${result.message}`);
      profile=result.profile;record(result.meta);
      console.log(`✓ Permanent photo call → ${result.inventory?'inventory':result.verdict?.pickSkuId?'comparison/verdict':result.question?'clarification':'conversation'}; ${result.proposedSkuIds.length} guarded proposal(s).`);
    }
    if(offline)assert.equal(networkAttempts,0,'Offline replay must never attempt network access.');
    console.log(`Complete: ${meta.length} model results, ${meta.filter(value=>value.cached).length} cache hits, ${networkAttempts} network requests.`);
    console.log(offline?'Offline journey passed with zero network.':'Rehearsed. Run the identical command with DEMO_OFFLINE=1 for the zero-network check.');
  } finally {globalThis.fetch=realFetch;restoreClock();}
}

main().catch(error=>{console.error('Journey rehearsal stopped:',error instanceof Error?error.message:'Unknown error');process.exitCode=1;});
