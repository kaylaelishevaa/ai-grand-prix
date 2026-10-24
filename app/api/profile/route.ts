import {z} from 'zod';
import {applySwipe,deleteMemory,createProfile} from '@/lib/profile';
import {remember,rememberWords,rememberVerdictChoice,confirmMemory} from '@/lib/memory';
import {validatedTimezone} from '@/lib/guardrails';
import {withSession,sessionResponse} from '@/lib/server/store';
import {readJson} from '@/lib/server/http';
import {errorResponse,AppError} from '@/lib/server/errors';
import {summarizeTaste} from '@/lib/server/services';
import type {ProfileResponse} from '@/lib/types';
export const runtime='nodejs';export const dynamic='force-dynamic';
const requestSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('swipe'),swipe:z.object({id:z.string().min(1).max(100),skuId:z.string().min(1).max(100),action:z.enum(['ooh','skip','nah']),reason:z.enum(['too pricey','not my style','have one']).optional(),source:z.string().min(1).max(80)})}),
 z.object({action:z.literal('verdictChoice'),requestId:z.string().min(1).max(100),skuId:z.string().min(1).max(100)}),
 z.object({action:z.literal('callStatement'),id:z.string().min(1).max(100),text:z.string().trim().min(1).max(400)}),
 z.object({action:z.literal('guidedCall'),id:z.string().min(1).max(100),chapter:z.enum(['store','fridge'])}),
 z.object({action:z.literal('chapter'),answer:z.enum(['yes','not yet'])}),
 z.object({action:z.literal('confirmMemory'),lineId:z.string().min(1).max(100)}),
 z.object({action:z.literal('correctMemory'),lineId:z.string().min(1).max(100),text:z.string().trim().min(1).max(400)}),
 z.object({action:z.literal('deleteMemory'),lineId:z.string().min(1).max(100)}),
 z.object({action:z.literal('settings'),budget:z.number().int().min(10000).max(5000000).optional(),pretend2am:z.boolean().optional(),timezone:z.string().max(80).optional()}),
 z.object({action:z.literal('summarize')}),z.object({action:z.literal('reset')})
]);
export async function GET(request:Request){try{const result=await withSession(request,async session=>({profile:session.profile}));return sessionResponse(result.data,result.session);}catch(error){return errorResponse(error);}}
export async function POST(request:Request){try{
 const body=requestSchema.parse(await readJson(request));
 const result=await withSession(request,async session=>{
  let profile=session.profile;let response:ProfileResponse={profile};
  if(body.action==='swipe'){
   try{profile=applySwipe(profile,body.swipe);}catch{throw new AppError('INVALID_SWIPE','That swipe references an unavailable product or invalid feedback.');}
   session.profile=profile;
  }else if(body.action==='summarize'){
   if(profile.swipes.length-profile.summarizedSwipeCount<6)throw new AppError('NOT_ENOUGH_SWIPES','Swipe six cards before asking for a new memory summary.');
   response=await summarizeTaste(profile);profile=response.profile;
  }else if(body.action==='verdictChoice'){
   try{profile=rememberVerdictChoice(profile,body.requestId,body.skuId);}catch(error){throw new AppError('INVALID_VERDICT_CHOICE',error instanceof Error?error.message:'Invalid choice.');}
  }else if(body.action==='callStatement')profile=rememberWords(profile,body.text,'call:'+body.id,'call');
  else if(body.action==='guidedCall'){profile=remember(profile,{id:'guided-call:'+body.id,text:body.chapter==='store'?'scripted call statement: “which one?”':'scripted inventory: eggs and kimchi present; milk low; greens missing',source:body.chapter==='store'?'from the scripted store call':'from the scripted fridge call',confidence:0.9,kind:'scripted'});}
  else if(body.action==='chapter'){profile=remember(profile,{id:'chapter:'+profile.revision,text:body.answer==='yes'?'wants a baby-item starter setup':'not ready for a new-chapter setup',source:'from your guided life-chapter answer · scripted scenario',confidence:1,kind:'scripted'});profile.chapterAnswer=body.answer;}
  else if(body.action==='confirmMemory')profile=confirmMemory(profile,body.lineId);
  else if(body.action==='correctMemory'){
   const original=profile.memoryLines.find(line=>line.id===body.lineId);
   if(!original)throw new AppError('UNKNOWN_MEMORY','That memory no longer exists.');
   profile=deleteMemory(profile,body.lineId);
   profile=original.kind==='scripted'?remember(profile,{id:'correction:'+body.lineId+':'+profile.revision,text:body.text,source:'from your correction · scripted scenario',confidence:1,kind:'scripted'}):rememberWords(profile,body.text,'correction:'+body.lineId+':'+profile.revision,'ask');
   const line=profile.memoryLines.at(-1)!;line.source='from your correction';line.confidence=1;
   if(original.kind==='scripted'){line.kind='scripted';line.source+=' · scripted scenario';}
  }else if(body.action==='deleteMemory')profile=deleteMemory(profile,body.lineId);
  else if(body.action==='reset')profile={...createProfile(profile.id),timezone:profile.timezone};
  else if(body.action==='settings'){profile={...profile,budget:body.budget??profile.budget,pretend2am:body.pretend2am??profile.pretend2am,timezone:body.timezone?validatedTimezone(body.timezone):profile.timezone,revision:profile.revision+1,updatedAt:new Date().toISOString()};if(body.budget!==undefined)profile=remember(profile,{id:'budget:'+profile.revision,text:`monthly comfort zone: ₩${body.budget.toLocaleString('en-US')}`,source:'from your budget setting',confidence:1,kind:'settings'});}
  session.profile=profile;return{...response,profile};
 });return sessionResponse(result.data,result.session);
 }catch(error){return errorResponse(error);}}
