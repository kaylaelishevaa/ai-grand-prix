import {createHash,randomUUID} from 'node:crypto';
import {personalizationInputSchema,PERSONALIZATION_INTERESTS,safePersonalizationCandidates,type PersonalizationInput,type PersonalizationResponse,type PersonalizationReview,type PersonalizationDraft} from '../personalization';
import type {Profile} from '../types';
import type {JourneyState} from '../journey-types';
import {deleteMemory,sanitizeProfileForAI} from '../profile';
import {remember} from '../memory';
import {AppError} from './errors';
import {FIRST_CALL_QUESTIONS} from '../call-questions';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const initialJourney=():JourneyState=>({hatched:true,interviewCount:0,interviewComplete:false,nextQuestion:FIRST_CALL_QUESTIONS[0],districts:[],processedCallIds:[]});
const contextKinds=new Set(['call','call-review','call-request','ask','scene','swipe','verdict','swap','pattern','inventory']);
function worldReady(profile:Profile){const safe=sanitizeProfileForAI(profile);return profile.memoryLines.some(line=>contextKinds.has(line.kind||'')&&safe.memoryLines.some(item=>item.text===line.text&&item.source===line.source));}

export {safePersonalizationCandidates} from '../personalization';

/** Conservative proposal: keep volunteered sentences verbatim, never guess fields from them. */
export function personalizationProposal(profile:Profile,draft:PersonalizationDraft):PersonalizationReview {
  return {interests:[],vibe:null,budgetPerItem:null,story:safePersonalizationCandidates(profile,draft).map(line=>line.text).join('\n').slice(0,1200)};
}

function response(profile:Profile):PersonalizationResponse {
  const draft=profile.journey?.personalizationDraft;
  return{profile,...(draft?{draftId:draft.id,...(draft.review?{review:personalizationProposal(profile,draft)}:{})}:{}),worldReady:!draft&&worldReady(profile)};
}
function storyPieces(story:string){
  const pieces:string[]=[];let remaining=story;
  while(remaining){let end=Math.min(360,remaining.length);if(end<remaining.length){const space=remaining.lastIndexOf(' ',end);if(space>180)end=space;}pieces.push(remaining.slice(0,end).trim());remaining=remaining.slice(end).trim();}
  return pieces.filter(Boolean);
}

/** Only a shopper's explicit confirmation can move reviewed fields into canonical memory. */
export function handlePersonalization(profile:Profile,raw:PersonalizationInput,now=new Date()):PersonalizationResponse {
  const input=personalizationInputSchema.parse(raw),requestHash=hash(input),state=structuredClone(profile.journey||initialJourney());
  const prior=state.personalizationReceipts?.find(item=>item.requestId===input.requestId);
  if(prior){if(prior.requestHash!==requestHash)throw new AppError('PERSONALIZATION_REQUEST_CONFLICT','That review request was already used for a different action.',409);return response(profile);}
  let next=structuredClone(profile);
  if(input.action==='start'){
    if(!state.personalizationDraft){state.personalizationDraft={id:randomUUID(),startedAt:now.toISOString(),answerCount:0,reviewReady:false,candidates:[]};state.nextQuestion=initialJourney().nextQuestion;}
    // Choosing discovery again is explicit opt-in; preserve the already answered count.
    state.interviewPaused=false;
    state.nextQuestion=state.personalizationDraft.answerCount>=5?'':FIRST_CALL_QUESTIONS[state.personalizationDraft.answerCount];
    state.hatched=true;
  }else{
    const draft=state.personalizationDraft;
    if(!draft||!input.draftId||draft.id!==input.draftId)throw new AppError('PERSONALIZATION_DRAFT_CHANGED','That review is no longer current. Start a fresh conversation.',409);
    if(input.action==='draft'){
      // A tool proposal is advisory only. Rebuild from server-validated user statements.
      draft.review=personalizationProposal(profile,draft);draft.reviewReady=true;
    }else if(input.action==='discard'){
      delete state.personalizationDraft;
      delete state.lastReply;
      if(!state.interviewComplete)state.interviewPaused=true;
    }else{
      if(!input.review)throw new AppError('PERSONALIZATION_REVIEW_REQUIRED','Review your preferences before saving them.');
      const review=input.review,lines:string[]=[];
      for(const interest of review.interests)lines.push(`An interest I chose: ${PERSONALIZATION_INTERESTS[interest]}.`);
      if(review.vibe)lines.push(`My chosen style: ${{calm:'quiet and simple',bold:'playful and colorful',mixed:'a mix of quiet and playful'}[review.vibe]}.`);
      if(review.budgetPerItem!==null)lines.push(`My comfortable price per item is up to ₩${review.budgetPerItem.toLocaleString('en-US')}; this is a preference, not spending permission.`);
      lines.push(...storyPieces(review.story));
      if(!lines.length)throw new AppError('WORLD_NEEDS_CONTEXT','Keep one interest or tell me a little about your day before building your world.',409);
      // Replacing this review never erases unrelated calls, swipes, orders or household caps.
      for(const id of state.personalizationMemoryIds||[])next=deleteMemory(next,id,now);
      const ids:string[]=[];
      for(const [index,text] of lines.entries()){
        const id=`call-review:${hash([draft.id,input.requestId]).slice(0,24)}:${index}`;ids.push(id);
        next=remember(next,{id,text,source:'confirmed in your first-call review',confidence:0.98,kind:'call-review',traitKeys:[]},now);
        const line=next.memoryLines.find(item=>item.id===id);
        if(line&&!safePersonalizationCandidates(next,{...draft,candidates:[line]}).length)line.excludedFromAI=true;
      }
      const safe=sanitizeProfileForAI(next);
      if(!next.memoryLines.some(line=>ids.includes(line.id)&&!line.excludedFromAI&&safe.memoryLines.some(item=>item.text===line.text&&item.source===line.source)))throw new AppError('WORLD_NEEDS_CONTEXT','That context is private. Keep one everyday interest for the world, or continue your call.',409);
      // deleteMemory may invalidate worlds whose previous review provenance was removed.
      if(next.journey){state.districts=next.journey.districts;state.archivedJournals=next.journey.archivedJournals;}
      state.personalizationMemoryIds=ids;state.interviewCount=Math.max(state.interviewCount,draft.answerCount);state.interviewComplete=true;state.interviewPaused=false;state.nextQuestion='';delete state.pendingCall;delete state.lastReply;delete state.personalizationDraft;
    }
  }
  state.personalizationReceipts=[...(state.personalizationReceipts||[]),{requestId:input.requestId,requestHash}].slice(-256);
  next={...next,journey:state,revision:next.revision+1,updatedAt:now.toISOString()};
  return response(next);
}
