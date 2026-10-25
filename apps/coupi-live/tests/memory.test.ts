import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfile,applySwipe,deleteMemory,sanitizeProfileForAI} from '../lib/profile';
import {remember,rememberWords,memoryConfidence,confirmMemory,rememberVerdictChoice,migrateMemory,reviewPreference} from '../lib/memory';
import {addDecision,removeDecision} from '../lib/guardrails';
import {personalizeVerdict} from '../lib/ranking';

const wednesday=new Date('2026-10-21T01:00:00Z');

test('tentative evidence decays in ranking and display, and reconfirmation restores it',()=>{
  let profile=createProfile('decay',wednesday);
  profile.lastVerdict={requestId:'demo',pickSkuId:'socksBudget',runnerUpSkuId:'socksRunner'};
  profile=rememberVerdictChoice(profile,'demo','socksRunner',wednesday);
  const line=profile.memoryLines[0],later=new Date('2026-12-21T01:00:00Z');
  assert(memoryConfidence(line,later)<0.1);
  assert.equal(reviewPreference(profile,later),undefined);
  const confirmed=confirmMemory(profile,line.id,later);
  assert.equal(memoryConfidence(confirmed.memoryLines[0],later),0.98);
  assert(reviewPreference(confirmed,later));
  assert.equal(confirmed.memoryLines[0].createdAt,wednesday.toISOString());
});

test('erasing a fact without traits works and retries cannot resurrect it',()=>{
  const initial=createProfile('facts',wednesday);
  const event={id:'inventory-1',text:'oat milk is low',source:'from your scan inventory',confidence:0.6,kind:'inventory'};
  const saved=remember(initial,event,wednesday);
  const erased=deleteMemory(saved,'inventory-1',wednesday);
  assert.equal(erased.memoryLines.length,0);
  assert.equal(remember(erased,event,wednesday).memoryLines.length,0);
  assert.equal(sanitizeProfileForAI(erased).memoryLines.length,0);
});

test('morning pattern needs three distinct mornings, not three cancellations in one morning',()=>{
  let profile=createProfile('mornings',wednesday);
  function cancel(skuId:string,night:string,morning:string){
    const added=addDecision(profile,skuId,'stroll',new Date(night));
    profile=removeDecision(added.profile,added.decision!.id,new Date(morning));
  }
  cancel('kettle','2026-10-20T14:00:00Z','2026-10-21T01:00:00Z');
  cancel('mugs','2026-10-20T14:01:00Z','2026-10-21T01:01:00Z');
  cancel('tray','2026-10-20T14:02:00Z','2026-10-21T01:02:00Z');
  assert(!profile.memoryLines.some(line=>line.kind==='pattern'));
  cancel('lamp','2026-10-21T14:00:00Z','2026-10-22T01:00:00Z');
  assert(!profile.memoryLines.some(line=>line.kind==='pattern'));
  cancel('vase','2026-10-22T14:00:00Z','2026-10-23T01:00:00Z');
  const pattern=profile.memoryLines.find(line=>line.kind==='pattern')!;
  assert.equal(pattern.text,'night adds often cancel');
  assert.equal(pattern.source,'from 3 mornings');
  assert.equal(profile.decisions.length,0);
  const erased=deleteMemory(profile,pattern.id);
  assert(!JSON.stringify(sanitizeProfileForAI(erased)).includes('night adds often cancel'));
});

test('stroll and duel swipes use the same writer, including ambiguous passes',()=>{
  let profile=createProfile('games',wednesday);
  for(const source of ['stroll deck','duel deck'])profile=applySwipe(profile,{id:source,skuId:'lamp',action:'skip',source},wednesday);
  assert.equal(profile.memoryLines.length,2);
  assert(profile.memoryLines.every(line=>line.confidence===0.35&&line.createdAt===wednesday.toISOString()));
  assert(profile.memoryLines[0].source.includes('stroll'));
  assert(profile.memoryLines[1].source.includes('duel'));
});

test('legacy saved lines migrate with a timestamp and confidence',()=>{
  const profile=createProfile('legacy',wednesday);
  profile.memoryLines=[{id:'old',text:'old memory',source:'from six swipes',batchId:'swipes-6',traitKeys:[]} as any];
  const migrated=migrateMemory(profile);
  assert.equal(migrated.memoryLines[0].confidence,0.65);
  assert.equal(migrated.memoryLines[0].createdAt,wednesday.toISOString());
});

test('explicit current price constraints remain stronger than a learned review preference',()=>{
  let profile=createProfile('price');
  profile=rememberWords(profile,'I prefer reviews over price','reviews','call');
  const verdict={pickSkuId:'socksBudget',runnerUpSkuId:'socksRunner',reason:'Budget socks meet the price limit.',dissent:'Pilling reported.',citations:['B04'],whyRunnerUpLost:'Costs more.',clarifyingQuestion:null};
  const result=personalizeVerdict(profile,verdict,'Red socks under ₩6,000');
  assert.equal(result.pickSkuId,'socksBudget');
  assert.match(result.reason,/explicit price constraint comes first/);
});

test('negated corrections and quarantined statements never become positive ranking traits',()=>{
  let profile=createProfile('negation');
  profile=rememberWords(profile,"I do not prefer reviews over price",'negation','ask');
  assert.equal(reviewPreference(profile),undefined);
  profile=rememberWords(profile,'I want cheap skin cream','quarantine','call');
  assert.equal(profile.traits['priority:price'],undefined);
  assert(!JSON.stringify(sanitizeProfileForAI(profile)).includes('skin cream'));
});
