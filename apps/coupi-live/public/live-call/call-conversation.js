/* Fixed-height, scrollable transcript. Reuse rows and batch streamed DOM updates. */
(() => {
  'use strict';
  class CoupiConversation {
    constructor({store,root,history,count,latest}) {
      Object.assign(this,{store,root,history,count,latest});this.pending=false;this.rows=new Map();this.historyRows=new Map();this.follow=true;
      root.addEventListener('scroll',()=>{this.follow=root.scrollHeight-root.scrollTop-root.clientHeight<32;if(this.follow)latest.hidden=true;});
      latest.onclick=()=>{this.follow=true;root.scrollTop=root.scrollHeight;latest.hidden=true;};
    }
    schedule(){if(this.pending)return;this.pending=true;(window.requestAnimationFrame||((fn)=>setTimeout(fn,16)))(()=>{this.pending=false;this.render();});}
    reset(){this.rows.clear();this.historyRows.clear();this.root.replaceChildren();this.history.replaceChildren();this.follow=true;this.latest.hidden=true;}
    draw(root,rows,follow){
      const beforeTop=root.scrollTop;
      const active=new Set(this.store.messages.map(m=>m.key));for(const key of rows.keys())if(!active.has(key))rows.delete(key);
      const ordered=[];
      for(const item of this.store.messages){
        let row=rows.get(item.key);
        if(!row){const el=document.createElement('div'),label=document.createElement('span'),body=document.createElement('p'),img=document.createElement('img');el.className='bubble '+(item.role==='user'?'user':'assistant');label.className='bubble-label';body.className='bubble-text';img.className='chat-image';img.hidden=true;el.append(label,img,body);row={el,label,body,img};rows.set(item.key,row);}
        row.label.textContent=(item.role==='user'?'You':'Coupi')+(item.delivery==='sending'?' · Sending…':item.delivery==='failed'?' · Not confirmed':item.delivery==='sent'?' · Photo received':'');
        const value=item.text||(item.pending?(item.role==='user'?'Listening…':'Thinking…'):'');
        if(row.body.textContent!==value)row.body.textContent=value;
        row.el.dataset.pending=String(!!item.pending&&!item.final);
        if(item.image?.dataUrl){if(row.img.src!==item.image.dataUrl)row.img.src=item.image.dataUrl;row.img.alt=item.image.name||'Image shared with Coupi';row.img.hidden=false;}
        ordered.push(row.el);
      }
      root.replaceChildren(...ordered);
      if(follow)root.scrollTop=root.scrollHeight;
      else root.scrollTop=beforeTop;
    }
    render(){
      this.draw(this.root,this.rows,this.follow);
      this.count.textContent=String(this.store.messages.length);
      if(!this.follow)this.latest.hidden=false;
      if(this.history.closest('dialog')?.open){const atEnd=this.history.scrollHeight-this.history.scrollTop-this.history.clientHeight<40;this.draw(this.history,this.historyRows,atEnd);}
    }
    openHistory(){this.draw(this.history,this.historyRows,true);}
  }
  window.CoupiConversation=CoupiConversation;
})();
