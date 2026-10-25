/* Parent-owned discovery adapter. No preference is persisted by the iframe. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  class EmbeddedPersonalization {
    constructor({onChange=()=>{}}={}) {
      this.bridge=window.CoupiCallBridge;this.state=this.bridge.personalizationContext();this.onChange=onChange;this.epoch=0;this.world=null;this.profile=null;
      this.bridge.subscribe(event=>{if(event.state!=='personalization-context')return;this.state=event.context;this.render();this.onChange();});
      this.render();
    }
    get active(){return this.state.active===true;}
    get received(){return this.state.received===true;}
    get greeting(){return this.active?(this.state.count===0?'Hi Kayleen! ':'')+(this.state.question||'What do you enjoy doing in your free time?'):'What do you want to buy?';}
    get context(){return {active:this.active,draft_pending:this.state.draftPending===true,preferences:null};}
    render(){$('personalization-strip').hidden=!this.active;$('update-preferences').hidden=true;$('incoming-promise').textContent='Let’s find your kind of thing.';}
    handle(request){if(!this.active)throw Error('Start the optional introduction before shaping your worlds.');return request?.action==='skip'?this.skip():this.bridge.preferences(request);}
    async skip(){
      if(!this.active)return {ok:true,skipped:true,saved:false};
      const token=this.epoch,pending=this.bridge.preferences({action:'skip'});
      this.state={...this.state,active:false,draftPending:false};this.render();this.onChange();
      const result=await pending;
      if(token!==this.epoch)return {ok:false,saved:false,error:'The call ended. No preferences were saved.'};
      if(!result.ok){this.state=this.bridge.personalizationContext();this.render();this.onChange();}
      return result;
    }
    resetDraft(){this.epoch++;this.bridge.cancelPreferences();}
    startUpdate(){this.bridge.exit();}
  }
  window.CoupiCallPersonalization=EmbeddedPersonalization;
})();
