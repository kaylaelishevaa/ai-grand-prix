import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile} from '../lib/profile';
import {remember} from '../lib/memory';
import {handlePersonalization} from '../lib/server/personalization';
import {teammateProfileContext} from '../lib/server/teammate-voice';
import {sessionConfiguration} from '../lib/teammate/nook-voice.mjs';
import {liveCallBody,publicCallResult} from '../lib/call-bridge';
import type {CallResponse} from '../lib/journey-types';

test('reconnecting voice starts shopping without exposing or discarding unfinished draft facts',()=>{
  let profile=handlePersonalization(createProfile('draft-voice'),{action:'start',requestId:'start'}).profile;
  const draft=profile.journey!.personalizationDraft!;
  const line=remember(profile,{id:'candidate',text:'I draw by my bedroom window.',source:'from our first call',confidence:.9,kind:'call'}).memoryLines.at(-1)!;
  draft.candidates=[line];draft.answerCount=3;
  const context=teammateProfileContext(profile);
  assert.equal(context.interview.question,'');assert.equal(context.interview.answeredCount,3);
  assert.equal(context.personalization.active,false);assert.deepEqual(context.personalization.draftMemories,[]);assert.equal(draft.candidates[0].text,line.text);
  assert.equal(context.memoryLines.length,0);assert(!JSON.stringify(context).includes(draft.id));
  profile.quarantine.push({category:'wardrobe',sensitive:true,note:'private'});
  draft.candidates=[{...line,text:'I want a midi dress.'}];
  assert.equal(teammateProfileContext(profile).personalization.draftMemories?.length,0);
  draft.answerCount=5;draft.reviewReady=true;
  const ready=teammateProfileContext(profile);assert.equal(ready.interview.active,false);assert.equal(ready.interview.question,'');assert.equal(ready.personalization.draft_pending,false);
  profile.journey!.interviewPaused=true;assert.equal(teammateProfileContext(profile).personalization.active,false);
});

test('Realtime review tools remain draft-only, bounded and optional',()=>{
  const profile=handlePersonalization(createProfile('draft-tools'),{action:'start',requestId:'start'}).profile;
  const configuration=sessionConfiguration({},teammateProfileContext(profile));
  const draft=configuration.tools.find(tool=>tool.name==='draft_preferences') as unknown as {description:string;parameters:Record<string,any>},skip=configuration.tools.find(tool=>tool.name==='skip_personalization') as unknown as {parameters:Record<string,any>};
  assert(draft&&skip);assert.match(draft.description,/never saves/);assert.doesNotMatch(configuration.instructions,/FIRST CALL OVERRIDE|OPTIONAL DISCOVERY REVIEW/);assert.match(configuration.instructions,/Every public call starts directly with shopping/);
  assert.equal(draft.parameters.additionalProperties,false);assert.deepEqual(draft.parameters.required,['interests','vibe','budget','story']);
  const properties=draft.parameters.properties as Record<string,any>;
  assert.equal(properties.story.maxLength,1200);assert.equal(properties.budget.maximum,10000000);assert.equal(properties.interests.maxItems,5);
  assert.deepEqual(skip.parameters.properties,{});assert.equal(skip.parameters.additionalProperties,false);
  assert.equal((configuration.audio as {input:{turn_detection:{create_response:boolean}}}).input.turn_detection.create_response,true);
  assert(!JSON.stringify(configuration).includes('OPENAI_API_KEY'));
});

test('voice text and photo share the same exact discovery ID while public replies hide it',()=>{
  const turn={id:'one',text:'I enjoy tea.'},draftId='a-real-server-draft';
  assert.equal(JSON.parse(liveCallBody(turn,draftId).body as string).personalizationDraftId,draftId);
  const photo={mime:'image/jpeg' as const,capturedAt:'2026-10-25T03:00:00.000Z',dataUrl:'data:image/jpeg;base64,/9j/'};
  const body=liveCallBody({...turn,photo},draftId).body as FormData;assert.equal(body.get('personalizationDraftId'),draftId);
  const result={status:'ok',message:'Let’s review.',question:null,conversationMode:'interview',interviewCount:5,interviewComplete:false,worldReady:false,memories:[],proposedSkuIds:[],profile:createProfile('reply'),personalization:{draftId,reviewReady:true}} as CallResponse;
  const safe=publicCallResult(result);assert.deepEqual(safe.personalization,{reviewReady:true});assert(!JSON.stringify(safe).includes(draftId));
});
