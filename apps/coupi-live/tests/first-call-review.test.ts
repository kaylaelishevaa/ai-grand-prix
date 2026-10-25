import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createProfile} from '../lib/profile';
import {handlePersonalization} from '../lib/server/personalization';
import {safePersonalizationCandidates,type PersonalizationReview} from '../lib/personalization';
import type {Profile,MemoryLine} from '../lib/types';

const require=createRequire(import.meta.url),styleLoader=require.extensions['.css'];
require.extensions['.css']=()=>{};
const {reviewFromEdits}=require('../components/FirstCallReview.tsx') as typeof import('../components/FirstCallReview');
if(styleLoader)require.extensions['.css']=styleLoader;else delete require.extensions['.css'];

test('review form preserves explicit edits without inventing an unspecified vibe or budget',()=>{
  const text='I prefer books.\nActually, remove the earlier hiking idea.';
  assert.deepEqual(reviewFromEdits(['focused_work'],null,'',text),{interests:['focused_work'],vibe:null,budgetPerItem:null,story:text});
  assert.deepEqual(reviewFromEdits(['outdoors'],'mixed','30000',''),{interests:['outdoors'],vibe:'mixed',budgetPerItem:30000,story:''});
});

test('review form rejects malformed, fractional and excessive budgets before calling confirm',()=>{
  for(const value of ['0','-5','1e3','2.5','30,000','10000001','Infinity'])assert.throws(()=>reviewFromEdits(['cozy_home'],null,value,''),/whole-won/);
  assert.equal(reviewFromEdits(['cozy_home'],null,'10000000','').budgetPerItem,10_000_000);
  assert.throws(()=>reviewFromEdits([],null,'','   '),/one interest/);
  assert.throws(()=>reviewFromEdits(['cozy_home'],null,'','x'.repeat(1201)),/1,200/);
});

type Node={type:any;props:Record<string,any>};
/** Execute the actual component handlers with a minimal hook renderer. The API
 * fixture uses the real personalization reducer, with no browser or network. */
function callFixture(){
  const now=new Date('2026-10-25T04:00:00Z');let profile=createProfile('typed-review',now),tree:Node,cursor=0,disposed=false,scheduled=false;
  const slots:any[]=[],effects:(()=>void)[]=[],cleanups:(()=>void)[]=[],requests:{url:string;body:any}[]=[],completed:Profile[]=[],updates:Profile[]=[];
  let failConfirm=false,closed=0;
  let held:{action:string;ready:()=>void;wait:Promise<void>;signal?:AbortSignal|null}|undefined;
  const queue=()=>{if(scheduled||disposed)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(!disposed)render();});};
  const react={
    useState(initial:any){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],(next:any)=>{slots[index]=typeof next==='function'?next(slots[index]):next;queue();}];},
    useRef(initial:any){const index=cursor++;return slots[index]??(slots[index]={current:initial});},
    useEffect(effect:()=>void|(()=>void),deps:any[]){const index=cursor++,old=slots[index];if(!old||deps.some((value,i)=>value!==old[i])){slots[index]=deps;effects.push(()=>{cleanups[index]?.();cleanups[index]=effect()||(()=>{});});}},
  };
  const jsx=(type:any,props:Record<string,any>)=>({type,props});
  const componentMarker=(name:string)=>Object.assign(()=>null,{displayName:name});
  const reviewMarker=componentMarker('FirstCallReview');
  const context=vm.createContext({console,AbortController,FormData,DOMException,URL,File:globalThis.File,crypto:globalThis.crypto,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,
    window:{matchMedia:()=>({matches:true})},document:{hidden:false,addEventListener(){},removeEventListener(){}},navigator:{language:'en'},localStorage:{getItem:()=> 'off',setItem(){}},requestAnimationFrame:(callback:()=>void)=>callback(),
    module:{exports:{}},exports:{},require(name:string){if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='@/lib/catalog')return{getSku:()=>undefined,getReview:()=>undefined};if(name==='@/lib/personalization')return{safePersonalizationCandidates};if(name==='./FirstCallReview')return{default:reviewMarker,__esModule:true};if(name.endsWith('.css'))return{};return{default:componentMarker(name),Glyph:componentMarker('Glyph'),ProductVisual:componentMarker('ProductVisual'),ProductEvidence:componentMarker('ProductEvidence'),__esModule:true};},
    async fetch(url:string,init:RequestInit){const body=JSON.parse(String(init.body));requests.push({url,body});if(init.signal?.aborted)throw new DOMException('aborted','AbortError');
      async function deliver(response:Response){const pending=held;if(pending&&pending.action===body.action){held=undefined;pending.signal=init.signal;pending.ready();await pending.wait;}return response;}
      if(url==='/api/personalization'){
        if(body.action==='confirm'&&failConfirm){failConfirm=false;return deliver(Response.json({error:'Connection slipped. Try again.'},{status:503}));}
        const result=handlePersonalization(profile,body,now);profile=result.profile;return deliver(Response.json(result));
      }
      assert.equal(url,'/api/call');assert.equal(body.personalizationDraftId,profile.journey?.personalizationDraft?.id);
      const draft=profile.journey!.personalizationDraft!;
      if(body.action==='message'){
        const line:MemoryLine={id:'draft-'+requests.length,text:body.message,source:'from our first call',batchId:'first-call',kind:'call',createdAt:now.toISOString(),confidence:.9,traitKeys:[]};
        const next={...draft,answerCount:Math.min(5,draft.answerCount+1),candidates:[...draft.candidates,line],reviewReady:draft.answerCount>=4};
        profile={...profile,journey:{...profile.journey!,personalizationDraft:next}};
      }
      const current=profile.journey!.personalizationDraft!;
      return deliver(Response.json({status:'ok',message:'Tell me a little more.',question:current.answerCount<5?'What do your mornings look like?':null,interviewCount:current.answerCount,interviewComplete:false,conversationMode:'interview',worldReady:false,personalization:{draftId:current.id,reviewReady:current.reviewReady},memories:current.candidates.slice(-1),proposedSkuIds:[],profile}));
    },
  });
  context.exports=context.module.exports;
  const compiled=ts.transpileModule(readFileSync(new URL('../components/CompanionCall.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInContext(compiled,context);const Component=context.module.exports.default;
  const props={profile,offline:true,onProfile(next:Profile){props.profile=next;updates.push(next);queue();},onComplete(next:Profile){completed.push(next);},onOpenProduct(){},onClose(){closed++;}};
  function render(){cursor=0;tree=Component(props);for(const effect of effects.splice(0))effect();}
  function walk(value:any):Node[]{if(value===null||value===undefined||typeof value==='boolean')return[];if(Array.isArray(value))return value.flatMap(walk);if(typeof value!=='object')return[];return[value,...walk(value.props?.children)];}
  function nodes():Node[]{return walk(tree);}
  function find(predicate:(node:Node)=>boolean){const result=nodes().find(predicate);assert(result,'Expected UI element');return result;}
  async function flush(){for(let i=0;i<4;i++)await new Promise(resolve=>setTimeout(resolve,0));}
  render();
  return{requests,completed,updates,flush,nodes,find,closed:()=>closed,holdNext(action:string){let release!:()=>void,ready!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;}),entered=new Promise<void>(resolve=>{ready=resolve;}),pending={action,wait,ready,signal:undefined as AbortSignal|null|undefined};held=pending;return{entered,release,aborted:()=>pending.signal?.aborted};},updateProfile(next:Profile){profile=next;props.profile=next;queue();},review:()=>nodes().find(node=>node.type===reviewMarker),profile:()=>profile,failNextConfirm(){failConfirm=true;},async say(text:string){find(node=>node.type==='textarea').props.onChange({target:{value:text}});await flush();await find(node=>node.type==='form'&&node.props.className==='call-composer').props.onSubmit({preventDefault(){}});await flush();},dispose(){disposed=true;for(const cleanup of cleanups)cleanup?.();}};
}

test('typed first call stages five answers, keeps talking without save, then confirms only edited preferences',async t=>{
  const f=callFixture();t.after(()=>f.dispose());await f.flush();
  assert.deepEqual(f.requests.slice(0,2).map(row=>[row.url,row.body.action]),[['/api/personalization','start'],['/api/call','start']]);
  for(let i=1;i<=5;i++)await f.say('I enjoy sketching story '+i+'.');
  assert.equal(f.completed.length,0);assert.equal(f.profile().memoryLines.length,0);assert(f.review());
  const previous=f.requests.length;f.review()!.props.onContinue();await f.flush();assert.equal(f.requests.length,previous);assert.equal(f.review(),undefined);
  await f.say('And I like train journeys.');assert.equal(f.review(),undefined,'Continuing after Q5 must not reopen the modal on each turn');assert.equal(f.completed.length,0);
  await f.find(node=>node.type==='button'&&node.props.className==='text-button call-review-story').props.onClick();await f.flush();
  const edited:PersonalizationReview={interests:['outdoors'],vibe:'bold',budgetPerItem:25000,story:'Only remember train journeys.'};
  f.review()!.props.onConfirm(edited);await f.flush();
  assert.equal(f.completed.length,1);assert.equal(f.profile().journey?.personalizationDraft,undefined);
  const confirmation=f.requests.find(row=>row.body.action==='confirm')!;assert.deepEqual(confirmation.body.review,edited);
  assert(!f.profile().memoryLines.some(line=>line.text.includes('sketching')));assert(f.profile().memoryLines.some(line=>line.text==='Only remember train journeys.'));
});

test('early review does not require five answers; failed confirmation stays open and retries the same receipt',async t=>{
  const f=callFixture();t.after(()=>f.dispose());await f.flush();await f.say('I enjoy a quiet reading corner.');
  await f.find(node=>node.type==='button'&&node.props.className==='text-button call-review-story').props.onClick();await f.flush();
  assert(f.review());const edited:PersonalizationReview={interests:['cozy_home'],vibe:null,budgetPerItem:null,story:'Quiet reading.'};
  f.failNextConfirm();f.review()!.props.onConfirm(edited);await f.flush();
  assert.equal(f.completed.length,0);assert.equal(f.profile().memoryLines.length,0);assert.match(f.review()!.props.error,/Connection slipped/);
  f.review()!.props.onConfirm(edited);await f.flush();assert.equal(f.completed.length,1);
  const requests=f.requests.filter(row=>row.body.action==='confirm');assert.equal(requests.length,2);assert.equal(requests[0].body.requestId,requests[1].body.requestId);
});


test('leaving immediately aborts a buffered review response before it can reopen a dialog',async t=>{
  const f=callFixture();t.after(()=>f.dispose());await f.flush();for(let i=0;i<4;i++)await f.say('I enjoy quiet mornings '+i+'.');
  const gate=f.holdNext('draft'),answer=f.say('I also draw.');await gate.entered;const updates=f.updates.length;
  f.find(node=>node.type==='button'&&node.props['aria-label']==='Leave call').props.onClick();
  assert.equal(gate.aborted(),true);assert.equal(f.closed(),1);gate.release();await answer;await f.flush();
  assert.equal(f.review(),undefined);assert.equal(f.completed.length,0);assert.equal(f.updates.length,updates);
});

test('current quarantine filters staged memories and an older response cannot replace a newer profile',async t=>{
  const f=callFixture();t.after(()=>f.dispose());await f.flush();await f.say('I like rose lipstick.');
  const gate=f.holdNext('message'),answer=f.say('I draw at weekends.');await gate.entered;
  f.updateProfile({...f.profile(),revision:f.profile().revision+1,quarantine:[...f.profile().quarantine,{category:'beauty',sensitive:true,note:'private now'}]});await f.flush();
  const updates=f.updates.length;gate.release();await answer;await f.flush();
  assert.equal(f.updates.length,updates,'A stale API profile must never undo a newer quarantine setting');
  const staged=f.find(node=>node.type==='section'&&node.props.className==='call-memory-trace');
  assert(!JSON.stringify(staged).includes('rose lipstick'));assert(f.profile().quarantine.some(item=>item.category==='beauty'));
  assert(f.nodes().some(node=>node.props?.role==='alert'&&JSON.stringify(node.props.children).includes('profile changed')));
});

test('unmounting while confirmation is buffered prevents completion navigation or parent writes',async t=>{
  const f=callFixture();t.after(()=>f.dispose());await f.flush();await f.say('I read in the garden.');
  await f.find(node=>node.type==='button'&&node.props.className==='text-button call-review-story').props.onClick();await f.flush();
  const gate=f.holdNext('confirm');f.review()!.props.onConfirm({interests:['outdoors'],vibe:null,budgetPerItem:null,story:'Garden reading.'});await gate.entered;
  const updates=f.updates.length;f.dispose();assert.equal(gate.aborted(),true);gate.release();await f.flush();
  assert.equal(f.completed.length,0);assert.equal(f.updates.length,updates);
});
