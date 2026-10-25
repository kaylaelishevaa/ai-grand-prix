import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import catalog from '../data/teammate-catalog.json';
import {readCallReceipts,saveCallReceipt,validateCallReceipt} from '../lib/call-receipts';

function receipt(){const context={window:{} as {CoupiCheckout?:new(catalog:unknown[])=>any}};vm.createContext(context);vm.runInContext(readFileSync(new URL('../public/live-call/demo-checkout.js',import.meta.url),'utf8'),context);const checkout=new context.window.CoupiCheckout!(catalog);checkout.start(catalog.slice(0,2));checkout.setQuantity(catalog[0].id,2);checkout.next();return checkout.confirm();}
function storage(){const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);}};}

test('confirmed call receipts retain exact quantities and catalog facts across Orders reloads and isolate members',()=>{
  const saved=storage(),original=receipt(),result=saveCallReceipt('member-one',original,saved,new Date('2026-10-25T01:00:00Z'));
  assert.equal(result.ok,true);assert.equal(result.receipt?.items[0].quantity,2);assert.equal(result.receipt?.total,original.referenceTotal);
  assert.deepEqual(readCallReceipts('member-one',saved),[result.receipt]);assert.deepEqual(readCallReceipts('member-two',saved),[]);
  assert.equal(saveCallReceipt('member-one',original,saved).ok,true);assert.equal(readCallReceipts('member-one',saved).length,1,'Confirm replay must not create a second order');
});

test('receipt ingestion rejects unconfirmed payments, unknown products, altered prices and replay conflicts',()=>{
  const original=receipt();for(const change of [{demo:false},{payment_processed:true},{order_placed:true},{referenceTotal:original.referenceTotal+1},{item_ids:['unknown',original.item_ids[1]]}])assert.equal(validateCallReceipt({...original,...change}),null);
  const forged=JSON.parse(JSON.stringify(original));forged.items[0].unitPrice=1;assert.equal(validateCallReceipt(forged),null);
  const badQuantity=JSON.parse(JSON.stringify(original));badQuantity.items[0].quantity=10;assert.equal(validateCallReceipt(badQuantity),null);
  const renamed=JSON.parse(JSON.stringify(original));renamed.items[0].product.name='Invented product';renamed.items[0].product.url='https://invalid.example';const valid=validateCallReceipt(renamed);assert.equal(valid?.items[0].name,catalog[0].name);assert.equal(valid?.items[0].url,catalog[0].url);
  const saved=storage();saveCallReceipt('one',original,saved);const conflict=receipt();conflict.id=original.id;conflict.paymentMethod='demo-wallet';assert.equal(saveCallReceipt('one',conflict,saved).ok,false);assert.equal(readCallReceipts('one',saved)[0].paymentMethod,'demo-card');
});

test('blocked or damaged browser storage fails safely without inventing receipts',()=>{
  const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  assert.equal(saveCallReceipt('member-one',receipt(),blocked).ok,false);assert.deepEqual(readCallReceipts('member-one',blocked),[]);
  assert.deepEqual(readCallReceipts('member-one',{getItem:()=>'{broken'}),[]);assert.equal(saveCallReceipt('../another-member',receipt(),storage()).ok,false);
});
