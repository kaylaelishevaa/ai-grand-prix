/* Optional preference discovery. A voice tool can draft; only the shopper can save. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const interests={cozy_home:'Cozy at home',focused_work:'My workspace',everyday_style:'Everyday style',beauty_play:'Beauty & color',outdoors:'Out & about'};
  class CallPersonalization {
    constructor({catalog,onChange=()=>{},onSaved=()=>{},onSkip=()=>{}}={}){
      this.api=window.CoupiPreferences;this.profile=this.api.load();this.pending=null;this.onChange=onChange;this.onSaved=onSaved;this.onSkip=onSkip;
      const params=new URLSearchParams(window.location?.search||'');this.active=params.get('intent')==='personalize';
      this.world=this.api.buildWorlds(catalog,this.profile).find(world=>world.id===params.get('world'))||null;
      this.inputs=[];
      for(const [id,label] of Object.entries(interests)){const row=document.createElement('label'),input=document.createElement('input'),copy=document.createElement('span');input.type='checkbox';input.value=id;copy.textContent=label;row.append(input,copy);$('preference-interests').append(row);this.inputs.push(input);}
      $('personalization-skip').onclick=()=>this.skip();$('personalization-save').onclick=()=>this.save();
      $('personalization-edit-later').onclick=()=>{this.pending=null;$('personalization-dialog').close();this.onChange();};
      $('personalization-dialog').addEventListener('cancel',()=>{this.pending=null;this.onChange();});
      $('personalization-dialog').addEventListener('close',()=>{if(!$('personalization-dialog').open)this.pending=null;this.onChange();});
      this.render();
    }
    get greeting(){return this.active?'What do you enjoy doing in your free time?':this.world?'What would you like to explore in '+this.world.title.toLowerCase()+'?':'What do you want to buy?';}
    get context(){return {active:this.active,draft_pending:!!this.pending,preferences:this.profile?.completed?{interests:this.profile.interests,vibe:this.profile.vibe,budget:this.profile.budget,story:this.profile.story}:null};}
    render(){
      $('personalization-strip').hidden=!this.active;
      $('personalization-entry').href='/explore';$('personalization-entry').textContent=this.profile?.completed?'Explore your worlds →':'New here? Make your own worlds →';
      $('personalization-entry').hidden=this.active;
      if(this.active){$('incoming-promise').textContent='Let’s get to know you.';$('incoming-status').textContent='A few easy questions. Skip whenever you like.';$('incoming-status').hidden=false;}
      else if(this.world){$('incoming-status').textContent=this.world.title;$('incoming-status').hidden=false;}
    }
    handle({action,preferences}={}){
      if(!this.active)throw Error('Preference discovery is not active.');
      if(action==='skip'){this.skip();return {ok:true,skipped:true,saved:false};}
      if(action!=='draft')throw Error('Choose a preference draft or skip.');
      this.pending=this.api.normalize({...preferences,completed:false});
      for(const input of this.inputs)input.checked=this.pending.interests.includes(input.value);
      $('preference-vibe').value=this.pending.vibe;$('preference-budget').value=this.pending.budget===null?'':String(this.pending.budget);$('preference-story').value=this.pending.story;
      $('personalization-error').hidden=true;if(!$('personalization-dialog').open)$('personalization-dialog').showModal();$('personalization-dialog').scrollTop=0;this.onChange();
      return {ok:true,draft_ready:true,saved:false};
    }
    skip(){const wasActive=this.active;this.active=false;this.pending=null;if($('personalization-dialog').open)$('personalization-dialog').close();this.render();this.onChange();if(wasActive)this.onSkip();}
    save(){
      if(!this.active||!this.pending)return;
      const raw=$('preference-budget').value.trim(),budget=raw?Number(raw):null;
      if(raw&&(!Number.isSafeInteger(budget)||budget<=0||budget>10000000)){this.error('Choose a whole-won budget between ₩1 and ₩10,000,000, or leave it blank.');return;}
      try{this.profile=this.api.save({completed:true,interests:this.inputs.filter(i=>i.checked).map(i=>i.value),vibe:$('preference-vibe').value,budget,story:$('preference-story').value});}
      catch(error){this.error(error.message);return;}
      this.active=false;this.pending=null;$('personalization-dialog').close();this.render();this.onChange();this.onSaved(this.profile);
    }
    error(message){$('personalization-error').textContent=message;$('personalization-error').hidden=false;}
    resetDraft(){this.pending=null;if($('personalization-dialog').open)$('personalization-dialog').close();}
  }
  window.CoupiCallPersonalization=CallPersonalization;
})();
