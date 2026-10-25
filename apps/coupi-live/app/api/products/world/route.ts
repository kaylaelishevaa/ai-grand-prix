import {z} from 'zod';
import {AppError,errorResponse} from '@/lib/server/errors';
import {readJson} from '@/lib/server/http';
import {sessionResponse,withSession} from '@/lib/server/store';
import {openVoiceWorldProduct,searchVoiceWorldProducts} from '@/lib/server/voice-world-products';
export const runtime='nodejs';export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('search'),query:z.string().trim().min(1).max(300),max_price:z.number().finite().min(0).max(100000000).nullable().optional()}).strict(),
  z.object({action:z.literal('open'),skuId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/)}).strict(),
]);
export async function POST(request:Request){try{
  if(!request.headers.get('origin')||request.headers.get('sec-fetch-site')==='cross-site')throw new AppError('ORIGIN_MISMATCH','Open this feature from the app’s own address.',403);
  const body=schema.parse(await readJson(request));
  const result=await withSession(request,async session=>body.action==='search'?searchVoiceWorldProducts(session.profile,body):openVoiceWorldProduct(session.profile,body.skuId));
  return sessionResponse(result.data,result.session);
}catch(error){return errorResponse(error);}}
