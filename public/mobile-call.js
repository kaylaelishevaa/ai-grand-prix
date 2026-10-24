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
  let previewEpoch=0,previewMeta=null,catalogType='lipstick',loadingEpoch=0;
  let controlsExpanded=false;
  let voice=null;
  const trusted=p=>p&&store.catalog.get(String(p.id));
  const show=(id,visible)=>{$(id).hidden=!visible;};
  function text(id,value){$(id).textContent=value;}
  function toast(value){clearTimeout(toastTimer);text('toast',value);show('toast',true);toastTimer=setTimeout(()=>show('toast',false),2400);}
  function notice(message, retry=false){text('call-notice',message||'');show('call-notice',!!message);show('retry-call',retry);}
  function screen(next){phase=next;show('incoming-screen',next==='incoming');show('call-screen',['connecting','active','browse'].includes(next));show('end-screen',next==='ended');$('phone-app').dataset.phase=next;updateVisionUI();updateFocusUI();}
  function context(){const p=store.current;return {mode,cameraRunning:camera.running,screen:phase,facing_mode:facingMode,vision:{enabled:visionEnabled(),last_image_at:visionLastAt,state:visionState},tried_product:trying?{id:trying.id,title:trying.name,productType:trying.productType,preview_kind:previewMeta?.kind,shade_color:previewMeta?.shadeColor,shade_estimated:previewMeta?.shadeEstimated}:null,overlay:{...camera.options},visible_product:p?{id:p.id,title:p.name,category:p.category,productType:p.productType,price:p.price,price_is_historical:true,verifiedAttributes:(p.verifiedAttributes||[]).slice(0,2)}:null,cart_ids:[...store.cart.keys()],tried_product_id:trying?.id||null,recent_skipped:store.skipped.slice(-5)};}
  function sync(){voice?.updateContext(context());}
  function cameraUI(){show('camera-fallback',!camera.running);$('toggle-camera').setAttribute('aria-pressed',String(!camera.running));$('toggle-camera').setAttribute('aria-label',camera.running?'Turn camera off':'Turn camera on');$('toggle-camera').classList.toggle('is-off',!camera.running);$('flip-camera').disabled=cameraBusy||!camera.running;$('flip-camera').setAttribute('aria-label',facingMode==='user'?'Flip to back camera':'Flip to front camera');$('flip-camera').title=facingMode==='user'?'Flip to back camera':'Flip to front camera';updateVisionUI();updateFocusUI();sync();}
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
    show('gesture-status',!!store.current&&!focused&&['connecting','active','browse'].includes(phase));
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

  const hands=new window.NookHandGestures({video:$('live-video'),getMirror:()=>camera.options.mirror,isEnabled:()=>handsWanted&&camera.running&&phase==='active'&&!!store.current&&!decisionBusy&&!$('details-dialog').open&&!$('cart-dialog').open&&!$('catalog-dialog').open,
    onSwipe:direction=>decide(direction),onStatus:(message,kind)=>{text('gesture-status',kind==='error'?'Hand tracking unavailable · swipe the card':hands.running?'Wave or swipe: ← skip · save →':'Preparing hand swipes…');}});
  async function startHands(){if(!handsWanted||!camera.running||!store.current||phase!=='active'||hands.running||gestureStarting)return;gestureStarting=true;try{await hands.start();}finally{gestureStarting=false;}}
  function stopHands(){gestureStarting=false;hands.stop();text('gesture-status','Swipe: ← skip · save →');}
  function transcript(entry){
    if(initialGreeting&&entry.role==='assistant'){store.messages=store.messages.filter(m=>m.key!=='opening');initialGreeting=false;}
    store.message(entry);
    const current=store.messages.at(-1);
    if(!current)return;
    const body=$('caption-text');
    text('caption-speaker',current.role==='user'?'You':'Coupi');
    show('transcript',true);
    if(body.textContent!==current.text){
      body.textContent=current.text;
      body.scrollTop=body.scrollHeight;
    }
  }
  voice=new window.NookVoiceSession({audio:$('voice-audio'),greeting:'Hi, I’m Coupi. How can I help you today?',getContext:context,getVisionEnabled:visionEnabled,getCameraSnapshot:reason=>snapshots.capture(reason),
    onVisionState:event=>{visionState=event.state;if(event.state==='received')visionLastAt=event.capturedAt||new Date().toISOString();updateVisionUI();sync();},
    onTranscript:transcript,onRecommendations:(list,message)=>recommend(list,message),
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
      connectedAt=at;const ready=!!voice?.call?.ready;updateVisionUI();
      $('mute-call').disabled=!ready;$('text-input').disabled=!ready;$('text-toggle').disabled=!ready;$('mute-call').setAttribute('aria-pressed',String(muted));$('mute-call').setAttribute('aria-label',muted?'Unmute microphone':'Mute microphone');$('mute-call').classList.toggle('is-off',muted);
      $('phone-app').dataset.voice=state;
      text('call-status',({connecting:'Connecting…',listening:'Listening',thinking:'Thinking',searching:'Finding your picks',speaking:'Coupi is speaking',connected:muted?'Mic muted':'Live with Coupi',reconnecting:'Reconnecting…',error:'Connection paused',idle:'Coupi'})[state]||'Coupi');
      if(ready&&phase==='connecting'){screen('active');notice('');cameraUI();startHands();}
      if(state==='error'&&!ending&&['connecting','active'].includes(phase)){notice(message,true);stopHands();}
      else if(state==='idle'&&phase==='active'&&!ending){endCall(message);}
    }
  });
  window.NookMobile={camera,voice,store};
  async function startCamera({strictFacing=false}={}){if(cameraBusy)return false;cameraBusy=true;cameraUI();const token=generation;try{const ok=await camera.start({facingMode,portrait:true,strictFacing});if(token!==generation)return false;if(ok){facingMode=camera.actualFacingMode||facingMode;camera.setOptions({mirror:facingMode==='user'});startHands();}else if(!strictFacing)notice(camera.lastCameraError?.message||'Allow Camera in browser settings, then tap Retry.',true);return ok;}finally{if(token===generation){cameraBusy=false;cameraUI();}}}
  async function answer(){if(phase==='connecting'||voice.call)return;const token=++generation;visionWanted=$('vision-consent').checked;visionState='paused';visionLastAt=null;screen('connecting');notice('');text('camera-fallback-text',visionWanted?'Opening your camera…':'Camera off. Tap Camera to turn it on.');$('answer-call').disabled=true;store.clearMessages();initialGreeting=true;transcript({role:'assistant',key:'opening',text:'How can I help you today?'});initialGreeting=true;
    try{
      if(visionWanted)await startCamera();
      else{stopHands();camera.stop(false);cameraBusy=false;cameraUI();}
      if(token!==generation||phase!=='connecting')return;
      await voice.start();
    }catch{notice('Could not start the call. Check Camera and Microphone permissions.',true);}finally{if(token===generation)$('answer-call').disabled=false;}
  }
  function endCall(message='Call ended',markCompleted=true){
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
    const img=$('product-image');img.hidden=!p.image;img.removeAttribute('src');if(p.image){img.src=p.image;img.alt=p.name;img.onerror=()=>{img.hidden=true;};}text('product-title',p.name);text('product-category',typeLabels[p.productType]||({makeup:'Beauty',clothes:'Style',desk:'Your space'})[p.category]);text('product-price',p.price?'₩'+p.price.toLocaleString('en-US')+' · reference':'See price on Coupang');text('product-position',`${Math.max(1,displayedTotal-store.queue.length+1)} / ${displayedTotal}`);$('product-card').style.transform='';$('product-card').style.opacity='';$('product-card').classList.remove('accept','reject');text('swipe-feedback','');show('swipe-feedback',false);sync();startHands();}
  function recommend(list,message){if(!['connecting','active','browse'].includes(phase))return;store.recommend(list);displayedTotal=store.queue.length;hands.reset();renderCard();if(!store.current)toast('No match in this demo catalog. Ask Coupi for another idea.');}
  function updateBag(){text('cart-count',String(store.cart.size));$('cart-button').setAttribute('aria-label',`Open demo bag, ${store.cart.size} items`);sync();}
  async function decide(direction){if(decisionBusy||!store.current)return;decisionBusy=true;const token=generation;const p=store.current;const card=$('product-card');card.classList.add(direction==='right'?'accept':'reject');text('swipe-feedback',direction==='right'?'SAVED':'SKIP');show('swipe-feedback',true);card.style.transform=`translateX(${direction==='right'?110:-110}%) rotate(${direction==='right'?12:-12}deg)`;card.style.opacity='0';await new Promise(resolve=>setTimeout(resolve,220));if(token!==generation)return;if(store.current?.id===p.id){store.decide(direction);updateBag();toast(direction==='right'?'Saved to your demo bag':'Skipped');}decisionBusy=false;hands.reset();renderCard();}
  function productDetails(p=store.current){p=trusted(p);if(!p)return;store.detailProduct=p;text('detail-title',p.name);const img=$('detail-image');img.hidden=!p.image;if(p.image){img.src=p.image;img.alt=p.name;}const attributes=(p.verifiedAttributes||[]).slice(0,4).join(' · ');text('detail-body',(attributes?attributes+'. ':'')+(p.price?'Historical reference: ₩'+p.price.toLocaleString('en-US')+'. ':'')+'Check current price and options on Coupang.');text('detail-preview-note',p.category==='makeup'?'Lip colour is estimated from this listing photo; lighting and finish vary.':'The preview uses this product photo. Placement and fit are approximate.');$('detail-link').href=p.url;$('details-dialog').showModal();hands.reset();}
  function openCatalog(type=catalogType){
    catalogType=Object.hasOwn(typeLabels,type)?type:'lipstick';const root=$('catalog-items');root.replaceChildren();
    for(const key of Object.keys(typeLabels))$('type-'+key).setAttribute('aria-pressed',String(key===catalogType));
    for(const p of store.catalog.values()){if(p.productType!==catalogType)continue;
      const row=document.createElement('article');row.className='catalog-item';
      const img=document.createElement('img');img.src=p.image;img.alt=p.name;img.loading='lazy';
      const copy=document.createElement('div');const name=document.createElement('strong');name.textContent=p.name;const price=document.createElement('span');price.textContent=p.price?'₩'+p.price.toLocaleString('en-US')+' · reference':'See price on Coupang';copy.append(name,price);
      const button=document.createElement('button');button.textContent='Try it';button.setAttribute('aria-label','Try '+p.name);button.onclick=async()=>{const similar=[...store.catalog.values()].filter(item=>item.productType===p.productType&&item.id!==p.id);recommend([p,...similar]);$('catalog-dialog').close();try{await tryOn(p);}catch(e){notice(e.message);}};
      row.append(img,copy,button);root.append(row);
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
  $('vision-toggle').onclick=()=>{visionWanted=!visionWanted;$('vision-consent').checked=visionWanted;updateVisionUI();updateFocusUI();sync();if(visionWanted)shareSnapshot('resume');toast(visionWanted?'Camera sharing on':'Coupi’s camera view paused');};
  $('vision-consent').onchange=()=>{visionWanted=$('vision-consent').checked;updateVisionUI();updateFocusUI();};
  $('gesture-toggle').onclick=()=>{handsWanted=!handsWanted;$('gesture-toggle').setAttribute('aria-pressed',String(handsWanted));$('gesture-toggle').classList.toggle('is-off',!handsWanted);if(handsWanted)startHands();else stopHands();toast(handsWanted?'Hand swipes on':'Hand swipes off');};
  $('clear-tryon').onclick=()=>setMode('none');$('product-try').onclick=()=>tryOn().catch(e=>notice(e.message));$('product-details').onclick=()=>productDetails();$('product-skip').onclick=()=>decide('left');$('product-save').onclick=()=>decide('right');$('cart-button').onclick=openBag;$('close-cart').onclick=()=>$('cart-dialog').close();$('close-details').onclick=()=>$('details-dialog').close();
  $('catalog-button').onclick=()=>openCatalog();$('close-catalog').onclick=()=>$('catalog-dialog').close();for(const key of Object.keys(typeLabels))$('type-'+key).onclick=()=>openCatalog(key);text('catalog-button',store.catalog.size+' picks');
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
