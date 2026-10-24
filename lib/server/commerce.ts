import type {AccountState} from '../account-types';
import {accountForCheckout,categoryLicense} from '../account';
import {getSku} from '../catalog';
import {approveDecisions,fromLocalClock,isDecisionLocked,localClock,ownsSku} from '../guardrails';
import {decisionApprovalIssue,decisionPrice} from '../delegation-policy';
import type {Profile} from '../types';
import type {CheckoutInput,CheckoutQuote,CommerceAction,CommerceOrder,CommerceReturn,CommerceState,DeliveryKind,DeliveryOption,OrderLine,RefundEntry,ReturnAssessment,ReturnInput,TrackingStep} from '../commerce-types';
import {AppError} from './errors';
import {requestHash} from './cache';

export function commerceState(profile:Profile):CommerceState{return profile.commerce||{version:1,orders:[],returns:[],refunds:[],receipts:[]};}
const stamp=(now:Date)=>now.toISOString();
const idFor=(prefix:string,value:unknown)=>prefix+'-'+requestHash(value).slice(0,20);
const month=(value:string,profile:Profile)=>{const time=localClock(new Date(value),profile.timezone);return `${time.year}-${time.month}`;};
/** Local simulated monthly expenditure, including old approvals without an order snapshot. */
export function commerceSpentThisMonth(profile:Profile,now=new Date()):number {
  const state=commerceState(profile),period=month(stamp(now),profile),ordered=new Set(state.orders.flatMap(order=>order.lines.map(line=>line.decisionId)));
  const orders=state.orders.filter(order=>month(order.createdAt,profile)===period).reduce((sum,order)=>sum+order.total,0);
  const legacy=profile.decisions.filter(decision=>decision.approvedAt&&!ordered.has(decision.id)&&month(decision.approvedAt,profile)===period).reduce((sum,decision)=>sum+decisionPrice(decision),0);
  const refunds=state.refunds.filter(refund=>refund.type==='return'&&month(refund.createdAt,profile)===period).reduce((sum,refund)=>sum+refund.amount,0);
  return Math.max(0,orders+legacy-refunds);
}
function tomorrow(profile:Profile,now:Date,hour:number){const local=localClock(now,profile.timezone),next=new Date(Date.UTC(local.year,local.month-1,local.day+1));return fromLocalClock({...local,year:next.getUTCFullYear(),month:next.getUTCMonth()+1,day:next.getUTCDate(),hour,minute:0,second:0},profile.timezone).toISOString();}
function deliveryOptions(profile:Profile,account:AccountState,lines:OrderLine[],addressId:string,now:Date):DeliveryOption[]{
  const settings=accountForCheckout(account,profile.id),address=settings.addresses.find(item=>item.id===addressId)!;
  const rocket=lines.every(line=>/^Rocket delivery/i.test(line.deliveryFact)&&/tomorrow/i.test(line.deliveryFact));
  const dawn=rocket&&lines.every(line=>/7\s*am/i.test(line.deliveryFact))&&settings.wowMember&&address.dawnEligible;
  return[
    {kind:'rocket',label:'Rocket: tomorrow',promisedAt:rocket?tomorrow(profile,now,23):null,basis:'Prepared catalog Rocket eligibility. A local delivery simulation, not a carrier booking.',available:rocket,unavailableReason:rocket?null:'One or more selected products have a standard delivery fact.',simulation:true},
    {kind:'dawn',label:'Dawn: before 7 AM if ordered by midnight',promisedAt:dawn?tomorrow(profile,now,7):null,basis:'WOW-style membership, a dawn-eligible sample address and every selected item’s explicit 7am catalog fact are required. Midnight uses your profile time zone.',available:dawn,unavailableReason:dawn?null:!settings.wowMember?'Turn on simulated WOW membership in Account.':!address.dawnEligible?'This sample address is outside the simulated dawn area.':'Every selected product must explicitly support tomorrow by 7am.',simulation:true},
    {kind:'standard',label:rocket?'Standard: catalog delivery promise':'Standard: check each item’s listed delivery',promisedAt:null,basis:lines.map(line=>line.name+': '+line.deliveryFact).join(' · '),available:true,unavailableReason:null,simulation:true},
  ];
}
export function quoteCheckout(profile:Profile,account:AccountState,input:CheckoutInput,now=new Date(),householdSpent=commerceSpentThisMonth(profile,now)):CheckoutQuote {
  const settings=accountForCheckout(account,profile.id),unique=new Set(input.decisionIds);
  if(![profile.budget,settings.householdBudget,householdSpent].every(value=>Number.isFinite(value)&&value>=0))throw new AppError('CHECKOUT_BUDGET','The current budget could not be validated. Review Account before approving.',409);
  if(!unique.size||unique.size!==input.decisionIds.length||unique.size>30)throw new AppError('CHECKOUT_SELECTION','Choose one or more unique pending decisions.',400);
  const address=settings.addresses.find(item=>item.id===input.addressId),payment=settings.payments.find(item=>item.id===input.paymentMethodId);
  if(!address||!payment||address.sample!==true||payment.sample!==true)throw new AppError('CHECKOUT_ACCOUNT','Choose a saved sample address and mock payment method.',409);
  const lines:OrderLine[]=[...unique].sort().map(id=>{
    const decision=profile.decisions.find(item=>item.id===id);
    if(!decision||decision.approvedAt)throw new AppError('CHECKOUT_DECISION','That decision is missing or already approved.',409);
    if(isDecisionLocked(profile,decision,now))throw new AppError('SLEEP_ON_IT','Held until 7:00 AM. Your morning self gets a vote.',409);
    const sku=getSku(decision.skuId);
    if(!sku||sku.sensitive||profile.quarantine.some(item=>item.sensitive&&item.category===sku.category))throw new AppError('CHECKOUT_EXCLUDED','An item is unavailable or quarantined.',409);
    if(ownsSku(profile,sku.id))throw new AppError('ALREADY_OWNED','You already have this item. Coopy will not buy it again.',409);
    const issue=decisionApprovalIssue(decision);if(issue)throw new AppError('CHECKOUT_DELEGATION',issue,409);
    const price=decisionPrice(decision);
    if(decision.delegation){const license=categoryLicense(account,profile.id,sku.category);if(!license.enabled||price>license.cap)throw new AppError('CHECKOUT_LICENSE','This delegation exceeds your current category permission or cap. Update it in Account.',409);}
    if(!Number.isInteger(price)||price<0||price>sku.price)throw new AppError('CHECKOUT_PRICE','The saved quote has an invalid price.',409);
    return{id:decision.id,decisionId:decision.id,skuId:sku.id,name:sku.name,category:sku.category,quantity:1,catalogPrice:sku.price,unitPrice:price,discount:sku.price-price,total:price,deliveryFact:sku.delivery};
  });
  if(new Set(lines.map(line=>line.skuId)).size!==lines.length)throw new AppError('CHECKOUT_DUPLICATE','The same product cannot be approved twice.',409);
  const subtotal=lines.reduce((sum,line)=>sum+line.catalogPrice,0),discount=lines.reduce((sum,line)=>sum+line.discount,0),total=subtotal-discount;
  const budgetRemaining=Math.max(0,Math.min(profile.budget-commerceSpentThisMonth(profile,now),settings.householdBudget-householdSpent));
  if(total>budgetRemaining)throw new AppError('CHECKOUT_BUDGET','This order exceeds the remaining monthly profile or household budget. Review it before approving.',409);
  const options=deliveryOptions(profile,account,lines,input.addressId,now),selected=options.find(option=>option.kind===input.deliveryKind);
  if(!selected?.available)throw new AppError('DELIVERY_NOT_ELIGIBLE',selected?.unavailableReason||'Choose a supported delivery promise.',409);
  const {available:_available,unavailableReason:_reason,...delivery}=selected;
  const quote={lines,subtotal,discount,shippingFee:0 as const,total,currency:'KRW' as const,budgetRemaining,address:structuredClone(address),payment:structuredClone(payment),delivery,deliveryOptions:options,deliveryInstruction:input.deliveryInstruction.trim().slice(0,240)||'leave at the front door',simulation:true as const};
  return{id:idFor('quote',quote),...quote};
}
function touch(profile:Profile,now:Date){profile.revision++;profile.updatedAt=stamp(now);return profile;}
function mutation(profile:Profile){const next=structuredClone(profile);next.commerce=structuredClone(commerceState(profile));return next as Profile&{commerce:CommerceState};}
function receipt(profile:Profile,action:CommerceAction&{requestId:string}){
  const found=commerceState(profile).receipts.find(item=>item.requestId===action.requestId);
  if(found&&(found.action!==action.action||found.hash!==requestHash(action)))throw new AppError('COMMERCE_REQUEST_CONFLICT','That confirmation ID was already used for a different action.',409);
  return found;
}
function record(profile:Profile&{commerce:CommerceState},action:CommerceAction&{requestId:string},resultId:string){profile.commerce.receipts.push({requestId:action.requestId,action:action.action,hash:requestHash(action),resultId});}
function requiredOrder(profile:Profile,id:string){const order=commerceState(profile).orders.find(item=>item.id===id);if(!order)throw new AppError('ORDER_NOT_FOUND','This order does not belong to the current profile.',404);return order;}
function requiredReturn(profile:Profile,id:string){const item=commerceState(profile).returns.find(item=>item.id===id);if(!item)throw new AppError('RETURN_NOT_FOUND','That return does not belong to the current profile.',404);return item;}
const steps:TrackingStep[]=['preparing','packed','hub','out_for_delivery','delivered'];
const trackingLabels:Record<TrackingStep,string>={preparing:'Preparing your simulated order',packed:'Packed at the simulated fulfilment centre',hub:'At the simulated local hub',out_for_delivery:'Out for delivery · simulation',delivered:'Delivered at your sample front door · simulation'};
function returnRefund(profile:Profile&{commerce:CommerceState},item:CommerceReturn,now:Date){
  const order=requiredOrder(profile,item.orderId),entry:RefundEntry={id:idFor('refund',item.id),type:'return',orderId:order.id,returnId:item.id,amount:item.refundAmount,currency:'KRW',paymentLabel:order.payment.label,createdAt:stamp(now),status:'recorded',simulation:true};
  if(!profile.commerce.refunds.some(row=>row.id===entry.id))profile.commerce.refunds.push(entry);
  item.refundId=entry.id;item.status='refund_recorded';return entry;
}
export function assessReturn(profile:Profile,input:ReturnInput,now=new Date()):ReturnAssessment {
  const order=requiredOrder(profile,input.orderId),line=order.lines.find(item=>item.id===input.lineId);
  if(order.stage!=='delivered'||!line)throw new AppError('RETURN_NOT_DELIVERED','Choose a delivered item from this profile’s order.',409);
  if(commerceState(profile).returns.some(item=>item.orderId===order.id&&item.lineId===line.id))throw new AppError('RETURN_ALREADY_EXISTS','A return or refund already exists for this item.',409);
  const preparedDamage=input.evidence.kind==='prepared'&&input.evidence.sampleId==='damaged-item';
  const uncertain=input.evidence.kind==='upload'||input.reason==='other'||(['damaged','wrong_item'].includes(input.reason)&&!preparedDamage);
  const outcome=uncertain?'human_review':input.reason==='damaged'&&preparedDamage&&line.unitPrice<=30000?'keep_refund':'pickup_refund';
  const assessment={orderId:order.id,lineId:line.id,skuId:line.skuId,itemName:line.name,outcome,explanation:outcome==='keep_refund'?'Prepared damaged-item example under ₩30,000: keep the item; a local simulated refund will be recorded after you confirm.':outcome==='pickup_refund'?'A simulated courier pickup is prepared for tomorrow at your door. No box needed; the local refund follows the simulated pickup.':'This needs a person. Uploaded photo contents have not been inspected; the concept never denies a return automatically.',refundAmount:line.total,evidenceStatus:input.evidence.kind==='prepared'?'prepared-simulation':input.evidence.kind==='upload'?'not-inspected':'none',pickup:outcome==='pickup_refund'?{label:'Tomorrow · pickup at your door',instruction:'Leave the item at the sample front door. No box needed. No real courier has been booked.',scheduledFor:tomorrow(profile,now,12)}:null,policyLabel:'POLICY CONCEPT — returns decided in seconds, never denied without human review. SIMULATION ONLY.',simulation:true as const} satisfies Omit<ReturnAssessment,'id'>;
  return{id:idFor('return-plan',{...assessment,reason:input.reason,evidence:input.evidence}),...assessment};
}
export function actOnCommerce(profile:Profile,account:AccountState,action:CommerceAction,now=new Date(),householdSpent=commerceSpentThisMonth(profile,now)):{profile:Profile;quote?:CheckoutQuote;order?:CommerceOrder;returnAssessment?:ReturnAssessment;returnRequest?:CommerceReturn;refund?:RefundEntry}{
  if(action.action==='quote')return{profile,quote:quoteCheckout(profile,account,action,now,householdSpent)};
  if(action.action==='returnDecision')return{profile,returnAssessment:assessReturn(profile,action,now)};
  const prior=receipt(profile,action);
  if(prior){
    if(action.action==='checkout'||action.action==='advanceTracking'||action.action==='simulateDelay'||action.action==='approveCompensation')return{profile,order:requiredOrder(profile,prior.resultId)};
    return{profile,returnRequest:requiredReturn(profile,prior.resultId)};
  }
  if(action.action==='checkout'){
    const quote=quoteCheckout(profile,account,action,now,householdSpent);if(quote.id!==action.quoteId)throw new AppError('CHECKOUT_CHANGED','The price, address, payment, budget or promise changed. Review a fresh quote before confirming.',409);
    const approval=approveDecisions(profile,action.decisionIds,now);if(approval.blocked.length||approval.approved.length!==action.decisionIds.length)throw new AppError('CHECKOUT_GUARD','A selected item is no longer ready. Review your decisions.',409);
    const next=mutation(approval.profile),id=idFor('order',[profile.id,action.requestId]);
    const order:CommerceOrder={id,requestId:action.requestId,requestHash:requestHash(action),createdAt:stamp(now),lines:quote.lines,subtotal:quote.subtotal,discount:quote.discount,shippingFee:0,total:quote.total,currency:'KRW',address:quote.address,payment:quote.payment,delivery:quote.delivery,deliveryInstruction:quote.deliveryInstruction,status:'preparing',stage:'preparing',timeline:[{id:id+'-preparing',step:'preparing',label:trackingLabels.preparing,at:stamp(now),simulation:true}],deliveredAt:null,doorstepPhoto:null,compensation:null,simulation:true};
    next.commerce.orders.push(order);record(next,action,id);touch(next,now);return{profile:next,order};
  }
  if(action.action==='submitReturn'){
    const assessment=assessReturn(profile,action,now);if(assessment.id!==action.assessmentId)throw new AppError('RETURN_CHANGED','Review a fresh return decision before confirming.',409);
    const next=mutation(profile),id=idFor('return',[profile.id,action.requestId]);
    const item:CommerceReturn={...assessment,id,assessmentId:assessment.id,requestId:action.requestId,createdAt:stamp(now),status:assessment.outcome==='keep_refund'?'refund_recorded':assessment.outcome==='pickup_refund'?'pickup_scheduled':'human_review',evidence:structuredClone(action.evidence),reason:action.reason,refundId:null,humanReview:assessment.outcome==='human_review'?{ticketId:idFor('review',id),status:'requested',message:'Simulated human-review queue. No real staff have been contacted; your return has not been denied.'}:null};
    next.commerce.returns.push(item);const refund=assessment.outcome==='keep_refund'?returnRefund(next,item,now):undefined;record(next,action,id);touch(next,now);return{profile:next,returnRequest:item,...(refund?{refund}:{})};
  }
  const next=mutation(profile);
  if(action.action==='humanReview'||action.action==='completePickup'){
    const item=requiredReturn(next,action.returnId);
    if(action.action==='humanReview'){
      if(item.status!=='human_review')throw new AppError('REVIEW_NOT_PENDING','This return does not need human review.',409);
      item.humanReview={ticketId:item.humanReview!.ticketId,status:'resolved',message:'Concept simulation: a human review approved pickup. No real employee was contacted.'};
      item.outcome='pickup_refund';item.status='pickup_scheduled';item.pickup={label:'Tomorrow · pickup at your door',instruction:'Leave the item at the sample front door. No box needed. No real courier has been booked.',scheduledFor:tomorrow(profile,now,12)};
    }else{
      if(item.status!=='pickup_scheduled')throw new AppError('PICKUP_NOT_PENDING','This return has no pending pickup.',409);
      returnRefund(next,item,now);
    }
    record(next,action,item.id);touch(next,now);return{profile:next,returnRequest:item};
  }
  const order=requiredOrder(next,action.orderId);
  if(action.action==='advanceTracking'){
    const index=steps.indexOf(order.stage);if(index===steps.length-1)throw new AppError('ORDER_DELIVERED','This simulated order is already delivered.',409);
    order.stage=steps[index+1];order.status=order.stage==='delivered'?'delivered':'shipping';order.timeline.push({id:order.id+'-'+order.stage,step:order.stage,label:trackingLabels[order.stage],at:stamp(now),simulation:true});
    if(order.stage==='delivered'){order.deliveredAt=stamp(now);order.doorstepPhoto='/commerce/doorstep.png';}
  }else if(action.action==='simulateDelay'){
    if(order.stage==='delivered')throw new AppError('ORDER_DELIVERED','Simulate a delay before delivery.',409);
    if(order.compensation)throw new AppError('CLAIM_EXISTS','This order already has a compensation claim.',409);
    order.compensation={id:idFor('compensation',order.id),amount:3000,status:'pending',reason:'Concept simulation: Coopy filed a ₩3,000 compensation claim automatically, pending your approve.',createdAt:stamp(now),approvedAt:null,simulation:true};
  }else if(action.action==='approveCompensation'){
    if(order.compensation?.status!=='pending')throw new AppError('CLAIM_NOT_PENDING','No compensation claim is waiting for approval.',409);
    order.compensation.status='approved';order.compensation.approvedAt=stamp(now);
    next.commerce.refunds.push({id:order.compensation.id,type:'compensation',orderId:order.id,returnId:null,amount:3000,currency:'KRW',paymentLabel:order.payment.label,createdAt:stamp(now),status:'recorded',simulation:true});
  }
  record(next,action,order.id);touch(next,now);return{profile:next,order};
}
