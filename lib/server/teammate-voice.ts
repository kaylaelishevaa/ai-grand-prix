import sourceCatalog from '../../data/teammate-catalog.json';
import {sanitizeProfileForAI} from '../profile';
import {createVoiceHandler} from '../teammate/nook-voice.mjs';
import type {Profile} from '../types';
import {AppError,errorResponse} from './errors';
import {requireLocalOrigin} from './http';
import {sessionResponse,withSession} from './store';
import {permittedVoiceWorlds} from './voice-world-products';

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
  return {traits:safe.traits,memoryLines:safe.memoryLines.slice(-32),budget:safe.budget,worlds:permittedVoiceWorlds(profile)};
}
/** Preserve the teammate's raw-SDP protocol while using the app's latest HttpOnly profile session. */
export async function teammateVoiceRoute(request:Request):Promise<Response>{
  try{
    if(request.method==='POST'){
      if(!request.headers.get('origin')||request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('ORIGIN_MISMATCH','Open this feature from the app’s own address.',403);
      requireLocalOrigin(request);
    }
    const started=Date.now(),isSession=new URL(request.url).pathname==='/api/voice/session';
    const result=await withSession(request,async session=>{
      const handler=createVoiceHandler({products:eligibleTeammateProducts(session.profile),profileContext:teammateProfileContext(session.profile)});
      return handler(request,{OPENAI_API_KEY:process.env.OPENAI_API_KEY,OPENAI_REALTIME_MODEL:process.env.OPENAI_REALTIME_MODEL,DEMO_OFFLINE:process.env.DEMO_OFFLINE});
    });
    const response=result.data||Response.json({error:'Unknown live-call route.'},{status:404});
    const headers=new Headers(response.headers);
    headers.set('Set-Cookie',sessionResponse({},result.session).headers.get('set-cookie')!);
    if(isSession&&request.method==='POST')console.info('[coupi:voice]',JSON.stringify({operation:'realtime-handshake',model:process.env.OPENAI_REALTIME_MODEL||'gpt-realtime-2.1',offline:process.env.DEMO_OFFLINE==='1',latencyMs:Date.now()-started,status:response.status,inputTokens:null,outputTokens:null,usageNote:'Realtime token usage is not returned by the SDP handshake.'}));
    return new Response(response.body,{status:response.status,headers});
  }catch(error){return errorResponse(error);}
}
