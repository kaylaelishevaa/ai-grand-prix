import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {answerQuestion} from '../lib/server/services';
import {createProfile,deleteMemory} from '../lib/profile';
import {remember,REVIEW_TRAIT} from '../lib/memory';
import {reviewsForSku} from '../lib/catalog';
import type {District} from '../lib/journey-types';
import type {Verdict} from '../lib/types';

const now=new Date();
function socksVerdict(pickSkuId='socksBudget',runnerUpSkuId='socksRunner'):Verdict {
  const row=reviewsForSku(pickSkuId).find(review=>review.stars===1)||reviewsForSku(pickSkuId)[0];
  return{pickSkuId,runnerUpSkuId,reason:'This is the exact product you opened.',dissent:row.text,citations:[row.id],whyRunnerUpLost:'The other listed socks have a different price and review record.',clarifyingQuestion:null};
}

test('opening a specific hotspot cannot silently swap its verdict, even under a learned ranking preference',{concurrency:false},async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'coupi-focused-verdict-'));
  const names=['COUPI_CACHE_DIR','OPENAI_API_KEY','OPENAI_MODEL','DEMO_OFFLINE'] as const;
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const previousFetch=globalThis.fetch,previousInfo=console.info;
  process.env.COUPI_CACHE_DIR=root;process.env.OPENAI_API_KEY='TEST_ONLY_FOCUSED_VERDICT';process.env.OPENAI_MODEL='test-model';process.env.DEMO_OFFLINE='0';console.info=()=>{};
  let mode:'correct'|'wrong-once'|'wrong-always'='correct',calls=0;
  globalThis.fetch=(async(_url,init)=>{
    calls++;const body=JSON.parse(String(init?.body)),input=JSON.parse(body.input[0].content[0].text);
    assert.equal(input.inspectedSkuId,'socksBudget');
    const wrong=mode==='wrong-always'||(mode==='wrong-once'&&calls===1);
    const output=wrong?socksVerdict('socksRunner','socksBudget'):socksVerdict();
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}],usage:{input_tokens:10,output_tokens:10}});
  }) as typeof fetch;
  try {
    const profile=remember(createProfile('focus'),{id:'review-preference',text:'prefers reviews over price',source:'from your explicit preference',confidence:1,kind:'call',contributions:{[REVIEW_TRAIT]:5}},now);
    const response=await answerQuestion(profile,{requestId:'focused',pickSkuId:'socksBudget',question:'Evaluate this exact catalog item for me.'});
    assert.equal(response.status,'verdict');if(response.status==='verdict')assert.equal(response.verdict.pickSkuId,'socksBudget','Post-model ranking must not replace the object being inspected');
    assert.equal(calls,1);
    calls=0;mode='wrong-once';
    const retried=await answerQuestion(profile,{requestId:'retry-focus',pickSkuId:'socksBudget',question:'Evaluate this exact catalog item; explain its material.'});
    assert.equal(retried.status,'verdict');assert.equal(calls,2);if(retried.status==='verdict')assert.equal(retried.verdict.pickSkuId,'socksBudget');
    calls=0;mode='wrong-always';
    const fallback=await answerQuestion(profile,{requestId:'reject-focus',pickSkuId:'socksBudget',question:'Evaluate this exact item; do not substitute another sock.'});
    assert.equal(fallback.status,'fallback');assert.equal(calls,2);assert.equal(fallback.profile.answeredQuestionIds.length,0);
  } finally {globalThis.fetch=previousFetch;console.info=previousInfo;for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}await rm(root,{recursive:true,force:true});}
});

test('erasing a source removes dependent districts and pending conversation, without erasing unrelated districts',()=>{
  let profile=remember(createProfile('district-delete'),{id:'morning-story',text:'I have matcha every morning.',source:'from our first call',confidence:0.9,kind:'call'},now);
  profile=remember(profile,{id:'desk-story',text:'I work at a small desk.',source:'from our first call',confidence:0.9,kind:'call'},now);
  const district=(id:string,sources:string[]):District=>({id,name:id,provenance:'from your story',sourceMemoryIds:sources,scene:{name:id,explanation:'Sourced from your story.',items:[{skuId:'matcha',oneLiner:'For your morning.'},{skuId:'tray',oneLiner:'A small surface.'}]},createdAt:now.toISOString()});
  profile.journey={hatched:true,interviewCount:5,interviewComplete:true,nextQuestion:'',processedCallIds:[],districts:[district('mornings',['morning-story']),district('mixed',['morning-story','desk-story']),district('desk',['desk-story'])],pendingCall:{memoryId:'morning-story',question:'What is your morning budget?'},lastReply:'I remember your matcha mornings.'};
  const after=deleteMemory(profile,'morning-story',now);
  assert.deepEqual(after.journey?.districts.map(item=>item.id),['desk']);
  assert.equal(after.journey?.pendingCall,undefined);assert.equal(after.journey?.lastReply,undefined);
  assert.equal(after.memoryLines.some(line=>line.id==='morning-story'),false);assert.equal(after.memoryLines.some(line=>line.id==='desk-story'),true);
  assert.equal(after.journey?.interviewComplete,true,'Erasure should not force a repeat onboarding interview');
});
