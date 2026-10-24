import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {getSku} from '@/lib/catalog';
import {accountResponse,loadMemberProfile,permissionCategories,withAccountSession} from '@/lib/server/account-store';
import {readJson} from '@/lib/server/http';
import {AppError,errorResponse} from '@/lib/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('settings'),householdBudget:z.number().int().min(10000).max(5000000).optional(),wowMember:z.boolean().optional(),defaultAddressId:z.string().max(80).optional(),defaultPaymentId:z.string().max(80).optional(),dailyLimit:z.number().int().min(0).max(10).optional(),quietHours:z.boolean().optional()}).strict(),
  z.object({action:z.literal('permission'),category:z.string().min(1).max(80),enabled:z.boolean(),cap:z.number().int().min(0).max(5000000)}).strict(),
  z.object({action:z.literal('switch'),profileId:z.string().uuid()}).strict(),
]);
export async function GET(request:Request){try{const result=await withAccountSession(request,async(session,account)=>({account,profile:session.profile,currentMemberId:session.id}));return accountResponse(result.data,result);}catch(error){return errorResponse(error);}}
export async function POST(request:Request){try{
  const input=schema.parse(await readJson(request));
  const result=await withAccountSession(request,async(session,account)=>{
    if(input.action==='switch'){
      if(!account.members.some(member=>member.profileId===input.profileId))throw new AppError('UNKNOWN_MEMBER','Choose a member of this demo household.',403);
      return {account,profile:await loadMemberProfile(input.profileId),currentMemberId:input.profileId,switched:true};
    }
    if(input.action==='settings'){
      if(input.defaultAddressId&&!account.addresses.some(item=>item.id===input.defaultAddressId))throw new AppError('UNKNOWN_ADDRESS','Choose a saved sample address.');
      if(input.defaultPaymentId&&!account.payments.some(item=>item.id===input.defaultPaymentId))throw new AppError('UNKNOWN_PAYMENT','Choose a saved mock payment method.');
      if(input.householdBudget!==undefined)account.householdBudget=input.householdBudget;
      if(input.wowMember!==undefined)account.wowMember=input.wowMember;
      if(input.defaultAddressId)account.defaultAddressId=input.defaultAddressId;
      if(input.defaultPaymentId)account.defaultPaymentId=input.defaultPaymentId;
      if(input.dailyLimit!==undefined)account.notifications.dailyLimit=input.dailyLimit;
      if(input.quietHours!==undefined)account.notifications.quietHours=input.quietHours;
    }else{
      if(!permissionCategories.includes(input.category)||session.profile.quarantine.some(item=>item.sensitive&&item.category===input.category))throw new AppError('CATEGORY_NOT_ALLOWED','That category cannot be delegated.');
      const previous=account.licenses[session.id]?.[input.category];account.licenses[session.id]??={};account.licenses[session.id][input.category]={enabled:input.enabled,cap:input.cap};
      account.permissionLog.push({id:randomUUID(),profileId:session.id,at:new Date().toISOString(),category:input.category,action:!input.enabled?'revoked':!previous?.enabled?'enabled':'cap changed',cap:input.cap});account.permissionLog=account.permissionLog.slice(-200);
      // Revoking a license stops jobs, while the user's proposal/history stays available for manual review.
      session.profile={...session.profile,decisions:session.profile.decisions.map(item=>!item.approvedAt&&item.delegation&&getSku(item.skuId)?.category===input.category&&(!input.enabled||item.delegation.budgetCap>input.cap)?{...item,delegation:undefined}:item),revision:session.profile.revision+1,updatedAt:new Date().toISOString()};
    }
    account.updatedAt=new Date().toISOString();return {account,profile:session.profile,currentMemberId:session.id,switched:false};
  });return accountResponse(result.data,result,input.action==='switch'?input.profileId:undefined);
}catch(error){return errorResponse(error);}}
