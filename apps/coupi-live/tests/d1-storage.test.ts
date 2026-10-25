import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {withRuntimeEnv,type D1Database} from '../lib/server/runtime';
import {loadSession,saveProfile,sessionResponse,withSession} from '../lib/server/store';
import {accountResponse,householdSpentThisMonth,loadMemberProfile,withAccountSession} from '../lib/server/account-store';
import {createProfile} from '../lib/profile';
import {AppError} from '../lib/server/errors';

const request=(id?:string,accountId?:string)=>new Request('https://coupi.example/api/profile',{headers:{cookie:[id&&`coupi_profile=${id}`,accountId&&`coupi_household=${accountId}`].filter(Boolean).join('; ')}});
const conflict=(error:unknown)=>error instanceof AppError&&error.code==='SESSION_CONFLICT'&&error.status===409;
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>resolve=done);return{promise,resolve};};

test('real D1 storage preserves sessions and atomically rejects stale multi-document writes',async t=>{
 const mf=new Miniflare({modules:true,script:'export default { fetch() { return new Response("storage test"); } };',compatibilityDate:'2026-05-15',d1Databases:['DB']});
 t.after(()=>mf.dispose());
 const DB=await mf.getD1Database('DB') as unknown as D1Database;
 const migration=await readFile(new URL('../../../drizzle/0000_coupi_storage.sql',import.meta.url),'utf8');
 for(const statement of migration.split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean))await DB.prepare(statement).run();
 const run=<T>(task:()=>Promise<T>)=>withRuntimeEnv({DB},task);

 await t.test('profiles persist between request contexts, remain isolated, and unchanged reads do not write',async()=>{
  const first=await run(()=>withSession(request(),async session=>{session.profile.budget=73000;}));
  const second=await run(()=>withSession(request(),async session=>{session.profile.budget=24000;}));
  assert.notEqual(first.session.id,second.session.id);
  assert.equal((await run(()=>loadSession(request(first.session.id)))).profile.budget,73000);
  assert.equal((await run(()=>loadSession(request(second.session.id)))).profile.budget,24000);
  const before=await DB.prepare('SELECT storage_version FROM profiles WHERE id = ?').bind(first.session.id).first<{storage_version:number}>();
  await run(()=>withSession(request(first.session.id),async()=>{}));
  assert.deepEqual(await DB.prepare('SELECT storage_version FROM profiles WHERE id = ?').bind(first.session.id).first(),before);
  assert.match(sessionResponse({},first.session).headers.get('set-cookie')!,/; Secure(?:;|$)/);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM profiles').first<{n:number}>())!.n,2);
 });

 await t.test('standalone saveProfile remains compatible and missing Worker binding never falls back to files',async()=>{
  const profile=createProfile(randomUUID());profile.budget=64000;
  await run(()=>saveProfile(profile));assert.equal((await run(()=>loadSession(request(profile.id)))).profile.budget,64000);
  await assert.rejects(withRuntimeEnv({},()=>loadSession(request())),error=>error instanceof AppError&&error.code==='DATABASE_NOT_CONFIGURED');
 });

 await t.test('parallel profile edits conflict without rerunning either callback',async()=>{
  const initial=await run(()=>withSession(request(),async()=>{})),gate=deferred(),both=deferred();let started=0,executions=0;
  const change=(budget:number)=>run(()=>withSession(request(initial.session.id),async session=>{executions++;if(++started===2)both.resolve();await gate.promise;session.profile.budget=budget;}));
  const left=change(11000),right=change(22000);await both.promise;gate.resolve();
  const results=await Promise.allSettled([left,right]);assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
  const rejected=results.find(row=>row.status==='rejected') as PromiseRejectedResult;assert(conflict(rejected.reason));assert.equal(executions,2);
  assert([11000,22000].includes((await run(()=>loadSession(request(initial.session.id)))).profile.budget));
  assert.equal((await DB.prepare('SELECT storage_version FROM profiles WHERE id = ?').bind(initial.session.id).first<{storage_version:number}>())!.storage_version,1);
 });

 await t.test('household creation, member index recovery and cookies persist without exposing another household',async()=>{
  const first=await run(()=>withAccountSession(request(),async()=>{}));
  const recovered=await run(()=>withAccountSession(request(first.session.id),async()=>{}));
  assert.equal(recovered.account.id,first.account.id);assert.equal(first.account.members.length,2);
  const other=await run(()=>loadMemberProfile(first.account.members[1].profileId));assert.equal(other.memoryLines.length,0);assert.equal(other.owned.length,0);
  assert(accountResponse({},first).headers.getSetCookie().every(value=>value.includes('; Secure')));
  await assert.rejects(run(()=>withAccountSession(request(randomUUID(),first.account.id),async()=>{})),error=>error instanceof AppError&&error.status===403);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM account_members WHERE account_id = ?').bind(first.account.id).first<{n:number}>())!.n,2);
 });

 await t.test('stale household commit rolls back account and current profile when another member changes',async()=>{
  const initial=await run(()=>withAccountSession(request(),async()=>{})),otherId=initial.account.members[1].profileId;
  const read=deferred(),resume=deferred();let executions=0;
  const pending=run(()=>withAccountSession(request(initial.session.id,initial.account.id),async(session,account)=>{
   executions++;await householdSpentThisMonth(account,new Date(),session.profile);session.profile.budget=19000;account.householdBudget=23000;read.resolve();await resume.promise;
  }));
  await read.promise;await run(()=>withSession(request(otherId),async session=>{session.profile.budget=31000;}));resume.resolve();
  await assert.rejects(pending,conflict);assert.equal(executions,1);
  const after=await run(()=>withAccountSession(request(initial.session.id,initial.account.id),async()=>{}));
  assert.equal(after.session.profile.budget,initial.session.profile.budget);assert.equal(after.account.householdBudget,initial.account.householdBudget);
  assert.equal((await run(()=>loadMemberProfile(otherId))).budget,31000);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM profiles WHERE id LIKE 'transaction-guard-%'").first<{n:number}>())!.n,0);
 });

 await t.test('failed first household callback leaves no profile, household or member rows',async()=>{
  const counts=async()=>Promise.all(['profiles','accounts','account_members'].map(table=>DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{n:number}>()));
  const before=await counts();await assert.rejects(run(()=>withAccountSession(request(),async()=>{throw new Error('cancelled');})),/cancelled/);assert.deepEqual(await counts(),before);
 });

 await t.test('a later SQL failure rolls back an earlier profile write in the same batch',async()=>{
  const initial=await run(()=>withAccountSession(request(),async()=>{}));
  await DB.prepare(`CREATE TRIGGER reject_account_test BEFORE UPDATE ON accounts WHEN NEW.id = '${initial.account.id}' BEGIN SELECT RAISE(ABORT, 'forced account persistence failure'); END`).run();
  try{
   await assert.rejects(run(()=>withAccountSession(request(initial.session.id,initial.account.id),async(session,account)=>{
    session.profile.budget=18000;await saveProfile(session.profile);account.householdBudget=29000;
   })),/forced account persistence failure/);
   assert.equal((await run(()=>loadSession(request(initial.session.id)))).profile.budget,initial.session.profile.budget);
   const stored=await DB.prepare('SELECT json FROM accounts WHERE id = ?').bind(initial.account.id).first<{json:string}>();assert.equal(JSON.parse(stored!.json).householdBudget,initial.account.householdBudget);
  }finally{await DB.prepare('DROP TRIGGER reject_account_test').run();}
 });
});
