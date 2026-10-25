import type {Profile} from './types';

/** Ordinary calls start shopping. Hatching explicitly opts into the first-call interview. */
export function usesFirstCall(profile:Profile,action?:string):boolean {
  const journey=profile.journey;
  if(action==='hatch')return !journey?.interviewComplete;
  return journey?.firstCallRequested===true&&!journey.interviewComplete&&!journey.interviewPaused;
}
