import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createProfile} from '../lib/profile';
import {remember} from '../lib/memory';
import {saveProfile} from '../lib/server/store';
import {POST as worldRoute} from '../app/api/world/route';
import {POST as delegateRoute} from '../app/api/delegate/route';
import {POST as decisionsRoute} from '../app/api/decisions/route';
import {POST as profileRoute} from '../app/api/profile/route';

type Json=Record<string,any>;
test('world and delegation routes persist, guard approvals, and replay cached generation with zero network', {concurrency:false},async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'coopy-world-routes-'));
  const keys=['COUPI_DATA_DIR','COUPI_CACHE_DIR','OPENAI_MODEL','OPENAI_API_KEY','DEMO_OFFLINE'] as const;
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]])),originalFetch=globalThis.fetch;
  let calls=0;
  try{
    process.env.COUPI_DATA_DIR=path.join(root,'profiles');process.env.COUPI_CACHE_DIR=path.join(root,'cache');
    process.env.OPENAI_MODEL='fixture-world';process.env.OPENAI_API_KEY='sk-test-world-only';process.env.DEMO_OFFLINE='0';
    globalThis.fetch=async(_url,init)=>{
      calls++;
      const payload=JSON.parse(String(init?.body)),input=JSON.parse(payload.input[0].content[0].text);
      assert(!input.catalog.some((sku:Json)=>['skinCream','detergent'].includes(sku.id)));
      const district=(name:string)=>({name,explanation:'For the mornings you described.',sourceMemoryIds:[input.memories[0].id],items:[{skuId:'matcha',oneLiner:'For your matcha.'},{skuId:'mugs',oneLiner:'For your tea.'}]});
      const text=JSON.stringify({districts:[district('Your Mornings'),district('Your Kitchen')]});
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text}]}],usage:{input_tokens:10,output_tokens:10}});
    };
    let initial=createProfile(randomUUID());
    const offset=12-new Date().getUTCHours();initial.timezone=`Etc/GMT${offset>0?'-':'+'}${Math.abs(offset)}`;
    initial=remember(initial,{id:'story',text:'I enjoy making matcha in the mornings.',source:'from our first call',confidence:0.95,kind:'call'});
    initial.journey={hatched:true,interviewCount:5,interviewComplete:true,nextQuestion:'',districts:[],processedCallIds:[]};
    await saveProfile(initial);
    const send=async(route:(request:Request)=>Promise<Response>,url:string,body:unknown,origin='http://localhost:3007')=>{
      const response=await route(new Request('http://localhost:3007'+url,{method:'POST',headers:{'content-type':'application/json',origin,cookie:`coupi_profile=${initial.id}`},body:JSON.stringify(body)}));
      return{status:response.status,body:await response.json() as Json};
    };
    const world=await send(worldRoute,'/api/world',{requestId:'world-one'});
    assert.equal(world.status,200);assert.equal(world.body.districts.length,2);assert.equal(calls,1);
    assert.deepEqual(world.body.profile.journey.districts[0].sourceMemoryIds,['story']);
    const duplicate=await send(worldRoute,'/api/world',{requestId:'world-one'});
    assert.equal(duplicate.status,200);assert.equal(calls,1);
    const assign=await send(delegateRoute,'/api/delegate',{action:'assign',skuId:'mugs',budgetCap:18900,watchPrice:true,haggle:true,bundle:true,scheduleDelivery:true});
    assert.equal(assign.status,200);assert.equal(assign.body.decision.delegation.status,'haggled');
    const approved=await send(decisionsRoute,'/api/decisions',{action:'approve',ids:[assign.body.decision.id]});
    assert.equal(approved.body.approved.length,1);assert.equal(approved.body.profile.xp,0);
    const owned=await send(delegateRoute,'/api/delegate',{action:'assign',skuId:'detergent',budgetCap:15000,watchPrice:true,haggle:true,bundle:false,scheduleDelivery:false});
    assert.match(owned.body.blocked,/3 weeks ago/);assert.equal(calls,1);
    await send(profileRoute,'/api/profile',{action:'settings',pretend2am:true});
    const late=await send(delegateRoute,'/api/delegate',{action:'assign',skuId:'matcha',budgetCap:30000,watchPrice:true,haggle:true,bundle:false,scheduleDelivery:false});
    const blocked=await send(decisionsRoute,'/api/decisions',{action:'approve',ids:[late.body.decision.id]});
    assert.deepEqual(blocked.body.approved,[]);assert.match(blocked.body.blocked[0],/held until 7:00 AM/);
    const origin=await send(delegateRoute,'/api/delegate',{action:'refresh',id:late.body.decision.id},'https://elsewhere.example');
    assert.equal(origin.status,403);
    // Replay the same first-call profile. Request IDs never contaminate the model cache key.
    await saveProfile(initial);process.env.DEMO_OFFLINE='1';
    const replay=await send(worldRoute,'/api/world',{requestId:'offline-world'});
    assert.equal(replay.status,200);assert.equal(replay.body.meta.cached,true);assert.equal(replay.body.meta.offline,true);assert.equal(calls,1);
    const missing=await send(worldRoute,'/api/world',{requestId:'missing-world',command:'A district we have never rehearsed'});
    assert.equal(missing.status,503);assert.equal(missing.body.code,'OFFLINE_CACHE_MISS');assert.equal(calls,1);
  }finally{
    globalThis.fetch=originalFetch;
    for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
    await rm(root,{recursive:true,force:true});
  }
});
