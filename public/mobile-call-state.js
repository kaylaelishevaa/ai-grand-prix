/* In-memory prototype state: a saved item is never a purchase. */
(() => {
  class NookCallState {
    constructor(catalog=[]){this.catalog=new Map(catalog.map(p=>[String(p.id),p]));this.queue=[];this.cart=new Map();this.skipped=[];this.messages=[];this.seenMessages=new Set();}
    recommend(products){this.queue=[...new Set((products||[]).map(p=>String(p.id)))].map(id=>this.catalog.get(id)).filter(Boolean);return this.current;}
    get current(){return this.queue[0]||null;}
    decide(direction){const product=this.current;if(!product)return null;this.queue.shift();if(direction==='right')this.cart.set(String(product.id),product);else this.skipped.push(String(product.id));return product;}
    message(entry){const key=String(entry.key);let row=this.messages.find(m=>m.key===key);if(!row){if(this.seenMessages.has(key))return this.messages;this.seenMessages.add(key);row={key,role:entry.role,text:''};this.messages.push(row);this.messages=this.messages.slice(-2);}if(typeof entry.text==='string'&&entry.text)row.text=entry.text;else if(entry.delta)row.text+=entry.delta;return this.messages;}
    clearMessages(){this.messages=[];this.seenMessages.clear();}
  }
  window.NookCallState=NookCallState;
})();
