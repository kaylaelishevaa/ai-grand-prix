/* Nook mobile call prototype: shared camera snapshots, real AI audio, no purchases. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const store=new window.NookCallState(window.COUPANG_PRODUCTS||[]);
  const defaults={none:{opacity:0},makeup:{opacity:.55,scale:1,rotation:0},clothes:{opacity:1,scale:1,rotation:0},desk:{opacity:1,scale:1,rotation:0,x:.5,y:.74},glasses:{opacity:1,scale:1,rotation:0}};
  const typeLabels={lipstick:'Lipstick',chair:'Chairs',lamp:'Desk lamps',tshirt:'T-shirts',hoodie:'Hoodies',glasses:'Glasses'};
  let phase='incoming',generation=0,facingMode='user',mode='none',trying=null,connectedAt=null,cameraBusy=false,ending=false,decisionBusy=false,handsWanted=false;
  let drag=null,toastTimer,gestureStarting=false,initialGreeting=true,displayedTotal=0;
  let visionWanted=false,visionWasActive=false,visionState='paused',visionLastAt=null;
  let previewEpoch=0,previewMeta=null,catalogType='lipstick',loadingEpoch=0;
  let controlsExpanded=false;
  let voice=null, availabilityChecking=false, networkAllowed=false, checkedTurnId="", interviewContext=null;
  const bridge=window.CoupiCallBridge;
  const firstInterview=new URLSearchParams(location.search).get('interview')==='1';
  $('validated-call').hidden=true;
  if(firstInterview)$('phone-app').dataset.interview='true';
  function reportMedia(){bridge.state({phase,cameraActive:camera.running,microphoneActive:!!voice?.call?.microphone?.getAudioTracks().some(track=>track.readyState==='live'&&track.enabled)});}
  const trusted=p=>p&&store.catalog.get(String(p.id));
  const show=(id,visible)=>{$(id).hidden=!visible;};
  function text(id,value){$(id).textContent=value;}
  function toast(value){clearTimeout(toastTimer);text('toast',value);show('toast',true);toastTimer=setTimeout(()=>show('toast',false),2400);}
  function notice(message, retry=false){text('call-notice',message||'');show('call-notice',!!message);show('retry-call',retry);}
  function screen(next){phase=next;show('incoming-screen',next==='incoming');show('call-screen',['connecting','active','browse'].includes(next));show('end-screen',next==='ended');$('phone-app').dataset.phase=next;updateVisionUI();updateFocusUI();if(voice)reportMedia();}
  function context(){const p=store.current;return {...(interviewContext?{interview:interviewContext}:{}),mode,cameraRunning:camera.running,screen:phase,facing_mode:facingMode,vision:{enabled:visionEnabled(),last_image_at:visionLastAt,state:visionState},tried_product:trying?{id:trying.id,title:trying.name,productType:trying.productType,preview_kind:previewMeta?.kind,shade_color:previewMeta?.shadeColor,shade_estimated:previewMeta?.shadeEstimated}:null,overlay:{...camera.options},visible_product:p?{id:p.id,title:p.name,category:p.category,productType:p.productType,price:p.price,price_is_historical:true,verifiedAttributes:(p.verifiedAttributes||[]).slice(0,2)}:null,cart_ids:[...store.cart.keys()],tried_product_id:trying?.id||null,recent_skipped:store.skipped.slice(-5)};}
  function sync(){voice?.updateContext(context());}
  function cameraUI(){show('camera-fallback',!camera.running);$('toggle-camera').setAttribute('aria-pressed',String(camera.running));$('toggle-camera').setAttribute('aria-label',camera.running?'Turn camera off':'Turn camera on');$('toggle-camera').classList.toggle('is-off',!camera.running);$('flip-camera').disabled=cameraBusy||!camera.running;$('flip-camera').setAttribute('aria-label',facingMode==='user'?'Flip to back camera':'Flip to front camera');$('flip-camera').title=facingMode==='user'?'Flip to back camera':'Flip to front camera';updateVisionUI();updateFocusUI();sync();reportMedia();}
  const camera=new window.NookCamera({video:$('live-video'),canvas:$('live-canvas'),onStatus:(message,kind)=>{
    if(kind==='error'){notice(message,true);text('camera-fallback-text','Your camera is off');}
    else if(kind==='loading'&&cameraBusy)text('camera-fallback-text','Opening your camera…');
    if(camera)cameraUI();
  }});
  camera.setOptions({opacity:0,mirror:true});
  const snapshots=new window.NookCameraSnapshots({video:$('live-video'),previewCanvas:$('live-canvas'),getContext:()=>({mode,mirror:camera.options.mirror,cameraRunning:camera.running}),isEnabled:visionEnabled});
  function updateFocusUI(){
    const active=!!trying&&camera.running&&['active','browse'].includes(phase),focused=active&&!controlsExpanded;
    $('phone-app').dataset.focused=String(focused);
    show('focus-product',focused);show('focus-toggle',active);
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
    $('vision-toggle').setAttribute('aria-label',visionWanted?'Pause camera sharing with Coopy':'Resume camera sharing with Coopy');
    $('vision-toggle').dataset.state=enabled?visionState:'paused';
    const age=visionLastAt?Date.now()-Date.parse(visionLastAt):Infinity;
    const label=!visionWanted?'Coopy’s view is paused':!camera.running?'Camera off · Coopy can’t see':!enabled?'Camera sharing waiting':visionState==='error'?'Camera sharing delayed':visionState==='received'&&age<12000?'Coopy sees snapshots':visionState==='received'?'Refreshing Coopy’s view…':'Sharing camera…';
    text('vision-status',label);text('vision-action',visionWanted?'Pause':'Resume');
  }
  function shareSnapshot(reason='interval'){if(!visionEnabled())return false;const frame=snapshots.capture(reason);return frame?voice.sendCameraSnapshot(frame):false;}

  const hands=new window.NookHandGestures({video:$('live-video'),getMirror:()=>camera.options.mirror,isEnabled:()=>handsWanted&&camera.running&&phase==='active'&&!!store.current&&$('world-picks').hidden&&!decisionBusy&&!$('details-dialog').open&&!$('cart-dialog').open&&!$('catalog-dialog').open,
    onSwipe:direction=>decide(direction),onStatus:(message,kind)=>{text('gesture-status',kind==='error'?'Hand tracking unavailable · swipe the card':hands.running?'Wave or swipe: ← skip · save →':'Preparing hand swipes…');}});
  async function startHands(){if(!handsWanted||!camera.running||!store.current||phase!=='active'||hands.running||gestureStarting)return;gestureStarting=true;try{await hands.start();}finally{gestureStarting=false;handUI();}}
  function handUI(){const active=hands.running&&handsWanted;$('gesture-toggle').setAttribute('aria-pressed',String(active));$('gesture-toggle').setAttribute('aria-label',active?'Disable hand swipes':'Enable hand swipes');$('gesture-toggle').classList.toggle('is-off',!active);}
  function stopHands(){gestureStarting=false;hands.stop();handUI();text('gesture-status','Swipe: ← skip · save →');}
  function transcript(entry){
    let photo;
    if(entry?.role==='user'&&entry.final===true&&entry.synthetic!==true&&entry.superseded!==true&&visionEnabled()){
      const frame=snapshots.capture('validated-turn'),image=frame?.images?.find(image=>image.kind==='camera');
      if(image)photo={dataUrl:image.dataUrl,mime:'image/jpeg',capturedAt:frame.metadata.capturedAt};
    }
    bridge.transcript(entry,photo);if(initialGreeting&&entry.role==='assistant'){store.messages=store.messages.filter(m=>m.key!=='opening');initialGreeting=false;}store.message(entry);const root=$('transcript');root.replaceChildren();for(const item of store.messages){const bubble=document.createElement('div');bubble.className='bubble '+(item.role==='user'?'user':'assistant');const label=document.createElement('span');label.className='bubble-label';label.textContent=item.role==='user'?'You':'Coopy';const body=document.createElement('p');body.className='bubble-text';body.textContent=item.text; bubble.append(label,body);root.append(bubble);}}
  voice=new window.NookVoiceSession({audio:$('voice-audio'),greeting:firstInterview?'Before we find anything, tell me: what do your mornings look like?':'Hi, I’m Coopy. How can I help you today?',getContext:context,getVisionEnabled:visionEnabled,getCameraSnapshot:reason=>snapshots.capture(reason),
    onVisionState:event=>{visionState=event.state;if(event.state==='received')visionLastAt=event.capturedAt||new Date().toISOString();updateVisionUI();sync();},
    onUserTurnStart:()=>{checkedTurnId='';bridge.beginTurn();},onResolveCall:()=>bridge.resolveLatest(),
    onTranscript:transcript,onRecommendations:(list,message)=>recommend(list,message),
    onWorldRecommendations:(list,message)=>worldRecommendations(list,message),
    onWorldProduct:skuId=>bridge.openWorldProduct(skuId),
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
    onPlaybackBlocked:blocked=>show('play-audio',blocked),
    onState:({state,message,muted,connectedAt:at})=>{
      connectedAt=at;const ready=!!voice?.call?.ready;updateVisionUI();reportMedia();
      $('mute-call').disabled=!ready;$('text-input').disabled=!ready;$('text-toggle').disabled=!ready;$('mute-call').setAttribute('aria-pressed',String(muted));$('mute-call').setAttribute('aria-label',muted?'Unmute microphone':'Mute microphone');$('mute-call').classList.toggle('is-off',muted);
      $('phone-app').dataset.voice=state;
      text('call-status',({connecting:'Connecting…',listening:'Listening',thinking:'Thinking',searching:'Finding your picks',speaking:'Coopy is speaking',connected:muted?'Mic muted':'Live with Coopy',reconnecting:'Reconnecting…',error:'Connection paused',idle:'Coopy'})[state]||'Coopy');
      if(ready&&phase==='connecting'){screen('active');notice('');cameraUI();startHands();}
      if(state==='error'&&!ending&&['connecting','active'].includes(phase)){notice(message,true);stopHands();}
      else if(state==='idle'&&phase==='active'&&!ending){endCall(message);}
    }
  });
  window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='coupi-interview-progress')return;const value=event.data;if(!Number.isInteger(value.count)||value.count<0||value.count>5)return;interviewContext={answeredCount:value.count,nextQuestion:String(value.question||'').slice(0,250),complete:value.complete===true,paused:value.paused===true,conversationMode:value.conversationMode||'conversation',worldReady:value.worldReady===true};sync();});
  function checkedNode(tag,className,value){const node=document.createElement(tag);node.className=className;if(value!==undefined)node.textContent=value;return node;}
  function checkedOpen(skuId,callId,reviewId,label){
    const button=checkedNode('button','checked-action',label||'Details & approval');
    button.setAttribute('aria-label',reviewId?'Read review '+reviewId:'Details for '+skuId);
    button.onclick=async()=>{button.disabled=true;try{const result=await bridge.openWorldProduct(skuId,{callId,reviewId});if(!result.ok)notice(result.error);}catch{notice('That checked product could not open. Please try again.');}finally{button.disabled=false;}};return button;
  }
  function checkedCard(product,result,id,primary){
    const card=checkedNode('article','checked-product'+(primary?' checked-product-primary':''));
    if(product.image){const image=checkedNode('img','checked-image');image.src=product.image;image.alt='';image.onerror=()=>{image.hidden=true;};card.append(image);}
    card.append(checkedNode('h2','checked-name',product.name),checkedNode('p','checked-price',product.price===null?'Price unavailable':'₩'+product.price.toLocaleString('en-US')));
    if(product.priceBasis==='historical-reference')card.append(checkedNode('p','checked-note','REFERENCE PRICE · confirm current price on Coupang'));
    if(product.delivery)card.append(checkedNode('p','checked-note',product.delivery));
    if(primary&&result.verdict){
      card.append(checkedNode('p','checked-reason',result.verdict.reason));
      if(result.verdict.dissent)card.append(checkedNode('p','checked-dissent',result.verdict.dissent));
      const citations=checkedNode('div','checked-citations');
      for(const [index,reviewId] of result.verdict.citations.entries())citations.append(checkedOpen(product.skuId,id,reviewId,'review '+(index+1)+' ↗'));
      if(citations.children.length)card.append(citations);
    }
    if(result.proposedSkuIds.includes(product.skuId))card.append(checkedNode('p','checked-note','PENDING YOUR APPROVAL · nothing ordered'));
    card.append(checkedOpen(product.skuId,id));return card;
  }
  bridge.subscribe(event=>{
    if(!['active','connecting'].includes(phase))return;
    const root=$('validated-call-content');
    if(event.state==='pending'){
      checkedTurnId=event.id;root.replaceChildren();show('validated-call',true);show('world-picks',false);show('product-zone',false);show('product-empty',false);
      $('validated-call').dataset.state='pending';text('validated-call-status','CHECKING YOUR WORDS · catalog + your context');controlsExpanded=true;updateFocusUI();if(event.retry)voice.resolveAppTurn?.();return;
    }
    if(event.id!==checkedTurnId)return;
    const result=event.result;root.replaceChildren();$('validated-call').dataset.state=event.state;
    if(event.state==='error'){text('validated-call-status','COULDN’T CHECK THAT');root.append(checkedNode('p','checked-reason',event.error||result.message));return;}
    interviewContext={answeredCount:result.interviewCount||0,nextQuestion:result.question||'',complete:result.interviewComplete===true,paused:result.conversationMode==='request',conversationMode:result.conversationMode,worldReady:result.worldReady===true};sync();
    const substantive=result.conversationMode==='request'||result.verdict||result.inventory||result.status!=='ok'||result.proposedSkuIds.length;
    show('validated-call',!!substantive);if(!substantive)return;
    text('validated-call-status',result.status==='blocked'?'LOOKING OUT FOR YOU':result.status==='fallback'?'NOT ENOUGH EVIDENCE':'CHECKED FOR YOU');
    if(result.message)root.append(checkedNode('p','checked-message',result.message));
    if(result.inventory){
      const list=checkedNode('ul','checked-inventory');for(const item of result.inventory.items)list.append(checkedNode('li','',item.name+(item.quantity?' · '+item.quantity:'')+' — '+item.status));root.append(list);
      for(const gap of result.inventory.lowOrMissing)root.append(checkedNode('p','checked-gap',gap.name+' · '+gap.reason));
      for(const uncertain of result.inventory.uncertainties)root.append(checkedNode('p','checked-note',uncertain));
    }
    const pick=result.verdict?.pickSkuId,products=[...result.products].sort((a,b)=>(b.skuId===pick?1:0)-(a.skuId===pick?1:0));
    for(const product of products.filter(product=>product.skuId===pick||result.proposedSkuIds.includes(product.skuId)))root.append(checkedCard(product,result,event.id,product.skuId===pick));
    if(result.question)root.append(checkedNode('p','checked-question',result.question));
  });
  window.NookMobile={camera,voice,store,endCall,openCatalog};bridge.attach(()=>endCall());
  async function startCamera({strictFacing=false}={}){if(cameraBusy)return false;const preflight=generation;const status=await bridge.getAvailability();if(preflight!==generation)return false;if(status.offline){notice(status.reason||'Offline rehearsal: live camera and tracking are off. Browse the reference picks locally.');return false;}cameraBusy=true;cameraUI();const token=generation;try{const ok=await camera.start({facingMode,portrait:true,strictFacing});if(token!==generation)return false;if(ok){facingMode=camera.actualFacingMode||facingMode;camera.setOptions({mirror:facingMode==='user'});startHands();}else if(!strictFacing)notice(camera.lastCameraError?.message||'Allow Camera in browser settings, then tap Retry.',true);return ok;}finally{if(token===generation){cameraBusy=false;cameraUI();}}}
  async function answer(){if(phase==='connecting'||voice.call||availabilityChecking)return;availabilityChecking=true;$('answer-call').disabled=true;const preflight=generation;const status=await bridge.getAvailability(true);availabilityChecking=false;if(preflight!==generation)return;if(!status.ready){text('incoming-status',status.reason||(status.offline?'Offline rehearsal: live calls are disabled.':'Live voice is not configured on this server.'));show('incoming-status',true);$('answer-call').disabled=false;return;}show('incoming-status',false);const token=++generation;visionWanted=$('vision-consent').checked;visionState='paused';visionLastAt=null;screen('connecting');notice('');text('camera-fallback-text','Opening your camera…');$('answer-call').disabled=true;store.clearMessages();checkedTurnId='';show('validated-call',false);bridge.beginTurn();initialGreeting=true;transcript({role:'assistant',key:'opening',text:'How can I help you today?'});initialGreeting=true;
    try{await startCamera();if(token!==generation||phase!=='connecting')return;await voice.start();}catch{notice('Could not start the call. Check Camera and Microphone permissions.',true);}finally{if(token===generation)$('answer-call').disabled=false;}
  }
  function endCall(message='Call ended'){if(ending)return;ending=true;generation++;previewEpoch++;trying=null;previewMeta=null;mode='none';controlsExpanded=false;cameraBusy=false;decisionBusy=false;stopHands();snapshots.clear();voice.clearCameraSnapshots?.();voice.end();camera.stop(false);camera.setProduct(null);camera.setMode('none');camera.setOptions({opacity:0});loadingEpoch=0;$('product-try').disabled=false;show('tryon-chip',false);connectedAt=null;screen('ended');text('end-title','A little closer to your thing.');text('end-summary',store.cart.size?`${store.cart.size} ${store.cart.size===1?'pick':'picks'} saved for this call. Nothing ordered.`:message==='Call ended'?'Your camera and microphone are off.':message);closeDialogs();ending=false;}
  function previewLabel(){return trying?`${trying.preview?.shadeLabel||trying.brand||typeLabels[trying.productType]||'Product'} · ${trying.category==='makeup'?'shade estimate':'live placement guide'}`:'';}
  async function setMode(next){const token=generation;if(!Object.hasOwn(defaults,next))throw Error('Choose makeup, glasses, clothes, desk, or none.');if(next==='none'){previewEpoch++;trying=null;previewMeta=null;}const changed=mode!==next;mode=next;if(changed||next==='none')camera.setOptions(defaults[next]);await camera.setMode(next);if(token!==generation)return false;if(camera.errors[next])throw Error('Tracking is unavailable. Try again in good light or check your connection.');show('tryon-chip',next!=='none'&&!!trying);text('tryon-label',previewLabel());updateFocusUI();updateVisionUI();sync();return true;}
  async function tryOn(p=store.current){
    p=trusted(p);if(!p||!['active','browse'].includes(phase))throw Error('Choose a product during the call or browse first.');
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
  function renderCard(){const p=store.current;show('product-zone',!!p);if(!p){stopHands();sync();return;}
    const img=$('product-image');img.hidden=!p.image;img.removeAttribute('src');if(p.image){img.src=p.image;img.alt=p.name;img.onerror=()=>{img.hidden=true;};}text('product-title',p.name);text('product-category',typeLabels[p.productType]||({makeup:'Beauty',clothes:'Style',desk:'Your space'})[p.category]);text('product-price',p.price?'₩'+p.price.toLocaleString('en-US')+' · reference':'See price on Coupang');text('product-position',`${Math.max(1,displayedTotal-store.queue.length+1)} / ${displayedTotal}`);$('product-card').style.transform='';$('product-card').style.opacity='';$('product-card').classList.remove('accept','reject');text('swipe-feedback','');show('swipe-feedback',false);sync();startHands();}
  function recommend(list,message){if(!['connecting','active','browse'].includes(phase))return;show('world-picks',false);store.recommend(list);displayedTotal=store.queue.length;hands.reset();renderCard();if(!$('validated-call').hidden)show('product-zone',false);if(!store.current)toast('No match in this demo catalog. Ask Coopy for another idea.');}
  function worldRecommendations(list,message){
    if(!['connecting','active','browse'].includes(phase))return;
    const root=$('world-picks-list');root.replaceChildren();
    for(const product of list.slice(0,4)){
      if(product.catalog_namespace!=='world-simulation'||typeof product.skuId!=='string'||typeof product.name!=='string')continue;
      const row=document.createElement('div');row.className='world-pick';
      const copy=document.createElement('div'),name=document.createElement('strong'),price=document.createElement('span');
      name.textContent=product.name;price.textContent=Number.isFinite(product.price)?'₩'+product.price.toLocaleString('en-US'):'';copy.append(name,price);
      const button=document.createElement('button');button.textContent='Details ↗';button.onclick=async()=>{button.disabled=true;try{const result=await bridge.openWorldProduct(product.skuId);if(!result.ok)notice(result.error);}catch{notice('That product could not open. Please try again.');}finally{button.disabled=false;}};
      row.append(copy,button);root.append(row);
    }
    show('world-picks',root.children.length>0&&$('validated-call').hidden);show('product-zone',false);show('product-empty',false);
    if(!root.children.length)toast(message||'No match in your world catalog.');
    hands.reset();
  }
  function updateBag(){text('cart-count',String(store.cart.size));$('cart-button').setAttribute('aria-label',`Saved this call, ${store.cart.size} items`);sync();}
  async function decide(direction){if(decisionBusy||!store.current)return;decisionBusy=true;const token=generation;const p=store.current;const card=$('product-card');card.classList.add(direction==='right'?'accept':'reject');text('swipe-feedback',direction==='right'?'SAVED':'SKIP');show('swipe-feedback',true);card.style.transform=`translateX(${direction==='right'?110:-110}%) rotate(${direction==='right'?12:-12}deg)`;card.style.opacity='0';await new Promise(resolve=>setTimeout(resolve,220));if(token!==generation)return;if(store.current?.id===p.id){store.decide(direction);updateBag();toast(direction==='right'?'Saved for this call':'Skipped');}decisionBusy=false;hands.reset();renderCard();}
  function productDetails(p=store.current){p=trusted(p);if(!p)return;store.detailProduct=p;text('detail-title',p.name);const img=$('detail-image');img.hidden=!p.image;if(p.image){img.src=p.image;img.alt=p.name;}const attributes=(p.verifiedAttributes||[]).slice(0,4).join(' · ');text('detail-body',(attributes?attributes+'. ':'')+(p.price?'Historical reference: ₩'+p.price.toLocaleString('en-US')+'. ':'')+'Check current price and options on Coupang.');text('detail-preview-note',p.category==='makeup'?'Lip colour is estimated from this listing photo; lighting and finish vary.':'The preview uses this product photo. Placement and fit are approximate.');$('detail-link').href=p.url;window.CoupiReferenceComparison.render(p,[...store.catalog.values()],chosen=>{store.queue=[chosen,...store.queue.filter(item=>item.id!==chosen.id)];displayedTotal=Math.max(displayedTotal,store.queue.length);renderCard();productDetails(chosen);toast('a new pick. still yours to decide.');});if(!$('details-dialog').open)$('details-dialog').showModal();hands.reset();}
  function openCatalog(type=catalogType){
    catalogType=Object.hasOwn(typeLabels,type)?type:'lipstick';const root=$('catalog-items');root.replaceChildren();
    for(const key of Object.keys(typeLabels))$('type-'+key).setAttribute('aria-pressed',String(key===catalogType));
    for(const p of store.catalog.values()){if(p.productType!==catalogType)continue;
      const row=document.createElement('article');row.className='catalog-item';
      const img=document.createElement('img');img.src=p.image;img.alt=p.name;img.loading='lazy';
      const copy=document.createElement('div');const name=document.createElement('strong');name.textContent=p.name;const price=document.createElement('span');price.textContent=p.price?'₩'+p.price.toLocaleString('en-US')+' · reference':'See price on Coupang';copy.append(name,price);
      const button=document.createElement('button');button.textContent='Try it';button.disabled=!networkAllowed;button.setAttribute('aria-label','Try '+p.name);button.onclick=async()=>{const similar=[...store.catalog.values()].filter(item=>item.productType===p.productType&&item.id!==p.id);recommend([p,...similar]);$('catalog-dialog').close();try{await tryOn(p);}catch(e){notice(e.message);}};
      const actions=document.createElement('div');actions.className='catalog-item-actions';const details=document.createElement('button');details.textContent='Details';details.onclick=()=>{$('catalog-dialog').close();productDetails(p);};actions.append(button,details);row.append(img,copy,actions);root.append(row);
    }
    if(!$('catalog-dialog').open)$('catalog-dialog').showModal();hands.reset();
  }
  function openBag(){const root=$('cart-items');root.replaceChildren();if(!store.cart.size){const p=document.createElement('p');p.textContent='Swipe right on a product to save it here.';root.append(p);}for(const p of store.cart.values()){const row=document.createElement('div');row.className='bag-item';const title=document.createElement('strong');title.textContent=p.name;const controls=document.createElement('div');const link=document.createElement('a');link.href=p.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Coupang ↗';const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>{store.cart.delete(String(p.id));updateBag();openBag();};controls.append(link,remove);row.append(title,controls);root.append(row);}if(!$('cart-dialog').open)$('cart-dialog').showModal();hands.reset();}
  function closeDialogs(){for(const id of ['cart-dialog','details-dialog','catalog-dialog'])if($(id).open)$(id).close();}
  async function productAction(action,productId){const p=productId?store.queue.find(p=>String(p.id)===String(productId)):store.current;if(!p)throw Error('That product is not in the current recommendations. Search first.');if(productId&&store.current?.id!==p.id){store.queue=[p,...store.queue.filter(x=>x.id!==p.id)];renderCard();}if(action==='save')await decide('right');else if(action==='skip')await decide('left');else if(action==='try_on'){if(!(await tryOn(p))?.ok)throw Error('The product preview was cancelled.');}else if(action==='details'||action==='browse')productDetails(p);else throw Error('Unsupported product action.');return {ok:true,action,product:p,cart_count:store.cart.size,purchased:false,preview_is_approximate:true,...(action==='try_on'?{preview_kind:previewMeta?.kind,shade_estimated:previewMeta?.shadeEstimated}:{} )};}
  function browse(){screen('browse');text('call-status','Explore your way');text('camera-fallback-text','A little inspiration, before we talk.');notice('',true);text('retry-call','Start video call');recommend([...store.catalog.values()].filter((p,i,list)=>list.findIndex(q=>q.category===p.category)===i));cameraUI();}
  $('answer-call').onclick=answer;$('call-again').onclick=()=>{screen('incoming');answer();};$('decline-call').onclick=browse;$('end-call').onclick=()=>endCall();
  $('mute-call').onclick=()=>voice.mute();$('text-toggle').onclick=()=>{show('text-form',$('text-form').hidden);$('text-toggle').setAttribute('aria-expanded',String(!$('text-form').hidden));if(!$('text-form').hidden)$('text-input').focus();};$('text-form').onsubmit=e=>{e.preventDefault();if(voice.sendText($('text-input').value)){$('text-input').value='';show('text-form',false);}};
  $('play-audio').onclick=()=>voice.resumeAudio().catch(()=>notice('Tap again to enable speaker audio.'));
  $('retry-call').onclick=async()=>{text('retry-call','Retry');if(voice.call?.ready){await startCamera();return;}voice.end();screen('incoming');answer();};
  $('toggle-camera').onclick=async()=>{if(cameraBusy)return;if(camera.running){stopHands();camera.stop(false);text('camera-fallback-text','Camera off. We can keep talking.');cameraUI();}else await startCamera();};
  $('flip-camera').onclick=async()=>{if(cameraBusy||!camera.running)return;const token=generation,previous=facingMode;stopHands();facingMode=previous==='user'?'environment':'user';const ok=await startCamera({strictFacing:true});if(token!==generation)return;if(!ok){facingMode=previous;const restored=await startCamera();if(token!==generation)return;notice(restored?'This device has no available camera on the other side. Your original camera is still on.':'The other camera is unavailable. Tap Camera to reconnect.',!restored);}else{notice('');toast(facingMode==='environment'?'Back camera':'Front camera');}};
  $('focus-toggle').onclick=()=>{controlsExpanded=!controlsExpanded;updateFocusUI();};
  $('focus-product').onclick=()=>{controlsExpanded=true;updateFocusUI();};
  $('vision-toggle').onclick=()=>{visionWanted=!visionWanted;$('vision-consent').checked=visionWanted;updateVisionUI();updateFocusUI();sync();if(visionWanted)shareSnapshot('resume');toast(visionWanted?'Camera sharing on':'Coopy’s camera view paused');};
  $('vision-consent').onchange=()=>{visionWanted=$('vision-consent').checked;updateVisionUI();updateFocusUI();};
  $('gesture-toggle').onclick=async()=>{if(!networkAllowed||!camera.running){toast('Turn on your camera to use hand swipes.');return;}handsWanted=!handsWanted;if(handsWanted)await startHands();else stopHands();handUI();toast(hands.running?'Hand swipes on':'Hand swipes off');};
  $('clear-tryon').onclick=()=>setMode('none');$('product-try').onclick=()=>tryOn().catch(e=>notice(e.message));$('product-details').onclick=()=>productDetails();$('product-skip').onclick=()=>decide('left');$('product-save').onclick=()=>decide('right');$('cart-button').onclick=openBag;$('close-cart').onclick=()=>$('cart-dialog').close();$('close-details').onclick=()=>$('details-dialog').close();
  $('catalog-button').onclick=()=>openCatalog();$('close-catalog').onclick=()=>$('catalog-dialog').close();for(const key of Object.keys(typeLabels))$('type-'+key).onclick=()=>openCatalog(key);text('catalog-button',store.catalog.size+' picks');
  $('detail-ask').onclick=async()=>{const p=store.detailProduct;if(!p)return;$('details-dialog').close();try{const result=await bridge.openWorldProduct(p.id);if(!result.ok)notice(result.error);}catch{notice('Details could not open. Please try again.');}};
  const card=$('product-card');card.addEventListener('pointerdown',e=>{if(e.target.closest('button,a')||decisionBusy)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0};card.setPointerCapture(e.pointerId);});
  card.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;drag.dx=e.clientX-drag.x;const dy=e.clientY-drag.y;if(Math.abs(dy)>90&&Math.abs(drag.dx)<40){drag=null;card.style.transform='';return;}card.style.transform=`translateX(${drag.dx}px) rotate(${drag.dx/22}deg)`;show('swipe-feedback',Math.abs(drag.dx)>35);text('swipe-feedback',drag.dx>0?'SAVE':'SKIP');});
  const finishDrag=e=>{if(!drag||drag.id!==e.pointerId)return;const dx=drag.dx;drag=null;if(Math.abs(dx)>65)decide(dx>0?'right':'left');else{card.style.transform='';show('swipe-feedback',false);}};card.addEventListener('pointerup',finishDrag);card.addEventListener('pointercancel',()=>{drag=null;card.style.transform='';show('swipe-feedback',false);});
  $('live-canvas').addEventListener('pointerdown',e=>{if(mode!=='desk'||!camera.running)return;const r=e.currentTarget.getBoundingClientRect(),ratio=camera.canvas.width/camera.canvas.height;let w=r.width,h=w/ratio;if(h<r.height){h=r.height;w=h*ratio;}camera.setOptions({x:Math.max(0,Math.min(1,(e.clientX-r.left+(w-r.width)/2)/w)),y:Math.max(0,Math.min(1,(e.clientY-r.top+(h-r.height)/2)/h))});sync();});
  const timer=setInterval(()=>{text('call-timer',connectedAt?`${Math.floor((Date.now()-connectedAt)/60000)}:${String(Math.floor((Date.now()-connectedAt)/1000)%60).padStart(2,'0')}`:'');},1000);
  const visionTimer=setInterval(()=>{updateVisionUI();shareSnapshot('interval');},3000);
  window.addEventListener('pagehide',()=>{clearInterval(timer);clearInterval(visionTimer);endCall();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)return;if(phase==='active')endCall('Call paused while you were away. Tap to call again.');else if(phase==='browse'&&camera.running){stopHands();camera.stop(false);cameraUI();}});
  for(const d of [$('cart-dialog'),$('details-dialog'),$('catalog-dialog')])d.addEventListener('close',()=>hands.reset());
  for(const id of ['answer-call','call-again','retry-call','product-try','toggle-camera','flip-camera','gesture-toggle'])$(id).disabled=true;
  bridge.getAvailability().then(status=>{networkAllowed=!status.offline;$('answer-call').disabled=!status.ready;$('call-again').disabled=!status.ready;$('retry-call').disabled=!status.ready;for(const id of ['product-try','toggle-camera','gesture-toggle'])$(id).disabled=!networkAllowed;if(!status.ready){text('incoming-status',status.reason||(status.offline?'Offline rehearsal: live voice and camera are off.':'Voice is not configured yet. Local reference picks are available.'));show('incoming-status',true);}});
  $('mute-call').disabled=true;$('text-input').disabled=true;$('text-toggle').disabled=true;$('flip-camera').disabled=true;$('gesture-toggle').setAttribute('aria-pressed','false');text('gesture-status','Swipe: ← skip · save →');updateBag();cameraUI();handUI();
})();
