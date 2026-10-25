import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {GET as getAccount,POST as postAccount} from '../app/api/account/route';
import {POST as postDelegate} from '../app/api/delegate/route';
import {GET as getCommerce,POST as postCommerce} from '../app/api/commerce/route';
import {loadMemberProfile,withAccountSession,householdSpentThisMonth} from '../lib/server/account-store';
import {addDecision} from '../lib/guardrails';
import {assignDelegation} from '../lib/delegation';
import {rememberWords} from '../lib/memory';
import {getSku} from '../lib/catalog';

const origin='http://127.0.0.1:3007',day=new Date('2026-10-25T05:00:00Z');
function request(cookies:Map<string,string>,body?:unknown){return new Request(origin+'/api/account',{method:body===undefined?'GET':'POST',headers:{origin,cookie:[...cookies].map(([key,value])=>key+'='+value).join('; '),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
async function send(handler:(request:Request)=>Promise<Response>,cookies:Map<string,string>,body?:unknown){const response=await handler(request(cookies,body));for(const header of response.headers.getSetCookie()){const pair=header.split(';')[0],split=pair.indexOf('=');cookies.set(pair.slice(0,split),pair.slice(split+1));}return {status:response.status,data:await response.json()};}
async function isolated(work:()=>Promise<void>){const directory=await mkdtemp(path.join(tmpdir(),'coupi-account-test-')),oldData=process.env.COUPI_DATA_DIR,oldAccount=process.env.COUPI_ACCOUNT_DIR;process.env.COUPI_DATA_DIR=directory;delete process.env.COUPI_ACCOUNT_DIR;try{await work();}finally{if(oldData===undefined)delete process.env.COUPI_DATA_DIR;else process.env.COUPI_DATA_DIR=oldData;if(oldAccount===undefined)delete process.env.COUPI_ACCOUNT_DIR;else process.env.COUPI_ACCOUNT_DIR=oldAccount;await rm(directory,{recursive:true,force:true});}}

test('account initializes once with sample details and a distinct blank member, including cookie-loss recovery',{concurrency:false},async()=>isolated(async()=>{
 const cookies=new Map<string,string>(),first=await send(getAccount,cookies);assert.equal(first.status,200);const{account,profile}=first.data;
 assert.equal(account.members.length,2);assert.notEqual(account.id,profile.id);assert.equal(account.defaultPaymentId,'coopy-pay');assert(account.addresses.every((item:{sample:boolean})=>item.sample));assert(account.payments.every((item:{sample:boolean})=>item.sample));
 const other=await loadMemberProfile(account.members[1].profileId);assert.equal(other.memoryLines.length,0);assert.equal(other.owned.length,0);assert.equal(other.decisions.length,0);assert.equal(other.journey,undefined);
 cookies.delete('coupi_household');const recovered=await send(getAccount,cookies);assert.equal(recovered.data.account.id,account.id);assert.deepEqual(recovered.data.account.members,account.members);
}));

test('household switching isolates memory, worlds, owned items and orders; foreign members are rejected',{concurrency:false},async()=>isolated(async()=>{
 const cookies=new Map<string,string>(),initial=await send(getAccount,cookies),firstId=initial.data.profile.id,otherId=initial.data.account.members[1].profileId;
 await withAccountSession(request(cookies),async session=>{session.profile=rememberWords(session.profile,'I prefer warm linen','account-test-memory','call');session.profile.owned.push({skuId:'mugs',acquiredAt:day.toISOString(),source:'approved'});session.profile.journey={hatched:true,interviewComplete:true,interviewCount:5,nextQuestion:'',districts:[],processedCallIds:[]};session.profile.commerce={version:1,orders:[],returns:[],refunds:[],receipts:[{requestId:'private-receipt',action:'test',hash:'test',resultId:'private'}]};});
 const switched=await send(postAccount,cookies,{action:'switch',profileId:otherId});assert.equal(switched.status,200);assert.equal(cookies.get('coupi_profile'),otherId);assert.equal(switched.data.profile.memoryLines.length,0);assert.equal(switched.data.profile.owned.length,0);assert.equal(switched.data.profile.journey,undefined);assert.equal(switched.data.profile.commerce,undefined);
 const back=await send(postAccount,cookies,{action:'switch',profileId:firstId});assert(back.data.profile.memoryLines.some((line:{text:string})=>line.text.includes('warm')));assert(back.data.profile.owned.some((item:{skuId:string})=>item.skuId==='mugs'));assert.equal(back.data.profile.commerce.receipts[0].requestId,'private-receipt');
 const denied=await send(postAccount,cookies,{action:'switch',profileId:randomUUID()});assert.equal(denied.status,403);assert.equal(cookies.get('coupi_profile'),firstId);
 const forged=new Map(cookies);forged.set('coupi_profile',randomUUID());assert.equal((await send(getAccount,forged)).status,403);
}));

test('revoking a member category stops its delegation and blocks assign/refresh, without touching the other member',{concurrency:false},async()=>isolated(async()=>{
 const cookies=new Map<string,string>(),initial=await send(getAccount,cookies),currentId=initial.data.profile.id,otherId=initial.data.account.members[1].profileId;
 let jobId='';await withAccountSession(request(cookies),async session=>{session.profile=assignDelegation(session.profile,{skuId:'kettle',budgetCap:50000,watchPrice:true,haggle:false,bundle:false,scheduleDelivery:true},day).profile;jobId=session.profile.decisions[0].id;});
 const revoked=await send(postAccount,cookies,{action:'permission',category:'kitchen',enabled:false,cap:50000});assert.equal(revoked.status,200);assert.equal(revoked.data.account.licenses[currentId].kitchen.enabled,false);assert.equal(revoked.data.account.licenses[otherId].kitchen.enabled,true);assert.equal(revoked.data.profile.decisions[0].delegation,undefined);assert.equal(revoked.data.profile.decisions[0].approvedAt,null);assert.equal(revoked.data.account.permissionLog.at(-1).action,'revoked');
 const blocked=await send(postDelegate,cookies,{action:'assign',skuId:'mugs',budgetCap:20000,watchPrice:true,haggle:false,bundle:false,scheduleDelivery:true});assert.equal(blocked.status,403);assert.equal(blocked.data.code,'LICENSE_REVOKED');
 const refresh=await send(postDelegate,cookies,{action:'refresh',id:jobId});assert.equal(refresh.status,403);
 const forbidden=await send(postAccount,cookies,{action:'permission',category:'personal-care',enabled:true,cap:10000});assert.equal(forbidden.status,400);
}));

test('sample payment/address IDs and notification bounds are validated, and settings persist',{concurrency:false},async()=>isolated(async()=>{
 const cookies=new Map<string,string>();await send(getAccount,cookies);
 assert.equal((await send(postAccount,cookies,{action:'settings',defaultAddressId:'not-saved'})).status,400);
 assert.equal((await send(postAccount,cookies,{action:'settings',defaultPaymentId:'real-card'})).status,400);
 assert.equal((await send(postAccount,cookies,{action:'settings',dailyLimit:11})).status,400);
 const saved=await send(postAccount,cookies,{action:'settings',householdBudget:220000,wowMember:true,defaultAddressId:'sample-studio',defaultPaymentId:'demo-card',dailyLimit:0,quietHours:false});assert.equal(saved.status,200);
 const loaded=await send(getAccount,cookies);assert.equal(loaded.data.account.householdBudget,220000);assert.equal(loaded.data.account.wowMember,true);assert.equal(loaded.data.account.defaultAddressId,'sample-studio');assert.equal(loaded.data.account.defaultPaymentId,'demo-card');assert.equal(loaded.data.account.notifications.dailyLimit,0);assert.equal(loaded.data.account.notifications.quietHours,false);
}));

test('cross-member concurrent checkouts cannot overspend a shared household budget',{concurrency:false},async()=>isolated(async()=>{
 const firstCookies=new Map<string,string>(),initial=await send(getAccount,firstCookies),otherId=initial.data.account.members[1].profileId;
 const secondCookies=new Map(firstCookies);await send(postAccount,secondCookies,{action:'switch',profileId:otherId});
 const cap=Math.max(10000,getSku('mugs')!.price+1000);await send(postAccount,firstCookies,{action:'settings',householdBudget:cap});
 for(const cookies of [firstCookies,secondCookies])await withAccountSession(request(cookies),async session=>{session.profile=addDecision(session.profile,'mugs','household concurrency test',day).profile;});
 async function quote(cookies:Map<string,string>){const current=await send(getCommerce,cookies),account=current.data.account,input={decisionIds:[current.data.profile.decisions[0].id],addressId:account.defaultAddressId,paymentMethodId:account.defaultPaymentId,deliveryKind:'rocket',deliveryInstruction:'leave at the sample door'},quoted=await send(postCommerce,cookies,{action:'quote',...input});assert.equal(quoted.status,200);return{...input,quoteId:quoted.data.quote.id};}
 const first=await quote(firstCookies),second=await quote(secondCookies);
 const results=await Promise.all([send(postCommerce,firstCookies,{action:'checkout',...first,requestId:'household-first'}),send(postCommerce,secondCookies,{action:'checkout',...second,requestId:'household-second'})]);
 assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);assert(['CHECKOUT_BUDGET','CHECKOUT_CHANGED'].includes(results.find(result=>result.status!==200)!.data.code));
 const a=await send(getCommerce,firstCookies),b=await send(getCommerce,secondCookies);assert.equal(a.data.commerce.orders.length+b.data.commerce.orders.length,1);
 await withAccountSession(request(firstCookies),async(session,account)=>{assert.equal(await householdSpentThisMonth(account,new Date(),session.profile),getSku('mugs')!.price);});
}));

test('saved address, door note and mock payment defaults flow into a quoted and approved order',{concurrency:false},async()=>isolated(async()=>{
 const cookies=new Map<string,string>(),initial=await send(getAccount,cookies),addressId=randomUUID(),paymentId=randomUUID();
 const address={action:'saveAddress',id:addressId,label:'Practice studio',line:'42 Example Lane, unit 6',postcode:'00042',area:'Imaginary district',deliveryInstruction:'Leave by the blue sample door. No bell.',dawnEligible:false,makeDefault:true};
 const saved=await send(postAccount,cookies,address);assert.equal(saved.status,200);assert.equal(saved.data.account.defaultAddressId,addressId);
 const payment=await send(postAccount,cookies,{action:'savePayment',id:paymentId,label:'Everyday mock card',kind:'card',makeDefault:true});assert.equal(payment.status,200);assert.equal(payment.data.account.defaultPaymentId,paymentId);assert.equal(payment.data.account.payments.find((row:{id:string})=>row.id===paymentId).last4,'4242');
 // Retrying the same client-generated ID updates in place instead of creating a second method.
 await send(postAccount,cookies,{action:'savePayment',id:paymentId,label:'Everyday mock card',kind:'card',makeDefault:true});
 await withAccountSession(request(cookies),async session=>{session.profile.rehearsalClock='day';session.profile=addDecision(session.profile,'mugs','address setup test',day).profile;});
 const loaded=await send(getCommerce,cookies),account=loaded.data.account;assert.equal(account.addresses.length,3);assert.equal(account.payments.length,3);
 const input={decisionIds:[loaded.data.profile.decisions[0].id],addressId:account.defaultAddressId,paymentMethodId:account.defaultPaymentId,deliveryKind:'rocket',deliveryInstruction:''};
 const quoted=await send(postCommerce,cookies,{action:'quote',...input});assert.equal(quoted.status,200);assert.equal(quoted.data.quote.address.line,address.line);assert.equal(quoted.data.quote.deliveryInstruction,address.deliveryInstruction);assert.equal(quoted.data.quote.payment.label,'Everyday mock card');
 const ordered=await send(postCommerce,cookies,{action:'checkout',...input,quoteId:quoted.data.quote.id,requestId:'configured-checkout'});assert.equal(ordered.status,200);assert.equal(ordered.data.order.payment.sample,true);assert.equal(ordered.data.profile.xp,initial.data.profile.xp);
 await send(postAccount,cookies,{...address,line:'A different fictional place',deliveryInstruction:'New door note'});
 await send(postAccount,cookies,{action:'deleteAddress',id:addressId});await send(postAccount,cookies,{action:'deletePayment',id:paymentId});
 const after=await send(getCommerce,cookies);assert.equal(after.data.commerce.orders[0].address.line,address.line);assert.equal(after.data.commerce.orders[0].deliveryInstruction,address.deliveryInstruction);assert.equal(after.data.commerce.orders[0].payment.label,'Everyday mock card');
 assert(after.data.account.addresses.some((row:{id:string})=>row.id===after.data.account.defaultAddressId));assert(after.data.account.payments.some((row:{id:string})=>row.id===after.data.account.defaultPaymentId));
}));

test('account setup validates lengths and IDs, rejects payment secrets, and keeps one usable default',{concurrency:false},async()=>isolated(async()=>{
 const cookies=new Map<string,string>();await send(getAccount,cookies);const id=randomUUID();
 const payment={action:'savePayment',id,label:'Mock card',kind:'card',makeDefault:true};
 for(const extra of [{cardNumber:'4242424242424242'},{cvv:'123'},{last4:'9999'},{sample:false}])assert.equal((await send(postAccount,cookies,{...payment,...extra})).status,400);
 assert.equal((await send(postAccount,cookies,{...payment,label:'4242 4242 4242 4242'})).status,400);
 assert.equal((await send(postAccount,cookies,{...payment,id:'not-a-saved-method'})).status,400);
 assert.equal((await send(postAccount,cookies,{action:'saveAddress',id:randomUUID(),label:' ',line:'Demo road',area:'Demo area',postcode:'00000',deliveryInstruction:'x',dawnEligible:false,makeDefault:false})).status,400);
 assert.equal((await send(postAccount,cookies,{action:'saveAddress',id:randomUUID(),label:'Home',line:'Demo road',area:'Demo area',postcode:'00000',deliveryInstruction:'x'.repeat(241),dawnEligible:false,makeDefault:false})).status,400);
 assert.equal((await send(postAccount,cookies,{action:'deleteAddress',id:'sample-studio'})).status,200);
 assert.equal((await send(postAccount,cookies,{action:'deleteAddress',id:'sample-home'})).data.code,'LAST_ADDRESS');
 assert.equal((await send(postAccount,cookies,{action:'deletePayment',id:'demo-card'})).status,200);
 assert.equal((await send(postAccount,cookies,{action:'deletePayment',id:'coopy-pay'})).data.code,'LAST_PAYMENT');
 const loaded=await send(getAccount,cookies);assert.equal(loaded.data.account.defaultAddressId,'sample-home');assert.equal(loaded.data.account.defaultPaymentId,'coopy-pay');assert.equal(loaded.data.account.payments[0].last4,'0007');
}));

test('editing checkout details invalidates an earlier quote before any approval',{concurrency:false},async()=>isolated(async()=>{
 const cookies=new Map<string,string>();await send(getAccount,cookies);await withAccountSession(request(cookies),async session=>{session.profile.rehearsalClock='day';session.profile=addDecision(session.profile,'mugs','stale account quote',day).profile;});
 const loaded=await send(getCommerce,cookies),input={decisionIds:[loaded.data.profile.decisions[0].id],addressId:loaded.data.account.defaultAddressId,paymentMethodId:loaded.data.account.defaultPaymentId,deliveryKind:'rocket',deliveryInstruction:''};
 const quote=await send(postCommerce,cookies,{action:'quote',...input});assert.equal(quote.status,200);
 const old=loaded.data.account.addresses[0];const edited=await send(postAccount,cookies,{action:'saveAddress',id:old.id,label:old.label,line:'Edited sample street',area:old.area,postcode:old.postcode,dawnEligible:old.dawnEligible,deliveryInstruction:'Changed door note',makeDefault:true});assert.equal(edited.status,200);
 const denied=await send(postCommerce,cookies,{action:'checkout',...input,quoteId:quote.data.quote.id,requestId:'stale-address'});assert.equal(denied.status,409);assert.equal(denied.data.code,'CHECKOUT_CHANGED');
 const after=await send(getCommerce,cookies);assert.equal(after.data.commerce.orders.length,0);assert.equal(after.data.profile.decisions[0].approvedAt,null);
}));
