/* Resolve clear shopping controls locally; unfamiliar requests stay with Coupi. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CoupiCallActions = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const PRODUCT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
  const ordinals = ['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth','thirteenth','fourteenth','fifteenth'];
  const numbers = ['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen'];
  const error = message => ({kind:'error',message});
  const validId = id => typeof id === 'string' && PRODUCT_ID.test(id);

  function targetProduct(target, context) {
    target = target.trim().replace(/\s+(?:from|in|on)\s+(?:the\s+)?(?:list|collection)$/,'');
    const current = /^(?:this|that|it|the current|the selected)(?:\s+(?:one|product|item|option|pair))?$/.test(target);
    if (current) return validId(context.visible_product?.id)
      ? {productId:context.visible_product.id}
      : error('Select a product first, then tell me what you’d like to do.');
    const ordinal = target.match(/^(?:the\s+)?([a-z]+|\d{1,2}(?:st|nd|rd|th)?)(?:\s+(?:one|product|item|option|pair))?$/);
    const numbered = target.match(/^(?:the\s+)?(?:product|item|option|number)(?:\s+number)?\s+([a-z]+|\d{1,2})$/);
    const token = numbered?.[1] || ordinal?.[1];
    let position;
    if (numbered && numbers.includes(token)) position = numbers.indexOf(token);
    else if (ordinal && ordinals.includes(token)) position = ordinals.indexOf(token);
    else if (token && /^\d{1,2}(?:st|nd|rd|th)?$/.test(token)) position = parseInt(token,10)-1;
    else if (ordinal && token === 'last') position = 'last';
    else return null;
    // Keep positions intact: a malformed ID must never shift a later card forward.
    const ids = Array.isArray(context.visible_product_ids) ? context.visible_product_ids.slice(0,15) : [];
    if (position === 'last') {
      if (context.visible_product_ids_truncated) return error('Open the full product list before choosing its last item.');
      position = ids.length-1;
    }
    if (!validId(ids[position])) return error(ids.length
      ? `There are ${ids.length} products in this list. Choose one of those.`
      : 'Show a product list first, then choose an item.');
    return {productId:ids[position]};
  }

  function resolve(value, context = {}) {
    if (typeof value !== 'string' || value.length > 500) return null;
    context = context && typeof context === 'object' ? context : {};
    let text = value.toLowerCase().replace(/[’]/g,"'").trim().replace(/[.!?,]+$/g,'').trim().replace(/\s+/g,' ');
    if (!text || /\b(?:not|don't|dont|never|avoid|instead|if|whether|should|or)\b/.test(text)) return null;
    text = text.replace(/^(?:please\s+)?(?:(?:let me|let us|let's|i want to|i'd like to|i would like to|can i|could i|can you|could you|would you)\s+)?/,'')
      .replace(/^please\s+/,'').replace(/\s+please$/,'');

    const comparison=text.match(/^compare\s+(.+)$/);
    if(comparison){
      const parts=comparison[1].replace(/\s+(?:from|in)\s+(?:the\s+)?(?:list|collection)$/,'').replace(/\s+(?:products|items|options|pairs)$/,'').split(/,\s*(?:and\s+)?|\s+(?:and|with|versus|vs\.?)\s+/).map(part=>part.trim()).filter(Boolean);
      if(parts.length<2||parts.length>3)return null;
      const targets=parts.map(part=>targetProduct(part,context));
      if(targets.some(target=>!target))return null;
      const failed=targets.find(target=>target.kind==='error');if(failed)return failed;
      const productIds=targets.map(target=>target.productId);
      if(new Set(productIds).size!==productIds.length)return error('Choose two or three different products to compare.');
      return {kind:'comparison',productIds};
    }
    if(/\b(?:and|both)\b/.test(text))return null;

    if (/^(?:skip(?:\s+(?:this|the|current))?(?:\s+(?:collection|list|group))?|next collection|(?:show|give)(?:\s+me)?\s+(?:the\s+)?next\s+(?:collection|list|group)|(?:move|go)\s+to\s+(?:the\s+)?next\s+(?:collection|list|group))$/.test(text))
      return {kind:'product',action:'skip'};

    if (/^(?:pay(?:\s+for)?|checkout|check out|buy|purchase)\s+(?:(?:all|everything)\s+in\s+)?(?:my|the)\s+(?:cart|bag|shopping cart|add to cart)$/.test(text)
      || /^(?:checkout|check out|pay for everything in my bag)$/.test(text))
      return {kind:'checkout',request:{scope:'cart'}};

    if (/^(?:add|put)\s+(?:to|in|into)\s+(?:(?:my|the)\s+)?(?:cart|bag|shopping cart)$/.test(text)) {
      const target = targetProduct('this',context);
      return target.kind === 'error' ? target : {kind:'product',action:'save',productId:target.productId};
    }

    let match = text.match(/^(?:try(?:\s+on)?|preview)\s+(.+)$/);
    if (match) {
      const target = targetProduct(match[1].replace(/\s+on(?:\s+me)?$/,''),context);
      return target?.kind === 'error' ? target : target ? {kind:'product',action:'try_on',productId:target.productId} : null;
    }
    match = text.match(/^(?:add|put|save)\s+(.+?)\s+(?:to|in|into)\s+(?:(?:my|the)\s+)?(?:cart|bag|shopping cart)$/);
    if (match) {
      const target = targetProduct(match[1],context);
      return target?.kind === 'error' ? target : target ? {kind:'product',action:'save',productId:target.productId} : null;
    }
    match = text.match(/^(?:show(?:\s+me)?\s+(?:the\s+)?details(?:\s+(?:for|of|about))?|tell\s+me\s+more\s+about)\s+(.+)$/);
    if (match) {
      const target = targetProduct(match[1],context);
      return target?.kind === 'error' ? target : target ? {kind:'product',action:'details',productId:target.productId} : null;
    }
    match = text.match(/^(?:buy|purchase|check out|pay for)\s+(.+)$/);
    if (match) {
      const target = targetProduct(match[1],context);
      // An exact ID survives a selection change before checkout is opened.
      return target?.kind === 'error' ? target : target ? {kind:'checkout',request:{scope:'products',product_ids:[target.productId]}} : null;
    }
    return null;
  }
  return {resolve};
});
