import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const sandbox:{window:{CoupiCallActions?:{resolve:(text:unknown,context?:unknown)=>unknown}}}={window:{}};
vm.runInNewContext(readFileSync(new URL('../public/live-call/call-actions.js',import.meta.url),'utf8'),sandbox);
const resolve=(text:unknown,context:unknown=shown)=>JSON.parse(JSON.stringify(sandbox.window.CoupiCallActions!.resolve(text,context)));
const shown={visible_product_ids:['first-11','second-22','third-33'],visible_product:{id:'second-22'},cart_ids:['first-11']};

test('direct try-on commands use displayed order rather than the current selection',()=>{
  for(const text of ['Let me try the first product','Can I try on the first one?','Try product number one','try 1st'])assert.deepEqual(resolve(text),{kind:'product',action:'try_on',productId:'first-11'},text);
  for(const text of ['Try the second product from the list','please try the second one on','Could you preview product 2 please'])assert.deepEqual(resolve(text),{kind:'product',action:'try_on',productId:'second-22'},text);
  assert.deepEqual(resolve('try the last product'),{kind:'product',action:'try_on',productId:'third-33'});
  assert.deepEqual(resolve('try this on'),{kind:'product',action:'try_on',productId:'second-22'});
});

test('next collection, add-to-cart, and details are explicit local controls',()=>{
  for(const text of ['skip','skip this collection','show me the next collection','go to the next collection'])assert.deepEqual(resolve(text),{kind:'product',action:'skip'},text);
  for(const text of ['Add the first product to my cart','put product one in the bag','Can you save the first one to my cart?'])assert.deepEqual(resolve(text),{kind:'product',action:'save',productId:'first-11'},text);
  for(const text of ['add this to cart','add to cart','add to my bag'])assert.deepEqual(resolve(text),{kind:'product',action:'save',productId:'second-22'});
  assert.deepEqual(resolve('tell me more about the second product'),{kind:'product',action:'details',productId:'second-22'});
  assert.deepEqual(resolve('show details for the first one'),{kind:'product',action:'details',productId:'first-11'});
});

test('purchase requests only open review for exact chosen IDs or the cart',()=>{
  for(const text of ['buy this','purchase the second product','pay for this one'])assert.deepEqual(resolve(text),{kind:'checkout',request:{scope:'products',product_ids:['second-22']}},text);
  assert.deepEqual(resolve('buy the first product'),{kind:'checkout',request:{scope:'products',product_ids:['first-11']}});
  for(const text of ['pay my cart','pay for my bag','pay my add to cart','check out','buy everything in my cart','checkout my cart'])assert.deepEqual(resolve(text),{kind:'checkout',request:{scope:'cart'}},text);
  assert.equal(resolve('pay now'),null);assert.equal(resolve('confirm payment'),null);assert.equal(resolve('buy these'),null);
});

test('negated, hypothetical, explanatory and multi-product requests stay with the agent',()=>{
  for(const text of ["Don't try the first one",'Do not add this to cart','never buy this','Should I buy this?','What happens if I buy this?','How do I add this to my cart?','Can you explain how to try this on?','Try the first or second product','Try the first and second products','Add this to cart and buy it','buy both','skip lipstick and show glasses','Show me glasses','Try a red lipstick','save this collection'])assert.equal(resolve(text),null,text);
});

test('missing and malformed positions never substitute another product',()=>{
  assert.match((resolve('try the tenth product') as {message:string}).message,/3 products/);
  assert.match((resolve('try the first product',{visible_product_ids:[]}) as {message:string}).message,/Show a product list/);
  assert.match((resolve('try this',{}) as {message:string}).message,/Select a product/);
  assert.equal((resolve('try the first product',{visible_product_ids:['bad id','second-22']}) as {kind:string}).kind,'error');
  assert.deepEqual(resolve('try the second product',{visible_product_ids:['bad id','second-22']}),{kind:'product',action:'try_on',productId:'second-22'});
  assert.equal((resolve('try the last product',{...shown,visible_product_ids_truncated:true}) as {kind:string}).kind,'error');
  assert.equal(resolve(null),null);assert.equal((resolve('try this',null) as {kind:string}).kind,'error');
});

test('the first fifteen rendered positions are resolvable without changing their IDs',()=>{
  const context={visible_product_ids:Array.from({length:15},(_,i)=>`product-${i+1}`)};
  assert.deepEqual(resolve('try the fifteenth product',context),{kind:'product',action:'try_on',productId:'product-15'});
  assert.deepEqual(resolve('try product fourteen',context),{kind:'product',action:'try_on',productId:'product-14'});
  assert.equal((resolve('try product 16',context) as {kind:string}).kind,'error');
});
