/* Same-origin embed contract. Only final words spoken/typed by the shopper become memory. */
(() => {
  'use strict';
  const origin = window.location.origin;
  const seen = new Set();
  let stop = () => {}, lastState = '', availability;
  function post(message) {
    if (window.parent !== window && /^https?:\/\//.test(origin)) window.parent.postMessage(message, origin);
  }
  function stableId(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return 'live-call-' + (hash >>> 0).toString(16);
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
    async openWorldProduct(skuId) {
      if (typeof skuId !== 'string' || !/^[A-Za-z][A-Za-z0-9-]{0,99}$/.test(skuId) || window.parent === window) return {ok:false,error:'Open a world product from the main Coopy app.'};
      const response = await fetch('/api/products/world', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'open',skuId}),cache:'no-store'});
      const result = await response.json();
      if (!response.ok || result.ok !== true || result.catalog_namespace !== 'world-simulation' || result.skuId !== skuId) return {ok:false,error:typeof result.error==='string'?result.error:'That world product is unavailable.'};
      stop();
      post({type:'coupi-live-call-product',namespace:'world-simulation',skuId});
      return {ok:true,skuId,call_paused:true,purchased:false};
    },
    attach(handler) { if (typeof handler === 'function') stop = handler; },
    transcript(entry) {
      if (!entry || entry.role !== 'user' || entry.final !== true || typeof entry.text !== 'string' || entry.synthetic === true) return;
      const text = entry.text.trim().slice(0, 2000);
      if (!text) return;
      const id = stableId(String(entry.key || '') + '\u0000' + text);
      if (seen.has(id)) return;
      seen.add(id);
      post({type:'coupi-live-call-transcript', role:'user', text, id});
    },
    state(value) {
      const message = {type:'coupi-live-call-state', phase:String(value.phase || 'incoming').slice(0,24), cameraActive:value.cameraActive === true, microphoneActive:value.microphoneActive === true};
      const serialized = JSON.stringify(message);
      if (serialized !== lastState) { lastState = serialized; post(message); }
    },
    exit() { stop(); post({type:'coupi-live-call-exit'}); if (window.parent === window) window.location.assign('/'); },
  };
  window.addEventListener('message', event => {
    if (event.origin !== origin || event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'coupi-live-call-stop') stop();
  });
  document.querySelectorAll('[data-world-return]').forEach(button => button.addEventListener('click', () => window.CoupiCallBridge.exit()));
  // The shared stylesheet may reference Google font binaries. Never request it in offline mode.
  getAvailability().then(status => {
    if (status.offline || !document.head) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/fonts/fonts.css';
    document.head.append(link);
  });
})();
