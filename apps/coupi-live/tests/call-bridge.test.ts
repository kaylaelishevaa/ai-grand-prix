import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseLiveCallTurn,liveCallBody,publicCallResult} from '../lib/call-bridge';
import {createProfile} from '../lib/profile';
import {getSku} from '../lib/catalog';
import {POST as callRoute} from '../app/api/call/route';
import type {CallResponse} from '../lib/journey-types';

const jpeg=Uint8Array.from([0xff,0xd8,0xff,0xe0,0,4,0xff,0xd9]);
const dataUrl=(bytes:Uint8Array)=>'data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64');
const photo={dataUrl:dataUrl(jpeg),mime:'image/jpeg' as const,capturedAt:'2026-10-25T03:00:00.000Z'};
const message={role:'user',id:'live-call-turn_1',text:'  A small kettle, please.  '};
const verdict={pickSkuId:'kettle',reason:'A compact cream pour-over kettle.',dissent:'Two seeded reviews report a loose lid.',citations:['kettle-013','kettle-014'],runnerUpSkuId:'kettleAlt',whyRunnerUpLost:'The alternative has a different finish.',clarifyingQuestion:null};

test('parent bridge accepts only user words and rejects marked synthetic/interim events',()=>{
  for(const value of [null,{},[],{...message,role:'assistant'},{...message,role:'system'},{...message,synthetic:true},{...message,final:false},{...message,text:'   '},{...message,text:2}])assert.equal(parseLiveCallTurn(value),null);
  assert.deepEqual(parseLiveCallTurn({...message,final:true,profile:{private:'never forward'},cameraState:'not evidence'}),{id:message.id,text:'A small kettle, please.'});
  // The embedded bridge already filters final turns; its compact payload need not repeat final:true.
  assert.deepEqual(parseLiveCallTurn(message),{id:message.id,text:'A small kettle, please.'});
});

test('turn IDs stay exact and within the API request-ID bound rather than silently colliding',()=>{
  const maximum='a'.repeat(90),turn=parseLiveCallTurn({...message,id:maximum,text:'x'.repeat(2100)})!;
  assert.equal(turn.id,maximum);assert.equal(turn.text.length,2000);
  const body=liveCallBody(turn);assert.equal(typeof body.body,'string');
  const input=JSON.parse(body.body as string);
  assert.deepEqual(input,{action:'message',requestId:'live-call:'+maximum,message:'x'.repeat(2000)});
  assert.equal(input.requestId.length,100);assert.deepEqual(body.headers,{'Content-Type':'application/json'});
  for(const id of ['',maximum+'a',maximum+'b',' spaced ','two ids','<script>'])assert.equal(parseLiveCallTurn({...message,id}),null);
});

test('opted-in JPEG becomes the exact multipart frame and retains text/request correlation only',async()=>{
  const turn=parseLiveCallTurn({...message,photo:{...photo,rawVideo:'private',profile:'private'}})!;
  assert.deepEqual(turn.photo,photo);
  const output=liveCallBody(turn);assert(output.body instanceof FormData);assert.equal(output.headers,undefined,'The browser owns the multipart boundary');
  assert.deepEqual([...output.body.keys()].sort(),['action','file','message','requestId']);
  assert.equal(output.body.get('requestId'),'live-call:'+message.id);assert.equal(output.body.get('message'),'A small kettle, please.');
  const file=output.body.get('file');assert(file instanceof File);assert.equal(file.name,'shared-frame.jpg');assert.equal(file.type,'image/jpeg');
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()),jpeg);
  assert.equal(output.body.get('capturedAt'),null);assert.equal(output.body.get('profile'),null);
});

test('frame parser rejects wrong types, malformed base64, non-JPEG bytes and unbounded metadata',()=>{
  const bad=[null,{},'photo',{...photo,mime:'image/png'},{...photo,dataUrl:'data:image/jpeg;base64,A'},{...photo,dataUrl:'data:image/jpeg;base64,/9j/==='},{...photo,dataUrl:'data:image/jpeg;base64,'},{...photo,dataUrl:'data:image/jpeg;base64,'+Buffer.from('not a photo').toString('base64')},{...photo,capturedAt:'not a date'},{...photo,capturedAt:'2026-10-25'+ ' '.repeat(100)},{...photo,dataUrl:dataUrl(new Uint8Array(17000))}];
  for(const frame of bad)assert.throws(()=>parseLiveCallTurn({...message,photo:frame}),/camera frame could not be shared/);
  assert.throws(()=>liveCallBody({id:'valid',text:'hello',photo:{...photo,dataUrl:'data:image/jpeg;base64,A'}}),/camera frame could not be shared/,'Typed callers cannot bypass the frame decoder');
});

test('the largest complete JPEG payload under the 22k transport cap is accepted, the next quartet is rejected',()=>{
  const size=Math.floor((22000-'data:image/jpeg;base64,'.length)/4)*3;
  const bytes=new Uint8Array(size);bytes.set(jpeg);
  const accepted={...photo,dataUrl:dataUrl(bytes)};
  assert(accepted.dataUrl.length<=22000);assert(parseLiveCallTurn({...message,photo:accepted}));
  const tooLarge=new Uint8Array(size+3);tooLarge.set(jpeg);
  assert.throws(()=>parseLiveCallTurn({...message,photo:{...photo,dataUrl:dataUrl(tooLarge)}}),/camera frame could not be shared/);
});

test('public results whitelist nested evidence and cannot carry profile, diary, credentials or raw frames',()=>{
  const marker='PRIVATE_DO_NOT_FORWARD';
  const original={
    status:'ok',message:'Here is the checked result.',question:null,conversationMode:'request',interviewCount:0,interviewComplete:false,worldReady:true,
    profile:{...createProfile('private-profile'),diary:marker,rawFrame:photo.dataUrl},
    memories:[{text:marker}],meta:{apiKey:marker},rawFrame:photo.dataUrl,
    verdict:{...verdict,diary:marker,profile:{private:marker},rawFrame:photo.dataUrl},
    inventory:{items:[{name:'milk',quantity:'low',status:'low',frame:photo.dataUrl}],lowOrMissing:[{name:'milk',reason:'visible amount',confidence:'high',diary:marker}],uncertainties:['One label is unclear.'],profile:{private:marker}},
    proposedSkuIds:['kettle','mugs','unknown-sku'],
  } as unknown as CallResponse;
  const output=publicCallResult(original),serialized=JSON.stringify(output);
  assert(!serialized.includes(marker));assert(!serialized.includes(photo.dataUrl));
  for(const key of ['profile','diary','memories','meta','rawFrame','apiKey'])assert(!serialized.includes('"'+key+'"'));
  assert.deepEqual(Object.keys(output).sort(),['status','message','question','conversationMode','interviewCount','interviewComplete','worldReady','verdict','inventory','proposedSkuIds','products'].sort());
  assert.deepEqual(Object.keys(output.verdict!).sort(),['pickSkuId','reason','dissent','citations','runnerUpSkuId','whyRunnerUpLost','clarifyingQuestion'].sort());
  assert.deepEqual(output.inventory,{items:[{name:'milk',quantity:'low',status:'low'}],lowOrMissing:[{name:'milk',reason:'visible amount',confidence:'high'}],uncertainties:['One label is unclear.']});
  assert.deepEqual(output.products.map(product=>product.id),['kettle','kettleAlt','mugs']);
  output.verdict!.citations.push('mutated');output.proposedSkuIds.push('mutated');output.inventory!.items[0].name='changed';
  assert(!original.verdict!.citations.includes('mutated'));assert(!original.proposedSkuIds.includes('mutated'));assert.equal(original.inventory!.items[0].name,'milk');
});

test('a sourced product keeps its actual identity and historical provenance in the public result',()=>{
  const sku=getSku('1814412512')!;assert(sku);
  const result={status:'ok',message:'A sourced reference.',question:null,conversationMode:'request',interviewCount:0,interviewComplete:false,worldReady:true,profile:createProfile('reference-bridge'),memories:[],proposedSkuIds:[sku.id],verdict:{...verdict,pickSkuId:sku.id,runnerUpSkuId:null,citations:[]}} as CallResponse;
  const output=publicCallResult(result),product=output.products[0];
  assert.equal(product.id,sku.id);assert.equal(product.origin,'coupang-reference');assert.equal(product.priceBasis,'historical-reference');
  assert.equal(product.image,sku.image);assert.equal(product.sourceUrl,sku.sourceUrl);assert.match(product.delivery,/unknown/i);assert.deepEqual(output.verdict!.citations,[]);
});

test('a genuine bridged frame uses the same shopping route, creates one proposal and replays without another model request',{concurrency:false},async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'coupi-call-bridge-'));
  const names=['COUPI_DATA_DIR','COUPI_CACHE_DIR','OPENAI_API_KEY','OPENAI_MODEL','DEMO_OFFLINE'] as const;
  const before=Object.fromEntries(names.map(name=>[name,process.env[name]])),originalFetch=globalThis.fetch,originalInfo=console.info;
  process.env.COUPI_DATA_DIR=path.join(root,'profiles');process.env.COUPI_CACHE_DIR=path.join(root,'cache');process.env.OPENAI_API_KEY='TEST_ONLY_BRIDGE_CREDENTIAL';process.env.OPENAI_MODEL='test-model';process.env.DEMO_OFFLINE='0';
  let calls=0,cookie='';console.info=()=>{};
  globalThis.fetch=(async(url,init)=>{
    assert.equal(String(url),'https://api.openai.com/v1/responses');calls++;
    const body=JSON.parse(String(init?.body)),input=JSON.parse(body.input[0].content[0].text);
    assert.equal(input.message,'A pink lipstick, please.');assert.equal(input.interview.active,false);
    assert(body.input[0].content.some((part:{type:string;image_url?:string})=>part.type==='input_image'&&part.image_url===photo.dataUrl));
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({intent:'buy',answeredInterviewQuestion:false,message:'Here is the sourced Pink Sand lipstick.',memories:[],verdict:{...verdict,pickSkuId:'1814412512-pink-sand',reason:'The listing names Pink Sand.',dissent:'Current stock is unverified.',citations:[],runnerUpSkuId:null,whyRunnerUpLost:''},inventory:null})}]}],usage:{input_tokens:10,output_tokens:10}});
  }) as typeof fetch;
  try{
    const turn=parseLiveCallTurn({...message,text:'A pink lipstick, please.',photo})!,origin='http://localhost:3007';
    async function send(){const input=liveCallBody(turn);const response=await callRoute(new Request(origin+'/api/call',{method:'POST',headers:{origin,cookie,...input.headers},body:input.body}));if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie')!.split(';')[0];assert.equal(response.status,200);return await response.json() as CallResponse;}
    const first=await send();assert.equal(first.conversationMode,'request');assert.equal(first.interviewCount,0);assert.equal(first.interviewComplete,true);assert.deepEqual(first.proposedSkuIds,['1814412512-pink-sand']);
    assert.equal(first.profile.journey?.callReceipts?.[0].requestId,'live-call:'+turn.id);assert.equal(first.profile.decisions.length,1);assert.equal(first.profile.decisions[0].approvedAt,null);
    assert(!JSON.stringify(publicCallResult(first)).includes(photo.dataUrl));assert(!('profile'in publicCallResult(first)));
    const replay=await send();assert.equal(calls,1);assert.equal(replay.profile.decisions.length,1);assert.equal(replay.profile.revision,first.profile.revision);assert.deepEqual(replay.proposedSkuIds,['1814412512-pink-sand']);
  }finally{globalThis.fetch=originalFetch;console.info=originalInfo;for(const name of names){if(before[name]===undefined)delete process.env[name];else process.env[name]=before[name];}await rm(root,{recursive:true,force:true});}
});
