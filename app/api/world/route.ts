import {z} from 'zod';
import {generateWorld} from '@/lib/server/world';
import {withSession,sessionResponse} from '@/lib/server/store';
import {readJson} from '@/lib/server/http';
import {errorResponse} from '@/lib/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
const schema=z.object({command:z.string().trim().max(1200).optional(),districtId:z.string().min(1).max(100).optional(),requestId:z.string().min(1).max(100)});
export async function POST(request:Request){try{
  const body=schema.parse(await readJson(request));
  const result=await withSession(request,async session=>{const data=await generateWorld(session.profile,body);session.profile=data.profile;return data;});
  return sessionResponse(result.data,result.session);
}catch(error){return errorResponse(error);}}
