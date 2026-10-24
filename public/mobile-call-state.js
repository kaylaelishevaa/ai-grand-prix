/* In-memory prototype state: a saved item is never a purchase. */
(() => {
  class NookCallState {
    constructor(catalog=[]){this.catalog=new Map(catalog.map(p=>[String(p.id),p]));this.queue=[];this.cart=new Map();this.skipped=[];this.messages=[];this.seenMessages=new Set();}
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
