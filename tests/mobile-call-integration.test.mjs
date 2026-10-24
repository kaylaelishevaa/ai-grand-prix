import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import catalog from '../data/catalog.json' with {type:'json'};
const html=readFileSync(new URL('../site-pages/camera.html',import.meta.url),'utf8');
const stateSource=readFileSync(new URL('../public/mobile-call-state.js',import.meta.url),'utf8');
const moduleSources=['product-discovery.js','call-conversation.js','product-evidence.js','demo-checkout.js','purchase-pairings.js','cold-start.js','call-personalization.js'].map(name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8'));
const source=readFileSync(new URL('../public/mobile-call.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.nodeType=1;this.hidden=false;this.disabled=false;this.open=false;this.dataset={};this.style={};this.children=[];this.attributes={};this.listeners=new Map();this.value='';this.files=[];this.scrollTop=0;this.clientHeight=100;this._text='';const classes=new Set();this.classList={add:(...c)=>c.forEach(x=>classes.add(x)),remove:(...c)=>c.forEach(x=>classes.delete(x)),contains:c=>classes.has(c),toggle:(c,on)=>{const active=on===undefined?!classes.has(c):on;active?classes.add(c):classes.delete(c);return active;}};}
  set textContent(value){this._text=String(value??'');this.children=[];} get textContent(){return this._text+this.children.map(child=>child.textContent).join(' ');}
  get scrollHeight(){return this._scrollHeight??this.children.length*40;}
  setAttribute(k,v){this.attributes[k]=String(v);} getAttribute(k){return this.attributes[k]??null;} removeAttribute(k){delete this.attributes[k];if(k==='src')delete this.src;}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}} replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);}
  removeChild(node){const index=this.children.indexOf(node);assert.notEqual(index,-1);this.children.splice(index,1);return node;}
  set scrollHeight(value){this._scrollHeight=value;}
  addEventListener(k,fn){if(!this.listeners.has(k))this.listeners.set(k,[]);this.listeners.get(k).push(fn);}
  emit(k,event={}){for(const fn of this.listeners.get(k)||[])fn(event);}
  showModal(){this.open=true;} close(){this.open=false;this.emit('close');}
  scrollIntoView(){this.didScrollIntoView=true;}
  click(){return this.onclick?.({target:this,preventDefault(){}});} focus(){} setPointerCapture(){}
  closest(selector){let current=this;while(current){if(selector.split(',').some(s=>s.trim().toUpperCase()===current.tagName))return current;current=current.parentElement;}return null;}
}

function fixture(t,options={}){
  const nodes=new Map([...html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*?\bid="([^"]+)"[^>]*>/gi)].map(m=>[m[2],new Element(m[1])]));
  for(const match of html.matchAll(/<dialog\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/dialog>/g))for(const child of match[2].matchAll(/\bid="([^"]+)"/g)){if(nodes.has(child[1]))nodes.get(child[1]).parentElement=nodes.get(match[1]);}
  const events=new Element(),docEvents=new Element(),sequence=[],intervals=[],storage=options.storage||new Map();
  nodes.get('vision-consent').checked=true;
  let cameraStarts=0,voiceStarts=0,gestureInstance;
  class Camera {
    constructor(opts){this.opts=opts;this.running=false;this.options={};this.errors={};this.canvas={width:720,height:1280};this.gen=0;this.productGen=0;this.stops=0;this.starts=[];}
    setOptions(opts){Object.assign(this.options,opts);}
    async start(settings={}){sequence.push('camera');cameraStarts++;this.starts.push({...settings});const token=++this.gen;this.running=false;this.opts.onStatus('Opening camera','loading');if(options.cameraPermission)await options.cameraPermission(cameraStarts);const allowed=options.cameraStart?await options.cameraStart(settings,cameraStarts):true;if(token!==this.gen)return false;if(allowed===false){this.lastCameraError={message:'Requested camera is unavailable.'};return false;}this.actualFacingMode=options.actualFacingMode||settings.facingMode||'user';this.running=true;this.opts.onStatus('Live','success');return true;}
    stop(){this.gen++;this.productGen++;this.running=false;this.stops++;}
    async setMode(mode){if(mode==='none'||(this.product&&this.product.category!==mode))await this.setProduct(null);this.mode=mode;if(options.modelLoad)await options.modelLoad();}
    async setProduct(product){const token=++this.productGen;if(product&&options.productLoad)await options.productLoad(product);if(token!==this.productGen)return {ok:false,stale:true};this.product=product;return product?{ok:true,productId:product.id,kind:product.category==='makeup'?'lip':product.category==='clothes'?'garment':product.category==='glasses'?'glasses':'object',shadeColor:product.category==='makeup'?'#bc3c57':undefined,shadeEstimated:product.category==='makeup'}:{ok:true};}
  }
  class Voice {
    constructor(opts){this.opts=opts;this.options=opts;this.uploads=[];this.sentTexts=[];this.mutes=0;this.purchases=[];this.call=null;this.ends=0;this.contexts=[];this.images=[];this.imageClears=0;this.textMode=false;}
    async start(){sequence.push('voice');voiceStarts++;this.call={ready:true,muted:this.textMode,mutedBeforeText:false};this.opts.onState({state:'connected',muted:this.call.muted,connectedAt:Date.now()});return true;}
    end(){this.ends++;this.call=null;this.opts.onState({state:'idle',muted:false,connectedAt:null});}
    updateContext(value){this.contexts.push(value);} mute(){this.mutes++;if(this.call&&!this.textMode){this.call.muted=!this.call.muted;this.opts.onState({state:'connected',muted:this.call.muted});}} sendText(value){this.sentTexts.push(value);if(options.textSend)return options.textSend(value);if(!this.call?.ready||!value.trim())return false;this.opts.onTranscript({role:'user',key:'typed-'+this.contexts.length,text:value.trim(),final:true});return true;} async resumeAudio(){}
    setTextMode(enabled){if(enabled===this.textMode)return;this.textMode=enabled;if(this.call){if(enabled){this.call.mutedBeforeText=this.call.muted;this.call.muted=true;}else this.call.muted=this.call.mutedBeforeText;if(this.call.ready)this.opts.onState({state:'connected',muted:this.call.muted});}}
    async sendImage(value){this.uploads.push(value);return options.imageSend?await options.imageSend(value):!!this.call;}
    sendCameraSnapshot(frame){if(!this.opts.getVisionEnabled())return false;this.images.push(frame);this.opts.onVisionState({state:'received',capturedAt:frame.metadata.capturedAt});return true;}
    notifyCheckoutComplete(receipt,suggestions){this.purchases.push({receipt,suggestions});return !!this.call?.ready;}
    clearCameraSnapshots(){this.imageClears++;this.opts.onVisionState({state:'paused'});return true;}
  }
  class Snapshots {constructor(opts){this.opts=opts;}capture(reason){return this.opts.isEnabled()?{images:[{kind:'camera',dataUrl:'data:image/jpeg;base64,AQID'}],metadata:{reason,capturedAt:new Date().toISOString()}}:null;}clear(){}}
  class Hands {constructor(opts){gestureInstance=this;this.opts=opts;this.running=false;}async start(){this.running=true;}stop(){this.running=false;}reset(){}}
  const context={window:{location:{search:options.search||'',href:'/call'},COUPANG_PRODUCTS:options.catalog||catalog,localStorage:options.storage||{getItem(){return null;},setItem(){}},requestAnimationFrame:fn=>{fn();return 1;},CoupiChatImages:{prepare:async file=>options.imagePrepare?await options.imagePrepare(file):{dataUrl:'data:image/jpeg;base64,AQID',name:file.name,width:100,height:100}},NookCamera:Camera,NookVoiceSession:Voice,NookHandGestures:Hands,NookCameraSnapshots:Snapshots,addEventListener:(...a)=>events.addEventListener(...a)},document:{getElementById:id=>nodes.get(id)||null,createElement:tag=>new Element(tag),querySelector:selector=>selector==='dialog[open]'?[...nodes.values()].find(n=>n.tagName==='DIALOG'&&n.open)||null:null,addEventListener:(...a)=>docEvents.addEventListener(...a),hidden:false},setTimeout:(fn,ms)=>ms===220?setTimeout(fn,0):0,clearTimeout,setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},clearInterval,console,URL,URLSearchParams,requestAnimationFrame:fn=>{fn();return 1;}};
  context.window.localStorage=options.blockStorage?{getItem(){throw Error('Storage blocked');}}:typeof storage.getItem==='function'?storage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  context.URL=URL;context.AbortController=AbortController;context.window.fetch=options.fetch||(()=>{throw Error('Unexpected network request');});
  vm.createContext(context);vm.runInContext(stateSource,context);for(const moduleSource of moduleSources)vm.runInContext(moduleSource,context);vm.runInContext(source,context);
  const mobile=context.window.NookMobile;
  t.after(()=>nodes.get('end-call').onclick());
  return {...mobile,nodes,context,sequence,docEvents,events,storage,hands:gestureInstance,visionTick:()=>intervals.find(i=>i.ms===3000).fn(),get cameraStarts(){return cameraStarts;},get voiceStarts(){return voiceStarts;}};
}

test('camera sharing follows consent, pause/resume, camera-off and end while local try-on remains usable',async t=>{
  const f=fixture(t);f.visionTick();assert.equal(f.voice.images.length,0);
  await f.nodes.get('answer-call').onclick();f.visionTick();assert.equal(f.voice.images.length,1);
  assert.equal(f.nodes.get('vision-status').textContent,'Coupi sees snapshots');
  f.nodes.get('vision-toggle').onclick();f.visionTick();assert.equal(f.voice.images.length,1);assert(f.voice.imageClears>0);assert.equal(f.camera.running,true);
  assert.equal(f.nodes.get('vision-status').hidden,true);assert.equal(f.nodes.get('vision-status').textContent,'');
  assert.equal(f.nodes.get('vision-action').textContent,'Resume');assert.equal(f.nodes.get('vision-toggle').attributes['aria-label'],'Resume camera sharing with Coupi');
  f.voice.opts.onRecommendations(catalog.filter(p=>p.category==='desk'));await f.voice.opts.onTryon('desk',{x:.25});assert.equal(f.camera.options.x,.25);assert.equal(f.voice.opts.getCameraSnapshot('tool'),null);
  f.nodes.get('vision-toggle').onclick();assert.equal(f.voice.images.length,2);assert.equal(f.voice.images[1].metadata.reason,'resume');
  assert.equal(f.nodes.get('vision-status').hidden,false);assert.equal(f.nodes.get('vision-status').textContent,'Coupi sees snapshots');
  await f.nodes.get('toggle-camera').onclick();f.visionTick();assert.equal(f.voice.images.length,2);
  f.nodes.get('end-call').onclick();f.visionTick();assert.equal(f.voice.images.length,2);
});

test('camera sharing indicator stays steady between snapshot sends and acknowledgements',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  const status=f.nodes.get('vision-status'),toggle=f.nodes.get('vision-toggle'),emit=f.voice.opts.onVisionState;
  emit({state:'sent'});assert.equal(status.textContent,'Sharing camera…');
  emit({state:'received',capturedAt:new Date().toISOString()});
  assert.equal(status.textContent,'Coupi sees snapshots');assert.equal(toggle.dataset.state,'received');
  let writes=0,value=status.textContent;
  Object.defineProperty(status,'textContent',{get:()=>value,set:next=>{writes++;value=next;}});
  for(let i=0;i<3;i++){
    emit({state:'sent'});
    assert.equal(status.textContent,'Coupi sees snapshots');assert.equal(toggle.dataset.state,'received');
    emit({state:'received',capturedAt:new Date().toISOString()});
  }
  assert.equal(writes,0);
  emit({state:'received',capturedAt:new Date(Date.now()-15000).toISOString()});
  emit({state:'sent'});assert.equal(status.textContent,'Refreshing Coupi’s view…');assert.equal(toggle.dataset.state,'refreshing');
  emit({state:'error'});assert.equal(status.textContent,'Camera sharing delayed');assert.equal(toggle.dataset.state,'error');
  emit({state:'received',capturedAt:new Date().toISOString()});assert.equal(status.textContent,'Coupi sees snapshots');
  toggle.onclick();assert.equal(status.hidden,true);assert.equal(toggle.dataset.state,'paused');
  toggle.onclick();assert.equal(status.hidden,false);assert.equal(status.textContent,'Coupi sees snapshots');
  await f.nodes.get('toggle-camera').onclick();assert.equal(status.textContent,'Camera off · Coupi can’t see');assert.equal(toggle.dataset.state,'paused');
});

test('swipe hint appears only while a product card is available',async t=>{
  const f=fixture(t);assert.equal(f.nodes.get('gesture-status').hidden,true);
  f.nodes.get('vision-consent').checked=false;await f.nodes.get('answer-call').onclick();
  assert.equal(f.nodes.get('gesture-status').hidden,true);
  f.voice.opts.onRecommendations([catalog[0]]);
  assert.equal(f.nodes.get('gesture-status').hidden,false);
  await f.nodes.get('product-skip').onclick();
  assert.equal(f.nodes.get('gesture-status').hidden,false);
  f.voice.opts.onRecommendations([],'',{sourceOnly:true});
  assert.equal(f.nodes.get('gesture-status').hidden,true);
  f.voice.opts.onRecommendations([catalog[0]]);
  assert.equal(f.nodes.get('gesture-status').hidden,false);
  f.nodes.get('end-call').onclick();assert.equal(f.nodes.get('gesture-status').hidden,true);
});

test('camera opt-out and hidden page never share a frame',async t=>{
  const f=fixture(t);f.nodes.get('vision-consent').checked=false;await f.nodes.get('answer-call').onclick();
  f.visionTick();assert.equal(f.camera.running,false);assert.equal(f.cameraStarts,0);assert.equal(f.voice.images.length,0);
  assert.equal(f.nodes.get('vision-status').hidden,true);assert.equal(f.nodes.get('vision-action').textContent,'Resume');
  assert.deepEqual(f.sequence,['voice']);assert.equal(f.nodes.get('phone-app').dataset.phase,'active');
  assert.equal(f.nodes.get('camera-fallback').hidden,false);assert.equal(f.nodes.get('toggle-camera').attributes['aria-label'],'Turn camera on');
  assert.equal(f.nodes.get('camera-fallback-text').textContent,'Camera off. Tap Camera to turn it on.');
  await f.nodes.get('toggle-camera').onclick();f.visionTick();
  assert.equal(f.camera.running,true);assert.equal(f.cameraStarts,1);assert.equal(f.voiceStarts,1);assert.equal(f.voice.images.length,0);
  f.context.document.hidden=true;f.nodes.get('vision-toggle').onclick();f.visionTick();assert.equal(f.voice.images.length,0);
  f.docEvents.emit('visibilitychange');assert.equal(f.voice.call,null);assert.equal(f.camera.running,false);
});

test('starting a call with camera opt-out closes a camera opened while browsing',async t=>{
  const f=fixture(t);f.nodes.get('vision-consent').checked=false;f.nodes.get('decline-call').onclick();
  await f.nodes.get('product-try').onclick();assert.equal(f.camera.running,true);
  await f.nodes.get('retry-call').onclick();await tick();
  assert.equal(f.camera.running,false);assert.equal(f.cameraStarts,1);assert.equal(f.voice.call.ready,true);
  f.visionTick();assert.equal(f.voice.images.length,0);
});

test('camera opt-out cancels a pending browse camera request and still allows manual activation',async t=>{
  const permission=deferred();const f=fixture(t,{cameraPermission:n=>n===1?permission.promise:Promise.resolve()});
  f.nodes.get('vision-consent').checked=false;f.nodes.get('decline-call').onclick();
  const opening=f.nodes.get('toggle-camera').onclick();
  await f.nodes.get('retry-call').onclick();await tick();
  assert.equal(f.voice.call.ready,true);assert.equal(f.camera.running,false);assert.equal(f.cameraStarts,1);
  permission.resolve();await opening;assert.equal(f.camera.running,false);
  await f.nodes.get('toggle-camera').onclick();assert.equal(f.camera.running,true);assert.equal(f.cameraStarts,2);
  f.visionTick();assert.equal(f.voice.images.length,0);
});

test('calling again preserves camera opt-out after manually turning the camera on',async t=>{
  const f=fixture(t);f.nodes.get('vision-consent').checked=false;await f.nodes.get('answer-call').onclick();
  await f.nodes.get('toggle-camera').onclick();f.nodes.get('end-call').onclick();
  f.nodes.get('call-again').onclick();await tick();
  assert.equal(f.camera.running,false);assert.equal(f.cameraStarts,1);assert.equal(f.voiceStarts,2);
  assert.equal(f.voice.call.ready,true);f.visionTick();assert.equal(f.voice.images.length,0);
});

test('mobile entry boots against real HTML IDs, and Browse requests no camera or voice',t=>{
  const f=fixture(t);assert(f.voice);assert.equal(f.cameraStarts,0);assert.equal(f.voiceStarts,0);
  f.nodes.get('decline-call').onclick();
  assert.equal(f.nodes.get('phone-app').dataset.phase,'browse');assert.equal(f.cameraStarts,0);assert.equal(f.voiceStarts,0);
  assert.equal(f.store.queue.length,Math.min(10,catalog.filter(p=>p.productType==='lipstick').length));assert(f.store.queue.every(p=>p.productType==='lipstick'));assert.equal(f.nodes.get('product-zone').hidden,false);
});

test('Answer starts camera then real-call adapter; End closes both and returns to the start screen',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  assert.deepEqual(f.sequence,['camera','voice']);assert.equal(f.nodes.get('phone-app').dataset.phase,'active');
  f.nodes.get('end-call').onclick();assert.equal(f.camera.running,false);assert.equal(f.voice.call,null);assert.equal(f.nodes.get('phone-app').dataset.phase,'incoming');
});

test('captions show the latest speaker while preserving conversation state',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  const emit=e=>f.voice.opts.onTranscript(e);
  emit({role:'user',key:'early-user',text:'I want a shirt'});
  assert.equal(f.nodes.get('caption-speaker').textContent,'You');assert.equal(f.nodes.get('caption-text').textContent,'I want a shirt');
  emit({role:'assistant',key:'reply',delta:'What colour?'});
  assert.equal(f.store.messages.length,2);assert.equal(f.store.messages[0].key,'early-user');
  assert.equal(f.nodes.get('caption-speaker').textContent,'Coupi');assert.equal(f.nodes.get('caption-text').textContent,'What colour?');
  assert.equal(f.nodes.get('transcript').hidden,false);
});

test('streaming captions reuse the text box, follow new text and skip unchanged final writes',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();const emit=e=>f.voice.opts.onTranscript(e);
  emit({role:'user',key:'question',text:'A lamp'});emit({role:'assistant',key:'reply',delta:'Here'});
  const body=f.nodes.get('caption-text');body.scrollHeight=220;
  emit({role:'assistant',key:'reply',delta:' is a lamp'});
  assert.equal(f.nodes.get('caption-text'),body);assert.equal(body.textContent,'Here is a lamp');assert.equal(body.scrollTop,220);
  let writes=0,value=body.textContent;
  Object.defineProperty(body,'textContent',{get:()=>value,set:next=>{writes++;value=next;}});
  emit({role:'assistant',key:'reply',text:'Here is a lamp',final:true});
  assert.equal(writes,0);
  emit({role:'assistant',key:'reply',text:'Here is the lamp.',final:true});
  assert.equal(writes,1);assert.equal(body.textContent,'Here is the lamp.');
});

test('late transcripts cannot replace the current caption and a new call resets it',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();const emit=e=>f.voice.opts.onTranscript(e),body=f.nodes.get('caption-text');
  emit({role:'user',key:'question',text:'A lamp'});emit({role:'assistant',key:'reply',text:'Here is one'});
  emit({role:'user',key:'next-question',text:'Another one'});
  emit({role:'assistant',key:'reply',text:'Late final reply'});
  emit({role:'user',key:'question',text:'Late update'});
  assert.equal(body.textContent,'Another one');assert.equal(f.nodes.get('caption-speaker').textContent,'You');
  emit({role:'assistant',key:'next-reply',delta:'Another lamp'});
  assert.equal(body.textContent,'Another lamp');
  f.nodes.get('end-call').onclick();f.nodes.get('call-again').onclick();await tick();
  assert.equal(f.nodes.get('caption-text'),body);assert.equal(body.textContent,'What do you want to buy?');
  assert.equal(f.nodes.get('caption-speaker').textContent,'Coupi');
});

test('text mode retains the composer and full history through sends, replies, previews and toggling',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();const emit=f.voice.opts.onTranscript;
  emit({role:'assistant',key:'greeting',text:'Hi, I’m Coupi. How can I help you today?',final:true});
  const toggle=f.nodes.get('text-toggle'),form=f.nodes.get('text-form'),input=f.nodes.get('text-input'),history=f.nodes.get('conversation-history');
  toggle.onclick();assert.equal(form.hidden,false);assert.equal(history.hidden,false);assert.equal(f.nodes.get('transcript').hidden,true);
  assert.equal(toggle.attributes['aria-expanded'],'true');assert.equal(toggle.attributes['aria-pressed'],'true');
  assert.equal(history.children.length,1);
  input.value='I want black glasses';form.onsubmit({preventDefault(){}});
  assert.equal(input.value,'');assert.equal(form.hidden,false);assert.equal(history.children.length,2);
  assert.equal(history.children[1].children[0].textContent,'You');assert.equal(history.children[1].children[2].textContent,'I want black glasses');
  emit({role:'assistant',key:'reply',delta:'Here are some '});emit({role:'assistant',key:'reply',delta:'glasses.'});emit({role:'assistant',key:'reply',text:'Here are some glasses.',final:true});
  assert.equal(history.children.length,3);assert.equal(history.children[2].children[2].textContent,'Here are some glasses.');
  assert.equal(f.nodes.get('transcript').hidden,true);
  f.voice.opts.onRecommendations(catalog.filter(p=>p.category==='glasses'));await f.voice.opts.onProductAction('try_on');
  assert.equal(f.nodes.get('phone-app').dataset.focused,'false');assert.equal(form.hidden,false);assert.equal(history.hidden,false);
  assert.equal(f.nodes.get('focus-toggle').hidden,true);assert.equal(f.nodes.get('gesture-status').hidden,true);
  await f.nodes.get('toggle-camera').onclick();assert.equal(form.hidden,false);assert.equal(history.hidden,false);
  toggle.onclick();assert.equal(form.hidden,true);assert.equal(history.hidden,true);assert.equal(toggle.attributes['aria-expanded'],'false');assert.equal(f.nodes.get('transcript').hidden,false);
  emit({role:'user',key:'next',text:'Another pair'});emit({role:'assistant',key:'reply-2',text:'Let’s find another pair.'});
  toggle.onclick();assert.equal(history.children.length,5);assert.equal(history.children[0].children[2].textContent,'Hi, I’m Coupi. How can I help you today?');
  assert.equal(form.hidden,false);assert.equal(f.store.messages.length,5);
  assert.equal(f.nodes.get('transcript').hidden,true);
});

test('choosing text automatically disables voice and returning restores the previous microphone setting',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  const toggle=f.nodes.get('text-toggle'),mic=f.nodes.get('mute-call');
  toggle.onclick();assert.equal(f.voice.textMode,true);assert.equal(f.voice.call.muted,true);
  assert.equal(mic.disabled,true);assert.equal(mic.attributes['aria-pressed'],'true');assert.equal(mic.attributes['aria-label'],'Microphone off in text mode');
  assert.equal(f.nodes.get('call-status').textContent,'Text mode');assert.equal(f.camera.running,true);assert.equal(f.voice.ends,0);
  f.voice.opts.onPlaybackBlocked(true);assert.equal(f.nodes.get('play-audio').hidden,true);
  f.voice.opts.onState({state:'speaking',muted:true});assert.equal(f.nodes.get('call-status').textContent,'Replying…');
  toggle.onclick();assert.equal(f.voice.textMode,false);assert.equal(f.voice.call.muted,false);assert.equal(mic.disabled,false);
  assert.equal(f.nodes.get('call-status').textContent,'Live with Coupi');
  mic.onclick();assert.equal(f.voice.call.muted,true);toggle.onclick();toggle.onclick();assert.equal(f.voice.call.muted,true);
  assert.equal(f.nodes.get('call-status').textContent,'Mic muted');
  toggle.onclick();f.nodes.get('end-call').onclick();f.nodes.get('call-again').onclick();await tick();
  assert.equal(f.voice.textMode,true);assert.equal(f.voice.call.muted,true);assert.equal(f.nodes.get('call-status').textContent,'Text mode');
});

test('streaming history preserves rows and scroll position while reading older messages',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.nodes.get('text-toggle').onclick();
  const emit=f.voice.opts.onTranscript,history=f.nodes.get('conversation-history');
  emit({role:'assistant',key:'greeting',text:'Hello'});emit({role:'user',key:'question',text:'A lamp'});emit({role:'assistant',key:'reply',delta:'Here'});
  const row=history.children[2],body=row.children[2];history.scrollHeight=1000;history.clientHeight=300;history.scrollTop=100;history.emit('scroll');
  emit({role:'assistant',key:'reply',delta:' is one'});
  assert.equal(history.children[2],row);assert.equal(body.textContent,'Here is one');assert.equal(history.scrollTop,100);
  history.scrollTop=700;history.emit('scroll');emit({role:'assistant',key:'reply',delta:'.'});assert.equal(history.scrollTop,1000);
  let writes=0,value=body.textContent;Object.defineProperty(body,'textContent',{get:()=>value,set:next=>{writes++;value=next;}});
  emit({role:'assistant',key:'reply',text:'Here is one.',final:true});assert.equal(writes,0);
  emit({role:'user',key:'next',text:'Another lamp'});emit({role:'assistant',key:'reply',text:'Here is the first lamp.',final:true});
  assert.equal(history.children.length,4);assert.equal(history.children[2],row);assert.equal(body.textContent,'Here is the first lamp.');
  assert.equal(f.nodes.get('caption-text').textContent,'Another lamp');
});

test('unsent drafts remain in text mode and a new call clears only the old history',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.nodes.get('text-toggle').onclick();
  const input=f.nodes.get('text-input'),form=f.nodes.get('text-form'),history=f.nodes.get('conversation-history');
  input.value='My draft';f.voice.call.ready=false;form.onsubmit({preventDefault(){}});
  assert.equal(input.value,'My draft');assert.equal(form.hidden,false);
  f.voice.opts.onState({state:'error',message:'Connection paused',muted:true});
  assert.equal(f.nodes.get('text-toggle').disabled,false);
  f.nodes.get('text-toggle').onclick();assert.equal(form.hidden,true);assert.equal(input.value,'My draft');
  f.voice.call.ready=true;f.voice.opts.onState({state:'connected',muted:true});f.nodes.get('text-toggle').onclick();
  f.voice.opts.onTranscript({role:'assistant',key:'old',text:'Previous call'});
  f.nodes.get('end-call').onclick();f.nodes.get('call-again').onclick();await tick();
  assert.equal(form.hidden,false);assert.equal(history.children.length,1);assert.equal(history.children[0].children[2].textContent,'What do you want to buy?');
});

test('conversation history keeps earlier turns available in stable order',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();const emit=f.voice.opts.onTranscript;
  emit({role:'user',key:'early-user',text:'Glasses'});emit({role:'assistant',key:'reply',text:'What colour?'});
  emit({role:'user',key:'next-user',text:'Blue'});emit({role:'assistant',key:'next-reply',text:'Here are your picks'});
  assert.equal(f.nodes.get('conversation-history').children.length,4);assert.deepEqual(Array.from(f.store.messages,m=>m.key),['early-user','reply','next-user','next-reply']);
});

test('spoken partial overlay updates preserve existing settings and none fully clears',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  f.voice.opts.onRecommendations(catalog.filter(p=>p.category==='desk'));
  await f.voice.opts.onTryon('desk',{opacity:.7,x:.3});
  await f.voice.opts.onTryon('desk',{y:.8});
  assert.equal(f.camera.options.opacity,.7);assert.equal(f.camera.options.x,.3);assert.equal(f.camera.options.y,.8);assert.equal(f.camera.product.id,f.store.current.id);
  await assert.rejects(f.voice.opts.onTryon('desk',{color:'#123456'}),/real product photo/);
  await f.voice.opts.onTryon('none',{opacity:.9});assert.equal(f.camera.options.opacity,0);assert.equal(f.nodes.get('tryon-chip').hidden,true);
});

test('selecting two products in one category changes the actual photo source and voice context',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();const products=catalog.filter(p=>p.category==='clothes');f.voice.opts.onRecommendations(products);
  const first=await f.voice.opts.onProductAction('try_on',products[0].id);assert.equal(first.product.id,products[0].id);assert.equal(f.camera.product.image,products[0].image);
  await f.voice.opts.onProductAction('try_on',products[1].id);assert.equal(f.camera.product.id,products[1].id);assert.equal(f.camera.product.image,products[1].image);
  const current=f.voice.opts.getContext();assert.equal(current.tried_product.id,products[1].id);assert.equal(current.tried_product.preview_kind,'garment');
});

test('inline catalog exposes all product groups and selecting a row tries its exact product',async t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();f.nodes.get('catalog-button').onclick();
  for(const type of ['lipstick','lipbalm','chair','lamp','tshirt','hoodie','sweater','glasses']){
    f.nodes.get('inline-type-'+type).onclick();assert.equal(f.discovery.productType,type);
    assert.equal(f.nodes.get('catalog-dialog').open,false);
    assert.equal(f.voice.opts.getContext().visible_panel,'catalog');
    assert.equal(f.nodes.get('inline-items').children.filter(row=>row.dataset.id).length,Math.min(6,f.discovery.total));
  }
  const row=f.nodes.get('inline-items').children.find(row=>row.children[1]?.children.some(button=>button.textContent==='Try on'));
  assert(row,'An available optical glasses preview must be present');
  const productId=row.dataset.id;await row.children[1].children.find(button=>button.textContent==='Try on').onclick();
  assert.equal(f.nodes.get('catalog-dialog').open,false);assert.equal(f.camera.product.productType,'glasses');assert.equal(f.camera.product.id,productId);assert.equal(f.store.current.id,productId);assert.equal(f.voiceStarts,0);
  assert.equal(f.nodes.get('call-screen').scrollTop,0);assert.equal(f.voice.opts.getContext().visible_panel,'call');
});

test('each product offers an in-app introduction with a sourced retailer link',t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();f.nodes.get('catalog-search-open').onclick();const rows=f.nodes.get('catalog-items').children;
  for(const row of rows){
    const actions=row.children[1].children[3];
    assert.equal(actions.children.length,1);assert.equal(actions.children[0].textContent,'Show details');
    assert.equal(actions.children[0].href,undefined);
  }
  const selected=[...f.store.catalog.values()].find(p=>p.name===rows[1].children[1].children[1].textContent),current=f.store.current;
  rows[1].children[1].children[3].children[0].onclick();
  assert.equal(f.nodes.get('detail-title').textContent,selected.name);
  assert(f.nodes.get('detail-body').textContent.startsWith(selected.verifiedAttributes[0]));
  assert.equal(f.nodes.get('detail-link').href,selected.url);
  assert.equal(f.store.current,current);assert.equal(f.nodes.get('catalog-dialog').open,true);
  assert.equal(f.cameraStarts,0);assert.equal(f.voiceStarts,0);
  f.nodes.get('close-details').onclick();assert.equal(f.nodes.get('catalog-dialog').open,true);
});

test('live product details use the sourced introduction and handle unavailable photos and prices',t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();
  const product={id:'900123',name:'Black round frames',description:'Round black eyeglass frames. Size options are unverified.',url:'https://www.coupang.com/vp/products/900123?itemId=456',source:'coupang_web',category:'glasses',productType:'glasses',currency:'KRW',price:null,image:null};
  f.voice.opts.onRecommendations([product],'',{query:'glasses',category:'glasses'});
  f.nodes.get('catalog-items').children[0].children[1].children[3].children[0].onclick();
  assert.equal(f.nodes.get('detail-body').textContent,product.description+' Price unavailable.');
  assert.equal(f.nodes.get('detail-image').hidden,true);
  assert.match(f.nodes.get('detail-preview-note').textContent,/No preview photo/);
  assert.equal(f.nodes.get('detail-link').href,product.url);
});

test('ending while a product image loads cannot restore try-on UI',async t=>{
  const wait=deferred();const f=fixture(t,{productLoad:()=>wait.promise});await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.category==='desk'));
  const loading=f.nodes.get('product-try').onclick();await tick();f.nodes.get('end-call').onclick();wait.resolve();await loading;
  assert.equal(f.nodes.get('phone-app').dataset.phase,'incoming');assert.equal(f.nodes.get('tryon-chip').hidden,true);assert.equal(f.voice.opts.getContext().tried_product,null);
});

test('camera-off during product loading clears a stale product claim',async t=>{
  let pending=false;const wait=deferred();const f=fixture(t,{productLoad:()=>pending?wait.promise:Promise.resolve()});await f.nodes.get('answer-call').onclick();const products=catalog.filter(p=>p.category==='desk');f.voice.opts.onRecommendations(products);
  await f.voice.opts.onProductAction('try_on',products[0].id);pending=true;
  const loading=f.voice.opts.onProductAction('try_on',products[1].id);const rejected=assert.rejects(loading,/cancelled/);await tick();await f.nodes.get('toggle-camera').onclick();wait.resolve();await rejected;
  assert.equal(f.voice.opts.getContext().tried_product,null);assert.equal(f.nodes.get('tryon-chip').hidden,true);
});

test('voice cannot reactivate a camera the shopper turned off',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.category==='desk'));await f.nodes.get('toggle-camera').onclick();const starts=f.cameraStarts;
  await assert.rejects(f.voice.opts.onTryon('desk',{scale:1.1}),/Camera is off/);
  await assert.rejects(f.voice.opts.onProductAction('try_on',f.store.current.id),/Camera is off/);
  assert.equal(f.cameraStarts,starts);assert.equal(f.camera.running,false);
});

test('browse card action opens grounded details; saving only adds to local bag',async t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();const p=f.store.current;const size=f.store.queue.length;
  const details=await f.voice.opts.onProductAction('browse',p.id);
  assert.equal(f.nodes.get('details-dialog').open,true);assert.equal(f.nodes.get('detail-title').textContent,p.name);assert.equal(f.store.queue.length,size);assert.equal(details.purchased,false);
  f.nodes.get('close-details').onclick();const result=await f.voice.opts.onProductAction('save',p.id);
  assert.equal(f.store.cart.size,1);assert.equal(result.purchased,false);assert.equal(f.voiceStarts,0);
  f.nodes.get('cart-button').onclick();const actions=f.nodes.get('cart-items').children[0].children[1].children;
  assert.equal(actions[0].textContent,'Show details');assert.equal(actions[0].href,undefined);
  actions[0].onclick();assert.equal(f.nodes.get('detail-title').textContent,p.name);
});

test('ending during swipe animation prevents late bag mutation',async t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();const pending=f.nodes.get('product-save').onclick();f.nodes.get('end-call').onclick();await pending;
  assert.equal(f.store.cart.size,0);assert.equal(f.nodes.get('phone-app').dataset.phase,'incoming');
});

test('old camera-permission completion cannot start voice inside a newer pending call',async t=>{
  const first=deferred(),second=deferred();const f=fixture(t,{cameraPermission:n=>n===1?first.promise:second.promise});
  const oldAnswer=f.nodes.get('answer-call').onclick();await tick();f.nodes.get('end-call').onclick();
  // The real Call again handler returns void; invoking Answer after its screen transition is equivalent.
  f.nodes.get('call-again').onclick();await tick();first.resolve();await oldAnswer;await tick();
  assert.equal(f.voiceStarts,0,'Old Answer must not start the new call before its own camera finishes');
  second.resolve();await tick();await tick();assert.equal(f.voiceStarts,1);
});

test('try-on minimizes controls while Controls/Hide toggles them and Products opens the inline collection',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='hoodie'));
  assert.equal(f.nodes.get('phone-app').dataset.focused,'false');
  await f.nodes.get('product-try').onclick();
  assert.equal(f.nodes.get('phone-app').dataset.focused,'true');
  assert.equal(f.nodes.get('focus-product').hidden,false);
  assert.equal(f.nodes.get('focus-toggle-label').textContent,'Controls');
  f.nodes.get('focus-toggle').onclick();
  assert.equal(f.nodes.get('phone-app').dataset.focused,'false');
  assert.equal(f.nodes.get('focus-toggle-label').textContent,'Hide');
  assert.equal(f.nodes.get('focus-toggle').attributes['aria-expanded'],'true');
  f.nodes.get('focus-toggle').onclick();
  assert.equal(f.nodes.get('phone-app').dataset.focused,'true');
  f.nodes.get('focus-product').onclick();
  assert.equal(f.nodes.get('phone-app').dataset.focused,'true');
  assert.equal(f.nodes.get('focus-toggle-label').textContent,'Controls');
  assert.equal(f.voice.opts.getContext().visible_panel,'catalog');
  assert(f.nodes.get('call-screen').scrollTop>0);
  assert.equal(f.nodes.get('catalog-dialog').open,false);
  assert.equal(f.camera.running,true);assert.equal(f.voice.call.ready,true);
  assert.equal(f.nodes.has('render-generate'),false);
  assert.equal(f.voice.opts.onRealisticPreviewRequested,undefined);
});

test('camera off and cleared try-on restore controls without ending voice',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='lamp'));await f.nodes.get('product-try').onclick();
  assert.equal(f.nodes.get('phone-app').dataset.focused,'true');
  await f.nodes.get('toggle-camera').onclick();
  assert.equal(f.nodes.get('phone-app').dataset.focused,'false');assert.equal(f.nodes.get('focus-toggle').hidden,true);
  assert.equal(f.voice.call.ready,true);
  await f.nodes.get('toggle-camera').onclick();assert.equal(f.nodes.get('phone-app').dataset.focused,'true');
  await f.nodes.get('clear-tryon').onclick();
  assert.equal(f.nodes.get('phone-app').dataset.focused,'false');assert.equal(f.nodes.get('focus-product').hidden,true);
  assert.equal(f.voice.opts.getContext().tried_product,null);
});

test('glasses selection uses the exact catalog image and reports its tracked preview mode',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  const glasses=catalog.filter(p=>p.productType==='glasses');assert(glasses.length>=3);
  f.voice.opts.onRecommendations(glasses);
  await f.voice.opts.onProductAction('try_on',glasses[0].id);
  const applied=await f.voice.opts.onTryon('glasses',{scale:1.12,rotation:3,opacity:.9});
  assert.equal(f.camera.mode,'glasses');assert.equal(f.camera.product.image,glasses[0].image);
  assert.equal(applied.product_id,glasses[0].id);assert.equal(applied.preview_kind,'glasses');
  assert.equal(f.camera.options.scale,1.12);assert.equal(f.nodes.get('phone-app').dataset.focused,'true');
  await assert.rejects(f.voice.opts.onTryon('glasses',{color:'#aa3355'}),/real product photo/);
});

test('Flip requests the opposite physical camera and keeps voice and selected product active',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='lamp'));await f.nodes.get('product-try').onclick();
  const productId=f.camera.product.id;
  await f.nodes.get('flip-camera').onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(f.camera.starts[1])),{facingMode:'environment',portrait:true,strictFacing:true});
  assert.equal(f.camera.options.mirror,false);assert.equal(f.voice.opts.getContext().facing_mode,'environment');
  assert.equal(f.nodes.get('flip-camera').attributes['aria-label'],'Flip to front camera');
  assert.equal(f.voiceStarts,1);assert.equal(f.voice.call.ready,true);assert.equal(f.camera.product.id,productId);
  await f.nodes.get('flip-camera').onclick();
  assert.equal(f.camera.starts[2].facingMode,'user');assert.equal(f.camera.starts[2].strictFacing,true);
  assert.equal(f.camera.options.mirror,true);assert.equal(f.nodes.get('flip-camera').attributes['aria-label'],'Flip to back camera');
  assert.equal(f.voiceStarts,1);
});

test('unavailable opposite camera restores the original rather than pretending a mirror change is a flip',async t=>{
  const f=fixture(t,{cameraStart:settings=>!settings.strictFacing});await f.nodes.get('answer-call').onclick();
  await f.nodes.get('flip-camera').onclick();
  assert.equal(f.camera.starts.length,3);
  assert.equal(f.camera.starts[1].facingMode,'environment');assert.equal(f.camera.starts[1].strictFacing,true);
  assert.equal(f.camera.starts[2].facingMode,'user');assert.equal(f.camera.starts[2].strictFacing,false);
  assert.equal(f.camera.running,true);assert.equal(f.camera.options.mirror,true);
  assert.equal(f.voice.opts.getContext().facing_mode,'user');assert.equal(f.voiceStarts,1);
  assert.match(f.nodes.get('call-notice').textContent,/no available camera on the other side/);
});

test('ending while a physical-camera switch is pending cannot restart either camera or voice',async t=>{
  const wait=deferred();const f=fixture(t,{cameraStart:settings=>settings.strictFacing?wait.promise:true});await f.nodes.get('answer-call').onclick();
  const switching=f.nodes.get('flip-camera').onclick();await tick();f.nodes.get('end-call').onclick();wait.resolve(false);await switching;
  assert.equal(f.camera.starts.length,2);assert.equal(f.camera.running,false);assert.equal(f.voice.call,null);
  assert.equal(f.nodes.get('phone-app').dataset.phase,'incoming');assert.equal(f.nodes.get('phone-app').dataset.focused,'false');
});

test('first and returning calls close media and stay on the start screen',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.nodes.get('end-call').onclick();
  assert.equal(f.camera.running,false);assert.equal(f.voice.call,null);
  assert.equal(f.storage.get('coupi_first_call_done'),'1');assert.equal(f.context.window.location.href,'/call');
  assert.equal(f.nodes.get('incoming-screen').hidden,false);assert.equal(f.nodes.get('end-screen').hidden,true);assert.equal(f.nodes.get('call-screen').hidden,true);
  assert.equal(f.nodes.get('answer-call').disabled,false);
  await f.nodes.get('answer-call').onclick();assert.equal(f.voice.call.ready,true);assert.equal(f.camera.running,true);assert.equal(f.voiceStarts,2);
  const returning=fixture(t,{storage:f.storage});await returning.nodes.get('answer-call').onclick();returning.nodes.get('end-call').onclick();
  assert.equal(returning.context.window.location.href,'/call');assert.equal(returning.nodes.get('incoming-screen').hidden,false);assert.equal(returning.nodes.get('end-screen').hidden,true);
});

test('browsing, a cancelled connection, and leaving the page do not complete the first call',async t=>{
  const browsing=fixture(t);browsing.nodes.get('decline-call').onclick();browsing.nodes.get('end-call').onclick();
  assert.equal(browsing.storage.has('coupi_first_call_done'),false);
  const wait=deferred(),connecting=fixture(t,{cameraPermission:()=>wait.promise});
  const answering=connecting.nodes.get('answer-call').onclick();connecting.nodes.get('end-call').onclick();wait.resolve();await answering;
  assert.equal(connecting.storage.has('coupi_first_call_done'),false);assert.equal(connecting.nodes.get('answer-call').disabled,false);assert.equal(connecting.nodes.get('incoming-screen').hidden,false);
  const leaving=fixture(t);await leaving.nodes.get('answer-call').onclick();leaving.events.emit('pagehide');
  assert.equal(leaving.storage.has('coupi_first_call_done'),false);assert.equal(leaving.context.window.location.href,'/call');
  const hidden=fixture(t);await hidden.nodes.get('answer-call').onclick();hidden.context.document.hidden=true;hidden.docEvents.emit('visibilitychange');
  assert.equal(hidden.storage.has('coupi_first_call_done'),false);
});

test('ending returns to the start screen even if browser storage is blocked',async t=>{
  const f=fixture(t,{blockStorage:true});await f.nodes.get('answer-call').onclick();f.nodes.get('end-call').onclick();
  assert.equal(f.context.window.location.href,'/call');assert.equal(f.camera.running,false);assert.equal(f.voice.call,null);assert.equal(f.nodes.get('incoming-screen').hidden,false);assert.equal(f.nodes.get('end-screen').hidden,true);
});

const liveProducts=()=>Array.from({length:18},(_,i)=>({id:String(800000+i),name:'White frames '+i,category:'glasses',productType:'glasses',price:10000+i*1000,url:'https://www.coupang.com/vp/products/'+(800000+i),source:'coupang_web',currency:'KRW',image:'/api/products/image?url='+encodeURIComponent('https://thumbnail.coupangcdn.com/image/frames-'+i+'.jpg')}));

test('voice recommendations open a priced list capped at fifteen and try the exact selected item',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  f.voice.opts.onRecommendations(liveProducts(),'Matching glasses',{query:'glasses',category:'glasses',max_price:null,product_types:['glasses']});
  assert.equal(f.nodes.get('catalog-dialog').open,true);
  const rows=f.nodes.get('catalog-items').children;
  assert.equal(rows.length,15);assert.equal(f.store.queue.length,15);
  assert.equal(rows[8].children[1].children[2].textContent,'₩18,000 · listed');
  assert.equal(f.nodes.get('catalog-tabs').hidden,true);
  assert.equal(f.camera.product,undefined);
  await rows[8].children[2].onclick();
  assert.equal(f.camera.product.id,'800008');assert.equal(f.store.current.id,'800008');
  assert.equal(f.nodes.get('catalog-dialog').open,false);
});

test('a short glasses result never pads the list with defaults or exposes unrelated categories',async t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();
  f.voice.opts.onRecommendations([liveProducts()[0],catalog.find(p=>p.productType==='lipstick')],'Matches',{query:'glasses',category:'all',max_price:null,product_types:[]});
  const rows=f.nodes.get('catalog-items').children;
  assert.equal(rows.length,1);assert.match(rows[0].children[1].children[0].textContent,/Glasses/);
  assert.equal(f.nodes.get('catalog-tabs').hidden,true);
  f.nodes.get('type-lipstick').onclick();assert.equal(f.nodes.get('catalog-items').children.length,1);
  assert.doesNotMatch(html,/catalog-download|download="coupi/);
});

test('typed search asks for ten choices and excludes paused memories',async t=>{
  let body;
  const storage=new Map([['coupi_memory',JSON.stringify([{text:'Rose gold'}])],['coupi_memory_paused','1']]);
  const f=fixture(t,{storage,fetch:async(url,init)=>{body=JSON.parse(init.body);return {ok:true,json:async()=>({products:liveProducts().slice(0,10)})};}});
  f.nodes.get('decline-call').onclick();f.nodes.get('catalog-search-input').value='glasses';
  await f.nodes.get('catalog-search-form').onsubmit({preventDefault(){}});
  assert.equal(body.limit,10);assert.deepEqual(body.memories,[]);
  assert.equal(f.nodes.get('catalog-items').children.length,10);
});

test('a listing without a photo stays in the choices but cannot start the camera',async t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();
  f.voice.opts.onRecommendations([{...liveProducts()[0],image:null}]);
  const button=f.nodes.get('catalog-items').children[0].children[2];
  assert.equal(button.disabled,true);assert.equal(button.textContent,'No preview');
  await button.onclick();assert.equal(f.cameraStarts,0);f.camera.running=true;
  await assert.rejects(f.voice.opts.onProductAction('try_on','800000'),/no preview photo/);
  assert.equal(f.cameraStarts,0);
});
test('typed Coupang search includes saved preferences and shows results without starting media',async t=>{
  let body;
  const storage=new Map([['coupi_memory',JSON.stringify([{text:'I like white frames',source:'you told me'}])]]);
  const f=fixture(t,{storage,fetch:async(url,init)=>{assert.equal(url,'/api/products/search');body=JSON.parse(init.body);return {ok:true,json:async()=>({products:liveProducts()})};}});
  f.nodes.get('decline-call').onclick();f.nodes.get('catalog-search-input').value='white glasses';
  await f.nodes.get('catalog-search-form').onsubmit({preventDefault(){}});
  assert.deepEqual(body.memories,['I like white frames']);assert.equal(body.query,'white glasses');
  assert.equal(f.nodes.get('catalog-items').children.length,15);assert.equal(f.cameraStarts,0);assert.equal(f.voiceStarts,0);
});

test('voice glasses results hide unrelated categories and refresh replaces the list with unseen glasses',async t=>{
  let request;
  const old=liveProducts()[0],fresh={...liveProducts()[1],id:'999001',url:'https://www.coupang.com/vp/products/999001'};
  const f=fixture(t,{fetch:async(url,init)=>{request=JSON.parse(init.body);return {ok:true,json:async()=>({products:[old,fresh,catalog.find(p=>p.productType==='chair')]})};}});
  await f.nodes.get('answer-call').onclick();
  f.voice.opts.onRecommendations([old,catalog.find(p=>p.productType==='chair')],'Found products',{query:'white glasses',category:'glasses',max_price:25000,product_types:['glasses']});
  assert.equal(f.nodes.get('catalog-tabs').hidden,true);
  assert.equal(f.nodes.get('catalog-items').children.length,1);
  f.nodes.get('catalog-search-input').value='unsubmitted different query';
  await f.nodes.get('catalog-refresh').onclick();
  assert.equal(request.query,'white glasses');assert.equal(request.category,'glasses');assert.equal(request.max_price,25000);
  assert.deepEqual(request.exclude_ids,[old.id]);
  assert.equal(f.nodes.get('catalog-items').children.length,1);assert.equal(f.store.current.id,fresh.id);
  await f.nodes.get('catalog-refresh').onclick();
  assert.deepEqual(request.exclude_ids,[old.id,fresh.id]);
  assert.equal(f.nodes.get('catalog-items').children.length,0);
  assert.match(f.nodes.get('catalog-match-note').textContent,/No new matching products/);
  assert.equal(f.nodes.get('catalog-refresh').disabled,false);
  assert.doesNotMatch(html,/catalog-download|download="coupi/);
});

test('refresh cannot send duplicate in-flight requests and failure leaves retry available',async t=>{
  const pending=deferred();let calls=0;
  const f=fixture(t,{fetch:()=>{calls++;return pending.promise;}});
  f.nodes.get('decline-call').onclick();f.nodes.get('type-glasses').onclick();
  const refresh=f.nodes.get('catalog-refresh').onclick();
  assert.equal(f.nodes.get('catalog-refresh').disabled,true);
  f.nodes.get('catalog-refresh').onclick();assert.equal(calls,1);
  pending.resolve({ok:false,json:async()=>({error:'Search unavailable. Try again.'})});await refresh;
  assert.equal(f.nodes.get('catalog-refresh').disabled,false);assert.match(f.nodes.get('catalog-summary').textContent,/Search unavailable/);
});

test('refresh retries the latest failed query instead of reverting to an older product category',async t=>{
  const requests=[];
  const f=fixture(t,{fetch:async(url,init)=>{requests.push(JSON.parse(init.body));return {ok:false,json:async()=>({error:'Try again'})};}});
  f.nodes.get('decline-call').onclick();f.nodes.get('type-chair').onclick();
  f.nodes.get('catalog-search-input').value='white glasses';
  await f.nodes.get('catalog-search-form').onsubmit({preventDefault(){}});
  await f.nodes.get('catalog-refresh').onclick();
  assert.equal(requests[1].query,'white glasses');assert.deepEqual(requests[1].exclude_ids,[]);
  assert.equal(f.nodes.get('catalog-tabs').hidden,true);
});

test('search failure is visible and ending a call discards late search results',async t=>{
  const pending=deferred();const f=fixture(t,{fetch:()=>pending.promise});
  f.nodes.get('decline-call').onclick();f.nodes.get('catalog-search-input').value='white glasses';
  const searching=f.nodes.get('catalog-search-form').onsubmit({preventDefault(){}});
  f.nodes.get('end-call').onclick();pending.resolve({ok:true,json:async()=>({products:liveProducts()})});await searching;
  assert.equal(f.nodes.get('catalog-dialog').open,false);assert.equal(f.nodes.get('phone-app').dataset.phase,'incoming');
  const failure=fixture(t,{fetch:async()=>({ok:false,json:async()=>({error:'Search unavailable. Try again.'})})});
  failure.nodes.get('decline-call').onclick();failure.nodes.get('catalog-search-input').value='white glasses';
  await failure.nodes.get('catalog-search-form').onsubmit({preventDefault(){}});
  assert.equal(failure.nodes.get('catalog-items').children.length,0);assert.match(failure.nodes.get('catalog-summary').textContent,/Search unavailable/);
  assert.equal(failure.nodes.get('catalog-search-submit').disabled,false);
});


test('selecting a non-first result adds only that product, retains selection, and never bulk-adds a group',async t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();f.nodes.get('catalog-button').onclick();
  const second=f.discovery.visible[1];assert(second);f.nodes.get('catalog-items').children[1].children[0].onclick();
  assert.equal(f.store.current.id,second.id);assert.equal(f.discovery.current.id,second.id);
  f.nodes.get('close-catalog').onclick();await f.nodes.get('product-save').onclick();
  assert.deepEqual(Array.from(f.store.cart.keys()),[second.id]);assert.equal(f.store.current.id,second.id);
  await f.nodes.get('product-save').onclick();assert.equal(f.store.cart.size,1);
});

test('a saved result group returns after switching styles with selected product intact',async t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();
  f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='glasses'),'',{query:'normal glasses',category:'glasses'});
  const original=Array.from(f.discovery.products,p=>p.id),selected=f.store.current.id;
  f.nodes.get('save-group').onclick();assert.equal(f.discovery.collections.length,1);
  await f.nodes.get('product-skip').onclick();assert.equal(f.discovery.theme,'sunglasses');assert.notEqual(f.store.current.id,selected);
  f.nodes.get('collections-button').onclick();const collection=f.nodes.get('collection-items').children[0];collection.children[3].children[0].onclick();
  assert.equal(f.nodes.get('collections-dialog').open,false);assert.equal(f.nodes.get('catalog-dialog').open,false);assert.equal(f.voice.opts.getContext().visible_panel,'catalog');
  assert.deepEqual(Array.from(f.discovery.products,p=>p.id),original);assert.equal(f.store.current.id,selected);assert.equal(f.store.cart.size,0);
});

test('image-send failure preserves photo and text for retry; success clears the composer',async t=>{
  let fail=true;const f=fixture(t,{imageSend:async()=>{if(fail)throw Error('Connection busy. Retry.');return true;}});await f.nodes.get('answer-call').onclick();
  f.nodes.get('text-toggle').onclick();f.nodes.get('chat-image-file').files=[{name:'outfit.jpg'}];await f.nodes.get('chat-image-file').onchange();f.nodes.get('text-input').value='Find this look';
  await f.nodes.get('text-form').onsubmit({preventDefault(){}});
  assert.equal(f.nodes.get('attachment-preview').hidden,false);assert.equal(f.nodes.get('text-input').value,'Find this look');assert.match(f.nodes.get('attachment-status').textContent,/Connection busy/);
  fail=false;await f.nodes.get('text-form').onsubmit({preventDefault(){}});
  assert.equal(f.voice.uploads.length,2);assert.equal(f.voice.uploads[1].text,'Find this look');assert.equal(f.nodes.get('attachment-preview').hidden,true);assert.equal(f.nodes.get('text-input').value,'');assert.equal(f.nodes.get('chat-send').disabled,false);
});

test('ending discards an attached image and a late image-preparation result cannot bring it back',async t=>{
  const wait=deferred();const f=fixture(t,{imagePrepare:()=>wait.promise});await f.nodes.get('answer-call').onclick();
  f.nodes.get('chat-image-file').files=[{name:'outfit.jpg'}];const preparing=f.nodes.get('chat-image-file').onchange();
  f.nodes.get('end-call').onclick();wait.resolve({dataUrl:'data:image/jpeg;base64,AQID',name:'outfit.jpg'});await preparing;
  assert.equal(f.nodes.get('attachment-preview').hidden,true);assert.equal(f.nodes.get('attachment-image').src,undefined);assert.equal(f.nodes.get('chat-image-file').value,'');assert.equal(f.voice.uploads.length,0);
});

test('hand swipes are gated while any product, history, comparison or collection dialog is open',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='glasses'));
  assert.equal(f.hands.opts.isEnabled(),true);
  for(const id of ['details-dialog','catalog-dialog','cart-dialog','chat-history-dialog','collections-dialog','compare-dialog']){
    f.nodes.get(id).showModal();assert.equal(f.hands.opts.isEnabled(),false,id);f.nodes.get(id).close();assert.equal(f.hands.opts.isEnabled(),true,id);
  }
  f.nodes.get('gesture-toggle').onclick();assert.equal(f.hands.opts.isEnabled(),false);
});

test('expanded conversation history retains chronological updates without duplicating finalized text',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();const emit=event=>f.voice.opts.onTranscript(event);
  emit({key:'spoken',role:'user',order:1,pending:true});emit({key:'reply',role:'assistant',order:2,delta:'Try the pink one'});
  emit({key:'spoken',role:'user',order:1,text:'I want pink',final:true,pending:false});emit({key:'reply',role:'assistant',order:2,text:'Try the pink one',final:true});emit({key:'reply',role:'assistant',order:2,delta:' pink one'});
  f.nodes.get('chat-history-open').onclick();assert.equal(f.nodes.get('chat-history-dialog').open,true);
  assert.deepEqual(Array.from(f.store.messages,m=>m.key),['spoken','reply']);assert.equal(f.nodes.get('chat-history').children.length,2);assert.equal(f.store.messages[1].text,'Try the pink one');
  assert.match(f.nodes.get('chat-history').children[0].textContent,/I want pink/);assert.match(f.nodes.get('chat-history').children[1].textContent,/Try the pink one/);
});


test('mobile photo picker preserves the call while hidden, while cancellation restores normal background cleanup',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.nodes.get('chat-attach').onclick();
  f.context.document.hidden=true;f.docEvents.emit('visibilitychange');assert.equal(f.voice.call.ready,true);assert.equal(f.camera.running,true);
  const before=f.voice.images.length;f.visionTick();assert.equal(f.voice.images.length,before,'Camera snapshots pause while the picker obscures the page');
  f.context.document.hidden=false;f.nodes.get('chat-image-file').emit('cancel');
  f.context.document.hidden=true;f.docEvents.emit('visibilitychange');assert.equal(f.voice.call,null);assert.equal(f.camera.running,false);
});

test('new transcript turns do not drag a shopper away from an earlier scroll position',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  for(let i=0;i<8;i++)f.voice.opts.onTranscript({key:'turn-'+i,role:i%2?'assistant':'user',order:i,text:'Message '+i,final:true});
  const transcript=f.nodes.get('conversation-history');transcript.scrollTop=20;transcript.emit('scroll');
  f.voice.opts.onTranscript({key:'turn-8',role:'assistant',order:8,delta:'New message'});
  assert.equal(transcript.scrollTop,20);assert.equal(f.nodes.get('chat-latest').hidden,false);
  f.nodes.get('chat-latest').onclick();assert.equal(transcript.scrollTop,transcript.scrollHeight);assert.equal(f.nodes.get('chat-latest').hidden,true);
});

const checkoutIds=f=>Array.from(f.checkout.current.selectedItems,item=>item.id);
function descendants(node){return node.children.flatMap(child=>[child,...descendants(child)]);}
function checkoutButton(f,label){const button=descendants(f.nodes.get('checkout-items')).find(node=>node.getAttribute('aria-label')===label);assert(button,`Missing checkout button: ${label}`);return button;}

test('buy selected and buy from details review the exact intended product while the call stays active',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='glasses'));
  const first=f.store.current;f.nodes.get('product-buy').onclick();
  assert.equal(f.nodes.get('checkout-dialog').open,true);assert.equal(f.checkout.current.step,'review');
  assert.deepEqual(checkoutIds(f),[first.id]);assert.equal(f.store.cart.size,0);
  f.nodes.get('close-checkout').onclick();assert.equal(f.checkout.current.step,'idle');
  f.nodes.get('catalog-button').onclick();const second=f.discovery.visible[1];
  f.nodes.get('catalog-items').children[1].children[1].children.find(button=>button.textContent==='Details').onclick();
  assert.equal(f.store.current.id,first.id,'Opening row details must not change the selected camera product');
  f.nodes.get('detail-buy').onclick();
  assert.deepEqual(checkoutIds(f),[second.id]);assert.equal(f.nodes.get('details-dialog').open,false);
  assert.equal(f.camera.running,true);assert.equal(f.voice.call.ready,true);assert.equal(f.voiceStarts,1);
});

test('buy comparison reviews every compared product without changing the bag',async t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();f.nodes.get('catalog-button').onclick();
  const chosen=f.discovery.visible.slice(0,3);
  for(let i=0;i<3;i++)f.nodes.get('catalog-items').children[i].children[1].children.find(button=>button.textContent==='Compare').onclick();
  f.nodes.get('compare-open').onclick();assert.equal(f.nodes.get('compare-dialog').open,true);
  f.nodes.get('compare-buy').onclick();
  assert.equal(f.nodes.get('compare-dialog').open,false);assert.equal(f.nodes.get('checkout-dialog').open,true);
  assert.deepEqual(checkoutIds(f),Array.from(chosen,p=>p.id));assert.equal(f.checkout.current.source,'comparison');assert.equal(f.store.cart.size,0);
});

test('cart checkout keeps quantity and subset changes through Back and Cancel preserves the entire bag',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();const chosen=catalog.filter(p=>p.price!==null&&Number.isSafeInteger(p.price)).slice(0,3);
  for(const product of chosen)f.store.cart.set(product.id,product);
  f.nodes.get('cart-button').onclick();f.nodes.get('cart-checkout').onclick();
  assert.deepEqual(checkoutIds(f),chosen.map(p=>p.id));assert.equal(f.nodes.get('cart-dialog').open,false);
  checkoutButton(f,'Increase quantity — '+chosen[0].name).onclick();
  let third=f.nodes.get('checkout-items').children[2].children[0];third.checked=false;third.onchange({target:third});
  assert.equal(f.checkout.current.totalQuantity,3);assert.equal(f.checkout.current.referenceTotal,chosen[0].price*2+chosen[1].price);
  f.nodes.get('checkout-next').onclick();assert.equal(f.checkout.current.step,'payment');assert.equal(f.store.cart.size,3);
  f.nodes.get('checkout-wallet').onclick();f.nodes.get('checkout-back').onclick();
  assert.equal(f.checkout.current.step,'review');assert.equal(f.checkout.current.items[0].quantity,2);assert.equal(f.checkout.current.items[2].included,false);
  assert.equal(f.checkout.current.paymentMethod,'demo-wallet');
  f.nodes.get('close-checkout').onclick();
  assert.equal(f.checkout.current.step,'idle');assert.deepEqual(Array.from(f.store.cart.keys()),chosen.map(p=>p.id));
  assert.equal(f.voice.call.ready,true);assert.equal(f.camera.running,true);
});

test('only explicit payment confirmation completes the demo and removes just the included cart items once',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();const chosen=catalog.filter(p=>Number.isSafeInteger(p.price)).slice(0,3);
  for(const product of chosen)f.store.cart.set(product.id,product);
  f.nodes.get('cart-button').onclick();f.nodes.get('cart-checkout').onclick();
  const third=f.nodes.get('checkout-items').children[2].children[0];third.checked=false;third.onchange({target:third});
  f.nodes.get('checkout-next').onclick();
  assert.equal(f.checkout.current.receipt,null);assert.equal(f.store.cart.size,3);assert.equal(f.checkout.current.step,'payment');assert.equal(f.voice.purchases.length,0);
  f.nodes.get('checkout-confirm').onclick();
  const receipt=f.checkout.current.receipt;
  assert.equal(f.checkout.current.step,'complete');assert.equal(receipt.demo,true);assert.equal(receipt.payment_processed,false);assert.equal(receipt.order_placed,false);
  assert.deepEqual(Array.from(receipt.item_ids),chosen.slice(0,2).map(p=>p.id));assert.deepEqual(Array.from(f.store.cart.keys()),[chosen[2].id]);
  f.store.cart.set(chosen[0].id,chosen[0]);f.nodes.get('checkout-confirm').onclick();
  assert.equal(f.voice.purchases.length,1);assert.equal(f.voice.purchases[0].receipt.id,receipt.id);assert(f.voice.purchases[0].suggestions.length>0);assert(f.voice.purchases[0].suggestions.every(p=>!receipt.item_ids.includes(p.id)));assert.equal(f.nodes.get('checkout-pairing-items').children.length,f.voice.purchases[0].suggestions.length);assert.equal(f.voice.opts.getContext().last_purchase.receipt_id,receipt.id);
  assert.equal(f.checkout.current.receipt.id,receipt.id);assert(f.store.cart.has(chosen[0].id),'A duplicate confirm must not apply cart removal again');
  f.nodes.get('checkout-done').onclick();assert.equal(f.nodes.get('checkout-dialog').open,false);assert.equal(f.voice.call.ready,true);assert.equal(f.camera.running,true);
});

test('checkout gates hand swipes and ending the call cancels an unfinished checkout without altering the bag',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='glasses'));
  const product=f.store.current;f.store.cart.set(product.id,product);assert.equal(f.hands.opts.isEnabled(),true);
  f.nodes.get('product-buy').onclick();assert.equal(f.hands.opts.isEnabled(),false);
  f.nodes.get('checkout-next').onclick();assert.equal(f.hands.opts.isEnabled(),false);
  f.nodes.get('end-call').onclick();
  assert.equal(f.nodes.get('checkout-dialog').open,false);assert.equal(f.checkout.current.step,'idle');assert.equal(f.store.cart.size,1);
  assert.equal(f.camera.running,false);assert.equal(f.voice.call,null);
});

test('spoken buy and pay-cart requests only open the matching review; the agent sees checkout context',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='glasses'));
  const selected=f.store.current;
  await f.voice.opts.onCheckout({scope:'selected',productIds:[]});
  assert.equal(f.checkout.current.step,'review');assert.deepEqual(checkoutIds(f),[selected.id]);
  let context=f.voice.opts.getContext();assert.equal(context.visible_panel,'checkout');assert.equal(context.checkout.step,'review');
  assert.equal(f.checkout.current.receipt,null);assert.equal(f.store.cart.size,0);
  f.nodes.get('close-checkout').onclick();
  const products=catalog.slice(0,2);for(const product of products)f.store.cart.set(product.id,product);
  await f.voice.opts.onCheckout({scope:'cart',productIds:[]});
  assert.equal(f.checkout.current.source,'cart');assert.deepEqual(checkoutIds(f),products.map(p=>p.id));
  f.nodes.get('checkout-next').onclick();context=f.voice.opts.getContext();
  assert.equal(context.checkout.step,'payment');assert.equal(f.checkout.current.receipt,null);assert.equal(f.store.cart.size,2);
  assert.equal(f.voice.call.ready,true);
});

test('spoken explicit-product checkout rejects invented or out-of-context products instead of silently buying a subset',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='glasses'));
  const known=f.store.current,unseen=catalog.find(p=>p.productType==='chair');
  for(const productIds of [[known.id,'invented'],[unseen.id]]){
    await assert.rejects(Promise.resolve().then(()=>f.voice.opts.onCheckout({scope:'products',productIds})));
    assert.equal(f.nodes.get('checkout-dialog').open,false);assert.equal(f.store.cart.size,0);assert.equal(f.checkout.current.receipt,null);
  }
  await f.voice.opts.onCheckout({scope:'products',productIds:[known.id]});
  assert.deepEqual(checkoutIds(f),[known.id]);assert.equal(f.checkout.current.step,'review');
});

test('an incoming voice checkout cannot replace a quote awaiting the shopper’s payment confirmation',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='glasses'));
  const selected=f.store.current;await f.voice.opts.onCheckout({scope:'selected',productIds:[]});
  checkoutButton(f,'Increase quantity — '+selected.name).onclick();f.nodes.get('checkout-next').onclick();
  const before=JSON.parse(JSON.stringify(f.checkout.current));
  await assert.rejects(Promise.resolve().then(()=>f.voice.opts.onCheckout({scope:'products',productIds:[f.discovery.visible[1].id]})),/already open/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.checkout.current)),before);
  assert.equal(f.nodes.get('checkout-dialog').open,true);assert.equal(f.checkout.current.receipt,null);
  assert.equal(f.voice.opts.getContext().checkout.reference_total,selected.price*2);
});

test('empty bag and fully deselected checkout cannot proceed to payment',async t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();f.nodes.get('cart-button').onclick();
  assert.equal(f.nodes.get('cart-checkout').disabled,true);
  await assert.rejects(Promise.resolve().then(()=>f.voice.opts.onCheckout({scope:'cart',productIds:[]})));
  assert.equal(f.nodes.get('checkout-dialog').open,false);f.nodes.get('close-cart').onclick();
  f.nodes.get('product-buy').onclick();const checkbox=f.nodes.get('checkout-items').children[0].children[0];checkbox.checked=false;checkbox.onchange({target:checkbox});
  assert.equal(f.nodes.get('checkout-next').disabled,true);assert.equal(f.checkout.current.referenceTotal,0);
  f.nodes.get('checkout-next').onclick();assert.equal(f.checkout.current.step,'review');assert.equal(f.nodes.get('checkout-error').hidden,false);
  assert.equal(f.checkout.current.receipt,null);assert.equal(f.store.cart.size,0);
});

function inlineCatalog(){
  const make=(type,category,count,tags=[],collectionStyle='')=>Array.from({length:count},(_,i)=>({...catalog[0],id:`inline_${type}_${collectionStyle||tags.join('_')}_${i}`,name:`${type} option ${i+1}`,brand:`Demo brand ${i%6+1}`,productType:type,category,collectionStyle,tags,aliases:[],verifiedAttributes:[],price:5000+i*100,preview:{available:true}}));
  return [...make('lipstick','makeup',10,['pink']),...make('lipbalm','makeup',6),...make('glasses','glasses',6,['optical']),...make('glasses','glasses',6,['sunglasses']),...make('tshirt','clothes',6,[],'basic'),...make('tshirt','clothes',6,[],'branded'),...make('hoodie','clothes',6),...make('sweater','clothes',6)];
}
const inlineRows=f=>f.nodes.get('inline-items').children.filter(row=>row.dataset.id);
const inlineAction=(row,name)=>row.children[1].children.find(button=>button.textContent===name);

test('inline collection starts with six picks, expands to ten, and keeps the live call while returning to camera',async t=>{
  const f=fixture(t,{catalog:inlineCatalog()});await f.nodes.get('answer-call').onclick();
  f.voice.opts.onRecommendations([...f.store.catalog.values()].filter(p=>p.productType==='lipstick'),'',{query:'pink lipstick',category:'makeup'});
  assert.equal(inlineRows(f).length,6);assert.equal(f.nodes.get('inline-more').hidden,false);
  assert.match(f.nodes.get('inline-description').textContent,/6 brands/);
  f.nodes.get('inline-peek').onclick();assert.equal(f.nodes.get('call-screen').scrollTop,500);
  assert.equal(f.nodes.get('catalog-dialog').open,false);assert.equal(f.voice.opts.getContext().visible_panel,'catalog');
  assert.equal(f.hands.opts.isEnabled(),false);assert.equal(f.voice.call.ready,true);assert.equal(f.camera.running,true);
  f.nodes.get('inline-more').onclick();assert.equal(inlineRows(f).length,10);assert.equal(f.nodes.get('inline-more').hidden,true);
  assert.equal(f.nodes.get('call-screen').scrollTop,500,'Expanding the grid must not jump back to video');
  f.nodes.get('back-camera').onclick();assert.equal(f.nodes.get('call-screen').scrollTop,0);assert.equal(f.voice.opts.getContext().visible_panel,'call');
  assert.equal(f.hands.opts.isEnabled(),true);assert.equal(f.cameraStarts,1);assert.equal(f.voiceStarts,1);
});

test('scrolling into collections gates gestures and does not interrupt the camera or call',async t=>{
  const f=fixture(t,{catalog:inlineCatalog()});await f.nodes.get('answer-call').onclick();
  f.voice.opts.onRecommendations([...f.store.catalog.values()].filter(p=>p.productType==='lipstick'));
  const scroller=f.nodes.get('call-screen');f.nodes.get('call-stage').offsetHeight=600;
  scroller.scrollTop=510;scroller.emit('scroll');assert.equal(f.voice.opts.getContext().visible_panel,'catalog');assert.equal(f.hands.opts.isEnabled(),false);
  f.voice.opts.onTranscript({key:'while-browsing',role:'assistant',text:'Here are a few options.',final:true});
  assert.equal(scroller.scrollTop,510);assert.equal(f.voice.call.ready,true);assert.equal(f.camera.running,true);
  scroller.scrollTop=80;scroller.emit('scroll');assert.equal(f.voice.opts.getContext().visible_panel,'catalog');assert.equal(f.hands.opts.isEnabled(),false,'Partial scrolling must also pause hand decisions');
  scroller.scrollTop=0;scroller.emit('scroll');assert.equal(f.voice.opts.getContext().visible_panel,'call');assert.equal(f.hands.opts.isEnabled(),true);
});

test('Try on from an inline row returns the chosen product to the camera and only its Add action affects the bag',async t=>{
  const f=fixture(t,{catalog:inlineCatalog()});await f.nodes.get('answer-call').onclick();
  f.nodes.get('inline-type-tshirt').onclick();const target=inlineRows(f)[3],id=target.dataset.id;
  inlineAction(target,'Add to bag').onclick();assert.deepEqual(Array.from(f.store.cart.keys()),[id]);
  await inlineAction(target,'Try on').onclick();
  assert.equal(f.camera.product.id,id);assert.equal(f.store.current.id,id);assert.equal(f.camera.mode,'clothes');
  assert.equal(f.nodes.get('call-screen').scrollTop,0);assert.equal(f.voice.opts.getContext().visible_panel,'call');
  assert.equal(f.voice.call.ready,true);assert.equal(f.cameraStarts,1);assert.equal(f.voiceStarts,1);
});

test('Save collection retains all ten picks and selected item across a six-item related collection',async t=>{
  const memory=new Map(),storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
  const f=fixture(t,{catalog:inlineCatalog(),storage});f.nodes.get('decline-call').onclick();f.nodes.get('inline-type-lipstick').onclick();
  const selected=inlineRows(f)[2];selected.children[0].onclick();const selectedId=selected.dataset.id;
  f.nodes.get('inline-save').onclick();assert.equal(f.discovery.collections.length,1);assert.equal(f.discovery.collections[0].productCount,10);assert.equal(memory.size,1);
  f.nodes.get('inline-next').onclick();assert.equal(f.discovery.productType,'lipbalm');assert.equal(inlineRows(f).length,6);assert.equal(f.store.cart.size,0);
  f.nodes.get('inline-saved').onclick();const saved=f.nodes.get('collection-items').children[0];saved.children[3].children[0].onclick();
  assert.equal(f.nodes.get('collections-dialog').open,false);assert.equal(f.nodes.get('catalog-dialog').open,false);
  assert.equal(f.discovery.productType,'lipstick');assert.equal(f.store.current.id,selectedId);assert.equal(inlineRows(f).length,6);
  assert.equal(f.voice.opts.getContext().visible_panel,'catalog');assert.equal(f.nodes.get('call-screen').scrollTop,500);
  f.nodes.get('inline-more').onclick();assert.equal(inlineRows(f).length,10);assert.equal(f.store.cart.size,0);
});

test('Next collection presents related eyewear, branded shirts and sweaters as separate six-item groups',t=>{
  const f=fixture(t,{catalog:inlineCatalog()});f.nodes.get('decline-call').onclick();
  for(const [type,expected,theme,style] of [['glasses','glasses','sunglasses',''],['tshirt','tshirt','','branded'],['hoodie','sweater','','']]){
    f.nodes.get('inline-type-'+type).onclick();const before=inlineRows(f).map(row=>row.dataset.id);assert.equal(before.length,6);
    f.nodes.get('inline-next').onclick();assert.equal(f.discovery.productType,expected);assert.equal(f.discovery.theme,theme);assert.equal(f.discovery.collectionStyle,style);
    const after=inlineRows(f).map(row=>row.dataset.id);assert.equal(after.length,6);assert(after.every(id=>!before.includes(id)));assert.equal(f.store.cart.size,0);
  }
});

test('inline call bar keeps mute and end usable while the collection is visible',async t=>{
  const f=fixture(t,{catalog:inlineCatalog()});await f.nodes.get('answer-call').onclick();f.nodes.get('inline-type-lipstick').onclick();
  assert.equal(f.nodes.get('inline-mute').disabled,false);assert.equal(f.nodes.get('inline-mute').attributes['aria-label'],'Mute microphone');
  f.nodes.get('inline-mute').onclick();assert.equal(f.voice.mutes,1);assert.equal(f.nodes.get('inline-mute').attributes['aria-label'],'Unmute microphone');
  assert.equal(f.nodes.get('inline-mute').attributes['aria-pressed'],'true');assert.equal(f.nodes.get('mute-call').attributes['aria-pressed'],'true');
  assert.match(f.nodes.get('inline-call-status').textContent,/mic muted/);assert.equal(f.voice.opts.getContext().visible_panel,'catalog');
  f.nodes.get('inline-end').onclick();assert.equal(f.camera.running,false);assert.equal(f.voice.call,null);
  assert.equal(f.nodes.get('phone-app').dataset.phase,'incoming');assert.equal(f.nodes.get('call-screen').scrollTop,0);assert.equal(f.nodes.get('inline-mute').disabled,true);
});


test('the opening question is neutral and reviews are directly accessible',async t=>{
  const f=fixture(t);assert.equal(f.voice.opts.greeting,'What do you want to buy?');await f.nodes.get('answer-call').onclick();
  assert.equal(f.store.messages[0].text,'What do you want to buy?');
  f.voice.opts.onRecommendations(catalog.filter(p=>p.reviewEvidence?.reviews?.length));
  f.nodes.get('product-details').onclick();
  assert(f.nodes.get('detail-reviews').textContent.includes('Ratings & reviews'));
  f.nodes.get('detail-review-shortcut').onclick();assert.equal(f.nodes.get('detail-reviews').didScrollIntoView,true);
});

test('receipt pairing opens the exact suggested product and never adds it automatically',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='chair'));
  f.nodes.get('product-buy').onclick();f.nodes.get('checkout-next').onclick();f.nodes.get('checkout-confirm').onclick();
  const suggested=f.voice.purchases[0].suggestions[0];assert.equal(suggested.productType,'lamp');
  f.nodes.get('checkout-pairing-items').children[0].onclick();assert.equal(f.nodes.get('checkout-dialog').open,false);assert.equal(f.nodes.get('details-dialog').open,true);assert.equal(f.store.detailProduct.id,suggested.id);assert.equal(f.store.cart.size,0);
  assert.equal(f.voice.opts.getContext().last_purchase.pairing_ids[0],suggested.id);
  f.nodes.get('end-call').onclick();assert.equal(f.voice.opts.getContext().last_purchase,null);
});


test('spoken follow-up can open exact pairing details or a fresh checkout after purchase',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='chair'));
  f.nodes.get('product-buy').onclick();f.nodes.get('checkout-next').onclick();f.nodes.get('checkout-confirm').onclick();
  const suggestion=f.voice.purchases[0].suggestions[0];
  await f.voice.opts.onProductAction('details',suggestion.id);assert.equal(f.nodes.get('checkout-dialog').open,false);assert.equal(f.store.detailProduct.id,suggestion.id);
  f.nodes.get('detail-buy').onclick();assert.equal(f.checkout.current.step,'review');assert.deepEqual(checkoutIds(f),[suggestion.id]);
  f.nodes.get('checkout-next').onclick();f.nodes.get('checkout-confirm').onclick();
  const second=f.voice.purchases[1].suggestions[0];
  f.voice.opts.onCheckout({scope:'products',productIds:[second.id]});assert.equal(f.checkout.current.step,'review');assert.deepEqual(checkoutIds(f),[second.id]);
});


test('voice trying a purchase pairing selects that exact card and closes the receipt',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='lipstick'));
  f.nodes.get('product-buy').onclick();f.nodes.get('checkout-next').onclick();f.nodes.get('checkout-confirm').onclick();
  const suggestion=f.voice.purchases[0].suggestions.find(p=>p.productType==='glasses');assert(suggestion);
  await f.voice.opts.onProductAction('try_on',suggestion.id);
  assert.equal(f.nodes.get('checkout-dialog').open,false);assert.equal(f.camera.product.id,suggestion.id);assert.equal(f.store.current.id,suggestion.id);
  f.nodes.get('product-buy').onclick();assert.deepEqual(checkoutIds(f),[suggestion.id]);
});


test('a delayed close event from the completed receipt cannot cancel its replacement checkout',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='chair'));
  f.nodes.get('product-buy').onclick();f.nodes.get('checkout-next').onclick();f.nodes.get('checkout-confirm').onclick();
  const suggestion=f.voice.purchases[0].suggestions[0],dialog=f.nodes.get('checkout-dialog'),pending=[];
  dialog.close=function(){this.open=false;pending.push(()=>this.emit('close'));};
  f.voice.opts.onCheckout({scope:'products',productIds:[suggestion.id]});for(const event of pending.splice(0))event();
  assert.equal(dialog.open,true);assert.equal(f.checkout.current.step,'review');assert.deepEqual(checkoutIds(f),[suggestion.id]);
  f.nodes.get('close-checkout').onclick();for(const event of pending.splice(0))event();assert.equal(f.checkout.current.step,'idle');
});


function profileStorage(){const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),data};}
const draftPrefs={interests:['focused_work','beauty_play'],vibe:'calm',budget:20000,story:'I enjoy reading and making my desk comfortable.'};
test('personalization is opt-in and never blocks a direct shopping call',async t=>{
  const storage=profileStorage(),f=fixture(t,{storage});assert.equal(f.personalization.active,false);assert.equal(f.voice.opts.getContext().personalization.active,false);
  await f.nodes.get('answer-call').onclick();assert.equal(f.voice.opts.greeting,'What do you want to buy?');
  assert.throws(()=>f.voice.opts.onPreferences({action:'draft',preferences:draftPrefs}),/not active/);assert.equal(storage.data.size,0);
});
test('new-customer conversation drafts preferences but only the explicit Build button saves and opens worlds',async t=>{
  const storage=profileStorage(),f=fixture(t,{storage,search:'?intent=personalize'});assert.equal(f.personalization.active,true);assert.equal(f.cameraStarts,0);assert.equal(storage.data.size,0);
  await f.nodes.get('answer-call').onclick();assert.equal(f.voice.opts.greeting,'What do you enjoy doing in your free time?');
  const result=f.voice.opts.onPreferences({action:'draft',preferences:draftPrefs});assert.equal(result.saved,false);assert.equal(result.draft_ready,true);
  assert.equal(f.nodes.get('personalization-dialog').open,true);assert.equal(f.voice.opts.getContext().personalization.draft_pending,true);assert.equal(storage.data.size,0);assert.equal(f.hands.opts.isEnabled(),false);
  f.nodes.get('preference-story').value='I like cozy reading evenings.';f.nodes.get('personalization-save').onclick();
  const profile=JSON.parse(storage.getItem('coupi.preferences.v1'));assert.equal(profile.story,'I like cozy reading evenings.');assert.equal(profile.completed,true);assert.equal(profile.budget,20000);
  assert.equal(f.camera.running,false);assert.equal(f.voice.call,null);assert.equal(f.context.window.location.href,'/explore');
});
test('Skip discards the draft, keeps the call active and never saves partial answers',async t=>{
  const storage=profileStorage(),f=fixture(t,{storage,search:'?intent=personalize'});await f.nodes.get('answer-call').onclick();f.voice.opts.onPreferences({action:'draft',preferences:draftPrefs});
  f.nodes.get('personalization-skip').onclick();assert.equal(f.personalization.active,false);assert.equal(f.nodes.get('personalization-dialog').open,false);assert.equal(f.voice.call.ready,true);assert.equal(f.camera.running,true);assert.equal(storage.data.size,0);
  assert.throws(()=>f.voice.opts.onPreferences({action:'draft',preferences:draftPrefs}),/not active/);
});
test('blocked local storage leaves preference review open and keeps the call connected',async t=>{
  const storage={getItem(){return null;},setItem(){throw Error('blocked');},removeItem(){}};
  const f=fixture(t,{storage,search:'?intent=personalize'});await f.nodes.get('answer-call').onclick();f.voice.opts.onPreferences({action:'draft',preferences:draftPrefs});f.nodes.get('personalization-save').onclick();
  assert.equal(f.nodes.get('personalization-dialog').open,true);assert.equal(f.nodes.get('personalization-error').hidden,false);assert.equal(f.voice.call.ready,true);assert.equal(f.context.window.location.href,'/call');
});
test('a saved world seeds a budget-filtered catalog but does not start a call or onboarding automatically',t=>{
  const storage=profileStorage();storage.setItem('coupi.preferences.v1',JSON.stringify({version:1,completed:true,...draftPrefs}));
  const f=fixture(t,{storage,search:'?world=desk-reset'});assert.equal(f.personalization.active,false);assert.equal(f.cameraStarts,0);assert.equal(f.voiceStarts,0);assert.equal(f.personalization.world.id,'desk-reset');
  f.nodes.get('decline-call').onclick();assert.equal(f.cameraStarts,0);assert(f.store.queue.length>0);assert(f.store.queue.every(p=>p.price<=20000));assert.equal(f.voice.opts.getContext().personalization.preferences.story,draftPrefs.story);
  assert.deepEqual(Array.from(f.store.queue,p=>p.id),Array.from(f.personalization.world.products,p=>p.id));assert.equal(f.discovery.label,f.personalization.world.title);
});
test('answering a world call preserves every listed product and category tabs leave the world group',async t=>{
  const storage=profileStorage();storage.setItem('coupi.preferences.v1',JSON.stringify({version:1,completed:true,...draftPrefs}));
  const f=fixture(t,{storage,search:'?world=desk-reset'});await f.nodes.get('answer-call').onclick();
  assert.deepEqual(Array.from(f.store.queue,p=>p.id),Array.from(f.personalization.world.products,p=>p.id));
  f.nodes.get('inline-type-lipstick').onclick();assert.equal(f.discovery.mixed,false);assert(f.discovery.products.every(p=>p.productType==='lipstick'));assert.equal(f.discovery.maxPrice,20000);
});

test('changing the selected card cancels an earlier photo load before it can preview the wrong item',async t=>{
  const wait=deferred();const f=fixture(t,{productLoad:()=>wait.promise});await f.nodes.get('answer-call').onclick();
  f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='glasses'));
  const first=f.store.current,second=f.discovery.visible[1];const pending=f.nodes.get('product-try').onclick();await tick();
  f.nodes.get('inline-items').children[1].children[0].onclick();assert.equal(f.store.current.id,second.id);
  wait.resolve();await pending;await tick();
  assert.equal(f.voice.opts.getContext().tried_product,null,'A finished old request must not overlay the previously selected product');
  assert.equal(f.nodes.get('tryon-chip').hidden,true);assert.notEqual(f.camera.product?.id,first.id);
});

test('clearing comparison resets the inline product chips as well as the count',t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();
  for(let i=0;i<2;i++)f.nodes.get('inline-items').children[i].children[1].children.find(b=>b.textContent==='Compare').onclick();
  f.nodes.get('inline-compare').onclick();f.nodes.get('compare-clear').onclick();
  assert.equal(f.discovery.comparison.length,0);assert.equal(f.nodes.get('inline-compare').disabled,true);
  assert(f.nodes.get('inline-items').children.every(row=>row.children[1].children.find(b=>b.textContent==='Compare').getAttribute('aria-pressed')==='false'));
});

test('changing categories retains the current price limit and opening an empty result group does not replace its filters',t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();
  f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='lipstick'),'',{productType:'lipstick',maxPrice:10000});
  f.nodes.get('inline-type-lamp').onclick();assert.equal(f.discovery.maxPrice,10000);assert(f.discovery.products.every(p=>p.price<=10000));
  f.voice.opts.onRecommendations([],'',{productType:'lipstick',query:'purple lipstick',maxPrice:1,sourceOnly:true});
  f.nodes.get('catalog-button').onclick();assert.equal(f.discovery.maxPrice,1);assert.equal(f.discovery.query,'purple lipstick');assert.equal(f.discovery.total,0);
});

test('Coupi can explain a saved bag item after the shopper browses to another category',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='lipstick'));
  const saved=f.store.current;await f.voice.opts.onProductAction('save',saved.id);f.nodes.get('inline-type-chair').onclick();
  await f.voice.opts.onProductAction('details',saved.id);assert.equal(f.store.detailProduct.id,saved.id);assert.equal(f.nodes.get('details-dialog').open,true);
});


test('live search results remain selectable by color and enter checkout using trusted listing facts',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  const products=liveProducts().slice(0,2);
  f.voice.opts.onRecommendations(products,'Matching frames',{query:'white glasses',category:'glasses',max_price:25000,sourceOnly:true});
  assert.equal(f.discovery.products.length,2);
  await f.nodes.get('catalog-items').children[1].children[2].onclick();
  assert.equal(f.store.current.id,products[1].id);
  assert.equal(f.camera.product.id,products[1].id);
  f.nodes.get('product-buy').onclick();
  const quote=f.checkout.snapshot();
  assert.equal(quote.step,'review');assert.equal(quote.selectedItems[0].product.id,products[1].id);
  assert.equal(quote.referenceTotal,products[1].price);
  assert.equal(f.nodes.get('checkout-dialog').open,true);
});
