import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {POST as personalizationRoute} from '../app/api/personalization/route';
import {POST as callRoute} from '../app/api/call/route';
import {createProfile,deleteMemory,sanitizeProfileForAI} from '../lib/profile';
import {remember} from '../lib/memory';
import {handlePersonalization,personalizationProposal,safePersonalizationCandidates} from '../lib/server/personalization';
import {handleCall,hasCallWorldContext,FIRST_CALL_QUESTIONS} from '../lib/server/call';
import {generateWorld} from '../lib/server/world';
import type {PersonalizationResponse,PersonalizationReview} from '../lib/personalization';
import type {CallResponse} from '../lib/journey-types';
import type {Profile} from '../lib/types';

const now=new Date(),origin='http://localhost:3007';
const emptyReview:PersonalizationReview={interests:[],vibe:null,budgetPerItem:null,story:''};
const input=(action:'start'|'draft'|'confirm'|'discard',requestId:string,draftId?:string,review?:PersonalizationReview)=>({action,requestId,...(draftId?{draftId}:{}),...(review?{review}:{})});

test('review start reuses the server draft; stale and cross-profile IDs cannot change another draft',()=>{
  const base=createProfile('review-one',now),first=handlePersonalization(base,input('start','first'),now);
  assert(first.draftId);assert.equal(first.worldReady,false);assert.deepEqual(base.memoryLines,[]);
  const resumed=handlePersonalization(first.profile,input('start','resume'),now);
  assert.equal(resumed.draftId,first.draftId);assert.equal(resumed.profile.xp,base.xp);
  resumed.profile.journey!.interviewPaused=true;resumed.profile.journey!.personalizationDraft!.answerCount=2;resumed.profile.journey!.nextQuestion='old question';
  const optedInAgain=handlePersonalization(resumed.profile,input('start','opt-in-again'),now);
  assert.equal(optedInAgain.profile.journey?.interviewPaused,false);assert.equal(optedInAgain.profile.journey?.personalizationDraft?.answerCount,2);assert.equal(optedInAgain.profile.journey?.nextQuestion,FIRST_CALL_QUESTIONS[2]);
  assert.throws(()=>handlePersonalization(createProfile('review-two',now),input('confirm','other',first.draftId,{...emptyReview,story:'A quiet corner.'}),now),/no longer current/);
  assert.throws(()=>handlePersonalization(first.profile,input('discard','stale','different'),now),/no longer current/);
  assert.throws(()=>handlePersonalization(first.profile,input('draft','first',first.draftId),now),/already used/);
});

test('confirmation persists only edited fields, separate deletable memories and a soft per-item budget',()=>{
  const original=remember(createProfile('review-confirm',now),{id:'unrelated',text:'I read on Sundays.',source:'from an earlier call',confidence:.9,kind:'call'},now);
  const start=handlePersonalization(original,input('start','start'),now);
  const review:PersonalizationReview={interests:['cozy_home','outdoors'],vibe:'calm',budgetPerItem:30000,story:'I sketch beside a window.'};
  const result=handlePersonalization(start.profile,input('confirm','confirm',start.draftId,review),now);
  assert.equal(result.worldReady,true);assert.equal(result.profile.journey?.interviewComplete,true);assert.equal(result.profile.journey?.personalizationDraft,undefined);
  assert.equal(result.profile.budget,original.budget);assert.equal(result.profile.xp,original.xp);assert.deepEqual(result.profile.traits,original.traits);assert.equal(result.profile.decisions.length,0);
  const lines=result.profile.memoryLines.filter(line=>line.kind==='call-review');assert.equal(lines.length,5);
  assert(lines.every(line=>line.source==='confirmed in your first-call review'&&line.confidence===.98&&line.traitKeys.length===0));
  assert.match(lines.find(line=>line.text.includes('₩'))!.text,/per item.*₩30,000.*not spending permission/);
  assert(hasCallWorldContext(result.profile));
  const erased=deleteMemory(result.profile,lines.find(line=>line.text.includes('window'))!.id,now);
  assert(!JSON.stringify(sanitizeProfileForAI(erased)).includes('window'));assert(erased.memoryLines.some(line=>line.id==='unrelated'));
  const replay=handlePersonalization(erased,input('confirm','confirm',start.draftId,review),now);
  assert.deepEqual(replay.profile,erased,'A receipt never reintroduces a deleted preference');
  assert.throws(()=>handlePersonalization(erased,input('confirm','confirm',start.draftId,{...review,vibe:'bold'}),now),/already used/);
  assert.throws(()=>handlePersonalization(erased,input('confirm','new-confirm',start.draftId,review),now),/no longer current/);
  let forgotten=result.profile;for(const id of result.profile.journey!.personalizationMemoryIds!)forgotten=deleteMemory(forgotten,id,now);
  forgotten=deleteMemory(forgotten,'unrelated',now);assert.equal(hasCallWorldContext(forgotten),false);
});

test('revised review replaces only its earlier memory batch; null style is never learned as mixed',()=>{
  let result=handlePersonalization(createProfile('review-edit',now),input('start','start'),now);
  result=handlePersonalization(result.profile,input('confirm','first-confirm',result.draftId,{...emptyReview,story:'I enjoy tea.'}),now);
  const oldIds=result.profile.journey!.personalizationMemoryIds!;
  const withOther=remember(result.profile,{id:'other',text:'I have a small desk.',source:'from a later call',confidence:.9,kind:'call'},now);
  result=handlePersonalization(withOther,input('start','edit'),now);
  result=handlePersonalization(result.profile,input('confirm','edit-confirm',result.draftId,{...emptyReview,interests:['focused_work']}),now);
  assert(!result.profile.memoryLines.some(line=>oldIds.includes(line.id)));
  assert(result.profile.memoryLines.some(line=>line.id==='other'));
  assert.equal(result.profile.memoryLines.filter(line=>line.kind==='call-review').length,1);
  assert(!JSON.stringify(sanitizeProfileForAI(result.profile)).includes('mixed'));
});

test('quarantined draft statements never enter proposals; empty/private-only review cannot unlock worlds',()=>{
  const start=handlePersonalization(createProfile('review-private',now),input('start','start'),now);
  const privateLine=remember(start.profile,{id:'draft-private',text:'I want personal-care products.',source:'from this call',confidence:.9,kind:'call'},now).memoryLines.at(-1)!;
  const draft=start.profile.journey!.personalizationDraft!;draft.candidates=[privateLine];
  assert.deepEqual(safePersonalizationCandidates(start.profile,draft),[]);
  assert.deepEqual(personalizationProposal(start.profile,draft),emptyReview);
  assert.throws(()=>handlePersonalization(start.profile,input('confirm','empty',start.draftId,emptyReview),now),/Keep one interest/);
  assert.throws(()=>handlePersonalization(start.profile,input('confirm','private',start.draftId,{...emptyReview,story:'I want personal-care products.'}),now),/context is private/);
  assert.equal(start.profile.memoryLines.length,0,'A failed confirmation is atomic');
  start.profile.quarantine.push({category:'wardrobe',sensitive:true,note:'Private now'});
  assert.throws(()=>handlePersonalization(start.profile,input('confirm','private-type',start.draftId,{...emptyReview,story:'I want an everyday dress.'}),now),/context is private/);
  const discarded=handlePersonalization(start.profile,input('discard','discard',start.draftId),now);
  assert.equal(discarded.profile.journey?.personalizationDraft,undefined);assert.equal(discarded.worldReady,false);assert.equal(discarded.profile.memoryLines.length,0);
});

async function fixture(run:(context:{root:string;calls:Record<string,any>[];setBuy:(value:boolean)=>void})=>Promise<void>){
  const root=await mkdtemp(path.join(tmpdir(),'coupi-review-')),names=['COUPI_DATA_DIR','COUPI_CACHE_DIR','OPENAI_API_KEY','OPENAI_MODEL','DEMO_OFFLINE'] as const;
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]])),oldFetch=globalThis.fetch,oldInfo=console.info;
  Object.assign(process.env,{COUPI_DATA_DIR:path.join(root,'profiles'),COUPI_CACHE_DIR:path.join(root,'cache'),OPENAI_API_KEY:'TEST_ONLY_REVIEW_KEY',OPENAI_MODEL:'test-model',DEMO_OFFLINE:'0'});
  let buy=false;const calls:Record<string,any>[]=[];console.info=()=>{};
  globalThis.fetch=(async(url,init)=>{
    assert.equal(String(url),'https://api.openai.com/v1/responses');const body=JSON.parse(String(init?.body)),value=JSON.parse(body.input[0].content[0].text);calls.push(value);
    const output=buy?{intent:'buy',answeredInterviewQuestion:false,message:'A cream kettle.',memories:[],verdict:{pickSkuId:'kettle',reason:'A cream pour-over kettle.',dissent:'Two seeded reviews report a loose lid.',citations:['kettle-013','kettle-014'],runnerUpSkuId:null,whyRunnerUpLost:'',clarifyingQuestion:null},inventory:null}:{intent:'talk',answeredInterviewQuestion:value.interview.active,message:'That helps me understand.',memories:[{text:value.message,evidenceQuote:value.message,confidence:.9}],verdict:null,inventory:null};
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}],usage:{input_tokens:20,output_tokens:20}});
  }) as typeof fetch;
  try{await run({root,calls,setBuy(value){buy=value;}});}finally{globalThis.fetch=oldFetch;console.info=oldInfo;for(const name of names)if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];await rm(root,{recursive:true,force:true});}
}

class Browser{
  cookie='';
  async send<T>(route:typeof personalizationRoute|typeof callRoute,body:unknown){const response=await route(new Request(origin+'/api/'+(route===callRoute?'call':'personalization'),{method:'POST',headers:{origin,cookie:this.cookie,'content-type':'application/json'},body:JSON.stringify(body)}));this.cookie=response.headers.get('set-cookie')?.split(';')[0]||this.cookie;return{status:response.status,body:await response.json() as T};}
}

test('five real talk turns stage a review; explicit confirmation alone unlocks current-profile world generation',{concurrency:false},async()=>{
  await fixture(async({calls,root})=>{
    const browser=new Browser();const started=await browser.send<PersonalizationResponse>(personalizationRoute,input('start','start'));assert.equal(started.status,200);
    const draftId=started.body.draftId!;let last:CallResponse|undefined;
    for(let i=0;i<5;i++){
      last=(await browser.send<CallResponse>(callRoute,{action:'message',requestId:'talk-'+i,personalizationDraftId:draftId,message:`I enjoy quiet activity ${i+1}.`})).body;
      assert.equal(last.interviewCount,i+1);assert.equal(last.interviewComplete,false);assert.equal(last.worldReady,false);assert.equal(last.profile.memoryLines.length,0);assert.deepEqual(last.profile.traits,{});assert.equal(last.memories.length,1);
      assert.equal(last.profile.journey?.nextQuestion,i===4?'':FIRST_CALL_QUESTIONS[i+1]);
      assert.equal(calls[i].profile.memoryLines.length,0);assert.equal(calls[i].unconfirmedCallContext.length,i);
    }
    assert.equal(last!.personalization?.reviewReady,true);assert.equal(last!.question,null);assert.doesNotMatch(last!.message,/building your world/);
    const duplicate=await browser.send<CallResponse>(callRoute,{action:'message',requestId:'talk-4',personalizationDraftId:draftId,message:'I enjoy quiet activity 5.'});
    assert.equal(duplicate.body.interviewCount,5);assert.equal(duplicate.body.profile.journey?.personalizationDraft?.candidates.length,5);assert.equal(calls.length,5);
    await assert.rejects(generateWorld(last!.profile,{requestId:'not-yet'}),/finish our first call/);
    const draft=await browser.send<PersonalizationResponse>(personalizationRoute,input('draft','draft',draftId,{...emptyReview,story:'INVENTED TOOL FACT'}));
    assert.match(draft.body.review!.story,/quiet activity 1/);assert(!draft.body.review!.story.includes('INVENTED'));
    assert.equal(calls.length,5,'Drafting adds no network/model request');
    const review={...emptyReview,story:'I draw beside the window.',budgetPerItem:30000};
    const confirmed=await browser.send<PersonalizationResponse>(personalizationRoute,input('confirm','confirm',draftId,review));
    assert.equal(confirmed.status,200);assert.equal(confirmed.body.worldReady,true);assert.equal(confirmed.body.profile.journey?.interviewCount,5);assert.equal(confirmed.body.profile.xp,25);assert.equal(calls.length,5);
    const serialized=JSON.stringify(confirmed.body.profile);assert(!serialized.includes('quiet activity'));assert(!serialized.includes('INVENTED TOOL FACT'));
    const stored=JSON.parse(await readFile(path.join(root,'profiles',confirmed.body.profile.id+'.json'),'utf8')) as Profile;assert.deepEqual(stored,confirmed.body.profile);
    const captured:unknown[]=[];
    await assert.rejects(generateWorld(stored,{requestId:'world'},{call:async request=>{captured.push(request.input);throw Error('CAPTURE_ONLY');}}),/CAPTURE_ONLY/);
    assert.match(JSON.stringify(captured),/draw beside the window/);assert(!JSON.stringify(captured).includes('quiet activity'));
    process.env.DEMO_OFFLINE='1';globalThis.fetch=async()=>{throw Error('NETWORK FORBIDDEN');};
    const replay=await browser.send<PersonalizationResponse>(personalizationRoute,input('confirm','confirm',draftId,review));assert.equal(replay.status,200);assert.deepEqual(replay.body.profile,stored);
  });
});

test('shopping interrupts draft discovery without committing staged preferences; resume preserves its count',{concurrency:false},async()=>{
  await fixture(async({setBuy,calls})=>{
    let started=handlePersonalization(createProfile('interrupt-review',now),input('start','start'),now);
    const talk=await handleCall(started.profile,{action:'message',requestId:'talk',personalizationDraftId:started.draftId,message:'I paint at weekends.'},now);
    setBuy(true);
    const buy=await handleCall(talk.profile,{action:'message',requestId:'buy',personalizationDraftId:started.draftId,message:'I need a kettle.'},now);
    assert.equal(buy.conversationMode,'request');assert.equal(buy.interviewCount,1);assert.equal(buy.profile.journey?.interviewPaused,true);assert.equal(buy.proposedSkuIds[0],'kettle');
    assert(!buy.profile.memoryLines.some(line=>line.text.includes('paint')));assert.equal(buy.profile.journey!.personalizationDraft!.candidates.length,1);
    const resumed=await handleCall(buy.profile,{action:'resumeInterview',requestId:'resume',personalizationDraftId:started.draftId},now);
    assert.equal(resumed.question,FIRST_CALL_QUESTIONS[1]);assert.equal(resumed.profile.journey?.nextQuestion,FIRST_CALL_QUESTIONS[1]);
    setBuy(false);
    const oldClient=await handleCall(resumed.profile,{action:'message',requestId:'older-client',message:'I sketch most nights.'},now);
    assert(!oldClient.profile.memoryLines.some(line=>line.text.includes('sketch')),'Server staging applies even if an older client omits the draft ID');
    await assert.rejects(handleCall(oldClient.profile,{action:'finishInterview',requestId:'bypass'}),/Review what I heard/);
    assert.equal(calls.length,3);
  });
});

test('review route rejects foreign origin and invalid fields without making a model call',{concurrency:false},async()=>{
  await fixture(async({calls})=>{
    const foreign=await personalizationRoute(new Request(origin+'/api/personalization',{method:'POST',headers:{origin:'http://other.example','content-type':'application/json'},body:JSON.stringify(input('start','start'))}));assert.equal(foreign.status,403);
    const browser=new Browser();for(const review of [{...emptyReview,budgetPerItem:0},{...emptyReview,budgetPerItem:10_000_001},{...emptyReview,interests:['cozy_home','cozy_home']},{...emptyReview,story:'x'.repeat(1201)},{...emptyReview,approved:true}]){const response=await browser.send(personalizationRoute,{...input('confirm','bad','missing'),review});assert.equal(response.status,400);}
    assert.equal(calls.length,0);
  });
});
