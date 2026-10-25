/* In-memory prototype state: a saved item is never a purchase. */
(() => {
  class NookCallState {
    constructor(catalog=[]){this.catalog=new Map(catalog.map(p=>[String(p.id),p]));this.queue=[];this.cart=new Map();this.skipped=[];this.messages=[];this.seenMessages=new Set();}
    addSearchProducts(products){
      for(const p of (products||[]).slice(0,15)){
        if(!p||!['coupang_web'].includes(p.source)||typeof p.id!=='string'||!/^\d{1,24}$/.test(p.id)||typeof p.name!=='string'||!p.name.trim()||(p.currency!==undefined&&p.currency!=='KRW'))continue;
        const types={lipstick:'makeup',chair:'desk',lamp:'desk',tshirt:'clothes',hoodie:'clothes',glasses:'glasses'};
        if(typeof p.productType!=='string'||!Object.hasOwn(types,p.productType)||p.category!==types[p.productType]||(p.price!==null&&(!Number.isFinite(p.price)||p.price<0)))continue;
        let url;try{url=new URL(p.url);}catch{continue;}
        if(url.protocol!=='https:'||!['www.coupang.com','coupang.com'].includes(url.hostname)||!/^\/vp\/products\/(\d{1,24})$/.test(url.pathname)||url.pathname.split('/').pop()!==p.id||url.username||url.password||url.port)continue;
        const canonical=new URL('https://www.coupang.com'+url.pathname);
        for(const key of ['itemId','vendorItemId'])if(/^\d{1,24}$/.test(url.searchParams.get(key)||''))canonical.searchParams.set(key,url.searchParams.get(key));
        const previous=this.catalog.get(p.id),hasNewImage=typeof p.image==='string'&&p.image.startsWith('/api/products/image?url=');
        const sameVariant=previous?.productType===p.productType&&(!url.searchParams.has('itemId')||new URL(previous.url).searchParams.get('itemId')===url.searchParams.get('itemId'));
        const image=hasNewImage?p.image:sameVariant?previous.image:null;
        const preview=!hasNewImage&&sameVariant?previous.preview:undefined;
        this.catalog.set(p.id,{id:p.id,name:p.name.slice(0,300),description:typeof p.description==='string'?p.description.slice(0,400):'',url:canonical.href,category:p.category,productType:p.productType,price:p.price,currency:'KRW',image,...(preview?{preview}:{}),source:p.source,priceStatus:'listed',verifiedAttributes:[]});
      }
    }
    recommend(products){this.queue=[...new Set((products||[]).map(p=>String(p.id)))].map(id=>this.catalog.get(id)).filter(Boolean);return this.current;}
    get current(){return this.queue[0]||null;}
    decide(direction){const product=this.current;if(!product)return null;this.queue.shift();if(direction==='right')this.cart.set(String(product.id),product);else this.skipped.push(String(product.id));return product;}
    message(entry){
      const key=String(entry.key);let row=this.messages.find(m=>m.key===key);
      if(!row){if(this.seenMessages.has(key))return this.messages;this.seenMessages.add(key);row={key,role:entry.role,text:'',order:Number.isFinite(entry.order)?entry.order:this.seenMessages.size,arrival:this.seenMessages.size};this.messages.push(row);}
      if(Number.isFinite(entry.order))row.order=entry.order;
      // A final transcript replaces streaming text; late deltas must not duplicate it.
      if(!row.final||entry.final){if(typeof entry.text==='string')row.text=entry.text;else if(entry.delta)row.text+=entry.delta;}
      if(entry.final)row.final=true;
      if(entry.pending!==undefined)row.pending=entry.pending;
      if(entry.image)row.image=entry.image;
      if(entry.delivery)row.delivery=entry.delivery;
      this.messages.sort((a,b)=>a.order-b.order||a.arrival-b.arrival);
      this.messages=this.messages.slice(-150);return this.messages;
    }
    clearMessages(){this.messages=[];this.seenMessages.clear();}
  }
  window.NookCallState=NookCallState;
})();
