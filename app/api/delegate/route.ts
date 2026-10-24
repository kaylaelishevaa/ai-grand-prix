import {z} from 'zod';
import {assignDelegation,refreshDelegation} from '@/lib/delegation';
import {withAccountSession,accountResponse,categoryLicense} from '@/lib/server/account-store';
import {getSku} from '@/lib/catalog';
import {readJson} from '@/lib/server/http';
import {errorResponse,AppError} from '@/lib/server/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('assign'),skuId:z.string().min(1).max(100),budgetCap:z.number().int().min(0).max(5000000),watchPrice:z.boolean(),haggle:z.boolean(),bundle:z.boolean(),scheduleDelivery:z.boolean(),source:z.string().max(100).optional()}),
  z.object({action:z.literal('refresh'),id:z.string().min(1).max(150)}),
]);
export async function POST(request:Request){try{
  const body=schema.parse(await readJson(request));
  const result=await withAccountSession(request,async(session,account)=>{
    const existing=body.action==='refresh'?session.profile.decisions.find(item=>item.id===body.id):undefined;
    const sku=getSku(body.action==='assign'?body.skuId:existing?.skuId||'');
    if(sku){const license=categoryLicense(account,session.id,sku.category),cap=body.action==='assign'?body.budgetCap:existing?.delegation?.budgetCap;
      if(!license.enabled)throw new AppError('LICENSE_REVOKED','Preparation for this category is paused. You can change it in Permissions.',403);
      if(cap!==undefined&&cap>license.cap)throw new AppError('LICENSE_CAP','This plan exceeds your category preparation cap. Lower the plan cap or update Permissions.',409);
    }
    const data=body.action==='assign'?assignDelegation(session.profile,body):refreshDelegation(session.profile,body.id);
    session.profile=data.profile;return data;
  });return accountResponse(result.data,result);
}catch(error){return errorResponse(error);}}
