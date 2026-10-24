import {randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {Profile} from '../types';
import {createProfile} from '../profile';
import {AppError} from './errors';
const root=()=>process.env.COUPI_DATA_DIR||path.join(process.cwd(),'.data','profiles');
const queues=new Map<string,Promise<unknown>>();
export interface ProfileSession {id:string;profile:Profile;fresh:boolean;}
function profileId(request:Request){
 const cookie=request.headers.get('cookie')||'';
 const match=cookie.match(/(?:^|;\s*)coupi_profile=([a-f0-9-]{36})(?:;|$)/);
 return match?.[1]||randomUUID();
}
export async function loadSession(request:Request):Promise<ProfileSession>{
 const id=profileId(request);
 try{const profile=JSON.parse(await readFile(path.join(root(),id+'.json'),'utf8')) as Profile;
  if(profile.id!==id||profile.version!==1||!Array.isArray(profile.memoryLines))throw new Error('InvalidProfile');
  return{id,profile,fresh:false};
 }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new AppError('PROFILE_READ_FAILED','Your saved profile could not be read. The server has not replaced it.',500);return{id,profile:createProfile(id),fresh:true};}
}
export async function saveProfile(profile:Profile){
 await mkdir(root(),{recursive:true});
 const destination=path.join(root(),profile.id+'.json'),temp=destination+'.'+randomUUID()+'.tmp';
 await writeFile(temp,JSON.stringify(profile,null,2),{mode:0o600});await rename(temp,destination);
}
export async function withSession<T>(request:Request,task:(session:ProfileSession)=>Promise<T>):Promise<{data:T;session:ProfileSession}>{
 const initial=await loadSession(request), previous=queues.get(initial.id)||Promise.resolve();
 let release!:()=>void;const lock=new Promise<void>(resolve=>release=resolve);const tail=previous.catch(()=>{}).then(()=>lock);queues.set(initial.id,tail);
 await previous.catch(()=>{});
 try{
  let session=initial;
  try{const latest=JSON.parse(await readFile(path.join(root(),initial.id+'.json'),'utf8')) as Profile;if(latest.id!==initial.id||latest.version!==1)throw new Error('InvalidProfile');session={id:initial.id,profile:latest,fresh:false};}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new AppError('PROFILE_READ_FAILED','The saved profile could not be read.',500);}
  const data=await task(session);await saveProfile(session.profile);return{data,session};
 }finally{release();if(queues.get(initial.id)===tail)queues.delete(initial.id);}
}
export function sessionResponse(data:unknown,session:ProfileSession,status=200){
 return Response.json(data,{status,headers:{'Cache-Control':'no-store','Set-Cookie':`coupi_profile=${session.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`}});
}
