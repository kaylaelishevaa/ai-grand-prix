/* Saved worlds come from the shopper's conversation with Coupi in the call. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),preferences=window.CoupiPreferences;
  const root=$('worlds-empty'),worldRoot=$('worlds-view'),scroll=$('worlds-content');
  let profile=preferences.load();
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const button=(text,cls,fn)=>{const node=el('button',cls,text);node.type='button';node.onclick=fn;return node;};
  const link=(text,cls,href)=>{const node=el('a',cls,text);node.href=href;return node;};
  function mode(empty){root.hidden=!empty;worldRoot.hidden=empty;scroll.scrollTop=0;}
  function emptyWorlds(){
    mode(true);root.replaceChildren();
    const hero=el('div','cold-hero'),avatar=el('img','cold-hero-avatar');avatar.src='/assets/coupi.png';avatar.alt='Coupi';
    const title=el('h2','','Your worlds start with a conversation.');title.id='worlds-empty-title';
    hero.append(avatar,title,el('p','cold-lede','Tell Coupi what you enjoy during your call. Your personalized worlds will appear here.'));
    root.append(hero,link('Talk with Coupi','cold-primary worlds-call','/call'),el('p','cold-privacy','Optional. Your confirmed preferences stay on this device.'));
  }
  function renderWorlds(){
    mode(false);worldRoot.replaceChildren();
    const intro=el('div','worlds-intro-row'),heading=el('div');heading.append(el('p','cold-eyebrow','From your conversation'));const title=el('h2','','Your worlds, unfolding.');title.id='worlds-title';heading.append(title);intro.append(heading,link('Talk to update','worlds-edit','/call?intent=personalize'));
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
    worldRoot.append(grid,el('p','worlds-note','Sourced Coupang product photos · reference prices. These are starting ideas from the interests you shared, not a fit or compatibility guarantee.'),link('Talk with Coupi about my picks','cold-primary worlds-call','/call?intent=personalize'),link('I’m looking for something specific →','cold-skip','/call'));
    const reset=el('div','worlds-reset-panel');reset.hidden=true;reset.append(el('p','','Clear these preferences and start fresh?'));
    const actions=el('div','worlds-reset-actions'),error=el('p','cold-status');error.setAttribute('role','status');actions.append(button('Clear preferences','',()=>{try{preferences.clear();profile=null;emptyWorlds();}catch(e){error.textContent=e.message;}}),button('Keep my worlds','',()=>{reset.hidden=true;}));reset.append(actions,error);
    worldRoot.append(button('Reset preferences','worlds-reset',()=>{reset.hidden=false;}),reset);
  }
  if(profile?.completed)renderWorlds();else emptyWorlds();
})();
