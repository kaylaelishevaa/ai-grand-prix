import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import catalog from '../data/catalog.json' with {type:'json'};
const html=readFileSync(new URL('../site-pages/camera.html',import.meta.url),'utf8');
const stateSource=readFileSync(new URL('../public/mobile-call-state.js',import.meta.url),'utf8');
const moduleSources=['product-discovery.js','call-conversation.js','product-evidence.js'].map(name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8'));
const source=readFileSync(new URL('../public/mobile-call.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.nodeType=1;this.hidden=false;this.disabled=false;this.open=false;this.dataset={};this.style={};this.children=[];this.attributes={};this.listeners=new Map();this.value='';this.files=[];this.scrollTop=0;this.clientHeight=100;this._text='';const classes=new Set();this.classList={add:(...c)=>c.forEach(x=>classes.add(x)),remove:(...c)=>c.forEach(x=>classes.delete(x)),contains:c=>classes.has(c),toggle:(c,on)=>{const active=on===undefined?!classes.has(c):on;active?classes.add(c):classes.delete(c);return active;}};}
  set textContent(value){this._text=String(value??'');this.children=[];} get textContent(){return this._text+this.children.map(child=>child.textContent).join(' ');}
  get scrollHeight(){return this.children.length*40;}
  setAttribute(k,v){this.attributes[k]=String(v);} getAttribute(k){return this.attributes[k]??null;} removeAttribute(k){delete this.attributes[k];if(k==='src')delete this.src;}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}} replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);}
  addEventListener(k,fn){if(!this.listeners.has(k))this.listeners.set(k,[]);this.listeners.get(k).push(fn);}
  emit(k,event={}){for(const fn of this.listeners.get(k)||[])fn(event);}
  showModal(){this.open=true;} close(){this.open=false;this.emit('close');}
  click(){return this.onclick?.({target:this,preventDefault(){}});} focus(){} setPointerCapture(){}
  closest(selector){let current=this;while(current){if(selector.split(',').some(s=>s.trim().toUpperCase()===current.tagName))return current;current=current.parentElement;}return null;}
}

function fixture(t,options={}){
  const nodes=new Map([...html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*?\bid="([^"]+)"[^>]*>/gi)].map(m=>[m[2],new Element(m[1])]));
  for(const match of html.matchAll(/<dialog\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/dialog>/g))for(const child of match[2].matchAll(/\bid="([^"]+)"/g)){if(nodes.has(child[1]))nodes.get(child[1]).parentElement=nodes.get(match[1]);}
  const events=new Element(),docEvents=new Element(),sequence=[],intervals=[];
  nodes.get('vision-consent').checked=true;
  let cameraStarts=0,voiceStarts=0,gestureInstance;
  class Camera {
    constructor(opts){this.opts=opts;this.running=false;this.options={};this.errors={};this.canvas={width:720,height:1280};this.gen=0;this.productGen=0;this.stops=0;this.starts=[];}
    setOptions(opts){Object.assign(this.options,opts);}
    async start(settings={}){sequence.push('camera');cameraStarts++;this.starts.push({...settings});const token=++this.gen;this.running=false;this.opts.onStatus('Opening camera','loading');if(options.cameraPermission)await options.cameraPermission(cameraStarts);const allowed=options.cameraStart?await options.cameraStart(settings,cameraStarts):true;if(token!==this.gen)return false;if(allowed===false){this.lastCameraError={message:'Requested camera is unavailable.'};return false;}this.actualFacingMode=options.actualFacingMode||settings.facingMode||'user';this.running=true;this.opts.onStatus('Live','success');return true;}
    stop(){this.gen++;this.productGen++;this.running=false;this.stops++;}
    async setMode(mode){this.mode=mode;if(options.modelLoad)await options.modelLoad();}
    async setProduct(product){const token=++this.productGen;if(product&&options.productLoad)await options.productLoad(product);if(token!==this.productGen)return {ok:false,stale:true};this.product=product;return product?{ok:true,productId:product.id,kind:product.category==='makeup'?'lip':product.category==='clothes'?'garment':product.category==='glasses'?'glasses':'object',shadeColor:product.category==='makeup'?'#bc3c57':undefined,shadeEstimated:product.category==='makeup'}:{ok:true};}
  }
  class Voice {
    constructor(opts){this.opts=opts;this.call=null;this.ends=0;this.contexts=[];this.images=[];this.imageClears=0;this.uploads=[];this.sentTexts=[];}
    async start(){sequence.push('voice');voiceStarts++;this.call={ready:true};this.opts.onState({state:'connected',muted:false,connectedAt:Date.now()});return true;}
    end(){this.ends++;this.call=null;this.opts.onState({state:'idle',muted:false,connectedAt:null});}
    updateContext(value){this.contexts.push(value);} mute(){} sendText(value){this.sentTexts.push(value);return options.textSend?options.textSend(value):!!this.call;} async sendImage(value){this.uploads.push(value);return options.imageSend?await options.imageSend(value):!!this.call;} async resumeAudio(){}
    sendCameraSnapshot(frame){if(!this.opts.getVisionEnabled())return false;this.images.push(frame);this.opts.onVisionState({state:'received',capturedAt:frame.metadata.capturedAt});return true;}
    clearCameraSnapshots(){this.imageClears++;this.opts.onVisionState({state:'paused'});return true;}
  }
  class Snapshots {constructor(opts){this.opts=opts;}capture(reason){return this.opts.isEnabled()?{images:[{kind:'camera',dataUrl:'data:image/jpeg;base64,AQID'}],metadata:{reason,capturedAt:new Date().toISOString()}}:null;}clear(){}}
  class Hands {constructor(opts){gestureInstance=this;this.opts=opts;this.running=false;}async start(){this.running=true;}stop(){this.running=false;}reset(){}}
  const context={window:{COUPANG_PRODUCTS:catalog,localStorage:options.storage||{getItem(){return null;},setItem(){}},requestAnimationFrame:fn=>{fn();return 1;},CoupiChatImages:{prepare:async file=>options.imagePrepare?await options.imagePrepare(file):{dataUrl:'data:image/jpeg;base64,AQID',name:file.name,width:100,height:100}},NookCamera:Camera,NookVoiceSession:Voice,NookHandGestures:Hands,NookCameraSnapshots:Snapshots,addEventListener:(...a)=>events.addEventListener(...a)},document:{getElementById:id=>nodes.get(id)||null,createElement:tag=>new Element(tag),querySelector:selector=>selector==='dialog[open]'?[...nodes.values()].find(n=>n.tagName==='DIALOG'&&n.open)||null:null,addEventListener:(...a)=>docEvents.addEventListener(...a),hidden:false},setTimeout:(fn,ms)=>ms===220?setTimeout(fn,0):0,clearTimeout,setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},clearInterval,console,URL,requestAnimationFrame:fn=>{fn();return 1;}};
  vm.createContext(context);vm.runInContext(stateSource,context);for(const moduleSource of moduleSources)vm.runInContext(moduleSource,context);vm.runInContext(source,context);
  const mobile=context.window.NookMobile;
  t.after(()=>nodes.get('end-call').onclick());
  return {...mobile,nodes,context,sequence,docEvents,hands:gestureInstance,visionTick:()=>intervals.find(i=>i.ms===3000).fn(),get cameraStarts(){return cameraStarts;},get voiceStarts(){return voiceStarts;}};
}

test('camera sharing follows consent, pause/resume, camera-off and end while local try-on remains usable',async t=>{
  const f=fixture(t);f.visionTick();assert.equal(f.voice.images.length,0);
  await f.nodes.get('answer-call').onclick();f.visionTick();assert.equal(f.voice.images.length,1);
  assert.equal(f.nodes.get('vision-status').textContent,'Coupi sees snapshots');
  f.nodes.get('vision-toggle').onclick();f.visionTick();assert.equal(f.voice.images.length,1);assert(f.voice.imageClears>0);assert.equal(f.camera.running,true);
  f.voice.opts.onRecommendations(catalog.filter(p=>p.category==='desk'));await f.voice.opts.onTryon('desk',{x:.25});assert.equal(f.camera.options.x,.25);assert.equal(f.voice.opts.getCameraSnapshot('tool'),null);
  f.nodes.get('vision-toggle').onclick();assert.equal(f.voice.images.length,2);assert.equal(f.voice.images[1].metadata.reason,'resume');
  await f.nodes.get('toggle-camera').onclick();f.visionTick();assert.equal(f.voice.images.length,2);
  f.nodes.get('end-call').onclick();f.visionTick();assert.equal(f.voice.images.length,2);
});

test('camera opt-out and hidden page never share a frame',async t=>{
  const f=fixture(t);f.nodes.get('vision-consent').checked=false;await f.nodes.get('answer-call').onclick();
  f.visionTick();assert.equal(f.camera.running,true);assert.equal(f.voice.images.length,0);
  f.context.document.hidden=true;f.nodes.get('vision-toggle').onclick();f.visionTick();assert.equal(f.voice.images.length,0);
  f.docEvents.emit('visibilitychange');assert.equal(f.voice.call,null);assert.equal(f.camera.running,false);
});

test('mobile entry boots against real HTML IDs, and Browse requests no camera or voice',t=>{
  const f=fixture(t);assert(f.voice);assert.equal(f.cameraStarts,0);assert.equal(f.voiceStarts,0);
  f.nodes.get('decline-call').onclick();
  assert.equal(f.nodes.get('phone-app').dataset.phase,'browse');assert.equal(f.cameraStarts,0);assert.equal(f.voiceStarts,0);
  assert.equal(f.store.queue.length,Math.min(10,catalog.filter(p=>p.productType==='lipstick').length));assert(f.store.queue.every(p=>p.productType==='lipstick'));assert.equal(f.nodes.get('product-zone').hidden,false);
});

test('Answer starts camera then real-call adapter; End closes both and shows ended screen',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  assert.deepEqual(f.sequence,['camera','voice']);assert.equal(f.nodes.get('phone-app').dataset.phase,'active');
  f.nodes.get('end-call').onclick();assert.equal(f.camera.running,false);assert.equal(f.voice.call,null);assert.equal(f.nodes.get('phone-app').dataset.phase,'ended');
});

test('fixed transcript keeps earlier turns available in stable order',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  const emit=e=>f.voice.opts.onTranscript(e);
  emit({role:'user',key:'early-user',text:'I want a shirt'});emit({role:'assistant',key:'reply',delta:'What colour?'});
  assert.equal(f.store.messages.length,2);assert.equal(f.store.messages[0].key,'early-user');
  emit({role:'user',key:'next-user',text:'Blue'});emit({role:'assistant',key:'next-reply',text:'Here are your picks'});
  assert.equal(f.nodes.get('transcript').children.length,4);assert.deepEqual(Array.from(f.store.messages,m=>m.key),['early-user','reply','next-user','next-reply']);
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

test('catalog exposes all six groups and selecting a row tries its exact product',async t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();f.nodes.get('catalog-button').onclick();
  for(const type of ['lipstick','chair','lamp','tshirt','hoodie','glasses']){f.nodes.get('type-'+type).onclick();assert.equal(f.nodes.get('catalog-items').children.length,Math.min(6,catalog.filter(p=>p.productType===type).length));}
  const row=f.nodes.get('catalog-items').children[0];await row.children[1].children.find(button=>button.textContent==='Try it').onclick();
  assert.equal(f.nodes.get('catalog-dialog').open,false);assert.equal(f.camera.product.productType,'glasses');assert.equal(f.camera.product.id,f.store.current.id);assert.equal(f.voiceStarts,0);
});

test('ending while a product image loads cannot restore try-on UI',async t=>{
  const wait=deferred();const f=fixture(t,{productLoad:()=>wait.promise});await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.category==='desk'));
  const loading=f.nodes.get('product-try').onclick();await tick();f.nodes.get('end-call').onclick();wait.resolve();await loading;
  assert.equal(f.nodes.get('phone-app').dataset.phase,'ended');assert.equal(f.nodes.get('tryon-chip').hidden,true);assert.equal(f.voice.opts.getContext().tried_product,null);
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
  assert.equal(f.nodes.get('details-dialog').open,true);assert.equal(f.nodes.get('detail-link').href,p.url);assert.equal(f.store.queue.length,size);assert.equal(details.purchased,false);
  f.nodes.get('close-details').onclick();const result=await f.voice.opts.onProductAction('save',p.id);
  assert.equal(f.store.cart.size,1);assert.equal(result.purchased,false);assert.equal(f.voiceStarts,0);
});

test('ending during swipe animation prevents late bag mutation',async t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();const pending=f.nodes.get('product-save').onclick();f.nodes.get('end-call').onclick();await pending;
  assert.equal(f.store.cart.size,0);assert.equal(f.nodes.get('phone-app').dataset.phase,'ended');
});

test('old camera-permission completion cannot start voice inside a newer pending call',async t=>{
  const first=deferred(),second=deferred();const f=fixture(t,{cameraPermission:n=>n===1?first.promise:second.promise});
  const oldAnswer=f.nodes.get('answer-call').onclick();await tick();f.nodes.get('end-call').onclick();
  // The real Call again handler returns void; invoking Answer after its screen transition is equivalent.
  f.nodes.get('call-again').onclick();await tick();first.resolve();await oldAnswer;await tick();
  assert.equal(f.voiceStarts,0,'Old Answer must not start the new call before its own camera finishes');
  second.resolve();await tick();await tick();assert.equal(f.voiceStarts,1);
});

test('try-on minimizes product controls and More, Less, and product bubble restore them',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='hoodie'));
  assert.equal(f.nodes.get('phone-app').dataset.focused,'false');
  await f.nodes.get('product-try').onclick();
  assert.equal(f.nodes.get('phone-app').dataset.focused,'true');
  assert.equal(f.nodes.get('focus-product').hidden,false);
  assert.equal(f.nodes.get('focus-toggle-label').textContent,'More');
  f.nodes.get('focus-toggle').onclick();
  assert.equal(f.nodes.get('phone-app').dataset.focused,'false');
  assert.equal(f.nodes.get('focus-toggle-label').textContent,'Less');
  assert.equal(f.nodes.get('focus-toggle').attributes['aria-expanded'],'true');
  f.nodes.get('focus-toggle').onclick();
  assert.equal(f.nodes.get('phone-app').dataset.focused,'true');
  f.nodes.get('focus-product').onclick();
  assert.equal(f.nodes.get('phone-app').dataset.focused,'false');
  assert.equal(f.nodes.get('focus-toggle-label').textContent,'Less');
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
  assert.equal(f.nodes.get('phone-app').dataset.phase,'ended');assert.equal(f.nodes.get('phone-app').dataset.focused,'false');
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
  assert.equal(f.nodes.get('collections-dialog').open,false);assert.equal(f.nodes.get('catalog-dialog').open,true);
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
  const transcript=f.nodes.get('transcript');transcript.scrollTop=20;transcript.emit('scroll');
  f.voice.opts.onTranscript({key:'turn-8',role:'assistant',order:8,delta:'New message'});
  assert.equal(transcript.scrollTop,20);assert.equal(f.nodes.get('chat-latest').hidden,false);
  f.nodes.get('chat-latest').onclick();assert.equal(transcript.scrollTop,transcript.scrollHeight);assert.equal(f.nodes.get('chat-latest').hidden,true);
});
