import {z} from 'zod';
import {assignDelegation,refreshDelegation} from '@/lib/delegation';
import {withSession,sessionResponse} from '@/lib/server/store';
import {readJson} from '@/lib/server/http';
import {errorResponse} from '@/lib/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('assign'),skuId:z.string().min(1).max(100),budgetCap:z.number().int().min(0).max(5000000),watchPrice:z.boolean(),haggle:z.boolean(),bundle:z.boolean(),scheduleDelivery:z.boolean(),source:z.string().max(100).optional()}),
  z.object({action:z.literal('refresh'),id:z.string().min(1).max(150)}),
]);
export async function POST(request:Request){try{
  const body=schema.parse(await readJson(request));
  const result=await withSession(request,async session=>{
    const data=body.action==='assign'?assignDelegation(session.profile,body):refreshDelegation(session.profile,body.id);
    session.profile=data.profile;return data;
  });return sessionResponse(result.data,result.session);
}catch(error){return errorResponse(error);}}
