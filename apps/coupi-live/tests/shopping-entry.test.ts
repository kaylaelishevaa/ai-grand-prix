import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile} from '../lib/profile';
import {handleCall,journeyFor} from '../lib/server/call';
import {teammateProfileContext} from '../lib/server/teammate-voice';
import {sessionConfiguration} from '../lib/teammate/nook-voice.mjs';
import {usesFirstCall} from '../lib/call-entry';

test('shopping-only calls preserve the latest direct-shopping flow, including old draft profiles',async()=>{
 for(const oldDraft of [false,true]){
  const profile=createProfile('shopping-start');profile.journey={...journeyFor(profile),interviewCount:2,interviewComplete:false,districts:[]};
  if(oldDraft)profile.journey.personalizationDraft={id:'existing-draft',startedAt:'2026-10-25T00:00:00Z',answerCount:2,reviewReady:false,candidates:[]};
  const before=structuredClone(profile);
  for(const action of ['hatch','start','resumeInterview'] as const){
   const result=await handleCall(profile,{action,requestId:action,shoppingOnly:true});
   assert.equal(result.message,'What do you want to buy?');assert.equal(result.question,null);assert.equal(result.conversationMode,'conversation');
   assert.equal(result.profile.journey?.interviewPaused,true);assert.deepEqual(result.profile.journey?.districts,before.journey?.districts);
   assert.deepEqual(result.profile.memoryLines,before.memoryLines);assert.deepEqual(result.profile.journey?.personalizationDraft,before.journey?.personalizationDraft);
   const context=teammateProfileContext(result.profile);assert.equal(context.interview.active,false);assert.equal(context.interview.question,'');assert.equal(context.personalization.active,false);assert.deepEqual(context.personalization.draftMemories,[]);
   const configuration=sessionConfiguration({},context);assert(!configuration.instructions.includes('FIRST CALL OVERRIDE'));assert.match(configuration.instructions,/greeting for the opening response only/);
  }
 }

});


test('hatching retains the existing shopping-first call without restoring interview controls',async()=>{
 const profile=createProfile('first-hatch');assert.equal(usesFirstCall(profile),false);
 assert.equal(usesFirstCall(profile,'hatch'),false);
 const result=await handleCall(profile,{action:'hatch',requestId:'hatch',shoppingOnly:!usesFirstCall(profile,'hatch')});
 assert.equal(usesFirstCall(result.profile),false);
 assert.equal(result.message,'What do you want to buy?');assert.equal(result.question,null);
 const context=teammateProfileContext(result.profile);assert.equal(context.interview.active,false);assert.equal(context.interview.question,'');
 assert(!sessionConfiguration({},context).instructions.includes('FIRST CALL OVERRIDE'));
 result.profile.journey!.firstCallRequested=true;result.profile.journey!.interviewComplete=false;
 assert.equal(usesFirstCall(result.profile),false,'An older hatch opt-in must not restore removed controls');
 assert.equal(teammateProfileContext(result.profile).interview.active,false);
});
