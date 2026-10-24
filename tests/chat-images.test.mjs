import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/chat-images.js',import.meta.url),'utf8');
function fixture({width=1400,height=900,decodeError=false,encodedLength=quality=>quality>.5?60000:40000}={}) {
  const revoked=[],encoded=[],painted=[];
  const context={window:{},Uint8Array,URL:{createObjectURL:()=> 'blob:local-photo',revokeObjectURL:url=>revoked.push(url)},Image:class {
    naturalWidth=width;naturalHeight=height;
    set src(value){assert.equal(value,'blob:local-photo');queueMicrotask(()=>decodeError?this.onerror():this.onload());}
  },document:{createElement(name){assert.equal(name,'canvas');return {width:0,height:0,getContext(){return {fillRect(){},drawImage(...args){painted.push(args);}};},toDataURL(type,quality){encoded.push({type,quality,width:this.width,height:this.height});return 'data:image/jpeg;base64,'+'A'.repeat(encodedLength(quality,this.width));}};}}};
  vm.createContext(context);vm.runInContext(source,context);
  return {prepare:context.window.CoupiChatImages.prepare,revoked,encoded,painted};
}
function photo(options={}) {
  return {name:'reference.jpg',type:'image/jpeg',size:4000,slice:()=>({arrayBuffer:async()=>new Uint8Array([255,216,255,1,2,3]).buffer}),...options};
}

test('photo preparation bounds dimensions and data-channel payload, then releases its local object URL',async()=>{
  const f=fixture();const result=await f.prepare(photo());
  assert(result.dataUrl.length<=55000);assert.equal(result.width,720);assert.equal(result.height,463);
  assert(f.encoded.every(item=>item.type==='image/jpeg'));assert.equal(f.revoked.length,1);
});

test('small photos remain valid without unnecessary upscaling',async()=>{
  const f=fixture({width:60,height:80,encodedLength:()=>100});const result=await f.prepare(photo());
  assert.equal(result.width,60);assert.equal(result.height,80);assert.equal(f.revoked.length,1);
});

test('file type, file size, and forged image signatures reject before decoding',async()=>{
  const f=fixture();
  await assert.rejects(f.prepare(photo({type:'image/svg+xml'})),/JPG, PNG, or WebP/);
  await assert.rejects(f.prepare(photo({size:11*1024*1024})),/10 MB/);
  await assert.rejects(f.prepare(photo({slice:()=>({arrayBuffer:async()=>new Uint8Array([60,115,118,103]).buffer})})),/not a supported photo/);
  assert.equal(f.painted.length,0);assert.equal(f.revoked.length,0);
});

test('decode failures and oversized decoded images release resources without leaking a preview',async()=>{
  const unreadable=fixture({decodeError:true});await assert.rejects(unreadable.prepare(photo()),/could not be opened/);assert.equal(unreadable.revoked.length,1);
  const huge=fixture({width:20000,height:20000});await assert.rejects(huge.prepare(photo()),/too large/);assert.equal(huge.revoked.length,1);assert.equal(huge.painted.length,0);
});

test('a highly detailed image shrinks dimensions until it fits the transport instead of sending an oversized photo',async()=>{
  const f=fixture({encodedLength:(quality,width)=>width>400?60000:1000});const result=await f.prepare(photo());
  assert(result.width<=400);assert(result.dataUrl.length<=55000);assert.equal(f.revoked.length,1);
});
