import test from 'node:test';
import * as callEntry from '../lib/call-entry';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import * as catalog from '../lib/catalog';
import * as profileLibrary from '../lib/profile';
import * as bridge from '../lib/call-bridge';
import * as sessionLibrary from '../lib/live-call-session';
import * as callReceipts from '../lib/call-receipts';
import callCatalog from '../data/teammate-catalog.json';
import {LiveCallLifecycle,liveDiscoveryContext} from '../lib/live-call-session';
import {handlePersonalization} from '../lib/server/personalization';
import {remember} from '../lib/memory';
import type {Profile} from '../lib/types';
import type {PersonalizationReview} from '../lib/personalization';

const origin='http://localhost:3007';
const review:PersonalizationReview={interests:['cozy_home'],vibe:null,budgetPerItem:null,story:'I sketch at weekends.'};
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const fresh=()=>profileLibrary.createProfile(randomUUID());
function draftProfile(){const result=handlePersonalization(fresh(),{action:'start',requestId:'seed'});const proposed=remember(result.profile,{id:'proposal',text:'I sketch at weekends.',source:'from our first call',kind:'call',confidence:.9});result.profile.journey!.personalizationDraft!.candidates=proposed.memoryLines;return result.profile;}

test('a cancelled mount cannot apply a response after a Strict Mode remount even if transport ignores abort',async()=>{
  const lifecycle=new LiveCallLifecycle(),profile=fresh();lifecycle.begin();const old=lifecycle.capture(profile),controller=lifecycle.controller(old,profile);
  let finish!:()=>void;const network=new Promise<void>(resolve=>finish=resolve);let applied=0;
  const task=network.then(()=>{if(lifecycle.current(old,profile))applied++;});
  lifecycle.end();assert.equal(controller.signal.aborted,true);lifecycle.begin();finish();await task;
  assert.equal(applied,0);assert.equal(lifecycle.current(lifecycle.capture(profile),profile),true);
  assert.equal(lifecycle.current(lifecycle.capture(profile),{...profile,id:'different'}),false);
});

test('review/skip scopes bind the exact draft, while completed requests can update its revision',()=>{
  const lifecycle=new LiveCallLifecycle(),profile=draftProfile();lifecycle.begin();const scope=lifecycle.capture(profile);
  assert(lifecycle.current(scope,{...profile,revision:profile.revision+1},true));
  const replaced=structuredClone(profile);replaced.journey!.personalizationDraft!.id='another';
  assert.equal(lifecycle.current(scope,replaced,true),false);assert.throws(()=>lifecycle.controller(scope,replaced,true),/conversation changed/);
});

test('iframe context is bounded, current-quarantine filtered and never includes canonical memory or private profile fields',()=>{
  const profile=draftProfile(),draft=profile.journey!.personalizationDraft!,marker='PRIVATE_CANONICAL_OR_DIARY';
  profile.memoryLines=[{...draft.candidates[0],id:'private',text:marker}];(profile as unknown as Record<string,unknown>).diary=marker;
  draft.candidates=Array.from({length:12},(_,i)=>({...draft.candidates[0],id:'p-'+i,text:'I enjoy sketch '+i,private:marker}));
  draft.candidates.push({...draft.candidates[0],id:'dress',text:'I want an everyday dress.',excludedFromAI:false});
  profile.quarantine.push({category:'wardrobe',sensitive:true,note:'Private now'});
  const result=liveDiscoveryContext(profile,true),serialized=JSON.stringify(result);
  assert.equal(result.personalization.memories.length,8);assert(!serialized.includes(marker));assert(!serialized.includes('dress'));assert(!serialized.includes('profile'));assert(!serialized.includes('draftId'));
  assert.deepEqual(Object.keys(result.personalization.memories[0]).sort(),['confidence','source','text']);
  profile.journey!.interviewComplete=true;draft.answerCount=5;const ready=liveDiscoveryContext(profile,true);
  assert.equal(ready.progress.complete,false);assert.equal(ready.progress.worldReady,false);assert.equal(ready.personalization.question,'');
});

type Node={type:unknown;props:Record<string,any>};
function flatten(root:any):Node[]{if(!root)return[];if(Array.isArray(root))return root.flatMap(flatten);if(typeof root!=='object')return[];return[root,...flatten(root.props?.children)];}
function textOf(root:any):string{if(typeof root==='string')return root;if(Array.isArray(root))return root.map(textOf).join('');return root&&typeof root==='object'?textOf(root.props?.children):'';}
/** Runs the actual parent component with hook effects and fake transport; no DOM/media/network. */
function componentHarness(initial:Profile|null,transport:typeof fetch,wrapper=false){
  const hooks:any[]=[],effects:any[]=[],listeners=new Map<string,Set<(event:any)=>void>>(),posts:any[]=[],profiles:Profile[]=[],completed:Profile[]=[],navigations:string[]=[];
  const sessionValues=new Map<string,string>(),sessionStorage={getItem:(key:string)=>sessionValues.get(key)||null,setItem:(key:string,value:string)=>{sessionValues.set(key,value);}};
  const child={postMessage(message:unknown){posts.push(message);}};let cursor=0,tree:any,mounted=true,scheduled=false,forceEffects=false,frameReady=false;
  const frameNode={contentWindow:child,isConnected:true,addEventListener(){},removeEventListener(){},set src(value:string){navigations.push(value);}};
  const props:any={profile:initial,visible:true,frame:{current:frameNode},before:{},after:{},onReady(value:boolean){frameReady=value;},onProfile(value:Profile){props.profile=value;profiles.push(value);schedule();},onClose(){},onType(){},onOpenProduct(){},onComplete(value:Profile){completed.push(value);}};
  function schedule(){if(!mounted||scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(mounted)render();});}
  const react={
    useRef(value:any){const at=cursor++;if(!hooks[at])hooks[at]={current:value};return hooks[at];},
    useState(value:any){const at=cursor++;if(!hooks[at])hooks[at]={value:typeof value==='function'?value():value};return[hooks[at].value,(next:any)=>{hooks[at].value=typeof next==='function'?next(hooks[at].value):next;schedule();}];},
    useEffect(callback:()=>void,deps:any[]){const at=cursor++,old=hooks[at];if(forceEffects||!old||deps.some((value,i)=>value!==old.deps[i])){effects.push(()=>{old?.cleanup?.();const cleanup=callback();hooks[at]={deps,cleanup};});}},
  };
  const Review=()=>null,jsx=(type:unknown,properties:Record<string,unknown>)=>({type,props:properties});
  const imports:Record<string,unknown>={'react':react,'react-dom':{createPortal:(children:unknown)=>({type:'portal',props:{children}})},'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/catalog':catalog,'@/lib/profile':profileLibrary,'@/lib/call-bridge':bridge,'@/lib/live-call-session':sessionLibrary,'@/lib/call-receipts':callReceipts,'@/lib/call-entry':callEntry,'./FirstCallController':{__esModule:true,default:()=>null},'./FirstCallReview':{__esModule:true,default:Review},'./Glyph':{Glyph:()=>null},'./live-call-experience.css':{}};
  const module={exports:{} as any},context=createContext({module,exports:module.exports,require:(name:string)=>{if(!(name in imports))throw Error('Unexpected import '+name);return imports[name];},fetch:transport,AbortController,setTimeout,clearTimeout,crypto:{randomUUID},location:{origin},window:{sessionStorage,addEventListener(type:string,fn:(event:any)=>void){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type)!.add(fn);},removeEventListener(type:string,fn:(event:any)=>void){listeners.get(type)?.delete(fn);}},console});
  const source=readFileSync(new URL('../components/LiveCallExperience.tsx',import.meta.url),'utf8');
  runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
  function render(){
    cursor=0;tree=wrapper?module.exports.default(props):module.exports.LiveCallController(props);forceEffects=false;
    if(wrapper)for(const node of flatten(tree)){if(node.props.ref)node.props.ref.current=node.type==='iframe'?frameNode:{};}
    for(const effect of effects.splice(0))effect();return tree;
  }
  function cleanup(){for(const hook of hooks)hook?.cleanup?.();}
  render();return{profiles,completed,posts,props,navigations,sessionStorage,ready:()=>frameReady,tree:()=>tree,review:()=>flatten(tree).find(node=>node.type===Review),button:(label:string)=>flatten(tree).find(node=>node.type==='button'&&textOf(node).includes(label)),emit(data:unknown){for(const listener of listeners.get('message')||[])listener({origin,source:child,data});},strictReplay(){cleanup();forceEffects=true;render();},unmount(){mounted=false;cleanup();},render};
}

test('the wrapper always includes one static-src iframe before a profile exists, while visibility only gates its controls',()=>{
  const h=componentHarness(null,(async()=>{throw Error('The wrapper must not make profile or media requests');}) as typeof fetch,true);
  let frames=flatten(h.tree()).filter(node=>node.type==='iframe');assert.equal(frames.length,1);assert.equal(frames[0].props.src,'/live-call/index.html?embedded=1');assert.equal(frames[0].props.inert,true);
  h.props.visible=false;h.render();frames=flatten(h.tree()).filter(node=>node.type==='iframe');assert.equal(frames.length,1);assert.equal(frames[0].props.src,'/live-call/index.html?embedded=1');
  h.props.profile=draftProfile();h.props.visible=true;h.render();assert.equal(flatten(h.tree()).filter(node=>node.type==='iframe').length,1);assert.deepEqual(h.navigations,[]);h.unmount();
});

test('an initially ready controller never navigates its existing iframe across profile updates and Strict Mode',{concurrency:false},async()=>{
  const profile=fresh();profile.journey={hatched:true,interviewComplete:true,interviewCount:5,nextQuestion:'',districts:[],processedCallIds:[]};
  const h=componentHarness(profile,(async()=>{throw Error('An already completed call needs no bootstrap request');}) as typeof fetch);
  assert.deepEqual(h.navigations,[]);assert.equal(h.ready(),true);
  assert(!h.button('Type instead'));assert(!h.button('Back'));assert(!h.button('Skip for now'));assert(!h.button('Review story'));assert(!textOf(h.tree()).includes('OF UP TO 5 STORIES'));
  h.props.profile={...profile,revision:profile.revision+1};h.render();h.strictReplay();await tick();
  assert.deepEqual(h.navigations,[],'A memory update or effect replay must not reload an active voice/camera document');h.unmount();
});


test('new and unfinished profiles become call-ready immediately without starting or resuming an interview',{concurrency:false},async()=>{
  for(const profile of [fresh(),draftProfile()]){
    const requests:string[]=[],h=componentHarness(profile,(async url=>{requests.push(String(url));throw Error('No bootstrap request expected');}) as typeof fetch);
    assert.equal(h.ready(),true);h.strictReplay();await tick();assert.deepEqual(requests,[]);assert(!h.review());assert(!h.button('Review story'));assert(!h.button('Keep sharing'));
    const context=h.posts.filter(value=>value.type==='coupi-personalization-context').at(-1);assert.equal(context.active,false);assert.equal(context.question,'');assert.equal(context.draftPending,false);assert.equal(context.memories.length,0);h.unmount();
  }
});

test('ordinary Realtime transcripts never enqueue a second model request or reopen preference review',{concurrency:false},async()=>{
  for(const profile of [fresh(),draftProfile()]){
    const requests:string[]=[],h=componentHarness(profile,(async url=>{requests.push(String(url));throw Error('Direct calls must not invoke the verdict service');}) as typeof fetch);
    for(const text of ['Find me pink lipstick','Let me try the second product','Save this one','Pay my cart']){
      h.emit({type:'coupi-live-call-transcript',role:'user',id:'direct-'+text,text});
      h.emit({type:'coupi-live-call-transcript',role:'user',id:'direct-'+text,text});
    }
    await tick();await tick();
    assert.deepEqual(requests,[]);assert.equal(h.profiles.length,0);assert(!h.review());assert.equal(h.completed.length,0);
    assert(!h.posts.some(message=>['coupi-call-pending','coupi-call-result','coupi-call-error'].includes(message.type)));
    assert.equal(h.ready(),true);assert.equal(h.props.profile,profile);h.unmount();
  }
});

test('legacy preference controls are rejected without saving, discarding or exposing a review',{concurrency:false},async()=>{
  let requests=0;const profile=draftProfile(),h=componentHarness(profile,(async()=>{requests++;throw Error('No preference request expected');}) as typeof fetch);
  for(const type of ['coupi-personalization-review','coupi-personalization-skip'])h.emit({type,id:'personalization-legacy'});
  await tick();assert.equal(requests,0);assert(!h.review());assert.equal(h.completed.length,0);assert(h.props.profile.journey.personalizationDraft);assert(h.posts.some(value=>value.type==='coupi-personalization-result'&&value.error.includes('shopping')));h.unmount();
});

test('late legacy transcripts cannot mutate a different profile or trigger requests after unmount',{concurrency:false},async()=>{
  const requests:string[]=[],initial=fresh(),h=componentHarness(initial,(async url=>{requests.push(String(url));throw Error('No background verdict request expected');}) as typeof fetch);
  h.emit({type:'coupi-live-call-transcript',role:'user',id:'old-profile-turn',text:'A lamp please'});
  h.props.profile=fresh();h.render();h.strictReplay();
  h.emit({type:'coupi-live-call-transcript',role:'user',id:'old-profile-turn',text:'A lamp please'});
  h.unmount();h.emit({type:'coupi-live-call-transcript',role:'user',id:'late-turn',text:'Try the first one'});await tick();
  assert.deepEqual(requests,[]);assert.equal(h.profiles.length,0);assert.equal(h.completed.length,0);
  assert(h.posts.some(message=>message.type==='coupi-live-call-stop'));
});

test('direct mode retains profile context readiness, world details and explicit call exit',{concurrency:false},async()=>{
  const profile=fresh(),opened:string[]=[],h=componentHarness(profile,(async()=>{throw Error('Direct control messages do not need a model');}) as typeof fetch);
  let closes=0;h.props.onOpenProduct=(id:string)=>opened.push(id);h.props.onClose=()=>closes++;h.render();
  h.emit({type:'coupi-live-call-ready'});assert.equal(h.ready(),true);assert.equal(h.posts.at(-1).type,'coupi-personalization-context');assert.equal(h.posts.at(-1).active,false);
  h.emit({type:'coupi-live-call-product',namespace:'world-simulation',skuId:'7612276799'});await tick();assert.deepEqual(opened,['7612276799']);
  h.emit({type:'coupi-live-call-exit'});assert.equal(closes,1);assert(h.posts.some(message=>message.type==='coupi-live-call-stop'));h.unmount();
});

test('incoming call receipts save for the matching member while stale member confirmations are rejected',()=>{
  const first=fresh(),h=componentHarness(first,(async()=>{throw Error('Session receipts do not make network requests');}) as typeof fetch),product=callCatalog[0];
  const receipt={id:'DEMO-INCOMING-1',demo:true,payment_processed:false,order_placed:false,currency:'KRW',paymentMethod:'demo-card',item_ids:[product.id],referenceTotal:product.price,items:[{id:product.id,product,quantity:1,unitPrice:product.price,lineTotal:product.price,included:true}]};
  assert.equal(h.posts.find(message=>message.type==='coupi-personalization-context').profileId,first.id);
  h.emit({type:'coupi-call-checkout-complete',profileId:first.id,receipt});assert.equal(callReceipts.readCallReceipts(first.id,h.sessionStorage).length,1);
  const second=fresh();h.props.profile=second;h.render();h.emit({type:'coupi-live-call-ready'});assert.equal(h.posts.at(-1).profileId,second.id);
  h.emit({type:'coupi-call-checkout-complete',profileId:first.id,receipt:{...receipt,id:'DEMO-STALE-2'}});assert.equal(callReceipts.readCallReceipts(first.id,h.sessionStorage).length,1);assert.deepEqual(callReceipts.readCallReceipts(second.id,h.sessionStorage),[]);
  h.emit({type:'coupi-call-checkout-complete',profileId:second.id,receipt:{...receipt,id:'DEMO-CURRENT-3'}});assert.equal(callReceipts.readCallReceipts(second.id,h.sessionStorage)[0].id,'DEMO-CURRENT-3');h.unmount();
});
