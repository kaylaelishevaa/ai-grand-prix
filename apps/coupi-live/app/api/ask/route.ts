import {z} from 'zod';
import {answerQuestion} from '@/lib/server/services';
import {withSession,sessionResponse} from '@/lib/server/store';
import {readJson} from '@/lib/server/http';
import {errorResponse} from '@/lib/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 const body=z.object({question:z.string().trim().min(1).max(2000),requestId:z.string().min(1).max(100),clarification:z.object({question:z.string().max(250),answer:z.string().max(2000)}).optional(),excludeSkuIds:z.array(z.string().max(100)).max(35).optional(),pickSkuId:z.string().max(100).optional(),swapDirection:z.enum(['another','cheaper','better reviews']).optional()}).parse(await readJson(request));
 const result=await withSession(request,async session=>{const data=await answerQuestion(session.profile,body);session.profile=data.profile;return data;});return sessionResponse(result.data,result.session);
 }catch(error){return errorResponse(error);}}
