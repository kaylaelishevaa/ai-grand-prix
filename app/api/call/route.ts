import {z} from 'zod';
import {handleCall} from '@/lib/server/call';
import {withSession,sessionResponse} from '@/lib/server/store';
import {readJson,requireLocalOrigin} from '@/lib/server/http';
import {errorResponse,AppError} from '@/lib/server/errors';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const inputSchema=z.object({action:z.enum(['hatch','start','message','resumeInterview','finishInterview']),requestId:z.string().trim().min(1).max(100),message:z.string().trim().max(3000).optional(),personalizationDraftId:z.string().trim().min(1).max(100).optional()});

export async function POST(request:Request) {
  try {
    let raw:unknown;
    let image:{buffer:Buffer;mime:string}|undefined;
    if(request.headers.get('content-type')?.includes('multipart/form-data')) {
      requireLocalOrigin(request);
      if(Number(request.headers.get('content-length')||0)>8_500_000)throw new AppError('PHOTO_TOO_LARGE','Keep photos under 8 MB.',413);
      const form=await request.formData(),file=form.get('file');
      raw={action:form.get('action'),requestId:form.get('requestId'),message:form.get('message')||undefined,personalizationDraftId:form.get('personalizationDraftId')||undefined};
      if(file instanceof File&&file.size>0) {
        if(file.size>8_000_000)throw new AppError('PHOTO_TOO_LARGE','Keep photos under 8 MB.',413);
        image={buffer:Buffer.from(await file.arrayBuffer()),mime:file.type};
      }
    } else raw=await readJson(request);
    const input=inputSchema.parse(raw);
    const result=await withSession(request,async session=>{
      const data=await handleCall(session.profile,{...input,image});
      session.profile=data.profile;
      return data;
    });
    return sessionResponse(result.data,result.session);
  } catch(error) {return errorResponse(error);}
}
