import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const context={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../public/mobile-call-state.js',import.meta.url),'utf8'),context);const State=context.window.NookCallState;
const catalog=[{id:'1',name:'Real item'},{id:'2',name:'Second item'}];
test('recommendations resolve IDs to trusted catalog records and reject invented items',()=>{const s=new State(catalog);s.recommend([{id:'1',name:'invented'},{id:'1'},{id:'bad'}]);assert.equal(s.queue.length,1);assert.equal(s.current.name,'Real item');});
test('skip and accept advance the deck; repeated accepts never duplicate local cart items',()=>{const s=new State(catalog);s.recommend(catalog);s.decide('left');assert.equal(s.cart.size,0);assert.equal(s.current.id,'2');s.decide('right');assert.equal(s.cart.size,1);assert.equal(s.current,null);s.recommend([{id:'2'}]);s.decide('right');assert.equal(s.cart.size,1);});
test('at most two transcript bubbles and old stream deltas cannot resurrect discarded bubbles',()=>{const s=new State();s.message({key:'a',role:'assistant',delta:'Hi'});s.message({key:'b',role:'user',text:'A lamp'});s.message({key:'c',role:'assistant',delta:'Here'});s.message({key:'a',role:'assistant',delta:' again'});assert.equal(s.messages.length,2);assert.equal(s.messages[0].key,'b');s.message({key:'c',role:'assistant',delta:' is one'});assert.equal(s.messages[1].text,'Here is one');});
