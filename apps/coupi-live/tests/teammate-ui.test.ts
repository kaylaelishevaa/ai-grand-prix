// @ts-nocheck — VM browser fixtures exercise the complete embedded call and bridge.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import catalog from '../data/teammate-catalog.json';
const html=readFileSync(new URL('../public/live-call/index.html',import.meta.url),'utf8');
const stateSource=readFileSync(new URL('../public/live-call/mobile-call-state.js',import.meta.url),'utf8');
const moduleSources=['call-actions.js','product-discovery.js','call-conversation.js','product-evidence.js','demo-checkout.js','purchase-pairings.js','call-personalization.js'].map(name=>readFileSync(new URL('../public/live-call/'+name,import.meta.url),'utf8'));
const source=readFileSync(new URL('../public/live-call/mobile-call.js',import.meta.url),'utf8');
const bridgeSource=readFileSync(new URL('../public/live-call/call-bridge.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.nodeType=1;this.hidden=false;this.disabled=false;this.open=false;this.dataset={};this.style={};this.children=[];this.attributes={};this.listeners=new Map();this.value='';this.files=[];this.scrollTop=0;this.clientHeight=100;this._text='';const classes=new Set();this.classList={add:(...c)=>c.forEach(x=>classes.add(x)),remove:(...c)=>c.forEach(x=>classes.delete(x)),contains:c=>classes.has(c),toggle:(c,on)=>{const active=on===undefined?!classes.has(c):on;active?classes.add(c):classes.delete(c);return active;}};}
  set textContent(value){this._text=String(value??'');this.children=[];} get textContent(){return this._text+this.children.map(child=>child.textContent).join(' ');}
  get scrollHeight(){return this._scrollHeight??this.children.length*40;} set scrollHeight(value){this._scrollHeight=value;}
  setAttribute(k,v){this.attributes[k]=String(v);} getAttribute(k){return this.attributes[k]??null;} removeAttribute(k){delete this.attributes[k];if(k==='src')delete this.src;}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}} replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
  remove(){if(this.parentElement)this.parentElement.removeChild(this);}
  removeChild(node){const index=this.children.indexOf(node);assert.notEqual(index,-1);this.children.splice(index,1);node.parentElement=null;return node;}
  addEventListener(k,fn){if(!this.listeners.has(k))this.listeners.set(k,[]);this.listeners.get(k).push(fn);}
  emit(k,event={}){for(const fn of this.listeners.get(k)||[])fn(event);}
  showModal(){this.open=true;} close(){this.open=false;this.emit('close');}
  scrollIntoView(){this.didScrollIntoView=true;}
  click(){return this.onclick?.({target:this,preventDefault(){}});} focus(){} setPointerCapture(){}
  closest(selector){let current=this;while(current){if(selector.split(',').some(s=>s.trim().toUpperCase()===current.tagName))return current;current=current.parentElement;}return null;}
}

function fixture(t,options={}){
  const nodes=new Map([...html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*?\bid="([^"]+)"[^>]*>/gi)].map(m=>{const node=new Element(m[1]);node.hidden=/\shidden(?:\s|>)/.test(m[0]);return [m[2],node];}));
  for(const match of html.matchAll(/<dialog\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/dialog>/g))for(const child of match[2].matchAll(/\bid="([^"]+)"/g)){if(nodes.has(child[1]))nodes.get(child[1]).parentElement=nodes.get(match[1]);}
  const events=new Element(),docEvents=new Element(),sequence=[],intervals=[],messages=[],storage=options.storage||new Map();
  const localStorage=options.blockStorage?{getItem(){throw Error('Storage blocked');},setItem(){throw Error('Storage blocked');},removeItem(){throw Error('Storage blocked');}}:typeof storage.getItem==='function'?storage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
  nodes.get('vision-consent').checked=true;
  let cameraStarts=0,voiceStarts=0;
  class Camera {
    constructor(opts){this.opts=opts;this.running=false;this.options={};this.errors={};this.canvas={width:720,height:1280};this.gen=0;this.productGen=0;this.stops=0;this.starts=[];}
    setOptions(opts){Object.assign(this.options,opts);}
    async start(settings={}){sequence.push('camera');cameraStarts++;this.starts.push({...settings});const token=++this.gen;this.running=false;this.opts.onStatus('Opening camera','loading');if(options.cameraPermission)await options.cameraPermission(cameraStarts);const allowed=options.cameraStart?await options.cameraStart(settings,cameraStarts):true;if(token!==this.gen)return false;if(allowed===false){this.lastCameraError={message:'Requested camera is unavailable.'};return false;}this.actualFacingMode=options.actualFacingMode||settings.facingMode||'user';this.running=true;this.opts.onStatus('Live','success');return true;}
    stop(){this.gen++;this.productGen++;this.running=false;this.stops++;}
    async setMode(mode){if(mode==='none'||(this.product&&this.product.category!==mode))await this.setProduct(null);this.mode=mode;if(options.modelLoad)await options.modelLoad();}
    async setProduct(product){const token=++this.productGen;if(product&&options.productLoad)await options.productLoad(product);if(token!==this.productGen)return {ok:false,stale:true};this.product=product;return product?{ok:true,productId:product.id,kind:product.category==='makeup'?'lip':product.category==='clothes'?'garment':product.category==='glasses'?'glasses':'object',shadeColor:product.category==='makeup'?'#bc3c57':undefined,shadeEstimated:product.category==='makeup'}:{ok:true};}
  }
  class Voice {
    constructor(opts){this.opts=opts;this.options=opts;this.call=null;this.ends=0;this.contexts=[];this.images=[];this.imageClears=0;this.uploads=[];this.sentTexts=[];this.mutes=0;this.purchases=[];this.starts=[];this.modeChanges=[];this.inputMode='voice';this.skips=0;}
    async start(settings={}){sequence.push('voice');voiceStarts++;this.starts.push({...settings});this.inputMode=settings.inputMode==='text'?'text':'voice';this.call={ready:true,inputMode:this.inputMode,muted:this.inputMode==='text'};this.opts.onState({state:'connected',inputMode:this.inputMode,muted:this.inputMode==='text',connectedAt:Date.now()});return true;}
    async setInputMode(value){this.modeChanges.push(value);if(options.modeChange&&!(await options.modeChange(value)))return false;this.inputMode=value;this.call.inputMode=value;this.call.muted=value==='text';this.opts.onState({state:'connected',inputMode:value,muted:this.call.muted,connectedAt:Date.now()});return true;}
    end(){this.ends++;this.call=null;this.opts.onState({state:'idle',muted:false,connectedAt:null});}
    updateContext(value){this.contexts.push(value);} mute(){this.mutes++;if(this.call&&this.inputMode!=='text'){this.call.muted=!this.call.muted;this.opts.onState({state:'connected',muted:this.call.muted});}} sendText(value){this.sentTexts.push(value);if(options.textSend)return options.textSend(value);if(!this.call?.ready||!value.trim())return false;this.opts.onTranscript({role:'user',key:'typed-'+this.contexts.length,text:value.trim(),final:true});return true;} async resumeAudio(){}
    skipPersonalization(){this.skips++;return options.skipPersonalization?options.skipPersonalization(this.skips):!!this.call;}
    async sendImage(value){this.uploads.push(value);return options.imageSend?await options.imageSend(value):!!this.call;}
    sendCameraSnapshot(frame){if(!this.opts.getVisionEnabled())return false;this.images.push(frame);this.opts.onVisionState({state:'received',capturedAt:frame.metadata.capturedAt});return true;}
    notifyCheckoutComplete(receipt,suggestions){this.purchases.push({receipt,suggestions});return !!this.call?.ready;}
    clearCameraSnapshots(){this.imageClears++;this.opts.onVisionState({state:'paused'});return true;}
  }
  class Snapshots {constructor(opts){this.opts=opts;}_encode(){return {dataUrl:'data:image/jpeg;base64,AQID',width:200,height:200};}capture(reason){return this.opts.isEnabled()?{images:[{kind:'camera',dataUrl:'data:image/jpeg;base64,AQID'}],metadata:{reason,capturedAt:new Date().toISOString()}}:null;}clear(){}}
  const context={window:{location:{origin:'https://coupi.test',search:options.search||'',href:'/call',assign(){}},parent:{postMessage:(data,target)=>messages.push({data,target})},COUPANG_PRODUCTS:options.catalog||catalog,localStorage,requestAnimationFrame:fn=>{fn();return 1;},CoupiChatImages:{prepare:async file=>options.imagePrepare?await options.imagePrepare(file):{dataUrl:'data:image/jpeg;base64,AQID',name:file.name,width:100,height:100}},NookCamera:Camera,NookVoiceSession:Voice,NookCameraSnapshots:Snapshots,addEventListener:(...a)=>events.addEventListener(...a)},document:{head:new Element('head'),querySelectorAll:()=>[],getElementById:id=>nodes.get(id)||null,createElement:tag=>new Element(tag),querySelector:selector=>selector==='dialog[open]'?[...nodes.values()].find(n=>n.tagName==='DIALOG'&&n.open)||null:null,addEventListener:(...a)=>docEvents.addEventListener(...a),hidden:false},setTimeout:(fn,ms)=>ms===220?setTimeout(fn,0):0,clearTimeout,setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},clearInterval,console,URL,URLSearchParams,requestAnimationFrame:fn=>{fn();return 1;}};
  context.AbortController=AbortController;context.location=context.window.location;context.fetch=async(url,init)=>url==='/api/voice/status'?{ok:true,json:async()=>options.status||{ready:true,offline:false}}:options.fetch?options.fetch(url,init):Promise.reject(Error('Unexpected network request'));context.window.fetch=(...args)=>context.fetch(...args);
  vm.createContext(context);vm.runInContext(stateSource,context);vm.runInContext(bridgeSource,context);for(const moduleSource of moduleSources)vm.runInContext(moduleSource,context);vm.runInContext(source,context);
  const mobile=context.window.NookMobile;
  t.after(()=>nodes.get('end-call').onclick());
  return {...mobile,nodes,context,sequence,docEvents,events,storage,messages,visionTick:()=>intervals.find(i=>i.ms===3000).fn(),get cameraStarts(){return cameraStarts;},get voiceStarts(){return voiceStarts;}};
}

async function startShopping(f){
  f.personalization.skip();await f.nodes.get('answer-call').onclick();
  if(!f.store.current)f.voice.opts.onRecommendations([...f.store.catalog.values()].filter(p=>p.productType==='lipstick'),'',{productType:'lipstick'});
}

function recommendType(f,type,options={}){
  f.voice.opts.onRecommendations([...f.store.catalog.values()].filter(p=>p.productType===type),'',{
    productType:type,theme:type==='glasses'?'optical':'',collectionStyle:type==='tshirt'?'basic':'',maxPrice:f.discovery.maxPrice,...options
  },'ready');
}

test('the camera control pauses and resumes snapshots and ending the call clears sharing',async t=>{
  const f=fixture(t);f.visionTick();assert.equal(f.voice.images.length,0);
  await f.nodes.get('answer-call').onclick();f.visionTick();assert.equal(f.voice.images.length,1);
  f.voice.opts.onRecommendations(catalog.filter(p=>p.category==='desk'));await f.voice.opts.onTryon('desk',{x:.25});assert.equal(f.camera.options.x,.25);
  await f.nodes.get('toggle-camera').onclick();f.visionTick();assert.equal(f.voice.images.length,1);assert(f.voice.imageClears>0);
  assert.equal(f.camera.running,false);assert.equal(f.voice.opts.getCameraSnapshot('tool'),null);assert.equal(f.voice.opts.getContext().vision.enabled,false);
  await f.nodes.get('toggle-camera').onclick();f.visionTick();assert.equal(f.voice.images.length,2);assert.equal(f.camera.running,true);
  assert.equal(f.voice.opts.getContext().vision.enabled,true);
  f.nodes.get('end-call').onclick();f.visionTick();assert.equal(f.voice.images.length,2);assert.equal(f.camera.running,false);
  assert.equal(f.voice.opts.getContext().vision.enabled,false);
});

test('snapshot errors recover without restarting the call and removed sharing controls stay absent',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();const call=f.voice.call;
  for(const id of ['vision-strip','vision-status','vision-action','vision-toggle'])assert.equal(f.nodes.has(id),false);
  f.voice.opts.onVisionState({state:'error'});assert.equal(f.voice.opts.getContext().vision.state,'error');
  f.visionTick();assert.equal(f.voice.images.length,1);assert.equal(f.voice.opts.getContext().vision.state,'received');
  assert.equal(f.voice.call,call);assert.equal(f.cameraStarts,1);assert.equal(f.voiceStarts,1);
  await f.nodes.get('toggle-camera').onclick();assert.equal(f.voice.opts.getContext().vision.enabled,false);
});

test('camera preview stays local when sharing is declined and snapshots require explicit consent',async t=>{
  const f=fixture(t),consent=f.nodes.get('vision-consent');consent.checked=false;consent.onchange();
  assert.match(f.nodes.get('entry-privacy').textContent,/preview stays on this device/);
  await f.nodes.get('answer-call').onclick();f.visionTick();
  assert.equal(f.camera.running,true);assert.equal(f.cameraStarts,1);assert.equal(f.voice.images.length,0);
  assert.deepEqual(f.sequence,['camera','voice']);assert.equal(f.nodes.get('phone-app').dataset.phase,'active');
  assert.equal(f.nodes.get('camera-fallback').hidden,true);assert.equal(f.voice.opts.getContext().vision.enabled,false);assert.equal(f.voice.opts.getCameraSnapshot('tool'),null);
  f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='glasses'));await f.voice.opts.onProductAction('try_on');
  assert(f.camera.product);assert.equal(f.voice.images.length,0);
  await f.nodes.get('toggle-camera').onclick();await f.nodes.get('toggle-camera').onclick();f.visionTick();
  assert.equal(f.camera.running,true);assert.equal(f.cameraStarts,2);assert.equal(f.voiceStarts,1);assert.equal(f.voice.images.length,0);
  consent.checked=true;consent.onchange();f.visionTick();
  assert.equal(f.voice.images.length,1);assert.equal(f.voice.opts.getContext().vision.enabled,true);assert.equal(f.cameraStarts,2);assert.equal(f.voiceStarts,1);
  f.context.document.hidden=true;f.visionTick();assert.equal(f.voice.images.length,1);
  f.docEvents.emit('visibilitychange');assert.equal(f.voice.call,null);assert.equal(f.camera.running,false);
});

test('calling again preserves sharing opt-out while the local camera remains enabled',async t=>{
  const f=fixture(t);f.nodes.get('vision-consent').checked=false;await f.nodes.get('answer-call').onclick();
  assert.equal(f.camera.running,true);f.visionTick();assert.equal(f.voice.images.length,0);
  await f.nodes.get('toggle-camera').onclick();await f.nodes.get('toggle-camera').onclick();f.nodes.get('end-call').onclick();
  await f.nodes.get('answer-call').onclick();
  assert.equal(f.camera.running,true);assert.equal(f.cameraStarts,3);assert.equal(f.voiceStarts,2);
  assert.equal(f.voice.call.ready,true);f.visionTick();assert.equal(f.voice.images.length,0);assert.equal(f.voice.opts.getContext().vision.enabled,false);
});


test('Answer starts camera then real-call adapter; End closes both and returns to the start screen',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  assert.deepEqual(f.sequence,['camera','voice']);assert.equal(f.nodes.get('phone-app').dataset.phase,'active');
  f.nodes.get('end-call').onclick();assert.equal(f.camera.running,false);assert.equal(f.voice.call,null);assert.equal(f.nodes.get('phone-app').dataset.phase,'incoming');
});

test('pre-call camera and microphone icons independently choose capture while Chat starts text-only directly',async t=>{
  for(const [camera,mic] of [[true,true],[false,true],[true,false],[false,false]])await t.test(`camera ${camera}, mic ${mic}`,async t=>{
    const f=fixture(t);if(!camera)f.nodes.get('entry-camera').onclick();if(!mic)f.nodes.get('entry-mic').onclick();
    assert.equal(f.cameraStarts,0);assert.equal(f.voiceStarts,0);
    await f.nodes.get('answer-call').onclick();
    assert.equal(f.camera.running,camera);assert.equal(f.cameraStarts,camera?1:0);assert.equal(f.voiceStarts,1);
    assert.equal(f.voice.starts[0].inputMode,mic?'voice':'text');assert.equal(f.voice.call.muted,!mic);
    assert.equal(f.nodes.get('phone-app').dataset.camera,camera?'on':'off');
    assert.equal(f.nodes.get('mute-call').disabled,false);assert.equal(f.nodes.get('toggle-camera').hidden,false);assert.equal(f.nodes.get('text-toggle').hidden,false);
    f.visionTick();assert.equal(f.voice.images.length,camera?1:0);
  });
  await t.test('direct chat',async t=>{
    const f=fixture(t);await f.nodes.get('entry-chat').onclick();
    assert.equal(f.cameraStarts,0);assert.equal(f.voiceStarts,1);assert.equal(f.voice.inputMode,'text');assert.equal(f.nodes.get('text-form').hidden,false);
    for(const id of ['entry-video','entry-voice','format-video','format-voice','format-chat'])assert.equal(f.nodes.has(id),false);
  });
});

test('camera, microphone and message icons preserve the conversation and bag while switching independently',async t=>{
  const f=fixture(t);await startShopping(f);const chosen=f.store.current;
  await f.voice.opts.onProductAction('save',chosen.id);f.voice.opts.onTranscript({role:'user',key:'keep-this-turn',text:'I like this one',final:true});
  const before=f.store.messages.map(m=>m.key),call=f.voice.call;
  await f.nodes.get('text-toggle').onclick();
  assert.equal(f.camera.running,true);assert.equal(f.voice.inputMode,'text');assert.equal(f.nodes.get('text-form').hidden,false);
  await f.nodes.get('toggle-camera').onclick();assert.equal(f.camera.running,false);assert.equal(f.nodes.get('phone-app').dataset.format,'text');
  await f.nodes.get('mute-call').onclick();assert.equal(f.camera.running,false);assert.equal(f.voice.inputMode,'voice');assert.equal(f.nodes.get('phone-app').dataset.format,'voice');
  await f.nodes.get('toggle-camera').onclick();assert.equal(f.camera.running,true);assert.equal(f.voice.inputMode,'voice');
  assert.equal(f.voice.call,call);assert.equal(f.voiceStarts,1);assert.deepEqual(f.store.messages.map(m=>m.key),before);assert(f.store.cart.has(chosen.id));
});

test('denying microphone access while leaving chat preserves the working text session',async t=>{
  const f=fixture(t,{modeChange:mode=>mode!=='voice'});await f.nodes.get('entry-chat').onclick();
  const call=f.voice.call;await f.nodes.get('mute-call').onclick();
  assert.equal(f.voice.call,call);assert.equal(f.voiceStarts,1);assert.equal(f.voice.inputMode,'text');assert.equal(f.cameraStarts,0);
  assert.equal(f.nodes.get('phone-app').dataset.format,'text');assert.equal(f.nodes.get('phone-app').dataset.camera,'off');assert.equal(f.nodes.get('text-form').hidden,false);
  f.nodes.get('text-input').value='Find a desk lamp';await f.nodes.get('text-form').onsubmit({preventDefault(){}});
  assert.equal(f.voice.sentTexts.at(-1),'Find a desk lamp');
});

test('chat-only sessions send uploaded images without opening camera or microphone input',async t=>{
  const f=fixture(t);await f.nodes.get('entry-chat').onclick();
  f.nodes.get('chat-image-file').files=[{name:'desk.jpg'}];await f.nodes.get('chat-image-file').onchange();
  f.nodes.get('text-input').value='Which lamp suits this desk?';await f.nodes.get('text-form').onsubmit({preventDefault(){}});
  assert.equal(f.voice.uploads.length,1);assert.equal(f.voice.uploads[0].text,'Which lamp suits this desk?');
  assert.equal(f.cameraStarts,0);assert.equal(f.voice.inputMode,'text');assert.equal(f.nodes.get('attachment-preview').hidden,true);
});

test('turning the camera on and off during chat keeps microphone input off',async t=>{
  const f=fixture(t);await f.nodes.get('entry-chat').onclick();
  await f.nodes.get('toggle-camera').onclick();assert.equal(f.camera.running,true);assert.equal(f.nodes.get('phone-app').dataset.format,'video');
  assert.equal(f.voice.inputMode,'text');assert.equal(f.voice.modeChanges.length,0);
  await f.nodes.get('toggle-camera').onclick();assert.equal(f.camera.running,false);assert.equal(f.nodes.get('phone-app').dataset.format,'text');
  assert.equal(f.nodes.get('text-form').hidden,false);assert.equal(f.voice.inputMode,'text');assert.equal(f.voiceStarts,1);
});

test('manual product controls replace hand gestures and card dragging',async t=>{
  const f=fixture(t);await startShopping(f);
  assert.equal(f.nodes.has('gesture-toggle'),false);assert.equal(f.nodes.has('gesture-status'),false);
  assert.doesNotMatch(html,/hand-gestures\.js/);
  const product=f.store.current;await f.nodes.get('product-save').onclick();assert(f.store.cart.has(product.id));
});

test('fixed transcript keeps earlier turns available in stable order',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  const emit=e=>f.voice.opts.onTranscript(e);
  emit({role:'user',key:'early-user',text:'I want a shirt'});emit({role:'assistant',key:'reply',delta:'What colour?'});
  assert.equal(f.store.messages.length,2);assert.equal(f.store.messages[0].key,'early-user');
  emit({role:'user',key:'next-user',text:'Blue'});emit({role:'assistant',key:'next-reply',text:'Here are your picks'});
  assert.equal(f.nodes.get('conversation-history').children.length,4);assert.deepEqual(Array.from(f.store.messages,m=>m.key),['early-user','reply','next-user','next-reply']);
});

test('captions show the latest speaker while preserving conversation state',async t=>{
  const f=fixture(t);assert.equal(f.nodes.get('live-caption').hidden,true);await f.nodes.get('answer-call').onclick();
  const emit=e=>f.voice.opts.onTranscript(e);
  emit({role:'user',key:'early-user',text:'I want a shirt'});
  assert.equal(f.nodes.get('caption-speaker').textContent,'You');assert.equal(f.nodes.get('caption-text').textContent,'I want a shirt');
  emit({role:'assistant',key:'reply',delta:'What colour?'});
  assert.equal(f.store.messages.length,2);assert.equal(f.store.messages[0].key,'early-user');
  assert.equal(f.nodes.get('caption-speaker').textContent,'Coupi');assert.equal(f.nodes.get('caption-text').textContent,'What colour?');
  assert.equal(f.nodes.get('live-caption').hidden,false);
  const body=f.nodes.get('caption-text');body.scrollHeight=220;body.scrollTop=0;
  f.nodes.get('chat-minimize').onclick();
  assert.equal(f.nodes.get('conversation-box').dataset.collapsed,'true');assert.equal(body.scrollTop,220);
  f.nodes.get('chat-minimize').onclick();
  assert.equal(f.nodes.get('conversation-box').dataset.collapsed,'false');assert.equal(f.nodes.get('live-caption').hidden,false);
  assert.equal(f.nodes.get('conversation-history').children.length,2);
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
  f.nodes.get('end-call').onclick();await f.nodes.get('answer-call').onclick();
  assert.equal(f.nodes.get('caption-text'),body);assert.equal(body.textContent,f.personalization.greeting);
  assert.equal(f.nodes.get('caption-speaker').textContent,'Coupi');
});

test('the message icon keeps video and history while switching input to chat',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();const emit=f.voice.opts.onTranscript;
  emit({role:'assistant',key:'greeting',text:'Hi, I’m Coupi. How can I help you today?',final:true});
  const toggle=f.nodes.get('text-toggle'),form=f.nodes.get('text-form'),input=f.nodes.get('text-input'),history=f.nodes.get('conversation-history');
  await toggle.onclick();assert.equal(form.hidden,false);assert.equal(history.hidden,false);assert.equal(f.voice.inputMode,'text');assert.equal(f.camera.running,true);
  assert.equal(history.children.length,1);input.value='I want black glasses';await form.onsubmit({preventDefault(){}});
  assert.equal(input.value,'');assert.equal(form.hidden,false);assert.equal(history.children.length,2);
  assert.equal(history.children[1].children[0].textContent,'You');assert.equal(history.children[1].children[2].textContent,'I want black glasses');
  emit({role:'assistant',key:'reply',delta:'Here are some '});emit({role:'assistant',key:'reply',delta:'glasses.'});emit({role:'assistant',key:'reply',text:'Here are some glasses.',final:true});
  assert.equal(history.children.length,3);assert.equal(history.children[2].children[2].textContent,'Here are some glasses.');
  f.voice.opts.onRecommendations(catalog.filter(p=>p.category==='glasses'));await f.voice.opts.onProductAction('try_on');
  assert.equal(form.hidden,false);assert.equal(history.hidden,false);assert.equal(f.nodes.has('gesture-status'),false);
  await f.nodes.get('toggle-camera').onclick();assert.equal(form.hidden,false);assert.equal(history.hidden,false);
  emit({role:'user',key:'next',text:'Another pair'});emit({role:'assistant',key:'reply-2',text:'Let’s find another pair.'});
  assert.equal(history.children.length,5);assert.equal(history.children[0].children[2].textContent,'Hi, I’m Coupi. How can I help you today?');
  assert.equal(f.store.messages.length,5);assert.equal(f.voiceStarts,1);
});

test('the message icon silences audio input and the microphone icon restores speech without changing camera',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();const mic=f.nodes.get('mute-call'),call=f.voice.call;
  await f.nodes.get('text-toggle').onclick();assert.equal(f.voice.inputMode,'text');assert.equal(f.voice.call.muted,true);
  assert.equal(mic.disabled,false);assert.equal(mic.attributes['aria-pressed'],'true');assert.equal(f.camera.running,true);assert.equal(f.voice.ends,0);
  f.voice.opts.onPlaybackBlocked(true);assert.equal(f.nodes.get('play-audio').hidden,true);
  await mic.onclick();assert.equal(f.voice.inputMode,'voice');assert.equal(f.voice.call,call);assert.equal(f.camera.running,true);
  assert.equal(f.nodes.get('call-status').textContent,'Live with Coupi');
  await mic.onclick();assert.equal(f.voice.call.muted,true);assert.equal(f.nodes.get('call-status').textContent,'Mic muted');
  assert.equal(f.voiceStarts,1);assert.equal(f.cameraStarts,1);
});

test('streaming history preserves rows and scroll position while reading older messages',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();await f.nodes.get('text-toggle').onclick();
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

test('unsent chat drafts survive a connection error and format changes while a new call clears old messages',async t=>{
  const f=fixture(t);await f.nodes.get('entry-chat').onclick();
  const input=f.nodes.get('text-input'),form=f.nodes.get('text-form'),history=f.nodes.get('conversation-history');
  input.value='My draft';f.voice.call.ready=false;await form.onsubmit({preventDefault(){}});
  assert.equal(input.value,'My draft');assert.equal(form.hidden,false);
  f.voice.opts.onState({state:'error',message:'Connection paused',muted:true,inputMode:'text'});
  assert.equal(f.nodes.get('text-toggle').disabled,true);assert.equal(input.disabled,false);assert.equal(input.value,'My draft');
  f.voice.call.ready=true;f.voice.opts.onState({state:'connected',muted:true,inputMode:'text'});
  await f.nodes.get('mute-call').onclick();assert.equal(input.value,'My draft');assert.equal(form.hidden,false);
  await f.nodes.get('text-toggle').onclick();assert.equal(input.value,'My draft');
  f.voice.opts.onTranscript({role:'assistant',key:'old',text:'Previous call'});
  f.nodes.get('end-call').onclick();await f.nodes.get('answer-call').onclick();
  assert.equal(form.hidden,false);assert.equal(history.children.length,1);assert.equal(history.children[0].children[2].textContent,f.personalization.greeting);
  assert.equal(input.value,'');
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

test('recommended product groups remain inline and selecting a row tries its exact product',async t=>{
  const f=fixture(t);await startShopping(f);f.nodes.get('catalog-button').onclick();
  for(const type of ['lipstick','lipbalm','chair','lamp','tshirt','hoodie','sweater','glasses']){
    recommendType(f,type);assert.equal(f.discovery.productType,type);
    assert.equal(f.nodes.get('catalog-dialog').open,false);
    assert.equal(f.voice.opts.getContext().visible_panel,'catalog');
    assert.equal(f.nodes.get('inline-items').children.filter(row=>row.dataset.id).length,Math.min(6,f.discovery.total));
  }
  const row=f.nodes.get('inline-items').children.find(row=>row.children[1]?.children.some(button=>button.textContent==='Try on'));
  assert(row,'An available optical glasses preview must be present');
  const productId=row.dataset.id;await row.children[1].children.find(button=>button.textContent==='Try on').onclick();
  assert.equal(f.nodes.get('catalog-dialog').open,false);assert.equal(f.camera.product.productType,'glasses');assert.equal(f.camera.product.id,productId);assert.equal(f.store.current.id,productId);assert.equal(f.voiceStarts,1);
  assert.equal(f.nodes.get('call-screen').scrollTop,0);assert.equal(f.voice.opts.getContext().visible_panel,'call');
});

test('each product offers an in-app introduction with a sourced retailer link',async t=>{
  const f=fixture(t);f.nodes.get('entry-camera').onclick();await startShopping(f);f.nodes.get('catalog-search-open').onclick();const rows=f.nodes.get('catalog-items').children;
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
  assert.equal(f.cameraStarts,0);assert.equal(f.voiceStarts,1);
  f.nodes.get('close-details').onclick();assert.equal(f.nodes.get('catalog-dialog').open,true);
});

test('live product details use the sourced introduction and handle unavailable photos and prices',async t=>{
  const f=fixture(t);f.nodes.get('entry-camera').onclick();await startShopping(f);
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
  await assert.rejects(f.voice.opts.onTryon('desk',{scale:1.1}),/Tap Camera/);
  await assert.rejects(f.voice.opts.onProductAction('try_on',f.store.current.id),/Tap Camera/);
  assert.equal(f.cameraStarts,starts);assert.equal(f.camera.running,false);
});

test('browse card action opens grounded details; saving only adds to local bag',async t=>{
  const f=fixture(t);await startShopping(f);const p=f.store.current;const size=f.store.queue.length;
  const details=await f.voice.opts.onProductAction('browse',p.id);
  assert.equal(f.nodes.get('details-dialog').open,true);assert.equal(f.nodes.get('detail-title').textContent,p.name);assert.equal(f.store.queue.length,size);assert.equal(details.purchased,false);
  f.nodes.get('close-details').onclick();const result=await f.voice.opts.onProductAction('save',p.id);
  assert.equal(f.store.cart.size,1);assert.equal(result.purchased,false);assert.equal(f.voiceStarts,1);
  f.nodes.get('cart-button').onclick();const actions=f.nodes.get('cart-items').children[0].children[1].children;
  assert.equal(actions[0].textContent,'Show details');assert.equal(actions[0].href,undefined);
  actions[0].onclick();assert.equal(f.nodes.get('detail-title').textContent,p.name);
});


test('old camera-permission completion cannot start voice inside a newer pending call',async t=>{
  const first=deferred(),second=deferred();const f=fixture(t,{cameraPermission:n=>n===1?first.promise:second.promise});
  const oldAnswer=f.nodes.get('answer-call').onclick();await tick();f.nodes.get('end-call').onclick();
  // Answer starts a new call from the start screen after the cancelled connection.
  f.nodes.get('answer-call').onclick();await tick();first.resolve();await oldAnswer;await tick();
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
  assert.equal(f.nodes.get('call-screen').scrollTop,0);assert.equal(f.nodes.get('product-zone').dataset.collection,'true');
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
  assert.equal(f.nodes.get('phone-app').dataset.camera,'off');assert.equal(f.nodes.get('phone-app').dataset.format,'voice');assert.equal(f.nodes.get('text-form').hidden,false);
  await f.nodes.get('toggle-camera').onclick();assert.equal(f.nodes.get('phone-app').dataset.focused,'false');assert.equal(f.voice.opts.getContext().tried_product,null);
  await f.nodes.get('product-try').onclick();assert.equal(f.nodes.get('phone-app').dataset.focused,'true');
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

test('a cancelled connection and leaving the page do not complete the first call',async t=>{
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
  assert.equal(f.nodes.has('catalog-tabs'),false);
  assert.equal(f.camera.product,undefined);
  await rows[8].children[2].onclick();
  assert.equal(f.camera.product.id,'800008');assert.equal(f.store.current.id,'800008');
  assert.equal(f.nodes.get('catalog-dialog').open,false);
});

test('a short glasses result never pads the list with defaults or exposes unrelated categories',async t=>{
  const f=fixture(t);f.nodes.get('entry-camera').onclick();await startShopping(f);
  f.voice.opts.onRecommendations([liveProducts()[0],catalog.find(p=>p.productType==='lipstick')],'Matches',{query:'glasses',category:'all',max_price:null,product_types:[]});
  const rows=f.nodes.get('catalog-items').children;
  assert.equal(rows.length,1);assert.match(rows[0].children[1].children[0].textContent,/Glasses/);
  assert.equal(f.nodes.has('catalog-tabs'),false);
  assert.equal(f.discovery.productType,'glasses');assert.equal(f.nodes.get('catalog-items').children.length,1);
  assert.doesNotMatch(html,/catalog-download|download="coupi/);
});

test('typed search asks for ten choices and excludes paused memories',async t=>{
  let body;
  const storage=new Map([['coupi_memory',JSON.stringify([{text:'Rose gold'}])],['coupi_memory_paused','1']]);
  const f=fixture(t,{storage,fetch:async(url,init)=>{body=JSON.parse(init.body);return {ok:true,json:async()=>({products:liveProducts().slice(0,10)})};}});
  f.nodes.get('entry-camera').onclick();await startShopping(f);f.nodes.get('catalog-search-input').value='glasses';
  await f.nodes.get('catalog-search-form').onsubmit({preventDefault(){}});
  assert.equal(body.limit,10);assert.deepEqual(body.memories,[]);
  assert.equal(f.nodes.get('catalog-items').children.length,10);
});

test('a listing without a photo stays in the choices but cannot start the camera',async t=>{
  const f=fixture(t);f.nodes.get('entry-camera').onclick();await startShopping(f);
  f.voice.opts.onRecommendations([{...liveProducts()[0],image:null}]);
  const button=f.nodes.get('catalog-items').children[0].children[2];
  assert.equal(button.disabled,true);assert.equal(button.textContent,'No preview');
  await button.onclick();assert.equal(f.cameraStarts,0);f.camera.running=true;
  await assert.rejects(f.voice.opts.onProductAction('try_on','800000'),/no preview photo/);
  assert.equal(f.cameraStarts,0);
});
test('live results keep the backend unavailable-preview flag and never activate a camera for an unreviewed photo',async t=>{
  const f=fixture(t);f.nodes.get('entry-camera').onclick();await startShopping(f);
  const unavailableReason='This newly found listing has no reviewed try-on photo.';
  const product={...liveProducts()[0],preview:{available:false,reason:unavailableReason}};
  f.voice.opts.onRecommendations([product],'Matching frames',{query:'glasses',category:'glasses',sourceOnly:true},'live');
  const stored=f.store.catalog.get(product.id),button=f.nodes.get('catalog-items').children[0].children[2];
  assert.equal(stored.preview.available,false);assert.equal(stored.preview.unavailableReason,unavailableReason);
  assert.equal(button.disabled,true);assert.equal(button.textContent,'No preview');
  await button.onclick();assert.equal(f.cameraStarts,0);assert.equal(f.camera.running,false);assert.equal(f.camera.product,undefined);
  await assert.rejects(f.voice.opts.onProductAction('try_on',product.id),/Tap Camera/);
  assert.equal(f.cameraStarts,0);
  await f.nodes.get('toggle-camera').onclick();
  const result=await f.voice.opts.onProductAction('try_on',product.id);
  assert.equal(result.ok,false);assert.equal(result.unavailableReason,unavailableReason);
  assert.equal(f.camera.product,undefined);assert.equal(f.voice.opts.getContext().visible_product.preview_available,false);
});

test('typed Coupang search includes saved preferences and shows results without restarting the call or starting the camera',async t=>{
  let body;
  const storage=new Map([['coupi_memory',JSON.stringify([{text:'I like white frames',source:'you told me'}])]]);
  const f=fixture(t,{storage,fetch:async(url,init)=>{assert.equal(url,'/api/products/search');body=JSON.parse(init.body);return {ok:true,json:async()=>({products:liveProducts()})};}});
  f.nodes.get('entry-camera').onclick();await startShopping(f);f.nodes.get('catalog-search-input').value='white glasses';
  await f.nodes.get('catalog-search-form').onsubmit({preventDefault(){}});
  assert.deepEqual(body.memories,['I like white frames']);assert.equal(body.query,'white glasses');
  assert.equal(f.nodes.get('catalog-items').children.length,15);assert.equal(f.cameraStarts,0);assert.equal(f.voiceStarts,1);
});

test('voice glasses results hide unrelated categories and refresh replaces the list with unseen glasses',async t=>{
  let request;
  const old=liveProducts()[0],fresh={...liveProducts()[1],id:'999001',url:'https://www.coupang.com/vp/products/999001'};
  const f=fixture(t,{fetch:async(url,init)=>{request=JSON.parse(init.body);return {ok:true,json:async()=>({products:[old,fresh,catalog.find(p=>p.productType==='chair')]})};}});
  await f.nodes.get('answer-call').onclick();
  f.voice.opts.onRecommendations([old,catalog.find(p=>p.productType==='chair')],'Found products',{query:'white glasses',category:'glasses',max_price:25000,product_types:['glasses']});
  assert.equal(f.nodes.has('catalog-tabs'),false);
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
  f.nodes.get('entry-camera').onclick();await startShopping(f);recommendType(f,'glasses');
  const refresh=f.nodes.get('catalog-refresh').onclick();
  assert.equal(f.nodes.get('catalog-refresh').disabled,true);
  f.nodes.get('catalog-refresh').onclick();assert.equal(calls,1);
  pending.resolve({ok:false,json:async()=>({error:'Search unavailable. Try again.'})});await refresh;
  assert.equal(f.nodes.get('catalog-refresh').disabled,false);assert.match(f.nodes.get('catalog-summary').textContent,/Search unavailable/);
});

test('refresh retries the latest failed query instead of reverting to an older product category',async t=>{
  const requests=[];
  const f=fixture(t,{fetch:async(url,init)=>{requests.push(JSON.parse(init.body));return {ok:false,json:async()=>({error:'Try again'})};}});
  f.nodes.get('entry-camera').onclick();await startShopping(f);recommendType(f,'chair');
  f.nodes.get('catalog-search-input').value='white glasses';
  await f.nodes.get('catalog-search-form').onsubmit({preventDefault(){}});
  await f.nodes.get('catalog-refresh').onclick();
  assert.equal(requests[1].query,'white glasses');assert.deepEqual(requests[1].exclude_ids,[]);
  assert.equal(f.nodes.has('catalog-tabs'),false);
});

test('search failure is visible and ending a call discards late search results',async t=>{
  const pending=deferred();const f=fixture(t,{fetch:()=>pending.promise});
  f.nodes.get('entry-camera').onclick();await startShopping(f);f.nodes.get('catalog-search-input').value='white glasses';
  const searching=f.nodes.get('catalog-search-form').onsubmit({preventDefault(){}});
  f.nodes.get('end-call').onclick();pending.resolve({ok:true,json:async()=>({products:liveProducts()})});await searching;
  assert.equal(f.nodes.get('catalog-dialog').open,false);assert.equal(f.nodes.get('phone-app').dataset.phase,'incoming');
  const failure=fixture(t,{fetch:async()=>({ok:false,json:async()=>({error:'Search unavailable. Try again.'})})});
  failure.nodes.get('entry-camera').onclick();await startShopping(failure);failure.nodes.get('catalog-search-input').value='white glasses';
  await failure.nodes.get('catalog-search-form').onsubmit({preventDefault(){}});
  assert.equal(failure.nodes.get('catalog-items').children.length,0);assert.match(failure.nodes.get('catalog-summary').textContent,/Search unavailable/);
  assert.equal(failure.nodes.get('catalog-search-submit').disabled,false);
});


test('selecting a non-first result adds only that product, retains selection, and never bulk-adds a group',async t=>{
  const f=fixture(t);await startShopping(f);f.nodes.get('catalog-button').onclick();
  const second=f.discovery.visible[1];assert(second);f.nodes.get('catalog-items').children[1].children[0].onclick();
  assert.equal(f.store.current.id,second.id);assert.equal(f.discovery.current.id,second.id);
  f.nodes.get('close-catalog').onclick();await f.nodes.get('product-save').onclick();
  assert.deepEqual(Array.from(f.store.cart.keys()),[second.id]);assert.equal(f.store.current.id,second.id);
  await f.nodes.get('product-save').onclick();assert.equal(f.store.cart.size,1);
});

test('a saved result group returns after switching styles with selected product intact',async t=>{
  const f=fixture(t);await startShopping(f);
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
  await f.nodes.get('text-toggle').onclick();f.nodes.get('chat-image-file').files=[{name:'outfit.jpg'}];await f.nodes.get('chat-image-file').onchange();f.nodes.get('text-input').value='Find this look';
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
  const f=fixture(t);await startShopping(f);f.nodes.get('catalog-button').onclick();
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

test('ending the call cancels an unfinished checkout without altering the bag',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='glasses'));
  const product=f.store.current;f.store.cart.set(product.id,product);f.nodes.get('back-camera').onclick();
  f.nodes.get('product-buy').onclick();
  f.nodes.get('checkout-next').onclick();
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
  const f=fixture(t);await startShopping(f);f.nodes.get('cart-button').onclick();
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

test('recommendations open six picks inside the fixed product panel, expand to ten, and leave the call stationary',async t=>{
  const f=fixture(t,{catalog:inlineCatalog()});await f.nodes.get('answer-call').onclick();
  f.voice.opts.onRecommendations([...f.store.catalog.values()].filter(p=>p.productType==='lipstick'),'',{query:'pink lipstick',category:'makeup',sourceOnly:true},'ready');
  assert.equal(inlineRows(f).length,6);assert.equal(f.nodes.get('inline-more').hidden,false);
  assert.match(f.nodes.get('inline-description').textContent,/6 brands/);
  assert.equal(f.nodes.get('inline-products').hidden,false);assert.equal(f.nodes.get('product-zone').dataset.collection,'true');
  assert.equal(f.nodes.get('catalog-dialog').open,false);assert.equal(f.voice.opts.getContext().visible_panel,'catalog');
  assert.equal(f.nodes.get('call-screen').scrollTop,0);
  const scroller=f.nodes.get('product-panel-scroll');scroller.scrollTop=180;
  f.nodes.get('inline-more').onclick();assert.equal(inlineRows(f).length,10);assert.equal(f.nodes.get('inline-more').hidden,true);
  assert.equal(scroller.scrollTop,180,'View more retains the position inside the product window');assert.equal(f.nodes.get('call-screen').scrollTop,0);
  f.nodes.get('back-camera').onclick();assert.equal(f.nodes.get('inline-products').hidden,true);assert.equal(f.nodes.get('product-zone').dataset.collection,'false');assert.equal(f.voice.opts.getContext().visible_panel,'call');
  assert.equal(f.cameraStarts,1);assert.equal(f.voiceStarts,1);
  f.nodes.get('group-open').onclick();assert.equal(scroller.scrollTop,180);assert.equal(f.nodes.get('call-screen').scrollTop,0);assert.equal(f.voice.call.ready,true);assert.equal(f.camera.running,true);
});

test('parallel product try-on and adjustment share one photo load and both report the same applied preview',async t=>{
  const loaded=deferred();let loads=0;const f=fixture(t,{productLoad:()=>{loads++;return loaded.promise;}});await f.nodes.get('answer-call').onclick();
  const lamp=catalog.find(product=>product.productType==='lamp');f.voice.opts.onRecommendations([lamp],'',{productType:'lamp',sourceOnly:true});
  const product=f.voice.opts.onProductAction('try_on',lamp.id),adjustment=f.voice.opts.onTryon('desk',{scale:1.1});
  assert.equal(loads,1);loaded.resolve();const [applied,adjusted]=await Promise.all([product,adjustment]);
  assert.equal(applied.ok,true);assert.equal(applied.product.id,lamp.id);assert.equal(adjusted.product_id,lamp.id);assert.equal(f.camera.options.scale,1.1);assert.equal(f.camera.product.id,lamp.id);
});

test('fresh spoken recommendations replace an open details panel and acknowledge the exact visible cards',async t=>{
  const f=fixture(t,{catalog:inlineCatalog()});await f.nodes.get('answer-call').onclick();
  const lipsticks=[...f.store.catalog.values()].filter(p=>p.productType==='lipstick');
  f.voice.opts.onRecommendations(lipsticks,'',{query:'pink lipstick',sourceOnly:true});
  await f.voice.opts.onProductAction('details');assert.equal(f.nodes.get('details-dialog').open,true);
  const glasses=[...f.store.catalog.values()].filter(p=>p.productType==='glasses'&&p.tags.includes('optical'));
  const shown=f.voice.opts.onRecommendations(glasses,'',{query:'normal glasses',sourceOnly:true});
  assert.equal(shown.ok,true);assert.deepEqual(Array.from(shown.product_ids),glasses.map(p=>p.id));assert.deepEqual(Array.from(shown.visible_product_ids),inlineRows(f).map(row=>row.dataset.id));
  assert.equal(f.nodes.get('details-dialog').open,false);assert.equal(f.nodes.get('catalog-dialog').open,false);assert.equal(f.nodes.get('product-zone').hidden,false);assert.equal(f.nodes.get('inline-products').hidden,false);
  const failed=f.voice.opts.onRecommendations([{...glasses[0],id:'unknown-server-product'}],'',{query:'glasses',sourceOnly:true});assert.equal(failed.ok,false);assert.deepEqual(Array.from(failed.product_ids),[]);
});

test('spoken skip reports the new collection and does not claim success when no collection exists',async t=>{
  const f=fixture(t,{catalog:inlineCatalog()});await f.nodes.get('answer-call').onclick();
  const lipsticks=[...f.store.catalog.values()].filter(p=>p.productType==='lipstick');f.voice.opts.onRecommendations(lipsticks,'',{query:'pink lipstick',sourceOnly:true});
  const previous=f.store.current.id;const skipped=await f.voice.opts.onProductAction('skip');assert.equal(skipped.ok,true);assert.notEqual(skipped.product.id,previous);assert.equal(skipped.product.id,f.store.current.id);assert.equal(skipped.product.productType,'lipbalm');assert.deepEqual(Array.from(skipped.visible_product_ids),inlineRows(f).map(row=>row.dataset.id));
  const single=fixture(t,{catalog:[catalog.find(p=>p.productType==='glasses')]});await single.nodes.get('answer-call').onclick();single.voice.opts.onRecommendations([...single.store.catalog.values()],'',{query:'normal glasses',productType:'glasses',sourceOnly:true});
  const unchanged=single.store.current.id,failed=await single.voice.opts.onProductAction('skip');assert.equal(failed.ok,false);assert.equal(single.store.current.id,unchanged);assert.match(failed.error,/No different collection/);
});

test('internal product scrolling, selection and comparison preserve position without moving the call',async t=>{
  const f=fixture(t,{catalog:inlineCatalog()});await f.nodes.get('answer-call').onclick();
  f.voice.opts.onRecommendations([...f.store.catalog.values()].filter(p=>p.productType==='lipstick'));
  const scroller=f.nodes.get('product-panel-scroll');scroller.scrollTop=210;scroller.emit('scroll');
  const selected=inlineRows(f)[2],id=selected.dataset.id;selected.children[0].onclick();
  assert.equal(f.store.current.id,id);assert.equal(scroller.scrollTop,210);
  inlineAction(inlineRows(f)[2],'Compare').onclick();assert.equal(scroller.scrollTop,210);assert.equal(f.discovery.comparison.length,1);
  inlineAction(inlineRows(f)[2],'Add to bag').onclick();assert.equal(scroller.scrollTop,210);assert.deepEqual(Array.from(f.store.cart.keys()),[id]);
  f.voice.opts.onTranscript({key:'while-browsing',role:'assistant',text:'Here are a few options.',final:true});
  assert.equal(scroller.scrollTop,210);assert.equal(f.nodes.get('call-screen').scrollTop,0);assert.equal(f.voice.call.ready,true);assert.equal(f.camera.running,true);
  scroller.scrollTop=0;scroller.emit('scroll');assert.equal(f.voice.opts.getContext().visible_panel,'catalog');
  f.nodes.get('back-camera').onclick();assert.equal(f.voice.opts.getContext().visible_panel,'call');
});

test('new categories, related collections and fresh recommendations reset only the internal product list',async t=>{
  const f=fixture(t,{catalog:inlineCatalog()});await f.nodes.get('answer-call').onclick();
  f.nodes.get('catalog-button').onclick();const scroller=f.nodes.get('product-panel-scroll');
  scroller.scrollTop=210;recommendType(f,'tshirt');assert.equal(scroller.scrollTop,0);
  scroller.scrollTop=210;f.nodes.get('inline-next').onclick();assert.equal(scroller.scrollTop,0);assert.equal(f.discovery.collectionStyle,'branded');
  scroller.scrollTop=210;f.voice.opts.onRecommendations([...f.store.catalog.values()].filter(p=>p.productType==='lipstick'));assert.equal(scroller.scrollTop,0);
  assert.equal(f.nodes.get('call-screen').scrollTop,0);assert.equal(f.nodes.get('inline-products').hidden,false);
  f.nodes.get('end-call').onclick();assert.equal(f.nodes.get('inline-products').hidden,true);assert.equal(f.nodes.get('product-zone').dataset.collection,'false');assert.equal(scroller.scrollTop,0);
});

test('Try on from an inline row returns the chosen product to the camera and only its Add action affects the bag',async t=>{
  const f=fixture(t,{catalog:inlineCatalog()});await f.nodes.get('answer-call').onclick();
  recommendType(f,'tshirt');const target=inlineRows(f)[3],id=target.dataset.id;
  inlineAction(target,'Add to bag').onclick();assert.deepEqual(Array.from(f.store.cart.keys()),[id]);
  await inlineAction(target,'Try on').onclick();
  assert.equal(f.camera.product.id,id);assert.equal(f.store.current.id,id);assert.equal(f.camera.mode,'clothes');
  assert.equal(f.nodes.get('call-screen').scrollTop,0);assert.equal(f.voice.opts.getContext().visible_panel,'call');
  assert.equal(f.voice.call.ready,true);assert.equal(f.cameraStarts,1);assert.equal(f.voiceStarts,1);
});

test('Save collection retains all ten picks and selected item across a six-item related collection',async t=>{
  const memory=new Map(),storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
  const f=fixture(t,{catalog:inlineCatalog(),storage});await startShopping(f);recommendType(f,'lipstick');
  const selected=inlineRows(f)[2];selected.children[0].onclick();const selectedId=selected.dataset.id;
  f.nodes.get('inline-save').onclick();assert.equal(f.discovery.collections.length,1);assert.equal(f.discovery.collections[0].productCount,10);assert.equal(memory.size,1);
  f.nodes.get('inline-next').onclick();assert.equal(f.discovery.productType,'lipbalm');assert.equal(inlineRows(f).length,6);assert.equal(f.store.cart.size,0);
  f.nodes.get('inline-saved').onclick();const saved=f.nodes.get('collection-items').children[0];saved.children[3].children[0].onclick();
  assert.equal(f.nodes.get('collections-dialog').open,false);assert.equal(f.nodes.get('catalog-dialog').open,false);
  assert.equal(f.discovery.productType,'lipstick');assert.equal(f.store.current.id,selectedId);assert.equal(inlineRows(f).length,6);
  assert.equal(f.voice.opts.getContext().visible_panel,'catalog');assert.equal(f.nodes.get('call-screen').scrollTop,0);assert.equal(f.nodes.get('inline-products').hidden,false);
  f.nodes.get('inline-more').onclick();assert.equal(inlineRows(f).length,10);assert.equal(f.store.cart.size,0);
});

test('Next collection presents related eyewear, branded shirts and sweaters as separate six-item groups',async t=>{
  const f=fixture(t,{catalog:inlineCatalog()});await startShopping(f);
  for(const [type,expected,theme,style] of [['glasses','glasses','sunglasses',''],['tshirt','tshirt','','branded'],['hoodie','sweater','','']]){
    recommendType(f,type);const before=inlineRows(f).map(row=>row.dataset.id);assert.equal(before.length,6);
    f.nodes.get('inline-next').onclick();assert.equal(f.discovery.productType,expected);assert.equal(f.discovery.theme,theme);assert.equal(f.discovery.collectionStyle,style);
    const after=inlineRows(f).map(row=>row.dataset.id);assert.equal(after.length,6);assert(after.every(id=>!before.includes(id)));assert.equal(f.store.cart.size,0);
  }
});

test('inline call bar keeps mute and end usable while the collection is visible',async t=>{
  const f=fixture(t,{catalog:inlineCatalog()});await f.nodes.get('answer-call').onclick();recommendType(f,'lipstick');
  assert.equal(f.nodes.get('inline-mute').disabled,false);assert.equal(f.nodes.get('inline-mute').attributes['aria-label'],'Mute microphone');
  f.nodes.get('inline-mute').onclick();assert.equal(f.voice.mutes,1);assert.equal(f.nodes.get('inline-mute').attributes['aria-label'],'Unmute microphone');
  assert.equal(f.nodes.get('inline-mute').attributes['aria-pressed'],'true');assert.equal(f.nodes.get('mute-call').attributes['aria-pressed'],'true');
  assert.match(f.nodes.get('inline-call-status').textContent,/mic muted/);assert.equal(f.voice.opts.getContext().visible_panel,'catalog');
  f.nodes.get('inline-end').onclick();assert.equal(f.camera.running,false);assert.equal(f.voice.call,null);
  assert.equal(f.nodes.get('phone-app').dataset.phase,'incoming');assert.equal(f.nodes.get('call-screen').scrollTop,0);assert.equal(f.nodes.get('inline-mute').disabled,true);
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



function parentResult(f,id,result,type='coupi-call-result'){f.events.emit('message',{origin:'https://coupi.test',source:f.context.window.parent,data:{type,id,result}});}
const checkedResult=()=>({status:'ok',message:'one considered pick.',conversationMode:'request',interviewCount:0,interviewComplete:false,worldReady:false,verdict:{pickSkuId:'socks',reason:'Red, under your stated budget.',dissent:'Two seeded reviews describe pilling.',citations:['socks-r-15','socks-r-16'],runnerUpSkuId:null,whyRunnerUpLost:'',clarifyingQuestion:null},proposedSkuIds:['socks'],products:[{id:'socks',name:'Red training socks',price:6900,delivery:'Demo delivery tomorrow',image:null}]});
function personalizationContext(f,values={}){f.events.emit('message',{origin:'https://coupi.test',source:f.context.window.parent,data:{type:'coupi-personalization-context',active:true,question:'What is your favorite quiet corner?',count:2,draftPending:false,memories:[],...values}});}
const editablePreferences={interests:['focused_work'],vibe:'calm',budget:30000,story:'I like reading beside my desk.'};

test('world product open rechecks the server and stops camera/microphone before the exact parent event',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();const requests=[];
  f.context.fetch=async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});return{ok:true,json:async()=>({ok:true,catalog_namespace:'world-simulation',skuId:'socks'})};};
  f.context.window.parent.postMessage=(data,target)=>{if(data.type==='coupi-live-call-product'){assert.equal(f.camera.running,false);assert.equal(f.voice.call,null);}f.messages.push({data,target});};
  const result=await f.voice.opts.onWorldProduct('socks');assert.equal(result.ok,true);
  assert.deepEqual(requests,[{url:'/api/products/world',body:{action:'open',skuId:'socks'}}]);
  const event=f.messages.find(message=>message.data.type==='coupi-live-call-product');
  assert.deepEqual(JSON.parse(JSON.stringify(event)),{data:{type:'coupi-live-call-product',namespace:'world-simulation',skuId:'socks'},target:'https://coupi.test'});
  assert.equal(f.store.cart.size,0);assert(!f.store.catalog.has('socks'));
});

test('excluded and unknown products do not navigate or stop the active call, including numeric source IDs',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();let requests=0;
  f.context.fetch=async()=>{requests++;return{ok:true,json:async()=>({ok:false,error:'Already owned or excluded.'})};};
  assert.equal((await f.voice.opts.onWorldProduct('detergent')).ok,false);assert.equal(f.camera.running,true);assert(f.voice.call);
  assert.equal((await f.voice.opts.onWorldProduct('9999999999')).ok,false);assert.equal(requests,2);
  assert(!f.messages.some(message=>message.data.type==='coupi-live-call-product'));
});

test('world result rows retain their simulation namespace and Details opens the shared evidence flow',async t=>{
  const f=fixture(t);await f.nodes.get('entry-chat').onclick();
  f.voice.opts.onWorldRecommendations([{skuId:'socks',name:'Red socks',price:6900,catalog_namespace:'world-simulation'},{id:catalog[0].id,name:'Source listing',catalog_namespace:'sourced-listings'}]);
  assert.equal(f.nodes.get('world-picks').hidden,false);assert.equal(f.nodes.get('product-zone').hidden,true);assert.equal(f.nodes.get('world-picks-list').children.length,1);
  const row=f.nodes.get('world-picks-list').children[0];assert.equal(row.children[0].children[0].textContent,'Red socks');assert.equal(row.children[1].textContent,'Details ↗');
  f.context.fetch=async()=>({ok:true,json:async()=>({ok:true,catalog_namespace:'world-simulation',skuId:'socks'})});await row.children[1].onclick();
  assert(f.messages.some(message=>message.data.type==='coupi-live-call-product'&&message.data.skuId==='socks'));assert.equal(f.voiceStarts,1);assert.equal(f.cameraStarts,0);
});

test('memory bridge sends final user words only, deduplicates, and rejects foreign stop messages',async t=>{
  const f=fixture(t,{search:'?checked=1'});await f.nodes.get('answer-call').onclick();
  f.voice.opts.onTranscript({role:'assistant',key:'a',text:'You like expensive things',final:true});
  f.voice.opts.onTranscript({role:'user',key:'u',text:'I want a quiet lamp',final:false});
  f.voice.opts.onTranscript({role:'user',key:'u',text:'I want a quiet lamp',final:true});
  f.voice.opts.onTranscript({role:'user',key:'u',text:'I want a quiet lamp',final:true});
  const entries=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript');
  assert.equal(entries.length,1);assert.equal(entries[0].data.text,'I want a quiet lamp');assert.equal(entries[0].target,'https://coupi.test');assert(entries[0].data.id.length<=90);
  f.events.emit('message',{origin:'https://other.test',source:f.context.window.parent,data:{type:'coupi-live-call-stop'}});assert.equal(f.camera.running,true);
  f.events.emit('message',{origin:'https://coupi.test',source:{},data:{type:'coupi-live-call-stop'}});assert.equal(f.camera.running,true);
  f.events.emit('message',{origin:'https://coupi.test',source:f.context.window.parent,data:{type:'coupi-live-call-stop'}});assert.equal(f.camera.running,false);assert.equal(f.voice.call,null);
});

test('final actual turns attach one consented raw frame; periodic, partial and assistant snapshots never trigger requests',async t=>{
  const f=fixture(t,{search:'?checked=1'});await f.nodes.get('answer-call').onclick();
  f.visionTick();f.voice.opts.onTranscript({role:'assistant',key:'a1',text:'which one?',final:true});f.voice.opts.onTranscript({role:'user',key:'u1',text:'this',final:false});
  assert.equal(f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').length,0);
  for(const [i,text] of ['which one?','what do I need?','what’s missing?','this or that?'].entries())f.voice.opts.onTranscript({role:'user',key:'camera-'+i,text,final:true});
  const entries=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript');assert.equal(entries.length,4);
  for(const {data} of entries){assert.equal(data.photo.mime,'image/jpeg');assert.equal(data.photo.dataUrl,'data:image/jpeg;base64,AQID');assert(Number.isFinite(Date.parse(data.photo.capturedAt)));assert.equal(data.role,'user');}
  f.nodes.get('vision-consent').checked=false;f.nodes.get('vision-consent').onchange();f.voice.opts.onTranscript({role:'user',key:'private',text:'my mornings are busy',final:true});
  const privateTurn=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').at(-1);assert(!('photo' in privateTurn.data));
  f.voice.opts.onTranscript({role:'user',key:'synthetic',text:'invented prompt',final:true,synthetic:true});assert.equal(f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').length,5);
});

test('checked call cards use returned exact products, citations and safe fields without another request',async t=>{
  const f=fixture(t,{search:'?checked=1'});await f.nodes.get('answer-call').onclick();
  f.voice.opts.onTranscript({role:'user',key:'shop',text:'red socks tomorrow',final:true});
  const id=f.messages.find(row=>row.data.type==='coupi-live-call-transcript').data.id;
  assert.equal(f.nodes.get('validated-call').dataset.state,'pending');assert.equal(f.nodes.get('validated-call').hidden,true);assert.equal(f.nodes.get('call-status').textContent,'Thinking…');
  let resolved=false;const waiting=f.voice.opts.onResolveCall().then(result=>{resolved=true;return result;});
  const result=checkedResult();result.profile={secret:'PRIVATE_PROFILE'};result.diary='PRIVATE_DIARY';result.products.push({id:'rogue',name:'UNVALIDATED_PRODUCT',price:1});
  f.events.emit('message',{origin:'https://attacker.test',source:f.context.window.parent,data:{type:'coupi-call-result',id,result}});await tick();assert.equal(resolved,false);
  parentResult(f,id,result);const safe=await waiting;const serialized=JSON.stringify(safe);assert(!serialized.includes('PRIVATE_'));assert(!serialized.includes('UNVALIDATED_PRODUCT'));
  const nodes=descendants(f.nodes.get('validated-call-content'));assert(nodes.some(n=>n.textContent==='Red training socks'));assert(!nodes.some(n=>n.textContent==='PENDING YOUR APPROVAL · nothing ordered'));assert(nodes.some(n=>n.tagName==='DETAILS'&&!n.open));assert(nodes.some(n=>n.textContent==='Two seeded reviews describe pilling.'));
  f.context.fetch=async(_url,init)=>({ok:true,json:async()=>({ok:true,catalog_namespace:'world-simulation',skuId:JSON.parse(init.body).skuId})});
  await nodes.find(n=>n.textContent==='review 1 ↗').onclick();
  const opened=f.messages.find(row=>row.data.type==='coupi-live-call-product').data;assert.equal(opened.skuId,'socks');assert.equal(opened.callId,id);assert.equal(opened.reviewId,'socks-r-15');
  assert.equal(f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').length,1);
});

test('checked inventories keep uncertainty, proposed cards and exact numeric identities outside the approved try-on catalog',async t=>{
  const f=fixture(t,{search:'?checked=1'});await f.nodes.get('answer-call').onclick();f.voice.opts.onTranscript({role:'user',key:'scan',text:'what is missing?',final:true});
  const id=f.messages.find(row=>row.data.type==='coupi-live-call-transcript').data.id;
  parentResult(f,id,{...checkedResult(),verdict:undefined,inventory:{items:[{name:'milk',quantity:'one carton',status:'low'}],lowOrMissing:[{name:'greens',reason:'not visible',confidence:'low'}],uncertainties:['The back shelf is obscured.']},proposedSkuIds:['9999999998'],products:[{id:'9999999998',name:'Sourced reference',price:10000,priceBasis:'historical-reference',image:'/live-call/products/example.jpg',delivery:'Current delivery unknown'}]});
  const nodes=descendants(f.nodes.get('validated-call-content'));assert(nodes.some(n=>n.textContent==='milk · one carton — low'));assert(nodes.some(n=>n.textContent==='The back shelf is obscured.'));assert(nodes.some(n=>n.textContent==='REFERENCE PRICE · confirm current price on Coupang'));
  f.context.fetch=async()=>({ok:true,json:async()=>({ok:true,catalog_namespace:'world-simulation',skuId:'9999999998'})});
  await nodes.find(n=>n.textContent==='Details').onclick();assert.equal(f.messages.find(row=>row.data.type==='coupi-live-call-product').data.skuId,'9999999998');
});

test('retry reopens the same checked turn while unknown or stale results cannot replace the latest card',async t=>{
  const f=fixture(t,{search:'?checked=1'});await f.nodes.get('answer-call').onclick();f.voice.opts.onTranscript({role:'user',key:'retry',text:'socks',final:true});const id=f.messages.find(row=>row.data.type==='coupi-live-call-transcript').data.id;
  const emit=data=>f.events.emit('message',{origin:'https://coupi.test',source:f.context.window.parent,data});
  emit({type:'coupi-call-error',id,error:'Connection paused.'});assert.equal(f.nodes.get('validated-call').dataset.state,'error');
  let retries=0;f.voice.resolveAppTurn=()=>{retries++;};emit({type:'coupi-call-pending',id});emit({type:'coupi-call-pending',id});assert.equal(retries,1);
  const waiting=f.voice.opts.onResolveCall();parentResult(f,'unknown',checkedResult());assert.equal(f.nodes.get('validated-call').dataset.state,'pending');
  parentResult(f,id,checkedResult());assert.equal((await waiting).status,'ok');
  f.voice.opts.onTranscript({role:'user',key:'next',text:'something else',final:true});parentResult(f,id,{...checkedResult(),message:'OLD ANSWER'});assert.equal(f.nodes.get('validated-call').dataset.state,'pending');assert(!descendants(f.nodes.get('validated-call-content')).some(n=>n.textContent==='OLD ANSWER'));
});

test('bridge drops oversized frames and only eligible result products can carry local images',async t=>{
  const f=fixture(t,{search:'?checked=1'});await f.nodes.get('answer-call').onclick();const bridge=f.context.window.CoupiCallBridge;
  const id=bridge.transcript({role:'user',key:'image-bound',text:'this one',final:true},{dataUrl:'data:image/jpeg;base64,'+'A'.repeat(22001),mime:'image/jpeg',capturedAt:new Date().toISOString()});
  assert(!('photo' in f.messages.find(row=>row.data.id===id).data));
  const result=checkedResult();result.products[0].image='https://untrusted.example/pixel';parentResult(f,id,result);const safe=await bridge.resolveLatest();assert.equal(safe.products[0].image,null);
});

test('late prior transcripts persist their actual words without replacing the current checked turn',async t=>{
  const f=fixture(t,{search:'?checked=1'});await f.nodes.get('answer-call').onclick();f.voice.opts.onUserTurnStart();
  f.voice.opts.onTranscript({role:'user',key:'current',text:'red socks',final:true});const current=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').at(-1).data;
  f.voice.opts.onTranscript({role:'user',key:'older',text:'a kettle',final:true,superseded:true});const older=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').at(-1).data;assert(!('photo' in older));assert.equal(older.text,'a kettle');
  let resolved=false;const waiting=f.voice.opts.onResolveCall().then(value=>{resolved=true;return value;});parentResult(f,older.id,{...checkedResult(),message:'OLD ANSWER'});await tick();assert.equal(resolved,false);assert.equal(f.nodes.get('validated-call').dataset.state,'pending');
  parentResult(f,current.id,checkedResult());assert.equal((await waiting).verdict.pickSkuId,'socks');assert(!descendants(f.nodes.get('validated-call-content')).some(n=>n.textContent==='OLD ANSWER'));
});


test('embedded entry waits for its parent then starts shopping even if legacy context still contains interview questions',async t=>{
  const f=fixture(t,{search:'?embedded=1'});await f.nodes.get('answer-call').onclick();assert.equal(f.voiceStarts,0);
  personalizationContext(f,{count:0,question:'What makes a good weekend for you?',draftPending:true});await f.nodes.get('answer-call').onclick();
  assert.equal(f.voiceStarts,1);assert.equal(f.cameraStarts,1);assert.equal(f.voice.opts.greeting,'Hi Kayleen! What can I help you find today?');assert.equal(f.voice.opts.getContext().personalization.active,false);assert.equal(f.voice.opts.getContext().personalization.draft_pending,false);
  assert.equal(f.nodes.get('personalization-strip').hidden,true);assert.equal(f.nodes.get('update-preferences').hidden,true);assert.equal(f.nodes.get('personalization-summary-dialog')?.open||false,false);
  f.nodes.get('end-call').onclick();await f.nodes.get('entry-chat').onclick();assert.equal(f.voice.opts.greeting,'Hi Kayleen! What can I help you find today?');assert.equal(f.voice.inputMode,'text');
});

test('removed preference tools cannot open review while the shopping call remains available',async t=>{
  const f=fixture(t,{search:'?interview=1'});personalizationContext(f);await f.nodes.get('answer-call').onclick();const call=f.voice.call;
  assert.throws(()=>f.voice.opts.onPreferences({action:'draft',preferences:editablePreferences}));assert.throws(()=>f.voice.opts.onPreferences({action:'skip'}));
  assert.equal(f.voice.call,call);assert.equal(f.messages.filter(row=>row.data.type==='coupi-personalization-review'||row.data.type==='coupi-personalization-skip').length,0);
  await f.nodes.get('text-toggle').onclick();assert.equal(f.voice.inputMode,'text');assert.equal(f.camera.running,true);
});

test('offline calls request no camera or microphone even when an entry handler is invoked directly',async t=>{
  const f=fixture(t,{status:{ready:false,offline:true,reason:'Offline mode'}});await f.nodes.get('answer-call').onclick();await f.nodes.get('entry-chat').onclick();
  assert.equal(f.cameraStarts,0);assert.equal(f.voiceStarts,0);assert.equal(f.nodes.get('incoming-status').textContent,'Offline mode');
});

test('an explicitly uploaded image reaches the checked parent answer only after confirmed delivery, with camera off',async t=>{
  const f=fixture(t,{search:'?checked=1'});await f.nodes.get('entry-chat').onclick();const image={dataUrl:'data:image/jpeg;base64,AQID',name:'desk.jpg'};
  f.voice.opts.onTranscript({role:'user',key:'upload',text:'Which lamp fits?',image,final:false,delivery:'pending'});
  assert.equal(f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').length,0);
  f.voice.opts.onTranscript({role:'user',key:'failed',text:'Unsent photo',image,final:true,delivery:'failed'});
  assert.equal(f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').length,0);
  f.voice.opts.onTranscript({role:'user',key:'upload',text:'Which lamp fits?',image,final:true,delivery:'sent'});
  const sent=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript');assert.equal(sent.length,1);assert.equal(sent[0].data.photo.dataUrl,image.dataUrl);
  assert.equal(f.cameraStarts,0);assert.equal(f.voice.inputMode,'text');assert.equal(f.voice.images.length,0);
});

test('the embedded catalog and every local frontend asset resolve within its own namespace',()=>{
  const scope={window:{}};vm.createContext(scope);vm.runInContext(readFileSync(new URL('../public/live-call/coupang-products.js',import.meta.url),'utf8'),scope);
  assert.equal(catalog.length,68);assert.deepEqual(JSON.parse(JSON.stringify(scope.window.COUPANG_PRODUCTS)),catalog);
  for(const product of catalog){assert.match(product.url,/^https:\/\/www\.coupang\.com\/vp\/products\//);assert.match(product.image,/^\/live-call\/products\//);assert(existsSync(new URL('../public'+product.image,import.meta.url)),product.image);}
  for(const [,path]of html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)){assert(path.startsWith('/live-call/'),path);assert(existsSync(new URL('../public'+path,import.meta.url)),path);}
});


test('checked answers wait for large uploaded photos to resize before resolving the exact user turn',async t=>{
  const f=fixture(t,{search:'?checked=1'});await f.nodes.get('entry-chat').onclick();let decode;
  f.context.Image=class{constructor(){decode=this;this.naturalWidth=1600;this.naturalHeight=1000;}};
  f.voice.opts.onUserTurnStart();f.voice.opts.onTranscript({role:'user',key:'large-photo',text:'What fits this room?',final:true,image:{dataUrl:'data:image/png;base64,AQID'}});
  let settled=false;const answer=f.voice.opts.onResolveCall().then(value=>{settled=true;return value;});await tick();
  assert.equal(settled,false);assert.equal(f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').length,0);
  decode.onload();await tick();const turn=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').at(-1).data;
  assert.equal(turn.text,'What fits this room?');assert.equal(turn.photo.dataUrl,'data:image/jpeg;base64,AQID');assert.equal(settled,false);
  parentResult(f,turn.id,checkedResult());assert.equal((await answer).status,'ok');
});


function checkedCatalogResult(product){return {...checkedResult(),verdict:{...checkedResult().verdict,pickSkuId:String(product.id),reason:'A sourced option for your request.',dissent:'Check the exact shade and current price.',citations:[]},proposedSkuIds:[String(product.id)],products:[{id:String(product.id),name:'Server result name',price:product.price}]};}

test('checked approved products open the fixed six-to-ten collection with real images, details, try-on and bag',async t=>{
  const f=fixture(t,{search:'?checked=1'});await f.nodes.get('answer-call').onclick();const pick=catalog.find(p=>p.productType==='lipstick'),call=f.voice.call;
  f.voice.opts.onTranscript({role:'user',key:'local-checked',text:'Find me lipstick',final:true});const id=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').at(-1).data.id;
  parentResult(f,id,checkedCatalogResult(pick));assert.equal(f.nodes.get('bridge-panel').hidden,true);assert.equal(f.nodes.get('product-zone').hidden,false);
  assert.equal(f.store.current.id,pick.id);assert.equal(f.nodes.get('product-image').src,pick.image);assert.equal(f.nodes.get('product-title').textContent,pick.name);assert.equal(inlineRows(f).length,6);
  assert.equal(f.nodes.get('catalog-dialog').open,false);assert.equal(f.nodes.get('call-screen').scrollTop,0);assert.match(f.nodes.get('product-selected-note').textContent,/Recommended/);
  f.nodes.get('inline-more').onclick();assert.equal(inlineRows(f).length,10);
  const selected=inlineRows(f).find(row=>row.dataset.id===String(pick.id));inlineAction(selected,'Details').onclick();assert.equal(f.nodes.get('details-dialog').open,true);
  assert.match(f.nodes.get('detail-body').textContent,/A sourced option for your request/);assert.match(f.nodes.get('detail-body').textContent,/Check the exact shade/);
  assert.equal(f.voice.call,call);f.nodes.get('close-details').onclick();await inlineAction(selected,'Try on').onclick();assert.equal(f.camera.product.id,pick.id);
  inlineAction(selected,'Add to bag').onclick();assert(f.store.cart.has(String(pick.id)));assert.equal(f.voice.call,call);assert(!f.messages.some(row=>row.data.type==='coupi-live-call-product'));
});

test('checked local alternatives retain the spoken budget and exclusions and never absorb injected live listings',async t=>{
  const f=fixture(t,{search:'?checked=1'});await f.nodes.get('answer-call').onclick();const pick=catalog.find(p=>p.productType==='lipstick'&&p.price<10000&&!p.tags.includes('red'));
  const rogue={...pick,id:'dynamic-rogue',name:'Injected lipstick',source:'coupang_web'};f.store.catalog.set(rogue.id,rogue);f.discovery.catalog.set(rogue.id,rogue);
  f.voice.opts.onTranscript({role:'user',key:'bounded',text:'Find lipstick under 10000, not red',final:true});const id=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').at(-1).data.id;
  parentResult(f,id,checkedCatalogResult(pick));assert(f.discovery.products.length>1);
  for(const product of f.discovery.products){assert(product.price<=10000);assert(!product.tags.includes('red'));assert.notEqual(product.id,rogue.id);}
  assert.equal(f.store.current.id,pick.id);assert.equal(f.nodes.get('bridge-panel').hidden,true);
});

test('a checked selection with an unparsed request stays exact, and blocked recommendations never unlock local cards',async t=>{
  const f=fixture(t,{search:'?checked=1'});await f.nodes.get('answer-call').onclick();const pick=catalog.find(p=>p.productType==='glasses');
  f.voice.opts.onTranscript({role:'user',key:'exact',text:'A mysterious style that works for me',final:true});let id=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').at(-1).data.id;
  parentResult(f,id,checkedCatalogResult(pick));assert.deepEqual(Array.from(f.discovery.products,p=>p.id),[pick.id]);
  f.voice.opts.onTranscript({role:'user',key:'blocked',text:'Another choice',final:true});id=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').at(-1).data.id;
  parentResult(f,id,{...checkedCatalogResult(pick),status:'blocked'});assert.equal(f.nodes.get('bridge-panel').hidden,true);assert.equal(f.store.current.id,pick.id);assert.equal(f.nodes.get('call-notice').hidden,false);
});


test('identical transcript keys and words deduplicate within a call but receive fresh receipt IDs in later calls and reloads',async t=>{
  const entry={role:'user',key:'user-1',text:'Find me pink lipstick under 15000 won',final:true};
  const f=fixture(t,{search:'?checked=1'});await f.nodes.get('entry-chat').onclick();f.voice.opts.onTranscript(entry);f.voice.opts.onTranscript(entry);
  const first=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript');assert.equal(first.length,1);assert.match(first[0].data.id,/^[A-Za-z0-9:_-]{1,90}$/);
  await f.nodes.get('toggle-camera').onclick();f.voice.opts.onTranscript(entry);assert.equal(f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').length,1);
  f.nodes.get('end-call').onclick();await f.nodes.get('entry-chat').onclick();f.voice.opts.onTranscript(entry);
  const repeated=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript');assert.equal(repeated.length,2);assert.notEqual(repeated[0].data.id,repeated[1].data.id);
  const reloaded=fixture(t,{search:'?checked=1'});await reloaded.nodes.get('entry-chat').onclick();reloaded.voice.opts.onTranscript(entry);
  const fresh=reloaded.messages.find(row=>row.data.type==='coupi-live-call-transcript');assert.notEqual(fresh.data.id,repeated[0].data.id);assert.notEqual(fresh.data.id,repeated[1].data.id);
});


test('pending and clarification replies keep the visible product window and never show a duplicate validation panel',async t=>{
  const f=fixture(t,{search:'?checked=1'});await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='lipstick'));
  const selected=f.store.current,image=f.nodes.get('product-image').src,rows=inlineRows(f).map(row=>row.dataset.id),scroller=f.nodes.get('product-panel-scroll');scroller.scrollTop=120;
  f.voice.opts.onTranscript({role:'user',key:'question-only',text:'Which color would you recommend?',final:true});const id=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').at(-1).data.id;
  assert.equal(f.nodes.get('bridge-panel').hidden,true);assert.equal(f.nodes.get('product-zone').hidden,false);assert.equal(f.nodes.get('call-status').textContent,'Thinking…');assert.equal(f.nodes.get('product-image').src,image);assert.equal(scroller.scrollTop,120);
  parentResult(f,id,{...checkedResult(),verdict:undefined,proposedSkuIds:[],products:[],message:'Do you prefer pink or red?',question:'Do you prefer pink or red?'});
  assert.equal(f.nodes.get('bridge-panel').hidden,true);assert.equal(f.nodes.get('validated-call-content').children.length,0);assert.equal(f.store.current,selected);assert.deepEqual(inlineRows(f).map(row=>row.dataset.id),rows);
  f.voice.opts.onTranscript({role:'assistant',key:'short-reply',text:'Do you prefer pink or red?',final:true});assert.equal(f.store.messages.filter(message=>message.text==='Do you prefer pink or red?').length,1);
  assert.doesNotMatch(source,/CHECKED FOR YOU|CHECKING YOUR WORDS|Coupi’s checked pick/);
});

test('local try-on transcript stays in chat without becoming a new parent shopping request',async t=>{
  const f=fixture(t,{search:'?checked=1'});await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(product=>product.productType==='lipstick'));
  const before=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').length,selected=f.store.current;
  f.voice.opts.onUserTurnStart();f.voice.opts.onTranscript({role:'user',key:'local-preview',text:'Try the first one',final:false});
  f.voice.opts.onTranscript({role:'user',key:'local-preview',text:'Try the first one',final:true,localAction:true});
  f.voice.opts.onTranscript({role:'user',key:'local-preview',text:'Try the first one',final:true,localAction:true});
  assert.equal(f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').length,before);
  assert.equal(f.store.messages.filter(message=>message.key==='local-preview').length,1);assert.equal(f.store.messages.find(message=>message.key==='local-preview').text,'Try the first one');
  assert.equal(f.store.current,selected);assert.equal(f.nodes.get('bridge-panel').hidden,true);
  const result=await f.voice.opts.onProductAction('try_on',String(selected.id));assert.equal(result.ok,true);assert.equal(f.camera.product.id,selected.id);
  f.voice.opts.onUserTurnStart();f.voice.opts.onTranscript({role:'user',key:'new-search',text:'Find a desk lamp',final:true});
  const forwarded=f.messages.filter(row=>row.data.type==='coupi-live-call-transcript');assert.equal(forwarded.length,before+1);assert.equal(forwarded.at(-1).data.text,'Find a desk lamp');
});

test('ordinal product context follows the displayed collection order after selecting and trying another card',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(product=>product.productType==='lipstick'));
  const order=inlineRows(f).map(row=>row.dataset.id);assert.equal(order.length,6);assert.deepEqual(Array.from(f.voice.opts.getContext().visible_product_ids),order);
  inlineRows(f)[1].children[0].onclick();assert.equal(String(f.store.current.id),order[1]);assert.equal(String(f.store.queue[0].id),order[1]);
  assert.deepEqual(Array.from(f.voice.opts.getContext().visible_product_ids),order);assert.equal(String(f.voice.opts.getContext().visible_product.id),order[1]);
  const result=await f.voice.opts.onProductAction('try_on',f.voice.opts.getContext().visible_product_ids[0]);assert.equal(result.ok,true);assert.equal(String(f.camera.product.id),order[0]);
  assert.deepEqual(Array.from(f.voice.opts.getContext().visible_product_ids),order);
  f.nodes.get('group-open').onclick();f.nodes.get('inline-more').onclick();const expanded=inlineRows(f).map(row=>row.dataset.id);assert.equal(expanded.length,10);
  inlineRows(f)[1].children[0].onclick();assert.deepEqual(Array.from(f.voice.opts.getContext().visible_product_ids),expanded);assert.equal(String(f.voice.opts.getContext().visible_product.id),expanded[1]);
});

test('search-modal ordinal context and try-on follow its displayed mixed-category cards instead of the previous collection',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(product=>product.productType==='lipstick'));
  const previous=f.discovery.productType;f.nodes.get('catalog-search-open').onclick();assert.equal(f.nodes.get('catalog-dialog').dataset.view,'search');
  const rows=f.nodes.get('catalog-items').children,shown=rows.map(row=>[...f.store.catalog.values()].find(product=>product.name===row.children[1].children[1].textContent));
  assert.equal(shown.length,10);assert.notEqual(shown[1].productType,previous);assert(!f.discovery.products.some(product=>String(product.id)===String(shown[1].id)));
  const order=shown.map(product=>String(product.id));assert.deepEqual(Array.from(f.voice.opts.getContext().visible_product_ids),order);assert.deepEqual(Array.from(f.voice.contexts.at(-1).visible_product_ids),order);
  const result=await f.voice.opts.onProductAction('try_on',f.voice.opts.getContext().visible_product_ids[1]);
  assert.equal(result.ok,true);assert.equal(String(result.product.id),order[1]);assert.equal(String(f.camera.product.id),order[1]);assert.equal(f.nodes.get('catalog-dialog').open,false);
  assert.equal(f.discovery.productType,shown[1].productType);assert.equal(f.voiceStarts,1);assert.equal(f.cameraStarts,1);
  assert.deepEqual(Array.from(f.voice.opts.getContext().visible_product_ids),Array.from(f.discovery.visible,product=>String(product.id)));
});


test('ordinary embedded calls use direct shopping with friendly greeting, local product actions and no checked parent requests',async t=>{
  const f=fixture(t,{search:'?embedded=1'});personalizationContext(f,{active:false});await f.nodes.get('answer-call').onclick();
  assert.equal(f.voice.opts.directShopping,true);assert.equal(f.voice.opts.onResolveCall,undefined);assert.equal(f.voice.opts.onUserTurnStart,undefined);
  assert.equal(f.voice.opts.greeting,'Hi Kayleen! What can I help you find today?');
  f.voice.opts.onTranscript({role:'user',key:'direct-search',text:'Find pink lipstick',final:true});
  f.voice.opts.onTranscript({role:'user',key:'direct-upload',text:'Match my outfit',image:{dataUrl:'data:image/jpeg;base64,AQID',name:'outfit.jpg'},final:true,delivery:'sent'});
  f.voice.opts.onRecommendations(catalog.filter(product=>product.productType==='lipstick'));
  const selected=f.discovery.visible[1];assert(selected);const action=await f.voice.opts.onProductAction('try_on',String(selected.id));assert.equal(action.ok,true);assert.equal(f.camera.product.id,selected.id);
  f.voice.opts.onTranscript({role:'user',key:'direct-preview',text:'Try the second one',final:true,localAction:true});await f.voice.opts.onProductAction('save',String(selected.id));assert(f.store.cart.has(String(selected.id)));
  assert.equal(f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').length,0);assert.equal(f.nodes.get('bridge-panel').hidden,true);
  assert(f.store.messages.some(message=>message.text==='Find pink lipstick'));assert(f.store.messages.some(message=>message.text==='Match my outfit'));assert(f.store.messages.some(message=>message.text==='Try the second one'));
});

test('glasses demo keeps first/third ordinals through try-on, details, comparison, bag and image chat',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();const call=f.voice.call;
  f.voice.opts.onRecommendations(catalog.filter(product=>product.productType==='glasses'),'',{query:'glasses',category:'all',sourceOnly:true});
  const ids=Array.from(f.voice.opts.getContext().visible_product_ids);assert(ids.length>=3);const first=ids[0],third=ids[2];
  const run=async words=>{const command=f.context.window.CoupiCallActions.resolve(words,f.voice.opts.getContext());assert(command,words);if(command.kind==='comparison')return f.voice.opts.onCompareProducts(command.productIds);assert.equal(command.kind,'product');return f.voice.opts.onProductAction(command.action,command.productId);};
  assert.equal((await run('Try the third product')).ok,true);assert.equal(String(f.camera.product.id),third);
  assert.equal((await run('Try the first product')).ok,true);assert.equal(String(f.camera.product.id),first);assert.deepEqual(Array.from(f.voice.opts.getContext().visible_product_ids),ids);
  const details=await run('Show details for the third product');assert.equal(String(details.product.id),third);assert.equal(f.nodes.get('details-dialog').open,true);
  const compared=await run('Compare the first and third products');assert.equal(compared.ok,true);assert.equal(compared.comparison_opened,true);
  assert.deepEqual(Array.from(compared.product_ids),[first,third]);assert.deepEqual(Array.from(compared.products,p=>String(p.id)),[first,third]);
  for(const product of compared.products)assert.equal(product.price,f.store.catalog.get(String(product.id)).price);
  assert.equal(f.nodes.get('details-dialog').open,false);assert.equal(f.nodes.get('compare-dialog').open,true);assert.deepEqual(Array.from(f.voice.opts.getContext().visible_product_ids),ids);
  assert.equal((await run('Add the third product to my cart')).ok,true);assert.deepEqual(Array.from(f.store.cart.keys()),[third]);
  f.nodes.get('compare-dialog').close();await f.nodes.get('text-toggle').onclick();
  f.nodes.get('chat-image-file').files=[{name:'outfit.jpg'}];await f.nodes.get('chat-image-file').onchange();f.nodes.get('text-input').value='Would these glasses suit this outfit?';await f.nodes.get('text-form').onsubmit({preventDefault(){}});
  assert.equal(f.voice.uploads.length,1);assert.equal(f.voice.uploads[0].name,'outfit.jpg');assert.equal(f.voice.uploads[0].text,'Would these glasses suit this outfit?');
  assert.equal(f.voice.call,call);assert.equal(f.camera.running,true);assert.equal(f.voiceStarts,1);assert.equal(f.cameraStarts,1);assert.deepEqual(Array.from(f.voice.opts.getContext().visible_product_ids),ids);
});

test('comparison validates all exact IDs atomically and reuses an already open comparison',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();recommendType(f,'glasses');const ids=f.discovery.visible.slice(0,3).map(product=>String(product.id));
  let opened=0;const dialog=f.nodes.get('compare-dialog'),show=dialog.showModal.bind(dialog);dialog.showModal=()=>{opened++;show();};
  assert.equal(f.voice.opts.onCompareProducts([ids[0],ids[2]]).ok,true);assert.equal(f.voice.opts.onCompareProducts([ids[0],ids[2]]).ok,true);assert.equal(opened,1);
  const before=Array.from(f.discovery.compareIds);
  for(const request of [[ids[0],ids[0]],[ids[0],'unknown-product'],[ids[0]],ids.concat('extra'),null])assert.equal(f.voice.opts.onCompareProducts(request).ok,false);
  assert.deepEqual(Array.from(f.discovery.compareIds),before);assert.equal(dialog.open,true);assert.equal(f.store.cart.size,0);
});

test('a replacement photo cannot send the previous image or text while it is preparing',async t=>{
  const wait=deferred();const f=fixture(t,{imagePrepare:async file=>file.name==='new.jpg'?wait.promise:{dataUrl:'data:image/jpeg;base64,AQID',name:file.name}});await f.nodes.get('entry-chat').onclick();
  f.nodes.get('chat-image-file').files=[{name:'old.jpg'}];await f.nodes.get('chat-image-file').onchange();
  f.nodes.get('chat-image-file').files=[{name:'new.jpg'}];const preparing=f.nodes.get('chat-image-file').onchange();f.nodes.get('text-input').value='Use the new photo';
  assert.equal(f.nodes.get('chat-send').disabled,true);assert.equal(f.nodes.get('attachment-preview').hidden,true);f.voice.opts.onState({state:'thinking'});assert.equal(f.nodes.get('chat-send').disabled,true);
  await f.nodes.get('text-form').onsubmit({preventDefault(){}});assert.equal(f.voice.uploads.length,0);assert.equal(f.voice.sentTexts.length,0);assert.equal(f.nodes.get('text-input').value,'Use the new photo');
  wait.resolve({dataUrl:'data:image/jpeg;base64,BAUG',name:'new.jpg'});await preparing;assert.equal(f.nodes.get('chat-send').disabled,false);
  await f.nodes.get('text-form').onsubmit({preventDefault(){}});assert.equal(f.voice.uploads.length,1);assert.equal(f.voice.uploads[0].name,'new.jpg');assert.equal(f.voice.uploads[0].dataUrl,'data:image/jpeg;base64,BAUG');
});
