/* Three optional quick choices, a shopper-authored story, then real catalog worlds. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),preferences=window.CoupiPreferences;
  const root=$('cold-start'),worldRoot=$('worlds-view'),scroll=$('worlds-content');
  const questions=[
    {title:'Your kind of weekend?',note:'Pick a card, or swipe toward the one that feels like you.',kind:'interests',choices:[{id:'cozy_home',title:'A cozy day in',note:'Slow mornings, a good corner.',mark:'⌂'},{id:'outdoors',title:'Out & about',note:'New places, a little adventure.',mark:'☼'}]},
    {title:'What catches your eye?',note:'No right answer. You can always change your mind.',kind:'vibe',choices:[{id:'calm',title:'Quiet & simple',note:'Soft colors, easy favorites.',mark:'○'},{id:'bold',title:'A little playful',note:'Color, character, something new.',mark:'✳'}]},
    {title:'A little upgrade for…',note:'Think about the part of your day you enjoy making your own.',kind:'interests',choices:[{id:'focused_work',title:'My space',note:'A desk that feels good to use.',mark:'▱'},{id:'everyday_style',title:'My everyday look',note:'Easy outfits and small details.',mark:'◇'}]},
  ];
  let profile=preferences.load(),draft=preferences.normalize(profile),step=0,gesture=null,suppressClickUntil=0;
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const button=(text,cls,fn)=>{const node=el('button',cls,text);node.type='button';node.onclick=fn;return node;};
  const link=(text,cls,href)=>{const node=el('a',cls,text);node.href=href;return node;};
  function mode(onboarding){root.hidden=!onboarding;worldRoot.hidden=onboarding;scroll.scrollTop=0;}
  function start(at=0){draft=preferences.normalize(profile);step=at;renderStep();}
  function welcome(){
    mode(true);root.replaceChildren();
    const hero=el('div','cold-hero'),avatar=el('img','cold-hero-avatar');avatar.src='/assets/coupi.png';avatar.alt='Coupi';
    const title=el('h2','','A world that feels like you.');title.id='cold-title';hero.append(avatar,el('p','cold-eyebrow','A little about you'),title,el('p','cold-lede','A few easy picks help Coupi find your kind of things. Make it yours, or head straight to shopping.'));
    const paths=el('div','cold-paths');paths.append(button('Make a few quick picks →','cold-primary',()=>start(0)),button('Tell your story','cold-secondary',()=>start(3)));
    const speech=el('p','cold-speech');speech.append(document.createTextNode('Prefer a conversation? '),link('Talk with Coupi','','/call?intent=personalize'));
    root.append(hero,paths,speech,link('I know what I want to buy →','cold-skip','/call'),el('p','cold-privacy','Optional. Your confirmed preferences stay on this device. You can edit or clear them anytime.'));
  }
  function progress(){
    const row=el('div','cold-progress-row');row.append(button('← Back','cold-back',()=>{if(step===0){profile?.completed?renderWorlds():welcome();}else{step--;renderStep();}}),el('span','cold-step',`${step+1} of 4 · optional`));
    const bar=el('div','cold-progress');bar.setAttribute('aria-hidden','true');for(let i=0;i<4;i++){const dot=el('span');dot.dataset.active=String(i<=step);bar.append(dot);}root.append(row,bar);
  }
  function choose(ids){
    const q=questions[step];if(q.kind==='vibe')draft.vibe=ids.length===2?'mixed':ids[0];
    else draft.interests=[...new Set([...draft.interests.filter(id=>!q.choices.some(c=>c.id===id)),...ids])];
    renderStep();
  }
  function next(){step++;renderStep();}
  function renderStep(){
    mode(true);root.replaceChildren();progress();if(step===3){renderFinal();return;}
    const q=questions[step],title=el('h2','cold-question',q.title);title.id='cold-title';root.append(title,el('p','cold-question-note',q.note));
    const grid=el('div','cold-choice-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label',q.title);
    for(const option of q.choices){
      const selected=q.kind==='vibe'?draft.vibe===option.id:draft.interests.includes(option.id);
      const card=button('','cold-choice',event=>{if(Date.now()<suppressClickUntil){event.preventDefault();return;}choose([option.id]);});card.dataset.choice=option.id;card.dataset.selected=String(selected);card.setAttribute('aria-pressed',String(selected));
      const mark=el('span','cold-choice-mark',option.mark);mark.setAttribute('aria-hidden','true');card.append(mark,el('strong','',option.title),el('small','',option.note));if(selected){const check=el('span','cold-choice-check','✓');check.setAttribute('aria-hidden','true');card.append(check);}grid.append(card);
    }
    grid.onpointerdown=event=>{if(event.pointerType==='mouse'&&event.button!==0)return;gesture={id:event.pointerId,x:event.clientX,y:event.clientY};};
    grid.onpointerup=event=>{const start=gesture;gesture=null;if(!start||start.id!==event.pointerId)return;const x=event.clientX-start.x,y=event.clientY-start.y;if(Math.abs(x)<55||Math.abs(x)<Math.abs(y)*1.4)return;suppressClickUntil=Date.now()+400;event.preventDefault();choose([q.choices[x>0?1:0].id]);};
    grid.onpointercancel=()=>{gesture=null;};
    root.append(grid,el('p','cold-gesture-hint','← Left card · right card →'));
    const alternatives=el('div','cold-both');alternatives.append(button('A bit of both','',()=>{choose(q.choices.map(c=>c.id));next();}),button('Skip this','',next));root.append(alternatives,button('Next →','cold-primary cold-next',next),link('Skip setup & start shopping','cold-skip','/call'));
  }
  function chipGroup(values,current,onChange){
    const group=el('div','cold-interest-grid');for(const [id,label] of values){const chip=button(label,'cold-chip',()=>onChange(id));chip.setAttribute('aria-pressed',String(current.includes(id)));group.append(chip);}return group;
  }
  function renderFinal(){
    const title=el('h2','cold-final-question','What makes a day feel like you?');title.id='cold-title';root.append(title,el('p','cold-question-note','Keep the picks you like. Add a story if you want — a sentence is enough.'));
    root.append(el('p','cold-section-label','A few things you enjoy'),chipGroup(Object.entries(preferences.interests),draft.interests,id=>{draft.interests=draft.interests.includes(id)?draft.interests.filter(x=>x!==id):[...draft.interests,id];renderStep();}));
    root.append(el('p','cold-section-label','Your style'),chipGroup([['calm','Quiet & simple'],['bold','Playful'],['mixed','A little of both']],[draft.vibe],id=>{draft.vibe=id;renderStep();}));
    const label=el('label','cold-section-label','Your story · optional');label.htmlFor='cold-story';const story=el('textarea','cold-story');story.id='cold-story';story.maxLength=1200;story.placeholder='I love slow weekends, reading at home, and finding easy outfits for work…';story.value=draft.story;
    const count=el('p','cold-story-count',`${draft.story.length} / 1200`);story.oninput=()=>{draft.story=story.value;count.textContent=`${story.value.length} / 1200`;};
    const hints=el('div','cold-story-hints');for(const [text,placeholder] of [['My weekends','What does a good weekend look like for you?'],['My hobbies','What do you love doing in your spare time?'],['My everyday','What part of your everyday routine would you like to make nicer?']])hints.append(button(text,'',()=>{story.placeholder=placeholder;story.focus();}));
    root.append(label,story,count,hints,el('p','cold-section-label','A comfortable price per item'));
    const budget=el('div','cold-budget');for(const [value,label] of [[null,'Open to ideas'],[10000,'Up to ₩10,000'],[30000,'Up to ₩30,000'],[60000,'Up to ₩60,000']]){const chip=button(label,'cold-chip',()=>{draft.budget=value;renderStep();});chip.setAttribute('aria-pressed',String(draft.budget===value));budget.append(chip);}root.append(budget);
    const status=el('p','cold-status');status.setAttribute('role','status');
    root.append(button('Build my worlds →','cold-primary cold-build',()=>{try{profile=preferences.save({...draft,completed:true});renderWorlds();}catch(error){status.textContent=error.message;}}),status,el('p','cold-privacy-left','Your choices and story will be saved on this device. Your worlds start from the interests and budget you choose; tell Coupi your story in a call for a more personal conversation.'),link('Skip setup & start shopping','cold-skip','/call'));
  }
  function renderWorlds(){
    mode(false);worldRoot.replaceChildren();
    const intro=el('div','worlds-intro-row'),heading=el('div');heading.append(el('p','cold-eyebrow','Made from your picks'));const title=el('h2','','Your worlds, unfolding.');title.id='worlds-title';heading.append(title);intro.append(heading,button('Edit picks','worlds-edit',()=>start(3)));
    worldRoot.append(intro,el('p','worlds-subtitle','A few places to begin. Open a world, try something, and make it more you.'));
    const chips=el('div','worlds-profile');for(const id of profile.interests)chips.append(el('span','',preferences.interests[id]));chips.append(el('span','',profile.vibe==='calm'?'Quiet & simple':profile.vibe==='bold'?'Playful style':'A little of both'));if(profile.budget!==null)chips.append(el('span','',`Up to ₩${profile.budget.toLocaleString('en-US')} / item`));worldRoot.append(chips);
    const worlds=preferences.buildWorlds(window.COUPANG_PRODUCTS||[],profile),grid=el('div','worlds-grid');
    for(const world of worlds){
      const card=link('','world-card','/call?world='+encodeURIComponent(world.id));card.dataset.theme=world.theme;card.setAttribute('aria-label','Explore '+world.title);
      const header=el('div','world-card-heading'),arrow=el('span','world-card-arrow','↗');arrow.setAttribute('aria-hidden','true');header.append(el('h3','',world.title),arrow);
      const products=el('div','world-card-products');for(const product of world.products.slice(0,3)){const tile=el('div','world-product'),image=el('img');image.src=product.image;image.alt=product.name;image.loading='lazy';tile.append(image);products.append(tile);}
      const footer=el('div','world-card-footer');footer.append(el('span','',world.reason),el('span','',world.products.length+' finds'));card.append(header,el('p','world-card-description',world.subtitle),products,footer);grid.append(card);
    }
    if(!worlds.length)grid.append(el('p','worlds-empty','No saved catalog picks fit that budget yet. Try a wider price range, or tell Coupi what you have in mind.'));
    worldRoot.append(grid,el('p','worlds-note','Sourced Coupang product photos · reference prices. These are starting ideas from your selected interests, not a fit or compatibility guarantee.'),link('Talk with Coupi about my picks','cold-primary worlds-call','/call?intent=personalize'),link('I’m looking for something specific →','cold-skip','/call'));
    const reset=el('div','worlds-reset-panel');reset.hidden=true;reset.append(el('p','','Clear these preferences and start fresh?'));
    const actions=el('div','worlds-reset-actions'),error=el('p','cold-status');error.setAttribute('role','status');actions.append(button('Clear preferences','',()=>{try{preferences.clear();profile=null;draft=preferences.normalize(null);welcome();}catch(e){error.textContent=e.message;}}),button('Keep my worlds','',()=>{reset.hidden=true;}));reset.append(actions,error);
    worldRoot.append(button('Reset preferences','worlds-reset',()=>{reset.hidden=false;}),reset);
  }
  if(profile?.completed)renderWorlds();else welcome();
})();
