/* Calls start directly with shopping. Saved preferences stay owned by the parent. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  class EmbeddedPersonalization {
    constructor({onChange=()=>{}}={}) {
      this.bridge=window.CoupiCallBridge;this.state=this.bridge.personalizationContext();this.onChange=onChange;this.world=null;this.profile=null;
      this.bridge.subscribe(event=>{if(event.state!=='personalization-context')return;this.state=event.context;this.render();this.onChange();});this.render();
    }
    get active(){return false;}
    get received(){return this.state.received===true;}
    get greeting(){return 'What do you want to buy?';}
    get context(){return {active:false,draft_pending:false,preferences:null};}
    render(){$('personalization-strip').hidden=true;$('update-preferences').hidden=true;$('incoming-promise').textContent='Let’s find your kind of thing.';}
    handle(){throw Error('Calls start with shopping. Tell Coupi what you want to buy.');}
    async skip(){return {ok:true,skipped:true,saved:false};}
    resetDraft(){this.bridge.cancelPreferences();}
    startUpdate(){this.bridge.exit();}
  }
  window.CoupiCallPersonalization=EmbeddedPersonalization;
})();
