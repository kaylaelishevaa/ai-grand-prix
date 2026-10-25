import {randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createProfile} from '../profile';
import type {AccountState} from '../account-types';
import {assertAccountMember,permissionCategories} from '../account';
export {categoryLicense,accountForCheckout,permissionCategories} from '../account';
import type {Profile} from '../types';
import {loadSession,saveProfile,withSession,sessionResponse,type ProfileSession} from './store';
import {AppError} from './errors';
import {commerceSpentThisMonth} from './commerce';

const root=()=>process.env.COUPI_ACCOUNT_DIR||(process.env.COUPI_DATA_DIR?path.join(process.env.COUPI_DATA_DIR,'households'):path.join(process.cwd(),'.data','accounts'));
const queues=new Map<string,Promise<unknown>>();
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const initialLicenses=(cap:number)=>Object.fromEntries(permissionCategories.map(category=>[category,{enabled:true,cap}]));

export async function loadMemberProfile(profileId:string):Promise<Profile> {
  if(!uuid.test(profileId))throw new AppError('INVALID_MEMBER','This member could not be found.',404);
  const session=await loadSession(new Request('http://localhost/api/account',{headers:{cookie:`coupi_profile=${profileId}`}}));
  if(session.fresh)throw new AppError('MEMBER_PROFILE_MISSING','This member’s saved profile is unavailable; it has not been replaced.',409);
  return session.profile;
}
/** Call inside withAccountSession: member details never escape this aggregate. */
export async function householdSpentThisMonth(account:AccountState,now=new Date(),currentProfile?:Profile):Promise<number>{
  if(currentProfile)assertAccountMember(account,currentProfile.id);
  let total=0;
  for(const member of account.members){const profile=currentProfile?.id===member.profileId?currentProfile:await loadMemberProfile(member.profileId);total+=commerceSpentThisMonth(profile,now);}
  return total;
}
async function saveAccount(account:AccountState){
  await mkdir(root(),{recursive:true});const destination=path.join(root(),account.id+'.json'),temp=destination+'.'+randomUUID()+'.tmp';
  await writeFile(temp,JSON.stringify(account,null,2),{mode:0o600});await rename(temp,destination);
  await mkdir(path.join(root(),'by-profile'),{recursive:true});
  for(const member of account.members){const index=path.join(root(),'by-profile',member.profileId+'.json'),scratch=index+'.'+randomUUID()+'.tmp';await writeFile(scratch,JSON.stringify({accountId:account.id}),{mode:0o600});await rename(scratch,index);}
}
async function newAccount(session:ProfileSession,id:string):Promise<AccountState>{
  const second=createProfile(randomUUID());second.owned=[];await saveProfile(second);
  return {id,version:1,members:[{profileId:session.id,label:'You'},{profileId:second.id,label:'Another household member'}],
    addresses:[{id:'sample-home',label:'Sample home',line:'Demo building · 12 Sample Street',postcode:'00000',area:'Seoul demo zone',dawnEligible:true,deliveryInstruction:'leave at the front door',sample:true},{id:'sample-studio',label:'Sample studio',line:'Imaginary studio · 8 Example Lane',postcode:'00000',area:'Outside the dawn demo zone',dawnEligible:false,deliveryInstruction:'leave at the studio door',sample:true}],
    payments:[{id:'coopy-pay',label:'CoopyPay · mock wallet',last4:'0007',kind:'wallet',sample:true},{id:'demo-card',label:'Demo card',last4:'4242',kind:'card',sample:true}],defaultAddressId:'sample-home',defaultPaymentId:'coopy-pay',wowMember:false,householdBudget:150000,
    notifications:{dailyLimit:2,quietHours:true},licenses:{[session.id]:initialLicenses(session.profile.budget),[second.id]:initialLicenses(second.budget)},permissionLog:[],updatedAt:new Date().toISOString()};
}

/** Consistent profile→household lock order; checkout and setting updates use this same boundary. */
export async function withAccountSession<T>(request:Request,task:(session:ProfileSession,account:AccountState)=>Promise<T>):Promise<{data:T;session:ProfileSession;account:AccountState}> {
  let outputAccount:AccountState|undefined;
  const result=await withSession(request,async session=>{
    const match=(request.headers.get('cookie')||'').match(/(?:^|;\s*)coupi_household=([a-f0-9-]{36})(?:;|$)/i);
    let id=match?.[1];
    if(!id){try{id=JSON.parse(await readFile(path.join(root(),'by-profile',session.id+'.json'),'utf8')).accountId;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new AppError('ACCOUNT_READ_FAILED','Your household lookup could not be read.',500);}}
    id??=randomUUID();
    if(!uuid.test(id))throw new AppError('INVALID_ACCOUNT','The demo household identifier is invalid.',400);
    const previous=queues.get(id)||Promise.resolve();let release!:()=>void;const lock=new Promise<void>(resolve=>release=resolve),tail=previous.catch(()=>{}).then(()=>lock);queues.set(id,tail);await previous.catch(()=>{});
    try{
      let account:AccountState;
      try{account=JSON.parse(await readFile(path.join(root(),id+'.json'),'utf8'));if(account.id!==id||account.version!==1||!Array.isArray(account.members)||!account.licenses)throw new Error('Invalid account');}
      catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new AppError('ACCOUNT_READ_FAILED','Your saved household could not be read. It has not been replaced.',500);if(match)throw new AppError('ACCOUNT_NOT_FOUND','This demo household no longer exists.',404);account=await newAccount(session,id);}
      assertAccountMember(account,session.id);const data=await task(session,account);
      // Publish the member's checkout before releasing the shared household budget lock.
      await saveProfile(session.profile);await saveAccount(account);outputAccount=account;return data;
    }finally{release();if(queues.get(id)===tail)queues.delete(id);}
  });
  return {...result,account:outputAccount!};
}
export function accountResponse(data:unknown,result:{session:ProfileSession;account:AccountState},switchTo?:string){
  if(switchTo)assertAccountMember(result.account,switchTo);
  const response=sessionResponse(data,switchTo?{...result.session,id:switchTo}:result.session);
  response.headers.append('Set-Cookie',`coupi_household=${result.account.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`);
  return response;
}
