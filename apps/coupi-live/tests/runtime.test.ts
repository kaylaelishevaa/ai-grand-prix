import test from 'node:test';
import assert from 'node:assert/strict';
import {isWorkerRuntime,runtimeEnv,withRuntimeEnv,workerDatabase} from '../lib/server/runtime';

test('request environment overrides Node defaults without changing process.env',async t=>{
  const key='COUPI_RUNTIME_TEST_FALLBACK',previous=process.env[key];
  process.env[key]='node-default';
  t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous;});
  assert.equal(runtimeEnv()[key],'node-default');
  assert.equal(isWorkerRuntime(),false);
  await withRuntimeEnv({[key]:'request-value',OPENAI_MODEL:'worker-model'},async()=>{
    await Promise.resolve();
    assert.equal(runtimeEnv()[key],'request-value');
    assert.equal(runtimeEnv().OPENAI_MODEL,'worker-model');
    assert.equal(process.env[key],'node-default');
    assert.equal(isWorkerRuntime(),true);
    assert.equal(workerDatabase(),undefined);
  });
  assert.equal(runtimeEnv()[key],'node-default');
  assert.equal(isWorkerRuntime(),false);
});

test('overlapping requests retain their own secret and restore nested scopes',async()=>{
  const original=process.env.OPENAI_API_KEY;
  let release!:()=>void;
  const ready=new Promise<void>(resolve=>{release=resolve;});
  const first=withRuntimeEnv({OPENAI_API_KEY:'TEST_REQUEST_ONE'},async()=>{
    await ready;
    assert.equal(runtimeEnv().OPENAI_API_KEY,'TEST_REQUEST_ONE');
    assert.equal(withRuntimeEnv({OPENAI_API_KEY:'TEST_NESTED'},()=>runtimeEnv().OPENAI_API_KEY),'TEST_NESTED');
    assert.equal(runtimeEnv().OPENAI_API_KEY,'TEST_REQUEST_ONE');
  });
  const second=withRuntimeEnv({OPENAI_API_KEY:'TEST_REQUEST_TWO'},async()=>{
    release();await Promise.resolve();
    assert.equal(runtimeEnv().OPENAI_API_KEY,'TEST_REQUEST_TWO');
  });
  await Promise.all([first,second]);
  assert.equal(process.env.OPENAI_API_KEY,original);
  assert.equal(workerDatabase(),undefined);
  assert.equal(isWorkerRuntime(),false);
});
