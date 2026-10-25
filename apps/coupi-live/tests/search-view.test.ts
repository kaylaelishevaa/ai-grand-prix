import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as profileModule from '../lib/profile';
import * as catalogModule from '../lib/catalog';
import type {AskResponse,Profile,Verdict} from '../lib/types';

const require=createRequire(import.meta.url),oldCss=require.extensions['.css'];require.extensions['.css']=()=>{};
const {searchCatalog,validateSearchAnswer}=require('../components/SearchView.tsx') as typeof import('../components/SearchView');
if(oldCss)require.extensions['.css']=oldCss;else delete require.extensions['.css'];
const initial=()=>profileModule.createProfile('search-test',new Date());
const pick:Verdict={pickSkuId:'socks',reason:'Red crew socks from this catalog.',dissent:'Two reviews mention pilling.',citations:['M01'],runnerUpSkuId:'socksBudget',whyRunnerUpLost:'A documented tradeoff.',clarifyingQuestion:null};
const meta={cached:false,offline:false,model:'fixture',inputTokens:0,outputTokens:0,latencyMs:1,cacheKey:'fixture'};
const verdict=(profile:Profile,v:Verdict=pick):AskResponse=>({status:'verdict',verdict:v,profile:{...profile,revision:profile.revision+1},meta});

test('keyword search uses catalog words and excludes owned or private items on every pass',()=>{
 const p=initial();assert(searchCatalog(p,'red socks').some(s=>s.id==='socks'));assert(searchCatalog(p,'RED SOCKS').some(s=>s.id==='socks'));
 assert.equal(searchCatalog(p,'some completely nonexistent object').length,0);
 assert.deepEqual(searchCatalog(p,'').map(s=>s.id),profileModule.eligibleCatalog(p).map(s=>s.id));
 assert(!searchCatalog(p,'detergent').some(s=>s.id==='detergent'));
 const privateProfile={...p,quarantine:[...p.quarantine,{category:catalogModule.getSku('socks')!.category,sensitive:true as const,note:'private'}]};
 assert(!searchCatalog(privateProfile,'socks').some(s=>s.id==='socks'));
 const owned={...p,owned:[...p.owned,{skuId:'socks',source:'approved' as const,acquiredAt:new Date().toISOString()}]};assert(!searchCatalog(owned,'red socks').some(s=>s.id==='socks'));
});

test('API acceptance rejects stale profiles, invalid picks and unrelated review IDs',()=>{
 const p=initial();assert.equal(validateSearchAnswer(verdict(p),p).status,'verdict');
 assert.throws(()=>validateSearchAnswer({...verdict(p),profile:{...p,id:'someone-else'}},p),/profile changed/);
 assert.throws(()=>validateSearchAnswer({...verdict(p),profile:{...p,revision:p.revision-1}},p),/profile changed/);
 assert.throws(()=>validateSearchAnswer(verdict(p,{...pick,pickSkuId:'made-up'}),p),/could not be checked/);
 assert.throws(()=>validateSearchAnswer(verdict(p,{...pick,citations:['kettle-001']}),p),/could not be checked/);
 assert.throws(()=>validateSearchAnswer(verdict(p,{...pick,citations:['invented-review']}),p),/could not be checked/);
 const reference=catalogModule.catalog.find(s=>s.origin==='coupang-reference')!;
 assert.equal(validateSearchAnswer(verdict(p,{...pick,pickSkuId:reference.id,runnerUpSkuId:null,citations:[],dissent:'No reviews are available.'}),p).status,'verdict');
});

type Node={type:any;props:Record<string,any>};
function fixture(){
 let tree:Node,cursor=0,disposed=false,scheduled=false;const slots:any[]=[],effects:(()=>void)[]=[],cleanups:(()=>void)[]=[],requests:{url:string;body:any;signal?:AbortSignal|null}[]=[],updates:Profile[]=[],opened:{id:string;verdict?:Verdict}[]=[];
 const replies:((body:any)=>Promise<Response>|Response)[]=[];
 const queue=()=>{if(scheduled||disposed)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(!disposed)render();});};
 const react={
  useState(value:any){const index=cursor++;if(!(index in slots))slots[index]=typeof value==='function'?value():value;return[slots[index],(next:any)=>{slots[index]=typeof next==='function'?next(slots[index]):next;queue();}];},
  useRef(value:any){const index=cursor++;return slots[index]??(slots[index]={current:value});},
  useEffect(effect:()=>void|(()=>void),deps:any[]){const index=cursor++,old=slots[index];if(!old||deps.some((value,i)=>value!==old[i])){slots[index]=deps;effects.push(()=>{cleanups[index]?.();cleanups[index]=effect()||(()=>{});});}},
 };
 const jsx=(type:any,props:Record<string,any>)=>({type,props}),marker=(name:string)=>Object.assign(()=>null,{displayName:name});
 const context=vm.createContext({console,AbortController,DOMException,crypto:globalThis.crypto,queueMicrotask,
  module:{exports:{}},exports:{},require(name:string){if(name==='react')return react;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};if(name==='@/lib/profile')return profileModule;if(name==='@/lib/catalog')return catalogModule;if(name.endsWith('.css'))return{};return{Glyph:marker('Glyph'),ProductVisual:marker('ProductVisual'),ProductEvidence:marker('ProductEvidence')};},
  async fetch(url:string,init:RequestInit){const body=JSON.parse(String(init.body));requests.push({url,body,signal:init.signal});const reply=replies.shift();assert(reply,'No real network is allowed by this fixture');return reply(body);},
 });context.exports=context.module.exports;
 vm.runInContext(ts.transpileModule(readFileSync(new URL('../components/SearchView.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 const Component=context.module.exports.default,props={profile:initial(),offline:false,onProfile(profile:Profile){props.profile=profile;updates.push(profile);queue();},onOpenProduct(id:string,verdict?:Verdict){opened.push({id,verdict});}};
 function render(){cursor=0;tree=Component(props);for(const effect of effects.splice(0))effect();}
 function walk(value:any):Node[]{if(value==null||typeof value==='boolean')return[];if(Array.isArray(value))return value.flatMap(walk);if(typeof value!=='object')return[];return[value,...walk(value.props?.children)];}
 const nodes=()=>walk(tree),find=(predicate:(node:Node)=>boolean)=>{const node=nodes().find(predicate);assert(node,'Expected UI node');return node;};
 const text=(value:any):string=>value==null||typeof value==='boolean'?'':Array.isArray(value)?value.map(text).join(' '):typeof value==='object'?text(value.props?.children):String(value);
 const flush=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setTimeout(resolve,0));};render();
 return{props,requests,updates,opened,nodes,find,text:()=>text(tree),flush,reply(fn:(body:any)=>Promise<Response>|Response){replies.push(fn);},async query(value:string){find(n=>n.props.id==='coopy-search').props.onChange({target:{value}});await flush();},async ask(){find(n=>n.type==='button'&&n.props.className==='search-ask').props.onClick();await flush();},updateProfile(p:Profile){props.profile=p;queue();},dispose(){disposed=true;for(const cleanup of cleanups)cleanup?.();}};
}

test('local search and pagination need no network and keep every eligible match reachable',async t=>{
 const f=fixture();t.after(()=>f.dispose());await f.flush();
 const total=profileModule.eligibleCatalog(f.props.profile).length;
 while(f.nodes().some(n=>n.props.className==='search-more')){f.find(n=>n.props.className==='search-more').props.onClick();await f.flush();}
 assert.equal(f.nodes().filter(n=>n.props.className==='search-product').length,total);assert.equal(f.requests.length,0);
 await f.query('red socks');f.find(n=>n.type==='form'&&n.props.role==='search').props.onSubmit({preventDefault(){}});await f.flush();assert.equal(f.requests.length,0);assert.match(f.text(),/Keyword matches/);
 f.find(n=>n.props.className==='search-product').props.onClick();assert.equal(f.opened.length,1);assert.equal(f.opened[0].verdict,undefined);
 await f.query('no such unknown item');assert.match(f.text(),/No exact keyword matches/);
});

test('Ask Coopy handles one clarification with original context then opens the checked verdict',async t=>{
 const f=fixture();t.after(()=>f.dispose());await f.flush();await f.query('red socks for tomorrow');
 f.reply(()=>Response.json({status:'clarify',profile:{...f.props.profile,revision:1},meta,verdict:{...pick,pickSkuId:null,runnerUpSkuId:null,citations:[],clarifyingQuestion:'Which size do you need?'}}));await f.ask();
 assert.match(f.text(),/Which size do you need/);assert.equal(f.opened.length,0);
 f.find(n=>n.props.id==='coopy-search-answer').props.onChange({target:{value:'Use the listed one-size fit.'}});await f.flush();
 f.reply(body=>{assert.equal(body.question,'red socks for tomorrow');assert.deepEqual(body.clarification,{question:'Which size do you need?',answer:'Use the listed one-size fit.'});return Response.json(verdict(f.props.profile));});
 f.find(n=>n.type==='form'&&n.props.className==='search-clarification').props.onSubmit({preventDefault(){}});await f.flush();
 assert.equal(f.updates.length,2);assert.match(f.text(),/COOPY’S PICK/);assert(f.nodes().some(n=>n.type==='details'));
 f.find(n=>n.props.className==='search-open-pick').props.onClick();assert.deepEqual(f.opened,[{id:'socks',verdict:pick}]);
 const next={...f.props.profile,revision:f.props.profile.revision+1};f.updateProfile(next);await f.flush();assert(!f.text().includes(pick.reason));assert.match(f.text(),/preferences changed/);
});

test('failed calls retain the exact retry receipt; fallback exposes the full eligible raw catalog',async t=>{
 const f=fixture();t.after(()=>f.dispose());await f.flush();await f.query('a confusing request');
 f.reply(()=>Response.json({error:'Cache miss for this rehearsal.'},{status:503}));await f.ask();assert.match(f.text(),/Cache miss/);
 f.reply(()=>Response.json({status:'fallback',message:'The evidence could not be validated.',catalog:catalogModule.catalog,reviews:[],profile:{...f.props.profile,revision:1}}));
 f.find(n=>n.type==='button'&&f.nodes().some(parent=>parent.props.role==='alert'&&JSON.stringify(parent.props.children).includes('Try again'))&&n.props.children?.[0]==='Try again ').props.onClick();await f.flush();
 assert.equal(f.requests[0].body.requestId,f.requests[1].body.requestId);assert.match(f.text(),/Available products/);assert(!f.text().includes(catalogModule.getSku('detergent')!.name));
 while(f.nodes().some(n=>n.props.className==='search-more')){f.find(n=>n.props.className==='search-more').props.onClick();await f.flush();}
 assert.equal(f.nodes().filter(n=>n.props.className==='search-product').length,profileModule.eligibleCatalog(f.props.profile).length);
});

test('buffered replies cannot undo a newer profile, cross profiles, or survive cancellation',async t=>{
 const f=fixture();t.after(()=>f.dispose());await f.flush();await f.query('red socks');
 let release!:(response:Response)=>void;f.reply(()=>new Promise(resolve=>{release=resolve;}));await f.ask();
 f.updateProfile({...f.props.profile,revision:5});await f.flush();release(Response.json(verdict(initial())));await f.flush();assert.equal(f.updates.length,0);assert.match(f.text(),/profile changed/);
 f.reply(()=>new Promise(resolve=>{release=resolve;}));await f.ask();f.find(n=>n.type==='button'&&n.props.children==='Cancel').props.onClick();release(Response.json(verdict(f.props.profile)));await f.flush();assert.equal(f.requests.at(-1)!.signal?.aborted,true);assert.equal(f.updates.length,0);
 f.reply(()=>new Promise(resolve=>{release=resolve;}));await f.ask();f.updateProfile({...initial(),id:'new-profile'});await f.flush();release(Response.json(verdict({...initial(),revision:7})));await f.flush();assert.equal(f.updates.length,0);assert.equal(f.opened.length,0);assert.equal(f.requests.at(-1)!.signal?.aborted,true);
});

test('owned-item refusal renders an explanation without opening a recommendation',async t=>{
 const f=fixture();t.after(()=>f.dispose());await f.flush();await f.query('more laundry detergent');
 f.reply(()=>Response.json({status:'blocked',message:'You already have this detergent.',skuId:'detergent',profile:{...f.props.profile,revision:1}}));await f.ask();assert.match(f.text(),/You already have/);assert.match(f.text(),/Nothing added/);assert.equal(f.opened.length,0);assert.equal(f.nodes().some(n=>n.props.className==='search-open-pick'),false);
});

test('illustrated discovery uses only eligible products and invitations only run local searches',async t=>{
 const f=fixture();t.after(()=>f.dispose());await f.flush();
 const invitation=f.find(n=>n.props.className==='search-invitation');invitation.props.onClick();await f.flush();
 assert.equal(f.requests.length,0);assert.equal(f.find(n=>n.props.id==='coopy-search').props.value,'mugs');
 assert.equal(f.find(n=>n.props.className==='search-view').props['data-searching'],true);
 await f.query('');const category=catalogModule.getSku('mugs')!.category;
 f.updateProfile({...f.props.profile,revision:1,quarantine:[...f.props.profile.quarantine,{category,sensitive:true,note:'private'}],owned:[...f.props.profile.owned,{skuId:'socks',source:'approved',acquiredAt:new Date().toISOString()}]});await f.flush();
 const visualSkus=f.nodes().filter(n=>n.type?.displayName==='ProductVisual').map(n=>n.props.sku);
 assert(!visualSkus.some(sku=>sku.category===category||sku.id==='socks'));
 assert.equal(f.nodes().filter(n=>n.props.className==='search-invitation').length,1);
});
