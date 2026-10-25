import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSceneKind,dressingRequestConstraints} from '../lib/scenes';
import type {SceneResult} from '../lib/types';

const scene=(name='A little corner',explanation='A few things that fit together.'):SceneResult=>({name,explanation,items:[]});

test('explicit occasion and room words choose architecture without partial-word accidents',()=>{
  assert.equal(resolveSceneKind(scene(),'date night: a closet and makeup vanity'),'dressing');
  assert.equal(resolveSceneKind(scene(),'a reading nook for rainy afternoons'),'reading');
  assert.equal(resolveSceneKind(scene(),'a quiet desk to focus'),'desk');
  assert.equal(resolveSceneKind(scene(),'update my kitchen'),'kitchen');
  assert.equal(resolveSceneKind(scene('Your Desk'),'update the delivery date'),'desk');
  assert.equal(resolveSceneKind(scene('Your Kitchen'),'check the expiration date'),'kitchen');
  assert.equal(resolveSceneKind(scene(),'cooking dinner for my date in the kitchen'),'kitchen');
  assert.equal(resolveSceneKind(scene('Your Desk'),'date tomorrow'),'desk');
});

test('commands take precedence over old names while persisted scene kind stabilizes ordinary rendering',()=>{
  const kitchen={...scene('Your Kitchen','Your familiar matcha counter.'),kind:'kitchen' as const};
  assert.equal(resolveSceneKind(kitchen,'turn this into a reading nook'),'reading');
  assert.equal(resolveSceneKind(kitchen,'a desk for drawing'),'desk');
  assert.equal(resolveSceneKind({...scene('Date night','A kitchen before the evening.'),kind:'desk'}),'desk');
  assert.equal(resolveSceneKind(scene('Your Desk','Set things down after a date.')),'desk');
});

test('negated makeup and rooms do not become affirmative scene intent',()=>{
  assert.equal(resolveSceneKind(scene('Your Desk'),'no makeup'),'desk');
  assert.equal(resolveSceneKind(scene('Your Kitchen'),'without a vanity'),'kitchen');
  assert.equal(resolveSceneKind(scene(),'a reading corner, not a kitchen'),'reading');
  assert.equal(resolveSceneKind(scene(),'a desk instead of a closet'),'desk');
  assert.equal(resolveSceneKind(scene(),'not makeup, a small kitchen'),'kitchen');
});

test('eligible product types supply a conservative fallback without demographic inference',()=>{
  assert.equal(resolveSceneKind({...scene(),items:[{skuId:'organizer',oneLiner:'Keeps pencils together.'}]}),'desk');
  assert.equal(resolveSceneKind({...scene(),items:[{skuId:'kettle',oneLiner:'For tea.'}]}),'kitchen');
  assert.equal(resolveSceneKind(scene()),'kitchen');
});

test('getting-ready constraints distinguish requested closets and cosmetics from dinner dates',()=>{
  assert.deepEqual(dressingRequestConstraints('Getting ready for a date: a closet and makeup vanity.'),{active:true,wardrobe:true,beauty:true,excludeMakeup:false});
  assert.deepEqual(dressingRequestConstraints('A date dinner in my kitchen'),{active:false,wardrobe:false,beauty:false,excludeMakeup:false});
  assert.deepEqual(dressingRequestConstraints('A wardrobe, no makeup'),{active:true,wardrobe:true,beauty:false,excludeMakeup:true});
  assert.equal(dressingRequestConstraints('no makeup, just a desk').active,false);
});
