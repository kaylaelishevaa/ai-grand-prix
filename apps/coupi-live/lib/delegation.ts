import {getSku} from './catalog';
import {addDecision,ownsSku,ownedMessage} from './guardrails';
import {negotiationFloor} from './delegation-policy';
import type {Decision,Profile,DecisionDelegation} from './types';

export interface DelegationInput {skuId:string;budgetCap:number;watchPrice:boolean;haggle:boolean;bundle:boolean;scheduleDelivery:boolean;source?:string;}
export interface DelegationResponse {profile:Profile;decision?:Decision;blocked?:string;}

function makePlan(profile:Profile,decision:Decision,input:DelegationInput,now:Date):DecisionDelegation {
  const sku=getSku(decision.skuId)!;
  const floorPrice=negotiationFloor(sku.price), quotedPrice=input.haggle?floorPrice:sku.price;
  return {
    budgetCap:input.budgetCap,watchPrice:input.watchPrice,haggle:input.haggle,bundle:input.bundle,scheduleDelivery:input.scheduleDelivery,
    status:quotedPrice>input.budgetCap?'watching':quotedPrice<sku.price?'haggled':'ready',
    quotedPrice,discount:sku.price-quotedPrice,floorPrice,
    bundledDecisionIds:input.bundle?profile.decisions.filter(item=>{const other=getSku(item.skuId);return !!other&&item.id!==decision.id&&!item.approvedAt&&!ownsSku(profile,item.skuId)&&!other.sensitive&&!profile.quarantine.some(category=>category.sensitive&&category.category===other.category);}).map(item=>item.id):[],
    deliveryPlan:input.scheduleDelivery?`Planned after your approval: ${sku.delivery}. Delivery is simulated; no carrier booking.`:null,
    checkedAt:now.toISOString(),simulation:true,
  };
}

/** A budget creates permission to prepare a proposal, never permission to buy. */
export function assignDelegation(profile:Profile,input:DelegationInput,now=new Date()):DelegationResponse {
  const sku=getSku(input.skuId);
  if(!sku)return{profile,blocked:'That item is not in the catalog.'};
  if(ownsSku(profile,sku.id))return{profile,blocked:ownedMessage(profile,sku.id,now)};
  if(!Number.isInteger(input.budgetCap)||input.budgetCap<0||input.budgetCap>5000000)return{profile,blocked:'Choose a valid per-item budget cap.'};
  const quote=input.haggle?negotiationFloor(sku.price):sku.price;
  if(quote>input.budgetCap&&!input.watchPrice)return{profile,blocked:'The available quote exceeds your cap. Raise it or enable price watching.'};
  const added=addDecision(profile,sku.id,input.source||'delegated to Coopy',now);
  if(added.blocked||!added.decision)return added;
  const next=structuredClone(added.profile),decision=next.decisions.find(item=>item.id===added.decision!.id)!;
  decision.delegation=makePlan(next,decision,input,now);
  next.revision++;next.updatedAt=now.toISOString();
  return{profile:next,decision};
}

/** Rechecks the fixed local catalog. No background feed or seller connection is implied. */
export function refreshDelegation(profile:Profile,id:string,now=new Date()):DelegationResponse {
  const previous=profile.decisions.find(item=>item.id===id);
  if(!previous?.delegation)return{profile,blocked:'That delegated item no longer exists.'};
  if(previous.approvedAt)return{profile,blocked:'This item was already approved.'};
  if(ownsSku(profile,previous.skuId))return{profile,blocked:ownedMessage(profile,previous.skuId,now)};
  return assignDelegation(profile,{skuId:previous.skuId,...previous.delegation,source:previous.source},now);
}
