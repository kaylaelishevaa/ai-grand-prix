import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createProfile} from '../lib/profile';
import {addDecision,effectiveNow,isDecisionLocked,localClock} from '../lib/guardrails';
import {assignDelegation} from '../lib/delegation';
import {catalog} from '../lib/catalog';
import {actOnCommerce,assessReturn,commerceSpentThisMonth,commerceState,quoteCheckout} from '../lib/server/commerce';
import {AppError} from '../lib/server/errors';
import type {AccountState} from '../lib/account-types';
import type {CheckoutInput,CommerceAction,ReturnInput} from '../lib/commerce-types';
import {GET as getCommerce,POST as postCommerce} from '../app/api/commerce/route';
import {POST as decisionsRoute} from '../app/api/decisions/route';

const now=new Date('2026-10-25T05:00:00.000Z');
function setup(skuIds=['mugs']){
  let profile=createProfile('commerce-test',now);profile.xp=70;
  for(const skuId of skuIds)profile=addDecision(profile,skuId,'your call',now).profile;
  const account:AccountState={id:'account-test',version:1,members:[{profileId:profile.id,label:'Me'}],addresses:[{id:'home',label:'Sample home',line:'Sample Seoul address',postcode:'00000',area:'Seoul',dawnEligible:true,sample:true}],payments:[{id:'coopypay',label:'CoopyPay · mock',last4:'4242',sample:true}],defaultAddressId:'home',defaultPaymentId:'coopypay',wowMember:true,householdBudget:200000,notifications:{dailyLimit:3,quietHours:true},licenses:{[profile.id]:Object.fromEntries([...new Set(catalog.map(sku=>sku.category))].map(category=>[category,{enabled:true,cap:150000}]))},permissionLog:[],updatedAt:now.toISOString()};
  const input:CheckoutInput={decisionIds:profile.decisions.map(item=>item.id),addressId:'home',paymentMethodId:'coopypay',deliveryKind:'rocket',deliveryInstruction:'leave at the front door'};
  return{profile,account,input};
}
const code=(expected:string)=>(error:unknown)=>error instanceof AppError&&error.code===expected;
function delivered(skuIds=['mugs']){
  const state=setup(skuIds),quote=quoteCheckout(state.profile,state.account,state.input,now);
  let result=actOnCommerce(state.profile,state.account,{action:'checkout',...state.input,quoteId:quote.id,requestId:'confirm'},now);
  for(let i=0;i<4;i++)result=actOnCommerce(result.profile,state.account,{action:'advanceTracking',orderId:result.order!.id,requestId:'tracking-'+i},now);
  return{...state,profile:result.profile,order:result.order!};
}

test('checkout quote is read-only; final confirmation atomically approves snapshots with no XP and is idempotent',()=>{
  const {profile,account,input}=setup(['mugs','kettle']),before=structuredClone(profile),quote=quoteCheckout(profile,account,input,now);
  assert.deepEqual(profile,before);assert.equal(profile.decisions.filter(item=>item.approvedAt).length,0);
  assert.equal(quote.total,quote.lines.reduce((sum,line)=>sum+line.unitPrice,0));assert.equal(quote.shippingFee,0);assert.equal(quote.simulation,true);
  const action:CommerceAction={action:'checkout',...input,quoteId:quote.id,requestId:'once'};
  const result=actOnCommerce(profile,account,action,now);assert.equal(result.profile.xp,70);assert.equal(result.profile.decisions.filter(item=>item.approvedAt).length,2);assert.equal(result.order!.stage,'preparing');
  assert.deepEqual(result.order!.address,account.addresses[0]);assert.deepEqual(result.order!.payment,account.payments[0]);assert.equal(result.order!.deliveryInstruction,'leave at the front door');
  assert(result.profile.owned.some(item=>item.skuId==='mugs'));assert.equal(commerceState(result.profile).orders.length,1);
  const repeat=actOnCommerce(result.profile,account,action,new Date(now.getTime()+3600000));assert.equal(repeat.order!.id,result.order!.id);assert.deepEqual(repeat.profile,result.profile);
  assert.throws(()=>actOnCommerce(result.profile,account,{...action,deliveryInstruction:'changed'},now),code('COMMERCE_REQUEST_CONFLICT'));
  assert.deepEqual(profile,before,'The pre-confirmation profile was never mutated');
});

test('server checkout revalidates stale quote, ownership, night lock, budget, quarantine and current category permissions',()=>{
  const state=setup(['kettle']),quote=quoteCheckout(state.profile,state.account,state.input,now),before=structuredClone(state.profile);
  const moved=structuredClone(state.account);moved.addresses[0].line='Different sample address';
  assert.throws(()=>actOnCommerce(state.profile,moved,{action:'checkout',...state.input,quoteId:quote.id,requestId:'stale'},now),code('CHECKOUT_CHANGED'));assert.deepEqual(state.profile,before);
  const owned=structuredClone(state.profile);owned.owned.push({skuId:'kettle',source:'have-one',acquiredAt:now.toISOString()});assert.throws(()=>quoteCheckout(owned,state.account,state.input,now),code('ALREADY_OWNED'));
  const hidden=structuredClone(state.profile);hidden.quarantine.push({category:'kitchen',sensitive:true,note:'test'});assert.throws(()=>quoteCheckout(hidden,state.account,state.input,now),code('CHECKOUT_EXCLUDED'));
  const poor=structuredClone(state.profile);poor.budget=10000;assert.throws(()=>quoteCheckout(poor,state.account,state.input,now),code('CHECKOUT_BUDGET'));
  assert.throws(()=>quoteCheckout(state.profile,state.account,state.input,now,state.account.householdBudget-100),code('CHECKOUT_BUDGET'));
  const night=setup([]);night.profile.pretend2am=true;night.profile=addDecision(night.profile,'kettle','night call',now).profile;night.input.decisionIds=[night.profile.decisions[0].id];assert.throws(()=>quoteCheckout(night.profile,night.account,night.input,now),code('SLEEP_ON_IT'));
  let delegated=assignDelegation(state.profile,{skuId:'kettle',budgetCap:40000,watchPrice:true,haggle:true,bundle:false,scheduleDelivery:true},now).profile;
  const revoked=structuredClone(state.account);revoked.licenses[delegated.id].kitchen.enabled=false;assert.throws(()=>quoteCheckout(delegated,revoked,state.input,now),code('CHECKOUT_LICENSE'));
  delegated=structuredClone(delegated);delegated.decisions[0].delegation!.quotedPrice=1;assert.throws(()=>quoteCheckout(delegated,state.account,state.input,now),code('CHECKOUT_DELEGATION'));
});

test('Dawn is a WOW/address/catalog-gated promise, not a selectable arbitrary speed claim',()=>{
  const {profile,account,input}=setup();input.deliveryKind='dawn';
  const late=new Date('2026-10-25T14:59:00Z'),quote=quoteCheckout(profile,account,input,late);assert.equal(quote.delivery.promisedAt,'2026-10-25T22:00:00.000Z');assert.match(quote.delivery.label,/before 7 AM.*midnight/);
  const nextDay=quoteCheckout(profile,account,input,new Date('2026-10-25T15:01:00Z'));assert.equal(nextDay.delivery.promisedAt,'2026-10-26T22:00:00.000Z');
  account.wowMember=false;assert.throws(()=>quoteCheckout(profile,account,input,now),code('DELIVERY_NOT_ELIGIBLE'));account.wowMember=true;account.addresses[0].dawnEligible=false;assert.throws(()=>quoteCheckout(profile,account,input,now),code('DELIVERY_NOT_ELIGIBLE'));
  const standard=catalog.find(sku=>/^Standard delivery/.test(sku.delivery))!;const other=setup([standard.id]);other.input.deliveryKind='dawn';assert.throws(()=>quoteCheckout(other.profile,other.account,other.input,now),code('DELIVERY_NOT_ELIGIBLE'));
});

test('explicit morning rehearsal advances the local clock without clearing holds; real and night modes remain enforced',()=>{
  const late=new Date('2026-10-25T14:30:00Z'); // 23:30 in Seoul.
  let profile=createProfile('clock-test',late);profile=addDecision(profile,'mugs','late evening',late).profile;
  const held=profile.decisions[0],original=held.lockedUntil;assert(original);assert.equal(isDecisionLocked(profile,held,late),true);
  profile.rehearsalClock='day';assert.equal(localClock(effectiveNow(profile,late),profile.timezone).hour,9);assert.equal(localClock(effectiveNow(profile,late),profile.timezone).day,26);
  assert.equal(isDecisionLocked(profile,held,late),false);assert.equal(held.lockedUntil,original,'A rehearsal never erases the original hold');
  const future={...held,lockedUntil:'2026-11-01T22:00:00.000Z'};assert.equal(isDecisionLocked(profile,future,late),true,'Morning is not a blanket unlock');
  profile.rehearsalClock=null;profile.pretend2am=false;assert.equal(effectiveNow(profile,late).toISOString(),late.toISOString());assert.equal(isDecisionLocked(profile,held,late),true);
  profile.rehearsalClock='night';const nightAdded=addDecision(profile,'kettle','night rehearsal',late);assert.equal(localClock(effectiveNow(profile,late),profile.timezone).hour,2);assert.equal(isDecisionLocked(nightAdded.profile,nightAdded.decision!,late),true);
  assert.equal(nightAdded.profile.xp,0);
});

test('tracking advances prepared stages once; delay compensation stays pending until explicit approval',()=>{
  const {profile,account,input}=setup(),quote=quoteCheckout(profile,account,input,now);
  let result=actOnCommerce(profile,account,{action:'checkout',...input,quoteId:quote.id,requestId:'confirm'},now),orderId=result.order!.id;
  result=actOnCommerce(result.profile,account,{action:'simulateDelay',orderId,requestId:'delay'},now);assert.equal(result.order!.compensation!.status,'pending');assert.equal(commerceState(result.profile).refunds.length,0);
  const spent=commerceSpentThisMonth(result.profile,now);
  result=actOnCommerce(result.profile,account,{action:'approveCompensation',orderId,requestId:'claim'},now);assert.equal(commerceState(result.profile).refunds[0].amount,3000);assert.equal(commerceSpentThisMonth(result.profile,now),spent,'Compensation is not a purchase refund');
  assert.throws(()=>actOnCommerce(result.profile,account,{action:'approveCompensation',orderId,requestId:'claim-again'},now),code('CLAIM_NOT_PENDING'));
  const action:CommerceAction={action:'advanceTracking',orderId,requestId:'packed'};result=actOnCommerce(result.profile,account,action,now);assert.equal(result.order!.stage,'packed');
  const repeat=actOnCommerce(result.profile,account,action,now);assert.equal(repeat.order!.stage,'packed');assert.equal(repeat.order!.timeline.length,2);
  for(let i=0;i<3;i++)result=actOnCommerce(result.profile,account,{action:'advanceTracking',orderId,requestId:'next-'+i},now);
  assert.equal(result.order!.status,'delivered');assert.equal(result.order!.timeline.length,5);assert.equal(result.order!.doorstepPhoto,'/commerce/doorstep.png');assert.equal(result.profile.xp,70);
});

test('prepared low-value damage records a local refund only after confirmation, once per delivered item',()=>{
  const {profile,account,order}=delivered(),input:ReturnInput={orderId:order.id,lineId:order.lines[0].id,reason:'damaged',evidence:{kind:'prepared',sampleId:'damaged-item'}};
  const before=structuredClone(profile),assessment=assessReturn(profile,input,now);assert.equal(assessment.outcome,'keep_refund');assert.deepEqual(profile,before);
  const action:CommerceAction={action:'submitReturn',...input,assessmentId:assessment.id,requestId:'return-confirm'};
  const result=actOnCommerce(profile,account,action,now);assert.equal(result.returnRequest!.status,'refund_recorded');assert.equal(result.refund!.amount,order.lines[0].total);assert.equal(result.profile.xp,70);assert.equal(commerceSpentThisMonth(result.profile,now),0);
  assert.equal(commerceState(actOnCommerce(result.profile,account,action,now).profile).refunds.length,1);
  assert.throws(()=>assessReturn(result.profile,input,now),code('RETURN_ALREADY_EXISTS'));
  assert.throws(()=>assessReturn(createProfile('another',now),input,now),code('ORDER_NOT_FOUND'));
});

test('large returns require door pickup; arbitrary uploaded photos are uninspected and route to simulated human review',()=>{
  const {profile,account,order}=delivered(['kettle']),base:ReturnInput={orderId:order.id,lineId:order.lines[0].id,reason:'damaged',evidence:{kind:'prepared',sampleId:'damaged-item'}};
  const planned=assessReturn(profile,base,now);assert.equal(planned.outcome,'pickup_refund');assert.match(planned.pickup!.instruction,/No box needed/);
  const input={...base,evidence:{kind:'upload' as const,fileName:'photo.png',mimeType:'image/png',sizeBytes:100}};
  const assessment=assessReturn(profile,input,now);assert.equal(assessment.outcome,'human_review');assert.equal(assessment.evidenceStatus,'not-inspected');assert.match(assessment.explanation,/have not been inspected/);
  let result=actOnCommerce(profile,account,{action:'submitReturn',...input,assessmentId:assessment.id,requestId:'upload-return'},now);assert.equal(commerceState(result.profile).refunds.length,0);assert.equal(result.returnRequest!.status,'human_review');
  const returnId=result.returnRequest!.id;result=actOnCommerce(result.profile,account,{action:'humanReview',returnId,requestId:'human'},now);assert.equal(result.returnRequest!.status,'pickup_scheduled');assert.match(result.returnRequest!.humanReview!.message,/No real employee/);
  result=actOnCommerce(result.profile,account,{action:'completePickup',returnId,requestId:'pickup'},now);assert.equal(result.returnRequest!.status,'refund_recorded');assert.equal(commerceState(result.profile).refunds.length,1);
});

test('API persists quote→confirm→delivered→return in one profile, with no network or real payment', {concurrency:false},async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'coupi-commerce-route-')),previousData=process.env.COUPI_DATA_DIR,previousAccount=process.env.COUPI_ACCOUNT_DIR,previousFetch=globalThis.fetch;
  process.env.COUPI_DATA_DIR=root;delete process.env.COUPI_ACCOUNT_DIR;let fetches=0;globalThis.fetch=(async()=>{fetches++;throw new Error('Commerce must remain local');}) as typeof fetch;
  const origin='http://127.0.0.1:3007',cookies=new Map<string,string>();
  async function send(handler:(req:Request)=>Promise<Response>,pathname:string,body?:unknown){
    const response=await handler(new Request(origin+pathname,{method:body===undefined?'GET':'POST',headers:{origin,cookie:[...cookies].map(([name,value])=>name+'='+value).join('; '),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}));
    for(const value of response.headers.getSetCookie()){const pair=value.split(';')[0],split=pair.indexOf('=');cookies.set(pair.slice(0,split),pair.slice(split+1));}
    return{status:response.status,data:await response.json()};
  }
  try{
    let initial=await send(getCommerce,'/api/commerce');assert.equal(initial.status,200);
    const added=await send(decisionsRoute,'/api/decisions',{action:'add',skuId:'mugs',source:'test'});assert.equal(added.status,200);
    // Remove wall-clock variability from this route test without changing any actual user data.
    const file=path.join(root,initial.data.profile.id+'.json'),stored=JSON.parse(await readFile(file,'utf8'));stored.decisions[0].lockedUntil=null;
    const {writeFile}=await import('node:fs/promises');await writeFile(file,JSON.stringify(stored));
    const account=initial.data.account,input={decisionIds:[added.data.decision.id],addressId:account.defaultAddressId,paymentMethodId:account.defaultPaymentId,deliveryKind:'rocket',deliveryInstruction:'leave at the front door'};
    const quote=await send(postCommerce,'/api/commerce',{action:'quote',...input});assert.equal(quote.status,200);assert.equal(quote.data.profile.decisions[0].approvedAt,null);
    const action={action:'checkout',...input,quoteId:quote.data.quote.id,requestId:'api-confirm'};let placed=await send(postCommerce,'/api/commerce',action);assert.equal(placed.status,200);
    const orderId=placed.data.order.id,repeat=await send(postCommerce,'/api/commerce',action);assert.equal(repeat.status,200);assert.equal(repeat.data.commerce.orders.length,1);
    for(let i=0;i<4;i++)placed=await send(postCommerce,'/api/commerce',{action:'advanceTracking',orderId,requestId:'api-track-'+i});assert.equal(placed.data.order.stage,'delivered');
    const plan={action:'returnDecision',orderId,lineId:placed.data.order.lines[0].id,reason:'damaged',evidence:{kind:'prepared',sampleId:'damaged-item'}};
    const assessed=await send(postCommerce,'/api/commerce',plan);assert.equal(assessed.status,200);
    const returned=await send(postCommerce,'/api/commerce',{...plan,action:'submitReturn',assessmentId:assessed.data.returnAssessment.id,requestId:'api-return'});assert.equal(returned.status,200);assert.equal(returned.data.commerce.refunds.length,1);
    const persisted=JSON.parse(await readFile(file,'utf8'));assert.equal(persisted.commerce.orders[0].stage,'delivered');assert.equal(persisted.commerce.returns.length,1);assert.equal(persisted.xp,0);assert.equal(fetches,0);
    assert((await readdir(root)).includes(initial.data.profile.id+'.json'));
  }finally{globalThis.fetch=previousFetch;if(previousData===undefined)delete process.env.COUPI_DATA_DIR;else process.env.COUPI_DATA_DIR=previousData;if(previousAccount===undefined)delete process.env.COUPI_ACCOUNT_DIR;else process.env.COUPI_ACCOUNT_DIR=previousAccount;await rm(root,{recursive:true,force:true});}
});
