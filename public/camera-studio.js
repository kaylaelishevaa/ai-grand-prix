(() => {
  const $ = s => document.querySelector(s);
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const modes = {
    makeup:{eyebrow:'LIVE FACE TRACKING',title:'A hint of colour.',instructions:'Face the camera in good light. Lip colour follows your lips; a soft blush follows your cheeks.',note:'Approximate colour effect, not an exact shade match. Lighting and your camera change how colours look.',color:'#b33959',opacity:45},
    clothes:{eyebrow:'LIVE BODY TRACKING',title:'Find your kind of fit.',instructions:'Step back until your shoulders and hips are visible. A simple T-shirt silhouette follows your torso. Keep your arms a little away from your body.',note:'A flat silhouette overlay, not realistic fabric draping, sizing, or a fit guarantee. This is not an exact image of the linked T-shirt.',color:'#e8e1d5',opacity:78},
    desk:{eyebrow:'MANUAL OBJECT PLACEMENT',title:'Make a little room.',instructions:'Point the camera at your desk. Drag the lamp into place, then adjust its size and position. Keep the camera still to compare.',note:'Manual 2D placement. There is no surface detection, real-world scale, occlusion, or anchoring as the camera moves. The lamp is a generic drawing.',color:'#6a886f',opacity:95}
  };
  let mode = ['makeup','clothes','desk'].includes(new URLSearchParams(location.search).get('mode'))?new URLSearchParams(location.search).get('mode'):'makeup';
  let facingMode='user', hiddenOverlay=false, pending=false, uiRequest=0;
  let engine;
  function controls(){const live=!!engine?.running;$('#stop-camera').disabled=!live&&!pending;$('#start-camera').disabled=pending||live;$('#flip-camera').disabled=!live||pending;$('#snapshot').disabled=!live;$('#camera-placeholder').classList.toggle('hidden',live);$('#camera-state').textContent=live?'● LIVE · LOCAL ONLY':'CAMERA OFF';window.dispatchEvent(new CustomEvent('nook:context',{detail:context()}));}
  function status(text,kind='info'){$('#tracking-status').textContent=text;$('#tracking-status').dataset.kind=kind;controls();}
  if(!window.NookCamera){status('The camera module could not load. Reload this page to try again.','error');$('#start-camera').disabled=true;return;}
  engine=new window.NookCamera({video:$('#live-video'),canvas:$('#live-canvas'),onStatus:status});
  function options(){engine.setOptions({color:$('#overlay-color').value,opacity:hiddenOverlay?0:Number($('#opacity').value)/100,scale:Number($('#scale').value)/100,x:Number($('#desk-x').value)/100,y:Number($('#desk-y').value)/100,rotation:Number($('#rotation').value),mirror:$('#mirror').checked,showGuides:false});$('#opacity-value').value=$('#opacity').value+'%';$('#scale-value').value=$('#scale').value+'%';window.dispatchEvent(new CustomEvent('nook:context',{detail:context()}));}
  function products(recommendations,message=''){const list=Array.isArray(recommendations)?recommendations:(window.COUPANG_PRODUCTS||[]).filter(p=>p.category===mode);$('#recommendation-reason').textContent=message;$('#real-product-list').innerHTML=list.map(p=>`<article class="real-product">${p.image?`<img src="${escape(p.image)}" alt="${escape(p.name)}" loading="lazy" referrerpolicy="no-referrer">`:'<div class="product-placeholder">Coupang listing</div>'}<div class="real-product-copy"><span class="product-source">COUPANG · PRODUCT ${escape(p.id)}</span><h3>${escape(p.name)}</h3><p>${p.price?'Reference price: ₩'+p.price.toLocaleString('en-US'):'See current price on Coupang'}</p><p class="source-note">Historical reference only. Confirm the current price, stock, and options on Coupang.</p><a class="btn primary" href="${escape(p.url)}" target="_blank" rel="noopener noreferrer">Check on Coupang ↗</a></div></article>`).join('')||'<p>No verified listing is available for this mode yet.</p>';$('#real-product-list').querySelectorAll('img').forEach(img=>img.onerror=()=>{img.replaceWith(Object.assign(document.createElement('div'),{className:'product-placeholder',textContent:'Product photo unavailable. Open Coupang to view.'}));});}
  async function selectMode(next,{preserveRecommendations=false,throwOnFailure=false}={}){if(!Object.hasOwn(modes,next))throw new Error('Choose makeup, clothes, or desk.');mode=next;const m=modes[mode];document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.mode===mode)));$('#mode-eyebrow').textContent=m.eyebrow;$('#mode-title').textContent=m.title;$('#mode-instructions').textContent=m.instructions;$('#mode-note').textContent=m.note;$('#overlay-color').value=m.color;$('#opacity').value=m.opacity;$('#scale').value=100;$('#desk-controls').classList.toggle('hidden',mode!=='desk');$('#size-control').classList.toggle('hidden',mode==='makeup');hiddenOverlay=false;$('#compare').textContent='Hide overlay to compare';options();if(!preserveRecommendations)products();try{await engine.setMode(mode);}catch(error){status(error.message||'Tracking could not load. Camera preview remains available.','error');if(throwOnFailure)throw error;}controls();}
  async function start(){if(pending)return;pending=true;const request=++uiRequest;status('Requesting your camera. Choose Allow in the browser prompt.');controls();try{await engine.start({facingMode});if(request!==uiRequest)return;options();}catch(error){status(error.message||'Camera access failed. Please check browser permissions.','error');}finally{if(request===uiRequest){pending=false;controls();}}}
  $('#start-camera').onclick=start;
  $('#stop-camera').onclick=()=>{uiRequest++;pending=false;engine.stop();status('Camera stopped. Your camera tracks are closed.');};
  $('#flip-camera').onclick=async()=>{engine.stop();facingMode=facingMode==='user'?'environment':'user';$('#mirror').checked=facingMode==='user';await start();};
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>selectMode(b.dataset.mode));
  document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{$('#overlay-color').value=b.dataset.color;options();});
  ['overlay-color','opacity','scale','desk-x','desk-y','rotation','mirror'].forEach(id=>$('#'+id).addEventListener('input',options));
  $('#compare').onclick=()=>{hiddenOverlay=!hiddenOverlay;$('#compare').textContent=hiddenOverlay?'Show overlay again':'Hide overlay to compare';options();};
  const canvas=$('#live-canvas');let dragging=false;
  function move(e){if(mode!=='desk'||!engine.running)return;const r=canvas.getBoundingClientRect(),ratio=canvas.width/canvas.height;let width=r.width,height=width/ratio;if(height>r.height){height=r.height;width=height*ratio;}const left=r.left+(r.width-width)/2,top=r.top+(r.height-height)/2;let x=Math.max(.05,Math.min(.95,(e.clientX-left)/width));const y=Math.max(.1,Math.min(.95,(e.clientY-top)/height));$('#desk-x').value=Math.round(x*100);$('#desk-y').value=Math.round(y*100);options();}
  canvas.onpointerdown=e=>{if(mode==='desk'&&engine.running){dragging=true;canvas.setPointerCapture(e.pointerId);move(e);}};canvas.onpointermove=e=>{if(dragging)move(e);};canvas.onpointerup=()=>{dragging=false;};canvas.onpointercancel=()=>{dragging=false;};
  $('#snapshot').onclick=()=>{try{const image=engine.capture();if(!image)throw Error('Start your camera first.');$('#snapshot-image').src=image;$('#download-snapshot').href=image;$('#snapshot-dialog').showModal();}catch(error){status(error.message,'error');}};
  function clearSnapshot(){$('#snapshot-image').removeAttribute('src');$('#download-snapshot').removeAttribute('href');}
  $('#close-snapshot').onclick=()=>$('#snapshot-dialog').close();$('#snapshot-dialog').addEventListener('close',clearSnapshot);
  $('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('#copy-link').textContent='Link copied';}catch{$('#copy-link').textContent='Copy the URL from your address bar';}};
  window.addEventListener('pagehide',()=>{uiRequest++;engine.stop();clearSnapshot();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&engine.running){uiRequest++;pending=false;engine.stop();status('Camera stopped when the page moved into the background. Press Start to resume.');}});
  function context(){return {mode,color:$('#overlay-color').value,opacity:hiddenOverlay?0:Number($('#opacity').value)/100,scale:Number($('#scale').value)/100,cameraRunning:!!engine?.running};}
  window.NookStudio={
    getContext:context,
    setMode:next=>selectMode(next,{preserveRecommendations:true,throwOnFailure:true}),
    setOverlay(values={}){
      if(typeof values.color==='string'&&/^#[0-9a-f]{6}$/i.test(values.color))$('#overlay-color').value=values.color;
      if(typeof values.opacity==='number'&&Number.isFinite(values.opacity)){$('#opacity').value=Math.round(Math.max(0,Math.min(1,values.opacity))*100);hiddenOverlay=false;$('#compare').textContent='Hide overlay to compare';}
      if(typeof values.scale==='number'&&Number.isFinite(values.scale))$('#scale').value=Math.round(Math.max(.5,Math.min(1.8,values.scale))*100);
      options();return context();
    },
    showRecommendations(list,message){
      const byId=new Map((window.COUPANG_PRODUCTS||[]).map(p=>[String(p.id),p]));
      const verified=(Array.isArray(list)?list:[]).map(p=>byId.get(String(p.id))).filter(Boolean);
      products(verified,String(message||''));
      document.getElementById('recommendation-reason').textContent=String(message||'')+' ↓ Your matching products are below the camera.';
    }
  };
  selectMode(mode);
})();
