import {z} from 'zod';
import {scanPhoto} from '@/lib/server/services';
import {withSession,sessionResponse} from '@/lib/server/store';
import {requireLocalOrigin} from '@/lib/server/http';
import {errorResponse,AppError} from '@/lib/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 requireLocalOrigin(request);if(Number(request.headers.get('content-length')||0)>8_500_000)throw new AppError('PHOTO_TOO_LARGE','Keep photos under 8 MB.',413);
 const form=await request.formData(),file=form.get('file');if(!(file instanceof File)||file.size===0)throw new AppError('PHOTO_REQUIRED','Choose or take a photo first.');if(file.size>8_000_000)throw new AppError('PHOTO_TOO_LARGE','Keep photos under 8 MB.',413);
 let expected:unknown=[];try{expected=JSON.parse(String(form.get('expectedStaples')||'[]'));}catch{throw new AppError('INVALID_STAPLES','Expected staples should be a list of food names.');}
 const staples=z.array(z.string().max(80)).max(15).parse(expected),buffer=Buffer.from(await file.arrayBuffer());
 const result=await withSession(request,async session=>{const data=await scanPhoto(session.profile,buffer,file.type,staples);session.profile=data.profile;return data;});return sessionResponse(result.data,result.session);
 }catch(error){return errorResponse(error);}}
