/* Explicit shopper preferences, stored only after confirmation on this device. */
(() => {
  'use strict';
  const KEY='coupi.preferences.v1';
  const interests={cozy_home:'Cozy at home',focused_work:'My workspace',everyday_style:'Everyday style',beauty_play:'Beauty & color',outdoors:'Out & about'};
  const worlds=[
    {id:'cozy-home',interest:'cozy_home',title:'Your cozy corner',subtitle:'Little comforts for slower days.',theme:'sage',productTypes:['lamp','hoodie','chair','sweater']},
    {id:'desk-reset',interest:'focused_work',title:'A fresh desk chapter',subtitle:'Light, seating and everyday desk companions.',theme:'cyan',productTypes:['lamp','chair','glasses']},
    {id:'your-style',interest:'everyday_style',title:'Your everyday edit',subtitle:'Easy layers and a finishing touch.',theme:'peach',productTypes:['tshirt','hoodie','glasses','sweater']},
    {id:'beauty-rituals',interest:'beauty_play',title:'A little color ritual',subtitle:'Lip color and small everyday favorites.',theme:'rose',productTypes:['lipstick','lipbalm','glasses']},
    {id:'outdoor-days',interest:'outdoors',title:'Days out, your way',subtitle:'Casual layers and accessories for your next outing.',theme:'sand',productTypes:['tshirt','hoodie','glasses']},
  ];
  let memory=null,persistent=true;
  const clean=value=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b-\u001f]/g,'').trim():'';
  function normalize(value){
    const p=value&&typeof value==='object'?value:{};
    return {version:1,completed:p.completed===true,interests:[...new Set(Array.isArray(p.interests)?p.interests.filter(id=>Object.hasOwn(interests,id)):[])].slice(0,5),vibe:['calm','bold','mixed'].includes(p.vibe)?p.vibe:'mixed',budget:Number.isSafeInteger(p.budget)&&p.budget>0&&p.budget<=10000000?p.budget:null,story:clean(p.story).slice(0,1200),updatedAt:typeof p.updatedAt==='string'&&Number.isFinite(Date.parse(p.updatedAt))?p.updatedAt:null};
  }
  function load(){
    try{const stored=window.localStorage.getItem(KEY);if(stored){const value=JSON.parse(stored);if(value?.version!==1){memory=null;return null;}memory=normalize(value);}else memory=null;}
    catch{persistent=false;memory=null;}
    return memory?normalize(memory):null;
  }
  function save(profile){
    const next={...normalize(profile),updatedAt:new Date().toISOString()};
    try{window.localStorage.setItem(KEY,JSON.stringify(next));persistent=true;}catch{persistent=false;throw Error('Preferences could not be saved on this device. Allow browser storage and try again.');}
    memory=next;return normalize(memory);
  }
  function clear(){try{window.localStorage.removeItem(KEY);persistent=true;}catch{persistent=false;throw Error('Preferences could not be cleared. Allow browser storage and try again.');}memory=null;}
  function safeProduct(p){
    return p&&typeof p.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(p.id)&&typeof p.name==='string'&&p.name.trim()&&typeof p.image==='string'&&/^\/products\/[A-Za-z0-9_.-]+$/.test(p.image)&&Number.isSafeInteger(p.price)&&p.price>0;
  }
  function buildWorlds(catalog,profile){
    const p=normalize(profile),source=(Array.isArray(catalog)?catalog:[]).filter(safeProduct);
    const chosen=p.interests.length?worlds.filter(world=>p.interests.includes(world.interest)):[worlds[0],worlds[2],worlds[3]];
    return chosen.map(world=>{
      const styleTags=p.vibe==='calm'?['nude','beige','black','white','gray','charcoal','brown']:p.vibe==='bold'?['red','pink','purple','green','blue','yellow']:[];
      const score=item=>(item.tags||[]).filter(tag=>styleTags.includes(tag)).length;
      const pools=world.productTypes.map(type=>source.filter(item=>item.productType===type&&(p.budget===null||item.price<=p.budget)).sort((a,b)=>score(b)-score(a)));
      const products=[],seen=new Set();
      for(let row=0;row<6&&products.length<10;row++)for(const pool of pools){const item=pool[row];if(item&&!seen.has(item.id)){seen.add(item.id);products.push(item);if(products.length===10)break;}}
      return {...world,reason:p.interests.includes(world.interest)?'Because you chose '+interests[world.interest].toLowerCase()+'.':'A starting place to explore.',products,productIds:products.map(item=>item.id)};
    }).filter(world=>world.products.length);
  }
  window.CoupiPreferences={load,save,clear,normalize,buildWorlds,interests:{...interests},worlds:worlds.map(({id,title,interest,productTypes})=>({id,title,interest,productTypes:[...productTypes]})),storageAvailable:()=>persistent};
})();
