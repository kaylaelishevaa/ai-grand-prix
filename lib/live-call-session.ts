import {safePersonalizationCandidates} from './personalization';
import type {Profile} from './types';

export interface CallScope {epoch:number;profileId:string;draftId?:string;}
/** Epochs distinguish Strict Mode remounts from the component's previous async work. */
export class LiveCallLifecycle {
  private epoch=0;
  active=false;
  private controllers=new Set<AbortController>();
  begin(){this.active=true;this.epoch++;}
  end(){this.active=false;this.epoch++;for(const controller of this.controllers)controller.abort();this.controllers.clear();}
  capture(profile:Profile):CallScope{return{epoch:this.epoch,profileId:profile.id,draftId:profile.journey?.personalizationDraft?.id};}
  current(scope:CallScope,profile:Profile,checkDraft=false){return this.active&&scope.epoch===this.epoch&&scope.profileId===profile.id&&(!checkDraft||scope.draftId===profile.journey?.personalizationDraft?.id);}
  controller(scope:CallScope,profile:Profile,checkDraft=false){if(!this.current(scope,profile,checkDraft))throw Error('Your conversation changed. Please try again.');const controller=new AbortController();this.controllers.add(controller);return controller;}
  release(controller:AbortController){this.controllers.delete(controller);}
}

/** The iframe receives a bounded visible draft, never canonical memory, diary or credentials. */
export function liveDiscoveryContext(profile:Profile,draftPending:boolean){
  const journey=profile.journey,draft=journey?.personalizationDraft,paused=journey?.interviewPaused===true;
  const active=!!draft&&!paused,question=active&&draft.answerCount<5?journey?.nextQuestion||'':'';
  const count=draft?.answerCount??journey?.interviewCount??0;
  return{
    personalization:{type:'coupi-personalization-context',active,question,count,draftPending:!!draft&&draftPending,memories:draft?safePersonalizationCandidates(profile,draft).slice(-8).map(line=>({text:line.text.slice(0,240),source:line.source.slice(0,140),confidence:line.confidence})):[]},
    progress:{type:'coupi-interview-progress',count,question,complete:!draft&&journey?.interviewComplete===true,conversationMode:active&&count<5?'interview':'conversation',paused,worldReady:false},
  };
}
