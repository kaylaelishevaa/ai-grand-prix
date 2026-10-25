// Retain the teammate's protocol/camera safety regression suite against the ported module.
import './fixtures/teammate-voice-contract.mjs';
import './fixtures/teammate-voice-client.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {createVoiceHandler,sessionConfiguration} from '../lib/teammate/nook-voice.mjs';
import {FIRST_CALL_QUESTIONS} from '../lib/server/call';
import {eligibleTeammateProducts,teammateCatalog,teammateProfileContext} from '../lib/server/teammate-voice';
import {createProfile,deleteMemory} from '../lib/profile';
import {remember} from '../lib/memory';
import {catalog,reviews} from '../lib/catalog';
import {GET as statusRoute} from '../app/api/voice/status/route';
import {POST as sessionRoute} from '../app/api/voice/session/route';
import {POST as searchRoute} from '../app/api/products/search/route';
import {POST as profileRoute} from '../app/api/profile/route';
import type {Profile} from '../lib/types';
import {withRuntimeEnv,type D1Database} from '../lib/server/runtime';

const origin='http://127.0.0.1:3007';
const offer='v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=sendrecv\r\n';
const answer='v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=recvonly\r\n';
const post=(pathname:string,body:string,type='application/sdp',extra:Record<string,string>={})=>new Request(origin+pathname,{method:'POST',headers:{origin,'content-type':type,...extra},body});

test('teammate sourced records retain their own provenance and never become synthetic-review SKUs',()=>{
  assert.equal(teammateCatalog.length,68);
  for(const product of teammateCatalog){
    assert.match(product.url,/^https:\/\/www\.coupang\.com\/vp\/products\/\d+/);
    assert.match(product.image,/^\/live-call\/products\//);
    assert(product.sourceNote&&product.sourceImageUrl&&product.checkedAt);
    const sku=catalog.find(item=>item.id===product.id);
    if(product.price===null)assert.equal(sku,undefined);
    else{assert.equal(sku?.origin,'coupang-reference');assert.equal(sku?.sourceUrl,product.url);assert.deepEqual(sku?.reviewIds,[]);}
    assert(!reviews.some(review=>review.skuId===product.id));
  }
});

test('the embedded product catalog matches server references without rewriting retailer URLs',async()=>{
  const source=await readFile(new URL('../public/live-call/coupang-products.js',import.meta.url),'utf8');
  const context={window:{COUPANG_PRODUCTS:[]}};
  vm.runInNewContext(source,context,{filename:'coupang-products.js',timeout:1000});
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.COUPANG_PRODUCTS)),teammateCatalog);
  for(const product of teammateCatalog)assert.equal(new URL(product.url).pathname,'/vp/products/'+(product.sourceProductId||product.id.match(/^\d+/)![0]));
});

test('realtime context contains only surviving allowed memories and quarantine also filters sourced retrieval',()=>{
  let profile=createProfile('voice-context');
  profile=remember(profile,{id:'safe',text:'I prefer quiet evenings and warm neutrals.',source:'from our first call',confidence:0.95,kind:'call'});
  profile=remember(profile,{id:'private',text:'skin cream is sensitive',source:'from your call',confidence:0.95,kind:'call'});
  const before=teammateProfileContext(profile);
  assert.equal(before.callMode,'direct');assert.equal(before.budget,profile.budget);
  const direct=sessionConfiguration({},before);assert.match(direct.instructions,/I prefer quiet evenings and warm neutrals/);assert.doesNotMatch(direct.instructions,/CHECKED CALL BRIDGE OVERRIDE/);assert(!direct.tools.some(tool=>tool.name==='resolve_shopping_request'));
  assert(before.memoryLines.some(line=>line.text.includes('quiet evenings')));
  assert(!JSON.stringify(before).includes('skin cream'));
  assert(!('owned' in before)&&!('quarantine' in before)&&!('decisions' in before));
  const after=teammateProfileContext(deleteMemory(profile,'safe'));
  assert(!JSON.stringify(after).includes('quiet evenings'));
  profile.quarantine.push({category:'beauty',sensitive:true,note:'test'});
  assert(!eligibleTeammateProducts(profile).some(product=>product.category==='makeup'));
  const chosen=eligibleTeammateProducts(profile)[0];
  profile.owned.push({skuId:chosen.id,source:'have-one',acquiredAt:new Date().toISOString()});
  assert(!eligibleTeammateProducts(profile).some(product=>product.id===chosen.id));
});

test('direct Realtime keeps profile context and automatic replies without waiting for backend verdicts',async()=>{
  const profile=createProfile('first-voice-context');
  for(const count of [0,2,4]){
    profile.journey={hatched:true,interviewCount:count,interviewComplete:false,nextQuestion:FIRST_CALL_QUESTIONS[count],districts:[],processedCallIds:[]};
    const context=teammateProfileContext(profile),config=sessionConfiguration({OPENAI_REALTIME_MODEL:'test-realtime'},context);
    assert(!config.tools.some(tool=>tool.name==='resolve_shopping_request'));assert(config.tools.some(tool=>tool.name==='look_at_camera'));assert.equal((config.audio as {input:{turn_detection:{create_response:boolean}}}).input.turn_detection.create_response,true);assert.equal(context.interview.answeredCount,count);assert.equal(context.interview.question,'');
    assert.doesNotMatch(config.instructions,/FIRST CALL OVERRIDE|warm reverse-onboarding interview|CHECKED CALL BRIDGE OVERRIDE/);assert.match(config.instructions,/DIRECT SHOPPING/);assert.match(config.instructions,/Hi Kayleen! What can I help you find today/);assert.equal(context.callMode,'direct');assert.match(config.instructions,/Every public call starts directly with shopping/);
    assert(config.instructions.includes(JSON.stringify({active:false,answeredCount:count,question:'',questions:[]})));
    assert.equal(context.personalization.active,false);assert.equal(context.personalization.draft_pending,false);
  }
  let requests=0;
  const context=teammateProfileContext(profile),handler=createVoiceHandler({profileContext:context,fetchImpl:(async(_url,init)=>{
    requests++;const transmitted=JSON.parse(String((init!.body as FormData).get('session')));
    assert(!transmitted.tools.some((tool:{name:string})=>tool.name==='resolve_shopping_request'));assert.equal(transmitted.audio.input.turn_detection.create_response,true);assert.doesNotMatch(transmitted.instructions,/CHECKED CALL BRIDGE OVERRIDE/);assert.match(transmitted.instructions,/DIRECT SHOPPING/);assert(!transmitted.instructions.includes(FIRST_CALL_QUESTIONS[4]));assert.doesNotMatch(transmitted.instructions,/FIRST CALL OVERRIDE/);assert.match(transmitted.instructions,/Every public call starts directly with shopping/);
    return new Response(answer,{headers:{'content-type':'application/sdp'}});
  }) as typeof fetch});
  assert.equal((await handler(post('/api/voice/session',offer),{OPENAI_API_KEY:'TEST_ONLY_FIRST_INTERVIEW',OPENAI_REALTIME_MODEL:'test-realtime'}))!.status,200);assert.equal(requests,1);
  profile.journey!.interviewComplete=true;profile.journey!.interviewCount=5;
  const ongoing=sessionConfiguration({},teammateProfileContext(profile));assert(!ongoing.tools.some(tool=>tool.name==='search_world_products'));assert(ongoing.tools.some(tool=>tool.name==='look_at_camera'));assert.doesNotMatch(ongoing.instructions,/FIRST CALL OVERRIDE/);
});

test('explicit legacy checked sessions retain their gate without changing direct-session tools',()=>{
  const context=teammateProfileContext(createProfile('two-call-modes'));
  const checked=sessionConfiguration({},{...context,callMode:'checked'}),direct=sessionConfiguration({},context);
  assert.equal((checked.audio as {input:{turn_detection:{create_response:boolean}}}).input.turn_detection.create_response,false);
  assert(checked.tools.some(tool=>tool.name==='resolve_shopping_request'));assert.match(checked.instructions,/CHECKED CALL BRIDGE OVERRIDE/);assert.doesNotMatch(checked.instructions,/DIRECT SHOPPING:/);
  assert.equal((direct.audio as {input:{turn_detection:{create_response:boolean}}}).input.turn_detection.create_response,true);
  assert(!direct.tools.some(tool=>tool.name==='resolve_shopping_request'));
  for(const name of ['search_products','product_action','set_tryon','start_checkout','look_at_camera','compare_products'])assert(direct.tools.some(tool=>tool.name===name),name+' remains immediately available');
  for(const name of ['search_world_products','open_world_product']){assert(!direct.tools.some(tool=>tool.name===name),name+' must not divert direct call recommendations');assert(checked.tools.some(tool=>tool.name===name),name+' remains in the explicit checked flow');}
  assert.match(direct.instructions,/actions on already shown cards use product_action or start_checkout without searching again/);
});

test('offline voice refuses a valid SDP before fetch or key use while local search stays available',async()=>{
  let calls=0;
  const handler=createVoiceHandler({fetchImpl:(async()=>{calls++;throw new Error('must never fetch');}) as typeof fetch});
  const env={OPENAI_API_KEY:'fake-key-never-sent',DEMO_OFFLINE:'1'};
  const status=await (await handler(new Request(origin+'/api/voice/status'),env))!.json();
  assert.equal(status.ready,false);assert.equal(status.offline,true);
  const response=(await handler(post('/api/voice/session',offer),env))!;
  assert.equal(response.status,503);assert.equal((await response.json()).code,'DEMO_OFFLINE');
  const local=(await handler(post('/api/products/search',JSON.stringify({query:'lipstick',category:'makeup',max_price:50000}),'application/json'),env))!;
  assert.equal(local.status,200);assert((await local.json()).products.length>0);
  assert.equal(calls,0);
});

test('voice accepts the actual Host authority but never trusts forwarded authority or a missing origin',async()=>{
  let calls=0;
  const handler=createVoiceHandler({fetchImpl:(async()=>{calls++;return new Response(answer);}) as typeof fetch});
  const env={OPENAI_API_KEY:'fake-test'};
  const valid=new Request('http://localhost:3007/api/voice/session',{method:'POST',headers:{origin,host:'127.0.0.1:3007','content-type':'application/sdp'},body:offer});
  assert.equal((await handler(valid,env))!.status,200);
  const invalidHeaders:Record<string,string>[]=[
    {'content-type':'application/sdp'},
    {origin:'http://attacker.test','content-type':'application/sdp','x-forwarded-host':'attacker.test'},
    {origin,'content-type':'application/sdp',host:'127.0.0.1:3007@attacker.test'},
  ];
  for(const headers of invalidHeaders){
    const response=(await handler(new Request(origin+'/api/voice/session',{method:'POST',headers,body:offer}),env))!;
    assert.equal(response.status,403);
  }
  assert.equal(calls,1);
});

test('readiness ignores profile-storage conflicts and never creates or replaces a visitor cookie',async()=>{
  let queries=0;
  const db:D1Database={prepare(){queries++;throw new Error('Profile write in progress');},async batch(){queries++;throw new Error('Profile write in progress');}};
  await withRuntimeEnv({DB:db,OPENAI_API_KEY:'TEST_READINESS_ONLY',OPENAI_REALTIME_MODEL:'readiness-test',DEMO_OFFLINE:'0'},async()=>{
    const responses=await Promise.all(['','coupi_profile=8c8b2da4-d69e-4594-b372-890f67488248'].map(cookie=>statusRoute(new Request(origin+'/api/voice/status',{headers:cookie?{cookie}:{}}))));
    for(const response of responses){
      assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);
      const body=await response.json();assert.equal(body.ready,true);assert.equal(body.catalogCount,68);
      assert(!JSON.stringify(body).includes('TEST_READINESS_ONLY'));
    }
  });
  assert.equal(queries,0,'Readiness must remain available while profile storage is busy');
});

test('Next voice routes use server-only credentials, persist cookies, refresh deleted context, and block offline', {concurrency:false},async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'coupi-teammate-voice-'));
  const names=['COUPI_DATA_DIR','OPENAI_API_KEY','OPENAI_REALTIME_MODEL','DEMO_OFFLINE'] as const;
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const oldFetch=globalThis.fetch,oldInfo=console.info;
  process.env.COUPI_DATA_DIR=root;process.env.OPENAI_API_KEY='fake-voice-server-only';process.env.OPENAI_REALTIME_MODEL='realtime-test-model';process.env.DEMO_OFFLINE='0';
  const captured:{instructions:string;model:string;tools:{name:string}[];audio:{input:{turn_detection:{create_response:boolean}}}}[]=[];
  globalThis.fetch=(async(url,init)=>{
    assert.equal(url,'https://api.openai.com/v1/realtime/calls');
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fake-voice-server-only');
    const form=init!.body as FormData;assert.equal(form.get('sdp'),offer);
    captured.push(JSON.parse(String(form.get('session'))));
    return new Response(answer,{headers:{'content-type':'application/sdp'}});
  }) as typeof fetch;
  console.info=()=>{};
  let cookie='';
  async function send(handler:(request:Request)=>Promise<Response>,pathname:string,body?:string,type='application/json'){
    const response=await handler(new Request(origin+pathname,{method:body===undefined?'GET':'POST',headers:{origin,...(cookie?{cookie}:{}),...(body===undefined?{}:{'content-type':type})},body}));
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie')!.split(';')[0];
    return response;
  }
  try{
    const ready=await send(statusRoute,'/api/voice/status');const status=await ready.json();
    assert.equal(status.ready,true);assert.equal(status.offline,false);assert.equal(status.catalogCount,68);
    assert.equal(captured.length,0);assert.equal(cookie,'');assert.equal(ready.headers.get('set-cookie'),null);
    assert(!JSON.stringify(status).includes('fake-voice-server-only'));
    const learned=await (await send(profileRoute,'/api/profile',JSON.stringify({action:'callStatement',id:'voice-memory',text:'I prefer warm neutrals.'}))).json() as {profile:Profile};
    assert.match(cookie,/coupi_profile=/);
    const session=await send(sessionRoute,'/api/voice/session',offer,'application/sdp');
    assert.equal(session.status,200);assert.equal(session.headers.get('content-type'),'application/sdp');assert.equal(await session.text(),answer);
    assert.equal(captured.length,1);assert.equal(captured[0].model,'realtime-test-model');
    assert.match(captured[0].instructions,/I prefer warm neutrals/);
    assert.equal(captured[0].audio.input.turn_detection.create_response,true);assert(!captured[0].tools.some(tool=>tool.name==='resolve_shopping_request'));assert.doesNotMatch(captured[0].instructions,/CHECKED CALL BRIDGE OVERRIDE/);
    assert.doesNotMatch(captured[0].instructions,/fake-voice-server-only|acquiredAt|personal-care/);
    assert.match(captured[0].instructions,/separate from synthetic evidence/);
    const memory=learned.profile.memoryLines.find(line=>line.id==='call:voice-memory')!;
    await send(profileRoute,'/api/profile',JSON.stringify({action:'deleteMemory',lineId:memory.id}));
    assert.equal((await send(sessionRoute,'/api/voice/session',offer,'application/sdp')).status,200);
    assert(!captured[1].instructions.includes('I prefer warm neutrals'));
    const search=await send(searchRoute,'/api/products/search',JSON.stringify({query:'desk chair',category:'desk',max_price:null}));
    assert.equal(search.status,200);assert((await search.json()).products.every((product:{productType:string})=>product.productType==='chair'));
    const badOrigin=await sessionRoute(post('/api/voice/session',offer,'application/sdp',{origin:'https://attacker.test'}));assert.equal(badOrigin.status,403);
    process.env.DEMO_OFFLINE='1';
    const offlineStatus=await (await send(statusRoute,'/api/voice/status')).json();assert.equal(offlineStatus.ready,false);assert.equal(offlineStatus.offline,true);
    const blocked=await send(sessionRoute,'/api/voice/session',offer,'application/sdp');assert.equal(blocked.status,503);assert.equal((await blocked.json()).code,'DEMO_OFFLINE');
    assert.equal(captured.length,2,'offline and retrieval must never create another provider call');
  }finally{
    globalThis.fetch=oldFetch;console.info=oldInfo;
    for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}
    await rm(root,{recursive:true,force:true});
  }
});
