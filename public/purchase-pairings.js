/* Complement ideas from the same trusted catalog; no compatibility or fit claims. */
(() => {
  'use strict';
  const complements={lipstick:['lipbalm','glasses'],lipbalm:['lipstick'],glasses:['tshirt','hoodie'],tshirt:['hoodie','glasses'],hoodie:['tshirt','glasses'],sweater:['tshirt','glasses'],chair:['lamp'],lamp:['chair']};
  function select(catalog,purchasedIds,{maxPrice=null,excludedTypes=[]}={}){
    const bought=new Set((purchasedIds||[]).map(String));
    const types=new Set(catalog.filter(p=>bought.has(String(p.id))).map(p=>p.productType));
    const targetTypes=[...new Set([...types].flatMap(type=>complements[type]||[]))].filter(type=>!types.has(type)&&!excludedTypes.includes(type));
    const pools=targetTypes.map(type=>catalog.filter(p=>p.productType===type&&!bought.has(String(p.id))&&p.image&&Number.isSafeInteger(p.price)&&p.price>0&&(maxPrice===null||p.price<=maxPrice)));
    const picks=[],seen=new Set();
    for(let depth=0;depth<3&&picks.length<3;depth++)for(const pool of pools){const p=pool[depth];if(p&&!seen.has(String(p.id))){seen.add(String(p.id));picks.push(p);if(picks.length===3)break;}}
    return picks;
  }
  window.CoupiPairings={select};
})();
