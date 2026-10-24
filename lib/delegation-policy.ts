import {getSku} from './catalog';
import type {Decision} from './types';

/** A local rehearsal policy, not a claim about any merchant's willingness to discount. */
export function negotiationFloor(price:number):number {
  return Math.max(price-4000, Math.ceil(price*0.85/100)*100);
}

export function decisionApprovalIssue(decision:Decision):string|null {
  const sku=getSku(decision.skuId), plan=decision.delegation;
  if(!sku)return 'That item is no longer in the catalog.';
  if(!plan)return null;
  if(plan.simulation!==true)return 'This local app cannot execute a merchant order.';
  if(!Number.isInteger(plan.budgetCap)||plan.budgetCap<0)return 'The delegation budget is invalid.';
  const expectedFloor=negotiationFloor(sku.price);
  if(plan.floorPrice!==expectedFloor||!Number.isInteger(plan.quotedPrice)||plan.quotedPrice<expectedFloor||plan.quotedPrice>sku.price||plan.discount!==sku.price-plan.quotedPrice||(!plan.haggle&&plan.discount!==0))return 'The quote failed its code-enforced price floor. Reassign this item.';
  if(plan.status==='watching'||plan.quotedPrice>plan.budgetCap)return 'Still watching — the available quote is above your cap.';
  if(!['ready','haggled'].includes(plan.status))return 'This delegation is not ready for approval.';
  return null;
}

export function decisionPrice(decision:Decision):number {
  return decision.delegation?.quotedPrice??getSku(decision.skuId)?.price??0;
}
