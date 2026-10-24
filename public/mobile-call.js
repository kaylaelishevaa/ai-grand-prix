/* Nook mobile call prototype: shared camera snapshots, real AI audio, no purchases. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const store=new window.NookCallState(window.COUPANG_PRODUCTS||[]);
  const discovery=new window.CoupiDiscovery(window.COUPANG_PRODUCTS||[]);
  const checkout=new window.CoupiCheckout(window.COUPANG_PRODUCTS||[]);
  let personalization=null;
  const defaults={none:{opacity:0},makeup:{opacity:.55,scale:1,rotation:0},clothes:{opacity:1,scale:1,rotation:0},desk:{opacity:1,scale:1,rotation:0,x:.5,y:.74},glasses:{opacity:1,scale:1,rotation:0}};
  const typeLabels={lipstick:'Lipstick',lipbalm:'Lip balm',sweater:'Sweaters',chair:'Chairs',lamp:'Desk lamps',tshirt:'T-shirts',hoodie:'Hoodies',glasses:'Glasses'};
  let phase='incoming',generation=0,facingMode='user',mode='none',trying=null,connectedAt=null,cameraBusy=false,ending=false,decisionBusy=false,handsWanted=true;
  let drag=null,toastTimer,gestureStarting=false,initialGreeting=true,displayedTotal=0;
  let visionWanted=true,visionWasActive=false,visionState='paused',visionLastAt=null;
  let previewEpoch=0,previewMeta=null,catalogType='recommended',loadingEpoch=0,loadingProductId=null;
  let recommendationsReceived=false,recommendedProducts=[],searchController=null;
  let lastSearch=null,lastSearchMessage='',lastSearchStatus=null,excludedProductIds=[],visibleChoices=[],catalogTryButtons=[];
  const productLabel=p=>typeLabels[p.productType]||'Product';
  const canPreview=p=>Object.hasOwn(defaults,p.category);
  const isLiveListing=p=>p.source==='coupang_web';
  let textMode=false;
  let controlsExpanded=false,viewingCollection=false;
  let voice=null,attachment=null,attachmentEpoch=0,sendingImage=false,choosingImage=false,pickerTimer;
  const conversation=new window.CoupiConversation({store,root:$('conversation-history'),history:$('chat-history'),count:$('chat-count'),latest:$('chat-latest')});
  const trusted=p=>p&&store.catalog.get(String(p.id));
  const show=(id,visible)=>{$(id).hidden=!visible;};
  function text(id,value){$(id).textContent=value;}
  function toast(value){clearTimeout(toastTimer);text('toast',value);show('toast',true);toastTimer=setTimeout(()=>show('toast',false),2400);}
  function notice(message, retry=false){text('call-notice',message||'');show('call-notice',!!message);show('retry-call',retry);}
  function screen(next){phase=next;if(!['active','browse','connecting'].includes(next)){viewingCollection=false;$('call-screen').scrollTop=0;}show('incoming-screen',next==='incoming');show('call-screen',['connecting','active','browse'].includes(next));show('end-screen',next==='ended');$('phone-app').dataset.phase=next;updateVisionUI();updateFocusUI();}
  function context(){const p=$('details-dialog').open?store.detailProduct:store.current,q=checkout.snapshot();return {mode,cameraRunning:camera.running,screen:phase,personalization:personalization?.context||{active:false,preferences:null,draft_pending:false},visible_panel:$('details-dialog').open?'product-details':$('checkout-dialog').open?'checkout':$('compare-dialog').open?'comparison':$('cart-dialog').open?'cart':($('catalog-dialog').open||viewingCollection)?'catalog':'call',checkout:{step:q.step,item_ids:q.selectedItems.map(i=>i.id),reference_total:q.referenceTotal,demo:true},last_purchase:lastPurchase?{receipt_id:lastPurchase.id,item_ids:lastPurchase.item_ids,pairing_ids:purchasePairings.map(p=>p.id),demo:true,payment_processed:false,order_placed:false}:null,facing_mode:facingMode,vision:{enabled:visionEnabled(),last_image_at:visionLastAt,state:visionState},tried_product:trying?{id:trying.id,title:trying.name,productType:trying.productType,preview_kind:previewMeta?.kind,shade_color:previewMeta?.shadeColor,shade_estimated:previewMeta?.shadeEstimated}:null,overlay:{...camera.options},visible_product:p?{id:p.id,title:p.name,category:p.category,productType:p.productType,price:p.price,price_is_historical:!isLiveListing(p),verifiedAttributes:(p.verifiedAttributes||[]).slice(0,2)}:null,cart_ids:[...store.cart.keys()],tried_product_id:trying?.id||null,recent_skipped:store.skipped.slice(-5),comparison_ids:discovery.comparison.map(p=>p.id),group_label:discovery.label};}
  function sync(){voice?.updateContext(context());}
  function cameraUI(){updateCatalogTryButtons();show('camera-fallback',!camera.running);$('toggle-camera').setAttribute('aria-pressed',String(!camera.running));$('toggle-camera').setAttribute('aria-label',camera.running?'Turn camera off':'Turn camera on');$('toggle-camera').classList.toggle('is-off',!camera.running);$('flip-camera').disabled=cameraBusy||!camera.running;$('flip-camera').setAttribute('aria-label',facingMode==='user'?'Flip to back camera':'Flip to front camera');$('flip-camera').title=facingMode==='user'?'Flip to back camera':'Flip to front camera';updateVisionUI();updateFocusUI();sync();}
  const camera=new window.NookCamera({video:$('live-video'),canvas:$('live-canvas'),onStatus:(message,kind)=>{
    if(kind==='error'){notice(message,true);text('camera-fallback-text','Your camera is off');}
    else if(kind==='loading'&&cameraBusy)text('camera-fallback-text','Opening your camera…');
    if(camera)cameraUI();
  }});
  camera.setOptions({opacity:0,mirror:true});
  const snapshots=new window.NookCameraSnapshots({video:$('live-video'),previewCanvas:$('live-canvas'),getContext:()=>({mode,mirror:camera.options.mirror,cameraRunning:camera.running}),isEnabled:visionEnabled});
  function updateFocusUI(){
    const active=!!trying&&camera.running&&['active','browse'].includes(phase),focused=active&&!controlsExpanded&&!textMode;
    $('phone-app').dataset.focused=String(focused);
    show('gesture-status',!!store.current&&!focused&&!textMode&&['connecting','active','browse'].includes(phase));
    show('focus-product',focused);show('focus-toggle',active&&!textMode);
    $('focus-toggle').setAttribute('aria-expanded',String(controlsExpanded));
    $('focus-toggle').setAttribute('aria-label',controlsExpanded?'Hide call controls':'Show call controls');
    text('focus-toggle-label',controlsExpanded?'Hide':'Controls');
    text('focus-product-label','Products');
    if(trying){$('focus-product-image').src=trying.image;$('focus-product-image').alt='';}
  }
  function visionEnabled(){return visionWanted&&camera.running&&!cameraBusy&&phase==='active'&&!!voice?.call?.ready&&!document.hidden;}
  function updateVisionUI(){
    const enabled=visionEnabled();
    if(visionWasActive&&!enabled){visionWasActive=false;visionLastAt=null;visionState='paused';snapshots.clear();voice?.clearCameraSnapshots?.();}
    else visionWasActive=enabled;
    show('vision-strip',['connecting','active'].includes(phase));
    $('vision-toggle').setAttribute('aria-pressed',String(visionWanted));
    $('vision-toggle').setAttribute('aria-label',visionWanted?'Pause camera sharing with Coupi':'Resume camera sharing with Coupi');
    const age=visionLastAt?Date.now()-Date.parse(visionLastAt):Infinity;
    const displayState=!enabled?'paused':visionState==='error'?'error':age<12000?'received':visionLastAt?'refreshing':'sent';
    $('vision-toggle').dataset.state=displayState;
    const label=!visionWanted?'':!camera.running?'Camera off · Coupi can’t see':!enabled?'Camera sharing waiting':displayState==='error'?'Camera sharing delayed':displayState==='received'?'Coupi sees snapshots':displayState==='refreshing'?'Refreshing Coupi’s view…':'Sharing camera…';
    show('vision-status',visionWanted);
    if($('vision-status').textContent!==label)text('vision-status',label);
    text('vision-action',visionWanted?'Pause':'Resume');
  }
  function shareSnapshot(reason='interval'){if(!visionEnabled())return false;const frame=snapshots.capture(reason);return frame?voice.sendCameraSnapshot(frame):false;}

  const hands=new window.NookHandGestures({video:$('live-video'),getMirror:()=>camera.options.mirror,isEnabled:()=>!textMode&&handsWanted&&camera.running&&['active','browse'].includes(phase)&&!!store.current&&!decisionBusy&&!viewingCollection&&!$('details-dialog').open&&!$('cart-dialog').open&&!$('catalog-dialog').open&&!$('collections-dialog').open&&!$('compare-dialog').open&&!$('chat-history-dialog').open&&!$('checkout-dialog').open&&!$('personalization-dialog').open,
    onSwipe:direction=>decide(direction),onStatus:(message,kind)=>{text('gesture-status',kind==='error'?'Hand tracking unavailable · swipe the card':hands.running?'Hand swipe: ← next collection · add selected →':'Preparing hand swipes…');}});
  async function startHands(){if(!handsWanted||!camera.running||!store.current||!['active','browse'].includes(phase)||hands.running||gestureStarting)return;gestureStarting=true;try{await hands.start();}finally{gestureStarting=false;}}
  function stopHands(){gestureStarting=false;hands.stop();text('gesture-status','← Next collection · selected item → bag');}
  function setTextMode(enabled){
    textMode=enabled;$('phone-app').dataset.textMode=String(enabled);hands.reset();
    voice.setTextMode(enabled);
    $('text-toggle').disabled=!voice?.call?.ready&&!enabled;
    show('text-form',enabled);show('conversation-history',enabled);show('transcript',!enabled&&!!store.messages.length);
    $('text-toggle').setAttribute('aria-expanded',String(enabled));$('text-toggle').setAttribute('aria-pressed',String(enabled));
    $('text-toggle').setAttribute('aria-label',enabled?'Close text conversation':'Open text conversation');
    $('conversation-box').dataset.collapsed='false';$('chat-minimize').setAttribute('aria-expanded','true');updateFocusUI();conversation.render();
    if(enabled)$('text-input').focus();
  }
  function transcript(entry){
    if(initialGreeting&&entry.role==='assistant'){store.messages=store.messages.filter(m=>m.key!=='opening');initialGreeting=false;}
    store.message(entry);
    const current=store.messages.at(-1);
    if(!current)return;
    const body=$('caption-text');
    text('caption-speaker',current.role==='user'?'You':'Coupi');
    show('transcript',!textMode);
    if(body.textContent!==current.text){
      body.textContent=current.text;
      body.scrollTop=body.scrollHeight;
    }
    conversation.schedule();
  }
  personalization=new window.CoupiCallPersonalization({catalog:[...store.catalog.values()],onChange:()=>{hands.reset();sync();},onSkip:()=>toast('Let’s find what you need.'),onSaved:()=>{endCall('Your worlds are ready.');window.location.href='/explore';}});
  voice=new window.NookVoiceSession({audio:$('voice-audio'),greeting:personalization.greeting,getContext:context,getVisionEnabled:visionEnabled,getCameraSnapshot:reason=>snapshots.capture(reason),
    onVisionState:event=>{visionState=event.state;if(event.state==='received')visionLastAt=event.capturedAt||new Date().toISOString();updateVisionUI();sync();},
    onTranscript:transcript,onRecommendations:(list,message,options,status)=>{searchController?.abort();searchController=null;$('catalog-search-submit').disabled=false;$('catalog-refresh').disabled=false;if(status!==undefined||list.some(isLiveListing))receiveRecommendations(list,message,options,[],status);else recommend(list,message,options);},
    onTryon:async(next,options)=>{
      const token=generation;let target=trying;
      if(next==='none'){await setMode('none');return {product_id:null,preview_kind:null};}
      if(!camera.running)throw Error('Camera is off. Ask the shopper to tap Camera before previewing.');
      if(next!=='makeup'&&options.color!==undefined)throw Error('The preview uses the real product photo. Choose another product for a different colour.');
      if(!trying||trying.category!==next){const p=store.current;if(!p||p.category!==next)throw Error('Choose a matching product card and try it first.');target=p;if(!(await tryOn(p))?.ok)throw Error('The product preview was cancelled.');}
      if(token!==generation||!trying||mode!==next||trying.id!==target?.id||camera.product?.id!==target?.id)throw Error('The product preview changed or the call ended.');
      camera.setOptions(options);cameraUI();return {product_id:trying.id,product_type:trying.productType,preview_kind:previewMeta?.kind,shade_estimated:previewMeta?.shadeEstimated,preview_is_approximate:true};
    },
    onProductAction:async(action,productId)=>{if(action==='try_on'&&!camera.running)throw Error('Camera is off. Ask the shopper to tap Camera before previewing.');return productAction(action,productId);},
    onCheckout:request=>openCheckout(request),
    onPreferences:request=>{if(phase!=='active')throw Error('Start the call before shaping your worlds.');return personalization.handle(request);},
    onTranscriptionState:state=>{if(state.compatibilityMode)notice('Using compatible captions. Speak clearly or type if a word looks wrong.');},
    onPlaybackBlocked:blocked=>show('play-audio',blocked&&!textMode),
    onState:({state,message,muted,connectedAt:at})=>{
      connectedAt=at;const ready=!!voice?.call?.ready;updateVisionUI();
      $('mute-call').disabled=!ready||textMode;$('text-input').disabled=!ready;$('text-toggle').disabled=!ready&&!textMode;$('mute-call').setAttribute('aria-pressed',String(muted));$('mute-call').setAttribute('aria-label',textMode?'Microphone off in text mode':muted?'Unmute microphone':'Mute microphone');$('mute-call').classList.toggle('is-off',muted);
      $('mute-call').title=textMode?'Close text mode to use the microphone':muted?'Unmute microphone':'Mute microphone';
      $('chat-send').disabled=!ready||sendingImage;$('inline-mute').disabled=!ready||textMode;$('inline-mute').setAttribute('aria-pressed',String(muted));$('inline-mute').setAttribute('aria-label',textMode?'Microphone off in text mode':muted?'Unmute microphone':'Mute microphone');text('inline-call-status',textMode?'Text mode':ready?(muted?'Live call · mic muted':'Live call · keep talking'):'Browse with Coupi');
      $('phone-app').dataset.voice=state;
      text('call-status',({connecting:'Connecting…',listening:textMode?'Text mode':'Listening',thinking:'Thinking',searching:'Finding your picks',speaking:textMode?'Replying…':'Coupi is speaking',connected:textMode?'Text mode':muted?'Mic muted':'Live with Coupi',reconnecting:'Reconnecting…',error:'Connection paused',idle:'Coupi'})[state]||'Coupi');
      if(ready&&phase==='connecting'){screen('active');notice('');cameraUI();startHands();}
      if(state==='error'&&!ending&&['connecting','active'].includes(phase)){notice(message,true);stopHands();}
      else if(state==='idle'&&phase==='active'&&!ending){endCall(message);}
    }
  });
  window.NookMobile={camera,voice,store,discovery,checkout,personalization};
  async function startCamera({strictFacing=false}={}){if(cameraBusy)return false;cameraBusy=true;cameraUI();const token=generation;try{const ok=await camera.start({facingMode,portrait:true,strictFacing});if(token!==generation)return false;if(ok){facingMode=camera.actualFacingMode||facingMode;camera.setOptions({mirror:facingMode==='user'});startHands();}else if(!strictFacing)notice(camera.lastCameraError?.message||'Allow Camera in browser settings, then tap Retry.',true);return ok;}finally{if(token===generation){cameraBusy=false;cameraUI();}}}
  async function answer(){if(phase==='connecting'||voice.call)return;const token=++generation;visionWanted=$('vision-consent').checked;visionState='paused';visionLastAt=null;screen('connecting');notice('');text('camera-fallback-text',visionWanted?'Opening your camera…':'Camera off. Tap Camera to turn it on.');$('answer-call').disabled=true;lastPurchase=null;purchasePairings=[];store.clearMessages();conversation.reset();voice.options.greeting=personalization.greeting;initialGreeting=true;transcript({role:'assistant',key:'opening',text:personalization.greeting});initialGreeting=true;if(personalization.world&&!store.current)recommend(personalization.world.products,'',{mixed:true,sourceOnly:true,groupLabel:personalization.world.title,maxPrice:personalization.profile?.budget});
    try{
      if(visionWanted)await startCamera();
      else{stopHands();camera.stop(false);cameraBusy=false;cameraUI();}
      if(token!==generation||phase!=='connecting')return;
      await voice.start();
    }catch{notice('Could not start the call. Check Camera and Microphone permissions.',true);}finally{if(token===generation)$('answer-call').disabled=false;}
  }
  function endCall(message='Call ended',markCompleted=true){
    searchController?.abort();searchController=null;$('catalog-search-submit').disabled=false;$('catalog-refresh').disabled=false;
    if(ending)return;
    const completed=markCompleted&&phase==='active'&&!document.hidden;
    ending=true;generation++;personalization?.resetDraft();lastPurchase=null;purchasePairings=[];clearAttachment();$('text-input').value='';previewEpoch++;trying=null;previewMeta=null;mode='none';controlsExpanded=false;cameraBusy=false;decisionBusy=false;
    stopHands();snapshots.clear();voice.clearCameraSnapshots?.();voice.end();camera.stop(false);camera.setProduct(null);camera.setMode('none');camera.setOptions({opacity:0});
    loadingEpoch=0;loadingProductId=null;$('product-try').disabled=false;$('answer-call').disabled=false;show('tryon-chip',false);connectedAt=null;
    screen(message==='Call ended'?'incoming':'ended');
    text('end-title','A little closer to your thing.');
    text('end-summary',store.cart.size?`${store.cart.size} ${store.cart.size===1?'pick':'picks'} saved in your demo bag.`:message==='Call ended'?'Your camera and microphone are off.':message);
    closeDialogs();ending=false;
    if(completed){try{window.localStorage.setItem('coupi_first_call_done','1');}catch{/* Storage may be unavailable. */}}
  }
  function previewLabel(){return trying?`${trying.preview?.shadeLabel||trying.brand||typeLabels[trying.productType]||'Product'} · ${trying.category==='makeup'?'shade estimate':'live placement guide'}`:'';}
  async function setMode(next){const token=generation;if(!Object.hasOwn(defaults,next))throw Error('Choose makeup, glasses, clothes, desk, or none.');if(next==='none'){previewEpoch++;trying=null;previewMeta=null;loadingEpoch=0;loadingProductId=null;$('product-try').disabled=store.current?.preview?.available===false;}const changed=mode!==next;mode=next;if(changed||next==='none')camera.setOptions(defaults[next]);const modeEpoch=previewEpoch;await camera.setMode(next);if(token!==generation||modeEpoch!==previewEpoch)return false;if(camera.errors[next])throw Error('Tracking is unavailable. Try again in good light or check your connection.');show('tryon-chip',next!=='none'&&!!trying);text('tryon-label',previewLabel());updateFocusUI();updateVisionUI();sync();return true;}
  async function tryOn(p=store.current){
    p=trusted(p);if(!p||!['active','browse'].includes(phase))throw Error('Choose a product during the call or browse first.');
    if(!p.image)throw Error('This product has no preview photo. Choose another product.');
    if((!p.image||p.preview?.available===false))throw Error(p.preview?.reason||'Try-on is unavailable for this listing photo. Choose a product with a clean preview image.');
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
      toast(p.category==='clothes'?'Step back so your shoulders and hips are visible':p.productType==='glasses'?'Face the camera. The frames follow your eyes.':p.productType==='chair'?'Point at the floor. Tap where the chair should sit.':p.category==='desk'?'Point at your desk. Tap where the lamp should sit.':'Shade estimated from the listing photo');
      return result;
    }catch(error){if(token===generation&&epoch===previewEpoch){trying=null;previewMeta=null;await setMode('none');}throw error;}
    finally{if(loadingEpoch===epoch){loadingEpoch=0;loadingProductId=null;$('product-try').disabled=store.current?.preview?.available===false;}}
  }
  function receiveRecommendations(list,message,search,excluded=[],status=null){
    if(!['connecting','active','browse'].includes(phase))return;
    list=list.filter(p=>p&&typeof p==='object');
    const types=[...new Set(list.map(p=>p.productType).filter(type=>typeof type==='string'))];
    lastSearch=search || {query:types.join(' '),category:'all',max_price:null,product_types:types};
    lastSearchMessage=typeof message==='string'?message:'';lastSearchStatus=status;
    excludedProductIds=excluded;
    const allowed=(/\b(?:glasses|eyeglasses|eyewear|spectacles|sunglasses|frames)\b|안경|선글라스|眼镜|眼鏡|镜框|鏡框|墨镜|墨鏡/iu.test(lastSearch.query)?['glasses']:lastSearch.product_types||[]);
    const matches=list.filter(p=>(!allowed.length||allowed.includes(p.productType))&&(!lastSearch.category||lastSearch.category==='all'||p.category===lastSearch.category)&&!excluded.includes(String(p.id))).slice(0,15);
    store.addSearchProducts(matches);for(const product of store.catalog.values())discovery.catalog.set(String(product.id),product);recommendationsReceived=true;recommend(matches,message,{...lastSearch,sourceOnly:true});recommendedProducts=matches.map(p=>trusted(p)).filter(Boolean).slice(0,15);closeDialogs();openSearchCatalog('recommended');
    if(excluded.length&&!recommendedProducts.length&&status!=='listing_sources_unavailable')text('catalog-match-note',lastSearchMessage||'No new matching products found. Try changing your search.');
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
    for(const key of ['recommended',...Object.keys(typeLabels)])$('type-'+key).setAttribute('aria-pressed',String(key===catalogType));
    const choices=catalogType==='recommended'?catalogChoices():[...store.catalog.values()].filter(p=>p.productType===catalogType).slice(0,10);
    visibleChoices=choices;show('catalog-tabs',!!choices.length&&!recommendationsReceived);
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
        if(!['active','browse'].includes(phase)){notice('Wait for the call to connect before trying a product.');return;}
        if(!p.image||entry.imageUnavailable){feedback.textContent='Your camera is on, but this product’s photo is unavailable. Choose another item or show its details.';feedback.hidden=false;return;}
        recommend([p,...choices.filter(item=>item.id!==p.id)],'',{sourceOnly:true,productType:p.productType});selectProduct(p);$('catalog-dialog').close();try{await tryOn(p);}catch(e){notice(e.message);}
      };
      img.onerror=()=>{img.hidden=true;entry.imageUnavailable=true;updateCatalogTryButtons();};row.append(img,copy,button);root.append(row);
    }
    updateCatalogTryButtons();
    if(!$('catalog-dialog').open)$('catalog-dialog').showModal();hands.reset();
  }
  const priceText=p=>Number.isFinite(p.price)?'₩'+p.price.toLocaleString('en-US'):'See price';
  function adoptDiscovery(){const p=discovery.current;if((trying&&trying.id!==p?.id)||(loadingProductId&&loadingProductId!==p?.id))setMode('none').catch(e=>notice(e.message));store.recommend(p?[p,...discovery.products.slice(0,discovery.products.some(isLiveListing)?15:10).filter(x=>String(x.id)!==String(p.id))]:[]);displayedTotal=discovery.visible.length;renderCard();renderInline();}
  function selectProduct(p){p=trusted(p);if(!p||!discovery.select(p.id))return false;adoptDiscovery();return true;}
  function renderCard(){const p=store.current;show('product-zone',!!p);show('product-empty',!p);updateFocusUI();if(!p){stopHands();sync();return;}
    const img=$('product-image');img.hidden=!p.image;img.removeAttribute('src');if(p.image){img.src=p.image;img.alt=p.name;img.onerror=()=>{img.hidden=true;};}
    text('product-title',p.name);text('product-category',discovery.label||typeLabels[p.productType]);
    const price=$('product-price');price.replaceChildren();const amount=document.createElement('span');amount.textContent=priceText(p);const note=document.createElement('small');note.textContent=isLiveListing(p)?'listed price':'reference price';price.append(amount,note);
    const position=discovery.products.findIndex(x=>String(x.id)===String(p.id))+1;text('product-position',`${position} / ${Math.min(discovery.limit,discovery.total)}`);
    text('product-selected-note','Selected · '+(p.brand||typeLabels[p.productType]||'Coupang'));text('product-try',(!p.image||p.preview?.available===false)?'No preview':'Try it');$('product-try').disabled=(!p.image||p.preview?.available===false);
    $('product-card').style.transform='';$('product-card').style.opacity='';$('product-card').classList.remove('accept','reject');text('swipe-feedback','');show('swipe-feedback',false);sync();startHands();
  }
  function recommend(list,message,options={}){if(!['connecting','active','browse'].includes(phase))return;discovery.recommend(list,options);catalogType=discovery.productType||catalogType;hands.reset();adoptDiscovery();if($('catalog-dialog').open)renderCatalog();if(!store.current)toast('No matching listing in this catalog. Try another colour or budget.');}
  function updateBag(){text('cart-count',String(store.cart.size));$('cart-button').setAttribute('aria-label',`Open bag, ${store.cart.size} items`);sync();}
  function addToBag(p){p=trusted(p);if(!p)return;store.cart.set(String(p.id),p);updateBag();toast('Selected product added to your bag');}
  function nextStyle(){const previous=store.current;const next=discovery.nextCollection();if(!next.changed){toast('No related collection within these preferences. Ask Coupi for a new direction.');return false;}if(previous)store.skipped.push(String(previous.id));adoptDiscovery();if($('catalog-dialog').open)renderCatalog();toast(discovery.label);sync();return true;}
  async function decide(direction){if(decisionBusy||!store.current)return;decisionBusy=true;const token=generation,p=store.current,card=$('product-card');card.classList.add(direction==='right'?'accept':'reject');text('swipe-feedback',direction==='right'?'ADDED':'NEXT COLLECTION');show('swipe-feedback',true);card.style.transform=`translateX(${direction==='right'?80:-80}%) rotate(${direction==='right'?8:-8}deg)`;card.style.opacity='0';await new Promise(resolve=>setTimeout(resolve,220));if(token!==generation)return;if(store.current?.id===p.id){if(direction==='right')addToBag(p);else nextStyle();}decisionBusy=false;hands.reset();renderCard();}
  function productDetails(p=store.current){p=trusted(p);if(!p)return;store.detailProduct=p;text('detail-title',p.name);const img=$('detail-image');img.hidden=!p.image;if(p.image){img.src=p.image;img.alt=p.name;}const attributes=(p.verifiedAttributes||[]).filter(x=>!/^Preview depicts/.test(x)).slice(0,4).join(' · ');const introduction=p.description?.trim()||attributes;const price=Number.isFinite(p.price)?(isLiveListing(p)?'Listed price: ':'Reference price: ')+priceText(p)+'.':'Price unavailable.';text('detail-body',(introduction?introduction+(/[.!?。！？]$/u.test(introduction)?' ':'. '):'')+price);text('detail-preview-note',!p.image?'No preview photo is available for this product.':p.category==='makeup'?'Approximate shade preview; lighting and finish vary.':'Placement and fit are approximate.');$('detail-link').href=p.url;$('detail-try').disabled=(!p.image||p.preview?.available===false);text('detail-try',(!p.image||p.preview?.available===false)?'Preview unavailable':'Try this product');window.CoupiEvidence.renderReviews($('detail-reviews'),p);text('detail-review-shortcut',window.CoupiEvidence.reviewStats(p).label+' ↓');text('detail-compare',discovery.comparison.some(x=>x.id===p.id)?'Remove compare':'Compare');if(!$('details-dialog').open)$('details-dialog').showModal();$('details-dialog').scrollTop=0;hands.reset();sync();}
  function updateCompare(){text('inline-compare-count',String(discovery.comparison.length));$('inline-compare').disabled=discovery.comparison.length<2;text('compare-count',String(discovery.comparison.length));$('compare-open').disabled=discovery.comparison.length<2;sync();}
  function toggleCompare(p){const result=discovery.toggleCompare(p.id);if(!result.ok){toast(result.error);return;}updateCompare();renderInline();if($('catalog-dialog').open)renderCatalog();if($('compare-dialog').open)renderComparison();if(store.detailProduct)text('detail-compare',discovery.comparison.some(x=>x.id===store.detailProduct.id)?'Remove compare':'Compare');}
  function collectionScrollState(){const next=$('call-screen').scrollTop>48;if(next!==viewingCollection){viewingCollection=next;hands.reset();sync();}}
  function scrollToCollection(){viewingCollection=true;$('call-screen').scrollTop=$('call-stage').offsetHeight||500;hands.reset();sync();}
  function backToCamera(){viewingCollection=false;$('call-screen').scrollTop=0;hands.reset();sync();}
  function renderInline(){
    const root=$('inline-items');root.replaceChildren();
    const label=discovery.label,amount=discovery.visible.length;
    $('inline-products').dataset.theme=discovery.collectionStyle||discovery.theme||discovery.productType||'pink';
    text('inline-title',label);text('inline-peek-label',amount?`${amount} picks · ${label}`:'Your picks will appear here');
    const brands=new Set(discovery.visible.map(p=>p.brand).filter(Boolean));
    text('inline-description',brands.size>1?`${amount} similar picks · ${brands.size} brands · tap one to try.`:'A few ideas in the same direction. Pick one to explore.');
    for(const key of Object.keys(typeLabels))$('inline-type-'+key).setAttribute('aria-pressed',String(key===discovery.productType));
    for(const p of discovery.visible){
      const row=document.createElement('article');row.className='inline-item';row.dataset.id=String(p.id);row.dataset.selected=String(String(p.id)===discovery.selectedId);
      const select=document.createElement('button');select.className='inline-item-select';select.setAttribute('aria-label','Select '+p.name);select.setAttribute('aria-pressed',row.dataset.selected);
      const img=document.createElement('img');img.className='inline-item-photo';img.src=p.image;img.alt=p.name;img.loading='lazy';img.onerror=()=>{img.hidden=true;};
      const brand=document.createElement('span');brand.className='inline-item-brand';brand.textContent=p.brand||'COUPANG PICK';
      const name=document.createElement('strong');name.className='inline-item-name';name.textContent=p.name;
      const price=document.createElement('span');price.className='inline-item-price';price.textContent=priceText(p);const ref=document.createElement('small');ref.textContent=isLiveListing(p)?'listed':'reference';price.append(ref);
      const selected=document.createElement('span');selected.className='inline-item-selected';selected.textContent=row.dataset.selected==='true'?'● Selected for your camera':'Tap to select';
      select.append(img,brand,name,price,selected);select.onclick=()=>selectProduct(p);
      const actions=document.createElement('div');actions.className='inline-item-actions';
      for(const [label,action] of [['Details',()=>productDetails(p)],['Try on',async()=>{selectProduct(p);closeDialogs();backToCamera();try{await tryOn(p);}catch(error){notice(error.message);}}],['Add to bag',()=>addToBag(p)],['Compare',()=>toggleCompare(p)]]){
        const button=document.createElement('button');button.textContent=label;button.setAttribute('aria-label',label+' — '+p.name);button.onclick=action;
        if(label==='Try on'){button.dataset.primary='true';if((!p.image||p.preview?.available===false)){button.disabled=true;button.textContent='No preview';button.title=p.preview?.reason||'A clean product preview is not available';}}
        if(label==='Compare')button.setAttribute('aria-pressed',String(discovery.comparison.some(x=>x.id===p.id)));actions.append(button);
      }
      row.append(select,actions);root.append(row);
    }
    if(!amount){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='Ask Coupi for something you like, or choose a collection above.';root.append(empty);}
    show('inline-more',discovery.hasMore);text('inline-more','View more · '+Math.min(10,discovery.total)+' products');
    text('inline-availability',amount?`${amount} of ${Math.min(10,discovery.total)} sourced picks in this collection.`:'');$('inline-save').disabled=!amount;
    updateCompare();
  }
  function renderCatalog(){
    if($('catalog-dialog').dataset.view==='search')return openSearchCatalog();
    show('catalog-collection-controls',true);
    const root=$('catalog-items'),position=$('catalog-dialog').scrollTop;root.replaceChildren();
    for(const key of Object.keys(typeLabels))$('type-'+key).setAttribute('aria-pressed',String(key===discovery.productType));
    text('catalog-group-label',`${discovery.label} · ${discovery.visible.length} of ${Math.min(10,discovery.total)}`);
    for(const p of discovery.visible){
      const row=document.createElement('article');row.className='discovery-item';row.dataset.selected=String(String(p.id)===discovery.selectedId);
      const select=document.createElement('button');select.className='discovery-select';select.setAttribute('aria-label','Select '+p.name);select.setAttribute('aria-pressed',row.dataset.selected);
      const img=document.createElement('img');img.src=p.image;img.alt=p.name;img.loading='lazy';img.className='discovery-photo';
      const name=document.createElement('strong');name.className='discovery-copy';name.textContent=p.name;const price=document.createElement('span');price.className='discovery-price';price.textContent=priceText(p);const ref=document.createElement('small');ref.textContent='ref.';price.append(ref);
      const badge=document.createElement('span');badge.className='selection-label';badge.textContent=row.dataset.selected==='true'?'● Selected for your camera':'Tap to select';select.append(img,name,price,badge);select.onclick=()=>{selectProduct(p);renderCatalog();};
      const actions=document.createElement('div');actions.className='discovery-actions';
      for(const [label,action] of [['Details',()=>productDetails(p)],['Try it',async()=>{selectProduct(p);closeDialogs();backToCamera();try{await tryOn(p);}catch(e){notice(e.message);}}],['Add to bag',()=>addToBag(p)],['Compare',()=>toggleCompare(p)]]){const button=document.createElement('button');button.textContent=label;button.setAttribute('aria-label',label+' — '+p.name);button.onclick=action;if(label==='Try it'){button.dataset.primary='true';if((!p.image||p.preview?.available===false)){button.disabled=true;button.textContent='No preview';button.title='This listing photo is not suitable for try-on';}}if(label==='Compare')button.setAttribute('aria-pressed',String(discovery.comparison.some(x=>x.id===p.id)));actions.append(button);}
      row.append(select,actions);root.append(row);
    }
    if(!discovery.visible.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent='No matching listings in this demo. Try another category or ask Coupi for a new direction.';root.append(empty);}
    show('catalog-more',discovery.hasMore);text('catalog-more','View more · up to '+Math.min(10,discovery.total));
    text('catalog-availability',discovery.total<6?`Showing all ${discovery.total} sourced matches. Try another style for more choices.`:discovery.limit===10||!discovery.hasMore?'All demo picks in this group.':'Six picks to start. Open more when you’re ready.');
    updateCompare();$('catalog-dialog').scrollTop=position;
  }
  function openCatalog(type){
    if($('catalog-dialog').open)$('catalog-dialog').close();$('catalog-dialog').dataset.view='collection';
    if(type&&Object.hasOwn(typeLabels,type)){catalogType=type;discovery.recommend([...store.catalog.values()].filter(p=>p.productType===type),{productType:type,theme:type==='glasses'?'optical':'',collectionStyle:type==='tshirt'?'basic':'',maxPrice:discovery.maxPrice});adoptDiscovery();}
    else if(!discovery.products.length&&!discovery.productType){discovery.recommend([...store.catalog.values()].filter(p=>p.productType===catalogType),{productType:catalogType,maxPrice:discovery.maxPrice});adoptDiscovery();}
    renderCatalog();renderInline();scrollToCollection();hands.reset();sync();
  }
  function saveGroup(){const result=discovery.saveCollection();toast(!result?'Choose a group first':result.persisted?'Collection saved':'Collection saved for this visit; browser storage is unavailable');}
  function openCollections(){const root=$('collection-items');root.replaceChildren();for(const saved of discovery.collections){const row=document.createElement('article');row.className='collection-item';const title=document.createElement('h3');title.textContent=saved.name;const meta=document.createElement('p');meta.textContent=saved.productCount+' products';const images=document.createElement('div');images.className='collection-pictures';for(const p of saved.products.slice(0,4)){const img=document.createElement('img');img.src=p.image;img.alt=p.name;images.append(img);}const actions=document.createElement('div');actions.className='collection-actions';const open=document.createElement('button');open.textContent='Open collection';open.onclick=()=>{discovery.restoreCollection(saved.id);catalogType=discovery.productType;adoptDiscovery();$('collections-dialog').close();openCatalog();};const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>{discovery.removeCollection(saved.id);openCollections();};actions.append(open,remove);row.append(title,meta,images,actions);root.append(row);}if(!discovery.collections.length){const p=document.createElement('p');p.className='empty-state';p.textContent='Save a collection, then come back to it anytime.';root.append(p);}if(!$('collections-dialog').open)$('collections-dialog').showModal();hands.reset();}
  function renderComparison(){window.CoupiEvidence.renderComparison($('compare-table'),discovery.comparison,{onTry:async p=>{if(!discovery.products.some(x=>x.id===p.id))discovery.recommend([p],{productType:p.productType});selectProduct(p);closeDialogs();backToCamera();try{await tryOn(p);}catch(e){notice(e.message);}},onDetails:p=>productDetails(p),onRemove:p=>{toggleCompare(p);if(discovery.comparison.length<2){$('compare-dialog').close();toast('Choose at least two products to compare');}}});}
  function openComparison(){if(discovery.comparison.length<2){toast('Choose two or three products first');return;}renderComparison();$('compare-dialog').showModal();hands.reset();sync();}
  function clearAttachment(){choosingImage=false;clearTimeout(pickerTimer);attachmentEpoch++;attachment=null;$('chat-image-file').value='';$('attachment-image').removeAttribute('src');show('attachment-preview',false);show('attachment-status',false);}
  async function prepareAttachment(){choosingImage=false;clearTimeout(pickerTimer);const file=$('chat-image-file').files?.[0];if(!file)return;const epoch=++attachmentEpoch;text('attachment-status','Preparing photo…');show('attachment-status',true);try{const result=await window.CoupiChatImages.prepare(file);if(epoch!==attachmentEpoch)return;attachment=result;$('attachment-image').src=result.dataUrl;text('attachment-name',result.name);show('attachment-preview',true);text('attachment-status','Photo ready. Send to share with Coupi.');}catch(e){if(epoch===attachmentEpoch){attachment=null;show('attachment-preview',false);text('attachment-status',e.message);}}}
  async function sendMessage(event){event.preventDefault();if(sendingImage)return;const value=$('text-input').value,selected=attachment,token=generation;if(!voice.call?.ready){text('attachment-status','Start the video call to send your message.');show('attachment-status',true);return;}try{if(selected){sendingImage=true;$('chat-send').disabled=true;text('attachment-status','Sending photo…');show('attachment-status',true);await voice.sendImage({...selected,text:value});if(token!==generation)return;if(attachment===selected)clearAttachment();}else if(!voice.sendText(value))return;if($('text-input').value===value)$('text-input').value='';}catch(e){if(token===generation){text('attachment-status',e.message);show('attachment-status',true);}}finally{sendingImage=false;$('chat-send').disabled=!voice.call?.ready;}}
  function openBag(){const root=$('cart-items');root.replaceChildren();if(!store.cart.size){const p=document.createElement('p');p.textContent='Swipe right on a product to save it here.';root.append(p);}for(const p of store.cart.values()){const row=document.createElement('div');row.className='bag-item';const title=document.createElement('strong');title.textContent=p.name;const controls=document.createElement('div');const link=document.createElement('button');link.textContent='Show details';link.onclick=()=>productDetails(p);const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>{store.cart.delete(String(p.id));updateBag();openBag();};controls.append(link,remove);row.append(title,controls);root.append(row);}$('cart-checkout').disabled=!store.cart.size;if(!$('cart-dialog').open)$('cart-dialog').showModal();hands.reset();sync();}
  function closeDialogs(){for(const id of ['cart-dialog','details-dialog','catalog-dialog','collections-dialog','compare-dialog','chat-history-dialog','checkout-dialog','personalization-dialog'])if($(id).open)$(id).close();}
  $('detail-review-shortcut').onclick=()=>$('detail-reviews').scrollIntoView({behavior:'smooth',block:'start'});
  const money=value=>Number.isFinite(value)?'₩'+value.toLocaleString('en-US'):'Unavailable';
  let completedReceipt=null,lastPurchase=null,purchasePairings=[];
  function checkoutAction(action){show('checkout-error',false);try{action();renderCheckout();}catch(error){text('checkout-error',error.message);show('checkout-error',true);}}
  function openCheckout({scope='selected',productIds=[]}={}){
    if(!['active','browse'].includes(phase))throw Error('Start a call or browse products before checkout.');
    if($('checkout-dialog').open&&checkout.snapshot().step!=='complete')throw Error('A checkout is already open. Review it or close it before choosing new items.');
    let products;
    if(scope==='selected')products=[$('details-dialog').open?store.detailProduct:store.current].filter(Boolean);
    else if(scope==='cart')products=[...store.cart.values()];
    else if(scope==='comparison'){
      if(!$('compare-dialog').open||discovery.comparison.length<2)throw Error('Open the comparison first or ask which products the shopper wants.');
      products=discovery.comparison;
    }else if(scope==='products'){
      if(!Array.isArray(productIds)||!productIds.length||productIds.length>10)throw Error('Choose between one and ten exact product IDs.');
      const visible=new Map([...store.queue,...discovery.visible,...discovery.comparison,...purchasePairings,...store.cart.values(),...($('details-dialog').open&&store.detailProduct?[store.detailProduct]:[])].map(p=>[String(p.id),p]));
      products=productIds.map(id=>{if(typeof id!=='string'||!visible.has(id))throw Error('That product is not in the current picks or bag. Ask which products to buy.');return visible.get(id);});
    }else throw Error('Choose the selected product, comparison, exact products, or cart.');
    if(!products.length)throw Error(scope==='cart'?'Your bag is empty. Add a product first.':'Choose a product first.');
    closeDialogs();checkout.updateCatalog([...store.catalog.values()]);checkout.start(products,{source:scope});completedReceipt=null;hands.reset();renderCheckout();$('checkout-dialog').showModal();$('checkout-dialog').scrollTop=0;sync();
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
  $('checkout-confirm').onclick=()=>checkoutAction(()=>{const receipt=checkout.confirm();if(receipt.id!==completedReceipt){completedReceipt=receipt.id;lastPurchase=receipt;purchasePairings=window.CoupiPairings.select([...store.catalog.values()],receipt.item_ids,{maxPrice:discovery.maxPrice,excludedTypes:discovery.constraints.types.exclude});for(const id of receipt.item_ids)store.cart.delete(id);updateBag();try{voice.notifyCheckoutComplete(receipt,purchasePairings);}catch{toast('Purchase complete. Explore your matching picks below.');}}$('checkout-dialog').scrollTop=0;});
  $('close-checkout').onclick=()=>$('checkout-dialog').close();$('checkout-done').onclick=()=>$('checkout-dialog').close();
  $('checkout-dialog').addEventListener('close',()=>{if(!$('checkout-dialog').open)checkout.cancel();hands.reset();sync();});
  async function productAction(action,productId){const p=productId?[...store.queue,...discovery.comparison,...purchasePairings,...store.cart.values(),...(store.detailProduct?[store.detailProduct]:[])].find(p=>String(p.id)===String(productId)):store.current;if(!p)throw Error('That product is not in the current picks, comparison, details or bag. Search first.');if(productId&&store.current?.id!==p.id&&discovery.products.some(x=>x.id===p.id))selectProduct(p);if($('checkout-dialog').open&&checkout.snapshot().step==='complete')$('checkout-dialog').close();if(action==='save')addToBag(p);else if(action==='skip')nextStyle();else if(action==='try_on'){if(!discovery.products.some(item=>item.id===p.id))recommend([p],'',{productType:p.productType,category:p.category});selectProduct(p);closeDialogs();backToCamera();if(!(await tryOn(p))?.ok)throw Error('The product preview was cancelled.');}else if(action==='details'||action==='browse')productDetails(p);else throw Error('Unsupported product action.');return {ok:true,action,product:p,cart_count:store.cart.size,purchased:false,preview_is_approximate:true,...(action==='try_on'?{preview_kind:previewMeta?.kind,shade_estimated:previewMeta?.shadeEstimated}:{} )};}
  function browse(){personalization.skip();screen('browse');text('call-status','Explore your way');text('camera-fallback-text','A little inspiration, before we talk.');notice('',true);text('retry-call','Start video call');const world=personalization.world;recommend(world?.products||[...store.catalog.values()].filter(p=>p.productType==='lipstick'),'',world?{mixed:true,sourceOnly:true,groupLabel:world.title,maxPrice:personalization.profile?.budget}:{productType:'lipstick'});cameraUI();}
  $('answer-call').onclick=answer;$('call-again').onclick=()=>{screen('incoming');answer();};$('decline-call').onclick=browse;$('end-call').onclick=()=>endCall();
  $('mute-call').onclick=()=>voice.mute();$('text-toggle').onclick=()=>setTextMode(!textMode);$('text-form').onsubmit=sendMessage;
  $('chat-attach').onclick=()=>{choosingImage=true;clearTimeout(pickerTimer);pickerTimer=setTimeout(()=>{choosingImage=false;if(document.hidden&&phase==='active')endCall('Call paused while you were away. Tap to call again.');},60000);$('chat-image-file').click();};$('chat-image-file').addEventListener('cancel',()=>{choosingImage=false;clearTimeout(pickerTimer);});$('chat-image-file').onchange=prepareAttachment;$('attachment-remove').onclick=clearAttachment;
  $('chat-minimize').onclick=()=>{const collapsed=$('conversation-box').dataset.collapsed!=='true';$('conversation-box').dataset.collapsed=String(collapsed);$('chat-minimize').setAttribute('aria-expanded',String(!collapsed));$('chat-minimize').setAttribute('aria-label',collapsed?'Show conversation':'Minimize conversation');text('chat-minimize',collapsed?'⌃':'⌄');};
  $('chat-history-open').onclick=()=>{$('chat-history-dialog').showModal();conversation.openHistory();hands.reset();};$('close-chat-history').onclick=()=>$('chat-history-dialog').close();
  $('group-open').onclick=()=>openCatalog();$('save-group').onclick=saveGroup;$('catalog-save-group').onclick=saveGroup;$('catalog-more').onclick=()=>{discovery.viewMore();adoptDiscovery();renderCatalog();};$('catalog-next-style').onclick=nextStyle;
  $('inline-peek').onclick=()=>openCatalog();$('back-camera').onclick=backToCamera;$('call-screen').addEventListener('scroll',collectionScrollState,{passive:true});
  $('inline-save').onclick=saveGroup;$('inline-saved').onclick=openCollections;$('inline-more').onclick=()=>{discovery.viewMore();adoptDiscovery();};$('inline-next').onclick=()=>{if(nextStyle())scrollToCollection();};$('inline-compare').onclick=openComparison;
  $('inline-mute').onclick=()=>voice.mute();$('inline-end').onclick=()=>endCall();for(const key of Object.keys(typeLabels))$('inline-type-'+key).onclick=()=>openCatalog(key);
  $('collections-button').onclick=openCollections;$('close-collections').onclick=()=>$('collections-dialog').close();
  $('compare-open').onclick=openComparison;$('close-compare').onclick=()=>$('compare-dialog').close();$('compare-clear').onclick=()=>{discovery.clearCompare();updateCompare();$('compare-dialog').close();renderCatalog();renderInline();};
  $('compare-ask').onclick=()=>{const ids=discovery.comparison.map(p=>p.id).join(', ');if(!voice.sendText('Compare my selected catalog products (IDs: '+ids+'). Get the verified details for each, explain the meaningful differences in price, variant and sourced review evidence, and ask which factor matters most to me. Missing facts are unverified.'))toast('Start the call to ask Coupi.');else closeDialogs();};
  $('detail-compare').onclick=()=>{if(store.detailProduct)toggleCompare(store.detailProduct);};$('detail-add').onclick=()=>addToBag(store.detailProduct);$('detail-try').onclick=async()=>{const p=store.detailProduct;if(!p)return;if(!discovery.products.some(x=>x.id===p.id))discovery.recommend([p],{productType:p.productType});selectProduct(p);closeDialogs();backToCamera();try{await tryOn(p);}catch(e){notice(e.message);}};
  $('play-audio').onclick=()=>voice.resumeAudio().catch(()=>notice('Tap again to enable speaker audio.'));
  $('retry-call').onclick=async()=>{text('retry-call','Retry');if(voice.call?.ready){await startCamera();return;}voice.end();screen('incoming');answer();};
  $('toggle-camera').onclick=async()=>{if(cameraBusy)return;if(camera.running){stopHands();camera.stop(false);text('camera-fallback-text','Camera off. We can keep talking.');cameraUI();}else await startCamera();};
  $('flip-camera').onclick=async()=>{if(cameraBusy||!camera.running)return;const token=generation,previous=facingMode;stopHands();facingMode=previous==='user'?'environment':'user';const ok=await startCamera({strictFacing:true});if(token!==generation)return;if(!ok){facingMode=previous;const restored=await startCamera();if(token!==generation)return;notice(restored?'This device has no available camera on the other side. Your original camera is still on.':'The other camera is unavailable. Tap Camera to reconnect.',!restored);}else{notice('');toast(facingMode==='environment'?'Back camera':'Front camera');}};
  $('focus-toggle').onclick=()=>{controlsExpanded=!controlsExpanded;updateFocusUI();};
  $('focus-product').onclick=()=>openCatalog();
  $('vision-toggle').onclick=()=>{visionWanted=!visionWanted;$('vision-consent').checked=visionWanted;updateVisionUI();updateFocusUI();sync();if(visionWanted)shareSnapshot('resume');toast(visionWanted?'Camera sharing on':'Coupi’s camera view paused');};
  $('vision-consent').onchange=()=>{visionWanted=$('vision-consent').checked;updateVisionUI();updateFocusUI();};
  $('gesture-toggle').onclick=()=>{handsWanted=!handsWanted;$('gesture-toggle').setAttribute('aria-pressed',String(handsWanted));$('gesture-toggle').classList.toggle('is-off',!handsWanted);if(handsWanted)startHands();else stopHands();toast(handsWanted?'Hand swipes on':'Hand swipes off');};
  $('clear-tryon').onclick=()=>setMode('none');$('product-try').onclick=()=>tryOn().catch(e=>notice(e.message));$('product-details').onclick=()=>productDetails();$('product-skip').onclick=()=>decide('left');$('product-save').onclick=()=>decide('right');$('cart-button').onclick=openBag;$('close-cart').onclick=()=>$('cart-dialog').close();$('close-details').onclick=()=>$('details-dialog').close();
  $('catalog-button').onclick=()=>openCatalog();$('close-catalog').onclick=()=>$('catalog-dialog').close();for(const key of Object.keys(typeLabels))$('type-'+key).onclick=()=>openSearchCatalog(key);text('catalog-button','Products');$('catalog-search-open').onclick=()=>openSearchCatalog('recommended');$('type-recommended').onclick=()=>openSearchCatalog('recommended');updateCompare();
  async function searchProducts(search,excluded=[]){
    searchController?.abort();const controller=new AbortController();searchController=controller;const token=generation;
    lastSearch=search;lastSearchMessage='';lastSearchStatus=null;excludedProductIds=excluded;visibleChoices=[];recommendedProducts=[];recommendationsReceived=true;
    const timeout=setTimeout(()=>controller.abort(),60000);
    $('catalog-search-submit').disabled=true;$('catalog-refresh').disabled=true;show('catalog-refresh',true);show('catalog-match-note',false);show('catalog-tabs',false);
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
  const card=$('product-card');card.addEventListener('pointerdown',e=>{if(e.target.closest('button,a')||decisionBusy)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0};card.setPointerCapture(e.pointerId);});
  card.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;drag.dx=e.clientX-drag.x;const dy=e.clientY-drag.y;if(Math.abs(dy)>90&&Math.abs(drag.dx)<40){drag=null;card.style.transform='';return;}card.style.transform=`translateX(${drag.dx}px) rotate(${drag.dx/22}deg)`;show('swipe-feedback',Math.abs(drag.dx)>35);text('swipe-feedback',drag.dx>0?'ADDED':'NEXT COLLECTION');});
  const finishDrag=e=>{if(!drag||drag.id!==e.pointerId)return;const dx=drag.dx;drag=null;if(Math.abs(dx)>65)decide(dx>0?'right':'left');else{card.style.transform='';show('swipe-feedback',false);}};card.addEventListener('pointerup',finishDrag);card.addEventListener('pointercancel',()=>{drag=null;card.style.transform='';show('swipe-feedback',false);});
  $('live-canvas').addEventListener('pointerdown',e=>{if(mode!=='desk'||!camera.running)return;const r=e.currentTarget.getBoundingClientRect(),ratio=camera.canvas.width/camera.canvas.height;let w=r.width,h=w/ratio;if(h<r.height){h=r.height;w=h*ratio;}camera.setOptions({x:Math.max(0,Math.min(1,(e.clientX-r.left+(w-r.width)/2)/w)),y:Math.max(0,Math.min(1,(e.clientY-r.top+(h-r.height)/2)/h))});sync();});
  const timer=setInterval(()=>{text('call-timer',connectedAt?`${Math.floor((Date.now()-connectedAt)/60000)}:${String(Math.floor((Date.now()-connectedAt)/1000)%60).padStart(2,'0')}`:'');},1000);
  const visionTimer=setInterval(()=>{updateVisionUI();shareSnapshot('interval');},3000);
  window.addEventListener('pagehide',()=>{clearInterval(timer);clearInterval(visionTimer);endCall('Call ended',false);});document.addEventListener('visibilitychange',()=>{if(!document.hidden||choosingImage)return;if(phase==='active')endCall('Call paused while you were away. Tap to call again.');else if(phase==='browse'&&camera.running){stopHands();camera.stop(false);cameraUI();}});
  for(const d of [$('cart-dialog'),$('details-dialog'),$('catalog-dialog'),$('collections-dialog'),$('compare-dialog'),$('chat-history-dialog')])d.addEventListener('close',()=>{hands.reset();sync();});
  $('mute-call').disabled=true;$('text-input').disabled=true;$('text-toggle').disabled=true;$('chat-send').disabled=true;$('flip-camera').disabled=true;$('gesture-toggle').setAttribute('aria-pressed','true');text('gesture-status','← Next collection · selected item → bag');updateBag();updateVisionUI();updateFocusUI();renderInline();
})();
