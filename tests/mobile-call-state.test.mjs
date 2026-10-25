import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const context={window:{},URL};vm.runInNewContext(fs.readFileSync(new URL('../public/mobile-call-state.js',import.meta.url),'utf8'),context);const State=context.window.NookCallState;
const catalog=[{id:'1',name:'Real item'},{id:'2',name:'Second item'}];

test('only verified supported Coupang results enter the live choice catalog',()=>{
  const s=new State(),product={id:'123',name:'Frames',url:'https://www.coupang.com/vp/products/123',source:'coupang_web',category:'glasses',productType:'glasses',price:19900,currency:'KRW',image:null};
  for(const invalid of [{...product,source:'lazada_web'},{...product,url:'https://evil.test/vp/products/123'},{...product,currency:'SGD'},{...product,productType:'shoes',category:'shoes'}])s.addSearchProducts([invalid]);
  assert.equal(s.catalog.size,0);s.addSearchProducts([product]);assert.equal(s.catalog.get('123').price,19900);
});

test('a live update preserves a default product preview only when its pictured variant still matches',()=>{
  const original={id:'123',name:'Frames',url:'https://www.coupang.com/vp/products/123?itemId=456',category:'glasses',productType:'glasses',price:19900,image:'/products/123.jpg',preview:{image:'/products/123.jpg',lensClear:true,background:'white'}};
  const update={...original,source:'coupang_web',currency:'KRW',image:null};
  const s=new State([original]);s.addSearchProducts([update]);
  assert.equal(s.catalog.get('123').image,original.image);assert.equal(s.catalog.get('123').preview,original.preview);
  s.addSearchProducts([{...update,url:'https://www.coupang.com/vp/products/123?itemId=789'}]);
  assert.equal(s.catalog.get('123').image,null);assert.equal(s.catalog.get('123').preview,undefined);
});
test('recommendations resolve IDs to trusted catalog records and reject invented items',()=>{const s=new State(catalog);s.recommend([{id:'1',name:'invented'},{id:'1'},{id:'bad'}]);assert.equal(s.queue.length,1);assert.equal(s.current.name,'Real item');});
test('skip and accept advance the deck; repeated accepts never duplicate local cart items',()=>{const s=new State(catalog);s.recommend(catalog);s.decide('left');assert.equal(s.cart.size,0);assert.equal(s.current.id,'2');s.decide('right');assert.equal(s.cart.size,1);assert.equal(s.current,null);s.recommend([{id:'2'}]);s.decide('right');assert.equal(s.cart.size,1);});
test('conversation history preserves all turns and updates streaming messages in place',()=>{
  const s=new State();s.message({key:'a',role:'assistant',delta:'Hi'});s.message({key:'b',role:'user',text:'A lamp'});s.message({key:'c',role:'assistant',delta:'Here'});
  const first=s.messages[0];s.message({key:'a',role:'assistant',text:'Hi there',final:true});s.message({key:'c',role:'assistant',delta:' is one'});
  assert.equal(s.messages.length,3);assert.equal(s.messages[0],first);assert.equal(first.text,'Hi there');assert.equal(s.messages[2].text,'Here is one');
  s.message({key:'c',role:'assistant',text:'Here is one',final:true});assert.equal(s.messages.length,3);
  s.clearMessages();assert.equal(s.messages.length,0);s.message({key:'a',role:'assistant',text:'New call'});assert.equal(s.messages[0].text,'New call');
});
test('late user finals update the reserved chronological row before the assistant reply',()=>{
  const s=new State();s.message({key:'user',role:'user',order:1,pending:true});s.message({key:'reply',role:'assistant',order:2,delta:'Here'});
  s.message({key:'user',role:'user',order:1,text:'A lamp',final:true,pending:false});
  assert.deepEqual(Array.from(s.messages,m=>m.key),['user','reply']);assert.equal(s.messages[0].text,'A lamp');assert.equal(s.messages[0].pending,false);
  s.message({key:'reply',role:'assistant',order:2,delta:' is one'});s.message({key:'reply',role:'assistant',order:2,text:'Here is one',final:true});
  s.message({key:'reply',role:'assistant',order:2,delta:' is one'});assert.equal(s.messages[1].text,'Here is one');
});
test('history keeps 150 turns and an evicted late stream cannot resurrect an old row',()=>{
  const s=new State();for(let i=0;i<160;i++)s.message({key:'turn-'+i,role:i%2?'assistant':'user',order:i,text:'Message '+i,final:true});
  assert.equal(s.messages.length,150);assert.equal(s.messages[0].key,'turn-10');s.message({key:'turn-0',role:'user',order:0,text:'late',final:true});assert.equal(s.messages.length,150);assert.equal(s.messages[0].key,'turn-10');
  s.clearMessages();assert.equal(s.messages.length,0);s.message({key:'turn-0',role:'user',order:0,text:'New call'});assert.equal(s.messages.length,1);
});
test('a correction updates final text and image metadata without inserting a duplicate row',()=>{
  const s=new State();s.message({key:'one',role:'user',order:1,text:'A blue shirt',final:true});s.message({key:'two',role:'assistant',order:2,text:'Looking'});
  s.message({key:'one',role:'user',order:1,text:'A pink shirt',final:true,image:{dataUrl:'data:image/jpeg;base64,AQID',name:'shirt.jpg'}});
  assert.equal(s.messages.length,2);assert.equal(s.messages[0].text,'A pink shirt');assert.equal(s.messages[0].image.name,'shirt.jpg');
});
