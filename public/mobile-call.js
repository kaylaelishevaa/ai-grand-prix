/* Nook mobile call prototype: shared camera snapshots, real AI audio, no purchases. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const store=new window.NookCallState(window.COUPANG_PRODUCTS||[]);
  const defaults={none:{opacity:0},makeup:{opacity:.55,scale:1,rotation:0},clothes:{opacity:1,scale:1,rotation:0},desk:{opacity:1,scale:1,rotation:0,x:.5,y:.74},glasses:{opacity:1,scale:1,rotation:0}};
  const typeLabels={lipstick:'Lipstick',chair:'Chairs',lamp:'Desk lamps',tshirt:'T-shirts',hoodie:'Hoodies',glasses:'Glasses'};
  let phase='incoming',generation=0,facingMode='user',mode='none',trying=null,connectedAt=null,cameraBusy=false,ending=false,decisionBusy=false,handsWanted=true;
  let drag=null,toastTimer,gestureStarting=false,initialGreeting=true,displayedTotal=0;
  let visionWanted=true,visionWasActive=false,visionState='paused',visionLastAt=null;
  let previewEpoch=0,previewMeta=null,catalogType='recommended',loadingEpoch=0;
  let recommendationsReceived=false,recommendedProducts=[],searchController=null;
  let lastSearch=null,lastSearchMessage='',lastSearchStatus=null,excludedProductIds=[],visibleChoices=[],catalogTryButtons=[];
  const productLabel=p=>typeLabels[p.productType]||'Product';
  const canPreview=p=>Object.hasOwn(defaults,p.category);
  const isLiveListing=p=>p.source==='coupang_web';
  let controlsExpanded=false;
  let textMode=false;
  const historyRows=new Map();
  let voice=null;
  const trusted=p=>p&&store.catalog.get(String(p.id));
  const show=(id,visible)=>{$(id).hidden=!visible;};
  function text(id,value){$(id).textContent=value;}
  function toast(value){clearTimeout(toastTimer);text('toast',value);show('toast',true);toastTimer=setTimeout(()=>show('toast',false),2400);}
  function notice(message, retry=false){text('call-notice',message||'');show('call-notice',!!message);show('retry-call',retry);}
  function screen(next){phase=next;show('incoming-screen',next==='incoming');show('call-screen',['connecting','active','browse'].includes(next));show('end-screen',next==='ended');$('phone-app').dataset.phase=next;updateVisionUI();updateFocusUI();}
  function context(){const p=store.current;return {mode,cameraRunning:camera.running,screen:phase,facing_mode:facingMode,vision:{enabled:visionEnabled(),last_image_at:visionLastAt,state:visionState},tried_product:trying?{id:trying.id,title:trying.name,productType:trying.productType,preview_kind:previewMeta?.kind,shade_color:previewMeta?.shadeColor,shade_estimated:previewMeta?.shadeEstimated}:null,overlay:{...camera.options},visible_product:p?{id:p.id,title:p.name,category:p.category,productType:p.productType,price:p.price,price_is_historical:!isLiveListing(p),verifiedAttributes:(p.verifiedAttributes||[]).slice(0,2)}:null,cart_ids:[...store.cart.keys()],tried_product_id:trying?.id||null,recent_skipped:store.skipped.slice(-5)};}
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
    $('focus-toggle').setAttribute('aria-label',controlsExpanded?'Minimize product and controls':'Show product and controls');
    text('focus-toggle-label',controlsExpanded?'Less':'More');
    text('focus-product-label',trying?(typeLabels[trying.productType]||'Product')+' · Products':'Products');
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

  const hands=new window.NookHandGestures({video:$('live-video'),getMirror:()=>camera.options.mirror,isEnabled:()=>!textMode&&handsWanted&&camera.running&&phase==='active'&&!!store.current&&!decisionBusy&&!$('details-dialog').open&&!$('cart-dialog').open&&!$('catalog-dialog').open,
    onSwipe:direction=>decide(direction),onStatus:(message,kind)=>{text('gesture-status',kind==='error'?'Hand tracking unavailable · swipe the card':hands.running?'Wave or swipe: ← skip · save →':'Preparing hand swipes…');}});
  async function startHands(){if(!handsWanted||!camera.running||!store.current||phase!=='active'||hands.running||gestureStarting)return;gestureStarting=true;try{await hands.start();}finally{gestureStarting=false;}}
  function stopHands(){gestureStarting=false;hands.stop();text('gesture-status','Swipe: ← skip · save →');}
  function renderHistory(follow=false){
    if(!textMode)return;
    const root=$('conversation-history');
    const atBottom=root.scrollHeight-root.scrollTop-root.clientHeight<=48;
    const keys=new Set(store.messages.map(message=>message.key));
    for(const [key,row] of historyRows)if(!keys.has(key)){root.removeChild(row.element);historyRows.delete(key);}
    for(const message of store.messages){
      let row=historyRows.get(message.key);
      if(!row){
        const element=document.createElement('article');element.className='history-message '+(message.role==='user'?'user':'assistant');
        const label=document.createElement('strong');label.textContent=message.role==='user'?'You':'Coupi';
        const body=document.createElement('p');element.append(label,body);root.append(element);
        row={element,body};historyRows.set(message.key,row);
      }
      if(row.body.textContent!==message.text)row.body.textContent=message.text;
    }
    if(follow||atBottom)root.scrollTop=root.scrollHeight;
  }
  function setTextMode(enabled){
    textMode=enabled;$('phone-app').dataset.textMode=String(enabled);hands.reset();
    voice.setTextMode(enabled);
    $('text-toggle').disabled=!voice?.call?.ready&&!enabled;
    show('text-form',enabled);show('conversation-history',enabled);show('transcript',!enabled&&!!store.messages.length);
    $('text-toggle').setAttribute('aria-expanded',String(enabled));$('text-toggle').setAttribute('aria-pressed',String(enabled));
    $('text-toggle').setAttribute('aria-label',enabled?'Close text conversation':'Open text conversation');
    updateFocusUI();renderHistory(true);
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
    renderHistory(entry.role==='user'&&entry.key===current.key);
  }
  voice=new window.NookVoiceSession({audio:$('voice-audio'),greeting:'Hi, I’m Coupi. How can I help you today?',getContext:context,getVisionEnabled:visionEnabled,getCameraSnapshot:reason=>snapshots.capture(reason),
    onVisionState:event=>{visionState=event.state;if(event.state==='received')visionLastAt=event.capturedAt||new Date().toISOString();updateVisionUI();sync();},
    onTranscript:transcript,onRecommendations:(list,message,search,status)=>{searchController?.abort();searchController=null;$('catalog-search-submit').disabled=false;$('catalog-refresh').disabled=false;receiveRecommendations(list,message,search,[],status);},
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
    onPlaybackBlocked:blocked=>show('play-audio',blocked&&!textMode),
    onState:({state,message,muted,connectedAt:at})=>{
      connectedAt=at;const ready=!!voice?.call?.ready;updateVisionUI();
      $('mute-call').disabled=!ready||textMode;$('text-input').disabled=!ready;$('text-toggle').disabled=!ready&&!textMode;$('mute-call').setAttribute('aria-pressed',String(muted));$('mute-call').setAttribute('aria-label',textMode?'Microphone off in text mode':muted?'Unmute microphone':'Mute microphone');$('mute-call').classList.toggle('is-off',muted);
      $('mute-call').title=textMode?'Close text mode to use the microphone':muted?'Unmute microphone':'Mute microphone';
      $('phone-app').dataset.voice=state;
      text('call-status',({connecting:'Connecting…',listening:textMode?'Text mode':'Listening',thinking:'Thinking',searching:'Finding your picks',speaking:textMode?'Replying…':'Coupi is speaking',connected:textMode?'Text mode':muted?'Mic muted':'Live with Coupi',reconnecting:'Reconnecting…',error:'Connection paused',idle:'Coupi'})[state]||'Coupi');
      if(ready&&phase==='connecting'){screen('active');notice('');cameraUI();startHands();}
      if(state==='error'&&!ending&&['connecting','active'].includes(phase)){notice(message,true);stopHands();}
      else if(state==='idle'&&phase==='active'&&!ending){endCall(message);}
    }
  });
  window.NookMobile={camera,voice,store};
  async function startCamera({strictFacing=false}={}){if(cameraBusy)return false;cameraBusy=true;cameraUI();const token=generation;try{const ok=await camera.start({facingMode,portrait:true,strictFacing});if(token!==generation)return false;if(ok){facingMode=camera.actualFacingMode||facingMode;camera.setOptions({mirror:facingMode==='user'});startHands();}else if(!strictFacing)notice(camera.lastCameraError?.message||'Allow Camera in browser settings, then tap Retry.',true);return ok;}finally{if(token===generation){cameraBusy=false;cameraUI();}}}
  async function answer(){if(phase==='connecting'||voice.call)return;const token=++generation;visionWanted=$('vision-consent').checked;visionState='paused';visionLastAt=null;screen('connecting');notice('');text('camera-fallback-text',visionWanted?'Opening your camera…':'Camera off. Tap Camera to turn it on.');$('answer-call').disabled=true;store.clearMessages();historyRows.clear();$('conversation-history').replaceChildren();initialGreeting=true;transcript({role:'assistant',key:'opening',text:'How can I help you today?'});initialGreeting=true;
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
    ending=true;generation++;previewEpoch++;trying=null;previewMeta=null;mode='none';controlsExpanded=false;cameraBusy=false;decisionBusy=false;
    stopHands();snapshots.clear();voice.clearCameraSnapshots?.();voice.end();camera.stop(false);camera.setProduct(null);camera.setMode('none');camera.setOptions({opacity:0});
    loadingEpoch=0;$('product-try').disabled=false;$('answer-call').disabled=false;show('tryon-chip',false);connectedAt=null;
    screen(message==='Call ended'?'incoming':'ended');
    text('end-title','A little closer to your thing.');
    text('end-summary',store.cart.size?`${store.cart.size} ${store.cart.size===1?'pick':'picks'} saved in your demo bag.`:message==='Call ended'?'Your camera and microphone are off.':message);
    closeDialogs();ending=false;
    if(completed){try{window.localStorage.setItem('coupi_first_call_done','1');}catch{/* Storage may be unavailable. */}}
  }
  function previewLabel(){return trying?`${trying.preview?.shadeLabel||trying.brand||typeLabels[trying.productType]||'Product'} · ${trying.category==='makeup'?'shade estimate':'live placement guide'}`:'';}
  async function setMode(next){const token=generation;if(!Object.hasOwn(defaults,next))throw Error('Choose makeup, glasses, clothes, desk, or none.');if(next==='none'){previewEpoch++;trying=null;previewMeta=null;}const changed=mode!==next;mode=next;if(changed||next==='none')camera.setOptions(defaults[next]);await camera.setMode(next);if(token!==generation)return false;if(camera.errors[next])throw Error('Tracking is unavailable. Try again in good light or check your connection.');show('tryon-chip',next!=='none'&&!!trying);text('tryon-label',previewLabel());updateFocusUI();updateVisionUI();sync();return true;}
  async function tryOn(p=store.current){
    p=trusted(p);if(!p||!['active','browse'].includes(phase))throw Error('Choose a product during the call or browse first.');
    if(!p.image)throw Error('This product has no preview photo. Choose another product.');
    const token=generation,epoch=++previewEpoch;loadingEpoch=epoch;notice('');$('product-try').disabled=true;toast('Loading the product photo…');
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
    finally{if(loadingEpoch===epoch){loadingEpoch=0;$('product-try').disabled=false;}}
  }
  function renderCard(){const p=store.current;show('product-zone',!!p);updateFocusUI();if(!p){stopHands();sync();return;}
    const img=$('product-image');img.hidden=!p.image;img.removeAttribute('src');if(p.image){img.src=p.image;img.alt=p.name;img.onerror=()=>{img.hidden=true;};}text('product-title',p.name);text('product-category',typeLabels[p.productType]||({makeup:'Beauty',clothes:'Style',desk:'Your space'})[p.category]);text('product-price',p.price?'₩'+p.price.toLocaleString('en-US')+(isLiveListing(p)?' · listed':' · reference'):'Price unavailable');text('product-position',`${Math.max(1,displayedTotal-store.queue.length+1)} / ${displayedTotal}`);$('product-try').disabled=!p.image;$('product-card').style.transform='';$('product-card').style.opacity='';$('product-card').classList.remove('accept','reject');text('swipe-feedback','');show('swipe-feedback',false);sync();startHands();}
  function recommend(list,message){if(!['connecting','active','browse'].includes(phase))return;store.recommend(list.slice(0,15));displayedTotal=store.queue.length;hands.reset();renderCard();if(!store.current&&message)toast(message);}
  function updateBag(){text('cart-count',String(store.cart.size));$('cart-button').setAttribute('aria-label',`Open demo bag, ${store.cart.size} items`);sync();}
  async function decide(direction){if(decisionBusy||!store.current)return;decisionBusy=true;const token=generation;const p=store.current;const card=$('product-card');card.classList.add(direction==='right'?'accept':'reject');text('swipe-feedback',direction==='right'?'SAVED':'SKIP');show('swipe-feedback',true);card.style.transform=`translateX(${direction==='right'?110:-110}%) rotate(${direction==='right'?12:-12}deg)`;card.style.opacity='0';await new Promise(resolve=>setTimeout(resolve,220));if(token!==generation)return;if(store.current?.id===p.id){store.decide(direction);updateBag();toast(direction==='right'?'Saved to your demo bag':'Skipped');}decisionBusy=false;hands.reset();renderCard();}
  function productDetails(p=store.current){
    p=trusted(p);if(!p)return;store.detailProduct=p;text('detail-title',p.name);
    const img=$('detail-image');img.hidden=!p.image;img.removeAttribute('src');if(p.image){img.src=p.image;img.alt=p.name;}
    const introduction=p.description?.trim()||p.verifiedAttributes?.[0]||p.name;
    const price=Number.isFinite(p.price)?(isLiveListing(p)?'Listed price: ₩':'Historical reference: ₩')+p.price.toLocaleString('en-US')+'.':'Price unavailable.';
    text('detail-body',introduction+(/[.!?。！？]$/u.test(introduction)?' ':'. ')+price);
    text('detail-preview-note',!p.image?'No preview photo is available for this product.':p.category==='makeup'?'Lip colour is estimated from this listing photo; lighting and finish vary.':'The preview uses this product photo. Placement and fit are approximate.');
    $('details-dialog').showModal();hands.reset();
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
    store.addSearchProducts(matches);recommendationsReceived=true;recommend(matches,message);recommendedProducts=store.queue.slice(0,15);closeDialogs();openCatalog('recommended');
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
      const canTry=canPreview(entry.product)&&!!entry.product.image&&!entry.imageUnavailable;
      entry.button.textContent=!canPreview(entry.product)?'Details only':canTry?'Try it':'No preview';
      entry.button.disabled=!canTry||cameraBusy;
      entry.button.setAttribute('aria-label',canTry?'Try '+entry.product.name:!canPreview(entry.product)?'Try-on unavailable for '+entry.product.name:'Preview unavailable for '+entry.product.name);
    }
  }
  function openCatalog(type=catalogType){
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
        recommend([p,...choices.filter(item=>item.id!==p.id)]);$('catalog-dialog').close();try{await tryOn(p);}catch(e){notice(e.message);}
      };
      img.onerror=()=>{img.hidden=true;entry.imageUnavailable=true;updateCatalogTryButtons();};row.append(img,copy,button);root.append(row);
    }
    updateCatalogTryButtons();
    if(!$('catalog-dialog').open)$('catalog-dialog').showModal();hands.reset();
  }
  function openBag(){const root=$('cart-items');root.replaceChildren();if(!store.cart.size){const p=document.createElement('p');p.textContent='Swipe right on a product to save it here.';root.append(p);}for(const p of store.cart.values()){const row=document.createElement('div');row.className='bag-item';const title=document.createElement('strong');title.textContent=p.name;const controls=document.createElement('div');const details=document.createElement('button');details.type='button';details.textContent='Show details';details.onclick=()=>productDetails(p);const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>{store.cart.delete(String(p.id));updateBag();openBag();};controls.append(details,remove);row.append(title,controls);root.append(row);}if(!$('cart-dialog').open)$('cart-dialog').showModal();hands.reset();}
  function closeDialogs(){for(const id of ['cart-dialog','details-dialog','catalog-dialog'])if($(id).open)$(id).close();}
  async function productAction(action,productId){const p=productId?store.queue.find(p=>String(p.id)===String(productId)):store.current;if(!p)throw Error('That product is not in the current recommendations. Search first.');if(productId&&store.current?.id!==p.id){store.queue=[p,...store.queue.filter(x=>x.id!==p.id)];renderCard();}if(action==='save')await decide('right');else if(action==='skip')await decide('left');else if(action==='try_on'){if($('catalog-dialog').open)$('catalog-dialog').close();if(!(await tryOn(p))?.ok)throw Error('The product preview was cancelled.');}else if(action==='details'||action==='browse')productDetails(p);else throw Error('Unsupported product action.');return {ok:true,action,product:p,cart_count:store.cart.size,purchased:false,preview_is_approximate:true,...(action==='try_on'?{preview_kind:previewMeta?.kind,shade_estimated:previewMeta?.shadeEstimated}:{} )};}
  function browse(){recommendationsReceived=false;recommendedProducts=[];lastSearch=null;lastSearchMessage='';lastSearchStatus=null;excludedProductIds=[];screen('browse');text('call-status','Explore your way');text('camera-fallback-text','A little inspiration, before we talk.');notice('',true);text('retry-call','Start video call');recommend(catalogChoices());cameraUI();openCatalog('recommended');}
  $('answer-call').onclick=answer;$('call-again').onclick=()=>{screen('incoming');answer();};$('decline-call').onclick=browse;$('end-call').onclick=()=>endCall();
  $('mute-call').onclick=()=>voice.mute();$('text-toggle').onclick=()=>setTextMode(!textMode);
  $('text-form').onsubmit=e=>{e.preventDefault();if(voice.sendText($('text-input').value)){$('text-input').value='';renderHistory(true);$('text-input').focus();}};
  $('play-audio').onclick=()=>voice.resumeAudio().catch(()=>notice('Tap again to enable speaker audio.'));
  $('retry-call').onclick=async()=>{text('retry-call','Retry');if(voice.call?.ready){await startCamera();return;}voice.end();screen('incoming');answer();};
  $('toggle-camera').onclick=async()=>{if(cameraBusy)return;if(camera.running){stopHands();camera.stop(false);text('camera-fallback-text','Camera off. We can keep talking.');cameraUI();}else await startCamera();};
  $('flip-camera').onclick=async()=>{if(cameraBusy||!camera.running)return;const token=generation,previous=facingMode;stopHands();facingMode=previous==='user'?'environment':'user';const ok=await startCamera({strictFacing:true});if(token!==generation)return;if(!ok){facingMode=previous;const restored=await startCamera();if(token!==generation)return;notice(restored?'This device has no available camera on the other side. Your original camera is still on.':'The other camera is unavailable. Tap Camera to reconnect.',!restored);}else{notice('');toast(facingMode==='environment'?'Back camera':'Front camera');}};
  $('focus-toggle').onclick=()=>{controlsExpanded=!controlsExpanded;updateFocusUI();};
  $('focus-product').onclick=()=>{controlsExpanded=true;updateFocusUI();};
  $('vision-toggle').onclick=()=>{visionWanted=!visionWanted;$('vision-consent').checked=visionWanted;updateVisionUI();updateFocusUI();sync();if(visionWanted)shareSnapshot('resume');toast(visionWanted?'Camera sharing on':'Coupi’s camera view paused');};
  $('vision-consent').onchange=()=>{visionWanted=$('vision-consent').checked;updateVisionUI();updateFocusUI();};
  $('gesture-toggle').onclick=()=>{handsWanted=!handsWanted;$('gesture-toggle').setAttribute('aria-pressed',String(handsWanted));$('gesture-toggle').classList.toggle('is-off',!handsWanted);if(handsWanted)startHands();else stopHands();toast(handsWanted?'Hand swipes on':'Hand swipes off');};
  $('clear-tryon').onclick=()=>setMode('none');$('product-try').onclick=()=>tryOn().catch(e=>notice(e.message));$('product-details').onclick=()=>productDetails();$('product-skip').onclick=()=>decide('left');$('product-save').onclick=()=>decide('right');$('cart-button').onclick=openBag;$('close-cart').onclick=()=>$('cart-dialog').close();$('close-details').onclick=()=>$('details-dialog').close();
  $('catalog-button').onclick=()=>openCatalog('recommended');$('close-catalog').onclick=()=>$('catalog-dialog').close();for(const key of ['recommended',...Object.keys(typeLabels)])$('type-'+key).onclick=()=>openCatalog(key);text('catalog-button','Choose a product');
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
  card.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;drag.dx=e.clientX-drag.x;const dy=e.clientY-drag.y;if(Math.abs(dy)>90&&Math.abs(drag.dx)<40){drag=null;card.style.transform='';return;}card.style.transform=`translateX(${drag.dx}px) rotate(${drag.dx/22}deg)`;show('swipe-feedback',Math.abs(drag.dx)>35);text('swipe-feedback',drag.dx>0?'SAVE':'SKIP');});
  const finishDrag=e=>{if(!drag||drag.id!==e.pointerId)return;const dx=drag.dx;drag=null;if(Math.abs(dx)>65)decide(dx>0?'right':'left');else{card.style.transform='';show('swipe-feedback',false);}};card.addEventListener('pointerup',finishDrag);card.addEventListener('pointercancel',()=>{drag=null;card.style.transform='';show('swipe-feedback',false);});
  $('live-canvas').addEventListener('pointerdown',e=>{if(mode!=='desk'||!camera.running)return;const r=e.currentTarget.getBoundingClientRect(),ratio=camera.canvas.width/camera.canvas.height;let w=r.width,h=w/ratio;if(h<r.height){h=r.height;w=h*ratio;}camera.setOptions({x:Math.max(0,Math.min(1,(e.clientX-r.left+(w-r.width)/2)/w)),y:Math.max(0,Math.min(1,(e.clientY-r.top+(h-r.height)/2)/h))});sync();});
  const timer=setInterval(()=>{text('call-timer',connectedAt?`${Math.floor((Date.now()-connectedAt)/60000)}:${String(Math.floor((Date.now()-connectedAt)/1000)%60).padStart(2,'0')}`:'');},1000);
  const visionTimer=setInterval(()=>{updateVisionUI();shareSnapshot('interval');},3000);
  window.addEventListener('pagehide',()=>{clearInterval(timer);clearInterval(visionTimer);endCall('Call ended',false);});document.addEventListener('visibilitychange',()=>{if(!document.hidden)return;if(phase==='active')endCall('Call paused while you were away. Tap to call again.');else if(phase==='browse'&&camera.running){stopHands();camera.stop(false);cameraUI();}});
  for(const d of [$('cart-dialog'),$('details-dialog'),$('catalog-dialog')])d.addEventListener('close',()=>hands.reset());
  $('mute-call').disabled=true;$('text-input').disabled=true;$('text-toggle').disabled=true;$('flip-camera').disabled=true;$('gesture-toggle').setAttribute('aria-pressed','true');text('gesture-status','Swipe: ← skip · save →');updateBag();updateVisionUI();updateFocusUI();
})();
