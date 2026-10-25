import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {POST as callRoute} from '../app/api/call/route';
import {POST as profileRoute} from '../app/api/profile/route';
import {createProfile,deleteMemory,eligibleCatalog} from '../lib/profile';
import {getReview,getSku} from '../lib/catalog';
import {comparisonGroupForSku} from '../lib/comparison-groups';
import {handleCall,journeyFor,validateCallOutput,mapCallGaps,callCandidates,FIRST_CALL_QUESTIONS,WORLD_BUILDING_MESSAGE,hasCallWorldContext} from '../lib/server/call';
import approvedProducts from '../data/teammate-catalog.json';
import type {CallResponse} from '../lib/journey-types';
import type {Profile} from '../lib/types';
import {remember} from '../lib/memory';
import {publicCallResult} from '../lib/call-bridge';

type Json=Record<string,any>;
const origin='http://localhost:3007';
const now=new Date('2026-10-25T03:00:00.000Z');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=','base64');
const initial=()=>createProfile('test-call-profile',now);
const completed=():Profile=>({...initial(),journey:{...journeyFor(initial()),hatched:true,interviewCount:5,interviewComplete:true,nextQuestion:''}});
const talk=(message:string)=>({intent:'talk',message:'That helps me understand your day.',memories:[{text:message,evidenceQuote:message,confidence:0.9}],verdict:null,inventory:null});
const kettleVerdict={pickSkuId:'kettle',reason:'A compact cream pour-over kettle.',dissent:'Two seeded reviews report a loose lid.',citations:['kettle-013','kettle-014'],runnerUpSkuId:'kettleAlt',whyRunnerUpLost:'The alternative has a different finish.',clarifyingQuestion:null};
const sourcedVerdict={pickSkuId:'1814412512-pink-sand',reason:'The sourced listing names Pink Sand.',dissent:'Its current price and stock are unverified.',citations:[],runnerUpSkuId:null,whyRunnerUpLost:'',clarifyingQuestion:null};
function savedWorld(ids:string[]):Profile{const profile=completed();profile.journey!.districts=[{id:'saved-world',name:'My existing world',provenance:'Your saved selection',sourceMemoryIds:[],createdAt:now.toISOString(),scene:{name:'My existing world',explanation:'A saved selection',items:ids.map(skuId=>({skuId,oneLiner:getSku(skuId)!.name}))}}];return profile;}
function assertStrictSchema(node:Json) {
  if(node.type==='object') {
    assert.equal(node.additionalProperties,false);
    assert.deepEqual([...(node.required||[])].sort(),Object.keys(node.properties||{}).sort(),'OpenAI strict schemas require all properties, including nullable ones');
  }
  for(const value of Object.values(node)) {
    if(Array.isArray(value)) {
      for(const child of value)if(child&&typeof child==='object')assertStrictSchema(child);
    } else if(value&&typeof value==='object')assertStrictSchema(value);
  }
}

async function fixture(run:(context:{root:string;calls:{input:Json;body:Json}[];setOutput:(output:(input:Json)=>Json)=>void})=>Promise<void>) {
  const root=await mkdtemp(path.join(tmpdir(),'coupi-call-'));
  const names=['COUPI_DATA_DIR','COUPI_CACHE_DIR','OPENAI_API_KEY','OPENAI_MODEL','DEMO_OFFLINE'] as const;
  const before=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const previousFetch=globalThis.fetch,previousInfo=console.info;
  const calls:{input:Json;body:Json}[]=[];
  let output:(input:Json)=>Json=(input:Json)=>talk(input.message);
  process.env.COUPI_DATA_DIR=path.join(root,'profiles');
  process.env.COUPI_CACHE_DIR=path.join(root,'responses');
  process.env.OPENAI_API_KEY='TEST_ONLY_CALL_CREDENTIAL';
  process.env.OPENAI_MODEL='test-model';
  process.env.DEMO_OFFLINE='0';
  console.info=()=>{};
  globalThis.fetch=(async (url,init)=>{
    assert.equal(String(url),'https://api.openai.com/v1/responses');
    const body=JSON.parse(String(init?.body)),input=JSON.parse(body.input[0].content[0].text);
    assert.equal(body.text.format.name,'companion_call');
    assert.equal(body.text.format.strict,true);
    assertStrictSchema(body.text.format.schema);
    assert.equal(body.store,false);
    calls.push({input,body});
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify((()=>{const result=output(input);return{answeredInterviewQuestion:input.interview.active&&result.intent==='talk',...result};})())}]}],usage:{input_tokens:101,output_tokens:35}});
  }) as typeof fetch;
  try {await run({root,calls,setOutput(value){output=value;}});}
  finally {globalThis.fetch=previousFetch;console.info=previousInfo;for(const name of names){if(before[name]===undefined)delete process.env[name];else process.env[name]=before[name];}await rm(root,{recursive:true,force:true});}
}

class Browser {
  cookie='';
  async send(body:Json,route=callRoute) {
    const response=await route(new Request(origin+'/api/call',{method:'POST',headers:{origin,cookie:this.cookie,'content-type':'application/json'},body:JSON.stringify(body)}));
    return this.consume(response);
  }
  async photo(message:string,bytes=png,mime='image/png') {
    const body=new FormData();body.set('action','message');body.set('requestId','photo-'+message);body.set('message',message);body.set('file',new File([bytes],'photo.png',{type:mime}));
    return this.consume(await callRoute(new Request(origin+'/api/call',{method:'POST',headers:{origin,cookie:this.cookie},body})));
  }
  private async consume(response:Response) {
    const cookie=response.headers.get('set-cookie');if(cookie)this.cookie=cookie.split(';')[0];
    return {status:response.status,body:await response.json() as CallResponse&{code?:string}};
  }
}

test('public shopping calls retain volunteered memory without onboarding; duplicate turns stay idempotent',{concurrency:false},async()=>{
  await fixture(async({calls,root})=>{
    const browser=new Browser();
    const hatch=await browser.send({action:'hatch',requestId:'hatch'});
    assert.equal(hatch.status,200);
    assert.equal(hatch.body.profile.journey?.hatched,true);
    assert.equal(hatch.body.message,'What do you want to buy?');
    const start=await browser.send({action:'start',requestId:'start'});
    assert.equal(start.body.message,'What do you want to buy?');
    assert.equal(start.body.question,null);
    assert.equal(calls.length,0);
    let latest:CallResponse=start.body;
    for(let i=0;i<5;i++) {
      latest=(await browser.send({action:'message',requestId:'answer-'+i,message:['I drink matcha in the morning.','I cook for one on weekends.','My desk is tiny.','I am saving for a holiday.','I want less clutter.'][i]})).body;
      assert.equal(latest.interviewCount,0);
      assert.equal(latest.memories.length,1);
      assert.match(latest.memories[0].source,/^from your call, /);
      assert.equal(latest.memories[0].confidence,0.9);
      assert(latest.memories[0].createdAt);
      assert.equal(latest.proposedSkuIds.length,0);
      assert.equal(latest.profile.decisions.length,0);
      assert(calls.at(-1)!.input.catalog.some((sku:Json)=>sku.id===sourcedVerdict.pickSkuId),'The same call can handle a sourced shopping need without a second classifier');
      assert.equal(calls.at(-1)!.input.reviews.length,0,'Synthetic reviews do not enter ordinary shopping');
      assert.equal(latest.conversationMode,'conversation');
      assert.equal(latest.worldReady,true);
      assert.match(calls.at(-1)!.body.instructions,/Accept spoken and typed requests in English and respond in English/);
      assert.match(calls.at(-1)!.body.instructions,/Please rephrase your request in English/);
      assert.match(calls.at(-1)!.body.instructions,/English request containing Korean proper names or a won amount is valid/);
      const duplicate=await browser.send({action:'message',requestId:'answer-'+i,message:['I drink matcha in the morning.','I cook for one on weekends.','My desk is tiny.','I am saving for a holiday.','I want less clutter.'][i]});
      assert.equal(duplicate.body.interviewCount,0);
      assert.equal(calls.length,i+1);
    }
    assert.equal(latest.interviewComplete,true);
    assert.equal(latest.question,null);
    assert.equal(latest.message,'That helps me understand your day.');
    assert.equal(latest.profile.xp,25);
    assert(!JSON.stringify(calls.at(-1)!.input).includes('lastReply'));
    const stored=JSON.parse(await readFile(path.join(root,'profiles',latest.profile.id+'.json'),'utf8'));
    assert.equal(stored.journey.interviewCount,0);
    assert.equal(stored.journey.transcript,undefined);
    const resume=await browser.send({action:'start',requestId:'resume'});
    assert.equal(resume.body.question,null);
    assert.equal(resume.body.message,'What do you want to buy?');
    assert.equal(calls.length,5);
  });
});

test('account requests navigate without provider calls, shopping side effects or retaining private address text',{concurrency:false},async()=>{
  await fixture(async({calls,root})=>{
    const browser=new Browser();
    const baseline=(await browser.send({action:'start',requestId:'account-start'})).body.profile;
    const privateAddress='88 Example Lane, unit TEST-7, 543210';
    for(const [section,message] of [
      ['addresses',`Please change my delivery address to ${privateAddress}.`],
      ['payments','Where can I change my payment settings?'],
    ] as const){
      const request={action:'message',requestId:`account-${section}`,message};
      const result=await browser.send(request);
      assert.equal(result.status,200);assert.equal(result.body.status,'ok');
      assert.equal(result.body.navigation?.href,`/account#${section}`);assert.equal(result.body.navigation?.section,section);
      assert.equal(result.body.conversationMode,'conversation');assert.equal(result.body.question,null);
      assert.deepEqual(result.body.memories,[]);assert.deepEqual(result.body.proposedSkuIds,[]);assert.equal(result.body.verdict,undefined);
      assert.deepEqual(result.body.profile.memoryLines,baseline.memoryLines);assert.deepEqual(result.body.profile.decisions,baseline.decisions);assert.equal(result.body.profile.xp,baseline.xp);
      assert.equal(result.body.interviewCount,0,'account setup does not consume an interview answer');
      assert.equal(calls.length,0,'private account requests never reach the provider');
      const stored=await readFile(path.join(root,'profiles',result.body.profile.id+'.json'),'utf8');
      assert(!stored.includes(privateAddress));assert(!stored.includes(message));assert(!JSON.stringify(result.body).includes(privateAddress));
      const receipt=JSON.parse(stored).journey.callReceipts.find((row:Json)=>row.requestId===request.requestId);
      assert.match(receipt.requestHash,/^[a-f0-9]{64}$/);assert.equal(receipt.message,undefined);assert.equal(receipt.text,undefined);
      const replay=await browser.send(request);
      assert.equal(replay.status,200);assert.deepEqual(replay.body.navigation,result.body.navigation);assert.equal(replay.body.message,result.body.message);
      assert.deepEqual(replay.body.profile.memoryLines,baseline.memoryLines);assert.deepEqual(replay.body.profile.decisions,baseline.decisions);assert.equal(replay.body.profile.xp,baseline.xp);
      assert.equal(replay.body.profile.journey?.callReceipts?.filter(row=>row.requestId===request.requestId).length,1);
      const conflict=await browser.send({...request,message:'Different words under the same turn ID.'});
      assert.equal(conflict.status,409);assert.equal(conflict.body.code,'CALL_REQUEST_CONFLICT');assert.equal(calls.length,0);
    }
  });
});

test('later calls infer shopping from the conversation and put only validated picks into the locked approval queue',{concurrency:false},async()=>{
  await fixture(async({calls,setOutput})=>{
    setOutput(()=>({intent:'buy',message:'Here is the sourced Pink Sand lipstick.',memories:[],verdict:sourcedVerdict,inventory:null}));
    const profile={...completed(),pretend2am:true};
    const result=await handleCall(profile,{action:'message',requestId:'buy-lipstick',message:'Find me pink lipstick.'},now);
    assert.equal(result.status,'ok');
    assert.equal(result.verdict?.pickSkuId,sourcedVerdict.pickSkuId);
    assert.deepEqual(result.verdict?.citations,[]);
    assert.deepEqual(result.proposedSkuIds,[sourcedVerdict.pickSkuId]);
    assert.equal(result.profile.decisions.length,1);
    assert(result.profile.decisions[0].lockedUntil);
    assert.equal(result.profile.decisions[0].approvedAt,null);
    assert.match(result.profile.decisions[0].source,/from your call, 25 Oct 2026/);
    assert.equal(result.interviewCount,5);
    assert.equal(calls[0].input.mode,undefined);
    assert.equal(calls[0].input.interview.active,false);
    assert(!calls[0].input.catalog.some((sku:Json)=>sku.id==='detergent'||sku.id==='skinCream'));
  });
});

test('a fresh shopping need is fulfilled in one call without consuming the first interview question',{concurrency:false},async()=>{
  await fixture(async({calls,setOutput})=>{
    setOutput(()=>({intent:'buy',message:'Here is the sourced Pink Sand lipstick.',memories:[],verdict:sourcedVerdict,inventory:null}));
    const browser=new Browser();
    const request={action:'message',requestId:'first-need',message:'A pink lipstick, please.'};
    const result=await browser.send(request);
    assert.equal(result.status,200);assert.equal(calls.length,1);
    assert(calls[0].input.catalog.every((sku:Json)=>approvedProducts.some(product=>product.id===sku.id)));
    assert.equal(calls[0].input.reviews.length,0);assert(JSON.stringify(calls[0].input).length<100000,'Ordinary shopping does not resend the 1202-review synthetic corpus');
    assert.deepEqual(calls[0].input.catalog.find((sku:Json)=>sku.id===sourcedVerdict.pickSkuId).sourceReviewEvidence,approvedProducts.find(product=>product.id===sourcedVerdict.pickSkuId)!.reviewEvidence);
    const verdictSchema=calls[0].body.text.format.schema.properties.verdict.anyOf.find((schema:Json)=>schema.type==='object');
    assert.equal(verdictSchema.properties.citations.maxItems,0,'The generated response cannot cite family-feedback IDs as seeded reviews');
    assert.equal(result.body.conversationMode,'request');assert.equal(result.body.interviewCount,0);
    assert.equal(result.body.interviewComplete,true);assert.equal(result.body.profile.journey?.interviewPaused,true);
    assert.equal(result.body.question,null);assert.equal(result.body.worldReady,true);
    assert.equal(result.body.verdict?.pickSkuId,sourcedVerdict.pickSkuId);assert.deepEqual(result.body.proposedSkuIds,[sourcedVerdict.pickSkuId]);
    assert.equal(result.body.profile.decisions[0].approvedAt,null);
    assert(result.body.memories.some(line=>line.kind==='call-request'&&line.text===request.message));
    const duplicate=await browser.send(request);
    assert.equal(duplicate.status,200);assert.equal(duplicate.body.conversationMode,'request');
    assert.deepEqual(duplicate.body.proposedSkuIds,[sourcedVerdict.pickSkuId]);assert.equal(duplicate.body.profile.decisions.length,1);
    assert.equal(duplicate.body.profile.xp,result.body.profile.xp);assert.equal(calls.length,1);
    const conflict=await browser.send({...request,message:'A different item now.'});
    assert.equal(conflict.status,409);assert.equal(conflict.body.code,'CALL_REQUEST_CONFLICT');assert.equal(calls.length,1);
  });
});

test('text-only discovery returns two sourced listings with prices and no forced review caveat',{concurrency:false},async()=>{
  await fixture(async({calls,setOutput})=>{
    const first=getSku('7612276799')!,second=getSku('6274724147')!;
    const reply=`Try ${first.name}, listed at ₩${first.price.toLocaleString('en-US')}, or ${second.name}, listed at ₩${second.price.toLocaleString('en-US')}. Which would you like to try?`;
    setOutput(()=>({intent:'buy',message:reply,memories:[],inventory:null,verdict:{pickSkuId:first.id,reason:'Two glasses listings to explore.',dissent:'',citations:[],runnerUpSkuId:second.id,whyRunnerUpLost:'',clarifyingQuestion:null}}));
    const result=(await new Browser().send({action:'message',requestId:'browse-glasses',message:'Show me glasses.'})).body;
    assert.equal(result.status,'ok');assert.equal(result.question,null);assert.equal(result.message,reply);assert.equal(calls.length,1);
    assert.equal(result.verdict?.dissent,'');assert.equal(result.verdict?.whyRunnerUpLost,'');
    const cards=publicCallResult(result).products;
    assert.deepEqual(cards.map(card=>({id:card.id,price:card.price})),[{id:first.id,price:first.price},{id:second.id,price:second.price}]);
    assert.equal(result.profile.decisions.length,1,'The alternate listing is shown without adding another pending decision');
    assert(cards.every(card=>card.delivery==='Delivery unknown · check the sourced listing'),'Suppressing generic narration must not conceal the underlying listing facts');
    assert.match(calls[0].body.instructions,/do not append generic warnings/);
    assert(!calls[0].body.input[0].content.some((part:Json)=>part.type==='input_image'));
    assert.match(calls[0].body.instructions,/a product type, occasion, or useful context is enough/);
    assert.match(calls[0].body.instructions,/Do not ask for images to recommend ordinary catalog products/);
    assert.equal(calls[0].body.text.format.schema.properties.message.maxLength,400);
  });
});

test('an explicitly requested fit or delivery guarantee retains its material uncertainty',{concurrency:false},async()=>{
  await fixture(async({setOutput,calls})=>{
    const reply='These listings do not confirm over-glasses fit or next-day delivery. Would you like to see the available frames?';
    setOutput(()=>({intent:'clarify',message:reply,memories:[],verdict:null,inventory:null}));
    const result=(await new Browser().send({action:'message',requestId:'specific-fit-delivery',message:'I need glasses guaranteed to fit over my prescription glasses and arrive tomorrow.'})).body;
    assert.equal(result.message,reply);assert.equal(result.question,reply);assert.deepEqual(result.proposedSkuIds,[]);assert.equal(calls.length,1);
    assert.deepEqual(publicCallResult(result).products,[],'Unavailable guarantees must not turn into claimed matches');
  });
});

test('shopping clarification pauses at the current question; answering it and unrelated chat do not consume interview steps',{concurrency:false},async()=>{
  await fixture(async({calls,setOutput})=>{
    const first=await handleCall(initial(),{action:'message',requestId:'one-story',message:'I make matcha every morning.'},now);
    assert.equal(first.interviewCount,1);
    setOutput(()=>({intent:'clarify',message:'Which lipstick shade do you need?',memories:[],verdict:null,inventory:null}));
    const ask=await handleCall(first.profile,{action:'message',requestId:'need-question',message:'Help me choose a lipstick.'},now);
    assert.equal(ask.interviewCount,1);assert.equal(ask.conversationMode,'request');
    assert.equal(ask.question,'Which lipstick shade do you need?');assert.equal(ask.profile.journey?.nextQuestion,FIRST_CALL_QUESTIONS[1]);
    setOutput(()=>({intent:'buy',message:'This is the sourced catalog option.',memories:[],verdict:sourcedVerdict,inventory:null}));
    const answer=await handleCall(ask.profile,{action:'message',requestId:'need-answer',message:'A pink one.'},now);
    assert.equal(answer.interviewCount,1);assert.equal(answer.interviewComplete,false);assert.equal(answer.question,null);
    assert.equal(calls.at(-1)!.input.interview.active,false);assert.equal(calls.at(-1)!.input.pendingCall.request,'Help me choose a lipstick.');
    setOutput(input=>talk(input.message));
    const chat=await handleCall(answer.profile,{action:'message',requestId:'side-chat',message:'I also enjoy quiet mornings.'},now);
    assert.equal(chat.interviewCount,1);assert.equal(chat.conversationMode,'conversation');assert.equal(chat.question,null);
    const before=calls.length;
    const resumed=await handleCall(chat.profile,{action:'resumeInterview',requestId:'resume-question'},now);
    assert.equal(calls.length,before);assert.equal(resumed.conversationMode,'interview');
    assert.equal(resumed.question,FIRST_CALL_QUESTIONS[1]);assert.equal(resumed.profile.journey?.interviewPaused,false);
    const second=await handleCall(resumed.profile,{action:'message',requestId:'two-stories',message:'I cook on weekends.'},now);
    assert.equal(second.interviewCount,2);assert.equal(second.question,FIRST_CALL_QUESTIONS[2]);
    assert.equal(second.memories[0].source,'from our first call');
  });
});

test('greetings do not count as interview answers, and model attempts to advance with a purchase are rejected',{concurrency:false},async()=>{
  await fixture(async({calls,setOutput})=>{
    setOutput(()=>({intent:'talk',answeredInterviewQuestion:false,message:'Hello. What brings you here?',memories:[],verdict:null,inventory:null}));
    const hello=await handleCall(initial(),{action:'message',requestId:'hello',message:'Hi there.'},now);
    assert.equal(hello.interviewCount,0);assert.equal(hello.worldReady,false);assert.equal(hello.question,FIRST_CALL_QUESTIONS[0]);
    setOutput(()=>({intent:'buy',answeredInterviewQuestion:true,message:'A pink lipstick.',memories:[],verdict:sourcedVerdict,inventory:null}));
    const failed=await handleCall(hello.profile,{action:'message',requestId:'bad-progress',message:'I need a pink lipstick.'},now);
    assert.equal(failed.status,'fallback');assert.equal(failed.interviewCount,0);assert.equal(failed.interviewComplete,false);
    assert.equal(failed.profile.decisions.length,0);assert.equal(calls.length,3);
    setOutput(()=>({intent:'buy',answeredInterviewQuestion:false,message:'A pink lipstick.',memories:[],verdict:sourcedVerdict,inventory:null}));
    const retried=await handleCall(failed.profile,{action:'message',requestId:'bad-progress',message:'I need a pink lipstick.'},now);
    assert.equal(retried.status,'ok');assert.equal(retried.interviewCount,0);assert.deepEqual(retried.proposedSkuIds,[sourcedVerdict.pickSkuId]);
  });
});

test('a photo-only first turn inventories without inventing a matching demo product',{concurrency:false},async()=>{
  await fixture(async({calls,setOutput})=>{
    setOutput(()=>({intent:'scan',message:'The visible oat milk looks low.',memories:[],verdict:null,inventory:{items:[{name:'oat milk',quantity:'small visible amount',status:'low'}],lowOrMissing:[{name:'oat milk',reason:'visible low amount',confidence:'high'}],uncertainties:[]}}));
    const browser=new Browser(),result=await browser.photo('');
    assert.equal(result.status,200);assert.equal(calls.length,1);
    assert.equal(result.body.conversationMode,'request');assert.equal(result.body.interviewCount,0);
    assert.equal(result.body.interviewComplete,true);assert.equal(result.body.worldReady,true);
    assert.deepEqual(result.body.proposedSkuIds,[],'Visible groceries do not become fictional shopping cards');
    assert(result.body.memories.some(line=>line.kind==='inventory'));
    assert(calls[0].body.input[0].content.some((part:Json)=>part.type==='input_image'));
  });
});

test('early finish requires current safe sourced context, costs no model call or XP, and remains complete after later talk',{concurrency:false},async()=>{
  await fixture(async({calls})=>{
    const browser=new Browser();
    const empty=await browser.send({action:'finishInterview',requestId:'finish-too-soon'});
    assert.equal(empty.status,409);assert.equal(empty.body.code,'WORLD_NEEDS_CONTEXT');assert.equal(calls.length,0);
    await assert.rejects(()=>handleCall(completed(),{action:'finishInterview',requestId:'finished-but-empty'},now),error=>(error as {code:string}).code==='WORLD_NEEDS_CONTEXT');
    const story=await browser.send({action:'message',requestId:'story-to-keep',message:'I make matcha slowly every morning.'});
    assert.equal(story.body.worldReady,true);
    const before=calls.length,finish=await browser.send({action:'finishInterview',requestId:'finish-early'});
    assert.equal(finish.status,200);assert.equal(finish.body.interviewCount,0);assert.equal(finish.body.interviewComplete,true);
    assert.equal(finish.body.conversationMode,'conversation');assert.equal(finish.body.question,null);
    assert.equal(finish.body.profile.xp,story.body.profile.xp);assert.equal(calls.length,before);
    const replay=await browser.send({action:'finishInterview',requestId:'finish-early'});
    assert.equal(replay.body.profile.revision,finish.body.profile.revision);
    const later=await browser.send({action:'message',requestId:'later-talk',message:'I like calm evenings too.'});
    assert.equal(later.body.interviewCount,0);assert.equal(later.body.interviewComplete,true);assert.equal(later.body.question,null);
    const erased=deleteMemory(story.body.profile,story.body.memories[0].id,now);
    assert.equal(hasCallWorldContext(erased),false);
    await assert.rejects(()=>handleCall(erased,{action:'finishInterview',requestId:'erased-finish'},now),error=>(error as {code:string}).code==='WORLD_NEEDS_CONTEXT');
    const privateProfile=remember(initial(),{id:'private',text:getSku('skinCream')!.name,source:'from our first call',confidence:.9,kind:'call'},now);
    assert.equal(hasCallWorldContext(privateProfile),false);
    const scripted=remember(initial(),{id:'script',text:'a prepared morning',source:'scripted',confidence:1,kind:'scripted'},now);
    assert.equal(hasCallWorldContext(scripted),false);
  });
});

test('blocked first needs preserve progress and blocked status on retry without model access',{concurrency:false},async()=>{
  await fixture(async({calls})=>{
    const request={action:'message' as const,requestId:'owned-first',message:'Buy laundry detergent'};
    const blocked=await handleCall(initial(),request,now);
    assert.equal(blocked.status,'blocked');assert.equal(blocked.conversationMode,'request');
    assert.equal(blocked.interviewCount,0);assert.equal(blocked.interviewComplete,false);assert.equal(blocked.worldReady,false);
    const again=await handleCall(blocked.profile,request,now);
    assert.equal(again.status,'blocked');assert.equal(again.profile.revision,blocked.profile.revision);
    assert.equal(again.profile.decisions.length,0);assert.equal(calls.length,0);
    const resumed=await handleCall(again.profile,{action:'resumeInterview',requestId:'resume-owned'},now);
    assert.equal(resumed.question,FIRST_CALL_QUESTIONS[0]);assert.equal(calls.length,0);
  });
});

test('five skips end optional questions without claiming a world is building; a later story can unlock it',{concurrency:false},async()=>{
  await fixture(async({calls,setOutput})=>{
    setOutput(()=>({intent:'talk',answeredInterviewQuestion:true,message:'Of course. We can leave that one.',memories:[],verdict:null,inventory:null}));
    let profile=initial(),latest:CallResponse|undefined;
    for(let index=0;index<5;index++){
      latest=await handleCall(profile,{action:'message',requestId:'skip-'+index,message:'Skip this question.'},now);
      profile=latest.profile;
    }
    assert(latest);assert.equal(latest.interviewCount,5);assert.equal(latest.interviewComplete,true);
    assert.equal(latest.conversationMode,'conversation');assert.equal(latest.worldReady,false);assert.equal(latest.question,null);
    assert.notEqual(latest.message,WORLD_BUILDING_MESSAGE);assert.match(latest.message,/one thing you’d like help with/);
    assert.equal(profile.memoryLines.length,0);assert.equal(calls.length,5);
    setOutput(input=>talk(input.message));
    const story=await handleCall(profile,{action:'message',requestId:'a-later-story',message:'I have a quiet matcha morning before work.'},now);
    assert.equal(story.interviewComplete,true);assert.equal(story.interviewCount,5);assert.equal(story.worldReady,true);
    assert.equal(story.question,null);assert.notEqual(story.message,WORLD_BUILDING_MESSAGE);
    const before=calls.length;
    const ready=await handleCall(story.profile,{action:'finishInterview',requestId:'build-after-skips'},now);
    assert.equal(ready.worldReady,true);assert.equal(ready.message,WORLD_BUILDING_MESSAGE);assert.equal(calls.length,before);
  });
});

test('replaying an erased answer never resurrects its prose, and stale turns never restart a paused interview',{concurrency:false},async()=>{
  await fixture(async({calls,setOutput})=>{
    const input={action:'message' as const,requestId:'forget-this-turn',message:'I enjoy a tiny private morning ritual.'};
    const first=await handleCall(initial(),input,now);
    const erased=deleteMemory(first.profile,first.memories[0].id,now);
    const replay=await handleCall(erased,input,now);
    assert.equal(replay.worldReady,false);assert.equal(replay.profile.revision,erased.revision);assert.equal(calls.length,1);
    assert(!JSON.stringify(replay).includes(input.message));
    assert.deepEqual(replay.memories,[]);
    setOutput(()=>({intent:'clarify',message:'Which size?',memories:[],verdict:null,inventory:null}));
    const request=await handleCall(erased,{action:'message',requestId:'request-after-story',message:'I need red socks.'},now);
    const oldTurn=await handleCall(request.profile,input,now);
    assert.equal(oldTurn.profile.journey?.interviewPaused,true);assert.equal(oldTurn.conversationMode,'conversation');
    assert.equal(oldTurn.question,null);assert.equal(oldTurn.interviewCount,1);assert.equal(calls.length,2);
    assert.throws(()=>validateCallOutput({intent:'talk',answeredInterviewQuestion:true,message:'Nice photo.',memories:[],verdict:null,inventory:null},eligibleCatalog(initial()),'',true,true),/active interview question/);
  });
});

test('one photo call inventories a shelf or fridge and code maps supported gaps without a mode selector',{concurrency:false},async()=>{
  await fixture(async({root,calls,setOutput})=>{
    setOutput(()=>({intent:'scan',message:'Milk looks low. The label on the other container is unclear.',memories:[],verdict:null,inventory:{items:[{name:'oat milk',quantity:'small visible amount',status:'low'}],lowOrMissing:[{name:'oat milk',reason:'visible low amount',confidence:'high'},{name:'spinach',reason:'unclear bag',confidence:'low'},{name:'unknown widget',reason:'not in this catalog',confidence:'medium'}],uncertainties:['I cannot read the other label.']}}));
    const result=await handleCall(completed(),{action:'message',requestId:'fridge',message:'Can you look at this?',image:{buffer:png,mime:'image/png'}},now);
    assert.deepEqual(result.proposedSkuIds,[],'A gap outside the sourced demo catalog is not silently filled with a synthetic SKU');
    assert.equal(result.inventory?.items[0].name,'oat milk');
    assert(calls[0].body.input[0].content.some((part:Json)=>part.type==='input_image'));
    assert(result.memories.some(line=>line.kind==='inventory'&&line.source==='from your call, 25 Oct 2026'));
    for(const file of await readdir(path.join(root,'responses')))assert(!(await readFile(path.join(root,'responses',file),'utf8')).includes(png.toString('base64')));
    const desk=mapCallGaps({items:[],lowOrMissing:[{name:'desktop organizer',reason:'user requested storage for the visible desk',confidence:'high'}],uncertainties:[]},completed());
    assert(desk.some(id=>comparisonGroupForSku(getSku(id)!)==='desktop-organizer'));
  });
});

test('the same photo endpoint can compare user-identified products for their current profile',{concurrency:false},async()=>{
  await fixture(async({calls,setOutput})=>{
    setOutput(()=>({intent:'compare',message:'The cream kettle on the left matches the slow morning you described.',memories:[],verdict:kettleVerdict,inventory:null}));
    const result=await handleCall(savedWorld(['kettle','kettleAlt']),{action:'message',requestId:'compare',message:'In my existing world, left is the Sunday pour-over kettle, right is Everyday enamel kettle. Which fits my morning?',image:{buffer:png,mime:'image/png'}},now);
    assert.equal(result.verdict?.pickSkuId,'kettle');assert.equal(result.verdict?.runnerUpSkuId,'kettleAlt');assert.deepEqual(result.proposedSkuIds,['kettle']);
    assert.equal(calls[0].input.mode,undefined);assert(calls[0].body.input[0].content.some((part:Json)=>part.type==='input_image'));
    assert.equal(result.profile.decisions[0].approvedAt,null);
  });
});

test('pilling comparisons cite the criticized runner-up, including both reports for a frequency claim',()=>{
  const base={intent:'buy',answeredInterviewQuestion:false,message:'The Sprint pair has fewer pilling reports than the cheaper pair in this seeded sample.',memories:[],inventory:null,verdict:{pickSkuId:'socks',reason:'The catalog lists Rocket delivery · tomorrow by 7am.',dissent:'One seeded reviewer reports a thick toe seam.',citations:['M04','M06'],runnerUpSkuId:'socksBudget',whyRunnerUpLost:'Two seeded reviews report pilling on the cheaper pair.',clarifyingQuestion:null}};
  const allowed=eligibleCatalog(completed());
  assert.throws(()=>validateCallOutput(base,allowed,'Red socks, under 8000 won.',false,false),/Pilling tradeoff/);
  assert.throws(()=>validateCallOutput({...base,verdict:{...base.verdict,citations:['M04','M06','B04']}},allowed,'Red socks.',false,false),/Pilling tradeoff/);
  assert.equal(validateCallOutput({...base,verdict:{...base.verdict,citations:['M04','M06','B04','B14']}},allowed,'Red socks.',false,false).verdict?.pickSkuId,'socks');
  const messageOnly={...base,message:'The cheaper pair has two pilling reports in the seeded sample.',verdict:{...base.verdict,reason:'A red crew sock.',whyRunnerUpLost:'The other pair has a fragranced finish.'}};
  assert.throws(()=>validateCallOutput(messageOnly,allowed,'Red socks.',false,false),/Pilling tradeoff/,'The conversational message must be grounded too');
  const contextOnly={...base,message:'You care about pilling. I’ll show the evidence.',verdict:{...base.verdict,reason:'A red crew sock.',whyRunnerUpLost:'The other pair has a fragranced finish.'}};
  assert.doesNotThrow(()=>validateCallOutput(contextOnly,allowed,'Red socks.',false,false),'Acknowledging a concern is not a product complaint');
});

test('call verdicts cannot turn absent reports into no-pilling guarantees or invent delivery timing',()=>{
  const allowed=eligibleCatalog(completed());
  const base={intent:'buy',answeredInterviewQuestion:false,message:'Here is the catalog option.',memories:[],inventory:null,verdict:{pickSkuId:'socks',reason:'A red crew sock.',dissent:'One seeded review reports a thick toe seam.',citations:['M04'],runnerUpSkuId:'socksBudget',whyRunnerUpLost:'The other pair has a fragranced finish.',clarifyingQuestion:null}};
  for(const message of ['These socks will not pill.','The pair is pilling-free.','Guaranteed no pilling.'])assert.throws(()=>validateCallOutput({...base,message},allowed,'Red socks.',false,false),/No-pilling guarantees/);
  assert.throws(()=>validateCallOutput({...base,verdict:{...base.verdict,reason:'Same-day (tomorrow) delivery is available.'}},allowed,'Red socks.',false,false),/same-day/);
  assert.throws(()=>validateCallOutput({...base,message:'Rocket delivery is confirmed for tomorrow.'},allowed,'Red socks.',false,false),/confirmed booking/);
  assert.doesNotThrow(()=>validateCallOutput({...base,message:'The catalog lists Rocket delivery · tomorrow by 7am. Delivery is not confirmed.'},allowed,'Red socks.',false,false));
});

test('a grounding failure retries once with a concrete correction and can recover real runner-up citations',{concurrency:false},async()=>{
  await fixture(async({calls,setOutput})=>{
    setOutput(()=>({intent:'buy',message:'The cheaper pair has two pilling reports in the seeded sample.',memories:[],inventory:null,verdict:{pickSkuId:'socks',reason:'A red crew sock.',dissent:'One seeded review reports a thick toe seam.',citations:calls.length===1?['M04']:['M04','B04','B14'],runnerUpSkuId:'socksBudget',whyRunnerUpLost:'Two seeded reviews describe pilling.',clarifyingQuestion:null}}));
    const result=await handleCall(savedWorld(['socks','socksBudget']),{action:'message',requestId:'grounded-retry',message:'In my existing world, find red socks under 8000 won; I care about pilling.'},now);
    assert.equal(calls.length,2);assert.equal(result.status,'ok');assert.deepEqual(result.verdict?.citations,['M04','B04','B14']);
    assert.match(calls[1].body.instructions,/B04 and B14/);assert.match(calls[1].body.instructions,/rather than guessing a replacement reason/);
    const citationSchema=calls[0].body.text.format.schema.properties.verdict.anyOf.find((schema:Json)=>schema.type==='object').properties.citations;
    assert.equal(citationSchema.maxItems,8);assert.deepEqual([...citationSchema.items.enum].sort(),calls[0].input.reviews.map((review:Json)=>review.id).sort());
    assert(citationSchema.items.enum.includes('B04'));assert(citationSchema.items.enum.includes('B14'));assert(!citationSchema.items.enum.includes('kettle-013'));
  });
});

test('owned requests are refused before model or credential access; ownership statements can still be heard',{concurrency:false},async()=>{
  await fixture(async({calls})=>{
    const result=await handleCall(completed(),{action:'message',requestId:'detergent',message:'Buy laundry detergent'},now);
    assert.equal(result.status,'blocked');assert.match(result.message,/3 weeks ago/);assert.equal(calls.length,0);assert.equal(result.profile.decisions.length,0);
    const story=await handleCall(completed(),{action:'message',requestId:'story',message:'I use laundry detergent on Sundays.'},now);
    assert.equal(story.status,'ok');assert.equal(calls.length,1);assert.equal(story.memories[0].source,'from your call, 25 Oct 2026');
  });
});

test('ordinary shopping rejects a synthetic lipstick even though it exists elsewhere in the app',{concurrency:false},async()=>{
 await fixture(async({calls,setOutput})=>{
  setOutput(()=>({intent:'buy',answeredInterviewQuestion:false,message:'A rose lipstick.',memories:[],inventory:null,verdict:{...sourcedVerdict,pickSkuId:'roseLipstick',citations:getSku('roseLipstick')!.reviewIds.slice(0,2)}}));
  const result=await handleCall(completed(),{action:'message',requestId:'no-fictional-lipstick',message:'Find me pink lipstick under 15000 won.'},now);
  assert.equal(result.status,'fallback');assert.deepEqual(result.proposedSkuIds,[]);assert.equal(result.profile.decisions.length,0);assert.equal(calls.length,2);
  assert.match(calls[1].body.instructions,/Unknown or disallowed pick/);assert(!calls[0].input.catalog.some((sku:Json)=>sku.id==='roseLipstick'));
 });
});

test('saved-world products require an explicit world request and retain ordinary eligibility checks',()=>{
 const profile=savedWorld(['kettle','kettleAlt']);
 assert(!callCandidates(profile,'Find a lipstick').some(sku=>sku.id==='kettle'));
 const world=callCandidates(profile,'Compare the kettles in my existing world');assert(world.some(sku=>sku.id==='kettle'));assert(!world.some(sku=>sku.id==='mugs'));
 profile.owned.push({skuId:'kettle',source:'approved',acquiredAt:now.toISOString()});assert(!callCandidates(profile,'My existing world').some(sku=>sku.id==='kettle'));
});

test('old shopping receipts cannot resurrect synthetic recommendations outside an explicit saved world',{concurrency:false},async()=>{
 await fixture(async({calls})=>{
  for(const [index,{profile,message,skuId,expected}] of [
   {profile:completed(),message:'Find me pink lipstick under 15000 won.',skuId:'roseLipstick',expected:[]},
   {profile:savedWorld(['roseLipstick']),message:'Find me pink lipstick under 15000 won.',skuId:'roseLipstick',expected:[]},
   {profile:savedWorld(['kettle','kettleAlt']),message:'Show the kettle in my existing world.',skuId:'kettle',expected:['kettle']},
  ].entries()){
   const input={action:'message' as const,requestId:'old-receipt-'+index,message};
   const requestHash=createHash('sha256').update(JSON.stringify({action:input.action,message,image:null})).digest('hex');
   profile.journey!.callReceipts=[{requestId:input.requestId,requestHash,status:'ok',conversationMode:'request',proposedSkuIds:[skuId]}];
   profile.decisions=[{id:'old-decision',skuId,source:'earlier call',addedAt:now.toISOString(),lockedUntil:null,approvedAt:null}];
   const result=await handleCall(profile,input,now);assert.deepEqual(result.proposedSkuIds,expected);assert.equal(result.profile.decisions[0].skuId,skuId,'Filtering replay does not rewrite purchase history');
  }
  assert.equal(calls.length,0,'Receipt replay remains idempotent without another model request');
 });
});

test('the call rejects invented memory quotes and citations, retries once, and preserves the unanswered interview step',{concurrency:false},async()=>{
  await fixture(async({calls,setOutput})=>{
    setOutput(()=>({intent:'talk',message:'A guess.',memories:[{text:'Owns a yacht.',evidenceQuote:'I own a yacht',confidence:1}],verdict:null,inventory:null}));
    const result=await handleCall(initial(),{action:'message',requestId:'bad-memory',message:'I drink tea.'},now);
    assert.equal(result.status,'fallback');assert.equal(result.interviewCount,0);assert.equal(result.profile.memoryLines.length,0);assert.equal(calls.length,2);
    assert.throws(()=>validateCallOutput({intent:'buy',answeredInterviewQuestion:false,message:'A kettle.',memories:[],verdict:{...kettleVerdict,citations:['fake-review']},inventory:null},eligibleCatalog(initial()),'A kettle',false,false),/citation/);
    assert.doesNotThrow(()=>validateCallOutput({intent:'buy',answeredInterviewQuestion:false,message:'A kettle.',memories:[],verdict:kettleVerdict,inventory:null},eligibleCatalog(initial()),'A kettle',false,true),'An explicit need can interrupt the first call');
  });
});

test('deleting a call memory removes it from future answers and from clarification context',{concurrency:false},async()=>{
  await fixture(async({calls,setOutput})=>{
    const learned=await handleCall(completed(),{action:'message',requestId:'learn',message:'I love warm linen.'},now);
    const erased=deleteMemory(learned.profile,learned.memories[0].id,now);
    await handleCall(erased,{action:'message',requestId:'after-forget',message:'How can you help?'},now);
    assert(!JSON.stringify(calls.at(-1)!.input).includes('I love warm linen'));
    setOutput(()=>({intent:'clarify',message:'Which size would work for you?',memories:[],verdict:null,inventory:null}));
    const clarification=await handleCall(completed(),{action:'message',requestId:'clarify',message:'Find red socks for running.'},now);
    assert.equal(clarification.question,'Which size would work for you?');
    assert(clarification.profile.journey?.pendingCall);
    const memoryId=clarification.profile.journey!.pendingCall!.memoryId;
    assert(clarification.profile.memoryLines.some(line=>line.id===memoryId));
    setOutput(input=>talk(input.message));
    await handleCall(clarification.profile,{action:'message',requestId:'clarification-answer',message:'Medium.'},now);
    assert.equal(calls.at(-1)!.input.pendingCall.request,'Find red socks for running.');
    const withoutContext=deleteMemory(clarification.profile,memoryId,now);
    await handleCall(withoutContext,{action:'message',requestId:'erased-clarification-answer',message:'Medium.'},now);
    assert.equal(calls.at(-1)!.input.pendingCall,null);
    assert(!JSON.stringify(calls.at(-1)!.input).includes('Find red socks for running.'));
  });
});

test('rehearsed call inputs replay offline; new ones fail with zero network and no interview progress',{concurrency:false},async()=>{
  await fixture(async({calls})=>{
    const profile=initial(),input={action:'message' as const,requestId:'online-answer',message:'I drink matcha every morning.'};
    const first=await handleCall(profile,input,now);
    assert.equal(first.meta?.cached,false);assert.equal(calls.length,1);
    process.env.DEMO_OFFLINE='1';delete process.env.OPENAI_API_KEY;
    const replay=await handleCall(profile,{...input,requestId:'offline-answer'},now);
    assert.equal(replay.meta?.cached,true);assert.equal(replay.meta?.offline,true);assert.equal(calls.length,1);assert.equal(replay.interviewCount,1);
    await assert.rejects(handleCall(profile,{...input,message:'An unrehearsed answer.'},now),error=>(error as {code:string}).code==='OFFLINE_CACHE_MISS');
    assert.equal(calls.length,1);assert.equal(profile.journey,undefined);
  });
});

test('call HTTP validation rejects unrelated origins, invalid photos and empty messages before networking',{concurrency:false},async()=>{
  await fixture(async({calls})=>{
    const wrongOrigin=await callRoute(new Request(origin+'/api/call',{method:'POST',headers:{origin:'https://other.example','content-type':'application/json'},body:JSON.stringify({action:'start',requestId:'cross-site'})}));
    assert.equal(wrongOrigin.status,403);
    const browser=new Browser();await browser.send({action:'start',requestId:'start'});
    assert.equal((await browser.photo('My kitchen',Buffer.from('not an image'))).status,415);
    const missing=await browser.send({action:'message',requestId:'empty',message:''});assert.equal(missing.status,400);assert.equal(missing.body.code,'CALL_INPUT_REQUIRED');
    assert.equal(calls.length,0);
    // A reload restores exactly the same first-call progress via the existing profile route.
    const reset=await browser.send({action:'reset'},profileRoute);assert.equal(reset.status,200);assert.equal(reset.body.profile.journey,undefined);
  });
});
