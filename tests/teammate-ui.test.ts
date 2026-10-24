// @ts-nocheck — VM browser fixtures exercise the imported plain-JavaScript call runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import catalog from '../data/teammate-catalog.json';
const html=readFileSync(new URL('../public/live-call/index.html',import.meta.url),'utf8');
const stateSource=readFileSync(new URL('../public/live-call/mobile-call-state.js',import.meta.url),'utf8');
const source=readFileSync(new URL('../public/live-call/mobile-call.js',import.meta.url),'utf8');
const bridgeSource=readFileSync(new URL('../public/live-call/call-bridge.js',import.meta.url),'utf8');
const comparisonSource=readFileSync(new URL('../public/live-call/reference-comparison.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
class Element {
  constructor(){this.hidden=false;this.disabled=false;this.open=false;this.dataset={};this.style={};this.children=[];this.attributes={};this.listeners=new Map();const classes=new Set();this.classList={add:(...c)=>c.forEach(x=>classes.add(x)),remove:(...c)=>c.forEach(x=>classes.delete(x)),toggle:(c,on)=>on?classes.add(c):classes.delete(c)};}
  setAttribute(k,v){this.attributes[k]=v;} removeAttribute(k){delete this.attributes[k];if(k==='src')delete this.src;}
  append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;}
  addEventListener(k,fn){if(!this.listeners.has(k))this.listeners.set(k,[]);this.listeners.get(k).push(fn);}
  emit(k,event={}){for(const fn of this.listeners.get(k)||[])fn(event);}
  showModal(){this.open=true;} close(){this.open=false;this.emit('close');}
  focus(){} scrollIntoView(){} setPointerCapture(){} closest(){return null;}
}
function fixture(t,options={}){
  const nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  const events=new Element(),docEvents=new Element(),sequence=[],intervals=[],messages=[];
  nodes.get('vision-consent').checked=true;
  let cameraStarts=0,voiceStarts=0;
  class Camera {
    constructor(opts){this.opts=opts;this.running=false;this.options={};this.errors={};this.canvas={width:720,height:1280};this.gen=0;this.productGen=0;this.stops=0;this.starts=[];}
    setOptions(opts){Object.assign(this.options,opts);}
    async start(settings={}){sequence.push('camera');cameraStarts++;this.starts.push({...settings});const token=++this.gen;this.running=false;this.opts.onStatus('Opening camera','loading');if(options.cameraPermission)await options.cameraPermission(cameraStarts);const allowed=options.cameraStart?await options.cameraStart(settings,cameraStarts):true;if(token!==this.gen)return false;if(allowed===false){this.lastCameraError={message:'Requested camera is unavailable.'};return false;}this.actualFacingMode=options.actualFacingMode||settings.facingMode||'user';this.running=true;this.opts.onStatus('Live','success');return true;}
    stop(){this.gen++;this.productGen++;this.running=false;this.stops++;}
    async setMode(mode){this.mode=mode;if(options.modelLoad)await options.modelLoad();}
    async setProduct(product){const token=++this.productGen;if(product&&options.productLoad)await options.productLoad(product);if(token!==this.productGen)return {ok:false,stale:true};this.product=product;return product?{ok:true,productId:product.id,kind:product.category==='makeup'?'lip':product.category==='clothes'?'garment':product.category==='glasses'?'glasses':'object',shadeColor:product.category==='makeup'?'#bc3c57':undefined,shadeEstimated:product.category==='makeup'}:{ok:true};}
  }
  class Voice {
    constructor(opts){this.opts=opts;this.call=null;this.ends=0;this.contexts=[];this.images=[];this.imageClears=0;}
    async start(){sequence.push('voice');voiceStarts++;this.call={ready:true};this.opts.onState({state:'connected',muted:false,connectedAt:Date.now()});return true;}
    end(){this.ends++;this.call=null;this.opts.onState({state:'idle',muted:false,connectedAt:null});}
    updateContext(value){this.contexts.push(value);} mute(){} sendText(text){if(!this.call)return false;this.opts.onTranscript({role:'user',key:'typed-'+Date.now(),text,final:true});return true;} async resumeAudio(){}
    sendCameraSnapshot(frame){if(!this.opts.getVisionEnabled())return false;this.images.push(frame);this.opts.onVisionState({state:'received',capturedAt:frame.metadata.capturedAt});return true;}
    clearCameraSnapshots(){this.imageClears++;this.opts.onVisionState({state:'paused'});return true;}
  }
  class Snapshots {constructor(opts){this.opts=opts;}capture(reason){return this.opts.isEnabled()?{images:[{kind:'camera',dataUrl:'data:image/jpeg;base64,AQID'}],metadata:{reason,capturedAt:new Date().toISOString()}}:null;}clear(){}}
  class Hands {constructor(opts){this.opts=opts;this.running=false;}async start(){this.running=true;}stop(){this.running=false;}reset(){}}
  const context={window:{location:{origin:'https://coupi.test',assign(){}},parent:{postMessage:(data,target)=>messages.push({data,target})},matchMedia:()=>({matches:false}),COUPANG_PRODUCTS:catalog,NookCamera:Camera,NookVoiceSession:Voice,NookHandGestures:Hands,NookCameraSnapshots:Snapshots,addEventListener:(...a)=>events.addEventListener(...a)},document:{head:new Element(),querySelectorAll:()=>[],getElementById:id=>nodes.get(id)||null,createElement:()=>new Element(),addEventListener:(...a)=>docEvents.addEventListener(...a),hidden:false},setTimeout:(fn,ms)=>ms===220?setTimeout(fn,0):0,clearTimeout,setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},clearInterval,console,URL,URLSearchParams,fetch:async()=>({ok:true,json:async()=>options.status||{ready:true,offline:false}})};
  context.location=context.window.location;context.location.search='';
  vm.createContext(context);vm.runInContext(stateSource,context);vm.runInContext(bridgeSource,context);vm.runInContext(comparisonSource,context);vm.runInContext(source,context);
  const mobile=context.window.NookMobile;
  t.after(()=>nodes.get('end-call').onclick());
  return {...mobile,nodes,context,sequence,docEvents,events,messages,visionTick:()=>intervals.find(i=>i.ms===3000).fn(),get cameraStarts(){return cameraStarts;},get voiceStarts(){return voiceStarts;}};
}

test('camera sharing follows consent, pause/resume, camera-off and end while local try-on remains usable',async t=>{
  const f=fixture(t);f.visionTick();assert.equal(f.voice.images.length,0);
  await f.nodes.get('answer-call').onclick();f.visionTick();assert.equal(f.voice.images.length,1);
  assert.equal(f.nodes.get('vision-status').textContent,'Coopy sees snapshots');
  f.nodes.get('vision-toggle').onclick();f.visionTick();assert.equal(f.voice.images.length,1);assert(f.voice.imageClears>0);assert.equal(f.camera.running,true);
  f.voice.opts.onRecommendations(catalog.filter(p=>p.category==='desk'));await f.voice.opts.onTryon('desk',{x:.25});assert.equal(f.camera.options.x,.25);assert.equal(f.voice.opts.getCameraSnapshot('tool'),null);
  f.nodes.get('vision-toggle').onclick();assert.equal(f.voice.images.length,2);assert.equal(f.voice.images[1].metadata.reason,'resume');
  await f.nodes.get('toggle-camera').onclick();f.visionTick();assert.equal(f.voice.images.length,2);
  f.nodes.get('end-call').onclick();f.visionTick();assert.equal(f.voice.images.length,2);
});

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

test('excluded world products do not navigate or stop the active call, and numeric source IDs never bridge',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();let requests=0;
  f.context.fetch=async()=>{requests++;return{ok:true,json:async()=>({ok:false,error:'Already owned or excluded.'})};};
  assert.equal((await f.voice.opts.onWorldProduct('detergent')).ok,false);assert.equal(f.camera.running,true);assert(f.voice.call);
  assert.equal((await f.voice.opts.onWorldProduct('1814412512')).ok,false);assert.equal(requests,1);
  assert(!f.messages.some(message=>message.data.type==='coupi-live-call-product'));
});

test('world result rows retain their simulation namespace and Details opens the shared evidence flow',async t=>{
  const f=fixture(t);f.nodes.get('decline-call').onclick();
  f.voice.opts.onWorldRecommendations([{skuId:'socks',name:'Red socks',price:6900,catalog_namespace:'world-simulation'},{id:catalog[0].id,name:'Source listing',catalog_namespace:'sourced-listings'}]);
  assert.equal(f.nodes.get('world-picks').hidden,false);assert.equal(f.nodes.get('product-zone').hidden,true);assert.equal(f.nodes.get('world-picks-list').children.length,1);
  const row=f.nodes.get('world-picks-list').children[0];assert.equal(row.children[0].children[0].textContent,'Red socks');assert.equal(row.children[1].textContent,'Details ↗');
  f.context.fetch=async()=>({ok:true,json:async()=>({ok:true,catalog_namespace:'world-simulation',skuId:'socks'})});await row.children[1].onclick();
  assert(f.messages.some(message=>message.data.type==='coupi-live-call-product'&&message.data.skuId==='socks'));assert.equal(f.voiceStarts,0);assert.equal(f.cameraStarts,0);
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
  assert.equal(f.store.queue.length,new Set(catalog.map(p=>p.category)).size);assert.equal(f.nodes.get('product-zone').hidden,false);
});

test('Answer starts camera then real-call adapter; End closes both and shows ended screen',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  assert.deepEqual(f.sequence,['camera','voice']);assert.equal(f.nodes.get('phone-app').dataset.phase,'active');
  f.nodes.get('end-call').onclick();assert.equal(f.camera.running,false);assert.equal(f.voice.call,null);assert.equal(f.nodes.get('phone-app').dataset.phase,'ended');
});

test('two bubble limit preserves a user who speaks before the first assistant transcript',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
  const emit=e=>f.voice.opts.onTranscript(e);
  emit({role:'user',key:'early-user',text:'I want a shirt'});emit({role:'assistant',key:'reply',delta:'What colour?'});
  assert.equal(f.store.messages.length,2);assert.equal(f.store.messages[0].key,'early-user');
  emit({role:'user',key:'next-user',text:'Blue'});emit({role:'assistant',key:'next-reply',text:'Here are your picks'});
  assert.equal(f.nodes.get('transcript').children.length,2);assert.deepEqual(Array.from(f.store.messages,m=>m.key),['next-user','next-reply']);
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
  for(const type of ['lipstick','chair','lamp','tshirt','hoodie','glasses']){f.nodes.get('type-'+type).onclick();assert.equal(f.nodes.get('catalog-items').children.length,3);}
  const row=f.nodes.get('catalog-items').children[0];await row.children[2].children[0].onclick();
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
  const glasses=catalog.filter(p=>p.productType==='glasses');assert.equal(glasses.length,3);
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


test('embedded camera is opt-in, namespaced, and has no conflicting old page navigation',()=>{
  assert(!/id="vision-consent"[^>]*\bchecked\b/.test(html));
  assert(!html.includes('class="app-nav"'));assert(!html.includes('href="/fonts/fonts.css"'));
  assert(html.includes('call-side-panel'));
  for(const product of catalog){assert.match(product.image,/^\/live-call\/products\//);assert.equal(product.image,product.preview.image);}
});

test('direct offline entry never starts camera, microphone, or tracking even if handlers are invoked',async t=>{
  const f=fixture(t,{status:{ready:false,offline:true,reason:'Offline rehearsal'}});await tick();
  for(const id of ['answer-call','product-try','toggle-camera','gesture-toggle'])assert.equal(f.nodes.get(id).disabled,true,id);
  await f.nodes.get('answer-call').onclick();assert.equal(f.cameraStarts,0);assert.equal(f.voiceStarts,0);
  f.nodes.get('decline-call').onclick();await f.nodes.get('product-try').onclick();await f.nodes.get('toggle-camera').onclick();
  assert.equal(f.cameraStarts,0);assert.equal(f.voiceStarts,0);assert.equal(f.store.cart.size,0);assert.equal(f.context.document.head.children.length,0);
});

test('memory bridge sends final user words only, deduplicates, and rejects foreign stop messages',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();
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

test('generated product-explanation prompt never becomes a user memory; reference alternatives stay factual',async t=>{
  const f=fixture(t);await f.nodes.get('answer-call').onclick();f.voice.opts.onRecommendations(catalog.filter(p=>p.productType==='lamp'));
  f.nodes.get('product-details').onclick();f.nodes.get('detail-ask').onclick();
  assert.equal(f.messages.filter(row=>row.data.type==='coupi-live-call-transcript').length,0);
  f.nodes.get('product-details').onclick();
  const root=f.nodes.get('reference-contenders'),cards=root.children.find(node=>node.className==='reference-cards');assert.equal(cards.children.length,2);const unknown=cards.children.find(node=>node.children.some(child=>child.className==='reference-price'&&child.textContent==='No reference price'));assert(unknown);assert(!unknown.children.some(child=>child.className==='reference-badge'));
  cards.children[0].children.find(node=>node.className==='reference-compare').onclick();
  const head=root.children.find(node=>node.className==='reference-head');
  const allText=node=>[node.textContent||'',...(node.children||[]).map(allText)].join(' ');
  assert.match(allText(head),/Not supplied for this listing/);assert.match(allText(head),/Current delivery window unknown/);assert.match(allText(head),/No tested-use evidence/);
  assert(!/most loved|best for you|fastest/.test(allText(root)));
  const previous=f.store.current.id;head.children.find(node=>node.className==='reference-choose').onclick();assert.notEqual(f.store.current.id,previous);assert.equal(f.store.current.productType,'lamp');assert.equal(f.store.cart.size,0);
});


test('media toggles begin off, and fonts load only after an online status check',async t=>{const f=fixture(t);assert.equal(f.nodes.get('toggle-camera').attributes['aria-pressed'],'false');assert.equal(f.nodes.get('gesture-toggle').attributes['aria-pressed'],'false');assert.equal(f.context.document.head.children.length,0);await tick();assert.equal(f.context.document.head.children[0].href,'/fonts/fonts.css');});
