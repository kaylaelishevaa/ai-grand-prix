import referenceData from '../data/teammate-catalog.json';
import {getSku} from './catalog';
import {effectiveNow,isDecisionLocked,localClock} from './guardrails';
import {decisionApprovalIssue} from './delegation-policy';
import type {Profile,SKU} from './types';

export type HomeScenario='normal'|'problem'|'first'|'quiet'|'night';
export const HOME_SCENARIOS:{id:HomeScenario;label:string}[]=[{id:'normal',label:'Everyday'},{id:'problem',label:'Delivery issue'},{id:'first',label:'First call'},{id:'quiet',label:'Quiet day'},{id:'night',label:'Night'}];
export interface HomeReference {id:string;name:string;productType:string;price:number|null;image:string;url:string;sourceNote:string;verifiedAttributes:string[];aliases:string[];}
export const homeReferences=referenceData as HomeReference[];
export const referenceById=(id:string)=>homeReferences.find(product=>product.id===id);
const shortNames:Record<string,string>={'1814412512':'Romand Zero Matte 09','55518713':'Desk lamp','7612276799':'Blue-light glasses','20145368':'Office chair','7185725748':'Lip Monster 03','7322824636':'MAC Powder Kiss','7950092256':'Seoul chair'};
export const referenceName=(product:HomeReference)=>shortNames[product.id]||product.aliases[0]||product.name;
export const homeMoney=(price:number|null)=>price===null?'price unverified':'₩'+price.toLocaleString('en-US');
export interface HomeCard {id:string;kind:'problem'|'decision'|'arrival'|'receipt'|'followup'|'nudge';title:string;line:string;action:string;sku?:SKU;reference?:HomeReference;locked?:boolean;sourceId:string;reason?:string;demo:boolean;href?:string;}
export interface LiveHomeFeed {cards:HomeCard[];brief:string;mood:HomeScenario;pendingCount:number;}

/** Only current profile facts enter the real homepage; an approval is never a delivery. */
export function buildLiveHome(profile:Profile,now:Date):LiveHomeFeed {
  const visible=profile.decisions.filter(item=>{const sku=getSku(item.skuId);return sku&&!sku.sensitive&&!profile.quarantine.some(q=>q.sensitive&&q.category===sku.category);});
  const pending=visible.filter(item=>!item.approvedAt).sort((a,b)=>Date.parse(a.addedAt)-Date.parse(b.addedAt));
  const cards:HomeCard[]=pending.map(item=>{
    const sku=getSku(item.skuId)!,locked=isDecisionLocked(profile,item,now),plan=item.delegation,issue=decisionApprovalIssue(item);
    const line=locked?'held until 07:00 · morning-you gets a vote':plan?.status==='watching'?'watching your cap · price checks are simulated':issue||`${homeMoney(plan?.quotedPrice??sku.price)} · ${plan?.status==='haggled'?`−${homeMoney(plan.discount)} simulated saving`:'waiting for your OK'}`;
    return {id:'live:'+item.id,sourceId:item.id,kind:locked?'nudge':'decision',title:sku.name,line,action:locked?'See the plan':'Review',sku,locked,demo:false};
  });
  cards.sort((a,b)=>Number(!!a.locked)-Number(!!b.locked));
  const allOrders=profile.commerce?.orders||[];
  const orders=allOrders.filter(order=>order.lines.length>0&&order.lines.every(line=>{const sku=getSku(line.skuId);return sku&&!sku.sensitive&&!profile.quarantine.some(q=>q.sensitive&&q.category===sku.category);}));
  for(const order of orders.slice().reverse()){
    const first=order.lines[0];if(!first)continue;
    const sku=getSku(first.skuId);if(!sku||sku.sensitive||profile.quarantine.some(q=>q.category===sku.category))continue;
    const claim=order.compensation?.status==='pending';
    cards.push({id:'order:'+order.id,sourceId:order.id,kind:claim?'problem':order.status==='delivered'?'receipt':'arrival',title:first.name+(order.lines.length>1?` + ${order.lines.length-1} more`:''),line:claim?'simulated delay · ₩3,000 claim needs your OK':`local order · ${order.status} · simulated delivery`,action:claim?'Review claim':'Track',sku,demo:false,href:`/orders/${encodeURIComponent(order.id)}/tracking`});
  }
  const rank={problem:0,decision:1,arrival:2,receipt:3,followup:3,nudge:4};cards.sort((a,b)=>rank[a.kind]-rank[b.kind]);
  const recent=visible.filter(item=>item.approvedAt&&Date.parse(item.approvedAt)<=now.getTime()&&!allOrders.some(order=>order.lines.some(line=>line.decisionId===item.id))).sort((a,b)=>Date.parse(b.approvedAt!)-Date.parse(a.approvedAt!));
  for(const item of recent){if(cards.some(card=>card.sku?.id===item.skuId)||allOrders.some(order=>order.lines.some(line=>line.decisionId===item.id)))continue;cards.push({id:'receipt:'+item.id,sourceId:item.id,kind:'receipt',title:getSku(item.skuId)!.name,line:'approved by you · no order or payment placed',action:'View receipt',sku:getSku(item.skuId),demo:false});}
  const shown=cards.slice(0,3),night=localClock(effectiveNow(profile,now),profile.timezone).hour;
  const mood=night>=22||night<7?'night':shown.length?'normal':'quiet';
  const locked=pending.filter(item=>isDecisionLocked(profile,item,now)).length,ready=pending.filter(item=>!isDecisionLocked(profile,item,now)&&!decisionApprovalIssue(item)).length;
  const brief=ready?`${ready===1?'one little plan needs':`${ready} little plans need`} your OK. ${locked?'the late-night ones can wait.':'i’ve kept the details close.'}`:locked?`it’s late. ${locked===1?'your little plan is':'your plans are'} held until morning. nothing needs deciding now.`:pending.length?'your plans need a little look first. nothing gets approved above your limits.':recent.length?'your approval is saved. nothing was purchased. shall we wander a little?':'nothing needs you right now. a little breathing room looks good on you.';
  const orderBrief=orders.some(order=>order.compensation?.status==='pending')?'a little delivery detour in your simulation. the compensation claim needs your OK.':orders.length&&!pending.length?'your order is here with me. you can follow every step, at your pace.':brief;
  return {cards:shown,brief:orderBrief,mood,pendingCount:pending.length};
}

export interface DemoOrder {id:string;itemId:string;status:'packed'|'out_for_delivery'|'delivered'|'delayed'|'cancelled';eta?:string;deliveredAt?:string;originalEta?:string;rated?:number;swapId?:string;swapEta?:string;}
export interface HomeDemoState {scenario:HomeScenario;orders:DemoOrder[];decisions:{itemId:string;status:'waiting'|'approved'|'removed'}[];held:{itemId:string;removed:boolean}[];saved:{itemId:string;removed:boolean}[];}
/** Prepared source-home stories remain isolated from Profile, approvals, memory and retailer orders. */
export function createHomeDemo(scenario:HomeScenario):HomeDemoState {
  const data:HomeDemoState={scenario,orders:[],decisions:[],held:[],saved:[]};
  if(scenario==='quiet')return data;
  if(scenario==='first'){data.orders=[{id:'first-order',itemId:'1814412512',status:'packed',eta:'2026-10-27T07:00:00+09:00'}];return data;}
  if(scenario==='night'){data.held=[{itemId:'7322824636',removed:false}];return data;}
  data.orders=[{id:'1043',itemId:'55518713',status:'out_for_delivery',eta:'2026-10-26T12:00:00+09:00'},{id:'1042',itemId:'1814412512',status:'delivered',deliveredAt:'2026-10-25T07:02:00+09:00'}];
  data.decisions=[{itemId:'7612276799',status:'waiting'}];data.saved=[{itemId:'7185725748',removed:false}];
  if(scenario==='problem')data.orders.unshift({id:'1044',itemId:'20145368',status:'delayed',eta:'2026-10-30T07:00:00+09:00',originalEta:'2026-10-28T07:00:00+09:00',swapId:'7950092256',swapEta:'2026-10-27T07:00:00+09:00'});
  return data;
}
export function demoDeliveryTime(value?:string):string {return value?new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Seoul',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'time unconfirmed';}
export function buildDemoHome(data:HomeDemoState):{cards:HomeCard[];brief:string} {
  const cards:HomeCard[]=[];
  const add=(id:string,itemId:string,kind:HomeCard['kind'],title:string,line:string,action:string,reason?:string)=>{const reference=referenceById(itemId);if(reference)cards.push({id,sourceId:id,kind,title,line,action,reference,demo:true,reason});};
  for(const order of data.orders){
    const product=referenceById(order.itemId);if(!product||order.status==='cancelled')continue;
    const name=referenceName(product);
    if(order.status==='delayed')add(order.id,order.itemId,'problem','your chair is running late',`now ${demoDeliveryTime(order.eta)}. there’s another way.`, 'See options');
    else if(order.status==='delivered'&&!order.rated)add(order.id,order.itemId,'followup',`${name} arrived`,'how does it feel?','Rate it');
    else if(order.status!=='delivered')add(order.id,order.itemId,'arrival',name,`prepared arrival · ${demoDeliveryTime(order.eta)}`,'Track');
  }
  for(const item of data.decisions)if(item.status==='waiting'){const p=referenceById(item.itemId);if(p)add('decision:'+item.itemId,item.itemId,'decision',referenceName(p),`${homeMoney(p.price)} reference · waiting for your OK`,'Review');}
  const problem=cards.some(card=>card.kind==='problem');
  if(!problem){
    for(const item of data.held)if(!item.removed){const p=referenceById(item.itemId);if(p)add('held:'+item.itemId,item.itemId,'nudge',referenceName(p),'held until 7am · morning-you gets a vote','A closer look','Added at 23:10 in this prepared night. Held until 07:00.');}
    for(const item of data.saved)if(!item.removed){const p=referenceById(item.itemId);if(p)add('saved:'+item.itemId,item.itemId,'nudge',referenceName(p),'back in stock · prepared event','View','Saved on 21 October in this story. The restock event is fictional.');}
  }
  const priority={problem:0,decision:1,arrival:2,receipt:3,followup:3,nudge:4};
  cards.sort((a,b)=>priority[a.kind]-priority[b.kind]);
  let nudged=false;const shown=cards.filter(card=>card.kind!=='nudge'||(!nudged&&(nudged=true))).slice(0,problem?2:3);
  const arrival=shown.find(card=>card.kind==='arrival'),decision=shown.find(card=>card.kind==='decision');
  const decisionBrief=decision?.reference?.productType==='glasses'?'those glasses still need your OK.':`your ${decision?.reference?.productType||'little find'} still needs your OK.`;
  const brief=problem?'your chair is running late. i found a possible swap. your say, as always.':decision?`${arrival?`your ${arrival.reference?.productType||'little find'} is on its way. `:''}${decisionBrief}`:shown.some(c=>c.id.startsWith('held:'))?'it’s late. i’ll hold the lipstick until morning. you get some sleep.':arrival?`${data.scenario==='first'?'that was a lovely first hello. ':''}your ${arrival.reference?.productType||'little find'} is on its way in this story.`:shown.some(c=>c.kind==='followup')?'a little follow-up. how did your lipstick feel?':'nothing needs you today. enjoy it.';
  return {cards:shown,brief};
}
export type HomeDemoAction={kind:'approve'|'dismiss'|'remove-held'|'save';itemId:string}|{kind:'swap'|'wait'|'cancel';orderId:string}|{kind:'rate';orderId:string;rating:number};
export function applyHomeDemoAction(input:HomeDemoState,action:HomeDemoAction):HomeDemoState {
  const next=structuredClone(input);
  if('orderId'in action){const order=next.orders.find(item=>item.id===action.orderId);if(!order)return next;
    if(action.kind==='swap'&&order.swapId&&referenceById(order.swapId)){order.itemId=order.swapId;order.eta=order.swapEta;order.status='packed';delete order.swapId;delete order.swapEta;}
    if(action.kind==='wait')order.status='packed';
    if(action.kind==='cancel')order.status='cancelled';
    if(action.kind==='rate'&&Number.isInteger(action.rating)&&action.rating>=1&&action.rating<=5)order.rated=action.rating;
  }else{
    const decision=next.decisions.find(item=>item.itemId===action.itemId&&item.status==='waiting');
    if(action.kind==='approve'&&decision)decision.status='approved';
    if(action.kind==='dismiss'&&decision)decision.status='removed';
    if(action.kind==='remove-held'){const held=next.held.find(item=>item.itemId===action.itemId);if(held)held.removed=true;}
    if(action.kind==='save'&&referenceById(action.itemId)&&!next.decisions.some(item=>item.itemId===action.itemId&&item.status!=='removed')){next.decisions.push({itemId:action.itemId,status:'waiting'});const saved=next.saved.find(item=>item.itemId===action.itemId);if(saved)saved.removed=true;}
  }
  return next;
}
