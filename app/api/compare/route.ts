import {z} from 'zod';
import {ComparisonError,selectContender} from '@/lib/comparison';
import {AppError,errorResponse} from '@/lib/server/errors';
import {readJson} from '@/lib/server/http';
import {sessionResponse,withSession} from '@/lib/server/store';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const schema=z.object({fromSkuId:z.string().min(1).max(100),skuId:z.string().min(1).max(100),requestId:z.string().min(1).max(80),origin:z.enum(['call','ask','scene'])}).strict();
export async function POST(request:Request){try{
  const body=schema.parse(await readJson(request));
  const result=await withSession(request,async session=>{
    const data=selectContender(session.profile,body);
    session.profile=data.profile;
    return data;
  });
  return sessionResponse(result.data,result.session);
}catch(error){return errorResponse(error instanceof ComparisonError?new AppError(error.code,error.message,error.status):error);}}
