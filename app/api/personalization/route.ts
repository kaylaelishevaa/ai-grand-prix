import {personalizationInputSchema} from '@/lib/personalization';
import {handlePersonalization} from '@/lib/server/personalization';
import {withSession,sessionResponse} from '@/lib/server/store';
import {readJson} from '@/lib/server/http';
import {errorResponse} from '@/lib/server/errors';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
  try{
    const input=personalizationInputSchema.parse(await readJson(request));
    const result=await withSession(request,async session=>{const data=handlePersonalization(session.profile,input);session.profile=data.profile;return data;});
    return sessionResponse(result.data,result.session);
  }catch(error){return errorResponse(error);}
}
