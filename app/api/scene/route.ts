import {z} from 'zod';
import {generateScene} from '@/lib/server/services';
import {withSession,sessionResponse} from '@/lib/server/store';
import {readJson} from '@/lib/server/http';
import {errorResponse} from '@/lib/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){try{const body=z.object({command:z.string().max(1200).default(''),requestId:z.string().min(1).max(100).optional()}).parse(await readJson(request));const result=await withSession(request,async session=>{const data=await generateScene(session.profile,body.command,body.requestId);session.profile=data.profile;return data;});return sessionResponse(result.data,result.session);}catch(error){return errorResponse(error);}}
