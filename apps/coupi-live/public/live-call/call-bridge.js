/* Same-origin embed contract. Only final words spoken/typed by the shopper become memory. */
(() => {
  'use strict';
  const origin = window.location.origin;
  const seen = new Set();
  const turns = new Map(), listeners = new Set(), waiting = new Set();
  let latestId = '',lastPhase='incoming';
  const newCallNonce=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  let callNonce=newCallNonce();
  let personalization={profileId:null,active:false,question:'',count:0,draftPending:false,memories:[],received:false},preferenceSerial=0;
  const preferenceRequests=new Map();
  let stop = () => {}, lastState = '', availability;
  function post(message) {
    if (window.parent !== window && /^https?:\/\//.test(origin)) window.parent.postMessage(message, origin);
  }
  function stableId(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return 'live-call-' + callNonce + '-' + (hash >>> 0).toString(16);
  }
  const string=(value,max=2000)=>typeof value==='string'?value.slice(0,max):'';
  const ids=value=>Array.isArray(value)?value.filter(id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/.test(id)).slice(0,12):[];
  function safeResult(value){
    if(!value||!['ok','blocked','fallback'].includes(value.status))return null;
    const verdict=value.verdict&&typeof value.verdict==='object'?{pickSkuId:ids([value.verdict.pickSkuId])[0]||null,reason:string(value.verdict.reason),dissent:string(value.verdict.dissent),citations:ids(value.verdict.citations),runnerUpSkuId:ids([value.verdict.runnerUpSkuId])[0]||null,whyRunnerUpLost:string(value.verdict.whyRunnerUpLost),clarifyingQuestion:string(value.verdict.clarifyingQuestion,400)||null}:undefined;
    const proposedSkuIds=ids(value.proposedSkuIds),allowed=new Set([...proposedSkuIds,verdict?.pickSkuId,verdict?.runnerUpSkuId].filter(Boolean));
    const products=(Array.isArray(value.products)?value.products:[]).filter(product=>product&&allowed.has(product.skuId||product.id)).slice(0,8).map(product=>({skuId:product.skuId||product.id,name:string(product.name,160),price:typeof product.price==='number'&&Number.isFinite(product.price)&&product.price>=0?product.price:null,delivery:string(product.delivery,240),priceBasis:string(product.priceBasis,160),image:typeof product.image==='string'&&/^\/(?:live-call\/products|verified-products|scene-reference\/products|products)\/[A-Za-z0-9_./-]+$/.test(product.image)?product.image:null}));
    const navigation=value.navigation&&['/account#addresses','/account#payments'].includes(value.navigation.href)?{href:value.navigation.href,label:string(value.navigation.label,80),section:value.navigation.href.endsWith('#addresses')?'addresses':'payments'}:undefined;
    const inventory=value.inventory&&typeof value.inventory==='object'?{items:(Array.isArray(value.inventory.items)?value.inventory.items:[]).slice(0,24).map(item=>({name:string(item?.name,120),quantity:string(item?.quantity,80),status:['present','low','uncertain'].includes(item?.status)?item.status:'uncertain'})),lowOrMissing:(Array.isArray(value.inventory.lowOrMissing)?value.inventory.lowOrMissing:[]).slice(0,12).map(item=>({name:string(item?.name,120),reason:string(item?.reason,240),confidence:['high','medium','low'].includes(item?.confidence)?item.confidence:'low'})),uncertainties:(Array.isArray(value.inventory.uncertainties)?value.inventory.uncertainties:[]).slice(0,8).map(item=>string(item,240))}:undefined;
    return {ok:value.status==='ok',status:value.status,message:string(value.message),question:string(value.question,400)||null,conversationMode:['interview','request','conversation'].includes(value.conversationMode)?value.conversationMode:'conversation',interviewCount:Number.isInteger(value.interviewCount)?Math.max(0,Math.min(5,value.interviewCount)):0,interviewComplete:value.interviewComplete===true,worldReady:value.worldReady===true,verdict,inventory,proposedSkuIds,products,navigation};
  }
  function notify(event){for(const listener of listeners){try{listener(event);}catch{}}}
  function finish(id,result,error){const turn=turns.get(id);if(!turn||turn.finished)return;turn.finished=true;clearTimeout(turn.timer);turn.result=result||{ok:false,status:'fallback',message:error||'That request could not be checked.'};turn.resolve(turn.result);notify({id,state:error?'error':'result',result:turn.result,error});}
  function preferenceResult(id,result,error){
    const pending=preferenceRequests.get(id);if(!pending)return;
    preferenceRequests.delete(id);clearTimeout(pending.timer);
    const valid=result&&result.ok===true&&result.saved===false&&result.persisted!==true&&(pending.action==='skip'?result.skipped===true:result.draft_ready===true);
    pending.resolve(valid?{ok:true,saved:false,...(pending.action==='skip'?{skipped:true}:{draft_ready:true})}:{ok:false,saved:false,error:string(error||result?.error,300)||'The preference review could not open. Nothing was saved.'});
  }
  function cancelPreferences(message='The call ended. No preferences were saved.'){
    for(const id of [...preferenceRequests.keys()])preferenceResult(id,null,message);
  }
  function preferenceRequest(request){
    if(!personalization.active||window.parent===window)return Promise.resolve({ok:false,saved:false,error:'Preference discovery is not active.'});
    const action=request?.action;if(!['draft','skip'].includes(action))return Promise.resolve({ok:false,saved:false,error:'Choose a preference review or skip.'});
    if(action==='skip')cancelPreferences('The draft was discarded. Nothing was saved.');
    else if(preferenceRequests.size)return Promise.resolve({ok:false,saved:false,error:'The preference review is already opening.'});
    const id='personalization-'+Date.now().toString(36)+'-'+(++preferenceSerial);
    return new Promise(resolve=>{
      preferenceRequests.set(id,{action,resolve,timer:setTimeout(()=>preferenceResult(id,null,'The preference review took too long. Please try again.'),30000)});
      post({type:action==='skip'?'coupi-personalization-skip':'coupi-personalization-review',id,...(action==='draft'?{preferences:request.preferences}:{})});
    });
  }
  async function getAvailability(refresh = false) {
    if (!availability || refresh) availability = fetch('/api/voice/status', {credentials:'same-origin', cache:'no-store'})
      .then(async response => {
        if (!response.ok) throw new Error('The voice service could not be checked.');
        const result = await response.json();
        if (typeof result.ready !== 'boolean') throw new Error('The voice status is unavailable.');
        return {ready:result.ready && !result.offline, offline:result.offline === true, reason:typeof result.reason === 'string' ? result.reason : ''};
      })
      .catch(() => ({ready:false, offline:true, reason:'I couldn’t check the live connection. Try again before using camera or voice.'}));
    return availability;
  }
  window.CoupiCallBridge = {
    getAvailability,
    personalizationContext:()=>({...personalization,memories:personalization.memories.map(item=>({...item}))}),
    checkoutComplete(receipt){if(!personalization.profileId||window.parent===window)return false;post({type:'coupi-call-checkout-complete',profileId:personalization.profileId,receipt});return true;},
    preferences:preferenceRequest,cancelPreferences,
    async openWorldProduct(skuId,details={}) {
      if (typeof skuId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(skuId) || window.parent === window) return {ok:false,error:'Open a world product from the main Coopy app.'};
      const response = await fetch('/api/products/world', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'open',skuId}),cache:'no-store'});
      const result = await response.json();
      if (!response.ok || result.ok !== true || result.catalog_namespace !== 'world-simulation' || result.skuId !== skuId) return {ok:false,error:typeof result.error==='string'?result.error:'That world product is unavailable.'};
      stop();
      post({type:'coupi-live-call-product',namespace:'world-simulation',skuId,...(turns.has(details.callId)?{callId:details.callId}:{}),...(ids([details.reviewId])[0]?{reviewId:details.reviewId}:{})});
      return {ok:true,skuId,call_paused:true,purchased:false};
    },
    attach(handler) { if (typeof handler === 'function') stop = handler; },
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    beginTurn(){latestId='';},
    resolveLatest(){if(latestId&&turns.has(latestId))return turns.get(latestId).promise;return new Promise(resolve=>{const next=id=>{clearTimeout(timer);waiting.delete(next);turns.get(id).promise.then(resolve);};const timer=setTimeout(()=>{waiting.delete(next);resolve({ok:false,status:'fallback',message:'I haven’t received the final words for this turn. Please say that again.'});},15000);waiting.add(next);});},
    transcript(entry,photo) {
      if (!entry || entry.role !== 'user' || entry.final !== true || typeof entry.text !== 'string' || entry.synthetic === true) return;
      const text = entry.text.trim().slice(0, 2000);
      if (!text) return;
      const id = stableId(String(entry.key || '') + '\u0000' + text);
      if (seen.has(id)) return id;
      seen.add(id);
      if(seen.size>128)seen.delete(seen.values().next().value);
      let resolve;const promise=new Promise(done=>{resolve=done;});
      turns.set(id,{promise,resolve,finished:false,timer:setTimeout(()=>finish(id,null,'That request is taking too long. Please try again.'),150000)});if(entry.superseded!==true){latestId=id;for(const next of [...waiting])next(id);}
      for(const [old,turn] of turns)if(turns.size>24&&turn.finished)turns.delete(old);
      const safePhoto=photo&&photo.mime==='image/jpeg'&&typeof photo.dataUrl==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo.dataUrl)&&photo.dataUrl.length<=22000&&typeof photo.capturedAt==='string'&&Number.isFinite(Date.parse(photo.capturedAt))?{dataUrl:photo.dataUrl,mime:'image/jpeg',capturedAt:photo.capturedAt}:undefined;
      if(entry.superseded!==true)notify({id,state:'pending'});
      post({type:'coupi-live-call-transcript', role:'user', text, id,...(safePhoto?{photo:safePhoto}:{})});
      return id;
    },
    state(value) {
      const message = {type:'coupi-live-call-state', phase:String(value.phase || 'incoming').slice(0,24), cameraActive:value.cameraActive === true, microphoneActive:value.microphoneActive === true};
      // Transcript item counters restart in every Realtime session. Namespace new calls
      // so an identical prompt never replays a persisted receipt from an earlier call.
      if(['connecting','active'].includes(message.phase)&&!['connecting','active'].includes(lastPhase))callNonce=newCallNonce();
      lastPhase=message.phase;
      const serialized = JSON.stringify(message);
      if (serialized !== lastState) { lastState = serialized; post(message); }
    },
    exit() { stop(); post({type:'coupi-live-call-exit'}); if (window.parent === window) window.location.assign('/'); },
  };
  window.addEventListener('message', event => {
    if (event.origin !== origin || event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'coupi-live-call-stop') {cancelPreferences();stop();}
    if(event.data.type==='coupi-personalization-context'){
      const value=event.data;
      personalization={profileId:typeof value.profileId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value.profileId)?value.profileId:null,active:value.active===true,question:string(value.question,400),count:Number.isInteger(value.count)?Math.max(0,Math.min(5,value.count)):0,draftPending:value.draftPending===true,received:true,memories:(Array.isArray(value.memories)?value.memories:[]).slice(-8).filter(item=>item&&typeof item.text==='string').map(item=>({text:string(item.text,240),source:string(item.source,100),confidence:typeof item.confidence==='number'&&Number.isFinite(item.confidence)?Math.max(0,Math.min(1,item.confidence)):null}))};
      if(!personalization.active)for(const [id,pending] of preferenceRequests)if(pending.action==='draft')preferenceResult(id,null,'Personalization ended before the review was ready. Nothing was saved.');
      notify({state:'personalization-context',context:window.CoupiCallBridge.personalizationContext()});
    }
    if(event.data.type==='coupi-personalization-result'&&typeof event.data.id==='string')preferenceResult(event.data.id,event.data.result,event.data.error);

    if(event.data.type==='coupi-call-pending'&&typeof event.data.id==='string'){const old=turns.get(event.data.id);if(old?.finished){const id=event.data.id;let resolve;const promise=new Promise(done=>{resolve=done;});turns.set(id,{promise,resolve,finished:false,timer:setTimeout(()=>finish(id,null,'That request is taking too long. Please try again.'),150000)});latestId=id;notify({id,state:'pending',retry:true});}}
    if(event.data.type==='coupi-call-result'&&typeof event.data.id==='string'){const result=safeResult(event.data.result);if(result)finish(event.data.id,result);else finish(event.data.id,null,'The checked answer could not be read. Please try again.');}
    if(event.data.type==='coupi-call-error'&&typeof event.data.id==='string')finish(event.data.id,null,string(event.data.error,300)||'That request could not be checked.');
  });
  window.addEventListener('pagehide',()=>cancelPreferences());
  post({type:'coupi-live-call-ready'});
  document.querySelectorAll('[data-world-return]').forEach(button => button.addEventListener('click', () => window.CoupiCallBridge.exit()));
  // The shared stylesheet may reference Google font binaries. Never request it in offline mode.
  getAvailability().then(status => {
    if (status.offline || !document.head) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/fonts/fonts.css';
    document.head.append(link);
  });
})();
