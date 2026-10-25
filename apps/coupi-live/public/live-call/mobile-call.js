/* Nook mobile call prototype: shared camera snapshots, real AI audio, no purchases. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const store=new window.NookCallState(window.COUPANG_PRODUCTS||[]);
  let bagStorageKey='coupi_call_bag_v1:standalone';
  try { const saved=JSON.parse(window.sessionStorage.getItem(bagStorageKey)||'[]');if(Array.isArray(saved))for(const id of saved.slice(0,100)){const product=store.catalog.get(String(id));if(product)store.cart.set(String(id),product);} } catch {}
  const discovery=new window.CoupiDiscovery(window.COUPANG_PRODUCTS||[]);
  const checkout=new window.CoupiCheckout(window.COUPANG_PRODUCTS||[]);
  let personalization=null;
  const bridge=window.CoupiCallBridge;
  const params=new URLSearchParams(window.location.search||'');
  const checkedShopping=params.get('checked')==='1'||params.get('interview')==='1';
  const requiresContext=params.get('embedded')==='1'||params.get('interview')==='1'||params.get('intent')==='personalize';
  let availabilityReady=false,availabilityChecking=false,checkedTurnId='',interviewContext=null,bridgePanelVisible=false;
  const appPrompts=new Set(),uploadedPhotos=new Map();
  const approvedCatalog=new Map((window.COUPANG_PRODUCTS||[]).map(product=>[String(product.id),product])),checkedQueries=new Map(),checkedEvidence=new Map();
  let checkedRequestText='';
  let pendingPhoto=Promise.resolve(),bridgeTurnEpoch=0;
  function reportMedia(){bridge.state({phase,cameraActive:camera.running,microphoneActive:!!voice?.call?.microphone?.getAudioTracks?.().some(track=>track.readyState==='live'&&track.enabled)});}
  function sendAppPrompt(value){appPrompts.add(value);const sent=voice.sendText(value);if(!sent)appPrompts.delete(value);return sent;}
  function hideBridgePanel(){bridgePanelVisible=false;show('bridge-panel',false);show('world-picks',false);show('validated-call',false);}
  function showBridgePanel(){bridgePanelVisible=true;show('bridge-panel',true);show('product-zone',false);show('product-empty',false);}

  const defaults={none:{opacity:0},makeup:{opacity:.55,scale:1,rotation:0},clothes:{opacity:1,scale:1,rotation:0},desk:{opacity:1,scale:1,rotation:0,x:.5,y:.74},glasses:{opacity:1,scale:1,rotation:0}};
  const typeLabels={lipstick:'Lipstick',lipbalm:'Lip balm',sweater:'Sweaters',chair:'Chairs',lamp:'Desk lamps',tshirt:'T-shirts',hoodie:'Hoodies',glasses:'Glasses'};
  let phase='incoming',generation=0,facingMode='user',mode='none',trying=null,connectedAt=null,cameraBusy=false,ending=false;
  let toastTimer,initialGreeting=true,displayedTotal=0;
  let entryCameraWanted=true,entryInputMode='voice',inputMode='voice',formatBusy=false,composerWanted=false;
  let visionWanted=true,visionWasActive=false,visionState='paused',visionLastAt=null;
  let previewEpoch=0,previewMeta=null,catalogType='recommended',loadingEpoch=0,loadingProductId=null,pendingTryOn=null;
  let recommendationsReceived=false,recommendedProducts=[],searchController=null;
  let lastSearch=null,lastSearchMessage='',lastSearchStatus=null,excludedProductIds=[],visibleChoices=[],catalogTryButtons=[];
  const productLabel=p=>typeLabels[p.productType]||'Product';
  const canPreview=p=>Object.hasOwn(defaults,p.category);
  const isLiveListing=p=>p.source==='coupang_web';
  let controlsExpanded=false,viewingCollection=false;
  let voice=null,attachment=null,attachmentEpoch=0,sendingImage=false,preparingImage=false,choosingImage=false,pickerTimer;
  const conversation=new window.CoupiConversation({store,root:$('conversation-history'),history:$('chat-history'),count:$('chat-count'),latest:$('chat-latest')});
  const trusted=p=>p&&store.catalog.get(String(p.id));
  const show=(id,visible)=>{$(id).hidden=!visible;};
  function text(id,value){$(id).textContent=value;}
  function toast(value){clearTimeout(toastTimer);text('toast',value);show('toast',true);toastTimer=setTimeout(()=>show('toast',false),2400);}
  function notice(message, retry=false){text('call-notice',message||'');show('call-notice',!!message);show('retry-call',retry);}
  function screen(next){phase=next;if(!['active','connecting'].includes(next)){setCollectionView(false,{resetScroll:true});}show('incoming-screen',next==='incoming');show('call-screen',['connecting','active'].includes(next));show('end-screen',next==='ended');$('phone-app').dataset.phase=next;updateVisionUI();updateFocusUI();if(voice)reportMedia();}
  function displayedProducts(){return $('catalog-dialog').open&&$('catalog-dialog').dataset.view==='search'?visibleChoices:discovery.visible;}
  function context(){const p=$('details-dialog').open?store.detailProduct:store.current,q=checkout.snapshot();return {mode,interaction_format:camera.running?'video':inputMode==='text'?'text':'voice',input_mode:inputMode,cameraRunning:camera.running,screen:phase,...(interviewContext?{interview:interviewContext}:{}),personalization:personalization?.context||{active:false,preferences:null,draft_pending:false},visible_panel:$('details-dialog').open?'product-details':$('checkout-dialog').open?'checkout':$('compare-dialog').open?'comparison':$('cart-dialog').open?'cart':($('catalog-dialog').open||viewingCollection)?'catalog':'call',checkout:{step:q.step,item_ids:q.selectedItems.map(i=>i.id),reference_total:q.referenceTotal,demo:true},last_purchase:lastPurchase?{receipt_id:lastPurchase.id,item_ids:lastPurchase.item_ids,pairing_ids:purchasePairings.map(p=>p.id),demo:true,payment_processed:false,order_placed:false}:null,facing_mode:facingMode,vision:{enabled:visionEnabled(),last_image_at:visionLastAt,state:visionState},tried_product:trying?{id:trying.id,title:trying.name,productType:trying.productType,preview_kind:previewMeta?.kind,finish:previewMeta?.finish,shade_color:previewMeta?.shadeColor,shade_estimated:previewMeta?.shadeEstimated}:null,overlay:{...camera.options},visible_product:p?{id:p.id,title:p.name,category:p.category,productType:p.productType,price:p.price,price_is_historical:!isLiveListing(p),preview_available:p.preview?.available!==false,preview_unavailable_reason:p.preview?.unavailableReason||null,verifiedAttributes:(p.verifiedAttributes||[]).slice(0,2)}:null,visible_product_ids:displayedProducts().map(product=>String(product.id)),cart_ids:[...store.cart.keys()],tried_product_id:trying?.id||null,recent_skipped:store.skipped.slice(-5),comparison_ids:discovery.comparison.map(p=>p.id),group_label:discovery.label};}
  function sync(){voice?.updateContext(context());}
  function cameraUI(){updateCatalogTryButtons();formatUI();show('camera-fallback',!camera.running);$('toggle-camera').setAttribute('aria-pressed',String(!camera.running));$('toggle-camera').setAttribute('aria-label',camera.running?'Turn camera off':'Turn camera on');$('toggle-camera').classList.toggle('is-off',!camera.running);$('flip-camera').disabled=cameraBusy||!camera.running;$('flip-camera').setAttribute('aria-label',facingMode==='user'?'Flip to back camera':'Flip to front camera');$('flip-camera').title=facingMode==='user'?'Flip to back camera':'Flip to front camera';updateVisionUI();updateFocusUI();sync();reportMedia();}
  function selectEntry(format){
    if(format){entryCameraWanted=format==='video';entryInputMode=format==='text'?'text':'voice';}
    $('entry-camera').setAttribute('aria-pressed',String(entryCameraWanted));
    $('entry-camera').setAttribute('aria-label',entryCameraWanted?'Turn camera off before starting':'Turn camera on before starting');
    $('entry-mic').setAttribute('aria-pressed',String(entryInputMode==='voice'));
    $('entry-mic').setAttribute('aria-label',entryInputMode==='voice'?'Turn microphone off before starting':'Turn microphone on before starting');
    text('answer-call-label','Start call');
    $('answer-call-icon').setAttribute('href',entryCameraWanted?'#i-video':entryInputMode==='voice'?'#i-mic':'#i-chat');
    show('entry-vision-consent',entryCameraWanted);
    const sharesCamera=entryCameraWanted&&$('vision-consent').checked;
    text('entry-privacy',sharesCamera?(entryInputMode==='voice'?'Mic + camera snapshots go to OpenAI during the call.':'Camera snapshots and messages go to OpenAI. Your microphone stays off.'):entryCameraWanted?(entryInputMode==='voice'?'Your microphone is shared. Camera preview stays on this device.':'Messages and uploads go to Coupi. Camera preview stays on this device.'):entryInputMode==='voice'?'Your microphone is shared during the call. Camera stays off.':'Messages and images are shared with Coupi. No camera or microphone needed.');
  }
  function formatUI(){
    const format=camera.running?'video':inputMode==='text'?'text':'voice';
    $('phone-app').dataset.camera=camera.running?'on':'off';$('phone-app').dataset.format=format;
    show('conversation-history',true);
    show('text-form',!camera.running||inputMode==='text'||composerWanted);
    $('text-toggle').setAttribute('aria-expanded',String(!$('text-form').hidden));
    $('text-toggle').setAttribute('aria-pressed',String(inputMode==='text'));
    $('text-toggle').setAttribute('aria-label','Chat with Coupi');
    $('text-toggle').disabled=formatBusy||!voice?.call?.ready;
    if(!camera.running){$('conversation-box').dataset.collapsed='false';$('chat-minimize').setAttribute('aria-expanded','true');}
    const micOff=inputMode==='text'||!!voice?.call?.muted;
    $('mute-call').disabled=formatBusy||!voice?.call?.ready;
    $('mute-call').setAttribute('aria-pressed',String(micOff));
    $('mute-call').setAttribute('aria-label',micOff?'Turn microphone on':'Mute microphone');
    $('mute-call').title=micOff?'Microphone off':'Microphone on';
    $('mute-call').classList.toggle('is-off',micOff);
  }
  async function switchInput(nextInput){
    if(phase!=='active'||formatBusy)return false;
    const token=generation;formatBusy=true;formatUI();notice('');
    try{
      const changed=await voice.setInputMode(nextInput);
      if(token!==generation||phase!=='active')return false;
      if(!changed){notice('Microphone access was not enabled. You can keep typing or tap the microphone to try again.');return false;}
      inputMode=nextInput;entryInputMode=nextInput;
      if(nextInput==='text'){composerWanted=true;$('conversation-box').dataset.collapsed='false';$('chat-minimize').setAttribute('aria-expanded','true');$('text-input').focus();}
      return true;
    }catch(error){if(token===generation)notice(error.message||'Could not change audio. You can keep typing.');return false;}
    finally{if(token===generation){formatBusy=false;cameraUI();selectEntry();}}
  }
  const camera=new window.NookCamera({video:$('live-video'),canvas:$('live-canvas'),onStatus:(message,kind)=>{
    if(kind==='error'){notice(message,true);text('camera-fallback-text','Your camera is off');}
    else if(kind==='loading'&&cameraBusy)text('camera-fallback-text','Opening your camera…');
    if(camera)cameraUI();
  }});
  camera.setOptions({opacity:0,mirror:true});
  const snapshots=new window.NookCameraSnapshots({video:$('live-video'),previewCanvas:$('live-canvas'),getContext:()=>({mode,mirror:camera.options.mirror,cameraRunning:camera.running}),isEnabled:visionEnabled});
  function updateFocusUI(){
    const active=!!trying&&camera.running&&['active'].includes(phase),focused=active&&!controlsExpanded;
    $('phone-app').dataset.focused=String(focused);
    show('focus-product',focused);show('focus-toggle',active);show('focus-shopping',focused&&!viewingCollection);
    if(trying){$('focus-add').setAttribute('aria-label','Add '+trying.name+' to your bag');text('focus-add',store.cart.has(String(trying.id))?'In bag':'Add to bag');}
    $('focus-toggle').setAttribute('aria-expanded',String(controlsExpanded));
    $('focus-toggle').setAttribute('aria-label',controlsExpanded?'Hide call controls':'Show call controls');
    $('focus-toggle').title=controlsExpanded?'Hide call controls':'Show call controls';
    $('focus-toggle-icon').setAttribute('href',controlsExpanded?'#i-close':'#i-more');
    text('focus-product-label','Products');
    if(trying){$('focus-product-image').src=trying.image;$('focus-product-image').alt='';}
  }
  function visionEnabled(){return visionWanted&&camera.running&&!cameraBusy&&phase==='active'&&!!voice?.call?.ready&&!document.hidden;}
  function updateVisionUI(){
    const enabled=visionEnabled();
    if(visionWasActive&&!enabled){visionWasActive=false;visionLastAt=null;visionState='paused';snapshots.clear();voice?.clearCameraSnapshots?.();}
    else visionWasActive=enabled;

  }
  function shareSnapshot(reason='interval'){if(!visionEnabled())return false;const frame=snapshots.capture(reason);return frame?voice.sendCameraSnapshot(frame):false;}

  function forwardTurn(entry,photo){
    if(!checkedShopping||entry.delivery==='failed'||entry.error||entry.localAction===true)return;
    const upload=entry.image||uploadedPhotos.get(entry.key);
    if(entry.image)uploadedPhotos.set(entry.key,entry.image);
    if(entry.role!=='user'||!entry.final||!upload){bridge.transcript(entry,photo);return;}
    uploadedPhotos.delete(entry.key);
    if(typeof upload.dataUrl!=='string')return;
    if(upload.dataUrl.startsWith('data:image/jpeg;base64,')&&upload.dataUrl.length<=22000){bridge.transcript(entry,{dataUrl:upload.dataUrl,mime:'image/jpeg',capturedAt:new Date().toISOString()});return;}
    const token=generation,turn=bridgeTurnEpoch;
    return new Promise(resolve=>{
      const image=new Image(),finish=small=>{
        if(token===generation&&['active','connecting'].includes(phase)){
          const stale=turn!==bridgeTurnEpoch;
          if(!small&&!stale)notice('The photo could not be prepared for your checked answer. Please send a smaller image.');
          bridge.transcript(stale?{...entry,superseded:true}:entry,small&&!stale?{dataUrl:small.dataUrl,mime:'image/jpeg',capturedAt:new Date().toISOString()}:undefined);
        }
        resolve();
      };
      image.onload=()=>{let small=null;try{small=snapshots._encode(image,false,'uploaded-turn',image.naturalWidth,image.naturalHeight);}catch{}finish(small);};
      image.onerror=()=>finish(null);image.src=upload.dataUrl;
    });
  }
  function transcript(entry){
    if(entry.role==='user'&&appPrompts.has(entry.text)){entry={...entry,synthetic:true};if(entry.final)appPrompts.delete(entry.text);}
    let photo;
    if(entry?.role==='user'&&entry.final===true&&entry.synthetic!==true&&entry.superseded!==true&&visionEnabled()){
      const frame=snapshots.capture('validated-turn'),image=frame?.images?.find(image=>image.kind==='camera');
      if(image)photo={dataUrl:image.dataUrl,mime:'image/jpeg',capturedAt:frame.metadata.capturedAt};
    }
    if(entry.role==='user'&&entry.final&&entry.synthetic!==true&&entry.superseded!==true&&entry.delivery!=='failed')checkedRequestText=entry.text;
    const prepared=forwardTurn(entry,photo);
    if(entry.role==='user'&&entry.final&&!entry.superseded)pendingPhoto=prepared||Promise.resolve();

    if(initialGreeting&&entry.role==='assistant'){store.messages=store.messages.filter(m=>m.key!=='opening');initialGreeting=false;}
    store.message(entry);conversation.schedule();
    const current=store.messages.at(-1);
    if(!current||entry.superseded===true)return;
    const body=$('caption-text'),speaker=current.role==='user'?'You':'Coupi';
    if($('caption-speaker').textContent!==speaker)text('caption-speaker',speaker);
    show('live-caption',true);
    if(body.textContent!==current.text){body.textContent=current.text;body.scrollTop=body.scrollHeight;}
  }
  personalization=new window.CoupiCallPersonalization({onChange:()=>{
    if(voice&&personalization){voice.options.greeting=personalization.greeting;if(phase==='connecting'){store.message({role:'assistant',key:'opening',text:personalization.greeting});text('caption-text',personalization.greeting);conversation.schedule();}sync();}
    if(personalization&&phase==='incoming')$('answer-call').disabled=!availabilityReady||(requiresContext&&!personalization.received);
  }});
  voice=new window.NookVoiceSession({audio:$('voice-audio'),greeting:personalization.greeting,getContext:context,getVisionEnabled:visionEnabled,getCameraSnapshot:reason=>snapshots.capture(reason),
    onVisionState:event=>{visionState=event.state;if(event.state==='received')visionLastAt=event.capturedAt||new Date().toISOString();updateVisionUI();sync();},
    directShopping:!checkedShopping,...(checkedShopping?{onUserTurnStart:()=>{bridgeTurnEpoch++;pendingPhoto=Promise.resolve();checkedTurnId='';bridge.beginTurn();},onResolveCall:async()=>{await pendingPhoto;return bridge.resolveLatest();}}:{}),
    onWorldRecommendations:(list,message)=>worldRecommendations(list,message),onWorldProduct:skuId=>bridge.openWorldProduct(skuId),
    onTranscript:transcript,onRecommendations:(list,message,options,status)=>{searchController?.abort();searchController=null;$('catalog-search-submit').disabled=false;$('catalog-refresh').disabled=false;hideBridgePanel();closeDialogs();return list.some(isLiveListing)?receiveRecommendations(list,message,options,[],status):recommend(list,message,options);},
    onTryon:async(next,options)=>{
      const token=generation;let target=trying;
      if(next==='none'){await setMode('none');return {product_id:null,preview_kind:null};}
      if(!camera.running)throw Error('Tap Camera and I can show you the try-on.');
      if(next!=='makeup'&&options.color!==undefined)throw Error('The preview uses the real product photo. Choose another product for a different colour.');
      if(!trying||trying.category!==next||loadingProductId===store.current?.id){const p=store.current;if(!p||p.category!==next)throw Error('Choose a matching product card and try it first.');target=p;if(p.preview?.available===false)return previewFailure(p);if(!(await tryOn(p))?.ok)throw Error('The product preview was cancelled.');}
      if(token!==generation||!trying||mode!==next||trying.id!==target?.id||camera.product?.id!==target?.id)throw Error('The product preview changed or the call ended.');
      if(previewMeta?.finish==='clear-balm'&&options.color!==undefined)throw Error('This balm is clear and preserves natural lip colour. Choose a tinted balm or lipstick for a colour preview.');
      camera.setOptions(options);cameraUI();return {product_id:trying.id,product_type:trying.productType,preview_kind:previewMeta?.kind,shade_estimated:previewMeta?.shadeEstimated,preview_is_approximate:true};
    },
    onProductAction:async(action,productId)=>{if(action==='try_on'&&!camera.running)throw Error('Tap Camera and I can show you the try-on.');return productAction(action,productId);},
    onCheckout:request=>openCheckout(request),onCompareProducts:productIds=>compareProducts(productIds),
    onPreferences:request=>{if(phase!=='active'||!personalization.active)throw Error('Start the optional introduction before shaping your worlds.');return personalization.handle(request);},
    onTranscriptionState:state=>{if(state.compatibilityMode)notice('Using compatible captions. Speak clearly or type if a word looks wrong.');},
    onPlaybackBlocked:blocked=>show('play-audio',blocked&&inputMode!=='text'),
    onState:({state,message,muted,inputMode:nextInputMode,connectedAt:at})=>{
      if(nextInputMode)inputMode=nextInputMode;
      connectedAt=at;const ready=!!voice?.call?.ready;updateVisionUI();reportMedia();
      $('inline-mute').disabled=!ready||inputMode==='text';$('inline-mute').setAttribute('aria-pressed',String(muted));$('inline-mute').setAttribute('aria-label',muted?'Unmute microphone':'Mute microphone');text('inline-call-status',ready?(inputMode==='text'?'Chat with Coupi':muted?'Live call · mic muted':'Live call · keep talking'):'Connect with Coupi');$('mute-call').disabled=!ready||inputMode==='text';$('text-input').disabled=false;$('text-toggle').disabled=false;$('chat-send').disabled=!ready||sendingImage||preparingImage;$('mute-call').setAttribute('aria-pressed',String(muted));$('mute-call').setAttribute('aria-label',muted?'Unmute microphone':'Mute microphone');$('mute-call').classList.toggle('is-off',muted);
      $('phone-app').dataset.voice=state;
      formatUI();text('call-status',({connecting:'Connecting…',listening:'Listening',thinking:'Thinking',searching:'Finding your picks',speaking:'Coupi is speaking',connected:inputMode==='text'?'Chat with Coupi':muted?'Mic muted':'Live with Coupi',reconnecting:'Reconnecting…',error:'Connection paused',idle:'Coupi'})[state]||'Coupi');
      if(ready&&phase==='connecting'){screen('active');notice('');cameraUI();}
      if(state==='error'&&!ending&&['connecting','active'].includes(phase)){notice(message,true);}
      else if(state==='idle'&&phase==='active'&&!ending){endCall(message);}
    }
  });
  window.NookMobile={camera,voice,store,discovery,checkout,personalization,endCall,openCatalog};bridge.attach(()=>endCall());
  async function startCamera({strictFacing=false}={}){if(cameraBusy)return false;const preflight=generation,status=await bridge.getAvailability();if(preflight!==generation)return false;if(status.offline){notice(status.reason||'Live camera is unavailable while offline.');return false;}cameraBusy=true;cameraUI();const token=generation;try{const ok=await camera.start({facingMode,portrait:true,strictFacing});if(token!==generation)return false;if(ok){facingMode=camera.actualFacingMode||facingMode;camera.setOptions({mirror:facingMode==='user'});}else if(!strictFacing)notice(camera.lastCameraError?.message||'Allow Camera in browser settings, then tap Retry.',true);return ok;}finally{if(token===generation){cameraBusy=false;cameraUI();}}}
  async function answer(format){if(phase==='connecting'||voice.call||availabilityChecking)return;
    if(requiresContext&&!personalization.received){notice('Your conversation is getting ready. Please try again in a moment.');return;}
    availabilityChecking=true;$('answer-call').disabled=true;const preflight=generation,status=await bridge.getAvailability(true);availabilityChecking=false;
    if(preflight!==generation)return;if(!status.ready){text('incoming-status',status.reason||'Live calls are unavailable.');show('incoming-status',true);$('answer-call').disabled=false;return;}
    hideBridgePanel();checkedTurnId='';bridge.beginTurn();if(format)selectEntry(format);inputMode=entryInputMode;const wantsCamera=entryCameraWanted;const token=++generation;visionWanted=$('vision-consent').checked;visionState='paused';visionLastAt=null;lastPurchase=null;purchasePairings=[];screen('connecting');notice('');text('camera-fallback-text',wantsCamera?'Opening your camera…':'Camera off. Tap Camera to turn it on.');$('answer-call').disabled=true;store.clearMessages();conversation.reset();initialGreeting=true;voice.options.greeting=personalization.greeting;transcript({role:'assistant',key:'opening',text:personalization.greeting});initialGreeting=true;if(personalization.world&&!store.current)recommend(personalization.world.products,'',{mixed:true,sourceOnly:true,groupLabel:personalization.world.title,maxPrice:personalization.profile?.budget});
    try{if(wantsCamera)await startCamera();else{camera.stop(false);cameraBusy=false;cameraUI();}if(token!==generation||phase!=='connecting')return;voice.options.greeting=personalization.greeting;await voice.start({inputMode});}catch{notice(inputMode==='text'?'Could not connect. Check your connection and try again.':'Could not start the call. Check your microphone permission and connection.',true);}finally{if(token===generation)$('answer-call').disabled=false;}
  }
  function endCall(message='Call ended',markCompleted=true){
    searchController?.abort();searchController=null;$('catalog-search-submit').disabled=false;$('catalog-refresh').disabled=false;
    if(ending)return;
    const completed=markCompleted&&phase==='active'&&!document.hidden;
    ending=true;generation++;bridge.cancelPreferences();hideBridgePanel();appPrompts.clear();uploadedPhotos.clear();checkedQueries.clear();checkedEvidence.clear();checkedRequestText='';pendingPhoto=Promise.resolve();bridgeTurnEpoch++;previewEpoch++;personalization?.resetDraft();lastPurchase=null;purchasePairings=[];clearAttachment();$('text-input').value='';trying=null;previewMeta=null;mode='none';controlsExpanded=false;cameraBusy=false;formatBusy=false;composerWanted=false;
    snapshots.clear();voice.clearCameraSnapshots?.();voice.end();camera.stop(false);camera.setProduct(null);camera.setMode('none');camera.setOptions({opacity:0});
    loadingEpoch=0;loadingProductId=null;$('product-try').disabled=false;$('answer-call').disabled=false;show('tryon-chip',false);show('live-caption',false);connectedAt=null;
    screen(message==='Call ended'?'incoming':'ended');cameraUI();selectEntry();personalization?.render();
    text('end-title','A little closer to your thing.');
    text('end-summary',store.cart.size?`${store.cart.size} ${store.cart.size===1?'pick':'picks'} saved in your bag.`:message==='Call ended'?'Your camera and microphone are off.':message);
    closeDialogs();ending=false;
    if(completed){try{window.localStorage.setItem('coupi_first_call_done','1');}catch{/* Storage may be unavailable. */}}
  }
  function previewLabel(){return trying?`${(trying.preview?.finish==='clear-balm'?trying.brand:null)||trying.preview?.shadeLabel||trying.brand||typeLabels[trying.productType]||'Product'} · ${trying.preview?.finish==='clear-balm'?'clear balm finish':trying.preview?.finish==='tinted-balm'?'tint + sheen estimate':trying.category==='makeup'?'shade estimate':'live placement guide'}`:'';}
  async function setMode(next){const token=generation;if(!Object.hasOwn(defaults,next))throw Error('Choose makeup, glasses, clothes, desk, or none.');if(next==='none'){previewEpoch++;trying=null;previewMeta=null;loadingEpoch=0;loadingProductId=null;$('product-try').disabled=store.current?.preview?.available===false;}const changed=mode!==next;mode=next;if(changed||next==='none')camera.setOptions(defaults[next]);const modeEpoch=previewEpoch;await camera.setMode(next);if(token!==generation||modeEpoch!==previewEpoch)return false;if(camera.errors[next])throw Error('Tracking is unavailable. Try again in good light or check your connection.');show('tryon-chip',next!=='none'&&!!trying);text('tryon-label',previewLabel());updateFocusUI();updateVisionUI();sync();return true;}
  function previewUnavailable(p){return p.preview?.unavailableReason||'This listing does not have a supported try-on image. You can still view details or add it to your bag.';}
  function previewFailure(p){return {ok:false,error:previewUnavailable(p),unavailableReason:previewUnavailable(p),alternatives:[...store.catalog.values()].filter(x=>x.id!==p.id&&x.productType===p.productType&&x.preview?.available!==false).slice(0,3).map(x=>({id:x.id,name:x.name,preview_available:true}))};}
  function tryOn(p=store.current){
    p=trusted(p);
    if(p&&pendingTryOn?.id===p.id&&pendingTryOn.generation===generation&&pendingTryOn.epoch===previewEpoch)return pendingTryOn.promise;
    const task={id:p?.id,generation,epoch:0,promise:null};
    const loading=loadTryOn(p);task.epoch=previewEpoch;
    task.promise=loading.finally(()=>{if(pendingTryOn===task)pendingTryOn=null;});pendingTryOn=task;return task.promise;
  }
  async function loadTryOn(p){
    p=trusted(p);if(!p||!['active'].includes(phase))throw Error('Choose a product during the call first.');
    if(!p.image)throw Error('This product has no preview photo. Choose another product.');
    if(p.preview?.available===false)throw Error(previewUnavailable(p));
    backToCamera();
    const token=generation,epoch=++previewEpoch;loadingEpoch=epoch;loadingProductId=p.id;notice('');$('product-try').disabled=true;toast('Loading the product photo…');
    try{
      if(!camera.running)await startCamera();
      if(token!==generation||epoch!==previewEpoch)return;
      if(!camera.running)throw Error('Turn on your camera to preview this product.');
      const result=await camera.setProduct(p);
      if(token!==generation||epoch!==previewEpoch)return;
      if(!result?.ok){await setMode('none');return;}
      trying=p;previewMeta=result;controlsExpanded=false;camera.setOptions(defaults[p.category]);
      if(!await setMode(p.category)||token!==generation||epoch!==previewEpoch)return;
      if(result.shadeColor)camera.setOptions({color:result.shadeColor});
      text('tryon-label',previewLabel());updateFocusUI();updateVisionUI();sync();
      toast(p.category==='clothes'?'Step back so your shoulders and hips are visible':p.productType==='glasses'?'Face the camera. The frames follow your eyes.':p.productType==='chair'?'Point at the floor. Tap where the chair should sit.':p.category==='desk'?'Point at your desk. Tap where the lamp should sit.':p.preview?.finish==='clear-balm'?'Clear balm adds a subtle sheen to your natural lips':'Shade and finish are approximate');
      return result;
    }catch(error){if(token===generation&&epoch===previewEpoch){trying=null;previewMeta=null;await setMode('none');}throw error;}
    finally{if(loadingEpoch===epoch){loadingEpoch=0;loadingProductId=null;$('product-try').disabled=store.current?.preview?.available===false;}}
  }
  function receiveRecommendations(list,message,search,excluded=[],status=null){
    if(!['connecting','active'].includes(phase))return {ok:false,error:'The shopping call is no longer active.'};
    list=list.filter(p=>p&&typeof p==='object');
    const types=[...new Set(list.map(p=>p.productType).filter(type=>typeof type==='string'))];
    lastSearch=search || {query:types.join(' '),category:'all',max_price:null,product_types:types};
    lastSearchMessage=typeof message==='string'?message:'';lastSearchStatus=status;
    excludedProductIds=excluded;
    const allowed=(/\b(?:glasses|eyeglasses|eyewear|spectacles|sunglasses|frames)\b|안경|선글라스|眼镜|眼鏡|镜框|鏡框|墨镜|墨鏡/iu.test(lastSearch.query)?['glasses']:lastSearch.product_types||[]);
    const matches=list.filter(p=>(!allowed.length||allowed.includes(p.productType))&&(!lastSearch.category||lastSearch.category==='all'||p.category===lastSearch.category)&&!excluded.includes(String(p.id))).slice(0,15);
    store.addSearchProducts(matches);for(const product of store.catalog.values())discovery.catalog.set(String(product.id),product);recommendationsReceived=true;recommend(matches,message,{...lastSearch,sourceOnly:true});recommendedProducts=matches.map(p=>trusted(p)).filter(Boolean).slice(0,15);closeDialogs();openSearchCatalog('recommended');
    if(excluded.length&&!recommendedProducts.length&&status!=='listing_sources_unavailable')text('catalog-match-note',lastSearchMessage||'No new matching products found. Try changing your search.');
    return recommendationResult(list,visibleChoices);
  }
  function catalogChoices(){
    const groups=[...new Set([...Object.keys(typeLabels),...[...store.catalog.values()].map(p=>p.productType)])].map(type=>[...store.catalog.values()].filter(p=>p.productType===type));
    const assorted=[];
    for(let index=0;groups.some(group=>index<group.length);index++)for(const group of groups)if(group[index])assorted.push(group[index]);
    return recommendationsReceived?recommendedProducts:assorted.slice(0,10);
  }
  function updateCatalogTryButtons(){
    for(const entry of catalogTryButtons){
      const canTry=canPreview(entry.product)&&!!entry.product.image&&entry.product.preview?.available!==false&&!entry.imageUnavailable;
      entry.button.textContent=!canPreview(entry.product)?'Details only':canTry?'Try it':'No preview';
      entry.button.disabled=!canTry||cameraBusy;
      entry.button.setAttribute('aria-label',canTry?'Try '+entry.product.name:!canPreview(entry.product)?'Try-on unavailable for '+entry.product.name:'Preview unavailable for '+entry.product.name);
    }
  }
  function openSearchCatalog(type=catalogType){
    $('catalog-dialog').dataset.view='search';show('catalog-collection-controls',false);
    if(recommendationsReceived)type='recommended';
    catalogType=type==='recommended'||Object.hasOwn(typeLabels,type)?type:'recommended';const root=$('catalog-items');root.replaceChildren();catalogTryButtons=[];
    const choices=catalogType==='recommended'?catalogChoices():[...store.catalog.values()].filter(p=>p.productType===catalogType).slice(0,10);
    visibleChoices=choices;
    show('catalog-refresh',(!!lastSearch||!!choices.length)&&lastSearchStatus!=='unsupported_category');
    text('catalog-refresh',lastSearchStatus==='listing_sources_unavailable'?'Retry search':'None of these? Show different products');
    const detailsOnly=!!choices.length&&choices.every(p=>!canPreview(p));
    text('catalog-title',lastSearchStatus==='listing_sources_unavailable'&&!choices.length?'Products unavailable':detailsOnly?'Choose a product':'Choose what to try');
    show('catalog-photo-note',!!choices.length&&!detailsOnly);
    const priceNote=choices.length&&choices.every(p=>!isLiveListing(p))?'Reference prices in KRW. Prices and options may change.':'Prices in KRW. Listed prices and options may change.';
    text('catalog-summary',!recommendationsReceived&&!choices.length?'Search Coupang to find products to try.':`${choices.length} ${choices.length===1?'choice':'choices'} · ${priceNote}`);
    show('catalog-match-note',catalogType==='recommended'&&recommendationsReceived);
    text('catalog-match-note',recommendedProducts.length?(recommendedProducts.every(p=>!canPreview(p))?'Top results for your request. Confirm requested sizes and options in the details; try-on is unavailable for these products.':'Top results for your request. Try-on is available for supported products with photos.'):lastSearchMessage||'No listings could be verified for this search right now. Try again later.');
    for(const [index,p] of choices.entries()){
      const row=document.createElement('article');row.className='catalog-item';
      const img=document.createElement('img');if(p.image)img.src=p.image;else img.hidden=true;img.alt=p.name;img.loading='lazy';img.onerror=()=>{img.hidden=true;};
      const copy=document.createElement('div');const name=document.createElement('strong');name.textContent=p.name;const price=document.createElement('span');price.className='catalog-price';price.textContent=Number.isFinite(p.price)?'₩'+p.price.toLocaleString('en-US')+(isLiveListing(p)?' · listed':' · reference'):'Price unavailable';
      const label=document.createElement('small');label.className='catalog-choice-label';label.textContent=`${index+1} · ${productLabel(p)}`;
      const actions=document.createElement('div');actions.className='catalog-item-links';
      const details=document.createElement('button');details.type='button';details.textContent='Show details';details.setAttribute('aria-label','Show details for '+p.name);details.onclick=()=>productDetails(p);
      actions.append(details);copy.append(label,name,price,actions);
      const feedback=document.createElement('p');feedback.className='catalog-preview-feedback';feedback.setAttribute('role','status');feedback.hidden=true;copy.append(feedback);
      const button=document.createElement('button');button.type='button';
      const entry={button,product:p,imageUnavailable:false};catalogTryButtons.push(entry);
      button.onclick=async()=>{
        if(!canPreview(p))return;
        if(!['active'].includes(phase)){notice('Wait for the call to connect before trying a product.');return;}
        if(!p.image||entry.imageUnavailable){feedback.textContent='Your camera is on, but this product’s photo is unavailable. Choose another item or show its details.';feedback.hidden=false;return;}
        recommend([p,...choices.filter(item=>item.id!==p.id)],'',{sourceOnly:true,productType:p.productType});selectProduct(p);$('catalog-dialog').close();try{await tryOn(p);}catch(e){notice(e.message);}
      };
      img.onerror=()=>{img.hidden=true;entry.imageUnavailable=true;updateCatalogTryButtons();};row.append(img,copy,button);root.append(row);
    }
    updateCatalogTryButtons();
    if(!$('catalog-dialog').open)$('catalog-dialog').showModal();sync();
  }
  const priceText=p=>Number.isFinite(p.price)?'₩'+p.price.toLocaleString('en-US'):'See price';
  function adoptDiscovery({resetScroll=false}={}){const p=discovery.current;if((trying&&trying.id!==p?.id)||(loadingProductId&&loadingProductId!==p?.id))setMode('none').catch(e=>notice(e.message));store.recommend(p?[p,...discovery.products.slice(0,discovery.products.some(isLiveListing)?15:10).filter(x=>String(x.id)!==String(p.id))]:[]);displayedTotal=discovery.visible.length;renderCard();renderInline();if(resetScroll)$('product-panel-scroll').scrollTop=0;}
  function selectProduct(p){p=trusted(p);if(!p||!discovery.select(p.id))return false;adoptDiscovery();return true;}
  function renderCard(){const p=store.current;show('product-zone',!!p||viewingCollection);$('phone-app').dataset.hasProducts=String(!!p||viewingCollection);show('product-empty',!p&&!viewingCollection);updateFocusUI();if(!p){sync();return;}
    const img=$('product-image');img.hidden=!p.image;img.removeAttribute('src');if(p.image){img.src=p.image;img.alt=p.name;img.onerror=()=>{img.hidden=true;};}
    text('product-title',p.name);text('product-category',discovery.label||typeLabels[p.productType]);
    const price=$('product-price');price.replaceChildren();const amount=document.createElement('span');amount.textContent=priceText(p);const note=document.createElement('small');note.textContent=isLiveListing(p)?'listed price':'reference price';price.append(amount,note);
    const position=discovery.products.findIndex(x=>String(x.id)===String(p.id))+1;text('product-position',`${position} / ${Math.min(discovery.limit,discovery.total)}`);
    text('product-selected-note','Selected · '+(checkedEvidence.get(String(p.id))?.callId===checkedTurnId&&checkedEvidence.get(String(p.id))?.primary?'Recommended':p.brand||typeLabels[p.productType]||'Coupang'));text('product-try',p.preview?.available===false?'No preview':'Try it');$('product-try').disabled=p.preview?.available===false;
    sync();
  }
  function recommendationResult(requested,products=discovery.products){const ids=products.map(product=>String(product.id));return {ok:!requested.length||!!ids.length,product_ids:ids,visible_product_ids:displayedProducts().map(product=>String(product.id)),...(!ids.length&&requested.length?{error:'These listings could not be shown. Please search again; do not claim their product cards are visible.'}:{})};}
  function recommend(list,message,options={}){if(!['connecting','active'].includes(phase))return {ok:false,error:'The shopping call is no longer active.'};discovery.recommend(list,options);catalogType=discovery.productType||catalogType;adoptDiscovery({resetScroll:true});scrollToCollection();if($('catalog-dialog').open)renderCatalog();if(!store.current)toast('No matching listing in this catalog. Try another colour or budget.');if(bridgePanelVisible)showBridgePanel();return recommendationResult(list);}
  function useProfileBag(profileId){if(typeof profileId!=='string'||!profileId||profileId.length>120)return;const key='coupi_call_bag_v1:'+profileId;if(key===bagStorageKey)return;bagStorageKey=key;store.cart.clear();try{const saved=JSON.parse(window.sessionStorage.getItem(key)||'[]');if(Array.isArray(saved))for(const id of saved.slice(0,100)){const p=store.catalog.get(String(id));if(p)store.cart.set(String(id),p);}}catch{}updateBag();}
  function updateBag(){text('cart-count',String(store.cart.size));$('cart-button').setAttribute('aria-label',`Open bag, ${store.cart.size} items`);text('entry-bag',`View bag (${store.cart.size})`);show('entry-bag',store.cart.size>0);try{window.sessionStorage.setItem(bagStorageKey,JSON.stringify([...store.cart.keys()]));}catch{}updateFocusUI();sync();}
  function addToBag(p){p=trusted(p);if(!p)return;store.cart.set(String(p.id),p);updateBag();toast('Selected product added to your bag');}
  function nextStyle(){const previous=store.current;const next=discovery.nextCollection();if(!next.changed){toast('No related collection within these preferences. Ask Coupi for a new direction.');return false;}if(previous)store.skipped.push(String(previous.id));adoptDiscovery({resetScroll:true});if($('catalog-dialog').open)renderCatalog();toast(discovery.label);sync();return true;}
  function productDetails(p=store.current){p=trusted(p);if(!p)return;store.detailProduct=p;text('detail-title',p.name);const img=$('detail-image');img.hidden=!p.image;if(p.image){img.src=p.image;img.alt=p.name;}const attributes=(p.verifiedAttributes||[]).filter(x=>!/^Preview depicts/.test(x)).slice(0,4).join(' · ');const introduction=p.description?.trim()||attributes;const price=Number.isFinite(p.price)?(isLiveListing(p)?'Listed price: ':'Reference price: ')+priceText(p)+'.':'Price unavailable.';text('detail-body',(introduction?introduction+(/[.!?。！？]$/u.test(introduction)?' ':'. '):'')+price);text('detail-preview-note',!p.image?'No preview photo is available for this product.':p.preview?.available===false?previewUnavailable(p):p.preview?.previewNote||(p.category==='makeup'?'Approximate shade preview; lighting and finish vary.':'Placement and fit are approximate.'));$('detail-link').href=p.url;$('detail-try').disabled=(!p.image||p.preview?.available===false);text('detail-try',(!p.image||p.preview?.available===false)?'Preview unavailable':'Try this product');window.CoupiEvidence.renderReviews($('detail-reviews'),p);appendCheckedDetails(p);text('detail-review-shortcut',window.CoupiEvidence.reviewStats(p).label+' ↓');text('detail-compare',discovery.comparison.some(x=>x.id===p.id)?'Remove compare':'Compare');if(!$('details-dialog').open)$('details-dialog').showModal();$('details-dialog').scrollTop=0;sync();}
  function updateCompare(){text('inline-compare-count',String(discovery.comparison.length));$('inline-compare').disabled=discovery.comparison.length<2;text('compare-count',String(discovery.comparison.length));$('compare-open').disabled=discovery.comparison.length<2;sync();}
  function toggleCompare(p){const result=discovery.toggleCompare(p.id);if(!result.ok){toast(result.error);return;}updateCompare();renderInline();if($('catalog-dialog').open)renderCatalog();if($('compare-dialog').open)renderComparison();if(store.detailProduct)text('detail-compare',discovery.comparison.some(x=>x.id===store.detailProduct.id)?'Remove compare':'Compare');}
  function setCollectionView(visible,{resetScroll=false}={}){
    viewingCollection=visible;$('product-zone').dataset.collection=String(visible);$('phone-app').dataset.hasProducts=String(!!store.current||visible);
    show('inline-products',visible);show('product-zone',!!store.current||visible);show('product-empty',!store.current&&!visible&&!!discovery.productType);
    $('group-open').setAttribute('aria-expanded',String(visible));$('catalog-button').setAttribute('aria-expanded',String(visible));
    $('call-screen').scrollTop=0;if(resetScroll)$('product-panel-scroll').scrollTop=0;updateFocusUI();
  }
  function scrollToCollection(){setCollectionView(true);sync();}
  function backToCamera(){hideBridgePanel();setCollectionView(false);sync();}
  function renderInline(){
    const root=$('inline-items'),scroller=$('product-panel-scroll'),position=scroller.scrollTop;root.replaceChildren();
    const label=discovery.label,amount=discovery.visible.length;
    $('inline-products').dataset.theme=discovery.collectionStyle||discovery.theme||discovery.productType||'pink';
    text('inline-title',label);text('inline-scroll-hint',amount?`${amount} picks · scroll ↓`:'Ask Coupi for ideas');text('inline-peek-label',amount?`${amount} picks · ${label}`:'Your picks will appear here');
    const brands=new Set(discovery.visible.map(p=>p.brand).filter(Boolean));
    text('inline-description',brands.size>1?`${amount} similar picks · ${brands.size} brands · tap one to try.`:'A few ideas in the same direction. Pick one to explore.');
    for(const p of discovery.visible){
      const row=document.createElement('article');row.className='inline-item';row.dataset.id=String(p.id);row.dataset.selected=String(String(p.id)===discovery.selectedId);
      const select=document.createElement('button');select.className='inline-item-select';select.setAttribute('aria-label','Select '+p.name);select.setAttribute('aria-pressed',row.dataset.selected);
      const img=document.createElement('img');img.className='inline-item-photo';img.src=p.image;img.alt=p.name;img.loading='lazy';img.onerror=()=>{img.hidden=true;};
      const brand=document.createElement('span');brand.className='inline-item-brand';brand.textContent=p.brand||'COUPANG PICK';
      const name=document.createElement('strong');name.className='inline-item-name';name.textContent=p.name;
      const price=document.createElement('span');price.className='inline-item-price';price.textContent=priceText(p);const ref=document.createElement('small');ref.textContent=isLiveListing(p)?'listed':'reference';price.append(ref);
      const selected=document.createElement('span');selected.className='inline-item-selected';const checked=checkedEvidence.get(String(p.id));selected.textContent=checked?.callId===checkedTurnId&&checked.primary?(row.dataset.selected==='true'?'● Selected · Recommended':'Recommended'):row.dataset.selected==='true'?'● Selected product':'Tap to select';
      select.append(img,brand,name,price,selected);select.onclick=()=>selectProduct(p);
      const actions=document.createElement('div');actions.className='inline-item-actions';
      for(const [label,action] of [['Details',()=>productDetails(p)],['Try on',async()=>{selectProduct(p);closeDialogs();backToCamera();try{await tryOn(p);}catch(error){notice(error.message);}}],['Add to bag',()=>addToBag(p)],['Compare',()=>toggleCompare(p)]]){
        const button=document.createElement('button');button.textContent=label;button.setAttribute('aria-label',label+' — '+p.name);button.onclick=action;
        if(label==='Try on'){button.dataset.primary='true';if(p.preview?.available===false){button.disabled=true;button.textContent='No preview';button.title=p.preview.unavailableReason||'A clean product preview is not available';}}
        if(label==='Compare')button.setAttribute('aria-pressed',String(discovery.comparison.some(x=>x.id===p.id)));actions.append(button);
      }
      row.append(select,actions);root.append(row);
    }
    if(!amount){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='Ask Coupi for something you like, or choose a collection.';root.append(empty);}
    show('inline-more',discovery.hasMore);text('inline-more','View more · '+Math.min(10,discovery.total)+' products');
    text('inline-availability',amount?`${amount} of ${Math.min(10,discovery.total)} sourced picks in this collection.`:'');$('inline-save').disabled=!amount;
    updateCompare();scroller.scrollTop=position;
  }
  function renderCatalog(){
    if($('catalog-dialog').dataset.view==='search')return openSearchCatalog();
    show('catalog-collection-controls',true);
    const root=$('catalog-items'),position=$('catalog-dialog').scrollTop;root.replaceChildren();
    text('catalog-group-label',`${discovery.label} · ${discovery.visible.length} of ${Math.min(10,discovery.total)}`);
    for(const p of discovery.visible){
      const row=document.createElement('article');row.className='discovery-item';row.dataset.selected=String(String(p.id)===discovery.selectedId);
      const select=document.createElement('button');select.className='discovery-select';select.setAttribute('aria-label','Select '+p.name);select.setAttribute('aria-pressed',row.dataset.selected);
      const img=document.createElement('img');img.src=p.image;img.alt=p.name;img.loading='lazy';img.className='discovery-photo';
      const name=document.createElement('strong');name.className='discovery-copy';name.textContent=p.name;const price=document.createElement('span');price.className='discovery-price';price.textContent=priceText(p);const ref=document.createElement('small');ref.textContent='ref.';price.append(ref);
      const badge=document.createElement('span');badge.className='selection-label';badge.textContent=row.dataset.selected==='true'?'● Selected product':'Tap to select';select.append(img,name,price,badge);select.onclick=()=>{selectProduct(p);renderCatalog();};
      const actions=document.createElement('div');actions.className='discovery-actions';
      for(const [label,action] of [['Details',()=>productDetails(p)],['Try it',async()=>{selectProduct(p);closeDialogs();backToCamera();try{await tryOn(p);}catch(e){notice(e.message);}}],['Add to bag',()=>addToBag(p)],['Compare',()=>toggleCompare(p)]]){const button=document.createElement('button');button.textContent=label;button.setAttribute('aria-label',label+' — '+p.name);button.onclick=action;if(label==='Try it'){button.dataset.primary='true';if((!p.image||p.preview?.available===false)){button.disabled=true;button.textContent='No preview';button.title='This listing photo is not suitable for try-on';}}if(label==='Compare')button.setAttribute('aria-pressed',String(discovery.comparison.some(x=>x.id===p.id)));actions.append(button);}
      row.append(select,actions);root.append(row);
    }
    if(!discovery.visible.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='No matching listings in this demo. Try another category or ask Coupi for a new direction.';root.append(empty);}
    show('catalog-more',discovery.hasMore);text('catalog-more','View more · up to '+Math.min(10,discovery.total));
    text('catalog-availability',discovery.total<6?`Showing all ${discovery.total} sourced matches. Try another style for more choices.`:discovery.limit===10||!discovery.hasMore?'All demo picks in this group.':'Six picks to start. Open more when you’re ready.');
    updateCompare();$('catalog-dialog').scrollTop=position;
  }
  function openCatalog(type){hideBridgePanel();
    if($('catalog-dialog').open)$('catalog-dialog').close();$('catalog-dialog').dataset.view='collection';
    if(type&&Object.hasOwn(typeLabels,type)){catalogType=type;discovery.recommend([...store.catalog.values()].filter(p=>p.productType===type),{productType:type,theme:type==='glasses'?'optical':'',collectionStyle:type==='tshirt'?'basic':'',maxPrice:discovery.maxPrice});adoptDiscovery({resetScroll:true});}
    else if(!discovery.products.length&&!discovery.productType){if(catalogType==='recommended')catalogType='lipstick';discovery.recommend([...store.catalog.values()].filter(p=>p.productType===catalogType),{productType:catalogType,maxPrice:discovery.maxPrice});adoptDiscovery({resetScroll:true});}
    renderCatalog();renderInline();scrollToCollection();sync();
  }
  function saveGroup(){const result=discovery.saveCollection();toast(!result?'Choose a group first':result.persisted?'Collection saved':'Collection saved for this visit; browser storage is unavailable');}
  function openCollections(){const root=$('collection-items');root.replaceChildren();for(const saved of discovery.collections){const row=document.createElement('article');row.className='collection-item';const title=document.createElement('h3');title.textContent=saved.name;const meta=document.createElement('p');meta.textContent=saved.productCount+' products';const images=document.createElement('div');images.className='collection-pictures';for(const p of saved.products.slice(0,4)){const img=document.createElement('img');img.src=p.image;img.alt=p.name;images.append(img);}const actions=document.createElement('div');actions.className='collection-actions';const open=document.createElement('button');open.textContent='Open collection';open.onclick=()=>{discovery.restoreCollection(saved.id);catalogType=discovery.productType;adoptDiscovery({resetScroll:true});$('collections-dialog').close();openCatalog();};const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>{discovery.removeCollection(saved.id);openCollections();};actions.append(open,remove);row.append(title,meta,images,actions);root.append(row);}if(!discovery.collections.length){const p=document.createElement('p');p.className='empty-state';p.textContent='Save a collection, then come back to it anytime.';root.append(p);}if(!$('collections-dialog').open)$('collections-dialog').showModal();}
  function renderComparison(){window.CoupiEvidence.renderComparison($('compare-table'),discovery.comparison,{onTry:async p=>{if(!discovery.products.some(x=>x.id===p.id))discovery.recommend([p],{productType:p.productType});selectProduct(p);closeDialogs();backToCamera();try{await tryOn(p);}catch(e){notice(e.message);}},onDetails:p=>productDetails(p),onRemove:p=>{toggleCompare(p);if(discovery.comparison.length<2){$('compare-dialog').close();toast('Choose at least two products to compare');}}});}
  function openComparison(){if(discovery.comparison.length<2){toast('Choose two or three products first');return;}renderComparison();if(!$('compare-dialog').open)$('compare-dialog').showModal();sync();}
  function compareProducts(productIds){
    if(phase!=='active')return {ok:false,error:'Start a call before comparing products.'};
    if(!Array.isArray(productIds)||productIds.length<2||productIds.length>3||new Set(productIds).size!==productIds.length||productIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id)))return {ok:false,error:'Choose two or three different products to compare.'};
    const available=new Map([...displayedProducts(),...store.queue,...discovery.comparison,...store.cart.values(),...($('details-dialog').open&&store.detailProduct?[store.detailProduct]:[])].map(product=>[String(product.id),trusted(product)]));
    const products=productIds.map(id=>available.get(id));
    if(products.some(product=>!product))return {ok:false,error:'Choose products from the current list, details, comparison or bag.'};
    // Validate every ID before changing the current comparison or closing details.
    discovery.compareIds=[...productIds];
    for(const id of ['cart-dialog','details-dialog','catalog-dialog','collections-dialog','chat-history-dialog','checkout-dialog'])if($(id).open)$(id).close();
    updateCompare();renderInline();openComparison();
    return {ok:true,comparison_opened:true,product_ids:[...productIds],products,purchased:false};
  }
  function clearAttachment(){preparingImage=false;choosingImage=false;clearTimeout(pickerTimer);attachmentEpoch++;attachment=null;$('chat-image-file').value='';$('attachment-image').removeAttribute('src');show('attachment-preview',false);show('attachment-status',false);$('chat-send').disabled=!voice?.call?.ready||sendingImage;}
  async function prepareAttachment(){choosingImage=false;clearTimeout(pickerTimer);const file=$('chat-image-file').files?.[0];if(!file)return;const epoch=++attachmentEpoch;preparingImage=true;attachment=null;show('attachment-preview',false);$('chat-send').disabled=true;text('attachment-status','Preparing photo…');show('attachment-status',true);try{const result=await window.CoupiChatImages.prepare(file);if(epoch!==attachmentEpoch)return;attachment=result;$('attachment-image').src=result.dataUrl;text('attachment-name',result.name);show('attachment-preview',true);text('attachment-status','Photo ready. Send to share with Coupi.');}catch(e){if(epoch===attachmentEpoch){attachment=null;show('attachment-preview',false);text('attachment-status',e.message);}}finally{if(epoch===attachmentEpoch){preparingImage=false;$('chat-send').disabled=!voice?.call?.ready||sendingImage;}}}
  async function sendMessage(event){event.preventDefault();if(sendingImage||preparingImage)return;const value=$('text-input').value,selected=attachment,token=generation;if(!voice.call?.ready){text('attachment-status','Start a call or chat to send your message.');show('attachment-status',true);return;}try{if(selected){sendingImage=true;$('chat-send').disabled=true;text('attachment-status','Sending photo…');show('attachment-status',true);await voice.sendImage({...selected,text:value});if(token!==generation)return;if(attachment===selected)clearAttachment();}else if(!voice.sendText(value))return;if($('text-input').value===value)$('text-input').value='';}catch(e){if(token===generation){text('attachment-status',e.message);show('attachment-status',true);}}finally{sendingImage=false;$('chat-send').disabled=!voice.call?.ready||preparingImage;}}
  function openBag(){const root=$('cart-items');root.replaceChildren();if(!store.cart.size){const p=document.createElement('p');p.textContent='Add a product to keep it in your bag.';root.append(p);}for(const p of store.cart.values()){const row=document.createElement('div');row.className='bag-item';const title=document.createElement('strong');title.textContent=p.name;const controls=document.createElement('div');const link=document.createElement('button');link.textContent='Show details';link.onclick=()=>productDetails(p);const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>{store.cart.delete(String(p.id));updateBag();openBag();};controls.append(link,remove);row.append(title,controls);root.append(row);}$('cart-checkout').disabled=!store.cart.size;if(!$('cart-dialog').open)$('cart-dialog').showModal();sync();}
  function closeDialogs(){for(const id of ['cart-dialog','details-dialog','catalog-dialog','collections-dialog','compare-dialog','chat-history-dialog','checkout-dialog','personalization-dialog'])if($(id).open)$(id).close();}
  $('detail-review-shortcut').onclick=()=>$('detail-reviews').scrollIntoView({behavior:'smooth',block:'start'});
  const money=value=>Number.isFinite(value)?'₩'+value.toLocaleString('en-US'):'Unavailable';
  let completedReceipt=null,lastPurchase=null,purchasePairings=[];
  function checkoutAction(action){show('checkout-error',false);try{action();renderCheckout();}catch(error){text('checkout-error',error.message);show('checkout-error',true);}}
  function openCheckout({scope='selected',productIds=[]}={}){
    if(!['active','incoming','ended'].includes(phase))throw Error('Wait for the call to connect before checkout.');
    if($('checkout-dialog').open&&checkout.snapshot().step!=='complete')throw Error('A checkout is already open. Review it or close it before choosing new items.');
    let products;
    if(scope==='selected')products=[$('details-dialog').open?store.detailProduct:store.current].filter(Boolean);
    else if(scope==='cart')products=[...store.cart.values()];
    else if(scope==='comparison'){
      if(!$('compare-dialog').open||discovery.comparison.length<2)throw Error('Open the comparison first or ask which products the shopper wants.');
      products=discovery.comparison;
    }else if(scope==='products'){
      if(!Array.isArray(productIds)||!productIds.length||productIds.length>10)throw Error('Choose between one and ten exact product IDs.');
      const visible=new Map([...displayedProducts(),...store.queue,...discovery.visible,...discovery.comparison,...purchasePairings,...store.cart.values(),...($('details-dialog').open&&store.detailProduct?[store.detailProduct]:[])].map(p=>[String(p.id),p]));
      products=productIds.map(id=>{if(typeof id!=='string'||!visible.has(id))throw Error('That product is not in the current picks or bag. Ask which products to buy.');return visible.get(id);});
    }else throw Error('Choose the selected product, comparison, exact products, or cart.');
    if(!products.length)throw Error(scope==='cart'?'Your bag is empty. Add a product first.':'Choose a product first.');
    closeDialogs();checkout.updateCatalog([...store.catalog.values()]);checkout.start(products,{source:scope});completedReceipt=null;renderCheckout();$('checkout-dialog').showModal();$('checkout-dialog').scrollTop=0;sync();
    const q=checkout.snapshot();return {ok:true,review_opened:true,demo:true,payment_processed:false,order_placed:false,item_ids:q.selectedItems.map(i=>i.id),reference_total:q.referenceTotal};
  }
  function checkoutButton(request){try{openCheckout(request);}catch(error){toast(error.message);}}
  function checkoutSummary(root,items){root.replaceChildren();for(const item of items){const row=document.createElement('div');row.className='checkout-payment-row';const name=document.createElement('span');name.textContent=item.product.name+' × '+item.quantity;const price=document.createElement('span');price.textContent=money(item.lineTotal);row.append(name,price);root.append(row);}}
  function renderPurchasePairings(){
    const root=$('checkout-pairing-items');root.replaceChildren();show('checkout-pairings',purchasePairings.length>0);
    for(const p of purchasePairings){
      const button=document.createElement('button');button.className='checkout-pairing';button.dataset.id=p.id;button.setAttribute('aria-label','Explore '+p.name);
      const img=document.createElement('img');img.src=p.image;img.alt='';
      const copy=document.createElement('span');const name=document.createElement('strong');name.textContent=p.name;const price=document.createElement('small');price.textContent=money(p.price);copy.append(name,price);
      const arrow=document.createElement('span');arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');button.append(img,copy,arrow);
      button.onclick=()=>{closeDialogs();recommend([p],'',{productType:p.productType,category:p.category});selectProduct(p);productDetails(p);};root.append(button);
    }
  }
  function renderCheckout(){
    const q=checkout.snapshot();show('checkout-review',q.step==='review');show('checkout-payment',q.step==='payment');show('checkout-complete',q.step==='complete');show('checkout-error',false);
    for(const step of ['review','payment','complete']){const el=$('checkout-step-'+step);if(q.step===step)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');}
    text('checkout-title',q.step==='complete'?'Purchase complete.':q.step==='payment'?'A tap away.':'Your good finds.');
    text('checkout-subtitle',q.step==='complete'?'Thank you for shopping with Coupi.':q.step==='payment'?'Choose how you’d like to pay.':'Choose what comes with you.');
    if(q.step==='review'){
      const root=$('checkout-items');root.replaceChildren();
      for(const item of q.items){
        const row=document.createElement('article');row.className='checkout-item';row.dataset.id=item.id;row.dataset.included=String(item.included);
        const check=document.createElement('input');check.type='checkbox';check.checked=item.included;check.setAttribute('aria-label','Include '+item.product.name);check.onchange=()=>checkoutAction(()=>checkout.toggle(item.id,check.checked));
        const img=document.createElement('img');img.src=item.product.image;img.alt='';
        const copy=document.createElement('div');copy.className='checkout-item-copy';const name=document.createElement('strong');name.textContent=item.product.name;const price=document.createElement('small');price.textContent=money(item.lineTotal);
        const quantity=document.createElement('div');quantity.className='checkout-quantity';const minus=document.createElement('button');minus.textContent='−';minus.disabled=item.quantity<=1;minus.setAttribute('aria-label','Decrease quantity — '+item.product.name);minus.onclick=()=>checkoutAction(()=>checkout.setQuantity(item.id,item.quantity-1));
        const count=document.createElement('span');count.textContent=String(item.quantity);count.setAttribute('aria-label','Quantity '+item.quantity);const plus=document.createElement('button');plus.textContent='+';plus.disabled=item.quantity>=9;plus.setAttribute('aria-label','Increase quantity — '+item.product.name);plus.onclick=()=>checkoutAction(()=>checkout.setQuantity(item.id,item.quantity+1));quantity.append(minus,count,plus);copy.append(name,price,quantity);
        const remove=document.createElement('button');remove.className='checkout-item-remove';remove.textContent='×';remove.setAttribute('aria-label','Remove from checkout — '+item.product.name);remove.onclick=()=>checkoutAction(()=>checkout.remove(item.id));row.append(check,img,copy,remove);root.append(row);
      }
      if(!q.items.length){const empty=document.createElement('p');empty.className='checkout-empty';empty.textContent='No products here yet. Close checkout to keep exploring.';root.append(empty);}
      text('checkout-count',q.totalQuantity+' '+(q.totalQuantity===1?'item':'items')+' selected');text('checkout-total',money(q.referenceTotal));$('checkout-next').disabled=!q.canContinue;
      text('checkout-price-note',q.referenceTotal===null?'A selected item has no valid reference price. Deselect it to continue.':'Prices reflect the saved product listings.');
    }
    if(q.step==='payment'){
      checkoutSummary($('checkout-payment-items'),q.selectedItems);text('checkout-payment-total',money(q.referenceTotal));
      $('checkout-card').setAttribute('aria-pressed',String(q.paymentMethod==='demo-card'));$('checkout-wallet').setAttribute('aria-pressed',String(q.paymentMethod==='demo-wallet'));text('checkout-confirm','Pay '+money(q.referenceTotal));
    }
    if(q.step==='complete'){
      const receipt=q.receipt;text('checkout-receipt',receipt.id.replace(/^DEMO-/, 'CP-'));text('checkout-receipt-total',money(receipt.referenceTotal));checkoutSummary($('checkout-receipt-items'),receipt.items);
      renderPurchasePairings();
      const links=$('checkout-retailer-links');links.replaceChildren();for(const item of receipt.items){const link=document.createElement('a');link.href=item.product.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=item.product.name+' · Coupang ↗';links.append(link);}
    }
    sync();
  }
  $('product-buy').onclick=()=>checkoutButton({scope:'selected'});$('detail-buy').onclick=()=>checkoutButton({scope:'selected'});$('compare-buy').onclick=()=>checkoutButton({scope:'comparison'});$('cart-checkout').onclick=()=>checkoutButton({scope:'cart'});
  $('checkout-next').onclick=()=>checkoutAction(()=>{checkout.next();$('checkout-dialog').scrollTop=0;});$('checkout-back').onclick=()=>checkoutAction(()=>checkout.back());
  $('checkout-card').onclick=()=>checkoutAction(()=>checkout.selectPayment('demo-card'));$('checkout-wallet').onclick=()=>checkoutAction(()=>checkout.selectPayment('demo-wallet'));
  $('checkout-confirm').onclick=()=>checkoutAction(()=>{const receipt=checkout.confirm();if(receipt.id!==completedReceipt){completedReceipt=receipt.id;lastPurchase=receipt;bridge.checkoutComplete?.(receipt);purchasePairings=window.CoupiPairings.select([...store.catalog.values()],receipt.item_ids,{maxPrice:discovery.maxPrice,excludedTypes:discovery.constraints.types.exclude});for(const id of receipt.item_ids)store.cart.delete(id);updateBag();try{voice.notifyCheckoutComplete(receipt,purchasePairings);}catch{toast('Purchase complete. Explore your matching picks below.');}}$('checkout-dialog').scrollTop=0;});
  $('close-checkout').onclick=()=>$('checkout-dialog').close();$('checkout-done').onclick=()=>$('checkout-dialog').close();
  $('checkout-dialog').addEventListener('close',()=>{if(!$('checkout-dialog').open)checkout.cancel();sync();});
  async function productAction(action,productId){const p=productId?[...displayedProducts(),...store.queue,...discovery.comparison,...purchasePairings,...store.cart.values(),...(store.detailProduct?[store.detailProduct]:[])].find(p=>String(p.id)===String(productId)):store.current;if(!p)throw Error('That product is not in the current picks, comparison, details or bag. Search first.');if(action==='try_on'&&p.preview?.available===false)return previewFailure(p);if(productId&&store.current?.id!==p.id&&discovery.products.some(x=>x.id===p.id))selectProduct(p);if($('checkout-dialog').open&&checkout.snapshot().step==='complete')$('checkout-dialog').close();if(action==='save')addToBag(p);else if(action==='skip'){if(!nextStyle())return {ok:false,action,error:'No different collection matches these preferences. Ask for a new colour or product type.'};closeDialogs();hideBridgePanel();scrollToCollection();return {ok:true,action,product:store.current,products:discovery.visible,visible_product_ids:discovery.visible.map(product=>String(product.id)),cart_count:store.cart.size,purchased:false};}else if(action==='try_on'){if(!discovery.products.some(item=>item.id===p.id))recommend([p],'',{productType:p.productType,category:p.category});selectProduct(p);closeDialogs();backToCamera();if(!(await tryOn(p))?.ok)throw Error('The product preview was cancelled.');}else if(action==='details'||action==='browse')productDetails(p);else throw Error('Unsupported product action.');return {ok:true,action,product:p,cart_count:store.cart.size,purchased:false,preview_is_approximate:true,...(action==='try_on'?{preview_kind:previewMeta?.kind,shade_estimated:previewMeta?.shadeEstimated}:{} )};}

  $('personalization-skip').onclick=async()=>{const token=generation,button=$('personalization-skip');button.disabled=true;const pending=personalization.skip();sync();voice.skipPersonalization();try{const result=await pending;if(token===generation&&!result.ok)notice(result.error||'Could not skip. Please try again.');}finally{if(token===generation)button.disabled=false;}};
  $('entry-camera').onclick=()=>{entryCameraWanted=!entryCameraWanted;selectEntry();};
  $('entry-mic').onclick=()=>{entryInputMode=entryInputMode==='voice'?'text':'voice';selectEntry();};
  $('entry-chat').onclick=()=>answer('text');
  $('answer-call').onclick=()=>answer();$('update-preferences').onclick=()=>bridge.exit();$('call-again').onclick=()=>{screen('incoming');selectEntry();personalization.render();};$('end-call').onclick=()=>endCall();
  $('mute-call').onclick=()=>inputMode==='text'?switchInput('voice'):voice.mute();$('text-toggle').onclick=()=>switchInput('text');$('text-form').onsubmit=sendMessage;
  $('chat-attach').onclick=()=>{choosingImage=true;clearTimeout(pickerTimer);pickerTimer=setTimeout(()=>{choosingImage=false;if(document.hidden&&phase==='active')endCall('Call paused while you were away. Tap to call again.');},60000);$('chat-image-file').click();};$('chat-image-file').addEventListener('cancel',()=>{choosingImage=false;clearTimeout(pickerTimer);});$('chat-image-file').onchange=prepareAttachment;$('attachment-remove').onclick=clearAttachment;
  $('chat-minimize').onclick=()=>{const collapsed=$('conversation-box').dataset.collapsed!=='true';$('conversation-box').dataset.collapsed=String(collapsed);$('chat-minimize').setAttribute('aria-expanded',String(!collapsed));$('chat-minimize').setAttribute('aria-label',collapsed?'Show conversation':'Minimize conversation');text('chat-minimize',collapsed?'⌃':'⌄');if(collapsed){const body=$('caption-text');body.scrollTop=body.scrollHeight;}};
  $('chat-history-open').onclick=()=>{$('chat-history-dialog').showModal();conversation.openHistory();};$('close-chat-history').onclick=()=>$('chat-history-dialog').close();
  $('group-open').onclick=()=>openCatalog();$('save-group').onclick=saveGroup;$('catalog-save-group').onclick=saveGroup;$('catalog-more').onclick=()=>{discovery.viewMore();adoptDiscovery();renderCatalog();};$('catalog-next-style').onclick=nextStyle;
  $('inline-peek').onclick=()=>openCatalog();$('back-camera').onclick=backToCamera;
  $('inline-save').onclick=saveGroup;$('inline-saved').onclick=openCollections;$('inline-more').onclick=()=>{discovery.viewMore();adoptDiscovery();};$('inline-next').onclick=()=>{if(nextStyle())scrollToCollection();};$('inline-compare').onclick=openComparison;
  $('inline-mute').onclick=()=>voice.mute();$('inline-end').onclick=()=>endCall();
  $('collections-button').onclick=openCollections;$('close-collections').onclick=()=>$('collections-dialog').close();
  $('compare-open').onclick=openComparison;$('close-compare').onclick=()=>$('compare-dialog').close();$('compare-clear').onclick=()=>{discovery.clearCompare();updateCompare();$('compare-dialog').close();renderCatalog();renderInline();};
  $('compare-ask').onclick=()=>{const ids=discovery.comparison.map(p=>p.id).join(', ');if(!sendAppPrompt('Compare my selected catalog products (IDs: '+ids+'). Get the verified details for each, explain the meaningful differences in price, variant and sourced review evidence, and ask which factor matters most to me. Missing facts are unverified.'))toast('Start the call to ask Coupi.');else closeDialogs();};
  $('detail-compare').onclick=()=>{if(store.detailProduct)toggleCompare(store.detailProduct);};$('detail-add').onclick=()=>addToBag(store.detailProduct);$('detail-try').onclick=async()=>{const p=store.detailProduct;if(!p)return;if(!discovery.products.some(x=>x.id===p.id))discovery.recommend([p],{productType:p.productType});selectProduct(p);closeDialogs();backToCamera();try{await tryOn(p);}catch(e){notice(e.message);}};
  $('play-audio').onclick=()=>voice.resumeAudio().catch(()=>notice('Tap again to enable speaker audio.'));
  $('retry-call').onclick=async()=>{text('retry-call','Retry');if(voice.call?.ready){if(entryCameraWanted)await startCamera();else notice('');return;}voice.end();screen('incoming');answer();};
  $('toggle-camera').onclick=async()=>{if(cameraBusy||formatBusy)return;if(camera.running){entryCameraWanted=false;camera.stop(false);await setMode('none');cameraUI();}else{entryCameraWanted=true;await startCamera();}selectEntry();};
  $('flip-camera').onclick=async()=>{if(cameraBusy||!camera.running)return;const token=generation,previous=facingMode;facingMode=previous==='user'?'environment':'user';const ok=await startCamera({strictFacing:true});if(token!==generation)return;if(!ok){facingMode=previous;const restored=await startCamera();if(token!==generation)return;notice(restored?'This device has no available camera on the other side. Your original camera is still on.':'The other camera is unavailable. Tap Camera to reconnect.',!restored);}else{notice('');toast(facingMode==='environment'?'Back camera':'Front camera');}};
  $('focus-add').onclick=()=>addToBag(trying||store.current);$('entry-bag').onclick=openBag;
  $('focus-toggle').onclick=()=>{controlsExpanded=!controlsExpanded;updateFocusUI();};
  $('focus-product').onclick=()=>openCatalog();
  $('vision-consent').onchange=()=>{visionWanted=$('vision-consent').checked;selectEntry();updateVisionUI();updateFocusUI();};
  $('clear-tryon').onclick=()=>setMode('none');$('product-try').onclick=()=>tryOn().catch(e=>notice(e.message));$('product-details').onclick=()=>productDetails();$('product-skip').onclick=()=>{if(phase==='active')nextStyle();};$('product-save').onclick=()=>{if(phase==='active')addToBag(store.current);};$('cart-button').onclick=openBag;$('close-cart').onclick=()=>$('cart-dialog').close();$('close-details').onclick=()=>$('details-dialog').close();
  $('catalog-button').onclick=()=>openCatalog();$('close-catalog').onclick=()=>$('catalog-dialog').close();text('catalog-button','Products');$('catalog-search-open').onclick=()=>openSearchCatalog('recommended');updateCompare();
  async function searchProducts(search,excluded=[]){
    searchController?.abort();const controller=new AbortController();searchController=controller;const token=generation;
    lastSearch=search;lastSearchMessage='';lastSearchStatus=null;excludedProductIds=excluded;visibleChoices=[];recommendedProducts=[];recommendationsReceived=true;
    const timeout=setTimeout(()=>controller.abort(),60000);
    $('catalog-search-submit').disabled=true;$('catalog-refresh').disabled=true;show('catalog-refresh',true);show('catalog-match-note',false);
    text('catalog-summary',excluded.length?'Finding different matching products…':'Searching Coupang for 10 matching choices…');$('catalog-items').replaceChildren();
    try{
      let memories=[];
      try{const storage=window.localStorage;if(storage.getItem('coupi_memory_paused')!=='1'){const stored=JSON.parse(storage.getItem('coupi_memory')||'[]');if(Array.isArray(stored))memories=stored.filter(m=>m&&typeof m.text==='string').slice(-20).map(m=>m.text.slice(0,400));}}catch{/* No preferences when storage is unavailable. */}
      const response=await window.fetch('/api/products/search',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:search.query,category:search.category||'all',max_price:search.max_price??null,memories,exclude_ids:excluded,limit:10}),signal:controller.signal});
      const result=await response.json();
      if(!response.ok)throw Error(typeof result.error==='string'?result.error:'Product search is unavailable. Try again.');
      if(!Array.isArray(result.products))throw Error('Product search returned an invalid result.');
      if(token===generation&&searchController===controller){receiveRecommendations(result.products,result.message,result.search||search,excluded,result.retrieval_status,result.search_url);if(excluded.length)$('catalog-refresh').focus();}
    }catch(error){if(token===generation&&searchController===controller){text('catalog-summary',error.name==='AbortError'?'Search timed out. Try again.':error.message);show('catalog-refresh',true);text('catalog-refresh','Retry search');}}
    finally{clearTimeout(timeout);if(searchController===controller){searchController=null;$('catalog-search-submit').disabled=false;$('catalog-refresh').disabled=false;}}
  }
  $('catalog-search-form').onsubmit=event=>{
    event.preventDefault();const query=$('catalog-search-input').value.trim();if(!query)return;
    return searchProducts({query,category:'all',max_price:null});
  };
  $('catalog-refresh').onclick=()=>{
    if(searchController)return;
    const excluded=[...new Set([...excludedProductIds,...visibleChoices.map(p=>String(p.id))])];
    if(excluded.length>150){text('catalog-summary','You have explored many products. Change your search to start a new list.');return;}
    const search=lastSearch || {query:catalogType==='recommended'?'lipstick chairs desk lamps T-shirts hoodies glasses':typeLabels[catalogType],category:catalogType==='glasses'?catalogType:'all',max_price:null};
    return searchProducts(search,excluded);
  };
  $('detail-ask').onclick=()=>{const p=store.detailProduct;$('details-dialog').close();if(voice.call?.ready&&p)voice.sendText('Tell me briefly about this Coupang product: '+p.name+' (ID '+p.id+'). Use its verified details and explain why it might suit me.');else toast('Start the call to ask Coupi.');};
  $('live-canvas').addEventListener('pointerdown',e=>{if(mode!=='desk'||!camera.running)return;const r=e.currentTarget.getBoundingClientRect(),ratio=camera.canvas.width/camera.canvas.height;let w=r.width,h=w/ratio;if(h<r.height){h=r.height;w=h*ratio;}camera.setOptions({x:Math.max(0,Math.min(1,(e.clientX-r.left+(w-r.width)/2)/w)),y:Math.max(0,Math.min(1,(e.clientY-r.top+(h-r.height)/2)/h))});sync();});
  function checkedNode(tag,className,value){const node=document.createElement(tag);node.className=className;if(value!==undefined)node.textContent=value;return node;}
  function checkedOpen(skuId,callId,reviewId,label){
    const button=checkedNode('button','checked-action',label||'Details');
    button.setAttribute('aria-label',reviewId?'Read review '+reviewId:'Details for '+skuId);
    button.onclick=async()=>{button.disabled=true;try{const result=await bridge.openWorldProduct(skuId,{callId,reviewId});if(!result.ok)notice(result.error);}catch{notice('That product could not open. Please try again.');}finally{button.disabled=false;}};return button;
  }
  function checkedCard(product,result,id,primary){
    const card=checkedNode('article','checked-product'+(primary?' checked-product-primary':''));
    if(product.image){const image=checkedNode('img','checked-image');image.src=product.image;image.alt='';image.onerror=()=>{image.hidden=true;};card.append(image);}
    card.append(checkedNode('h2','checked-name',product.name),checkedNode('p','checked-price',product.price===null?'Price unavailable':'₩'+product.price.toLocaleString('en-US')));
    if(product.priceBasis==='historical-reference')card.append(checkedNode('p','checked-note','REFERENCE PRICE · confirm current price on Coupang'));
    if(product.delivery)card.append(checkedNode('p','checked-note',product.delivery));
    if(primary&&result.verdict){
      const details=checkedNode('details','checked-explanation');details.append(checkedNode('summary','','Why this product'));
      if(result.verdict.reason)details.append(checkedNode('p','checked-reason',result.verdict.reason));
      if(result.verdict.dissent)details.append(checkedNode('p','checked-dissent',result.verdict.dissent));
      const citations=checkedNode('div','checked-citations');
      for(const [index,reviewId] of result.verdict.citations.entries())citations.append(checkedOpen(product.skuId,id,reviewId,'review '+(index+1)+' ↗'));
      if(citations.children.length)details.append(citations);
      if(details.children.length>1)card.append(details);
    }
    card.append(checkedOpen(product.skuId,id));return card;
  }
  function appendCheckedDetails(product){
    const evidence=checkedEvidence.get(String(product.id));if(!evidence)return;
    const section=checkedNode('section','checked-product'),result=evidence.result;
    section.append(checkedNode('h3','checked-name','Why Coupi suggested this'));
    if(evidence.primary&&result.verdict){
      if(result.verdict.reason)section.append(checkedNode('p','checked-reason',result.verdict.reason));
      if(result.verdict.dissent)section.append(checkedNode('p','checked-dissent',result.verdict.dissent));
      const citations=checkedNode('div','checked-citations');
      for(const [index,reviewId] of result.verdict.citations.entries())citations.append(checkedOpen(String(product.id),evidence.callId,reviewId,'Review '+(index+1)+' ↗'));
      if(citations.children.length)section.append(citations);
    }else if(result.verdict?.runnerUpSkuId===String(product.id)&&result.verdict.whyRunnerUpLost)section.append(checkedNode('p','checked-reason',result.verdict.whyRunnerUpLost));
    else if(result.message)section.append(checkedNode('p','checked-reason',result.message));
    if(result.inventory){const list=checkedNode('ul','checked-inventory');for(const item of result.inventory.items)list.append(checkedNode('li','',item.name+(item.quantity?' · '+item.quantity:'')+' — '+item.status));section.append(list);for(const gap of result.inventory.lowOrMissing)section.append(checkedNode('p','checked-gap',gap.name+' · '+gap.reason));for(const uncertain of result.inventory.uncertainties)section.append(checkedNode('p','checked-note',uncertain));}
    $('detail-body').append(section);
  }
  function displayCheckedCatalog(result,callId){
    if(result.status!=='ok')return false;
    const pick=result.verdict?.pickSkuId,allowed=new Set([pick,result.verdict?.runnerUpSkuId,...result.proposedSkuIds].filter(Boolean));
    const candidates=result.products.filter(product=>allowed.has(product.skuId));
    // Exact approved IDs unlock local media. A world-only or mixed result keeps its checked world flow.
    if(!candidates.length||candidates.some(product=>!approvedCatalog.has(String(product.skuId))))return false;
    const seeds=candidates.map(product=>approvedCatalog.get(String(product.skuId))).sort((a,b)=>(String(b.id)===pick?1:0)-(String(a.id)===pick?1:0));
    for(const product of seeds){store.catalog.set(String(product.id),product);discovery.catalog.set(String(product.id),product);checkedEvidence.set(String(product.id),{callId,result,primary:String(product.id)===pick});}
    const query=checkedQueries.get(callId)||'',first=seeds[0],probe=new window.CoupiDiscovery([...approvedCatalog.values()],{storage:null});
    const sameType=seeds.every(product=>product.productType===first.productType);
    let options={mixed:true,sourceOnly:true,groupLabel:'Your picks'},related=seeds;
    if(sameType){probe.recommend(seeds,{query,productType:first.productType,category:first.category});if(probe.products.some(product=>String(product.id)===String(first.id))){options={query,productType:first.productType,category:first.category,sourceOnly:true};related=probe.products;}}
    for(const product of related){store.catalog.set(String(product.id),product);discovery.catalog.set(String(product.id),product);}
    hideBridgePanel();recommend(related,result.message,options);
    // The winner is checked; extra rows are sourced alternatives from the existing constrained catalog.
    if(related.length>seeds.length)text('inline-description','Compare these picks or try one on.');
    if($('details-dialog').open&&store.detailProduct)productDetails(store.detailProduct);
    return true;
  }
  bridge.subscribe(event=>{
    if(event.state==='personalization-context'){useProfileBag(event.context?.profileId);return;}
    if(!['active','connecting'].includes(phase))return;
    const root=$('validated-call-content');
    if(event.state==='pending'){
      checkedTurnId=event.id;if(!checkedQueries.has(event.id))checkedQueries.set(event.id,checkedRequestText);if(checkedQueries.size>24)checkedQueries.delete(checkedQueries.keys().next().value);
      // Keep the current product or preview in place while the next answer arrives.
      $('validated-call').dataset.state='pending';notice('');text('call-status','Thinking…');if(event.retry)voice.resolveAppTurn?.();return;
    }
    if(event.id!==checkedTurnId)return;
    const result=event.result;root.replaceChildren();$('validated-call').dataset.state=event.state;text('call-status',inputMode==='text'?'Chat with Coupi':'Live with Coupi');
    if(event.state==='error'){hideBridgePanel();show('product-zone',!!store.current||viewingCollection);notice((event.error||result.message||'Please try again.').slice(0,180));return;}
    interviewContext={answeredCount:result.interviewCount||0,nextQuestion:result.question||'',complete:result.interviewComplete===true,paused:result.conversationMode==='request',conversationMode:result.conversationMode,worldReady:result.worldReady===true};sync();
    if(displayCheckedCatalog(result,event.id))return;
    if(result.status!=='ok'){hideBridgePanel();show('product-zone',!!store.current||viewingCollection);notice((result.message||'Please try another request.').slice(0,180));return;}
    const pick=result.verdict?.pickSkuId,products=[...result.products].filter(product=>product.skuId===pick||product.skuId===result.verdict?.runnerUpSkuId||result.proposedSkuIds.includes(product.skuId)).sort((a,b)=>(b.skuId===pick?1:0)-(a.skuId===pick?1:0));
    if(!products.length&&!result.inventory){hideBridgePanel();show('product-zone',!!store.current||viewingCollection);return;}
    show('validated-call',true);show('world-picks',false);showBridgePanel();text('validated-call-status',products.length?'Your picks':'Your space');
    if(result.inventory){
      const details=checkedNode('details','checked-explanation');details.append(checkedNode('summary','','Items in your photo'));
      const list=checkedNode('ul','checked-inventory');for(const item of result.inventory.items)list.append(checkedNode('li','',item.name+(item.quantity?' · '+item.quantity:'')+' — '+item.status));details.append(list);
      for(const gap of result.inventory.lowOrMissing)details.append(checkedNode('p','checked-gap',gap.name+' · '+gap.reason));
      for(const uncertain of result.inventory.uncertainties)details.append(checkedNode('p','checked-note',uncertain));root.append(details);
    }
    for(const product of products)root.append(checkedCard(product,result,event.id,product.skuId===pick));
  });
  function worldRecommendations(list,message){
    if(!['connecting','active'].includes(phase))return;
    const root=$('world-picks-list');root.replaceChildren();
    for(const product of list.slice(0,10)){
      if(product.catalog_namespace!=='world-simulation'||typeof product.skuId!=='string'||typeof product.name!=='string')continue;
      const row=document.createElement('div');row.className='world-pick';
      const copy=document.createElement('div'),name=document.createElement('strong'),price=document.createElement('span');
      name.textContent=product.name;price.textContent=Number.isFinite(product.price)?'₩'+product.price.toLocaleString('en-US'):'';copy.append(name,price);
      const button=document.createElement('button');button.textContent='Details ↗';button.onclick=async()=>{button.disabled=true;try{const result=await bridge.openWorldProduct(product.skuId);if(!result.ok)notice(result.error);}catch{notice('That product could not open. Please try again.');}finally{button.disabled=false;}};
      row.append(copy,button);root.append(row);
    }
    show('validated-call',false);show('world-picks',root.children.length>0);if(root.children.length)showBridgePanel();
    if(!root.children.length)toast(message||'No match in your world catalog.');
  }

  window.addEventListener('message',event=>{
    if(event.origin!==window.location.origin||event.source!==window.parent)return;
    if(event.data?.type==='coupi-live-call-open'&&phase==='ended')screen('incoming');
    if(event.data?.type!=='coupi-interview-progress')return;const value=event.data;
    if(!Number.isInteger(value.count)||value.count<0||value.count>5)return;
    interviewContext={answeredCount:value.count,nextQuestion:String(value.question||'').slice(0,250),complete:value.complete===true,paused:value.paused===true,conversationMode:value.conversationMode||'conversation',worldReady:value.worldReady===true};sync();
  });
  $('answer-call').disabled=true;
  bridge.getAvailability().then(status=>{availabilityReady=status.ready;$('answer-call').disabled=!status.ready||(requiresContext&&!personalization.received);if(!status.ready){text('incoming-status',status.reason||'Live calls are unavailable.');show('incoming-status',true);}});

  const timer=setInterval(()=>{text('call-timer',connectedAt?`${Math.floor((Date.now()-connectedAt)/60000)}:${String(Math.floor((Date.now()-connectedAt)/1000)%60).padStart(2,'0')}`:'');},1000);
  const visionTimer=setInterval(()=>{updateVisionUI();shareSnapshot('interval');},3000);
  window.addEventListener('pagehide',()=>{clearInterval(timer);clearInterval(visionTimer);endCall('Call ended',false);});document.addEventListener('visibilitychange',()=>{if(!document.hidden||choosingImage)return;if(['active','connecting'].includes(phase))endCall('Call paused while you were away. Tap to call again.');else if(phase==='browse'&&camera.running){camera.stop(false);cameraUI();}});
  for(const d of [$('cart-dialog'),$('details-dialog'),$('catalog-dialog'),$('collections-dialog'),$('compare-dialog'),$('chat-history-dialog')])d.addEventListener('close',()=>{sync();});
  $('mute-call').disabled=true;$('text-input').disabled=false;$('text-toggle').disabled=false;$('chat-send').disabled=true;$('flip-camera').disabled=true;selectEntry('video');formatUI();useProfileBag(bridge.personalizationContext?.().profileId);updateBag();updateVisionUI();updateFocusUI();renderInline();setCollectionView(false);
})();
