import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {z} from 'zod';
import {BLUEPRINT_FLOOR_Y,BlueprintValidationError,blueprintValidationFeedback,blueprintAnchorFitsSupport,blueprintPointInside,blueprintNodeCorners,resolveBlueprintAnchors,sceneBlueprintSchema,validateSceneBlueprint,compileSceneBlueprint} from '../lib/scene-blueprint';
import {fixtureBlueprint} from './fixtures/blueprint';
import {createProfile,deleteMemory} from '../lib/profile';
import {remember} from '../lib/memory';
import {generateWorld} from '../lib/server/world';
import {validateScene} from '../lib/server/services';
import {ResponseCache} from '../lib/server/cache';
import {structuredCall,type StructuredRequest} from '../lib/server/llm';
import {AppError} from '../lib/server/errors';
import {catalog} from '../lib/catalog';

const ids=['matcha','mugs'];
test('blueprint contract is strict declarative JSON with derived support heights and no tuple schema',()=>{
  const plan=validateSceneBlueprint(fixtureBlueprint(ids),ids);
  assert.equal(plan.nodes.length,8);assert.equal(resolveBlueprintAnchors(plan)[0].y,.58);
  const floor=structuredClone(plan);floor.anchors[0].supportId=null;
  assert.equal(resolveBlueprintAnchors(validateSceneBlueprint(floor,ids))[0].y,BLUEPRINT_FLOOR_Y);
  const schema=JSON.stringify(z.toJSONSchema(sceneBlueprintSchema));
  assert(!schema.includes('prefixItems'));assert(!schema.includes('shader'));
  assert.throws(()=>validateSceneBlueprint({...plan,script:'fetch("https://example.invalid")'},ids));
  assert.throws(()=>validateSceneBlueprint({...plan,url:'https://example.invalid/model.glb'},ids));
  assert.throws(()=>validateSceneBlueprint({...plan,palette:{...plan.palette,accent:'url(https://example.invalid)'}},ids));
});

test('terrain must be a bounded simple polygon with useful area and nonzero edges',()=>{
  const base=fixtureBlueprint(ids);
  assert(blueprintPointInside({x:0,z:0},base.terrain.outline,.4));
  assert(!blueprintPointInside({x:3.7,z:3},base.terrain.outline));
  for(const mutate of [
    (p:typeof base)=>{p.terrain.outline[0].x=4;},
    (p:typeof base)=>{[p.terrain.outline[1],p.terrain.outline[5]]=[p.terrain.outline[5],p.terrain.outline[1]];},
    (p:typeof base)=>{p.terrain.outline[1]={...p.terrain.outline[0]};},
    (p:typeof base)=>{p.terrain.outline=p.terrain.outline.map(point=>({x:point.x*.1,z:point.z*.1}));},
    (p:typeof base)=>{p.terrain.depth=10;},
  ]){const invalid=structuredClone(base);mutate(invalid);assert.throws(()=>validateSceneBlueprint(invalid,ids));}
});

test('node geometry is finite, pooled, count-bounded and validated after rotation',()=>{
  const base=fixtureBlueprint(ids);
  for(const mutate of [
    (p:typeof base)=>{p.nodes[0].scale.x=NaN;},
    (p:typeof base)=>{p.nodes[0].scale.z=Infinity;},
    (p:typeof base)=>{p.nodes[0].position.x=3.7;},
    (p:typeof base)=>{p.nodes[0].rotation.z=Math.PI/2;},
    (p:typeof base)=>{p.nodes[0].scale.y=.001;},
    (p:typeof base)=>{p.nodes[1].id=p.nodes[0].id;},
    (p:typeof base)=>{p.nodes=p.nodes.slice(0,7);},
    (p:typeof base)=>{p.nodes.push(...Array.from({length:30},(_,index)=>({...p.nodes[1],id:'extra-'+index})));},
  ]){const invalid=structuredClone(base);mutate(invalid);assert.throws(()=>validateSceneBlueprint(invalid,ids));}
  const malicious=structuredClone(base) as unknown as {nodes:{shape:string}[]};malicious.nodes[1].shape='javascript';
  assert.throws(()=>validateSceneBlueprint(malicious,ids));
});

test('anchors must reference exact products, remain on stationary supports and retain full footprint clearance',()=>{
  const base=fixtureBlueprint(ids);
  assert(blueprintAnchorFitsSupport(base.anchors[0],base.nodes[0]));
  for(const mutate of [
    (p:typeof base)=>{p.anchors[1].skuId=p.anchors[0].skuId;},
    (p:typeof base)=>{p.anchors[1].skuId='invented';},
    (p:typeof base)=>{p.anchors[0].supportId='missing';},
    (p:typeof base)=>{p.anchors[0].supportId=p.nodes[1].id;},
    (p:typeof base)=>{p.nodes[0].shape='tapered';},
    (p:typeof base)=>{p.nodes[0].motion='sway';},
    (p:typeof base)=>{p.anchors[0].x=2.85;},
    (p:typeof base)=>{p.anchors[0].x=p.anchors[1].x;p.anchors[0].z=p.anchors[1].z;},
    (p:typeof base)=>{p.anchors[0].scale=2;},
    (p:typeof base)=>{p.nodes[0].position.y=3.4;},
  ]){const invalid=structuredClone(base);mutate(invalid);assert.throws(()=>validateSceneBlueprint(invalid,ids));}
  const rotated=structuredClone(base);rotated.nodes[0].shape='box';rotated.nodes[0].scale={x:3,y:.16,z:3};rotated.nodes[0].rotation.y=.4;
  rotated.anchors=[{...rotated.anchors[0],x:-.6,z:0},{...rotated.anchors[1],x:.6,z:0}];
  assert.doesNotThrow(()=>validateSceneBlueprint(rotated,ids));
});

test('one geometry failure reports multiple measured repairs together with a twelve-issue ceiling',()=>{
  const invalid=fixtureBlueprint(ids);
  invalid.nodes[1].position.y=.18;invalid.nodes[2].position.y=3.8;
  invalid.anchors[0].supportId='missing';invalid.anchors[1].x=3.6;
  assert.throws(()=>validateSceneBlueprint(invalid,ids),error=>{
    assert(error instanceof BlueprintValidationError);const feedback=blueprintValidationFeedback(error);
    assert(feedback.includes(invalid.nodes[1].id));assert(feedback.includes(invalid.nodes[2].id));
    assert.match(feedback,/rotated bounds/);assert.match(feedback,/matcha refers to missing/);assert.match(feedback,/mugs.*clearance/);
    assert(feedback.split('\n').length>=4);return true;
  });
  for(const node of invalid.nodes){node.position={x:3.7,y:.18,z:3.2};node.scale={x:2,y:2,z:2};}
  assert.throws(()=>validateSceneBlueprint(invalid,ids),error=>{
    assert(error instanceof BlueprintValidationError);assert.equal(error.message.split('\n').length,12);return true;
  });
});

test('blueprint feedback sanitizes parser and schema diagnostics instead of copying model or user text',()=>{
  const privateMarker='PRIVATE_STORY_DO_NOT_PERSIST';
  for(const error of [new Error(privateMarker),new SyntaxError(privateMarker)])assert(!blueprintValidationFeedback(error).includes(privateMarker));
  const invalid=fixtureBlueprint(ids) as unknown as Record<string,unknown>;invalid[privateMarker]='secret';
  const result=sceneBlueprintSchema.safeParse(invalid);assert.equal(result.success,false);
  if(!result.success){const feedback=blueprintValidationFeedback(result.error);assert.match(feedback,/unrecognized_keys/);assert(!feedback.includes(privateMarker));}
  const range=fixtureBlueprint(ids);range.nodes[0].scale.x=100;
  const ranged=sceneBlueprintSchema.safeParse(range);assert.equal(ranged.success,false);
  if(!ranged.success)assert.match(blueprintValidationFeedback(ranged.error),/nodes.0.scale.x.*maximum 7.6/);
});

test('compiler grounds the observed shallow floor penetration and packs coincident products without replacing authored design',()=>{
  const selected=['matcha','mugs','bambooTray'],raw=fixtureBlueprint(selected);
  raw.nodes=[
    {...raw.nodes[0],id:'tray-plinth',shape:'box',position:{x:.38,y:.26,z:-.36},scale:{x:.56,y:.24,z:.44},rotation:{x:0,y:.06,z:0}},
    {...raw.nodes[0],id:'table-low',shape:'box',position:{x:.8,y:.26,z:.4},scale:{x:1,y:.24,z:.8},rotation:{x:0,y:-.3,z:0}},
    ...raw.nodes.slice(1).map((node,index)=>({...node,position:{...node.position,y:.22},scale:{x:.2,y:.2+(index%3)*.02,z:.2}})),
  ];
  raw.anchors=[
    {skuId:'matcha',supportId:'tray-plinth',x:.38,z:-.36,yaw:.1,scale:1.02},
    {skuId:'mugs',supportId:'table-low',x:.95,z:.62,yaw:0,scale:.78},
    {skuId:'bambooTray',supportId:'tray-plinth',x:.4,z:-.34,yaw:.06,scale:.86},
  ];
  const before=structuredClone(raw);assert.throws(()=>validateSceneBlueprint(raw,selected));
  const plan=compileSceneBlueprint(raw,selected);assert.deepEqual(raw,before,'Compilation must not mutate the raw model answer');
  assert.deepEqual(plan.terrain,raw.terrain);assert.deepEqual(plan.palette,raw.palette);assert.deepEqual(plan.atmosphere,raw.atmosphere);
  assert.equal(plan.nodes.length,raw.nodes.length);
  for(let i=0;i<plan.nodes.length;i++){
    const expected=structuredClone(raw.nodes[i]);expected.position.y=plan.nodes[i].position.y;
    assert.deepEqual(plan.nodes[i],expected,'Only Y grounding may change the authored nodes');
    assert(Math.min(...blueprintNodeCorners(plan.nodes[i]).map(point=>point.y))>=BLUEPRINT_FLOOR_Y-1e-7);
  }
  assert.deepEqual(plan.anchors.map(anchor=>anchor.skuId),selected);
  assert(plan.anchors.every(anchor=>anchor.scale>=.55));assert(plan.anchors[0].scale<raw.anchors[0].scale);
  assert.notEqual(plan.anchors[2].supportId,'tray-plinth','An already full tiny stand must not accept a coincident product');
  assert.doesNotThrow(()=>validateSceneBlueprint(plan,selected));
  let replay=plan;for(let i=0;i<5;i++){replay=compileSceneBlueprint(replay,selected);assert.deepEqual(replay,plan,'Compiled/cache replay geometry cannot drift');}
});

test('compiler uses clear authored terrain when supports cannot fit, and never repairs unsafe world structure',()=>{
  const raw=fixtureBlueprint(ids);raw.nodes[0].support=false;raw.nodes[0].scale={x:.1,y:.1,z:.1};
  raw.anchors.forEach(anchor=>{anchor.x=0;anchor.z=0;anchor.supportId='missing';});
  const plan=compileSceneBlueprint(raw,ids);
  assert(plan.anchors.every(anchor=>anchor.supportId===null));assert.notDeepEqual(plan.anchors[0],plan.anchors[1]);
  assert.deepEqual(compileSceneBlueprint(plan,ids),plan);
  for(const mutate of [
    (p:typeof raw)=>{p.nodes[0].position.x=3.7;p.nodes[0].scale.x=3;},
    (p:typeof raw)=>{p.nodes[0].position.y=.18;p.nodes[0].scale.y=4;},
    (p:typeof raw)=>{[p.terrain.outline[1],p.terrain.outline[5]]=[p.terrain.outline[5],p.terrain.outline[1]];},
    (p:typeof raw)=>{p.anchors[0].skuId='invented';},
  ]){const invalid=structuredClone(raw);mutate(invalid);assert.throws(()=>compileSceneBlueprint(invalid,ids));}
});

test('new scenes require a blueprint while legacy saved SceneResult can still omit one',()=>{
  const skuIds=['kettle','mugs','apron','tray','speaker'];
  const scene={name:'A composed morning',explanation:'A new space.',items:skuIds.map(skuId=>({skuId,oneLiner:'A listed product.'}))};
  assert.throws(()=>validateScene(scene,catalog));
  assert.deepEqual(validateScene({...scene,blueprint:fixtureBlueprint(skuIds)},catalog).blueprint,fixtureBlueprint(skuIds));
});

test('different commands persist actual different plans; exact cached plans replay offline with no fetch and forgetting changes input',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'coupi-blueprint-cache-')),cache=new ResponseCache(root);
  const env={NODE_ENV:'test' as const,OPENAI_MODEL:'blueprint-test-model',OPENAI_API_KEY:'TEST_ONLY_BLUEPRINT',DEMO_OFFLINE:'0'};
  let calls=0;const inputs:string[]=[];
  const fetchMock=(async(_url,init)=>{
    calls++;const body=JSON.parse(String(init?.body)),input=JSON.parse(body.input[0].content[0].text);inputs.push(JSON.stringify(input));
    assert.equal(body.max_output_tokens,18000);assert(body.text.format.schema.properties.districts.items.required.includes('blueprint'));
    const variant=input.command.includes('moon')?1:0,count=body.instructions.includes('Create exactly 2 distinct districts')?2:1;
    const districts=Array.from({length:count},(_,index)=>{
      const blueprint=fixtureBlueprint(ids,variant);blueprint.nodes[1].position.y=.18;
      return{name:(variant?'Moon garden':'Morning garden')+' '+index,explanation:'A space from your story.',sourceMemoryIds:['memory-1'],items:ids.map(skuId=>({skuId,oneLiner:'A listed match for your ritual.'})),blueprint};
    });
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({districts})}]}],usage:{input_tokens:50,output_tokens:100}});
  }) as typeof fetch;
  const call=<T,>(request:StructuredRequest<T>)=>structuredCall(request,{fetch:fetchMock,cache,env});
  let profile=remember(createProfile('blueprint-cache'),{id:'story',text:'I enjoy matcha on slow Sunday mornings.',source:'from our first call',confidence:.95,kind:'call'});
  profile.journey={hatched:true,interviewCount:5,interviewComplete:true,nextQuestion:'',districts:[],processedCallIds:[]};
  try{
    const first=await generateWorld(profile,{requestId:'first',command:'a morning garden'},{call});
    const firstPlan=structuredClone(first.districts[0].scene.blueprint);assert(firstPlan);
    assert(Math.abs(firstPlan.nodes[1].position.y-.68)<1e-9,'Persist the compiled grounding, not the invalid raw model height');
    const stored=await cache.get<{districts:{blueprint:unknown}[]}>(first.meta!.cacheKey);
    assert.deepEqual(stored!.output.districts[0].blueprint,firstPlan,'Cache the exact normalized plan that renders');
    const changed=await generateWorld(first.profile,{requestId:'moon',districtId:first.districts[0].id,command:'a moon garden'},{call});
    const rebuildInput=JSON.parse(inputs[1]);
    assert.equal(rebuildInput.previousDistrict.name,first.districts[0].name);
    assert.deepEqual(rebuildInput.previousDistrict.blueprint,firstPlan);
    assert.deepEqual(rebuildInput.previousDistrict.items,first.districts[0].scene.items);
    assert(!inputs[1].includes(first.districts[1].name),'Rebuild context includes only its target, not unrelated worlds');
    assert.notDeepEqual(changed.districts[0].scene.blueprint!.nodes,firstPlan.nodes);
    assert.equal(changed.districts[0].scene.blueprint!.atmosphere.timeLabel,'blue hour');
    assert.equal(changed.districts[0].id,first.districts[0].id);
    env.DEMO_OFFLINE='1';const before=calls;
    const replay=await generateWorld(profile,{requestId:'fresh-request-id',command:'a morning garden'},{call});
    assert.deepEqual(replay.districts[0].scene.blueprint,firstPlan);assert.equal(replay.meta!.cached,true);assert.equal(calls,before);
    await assert.rejects(()=>generateWorld(profile,{requestId:'miss',command:'an unrehearsed beach'},{call}),error=>error instanceof AppError&&error.code==='OFFLINE_CACHE_MISS');assert.equal(calls,before);
    env.DEMO_OFFLINE='0';let forgotten=deleteMemory(first.profile,'story');
    forgotten=remember(forgotten,{id:'new-story',text:'I like calm afternoons by the river.',source:'from your call',confidence:.95,kind:'call'});
    await generateWorld(forgotten,{requestId:'after-delete',command:'a river afternoon'},{call});
    assert(!inputs.at(-1)!.includes('slow Sunday mornings'));
  }finally{await rm(root,{recursive:true,force:true});}
});

test('rebuild references exclude newly owned products and withhold a district whose sources are no longer permitted',async()=>{
  let profile=remember(createProfile('prior-context'),{id:'story',text:'I enjoy a quiet cup of tea.',source:'from our first call',confidence:.95,kind:'call'});
  profile.journey={hatched:true,interviewCount:5,interviewComplete:true,nextQuestion:'',processedCallIds:[],districts:[{id:'old',name:'My tea place',provenance:'from your story',sourceMemoryIds:['story'],createdAt:new Date().toISOString(),scene:{name:'My tea place',explanation:'For your tea.',items:ids.map(skuId=>({skuId,oneLiner:'A known product.'})),blueprint:fixtureBlueprint(ids)}}]};
  profile.owned.push({skuId:'mugs',acquiredAt:new Date().toISOString(),source:'approved'});
  let captured:Record<string,any>={};
  const call=<T,>(request:StructuredRequest<T>):Promise<never>=>{captured=request.input as Record<string,any>;return Promise.reject(new AppError('TEST_CAPTURE','Only inspecting the request.'));};
  await assert.rejects(()=>generateWorld(profile,{requestId:'inspect',districtId:'old',command:'make this warmer'},{call}),/Only inspecting/);
  assert.deepEqual(captured.previousDistrict.items.map((item:{skuId:string})=>item.skuId),['matcha']);
  assert.deepEqual(captured.previousDistrict.blueprint.anchors.map((item:{skuId:string})=>item.skuId),['matcha']);
  profile.memoryLines[0].excludedFromAI=true;
  await assert.rejects(()=>generateWorld(profile,{requestId:'inspect-hidden',districtId:'old',command:'a new quiet courtyard'},{call}),/Only inspecting/);
  assert.equal(captured.previousDistrict,null);
  assert(!JSON.stringify(captured).includes('My tea place'));
  assert(!JSON.stringify(captured).includes('quiet cup of tea'));
});

test('two invalid geometry attempts give a world error without replacing an existing plan',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'coupi-blueprint-invalid-')),cache=new ResponseCache(root);
  let profile=remember(createProfile('invalid-plan'),{id:'story',text:'I like warm mornings.',source:'from our first call',confidence:.95,kind:'call'});
  profile.journey={hatched:true,interviewCount:5,interviewComplete:true,nextQuestion:'',processedCallIds:[],districts:[{id:'old',name:'Keep this world',provenance:'from your story',sourceMemoryIds:['story'],createdAt:new Date().toISOString(),scene:{name:'Keep this world',explanation:'Still here.',items:ids.map(skuId=>({skuId,oneLiner:'A known product.'})),blueprint:fixtureBlueprint(ids)}}]};
  const before=structuredClone(profile);let calls=0;
  const call=<T,>(request:StructuredRequest<T>)=>structuredCall(request,{cache,env:{NODE_ENV:'test',OPENAI_MODEL:'invalid-geometry-test',OPENAI_API_KEY:'TEST_ONLY',DEMO_OFFLINE:'0'},fetch:(async(_url,init)=>{
    calls++;const body=JSON.parse(String(init?.body));if(calls===2)assert.match(body.instructions,/Re-check all transformed bounds/);
    const invalid=fixtureBlueprint(ids);invalid.nodes[0].position.x=3.7;
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({districts:[{name:'Broken',explanation:'Invalid support.',sourceMemoryIds:['memory-1'],items:ids.map(skuId=>({skuId,oneLiner:'A known product.'})),blueprint:invalid}]})}]}]});
  }) as typeof fetch});
  try{
    await assert.rejects(()=>generateWorld(profile,{requestId:'invalid',districtId:'old',command:'make it taller'},{call}),error=>error instanceof AppError&&error.code==='WORLD_GENERATION_FAILED'&&error.message.includes('couldn’t shape that world'));
    assert.equal(calls,2);assert.deepEqual(profile,before);
  }finally{await rm(root,{recursive:true,force:true});}
});
