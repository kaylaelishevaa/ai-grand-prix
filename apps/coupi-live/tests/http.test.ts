import test from 'node:test';
import assert from 'node:assert/strict';
import {requireLocalOrigin} from '../lib/server/http';
import {AppError} from '../lib/server/errors';

const request=(origin?:string,host?:string,extra:Record<string,string>={})=>new Request('http://localhost:3007/api/profile',{
  method:'POST',headers:{...extra,...(origin?{origin}:{}),...(host?{host}:{})},
});
const rejected=(value:Request)=>assert.throws(()=>requireLocalOrigin(value),(error:unknown)=>error instanceof AppError&&error.code==='ORIGIN_MISMATCH'&&error.status===403);

test('origin guard accepts the actual Host when Next canonicalizes its request URL',()=>{
  assert.doesNotThrow(()=>requireLocalOrigin(request('http://127.0.0.1:3007','127.0.0.1:3007')));
  assert.doesNotThrow(()=>requireLocalOrigin(request('http://localhost:3007','localhost:3007')));
});
test('origin guard falls back to the exact request URL when Host is absent',()=>{
  assert.doesNotThrow(()=>requireLocalOrigin(request('http://localhost:3007')));
  rejected(request('http://127.0.0.1:3007'));
});
test('origin guard rejects other hosts, ports, and protocols',()=>{
  rejected(request('https://unrelated.example','127.0.0.1:3007'));
  rejected(request('http://127.0.0.1:3000','127.0.0.1:3007'));
  rejected(request('https://127.0.0.1:3007','127.0.0.1:3007'));
  rejected(request('http://localhost:3007','127.0.0.1:3007'));
});
test('origin guard rejects malformed or opaque origins and malformed authorities',()=>{
  for(const origin of ['null','not a URL','http://127.0.0.1:3007/path','http://127.0.0.1:3007?x=1','http://127.0.0.1:3007,http://localhost:3007'])rejected(request(origin,'127.0.0.1:3007'));
  for(const host of ['127.0.0.1:3007/','127.0.0.1:3007@unrelated.example','127.0.0.1:3007,unrelated.example','127.0.0.1:3007?x=1'])rejected(request('http://127.0.0.1:3007',host));
});
test('origin guard never trusts forwarded host or protocol overrides',()=>{
  rejected(request('https://unrelated.example','127.0.0.1:3007',{'x-forwarded-host':'unrelated.example','x-forwarded-proto':'https'}));
  assert.doesNotThrow(()=>requireLocalOrigin(request('http://127.0.0.1:3007','127.0.0.1:3007',{'x-forwarded-host':'unrelated.example','x-forwarded-proto':'https'})));
});
test('origin guard preserves no-Origin requests and supports explicit IPv6 Host',()=>{
  assert.doesNotThrow(()=>requireLocalOrigin(request(undefined,'127.0.0.1:3007')));
  assert.doesNotThrow(()=>requireLocalOrigin(request('http://[::1]:3007','[::1]:3007')));
});
