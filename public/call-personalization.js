/* A short first-call interview. Preferences are saved only after shopper confirmation. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const interests={cozy_home:'Cozy at home',focused_work:'My workspace',everyday_style:'Everyday style',beauty_play:'Beauty & color',outdoors:'Out & about'};
  class CallPersonalization {
    constructor({catalog,onChange=()=>{},onSaved=()=>{},onSkip=()=>{}}={}){
      this.api=window.CoupiPreferences;this.profile=this.api.load();this.pending=null;this.onChange=onChange;this.onSaved=onSaved;this.onSkip=onSkip;
      const params=new URLSearchParams(window.location?.search||'');this.isNew=!this.profile?.completed;this.active=this.isNew||params.get('intent')==='personalize';
      this.world=this.api.buildWorlds(catalog,this.profile).find(world=>world.id===params.get('world'))||null;
      $('personalization-skip').onclick=()=>this.skip();$('personalization-save').onclick=()=>this.save();
      $('personalization-edit-later').onclick=()=>{this.pending=null;$('personalization-dialog').close();this.onChange();};
      $('personalization-dialog').addEventListener('cancel',()=>{this.pending=null;this.onChange();});
      $('personalization-dialog').addEventListener('close',()=>{if(!$('personalization-dialog').open)this.pending=null;this.onChange();});
      this.render();
    }
    get greeting(){
      if(this.active)return (this.isNew?'Welcome new user! We want to learn more about you to personalize your experience. ':'Let’s update what you enjoy. ')+'What do you enjoy doing in your free time? You can say “skip” to go straight to shopping.';
      return this.world?'What would you like to explore in '+this.world.title.toLowerCase()+'?':'What do you want to buy?';
    }
    get context(){return {active:this.active,draft_pending:!!this.pending,preferences:this.profile?.completed?{interests:this.profile.interests,vibe:this.profile.vibe,budget:this.profile.budget,story:this.profile.story}:null};}
    render(){
      $('personalization-strip').hidden=!this.active;$('update-preferences').hidden=!this.profile?.completed;
      $('incoming-promise').textContent='Let’s find your kind of thing.';
      $('incoming-status').textContent=this.world?.title||'';$('incoming-status').hidden=!this.world;
    }
    startUpdate(){this.resetDraft();this.active=true;this.isNew=!this.profile?.completed;this.world=null;this.render();this.onChange();}
    handle({action,preferences}={}){
      if(!this.active)throw Error('Preference discovery is not active.');
      if(action==='skip'){this.skip();return {ok:true,skipped:true,saved:false};}
      if(action!=='draft')throw Error('Choose a preference draft or skip.');
      const draft=this.api.normalize({...preferences,completed:false});
      if(!draft.interests.length&&!draft.story&&draft.vibe==='mixed'&&draft.budget===null)throw Error('Ask for a volunteered interest or preference before preparing a summary.');
      this.pending=draft;const summary=$('preference-summary');summary.replaceChildren();
      const add=(label,value)=>{const row=document.createElement('p'),heading=document.createElement('strong'),copy=document.createElement('span');heading.textContent=label;copy.textContent=value;row.append(heading,copy);summary.append(row);};
      if(draft.interests.length)add('Interests',draft.interests.map(id=>interests[id]).join(' · '));
      if(draft.vibe!=='mixed')add('Style',draft.vibe==='calm'?'Calm & simple':'Colorful & bold');
      if(draft.budget!==null)add('Budget per item','₩'+draft.budget.toLocaleString('en-US'));
      if(draft.story)add('What you shared',draft.story);
      $('personalization-error').hidden=true;if(!$('personalization-dialog').open)$('personalization-dialog').showModal();$('personalization-dialog').scrollTop=0;this.onChange();
      return {ok:true,draft_ready:true,saved:false};
    }
    skip(){const wasActive=this.active;this.active=false;this.pending=null;if($('personalization-dialog').open)$('personalization-dialog').close();this.render();this.onChange();if(wasActive)this.onSkip();}
    save(){
      if(!this.active||!this.pending)return;
      try{this.profile=this.api.save({...this.pending,completed:true});}
      catch(error){this.error(error.message);return;}
      this.isNew=false;this.active=false;this.pending=null;$('personalization-dialog').close();this.render();this.onChange();this.onSaved(this.profile);
    }
    error(message){$('personalization-error').textContent=message;$('personalization-error').hidden=false;}
    resetDraft(){this.pending=null;if($('personalization-dialog').open)$('personalization-dialog').close();}
  }
  window.CoupiCallPersonalization=CallPersonalization;
})();
