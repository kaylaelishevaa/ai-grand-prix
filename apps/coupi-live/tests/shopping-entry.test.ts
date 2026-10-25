import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile} from '../lib/profile';
import {handleCall,journeyFor} from '../lib/server/call';
import {teammateProfileContext} from '../lib/server/teammate-voice';
import {sessionConfiguration} from '../lib/teammate/nook-voice.mjs';
import {usesFirstCall} from '../lib/call-entry';
import {FIRST_CALL_QUESTIONS} from '../lib/call-questions';

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
   const configuration=sessionConfiguration({},context);assert(!configuration.instructions.includes('FIRST CALL OVERRIDE'));assert.match(configuration.instructions,/What do you want to buy/);
  }
 }

});


test('hatching opts into the first interview while ordinary and completed calls stay shopping-first',async()=>{
 const profile=createProfile('first-hatch');assert.equal(usesFirstCall(profile),false);
 assert.equal(usesFirstCall(profile,'hatch'),true);
 const result=await handleCall(profile,{action:'hatch',requestId:'hatch',shoppingOnly:!usesFirstCall(profile,'hatch')});
 assert.equal(usesFirstCall(result.profile),true);assert.equal(result.profile.journey?.interviewComplete,false);
 const context=teammateProfileContext(result.profile);assert.equal(context.interview.active,true);assert.equal(context.interview.question,FIRST_CALL_QUESTIONS[0]);
 assert.match(sessionConfiguration({},context).instructions,/FIRST CALL OVERRIDE/);
 const resumed=await handleCall(result.profile,{action:'start',requestId:'start',shoppingOnly:!usesFirstCall(result.profile)});
 assert.equal(resumed.conversationMode,'interview');assert.equal(resumed.question,FIRST_CALL_QUESTIONS[0]);
 result.profile.journey!.interviewPaused=true;assert.equal(usesFirstCall(result.profile),false);
 assert.equal(teammateProfileContext(result.profile).interview.active,false);
 result.profile.journey!.interviewComplete=true;assert.equal(usesFirstCall(result.profile,'hatch'),false);
});
