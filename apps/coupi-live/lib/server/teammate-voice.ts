import sourceCatalog from '../../data/teammate-catalog.json';
import {sanitizeProfileForAI} from '../profile';
import {createVoiceHandler} from '../teammate/nook-voice.mjs';
import type {Profile} from '../types';
import {AppError,errorResponse} from './errors';
import {requireLocalOrigin} from './http';
import {sessionResponse,withSession} from './store';
import {FIRST_CALL_QUESTIONS} from './call';
import {permittedVoiceWorlds} from './voice-world-products';
import {safePersonalizationCandidates} from './personalization';
import {runtimeEnv} from './runtime';

/** These are sourced historical references, kept separate from the synthetic review/catalog database. */
export const teammateCatalog=sourceCatalog;
const profileCategories:Record<string,string[]>={makeup:['makeup','beauty'],clothes:['clothes','wardrobe','sportswear'],desk:['desk','home','electronics'],glasses:['glasses','wardrobe']};
export function eligibleTeammateProducts(profile:Profile){
  const excluded=new Set(profile.quarantine.filter(item=>item.sensitive).map(item=>item.category));
  const owned=new Set(profile.owned.map(item=>item.skuId));
  return teammateCatalog.filter(product=>!owned.has(product.id)&&!(profileCategories[product.category]||[product.category]).some(category=>excluded.has(category)));
}
export function teammateProfileContext(profile:Profile){
  const safe=sanitizeProfileForAI(profile);
  const draft=profile.journey?.personalizationDraft,count=draft?.answerCount??profile.journey?.interviewCount??0;
  return {traits:safe.traits,memoryLines:safe.memoryLines.slice(-32),budget:safe.budget,worlds:permittedVoiceWorlds(profile),interview:{active:(!!draft||!profile.journey?.interviewComplete)&&!profile.journey?.interviewPaused&&count<5,answeredCount:count,question:count<5?FIRST_CALL_QUESTIONS[count]:'',questions:[...FIRST_CALL_QUESTIONS]},
    personalization:{active:!!draft&&!profile.journey?.interviewPaused,draft_pending:draft?.reviewReady===true,preferences:null,...(draft?{draftMemories:safePersonalizationCandidates(profile,draft).slice(-8).map(line=>({text:line.text,source:line.source,confidence:line.confidence}))}:{})}};
}
/** Preserve the teammate's raw-SDP protocol while using the app's latest HttpOnly profile session. */
export async function teammateVoiceRoute(request:Request):Promise<Response>{
  try{
    if(request.method==='POST'){
      if(!request.headers.get('origin')||request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('ORIGIN_MISMATCH','Open this feature from the app’s own address.',403);
      requireLocalOrigin(request);
    }
    const env=runtimeEnv(),started=Date.now(),pathname=new URL(request.url).pathname,isSession=pathname==='/api/voice/session';
    // Readiness is deployment-wide. It must not race initial profile writes or
    // create/replace the visitor cookie before the parent page establishes it.
    if(request.method==='GET'&&pathname==='/api/voice/status'){
      return (await createVoiceHandler({products:teammateCatalog})(request,env))!;
    }
    const result=await withSession(request,async session=>{
      const handler=createVoiceHandler({products:eligibleTeammateProducts(session.profile),profileContext:teammateProfileContext(session.profile)});
      return handler(request,env);
    });
    const response=result.data||Response.json({error:'Unknown live-call route.'},{status:404});
    const headers=new Headers(response.headers);
    headers.set('Set-Cookie',sessionResponse({},result.session).headers.get('set-cookie')!);
    if(isSession&&request.method==='POST')console.info('[coupi:voice]',JSON.stringify({operation:'realtime-handshake',model:env.OPENAI_REALTIME_MODEL||'gpt-realtime-2.1-mini',offline:env.DEMO_OFFLINE==='1',latencyMs:Date.now()-started,status:response.status,inputTokens:null,outputTokens:null,usageNote:'Realtime token usage is not returned by the SDP handshake.'}));
    return new Response(response.body,{status:response.status,headers});
  }catch(error){return errorResponse(error);}
}
