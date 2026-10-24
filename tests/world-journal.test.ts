import {fixtureBlueprint} from './fixtures/blueprint';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createProfile,deleteMemory,sanitizeProfileForAI} from '../lib/profile';
import {remember} from '../lib/memory';
import {updateWorldJournal} from '../lib/server/world-journal';
import {generateWorld} from '../lib/server/world';
import {structuredCall} from '../lib/server/llm';
import {saveProfile} from '../lib/server/store';
import {POST as journalRoute} from '../app/api/world/journal/route';

const now=new Date('2026-10-25T01:00:00.000Z');
function profile(){
  let value=createProfile(randomUUID(),now);
  value=remember(value,{id:'mornings',text:'I make matcha in the morning.',source:'from our first call',confidence:0.9,kind:'call'},now);
  value.journey={hatched:true,interviewCount:5,interviewComplete:true,nextQuestion:'',processedCallIds:[],districts:[{id:'morning-room',name:'Your Mornings',provenance:'from your story',sourceMemoryIds:['mornings'],scene:{kind:'kitchen',name:'Your Mornings',explanation:'A place for tea.',items:[{skuId:'matcha',oneLiner:'For your tea.'},{skuId:'mugs',oneLiner:'A pair of cups.'}]},createdAt:'2026-10-24T01:00:00.000Z'}]};
  return value;
}

test('journal entries snapshot the current room and never become memory, AI input, XP or purchases',()=>{
  const initial=profile();
  const result=updateWorldJournal(initial,{action:'add',districtId:'morning-room',requestId:'private-note',text:'  We sat here and watched the rain.  '},now);
  const entry=result.district!.journal![0];
  assert.equal(entry.text,'We sat here and watched the rain.');
  assert.equal(entry.districtName,'Your Mornings');assert.deepEqual(entry.scene,initial.journey!.districts[0].scene);
  assert.notEqual(entry.scene,result.district!.scene);assert.equal(entry.createdAt,now.toISOString());
  assert.deepEqual(result.profile.memoryLines,initial.memoryLines);assert.equal(result.profile.xp,initial.xp);
  assert.deepEqual(result.profile.owned,initial.owned);assert.deepEqual(result.profile.decisions,[]);
  assert(!JSON.stringify(sanitizeProfileForAI(result.profile)).includes('watched the rain'));
  assert.equal(initial.journey!.districts[0].journal,undefined);
  result.district!.scene.name='A changed room';assert.equal(entry.scene.name,'Your Mornings');
});

test('journal retries are idempotent, including an old add retried after its note is deleted',()=>{
  const input={action:'add' as const,districtId:'morning-room',requestId:'same-note',text:'A tiny good moment.'};
  const first=updateWorldJournal(profile(),input,now);
  const duplicate=updateWorldJournal(first.profile,input,now);
  assert.equal(duplicate.district!.journal!.length,1);assert.equal(duplicate.profile.revision,first.profile.revision);
  const erased=updateWorldJournal(first.profile,{action:'delete',districtId:'morning-room',requestId:'erase-note',entryId:first.district!.journal![0].id},now);
  assert.deepEqual(erased.district!.journal,[]);
  const lateRetry=updateWorldJournal(erased.profile,input,now);
  assert.deepEqual(lateRetry.district!.journal,[]);assert.equal(lateRetry.profile.revision,erased.profile.revision);
});

test('journal enforces text and entry limits and cannot restore a district removed by memory deletion',()=>{
  const initial=profile();
  for(const text of ['','   ','a'.repeat(1001)])assert.throws(()=>updateWorldJournal(initial,{action:'add',districtId:'morning-room',requestId:'bad',text},now),/1,000/);
  let full=initial;
  for(let i=0;i<100;i++)full=updateWorldJournal(full,{action:'add',districtId:'morning-room',requestId:'note-'+i,text:'Moment '+i},now).profile;
  assert.equal(full.journey!.districts[0].journal!.length,100);
  assert.throws(()=>updateWorldJournal(full,{action:'add',districtId:'morning-room',requestId:'too-many',text:'One more'},now),/100 notes/);
  const forgotten=deleteMemory(full,'mornings',now);
  assert.equal(forgotten.journey!.districts.length,0);
  assert.equal(forgotten.journey!.archivedJournals![0].entries.length,100);
  assert.throws(()=>updateWorldJournal(forgotten,{action:'add',districtId:'morning-room',requestId:'restore',text:'Bring it back'},now),/no longer exists/);
});

test('forgetting a source archives manual snapshots idempotently without preserving unsaved recommendations',async()=>{
  const first=updateWorldJournal(profile(),{action:'add',districtId:'morning-room',requestId:'first-moment',text:'Private diary: my rainy-day celebration.'},now);
  const second=updateWorldJournal(first.profile,{action:'add',districtId:'morning-room',requestId:'second-moment',text:'Another small moment.'},now);
  // Simulate an existing archive entry and a later unsaved scene change.
  second.profile.journey!.archivedJournals=[{id:'morning-room',name:'Your Mornings',entries:[structuredClone(first.district!.journal![0])]}];
  second.district!.scene.explanation='UNSAVED RECOMMENDATIONS MUST DISAPPEAR';
  let forgotten=deleteMemory(second.profile,'mornings',now);
  assert.equal(forgotten.journey!.districts.length,0);
  const archive=forgotten.journey!.archivedJournals![0];
  assert.equal(archive.entries.length,2);assert.equal(archive.name,'Your Mornings');
  assert(archive.entries[0].text.includes('rainy-day celebration'));
  assert(!JSON.stringify(archive).includes('UNSAVED RECOMMENDATIONS'));
  assert.deepEqual(Object.keys(archive).sort(),['entries','id','name']);
  assert.deepEqual(deleteMemory(forgotten,'mornings',now).journey!.archivedJournals,forgotten.journey!.archivedJournals);
  forgotten=remember(forgotten,{id:'desk-now',text:'I now want a quiet writing desk.',source:'from your call, today',confidence:0.95,kind:'call'},now);
  let modelInput='';
  const call=(async(request:Parameters<typeof structuredCall>[0])=>{
    modelInput=JSON.stringify(request.input);
    const district=(name:string)=>({blueprint:fixtureBlueprint(['organizer','smallLamp']),name,explanation:'For your writing.',sourceMemoryIds:['memory-1'],items:[{skuId:'organizer',oneLiner:'For pencils.'},{skuId:'smallLamp',oneLiner:'A little light.'}]});
    return{data:request.validate({districts:[district('Your Desk'),district('Your Ideas')]}),meta:{cached:false,offline:false,model:'fixture',inputTokens:0,outputTokens:0,latencyMs:1,cacheKey:'fixture'}};
  }) as typeof structuredCall;
  const next=await generateWorld(forgotten,{requestId:'after-forgetting'},{call});
  assert.equal(next.districts.length,2);assert.equal(next.profile.journey!.archivedJournals![0].entries.length,2);
  assert(!modelInput.includes('I make matcha in the morning.'));
  assert(!modelInput.includes('rainy-day celebration'));
  assert(!modelInput.includes('Your Mornings'));
});

test('archived notes can be erased with the existing delete contract and cannot resurrect on retries',()=>{
  const saved=updateWorldJournal(profile(),{action:'add',districtId:'morning-room',requestId:'archive-note',text:'A memory I wrote myself.'},now);
  const entryId=saved.district!.journal![0].id,forgotten=deleteMemory(saved.profile,'mornings',now);
  const input={action:'delete' as const,districtId:'morning-room',requestId:'erase-archive',entryId};
  const erased=updateWorldJournal(forgotten,input,now);
  assert.deepEqual(erased.profile.journey!.archivedJournals,[]);assert.deepEqual(erased.profile.journey!.districts,[]);
  const retried=updateWorldJournal(erased.profile,input,now);
  assert.equal(retried.profile.revision,erased.profile.revision);
  assert.deepEqual(retried.profile.journey!.archivedJournals,[]);
  const oldAdd=updateWorldJournal(erased.profile,{action:'add',districtId:'morning-room',requestId:'archive-note',text:'A memory I wrote myself.'},now);
  assert.deepEqual(oldAdd.profile.journey!.archivedJournals,[]);assert.deepEqual(oldAdd.profile.journey!.districts,[]);
});

test('district rebuild preserves creation date and independent historical scene snapshots without sending notes to AI',async()=>{
  const saved=updateWorldJournal(profile(),{action:'add',districtId:'morning-room',requestId:'remember-this',text:'Private diary text: a quiet rainy morning.'},now);
  let actualInput='';
  const call=(async(request:Parameters<typeof structuredCall>[0])=>{
    actualInput=JSON.stringify(request.input);
    const output={districts:[{blueprint:fixtureBlueprint(['matcha','glass']),name:'Your Quieter Mornings',explanation:'A little simpler.',sourceMemoryIds:['memory-1'],items:[{skuId:'matcha',oneLiner:'Tea for the morning.'},{skuId:'glass',oneLiner:'Clear cups.'}]}]};
    return{data:request.validate(output),meta:{cached:false,offline:false,model:'fixture',inputTokens:0,outputTokens:0,latencyMs:1,cacheKey:'fixture'}};
  }) as typeof structuredCall;
  const rebuilt=await generateWorld(saved.profile,{requestId:'new-room',districtId:'morning-room',command:'Make this morning corner simpler'},{call});
  const current=rebuilt.districts[0];
  assert.equal(current.createdAt,saved.district!.createdAt);assert.equal(current.scene.name,'Your Quieter Mornings');
  assert.deepEqual(current.journal,saved.district!.journal);assert.equal(current.journal![0].scene.name,'Your Mornings');
  assert(!actualInput.includes('Private diary text'));assert(!actualInput.includes('remember-this'));
});

test('journal route persists server-captured snapshots and rejects malformed or cross-origin writes', {concurrency:false},async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'coopy-journal-')),previous=process.env.COUPI_DATA_DIR;
  try{
    process.env.COUPI_DATA_DIR=root;
    const initial=profile();await saveProfile(initial);
    const send=async(body:unknown,origin='http://localhost:3007',id=initial.id)=>{
      const response=await journalRoute(new Request('http://localhost:3007/api/world/journal',{method:'POST',headers:{'content-type':'application/json',origin,cookie:'coupi_profile='+id},body:JSON.stringify(body)}));
      return{status:response.status,body:await response.json()};
    };
    const first=await send({action:'add',districtId:'morning-room',requestId:'route-note',text:'An ordinary, lovely morning.',scene:{name:'Injected scene',items:[{skuId:'fake'}]},districtName:'Forged name'});
    assert.equal(first.status,200);assert.equal(first.body.district.journal[0].districtName,'Your Mornings');
    assert.equal(first.body.district.journal[0].scene.name,'Your Mornings');
    assert.equal(first.body.profile.xp,initial.xp);assert.deepEqual(first.body.profile.decisions,[]);
    const persisted=JSON.parse(await readFile(path.join(root,initial.id+'.json'),'utf8'));
    assert.equal(persisted.journey.districts[0].journal[0].text,'An ordinary, lovely morning.');
    const retry=await send({action:'add',districtId:'morning-room',requestId:'route-note',text:'An ordinary, lovely morning.'});
    assert.equal(retry.body.district.journal.length,1);
    assert.equal((await send({action:'add',districtId:'morning-room',requestId:'long',text:'x'.repeat(1001)})).status,400);
    assert.equal((await send({action:'add',districtId:'morning-room',requestId:'cross-origin',text:'Do not save'},'https://elsewhere.example')).status,403);
    assert.equal((await send({action:'add',districtId:'morning-room',requestId:'other-browser',text:'Do not save'},'http://localhost:3007',randomUUID())).status,404);
    const deleted=await send({action:'delete',districtId:'morning-room',requestId:'delete-route-note',entryId:first.body.district.journal[0].id});
    assert.equal(deleted.status,200);assert.deepEqual(deleted.body.district.journal,[]);
    const later=await send({action:'add',districtId:'morning-room',requestId:'archive-route-note',text:'Keep this journal while forgetting the inference.'});
    const archived=deleteMemory(later.body.profile,'mornings');await saveProfile(archived);
    const archiveDelete={action:'delete',districtId:'morning-room',requestId:'delete-archived-route-note',entryId:later.body.district.journal[0].id};
    const cleared=await send(archiveDelete);
    assert.equal(cleared.status,200);assert.deepEqual(cleared.body.profile.journey.archivedJournals,[]);
    assert.equal((await send(archiveDelete)).status,200);
  }finally{
    if(previous===undefined)delete process.env.COUPI_DATA_DIR;else process.env.COUPI_DATA_DIR=previous;
    await rm(root,{recursive:true,force:true});
  }
});
