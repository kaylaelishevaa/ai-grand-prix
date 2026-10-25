import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Miniflare} from 'miniflare';
import {ResponseCache,requestHash,type CacheEntry} from '../lib/server/cache';
import {structuredCall} from '../lib/server/llm';
import {withRuntimeEnv} from '../lib/server/runtime';

test('Worker response cache persists and replaces entries in D1, with no filesystem writes',async t=>{
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
  t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');
  await db.exec('CREATE TABLE response_cache (hash TEXT PRIMARY KEY, json TEXT NOT NULL, created_at TEXT NOT NULL)');
  const directory=await mkdtemp(path.join(tmpdir(),'coupi-worker-cache-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const key=requestHash({operation:'test-worker'});
  const entry:CacheEntry<{answer:string}>={version:1,output:{answer:'First'},meta:{cached:false,offline:false,model:'test',inputTokens:1,outputTokens:2,latencyMs:3,cacheKey:key},createdAt:'2026-10-25T00:00:00.000Z'};
  await withRuntimeEnv({DB:db,COUPI_CACHE_DIR:directory},async()=>{
    const cache=new ResponseCache();
    assert.equal(await cache.get(key),null);
    await cache.set(key,entry);
    assert.deepEqual(await new ResponseCache().get(key),entry);
    const updated={...entry,output:{answer:'Updated'},createdAt:'2026-10-25T01:00:00.000Z'};
    await cache.set(key,updated);
    assert.deepEqual(await cache.get(key),updated);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM response_cache').first<{count:number}>())?.count,1);
    assert.equal((await db.prepare('SELECT created_at FROM response_cache WHERE hash = ?').bind(key).first<{created_at:string}>())?.created_at,updated.createdAt);
    await db.prepare('UPDATE response_cache SET json = ? WHERE hash = ?').bind('{broken',key).run();
    assert.equal(await cache.get(key),null);
    await db.prepare('UPDATE response_cache SET json = ? WHERE hash = ?').bind('{"version":2}',key).run();
    assert.equal(await cache.get(key),null);
    await assert.rejects(cache.get('../invalid'),/Invalid cache key/);
    await assert.rejects(cache.set('../invalid',entry),/Invalid cache key/);
  });
  assert.deepEqual(await readdir(directory),[]);
  await withRuntimeEnv({},async()=>{
    const cache=new ResponseCache(directory);
    await assert.rejects(cache.get(key),/database binding DB/);
    await assert.rejects(cache.set(key,entry),/database binding DB/);
  });
  assert.deepEqual(await readdir(directory),[]);
});

test('model calls use Worker secrets and replay D1 responses without a second API request',async t=>{
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
  t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');
  await db.exec('CREATE TABLE response_cache (hash TEXT PRIMARY KEY, json TEXT NOT NULL, created_at TEXT NOT NULL)');
  const original=process.env.OPENAI_API_KEY;
  const logs:unknown[][]=[];t.mock.method(console,'info',(...args:unknown[])=>{logs.push(args);});
  let calls=0;
  const fetchMock=(async(_url:unknown,init?:RequestInit)=>{
    calls++;
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer TEST_WORKER_CREDENTIAL');
    assert.equal(JSON.parse(String(init?.body)).model,'worker-test-model');
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{"answer":"Cached in D1"}'}]}],usage:{input_tokens:5,output_tokens:4}});
  }) as typeof fetch;
  const request={operation:'worker_answer',instructions:'Test fixture',input:{query:'lamp'},schema:{type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false},validate:(value:unknown)=>{
    assert(value&&typeof value==='object'&&'answer'in value&&typeof value.answer==='string');return{answer:value.answer};
  }};
  await withRuntimeEnv({DB:db,OPENAI_MODEL:'worker-test-model',OPENAI_API_KEY:'TEST_WORKER_CREDENTIAL',DEMO_OFFLINE:'0'},async()=>{
    const live=await structuredCall(request,{fetch:fetchMock});
    assert.equal(live.meta.cached,false);
  });
  await withRuntimeEnv({DB:db,OPENAI_MODEL:'worker-test-model',OPENAI_API_KEY:undefined,DEMO_OFFLINE:'1'},async()=>{
    const replay=await structuredCall(request,{fetch:fetchMock});
    assert.equal(replay.data.answer,'Cached in D1');
    assert.equal(replay.meta.cached,true);assert.equal(replay.meta.offline,true);
    assert.equal(replay.meta.inputTokens+replay.meta.outputTokens,0);
  });
  assert.equal(calls,1);
  assert.equal(process.env.OPENAI_API_KEY,original);
  assert(!JSON.stringify(logs).includes('TEST_WORKER_CREDENTIAL'));
});
