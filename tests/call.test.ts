import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {POST as callRoute} from '../app/api/call/route';
import {POST as profileRoute} from '../app/api/profile/route';
import {createProfile,deleteMemory,eligibleCatalog} from '../lib/profile';
import {getReview,getSku} from '../lib/catalog';
import {comparisonGroupForSku} from '../lib/comparison-groups';
import {handleCall,journeyFor,validateCallOutput,mapCallGaps,FIRST_CALL_QUESTIONS,WORLD_BUILDING_MESSAGE} from '../lib/server/call';
import type {CallResponse} from '../lib/journey-types';
import type {Profile} from '../lib/types';

type Json=Record<string,any>;
const origin='http://localhost:3007';
const now=new Date('2026-10-25T03:00:00.000Z');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=','base64');
const initial=()=>createProfile('test-call-profile',now);
const completed=():Profile=>({...initial(),journey:{...journeyFor(initial()),hatched:true,interviewCount:5,interviewComplete:true,nextQuestion:''}});
const talk=(message:string)=>({intent:'talk',message:'That helps me understand your day.',memories:[{text:message,evidenceQuote:message,confidence:0.9}],verdict:null,inventory:null});
const kettleVerdict={pickSkuId:'kettle',reason:'A compact cream pour-over kettle.',dissent:'Two seeded reviews report a loose lid.',citations:['kettle-013','kettle-014'],runnerUpSkuId:'kettleAlt',whyRunnerUpLost:'The alternative has a different finish.',clarifyingQuestion:null};
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
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output(input))}]}],usage:{input_tokens:101,output_tokens:35}});
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

test('hatch → first call → five answers persists visible sourced memory; duplicate turns do not advance twice',{concurrency:false},async()=>{
  await fixture(async({calls,root})=>{
    const browser=new Browser();
    const hatch=await browser.send({action:'hatch',requestId:'hatch'});
    assert.equal(hatch.status,200);
    assert.equal(hatch.body.profile.journey?.hatched,true);
    assert.match(hatch.body.message,/can I call you/);
    const start=await browser.send({action:'start',requestId:'start'});
    assert.equal(start.body.question,FIRST_CALL_QUESTIONS[0]);
    assert.equal(calls.length,0);
    let latest:CallResponse=start.body;
    for(let i=0;i<5;i++) {
      latest=(await browser.send({action:'message',requestId:'answer-'+i,message:['I drink matcha in the morning.','I cook for one on weekends.','My desk is tiny.','I am saving for a holiday.','I want less clutter.'][i]})).body;
      assert.equal(latest.interviewCount,i+1);
      assert.equal(latest.memories.length,1);
      assert.equal(latest.memories[0].source,'from our first call');
      assert.equal(latest.memories[0].confidence,0.9);
      assert(latest.memories[0].createdAt);
      assert.equal(latest.proposedSkuIds.length,0);
      assert.equal(latest.profile.decisions.length,0);
      assert.deepEqual(calls.at(-1)!.input.catalog,[],'The listening-first interview does not need product evidence');
      assert.deepEqual(calls.at(-1)!.input.reviews,[]);
      assert.match(calls.at(-1)!.body.instructions,/language of the CURRENT user's message/);
      const duplicate=await browser.send({action:'message',requestId:'answer-'+i,message:'This duplicate must not be interpreted.'});
      assert.equal(duplicate.body.interviewCount,i+1);
      assert.equal(calls.length,i+1);
    }
    assert.equal(latest.interviewComplete,true);
    assert.equal(latest.question,null);
    assert.equal(latest.message,WORLD_BUILDING_MESSAGE);
    assert.equal(latest.profile.xp,25);
    assert(!JSON.stringify(calls.at(-1)!.input).includes('lastReply'));
    const stored=JSON.parse(await readFile(path.join(root,'profiles',latest.profile.id+'.json'),'utf8'));
    assert.equal(stored.journey.interviewCount,5);
    assert.equal(stored.journey.transcript,undefined);
    const resume=await browser.send({action:'start',requestId:'resume'});
    assert.equal(resume.body.question,null);
    assert.match(resume.body.message,/Tell me, or show me/);
    assert.equal(calls.length,5);
  });
});

test('later calls infer shopping from the conversation and put only validated picks into the locked approval queue',{concurrency:false},async()=>{
  await fixture(async({calls,setOutput})=>{
    setOutput(()=>({intent:'buy',message:'This kettle fits a slow morning.',memories:[],verdict:kettleVerdict,inventory:null}));
    const profile={...completed(),pretend2am:true};
    const result=await handleCall(profile,{action:'message',requestId:'buy-kettle',message:'Find me a compact kettle.'},now);
    assert.equal(result.status,'ok');
    assert.equal(result.verdict?.pickSkuId,'kettle');
    assert(result.verdict?.citations.every(id=>getReview(id)));
    assert.deepEqual(result.proposedSkuIds,['kettle']);
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

test('one photo call inventories a shelf or fridge and code maps supported gaps without a mode selector',{concurrency:false},async()=>{
  await fixture(async({root,calls,setOutput})=>{
    setOutput(()=>({intent:'scan',message:'Milk looks low. The label on the other container is unclear.',memories:[],verdict:null,inventory:{items:[{name:'oat milk',quantity:'small visible amount',status:'low'}],lowOrMissing:[{name:'oat milk',reason:'visible low amount',confidence:'high'},{name:'spinach',reason:'unclear bag',confidence:'low'},{name:'unknown widget',reason:'not in this catalog',confidence:'medium'}],uncertainties:['I cannot read the other label.']}}));
    const result=await handleCall(completed(),{action:'message',requestId:'fridge',message:'Can you look at this?',image:{buffer:png,mime:'image/png'}},now);
    assert.deepEqual(result.proposedSkuIds.map(id=>comparisonGroupForSku(getSku(id)!)),['oat-milk']);
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
    const result=await handleCall(completed(),{action:'message',requestId:'compare',message:'Left is the Sunday pour-over kettle, right is Everyday enamel kettle. Which fits my morning?',image:{buffer:png,mime:'image/png'}},now);
    assert.equal(result.verdict?.pickSkuId,'kettle');assert.equal(result.verdict?.runnerUpSkuId,'kettleAlt');assert.deepEqual(result.proposedSkuIds,['kettle']);
    assert.equal(calls[0].input.mode,undefined);assert(calls[0].body.input[0].content.some((part:Json)=>part.type==='input_image'));
    assert.equal(result.profile.decisions[0].approvedAt,null);
  });
});

test('pilling comparisons cite the criticized runner-up, including both reports for a frequency claim',()=>{
  const base={intent:'buy',message:'The Sprint pair has fewer pilling reports than the cheaper pair in this seeded sample.',memories:[],inventory:null,verdict:{pickSkuId:'socks',reason:'The catalog lists Rocket delivery · tomorrow by 7am.',dissent:'One seeded reviewer reports a thick toe seam.',citations:['M04','M06'],runnerUpSkuId:'socksBudget',whyRunnerUpLost:'Two seeded reviews report pilling on the cheaper pair.',clarifyingQuestion:null}};
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
  const base={intent:'buy',message:'Here is the catalog option.',memories:[],inventory:null,verdict:{pickSkuId:'socks',reason:'A red crew sock.',dissent:'One seeded review reports a thick toe seam.',citations:['M04'],runnerUpSkuId:'socksBudget',whyRunnerUpLost:'The other pair has a fragranced finish.',clarifyingQuestion:null}};
  for(const message of ['These socks will not pill.','The pair is pilling-free.','Guaranteed no pilling.'])assert.throws(()=>validateCallOutput({...base,message},allowed,'Red socks.',false,false),/No-pilling guarantees/);
  assert.throws(()=>validateCallOutput({...base,verdict:{...base.verdict,reason:'Same-day (tomorrow) delivery is available.'}},allowed,'Red socks.',false,false),/same-day/);
  assert.throws(()=>validateCallOutput({...base,message:'Rocket delivery is confirmed for tomorrow.'},allowed,'Red socks.',false,false),/confirmed booking/);
  assert.doesNotThrow(()=>validateCallOutput({...base,message:'The catalog lists Rocket delivery · tomorrow by 7am. Delivery is not confirmed.'},allowed,'Red socks.',false,false));
});

test('a grounding failure retries once with a concrete correction and can recover real runner-up citations',{concurrency:false},async()=>{
  await fixture(async({calls,setOutput})=>{
    setOutput(()=>({intent:'buy',message:'The cheaper pair has two pilling reports in the seeded sample.',memories:[],inventory:null,verdict:{pickSkuId:'socks',reason:'A red crew sock.',dissent:'One seeded review reports a thick toe seam.',citations:calls.length===1?['M04']:['M04','B04','B14'],runnerUpSkuId:'socksBudget',whyRunnerUpLost:'Two seeded reviews describe pilling.',clarifyingQuestion:null}}));
    const result=await handleCall(completed(),{action:'message',requestId:'grounded-retry',message:'Find red socks under 8000 won; I care about pilling.'},now);
    assert.equal(calls.length,2);assert.equal(result.status,'ok');assert.deepEqual(result.verdict?.citations,['M04','B04','B14']);
    assert.match(calls[1].body.instructions,/B04 and B14/);assert.match(calls[1].body.instructions,/rather than guessing a replacement reason/);
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

test('the call rejects invented memory quotes and citations, retries once, and preserves the unanswered interview step',{concurrency:false},async()=>{
  await fixture(async({calls,setOutput})=>{
    setOutput(()=>({intent:'talk',message:'A guess.',memories:[{text:'Owns a yacht.',evidenceQuote:'I own a yacht',confidence:1}],verdict:null,inventory:null}));
    const result=await handleCall(initial(),{action:'message',requestId:'bad-memory',message:'I drink tea.'},now);
    assert.equal(result.status,'fallback');assert.equal(result.interviewCount,0);assert.equal(result.profile.memoryLines.length,0);assert.equal(calls.length,2);
    assert.throws(()=>validateCallOutput({intent:'buy',message:'A kettle.',memories:[],verdict:{...kettleVerdict,citations:['fake-review']},inventory:null},eligibleCatalog(initial()),'A kettle',false,false),/citation/);
    assert.throws(()=>validateCallOutput({intent:'buy',message:'A kettle.',memories:[],verdict:kettleVerdict,inventory:null},eligibleCatalog(initial()),'A kettle',false,true),/first call/);
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

test('call HTTP validation rejects unrelated origins, invalid photos and missing interview answers before networking',{concurrency:false},async()=>{
  await fixture(async({calls})=>{
    const wrongOrigin=await callRoute(new Request(origin+'/api/call',{method:'POST',headers:{origin:'https://other.example','content-type':'application/json'},body:JSON.stringify({action:'start',requestId:'cross-site'})}));
    assert.equal(wrongOrigin.status,403);
    const browser=new Browser();await browser.send({action:'start',requestId:'start'});
    assert.equal((await browser.photo('My kitchen',Buffer.from('not an image'))).status,415);
    const missing=await browser.photo('');assert.equal(missing.status,400);assert.equal(missing.body.code,'INTERVIEW_ANSWER_REQUIRED');
    assert.equal(calls.length,0);
    // A reload restores exactly the same first-call progress via the existing profile route.
    const reset=await browser.send({action:'reset'},profileRoute);assert.equal(reset.status,200);assert.equal(reset.body.profile.journey,undefined);
  });
});
