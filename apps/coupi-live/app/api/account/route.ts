import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {getSku} from '@/lib/catalog';
import {accountResponse,loadMemberProfile,permissionCategories,withAccountSession} from '@/lib/server/account-store';
import {readJson} from '@/lib/server/http';
import {AppError,errorResponse} from '@/lib/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
const detailId=z.string().min(1).max(80).regex(/^[a-zA-Z0-9-]+$/);
const shortText=(max:number)=>z.string().trim().min(1).max(max).regex(/^[^\u0000-\u001f\u007f]+$/,'Use plain text without control characters.');
const paymentLabel=shortText(48).refine(value=>!/(?:\d[ -]?){12,}/.test(value),'Use a nickname only, not payment credentials.');
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('settings'),householdBudget:z.number().int().min(10000).max(5000000).optional(),wowMember:z.boolean().optional(),defaultAddressId:z.string().max(80).optional(),defaultPaymentId:z.string().max(80).optional(),dailyLimit:z.number().int().min(0).max(10).optional(),quietHours:z.boolean().optional()}).strict(),
  z.object({action:z.literal('permission'),category:z.string().min(1).max(80),enabled:z.boolean(),cap:z.number().int().min(0).max(5000000)}).strict(),
  z.object({action:z.literal('switch'),profileId:z.string().uuid()}).strict(),
  z.object({action:z.literal('saveAddress'),id:detailId,label:shortText(48),line:shortText(180),postcode:shortText(20),area:shortText(100),deliveryInstruction:z.string().trim().max(240),dawnEligible:z.boolean(),makeDefault:z.boolean()}).strict(),
  z.object({action:z.literal('deleteAddress'),id:detailId}).strict(),
  z.object({action:z.literal('savePayment'),id:detailId,label:paymentLabel,kind:z.enum(['wallet','card']),makeDefault:z.boolean()}).strict(),
  z.object({action:z.literal('deletePayment'),id:detailId}).strict(),
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
    }else if(input.action==='saveAddress'){
      const index=account.addresses.findIndex(item=>item.id===input.id);
      if(index<0&&!z.string().uuid().safeParse(input.id).success)throw new AppError('UNKNOWN_ADDRESS','Choose a saved address or create a new one.');
      if(index<0&&account.addresses.length>=8)throw new AppError('ADDRESS_LIMIT','Keep up to eight sample addresses. Remove one before adding another.');
      const address={id:input.id,label:input.label,line:input.line,postcode:input.postcode,area:input.area,deliveryInstruction:input.deliveryInstruction||'leave at the front door',dawnEligible:input.dawnEligible,sample:true as const};
      if(index<0)account.addresses.push(address);else account.addresses[index]=address;
      if(input.makeDefault)account.defaultAddressId=input.id;
    }else if(input.action==='deleteAddress'){
      if(!account.addresses.some(item=>item.id===input.id))throw new AppError('UNKNOWN_ADDRESS','That address is no longer saved.');
      if(account.addresses.length<=1)throw new AppError('LAST_ADDRESS','Keep one sample address for checkout. You can edit it instead.');
      account.addresses=account.addresses.filter(item=>item.id!==input.id);
      if(account.defaultAddressId===input.id)account.defaultAddressId=account.addresses[0].id;
    }else if(input.action==='savePayment'){
      const index=account.payments.findIndex(item=>item.id===input.id);
      if(index<0&&!z.string().uuid().safeParse(input.id).success)throw new AppError('UNKNOWN_PAYMENT','Choose a saved mock method or create a new one.');
      if(index<0&&account.payments.length>=6)throw new AppError('PAYMENT_LIMIT','Keep up to six mock payment methods. Remove one before adding another.');
      // There is no real payment-token or card-number input. These digits are fictional.
      const payment={id:input.id,label:input.label,kind:input.kind,last4:input.kind==='wallet'?'0007':'4242',sample:true as const};
      if(index<0)account.payments.push(payment);else account.payments[index]=payment;
      if(input.makeDefault)account.defaultPaymentId=input.id;
    }else if(input.action==='deletePayment'){
      if(!account.payments.some(item=>item.id===input.id))throw new AppError('UNKNOWN_PAYMENT','That mock method is no longer saved.');
      if(account.payments.length<=1)throw new AppError('LAST_PAYMENT','Keep one mock payment method for checkout. You can rename it instead.');
      account.payments=account.payments.filter(item=>item.id!==input.id);
      if(account.defaultPaymentId===input.id)account.defaultPaymentId=account.payments[0].id;
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
