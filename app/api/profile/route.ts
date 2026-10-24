import {z} from 'zod';
import {applySwipe,deleteMemory,createProfile} from '@/lib/profile';
import {validatedTimezone} from '@/lib/guardrails';
import {withSession,sessionResponse} from '@/lib/server/store';
import {readJson} from '@/lib/server/http';
import {errorResponse,AppError} from '@/lib/server/errors';
import {summarizeTaste} from '@/lib/server/services';
import type {ProfileResponse} from '@/lib/types';
export const runtime='nodejs';export const dynamic='force-dynamic';
const requestSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('swipe'),swipe:z.object({id:z.string().min(1).max(100),skuId:z.string().min(1).max(100),action:z.enum(['ooh','skip','nah']),reason:z.enum(['too pricey','not my style','have one']).optional(),source:z.string().min(1).max(80)})}),
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
   if(profile.swipes.length-profile.summarizedSwipeCount>=6){try{response=await summarizeTaste(profile);profile=response.profile;}catch(error){response={profile,summaryError:error instanceof AppError?error.message:'Memory wording failed. Your attribute votes were saved; retry the summary.'};}}
  }else if(body.action==='summarize'){
   if(profile.swipes.length-profile.summarizedSwipeCount<6)throw new AppError('NOT_ENOUGH_SWIPES','Swipe six cards before asking for a new memory summary.');
   response=await summarizeTaste(profile);profile=response.profile;
  }else if(body.action==='deleteMemory')profile=deleteMemory(profile,body.lineId);
  else if(body.action==='reset')profile={...createProfile(profile.id),timezone:profile.timezone};
  else if(body.action==='settings'){profile={...profile,budget:body.budget??profile.budget,pretend2am:body.pretend2am??profile.pretend2am,timezone:body.timezone?validatedTimezone(body.timezone):profile.timezone,revision:profile.revision+1,updatedAt:new Date().toISOString()};}
  session.profile=profile;return{...response,profile};
 });return sessionResponse(result.data,result.session);
 }catch(error){return errorResponse(error);}}
