import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile} from '../lib/profile';
import {addDecision,approveDecisions} from '../lib/guardrails';
import {assignDelegation,refreshDelegation} from '../lib/delegation';
import {decisionApprovalIssue,negotiationFloor} from '../lib/delegation-policy';

const now=new Date('2026-10-25T01:00:00.000Z');
const plan={skuId:'kettle',budgetCap:39000,watchPrice:true,haggle:true,bundle:true,scheduleDelivery:true};

test('delegation prepares a bounded simulated quote and never buys or awards XP',()=>{
  const profile=createProfile('delegate',now),assigned=assignDelegation(profile,plan,now);
  assert(assigned.decision);assert(!assigned.blocked);
  const delegation=assigned.decision.delegation!;
  assert.equal(delegation.status,'haggled');assert.equal(delegation.discount,4000);assert.equal(delegation.quotedPrice,35000);
  assert.equal(delegation.floorPrice,negotiationFloor(39000));assert.equal(delegation.simulation,true);
  assert.match(delegation.deliveryPlan!,/simulated/);
  assert.equal(assigned.profile.xp,profile.xp);assert.equal(assigned.profile.owned.length,profile.owned.length);
  assert.equal(assigned.decision.approvedAt,null);
  const approved=approveDecisions(assigned.profile,[assigned.decision.id],now);
  assert.equal(approved.approved.length,1);assert(approved.profile.owned.some(item=>item.skuId==='kettle'));
  assert.equal(approved.profile.xp,profile.xp);
  assert.match(assignDelegation(approved.profile,plan,now).blocked!,/already approved/);
});

test('watching below the floor cannot bypass the ordinary approval route',()=>{
  const profile=createProfile('watch',now),assigned=assignDelegation(profile,{...plan,budgetCap:10000},now);
  assert.equal(assigned.decision!.delegation!.status,'watching');
  assert.equal(assigned.decision!.delegation!.quotedPrice,35000);
  assert.deepEqual(approveDecisions(assigned.profile,[assigned.decision!.id],now).approved,[]);
  const refreshed=refreshDelegation(assigned.profile,assigned.decision!.id,now);
  assert.equal(refreshed.decision!.delegation!.status,'watching');
  assert.equal(refreshed.profile.decisions.length,1);
  assert.match(assignDelegation(profile,{...plan,budgetCap:10000,watchPrice:false},now).blocked!,/exceeds your cap/);
  assert.equal(assignDelegation(profile,{...plan,budgetCap:10000,watchPrice:false},now).profile.decisions.length,0);
});

test('price floors, status and caps are checked again at approval against tampered plans',()=>{
  const assigned=assignDelegation(createProfile('tamper',now),plan,now);
  for(const mutate of [
    (p:typeof assigned.profile)=>{p.decisions[0].delegation!.quotedPrice=1;},
    (p:typeof assigned.profile)=>{p.decisions[0].delegation!.floorPrice=1;},
    (p:typeof assigned.profile)=>{p.decisions[0].delegation!.budgetCap=1;},
    (p:typeof assigned.profile)=>{p.decisions[0].delegation!.discount=50000;},
    (p:typeof assigned.profile)=>{p.decisions[0].delegation!.haggle=false;},
  ]){
    const tampered=structuredClone(assigned.profile);mutate(tampered);
    assert(decisionApprovalIssue(tampered.decisions[0]));
    const result=approveDecisions(tampered,[tampered.decisions[0].id],now);
    assert.deepEqual(result.approved,[]);assert.equal(result.profile.owned.length,1);
  }
});

test('delegation retains sleep-on-it and anti-sell while bundle only groups pending cards',()=>{
  let profile=createProfile('guarded',now);
  profile=addDecision(profile,'mugs','call',now).profile;
  const mugId=profile.decisions[0].id;
  profile.pretend2am=true;
  const assigned=assignDelegation(profile,plan,now);
  assert(assigned.decision!.lockedUntil);
  assert.deepEqual(assigned.decision!.delegation!.bundledDecisionIds,[mugId]);
  assert.deepEqual(approveDecisions(assigned.profile,[assigned.decision!.id],now).approved,[]);
  assert.match(assignDelegation(profile,{...plan,skuId:'detergent'},now).blocked!,/3 weeks ago/);
  assert.match(assignDelegation(profile,{...plan,skuId:'skinCream'},now).blocked!,/quarantined/);
  const noHaggle=assignDelegation(createProfile('plain',now),{...plan,haggle:false},now);
  assert.equal(noHaggle.decision!.delegation!.status,'ready');
  assert.equal(noHaggle.decision!.delegation!.discount,0);
  assert.equal(negotiationFloor(6900),5900);
});
