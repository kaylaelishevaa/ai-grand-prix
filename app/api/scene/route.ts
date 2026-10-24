import {z} from 'zod';
import {generateScene} from '@/lib/server/services';
import {withSession,sessionResponse} from '@/lib/server/store';
import {readJson} from '@/lib/server/http';
import {errorResponse} from '@/lib/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){try{const body=z.object({command:z.string().max(1200).default('')}).parse(await readJson(request));const result=await withSession(request,async session=>generateScene(session.profile,body.command));return sessionResponse(result.data,result.session);}catch(error){return errorResponse(error);}}
