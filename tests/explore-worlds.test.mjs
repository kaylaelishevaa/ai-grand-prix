import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import catalog from '../data/catalog.json' with {type:'json'};

const sources=['cold-start.js','explore-worlds.js'].map(name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8'));
const savedProfile={version:1,completed:true,interests:['focused_work'],vibe:'calm',budget:30000,story:'I enjoy a comfortable workspace.'};
function fixture({blocked=false,profile=null}={}){
  const document={activeElement:null},data=new Map();
  if(profile)data.set('coupi.preferences.v1',JSON.stringify(profile));
  class Element {
    constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.hidden=false;this.scrollTop=0;this.value='';this._text='';}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=nodes;this._text='';}
    set textContent(value){this._text=String(value);this.children=[];}
    get textContent(){return this._text+this.children.map(child=>child.textContent).join(' ');}
    setAttribute(key,value){this.attributes[key]=String(value);}
    click(){this.onclick?.({preventDefault(){}});}
  }
  const roots=new Map(['worlds-empty','worlds-view','worlds-content'].map(id=>[id,new Element('section')]));
  document.createElement=tag=>new Element(tag);
  document.getElementById=id=>roots.get(id)||[...roots.values()].flatMap(all).find(node=>node.id===id)||null;
  const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>{if(blocked)throw Error('Storage blocked');data.set(key,value);},removeItem:key=>{if(blocked)throw Error('Storage blocked');data.delete(key);}};
  const context={window:{localStorage:storage,COUPANG_PRODUCTS:catalog},document,console};vm.createContext(context);for(const source of sources)vm.runInContext(source,context);
  const nodes=()=>[...roots.values()].filter(root=>!root.hidden).flatMap(all);
  const button=label=>{const node=nodes().find(node=>node.tagName==='button'&&node.textContent===label);assert(node,'Missing visible button '+label);return node;};
  const link=label=>{const node=nodes().find(node=>node.tagName==='a'&&node.textContent===label);assert(node,'Missing visible link '+label);return node;};
  return {document,data,roots,button,link,nodes,api:context.window.CoupiPreferences};
}
function all(node){return [node,...node.children.flatMap(all)];}

test('new shoppers go straight to the call without an Explore questionnaire or partial profile',()=>{
  const f=fixture();assert.equal(f.roots.get('worlds-view').hidden,true);assert.equal(f.link('Talk with Coupi').href,'/call');
  assert.equal(f.data.size,0);assert.equal(f.api.load(),null);
  assert(!f.nodes().some(node=>['input','textarea','select','form'].includes(node.tagName)));
  assert.doesNotMatch(f.roots.get('worlds-empty').textContent,/quick picks|Tell your story|Prefer a conversation/);
});

test('confirmed conversation preferences retain sourced worlds and update through the call',()=>{
  const f=fixture({profile:savedProfile});assert.equal(f.roots.get('worlds-empty').hidden,true);assert.equal(f.roots.get('worlds-view').hidden,false);
  assert.equal(f.link('Talk to update').href,'/call?intent=personalize');
  const cards=f.nodes().filter(node=>node.className==='world-card');assert.equal(cards.length,1);assert.equal(cards[0].href,'/call?world=desk-reset');
  const photos=all(cards[0]).filter(node=>node.tagName==='img');assert(photos.length>0);
  for(const image of photos)assert(catalog.some(p=>p.image===image.src&&p.price<=savedProfile.budget));
  assert.equal(f.api.load().story,savedProfile.story);
});

test('reset can be cancelled, then clears preferences and returns the conversation entry',()=>{
  const f=fixture({profile:savedProfile});f.button('Reset preferences').click();
  f.button('Keep my worlds').click();assert.equal(f.data.size,1);assert.equal(f.roots.get('worlds-view').hidden,false);
  f.button('Reset preferences').click();f.button('Clear preferences').click();
  assert.equal(f.api.load(),null);assert.equal(f.data.size,0);assert.equal(f.roots.get('worlds-view').hidden,true);assert.equal(f.link('Talk with Coupi').href,'/call');
});

test('a failed reset preserves saved worlds and displays the storage error',()=>{
  const f=fixture({blocked:true,profile:savedProfile});f.button('Reset preferences').click();f.button('Clear preferences').click();
  assert.equal(f.roots.get('worlds-view').hidden,false);assert.equal(f.data.size,1);assert.match(f.roots.get('worlds-view').textContent,/could not be cleared/);
  assert.equal(f.api.load().story,savedProfile.story);
});
