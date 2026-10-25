import {z} from 'zod';
import {withAccountSession,accountResponse,householdSpentThisMonth} from '@/lib/server/account-store';
import {readJson} from '@/lib/server/http';
import {errorResponse} from '@/lib/server/errors';
import {actOnCommerce,commerceState} from '@/lib/server/commerce';
export const runtime='nodejs';export const dynamic='force-dynamic';
const id=z.string().min(1).max(140),requestId=z.string().min(1).max(100);
const checkout={decisionIds:z.array(id).min(1).max(30),addressId:id,paymentMethodId:id,deliveryKind:z.enum(['rocket','dawn','standard']),deliveryInstruction:z.string().max(240)};
const evidence=z.discriminatedUnion('kind',[z.object({kind:z.literal('none')}).strict(),z.object({kind:z.literal('prepared'),sampleId:z.enum(['damaged-item','intact-item'])}).strict(),z.object({kind:z.literal('upload'),fileName:z.string().min(1).max(160),mimeType:z.enum(['image/jpeg','image/png','image/webp','image/heic']),sizeBytes:z.number().int().min(1).max(10000000)}).strict()]);
const returnInput={orderId:id,lineId:id,reason:z.enum(['damaged','wrong_item','not_as_expected','changed_mind','other']),evidence};
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('quote'),...checkout}).strict(),z.object({action:z.literal('checkout'),...checkout,quoteId:id,requestId}).strict(),
 z.object({action:z.literal('advanceTracking'),orderId:id,requestId}).strict(),z.object({action:z.literal('simulateDelay'),orderId:id,requestId}).strict(),z.object({action:z.literal('approveCompensation'),orderId:id,requestId}).strict(),
 z.object({action:z.literal('returnDecision'),...returnInput}).strict(),z.object({action:z.literal('submitReturn'),...returnInput,assessmentId:id,requestId}).strict(),
 z.object({action:z.literal('completePickup'),returnId:id,requestId}).strict(),z.object({action:z.literal('humanReview'),returnId:id,requestId}).strict(),
]);
export async function GET(request:Request){try{const result=await withAccountSession(request,async(session,account)=>({profile:session.profile,commerce:commerceState(session.profile),account}));return accountResponse(result.data,result);}catch(error){return errorResponse(error);}}
export async function POST(request:Request){try{
 const body=schema.parse(await readJson(request));
 const result=await withAccountSession(request,async(session,account)=>{
   const now=new Date(),spent=body.action==='checkout'||body.action==='quote'?await householdSpentThisMonth(account,now,session.profile):0;
   const data=actOnCommerce(session.profile,account,body,now,spent);session.profile=data.profile;
   return{...data,commerce:commerceState(data.profile),account};
 });return accountResponse(result.data,result);
}catch(error){return errorResponse(error);}}
