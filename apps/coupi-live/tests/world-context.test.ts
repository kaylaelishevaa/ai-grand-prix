import {fixtureBlueprint} from './fixtures/blueprint';
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSceneContext} from '../lib/world-context';
import {worldTemplates} from '../data/world-templates';
import type {SceneResult} from '../lib/types';
import {createProfile} from '../lib/profile';
import {remember} from '../lib/memory';
import {generateWorld} from '../lib/server/world';
import {structuredCall} from '../lib/server/llm';

const scene=(name='A little world',explanation='A few things that fit together.'):SceneResult=>({name,explanation,items:[]});

test('world context separates events, spaces, outdoors and places from furniture kind',()=>{
  assert.deepEqual(resolveSceneContext(scene(),'getting ready at home for a date'),{type:'event',setting:'home',label:'a little before the occasion'});
  assert.equal(resolveSceneContext(scene(),'a rooftop dinner date').setting,'rooftop');
  assert.equal(resolveSceneContext(scene(),'a rooftop dinner date').type,'event');
  assert.equal(resolveSceneContext(scene(),'an indoor creative studio').setting,'studio');
  assert.equal(resolveSceneContext(scene(),'a cafe for reading').type,'place');
  assert.equal(resolveSceneContext(scene(),'an outdoor picnic by the river').setting,'riverside');
  assert.equal(resolveSceneContext(scene(),'an outdoor picnic by the river').type,'outdoor');
  assert.equal(resolveSceneContext(scene(),'a woodland reading nook').setting,'forest');
});

test('new explicit places beat saved contexts, while a simple mood edit keeps the existing place',()=>{
  const value:SceneResult={...scene('Your Kitchen'),kind:'kitchen',context:{type:'event',setting:'rooftop',label:'Dinner above the city'}};
  assert.equal(resolveSceneContext(value,'move this to a riverside picnic').setting,'riverside');
  assert.deepEqual(resolveSceneContext(value,'warmer colors, please'),value.context);
  assert.deepEqual(resolveSceneContext(value),value.context);
  assert.equal(resolveSceneContext(scene('Rainy-day cafe')).setting,'cafe');
});

test('negation and calendar language do not invent a world setting or occasion',()=>{
  assert.equal(resolveSceneContext(scene(),'update the delivery date').type,'space');
  assert.equal(resolveSceneContext(scene(),'not a rooftop, a cafe instead').setting,'cafe');
  assert.equal(resolveSceneContext(scene(),'an indoor room without a garden').setting,'home');
  assert.equal(resolveSceneContext(scene('A desk'),'no party, just a studio').type,'space');
  assert.equal(resolveSceneContext(scene(),'not a forest, read at home').setting,'home');
});

test('six curated starters span the four user journey contexts without invented venues',()=>{
  assert.equal(worldTemplates.length,6);
  assert.deepEqual(new Set(worldTemplates.map(t=>t.scene.context?.type)),new Set(['event','space','place','outdoor']));
  assert.equal(worldTemplates.find(t=>t.id==='dinner-under-lights')!.scene.context!.setting,'rooftop');
  assert.equal(worldTemplates.find(t=>t.id==='rainy-day-cafe')!.scene.context!.setting,'cafe');
  assert.equal(worldTemplates.find(t=>t.id==='by-the-river')!.scene.context!.setting,'riverside');
  for(const template of worldTemplates)assert.equal(resolveSceneContext(template.scene).setting,template.scene.context!.setting);
});

test('live world generation persists explicit outdoor context without requiring a new model schema field',async()=>{
  let profile=createProfile('world-context');
  profile=remember(profile,{id:'m1',text:'I like quiet afternoons and warm colors.',source:'from our first call',kind:'call',confidence:.9});
  profile.journey={hatched:true,interviewCount:5,interviewComplete:true,nextQuestion:'',districts:[{id:'initial',name:'Home',provenance:'from our call',sourceMemoryIds:['m1'],scene:scene('Home'),createdAt:new Date().toISOString()}],processedCallIds:[]};
  let instructions='';
  const call=(async(request:Parameters<typeof structuredCall>[0])=>{
    instructions=request.instructions;
    return {data:request.validate({districts:[{blueprint:fixtureBlueprint(['7434051500','8059518763']),name:'A quiet picnic',explanation:'A little place for a slow afternoon.',sourceMemoryIds:['memory-1'],items:[{skuId:'7434051500',oneLiner:'Two stoneware mugs.'},{skuId:'8059518763',oneLiner:'A simple tray.'}]}]}),meta:{cached:false,offline:false,model:'fixture',inputTokens:0,outputTokens:0,latencyMs:1,cacheKey:'fixture'}};
  }) as typeof structuredCall;
  const output=await generateWorld(profile,{requestId:'river',command:'An outdoor picnic by the river under ₩50,000'},{call});
  assert.equal(output.districts.at(-1)!.scene.context!.type,'outdoor');
  assert.equal(output.districts.at(-1)!.scene.context!.setting,'riverside');
  assert.match(instructions,/Worlds can be events, indoor spaces, outdoor experiences/);
});
