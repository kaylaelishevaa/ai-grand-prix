import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createProfile} from '../lib/profile';
import {getSku} from '../lib/catalog';
import type {MemoryLine} from '../lib/types';
const require=createRequire(import.meta.url),previous=require.extensions['.css'];require.extensions['.css']=()=>{};
const {default:CompanionHome,homeExtras}=require('../components/CompanionHome.tsx') as typeof import('../components/CompanionHome');
if(previous)require.extensions['.css']=previous;else delete require.extensions['.css'];
const now=new Date();
function profile(){const p=createProfile('home-parity',now);p.rehearsalClock='day';p.journey={hatched:true,interviewCount:5,interviewComplete:true,nextQuestion:'',districts:[],processedCallIds:[]};return p;}
function memory(id:string,changes:Partial<MemoryLine>={}):MemoryLine{return{id,text:'Quiet mornings',source:'confirmed in your first-call review',confidence:.98,kind:'call-review',batchId:id,traitKeys:[],createdAt:now.toISOString(),...changes};}
const noop=()=>{};
function render(p=profile()){return renderToStaticMarkup(createElement(CompanionHome,{profile:p,onCall:noop,onExplore:noop,onOpenProduct:noop}));}

test('first-call check count uses recent surviving safe memories and never invents demo facts',()=>{
  const p=profile();p.memoryLines=[memory('real'),memory('private',{text:'private detail',excludedFromAI:true}),memory('old',{createdAt:new Date(now.getTime()-2*86400000).toISOString()}),memory('future',{createdAt:new Date(now.getTime()+86400000).toISOString()})];
  assert.equal(homeExtras(p,now).firstCallCount,1);
  const html=render(p);assert.match(html,/I learned 1 thing about you/);assert.match(html,/href="\/privacy"/);assert.doesNotMatch(html,/private detail/);assert.match(html,/home-excited\.svg/);
  p.memoryLines=[];assert.equal(homeExtras(p,now).firstCallCount,0);assert.doesNotMatch(render(p),/I learned/);
});

test('live cards retain exact catalog photos and no invented delivery details',()=>{
  const p=profile(),sku=getSku('1814412512')!;assert(sku.image);
  p.decisions=[{id:'sample-plan',skuId:sku.id,source:'from your call',addedAt:now.toISOString(),lockedUntil:null,approvedAt:null}];
  const html=render(p);assert(html.includes(sku.image));assert.match(html,/waiting for your OK/);assert.doesNotMatch(html,/arrives tomorrow|delivery by|Mina/);
});

test('empty main-style world card exposes only non-private owned products',()=>{
  const p=profile();p.quarantine.push({category:getSku('detergent')!.category,sensitive:true,note:'private fixture'});p.owned=[{skuId:'kettle',source:'approved',acquiredAt:now.toISOString()},{skuId:'detergent',source:'seed',acquiredAt:now.toISOString()}];
  assert.deepEqual(homeExtras(p,now).owned.map(sku=>sku.id),['kettle']);
  const html=render(p);assert.match(html,/A little world of your own/);assert.match(html,/>Explore<\/span>/);assert.doesNotMatch(html,/Built from things|I learned|detergent/);
});

test('ported main mascot assets are local fixed artwork with distinct moods',()=>{
  const moods=['calm','excited','attentive','sleepy','relaxed'];
  const art=moods.map(mood=>readFileSync(`public/main-shell/home-${mood}.svg`,'utf8'));
  assert.equal(new Set(art).size,moods.length);
  art.forEach((svg,index)=>{assert(svg.includes(`COUPI, ${moods[index]}`));assert.doesNotMatch(svg,/<script|<image|href=/i);});
});
