import {z} from 'zod';
import {addDecision,approveDecisions,removeDecision} from '@/lib/guardrails';
import {withSession,sessionResponse} from '@/lib/server/store';
import {readJson} from '@/lib/server/http';
import {errorResponse} from '@/lib/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[z.object({action:z.literal('add'),skuId:z.string().min(1).max(100),source:z.string().max(80).default('your pick')}),z.object({action:z.literal('approve'),ids:z.array(z.string().max(100)).max(100)}),z.object({action:z.literal('remove'),id:z.string().min(1).max(100)})]);
export async function GET(request:Request){try{const result=await withSession(request,async session=>({profile:session.profile}));return sessionResponse(result.data,result.session);}catch(error){return errorResponse(error);}}
export async function POST(request:Request){try{const body=schema.parse(await readJson(request));const result=await withSession(request,async session=>{
 if(body.action==='add'){const data=addDecision(session.profile,body.skuId,body.source);session.profile=data.profile;return data;}
 if(body.action==='approve'){const data=approveDecisions(session.profile,body.ids);session.profile=data.profile;return data;}
 session.profile=removeDecision(session.profile,body.id);return{profile:session.profile};
 });return sessionResponse(result.data,result.session);}catch(error){return errorResponse(error);}}
