import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHomeDemoAction,buildDemoHome,buildLiveHome,createHomeDemo,HOME_SCENARIOS,homeReferences,referenceById} from '../lib/home-feed';
import {createProfile} from '../lib/profile';
import {getSku} from '../lib/catalog';
import type {Decision} from '../lib/types';

const now=new Date('2026-10-26T02:00:00Z');
const decision=(skuId:string,index=0):Decision=>({id:'plan-'+skuId,skuId,source:'your call',addedAt:new Date(now.getTime()-index*1000).toISOString(),lockedUntil:null,approvedAt:null});

test('live home is driven by profile facts and never manufactures retailer deliveries',()=>{
  const profile=createProfile('home',now);profile.decisions=[decision('kettle')];
  const before=structuredClone(profile),feed=buildLiveHome(profile,now);
  assert.equal(feed.cards.length,1);assert.equal(feed.cards[0].sku?.id,'kettle');assert.equal(feed.cards[0].demo,false);
  assert.match(feed.brief,/needs your OK/);assert.doesNotMatch(JSON.stringify(feed),/arriv|delivered|on its way/i);
  assert.deepEqual(profile,before);
  profile.decisions[0].approvedAt=now.toISOString();
  const approved=buildLiveHome(profile,now);assert.equal(approved.cards[0].kind,'receipt');assert.match(approved.cards[0].line,/no order or payment/);assert.match(approved.brief,/nothing was purchased/);
});

test('night locks are represented honestly and never presented as ready to approve',()=>{
  const profile=createProfile('night',now);profile.pretend2am=true;profile.decisions=[{...decision('kettle'),lockedUntil:'2026-10-26T07:00:00+09:00'}];
  const home=buildLiveHome(profile,now);
  assert.equal(home.mood,'night');assert.equal(home.cards[0].locked,true);assert.equal(home.cards[0].action,'See the plan');assert.match(home.brief,/held until morning/);assert.doesNotMatch(home.brief,/needs your OK/);
});

test('quarantined items are excluded before the three-card limit and brief count',()=>{
  const profile=createProfile('private',now);profile.quarantine.push({category:getSku('kettle')!.category,sensitive:true,note:'test quarantine'});
  profile.decisions=[decision('kettle'),decision('socks'),decision('lamp')];
  const home=buildLiveHome(profile,now);assert(!home.cards.some(card=>card.sku?.id==='kettle'));assert.equal(home.pendingCount,2);
});

test('live priorities keep pending choices ahead of receipts, with at most three cards',()=>{
  const profile=createProfile('priorities',now);profile.decisions=['kettle','mugs','socks','lamp'].map((id,index)=>decision(id,index));
  profile.decisions[3].approvedAt=now.toISOString();
  const home=buildLiveHome(profile,now);assert.equal(home.cards.length,3);assert(home.cards.every(card=>card.kind==='decision'));assert.equal(home.pendingCount,3);
});

test('a plan with an invalid or watching quote does not get a ready-for-approval brief',()=>{
  const profile=createProfile('watching',now);profile.decisions=[{...decision('kettle'),delegation:{budgetCap:100,watchPrice:true,haggle:false,bundle:false,scheduleDelivery:false,status:'watching',quotedPrice:100,discount:0,floorPrice:100,bundledDecisionIds:[],deliveryPlan:null,checkedAt:now.toISOString(),simulation:true}}];
  assert.doesNotMatch(buildLiveHome(profile,now).brief,/needs your OK/);assert.match(buildLiveHome(profile,now).brief,/limits/);
});

test('prepared story priorities suppress nudges on a delivery issue and cap the feed at two',()=>{
  const home=buildDemoHome(createHomeDemo('problem'));
  assert.equal(home.cards.length,2);assert.equal(home.cards[0].kind,'problem');assert.equal(home.cards[1].kind,'decision');assert(home.cards.every(card=>card.demo));assert(!home.cards.some(card=>card.kind==='nudge'));
});

test('prepared swaps use sourced reference price differences and only mutate isolated story data',()=>{
  const input=createHomeDemo('problem'),before=structuredClone(input),next=applyHomeDemoAction(input,{kind:'swap',orderId:'1044'});
  assert.deepEqual(input,before);assert.equal(next.orders.find(order=>order.id==='1044')!.itemId,'7950092256');assert.equal(next.orders.find(order=>order.id==='1044')!.status,'packed');
  assert.equal(referenceById('7950092256')!.price!-referenceById('20145368')!.price!,7530);
  assert(!buildDemoHome(next).cards.some(card=>card.kind==='problem'));
  assert(!('profile'in next));assert(!('owned'in next));
});

test('ratings dismiss followups without becoming catalog reviews, and nudge review is actionable',()=>{
  const initial=createHomeDemo('normal'),count=homeReferences.length;
  const approved=applyHomeDemoAction(initial,{kind:'approve',itemId:'7612276799'}),rated=applyHomeDemoAction(approved,{kind:'rate',orderId:'1042',rating:2});
  assert(!buildDemoHome(rated).cards.some(card=>card.kind==='followup'));assert(buildDemoHome(rated).cards.some(card=>card.id==='saved:7185725748'));
  const saved=applyHomeDemoAction(rated,{kind:'save',itemId:'7185725748'}),home=buildDemoHome(saved);
  assert(home.cards.some(card=>card.kind==='decision'&&card.reference?.id==='7185725748'));
  assert.match(home.brief,/lipstick still needs/);assert.doesNotMatch(home.brief,/glasses/);assert.equal(homeReferences.length,count);
  assert.equal(applyHomeDemoAction(initial,{kind:'rate',orderId:'1042',rating:9}).orders.find(order=>order.id==='1042')!.rated,undefined);
});

test('briefs only mention arrivals that remain in their displayed card evidence',()=>{
  const demo=createHomeDemo('normal');demo.orders=[];
  assert.doesNotMatch(buildDemoHome(demo).brief,/lamp|on its way/);
  const held=createHomeDemo('night'),removed=applyHomeDemoAction(held,{kind:'remove-held',itemId:'7322824636'});
  assert.equal(buildDemoHome(removed).cards.length,0);assert.doesNotMatch(buildDemoHome(removed).brief,/lipstick|held/);
});

test('all prepared states keep briefs brief, use real local reference images and valid external sources',()=>{
  for(const state of HOME_SCENARIOS){const feed=buildDemoHome(createHomeDemo(state.id));assert(feed.brief.split(/\s+/).length<=25);assert(feed.cards.length<=3);
    for(const card of feed.cards){assert(card.reference);assert.match(card.reference.image,/^\/live-call\/products\//);assert.match(card.reference.url,/^https:\/\/www\.coupang\.com\/vp\/products\//);assert(!card.reference.url.includes('/live-call/'));}
  }
  for(const scenario of ['normal','night','quiet'] as const){const profile=createProfile(scenario,now);profile.pretend2am=scenario==='night';assert(buildLiveHome(profile,now).brief.split(/\s+/).length<=25);}
});
