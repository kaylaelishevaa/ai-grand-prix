import {z} from 'zod';
import {updateWorldJournal} from '@/lib/server/world-journal';
import {withSession,sessionResponse} from '@/lib/server/store';
import {readJson} from '@/lib/server/http';
import {errorResponse} from '@/lib/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('add'),districtId:z.string().min(1).max(100),requestId:z.string().trim().min(1).max(100),text:z.string().trim().min(1).max(1000)}),
  z.object({action:z.literal('delete'),districtId:z.string().min(1).max(100),requestId:z.string().trim().min(1).max(100),entryId:z.string().min(1).max(100)}),
]);
export async function POST(request:Request){try{
  const input=schema.parse(await readJson(request));
  const result=await withSession(request,async session=>{const data=updateWorldJournal(session.profile,input);session.profile=data.profile;return data;});
  return sessionResponse(result.data,result.session);
}catch(error){return errorResponse(error);}}
