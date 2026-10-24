import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import catalog from '../data/catalog.json' with {type:'json'};

const sources=['cold-start.js','explore-worlds.js'].map(name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8'));
function fixture({blocked=false}={}){
  const document={activeElement:null},data=new Map();
  class Element {
    constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.hidden=false;this.scrollTop=0;this.value='';this._text='';}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=nodes;this._text='';}
    set textContent(value){this._text=String(value);this.children=[];}
    get textContent(){return this._text+this.children.map(child=>child.textContent).join(' ');}
    setAttribute(key,value){this.attributes[key]=String(value);}
    querySelector(selector){const key=selector.match(/^\[data-focus-key="([^"]+)"\]$/)?.[1];return all(this).find(node=>node.dataset.focusKey===key)||null;}
    focus(options){document.activeElement=this;this.focusOptions=options;}
    click(){this.onclick?.({preventDefault(){}});}
  }
  const roots=new Map(['cold-start','worlds-view','worlds-content'].map(id=>[id,new Element('section')]));
  document.createElement=tag=>new Element(tag);
  document.createTextNode=text=>{const node=new Element('#text');node.textContent=text;return node;};
  document.getElementById=id=>roots.get(id)||[...roots.values()].flatMap(all).find(node=>node.id===id)||null;
  const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>{if(blocked)throw Error('Storage blocked');data.set(key,value);},removeItem:key=>{if(blocked)throw Error('Storage blocked');data.delete(key);}};
  const context={window:{localStorage:storage,COUPANG_PRODUCTS:catalog},document,console};vm.createContext(context);for(const source of sources)vm.runInContext(source,context);
  const button=label=>{const node=[...roots.values()].filter(root=>!root.hidden).flatMap(all).find(node=>node.tagName==='button'&&node.textContent===label);assert(node,'Missing visible button '+label);return node;};
  return {document,data,roots,button,api:context.window.CoupiPreferences,scroll:roots.get('worlds-content')};
}
function all(node){return [node,...node.children.flatMap(all)];}

test('editing review chips retains scroll, keyboard focus and the authored story until explicit save',()=>{
  const f=fixture();f.button('Tell your story').click();
  const story=f.document.getElementById('cold-story');story.value='I enjoy quiet reading evenings.';story.oninput();
  f.scroll.scrollTop=410;f.button('Up to ₩30,000').click();
  assert.equal(f.scroll.scrollTop,410);assert.equal(f.document.activeElement.textContent,'Up to ₩30,000');assert.equal(f.document.activeElement.focusOptions.preventScroll,true);
  assert.equal(f.document.getElementById('cold-story').value,story.value);assert.equal(f.data.size,0);
  f.scroll.scrollTop=250;f.button('My workspace').click();assert.equal(f.scroll.scrollTop,250);assert.equal(f.document.activeElement.textContent,'My workspace');
  f.button('Build my worlds →').click();
  const profile=f.api.load();assert.equal(profile.budget,30000);assert.equal(profile.story,story.value);assert.deepEqual(Array.from(profile.interests),['focused_work']);assert.equal(f.roots.get('worlds-view').hidden,false);
});

test('card choice keeps its position and focus while advancing to another question resets scroll',()=>{
  const f=fixture();f.button('Make a few quick picks →').click();
  const card=all(f.roots.get('cold-start')).find(node=>node.dataset.choice==='cozy_home');f.scroll.scrollTop=80;card.click();
  assert.equal(f.scroll.scrollTop,80);assert.equal(f.document.activeElement.dataset.choice,'cozy_home');assert.equal(f.document.activeElement.attributes['aria-pressed'],'true');
  f.button('Next →').click();assert.equal(f.scroll.scrollTop,0);assert.match(f.roots.get('cold-start').textContent,/What catches your eye/);assert.equal(f.data.size,0);
});

test('skip and back do not persist a partial onboarding profile',()=>{
  const f=fixture();f.button('Make a few quick picks →').click();f.button('Skip this').click();f.button('Skip this').click();f.button('Skip this').click();
  f.button('Beauty & color').click();f.button('← Back').click();assert.equal(f.api.load(),null);assert.equal(f.data.size,0);
  const skip=all(f.roots.get('cold-start')).find(node=>node.tagName==='a'&&node.textContent==='Skip setup & start shopping');assert.equal(skip.href,'/call');
});

test('storage failure preserves the editable review and offers a visible retry error',()=>{
  const f=fixture({blocked:true});f.button('Tell your story').click();const story=f.document.getElementById('cold-story');story.value='A comfortable workspace.';story.oninput();
  f.button('Build my worlds →').click();assert.equal(f.roots.get('worlds-view').hidden,true);assert.equal(f.document.getElementById('cold-story').value,story.value);assert.match(f.roots.get('cold-start').textContent,/could not be saved/);assert.equal(f.data.size,0);
});
