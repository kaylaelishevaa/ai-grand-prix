'use client';

import {useCallback,useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Art,Modal} from './CoupiApp';
import {Glyph} from './Glyph';
import {applyHomeDemoAction,buildDemoHome,buildLiveHome,createHomeDemo,demoDeliveryTime,HOME_SCENARIOS,homeMoney,referenceById,referenceName,type HomeCard,type HomeDemoAction,type HomeReference,type HomeScenario} from '@/lib/home-feed';
import type {Profile,SKU} from '@/lib/types';
import {getSku} from '@/lib/catalog';
import {sanitizeProfileForAI} from '@/lib/profile';
import './companion-home.css';
import './companion-home-visual.css';

export interface CompanionHomeProps {profile:Profile;onCall:()=>void;onExplore:()=>void;onOpenProduct:(skuId:string)=>void;offline?:boolean;presenter?:boolean;initialScenario?:HomeScenario;}

function ReferenceImage({product,large=false}:{product:HomeReference;large?:boolean}) {
  const [failed,setFailed]=useState(false);
  return <span className={`ch-reference-image${large?' is-large':''}`}>{failed?<Glyph name="image"/>:<img src={product.image} alt={referenceName(product)} onError={()=>setFailed(true)}/>}</span>;
}
function HomeProductImage({sku}:{sku:SKU}) {
  const [failed,setFailed]=useState(false);
  return sku.image?.startsWith('/')&&!failed?<span className="ch-reference-image"><img src={sku.image} alt={sku.name} onError={()=>setFailed(true)}/></span>:<Art sku={sku}/>;
}

/** Extra Home cards use surviving, non-private facts; no demo memories are invented. */
export function homeExtras(profile:Profile,now:Date) {
  const safe=sanitizeProfileForAI(profile).memoryLines;
  const firstCallCount=profile.journey?.interviewComplete?profile.memoryLines.filter(line=>
    /first.call/.test(line.source)&&now.getTime()-Date.parse(line.createdAt)<86400000&&Date.parse(line.createdAt)<=now.getTime()&&safe.some(item=>item.text===line.text&&item.source===line.source)
  ).length:0;
  const owned=profile.owned.flatMap(item=>{const sku=getSku(item.skuId);return sku&&!sku.sensitive&&!profile.quarantine.some(q=>q.sensitive&&q.category===sku.category)?[sku]:[];}).slice(0,2);
  return{firstCallCount,owned};
}
/** Decorative, imagined scenery. It describes no weather, product or personal fact. */
function CompanionLandscape(){
  const id=useId().replaceAll(':','');
  return <svg className="ch-landscape" viewBox="0 0 420 245" aria-hidden="true" focusable="false">
    <defs><linearGradient id={id+'-sky'} x2="0" y2="1"><stop stopColor="var(--ch-sky-top)"/><stop offset="1" stopColor="var(--ch-sky-bottom)"/></linearGradient><linearGradient id={id+'-ground'} x2="0" y2="1"><stop stopColor="var(--ch-island-top)"/><stop offset="1" stopColor="var(--ch-island-bottom)"/></linearGradient></defs>
    <path d="M74 222V119C74 44 135 5 210 5s136 39 136 114v103Z" fill={'url(#'+id+'-sky)'} stroke="var(--ch-window-line)" strokeWidth="1.4"/>
    <circle className="ch-landscape-sun" cx="280" cy="65" r="25" fill="var(--ch-sun)"/>
    <path d="M75 165c46-43 72-16 103-38 35-25 63 17 88-3 26-22 55-12 80 8v91H75Z" fill="var(--ch-hill-far)"/>
    <path d="M75 190c37-17 72-4 112-30 54-35 83 19 159-9v72H75Z" fill="var(--ch-hill-near)"/>
    <path d="M127 21v135M295 25v119" stroke="var(--ch-window-line)" strokeWidth="1" opacity=".55"/>
    <ellipse cx="213" cy="222" rx="159" ry="15" fill="var(--ch-shadow)"/>
    <path d="M50 184c13-16 63-28 114-28 78-22 192 4 209 26l-10 25c-24 25-261 33-302-2Z" fill="var(--ch-island-bottom)"/>
    <ellipse cx="212" cy="182" rx="162" ry="34" fill={'url(#'+id+'-ground)'}/>
    <path d="M278 159c-42 13-53 19-31 30 18 9 11 13-26 23" fill="none" stroke="var(--ch-path)" strokeWidth="15" strokeLinecap="round"/>
    <ellipse className="ch-companion-shadow" cx="206" cy="184" rx="64" ry="11" fill="var(--ch-shadow)"/>
    <g className="ch-landscape-plant" fill="var(--ch-leaf)"><path d="M92 184c-1-27-16-48-5-71 18 8 24 29 5 71Z"/><path d="M93 183c5-33 19-47 38-49 3 23-13 43-38 49Z"/><path d="M91 180c-23-7-34-24-31-40 20 2 31 16 31 40Z"/><path d="M92 184v-38" fill="none" stroke="var(--ch-leaf-stem)" strokeWidth="2"/></g>
    <g className="ch-landscape-blooms"><path d="M323 185v-27m-1 14 10-9m-10 5-9-6" stroke="var(--ch-leaf-stem)" strokeWidth="2" fill="none"/><g fill="var(--ch-petal)"><circle cx="323" cy="150" r="5"/><circle cx="316" cy="157" r="5"/><circle cx="330" cy="157" r="5"/><circle cx="323" cy="163" r="5"/></g><circle cx="323" cy="157" r="4" fill="var(--ch-sun)"/></g>
    <g fill="var(--ch-pebble)"><ellipse cx="136" cy="199" rx="10" ry="5"/><ellipse cx="304" cy="190" rx="13" ry="6"/><ellipse cx="319" cy="197" rx="6" ry="3"/></g>
    <ellipse className="ch-fine-orbit" cx="212" cy="136" rx="165" ry="68" transform="rotate(-12 212 136)" fill="none" stroke="var(--ch-orbit)" strokeWidth="1" strokeDasharray="2 7"/>
    <g className="ch-tiny-glints" fill="var(--ch-glint)"><path d="m63 80 2.7 7.3L73 90l-7.3 2.7L63 100l-2.7-7.3L53 90l7.3-2.7Z"/><circle cx="351" cy="112" r="3"/><circle cx="54" cy="155" r="2"/></g>
  </svg>;
}
function WorldWindow({compact=false}:{compact?:boolean}){
 const id=useId().replaceAll(':','');
 return <svg className={`ch-world-window${compact?' is-compact':''}`} viewBox="0 0 420 182" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><defs><linearGradient id={id+'-world-sky'} x2="0" y2="1"><stop stopColor="#c8e7ec"/><stop offset="1" stopColor="#edf4e9"/></linearGradient><linearGradient id={id+'-world-water'} x2="1" y2="1"><stop stopColor="#83c3c7"/><stop offset="1" stopColor="#bddce0"/></linearGradient></defs>
   <rect width="420" height="182" fill={'url(#'+id+'-world-sky)'}/><circle cx="318" cy="46" r="28" fill="#fff1d0"/><path d="M0 110c39-11 43-36 82-38 45-2 59 31 105 11 62-25 99 26 151-1 34-17 56-1 82 5v95H0Z" fill="#a7c6ba"/><path d="M0 137c37-23 75-8 111-16 49-11 67-37 110-17 33 15 52 30 89 11 47-25 73-12 110 2v65H0Z" fill="#81ada2"/><path d="M0 157c76-24 111-12 166-9 35 3 71-19 113-13 53 7 94 25 141 22v25H0Z" fill="#588e85"/>
   <path d="M265 107c-62 14-79 27-46 34 46 8 58 18 20 41H116c65-28 86-31 63-41-20-9 23-28 86-34Z" fill={'url(#'+id+'-world-water)'}/>
   <g fill="#3e7774"><path d="M41 141V78c-29 5-28 40 0 40 25-3 29-36 0-40Z"/><path d="M70 143v-43c-22 1-25 29-1 31 20-1 21-28 1-31Z"/><path d="M359 146V86c-30 2-31 40 0 41 28-2 29-37 0-41Z"/></g><g stroke="#305e60" strokeWidth="2"><path d="M41 155V103m29 54v-38m289 41v-51"/></g>
   <path d="M289 136v-18l17-13 19 13v24" fill="#d9e7d9"/><path d="m284 120 22-18 24 20" fill="none" stroke="#487b77" strokeWidth="4" strokeLinecap="round"/><path d="M302 141v-15h10v15" fill="#83aaa2"/><path d="M273 148h66" stroke="#dce7d3" strokeWidth="4" strokeLinecap="round"/>
   <g fill="#edc39e"><ellipse cx="94" cy="159" rx="6" ry="3"/><ellipse cx="349" cy="170" rx="9" ry="4"/></g><g fill="#d6e9ce"><circle cx="37" cy="163" r="2"/><circle cx="47" cy="168" r="2"/><circle cx="374" cy="164" r="2"/></g><path d="M170 44c5-5 10-5 15 0m-15 0c-5-5-10-5-15 0" fill="none" stroke="#7fa5a4" strokeWidth="1.7" strokeLinecap="round"/>
 </svg>;
}
function WorldInvitation({owned,onExplore}:{owned:SKU[];onExplore:()=>void}) {
  return <button className="ch-world-invitation ch-main-world" onClick={onExplore}>
    <WorldWindow/>
    <span className="ch-world-invitation-label">A WINDOW INTO EXPLORE</span>
    {!!owned.length&&<span className="ch-owned-images">{owned.map(sku=><span key={sku.id}><HomeProductImage sku={sku}/></span>)}</span>}
    <span className="ch-main-world-row"><span><strong>A little world of your own</strong><small>A place for your story</small></span><span className="ch-world-action">Explore</span></span>
  </button>;
}

/** Home is a short read of real profile state; presenter stories are explicit, isolated rehearsals. */
export default function CompanionHome({profile,onCall,onExplore,onOpenProduct,offline=false,presenter=false,initialScenario}:CompanionHomeProps) {
  const [clock,setClock]=useState(()=>new Date());
  const [showPresenter,setShowPresenter]=useState(presenter||!!initialScenario);
  const [demo,setDemo]=useState(()=>initialScenario?createHomeDemo(initialScenario):null);
  const [sheet,setSheet]=useState<HomeCard|null>(null),[notice,setNotice]=useState(''),[rating,setRating]=useState<number|null>(null);
  useEffect(()=>{const query=new URLSearchParams(location.search),state=query.get('state');if(query.get('presenter')==='1'||HOME_SCENARIOS.some(item=>item.id===state))setShowPresenter(true);if(HOME_SCENARIOS.some(item=>item.id===state))setDemo(createHomeDemo(state as HomeScenario));},[]);
  useEffect(()=>{const timer=setInterval(()=>setClock(new Date()),60000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(timer);},[notice]);
  const live=useMemo(()=>buildLiveHome(profile,clock),[profile,clock]);
  const feed=useMemo(()=>demo?buildDemoHome(demo):live,[demo,live]);
  const extras=useMemo(()=>homeExtras(profile,clock),[profile,clock]);
  const showMemory=!demo&&extras.firstCallCount>0&&feed.cards.length<3;
  const mood=demo?.scenario||(live.cards.some(card=>card.kind==='problem')?'problem':live.mood==='night'?'night':showMemory?'first':live.mood);
  const mascotMood=mood==='night'?'sleepy':mood==='first'?'excited':mood==='problem'?'attentive':mood==='quiet'?'relaxed':'calm';
  const pressTimer=useRef<ReturnType<typeof setTimeout>|null>(null),longPressed=useRef(false);
  const cancelPress=()=>{if(pressTimer.current)clearTimeout(pressTimer.current);pressTimer.current=null;};
  useEffect(()=>cancelPress,[]);
  const closeSheet=useCallback(()=>{setSheet(null);setRating(null);},[]);
  function chooseScenario(value:HomeScenario|'live'){setDemo(value==='live'?null:createHomeDemo(value));closeSheet();setNotice('');}
  function openCard(card:HomeCard){if(card.href){location.assign(card.href);return;}if(card.sku){onOpenProduct(card.sku.id);return;}setRating(null);setSheet(card);}
  function act(action:HomeDemoAction,message:string,keepOpen=false){if(!demo)return;setDemo(applyHomeDemoAction(demo,action));setNotice(message);if(!keepOpen)closeSheet();}
  const order=demo?.orders.find(item=>item.id===sheet?.sourceId),product=sheet?.reference,swap=order?.swapId?referenceById(order.swapId):undefined;
  const difference=product?.price!=null&&swap?.price!=null?swap.price-product.price:null;
  const timeline=['Saved in this story','Packed','Out for delivery','Delivered'];
  const stage=order?({packed:1,out_for_delivery:2,delivered:3,delayed:1,cancelled:0}[order.status]):0;

  return <section className="companion-home screen-surface" data-mood={mood} aria-label="Home, a little less to think about">
    {showPresenter&&<div className="ch-presenter"><span>VIEW A PREPARED DAY</span><div role="group" aria-label="Homepage presenter scenarios"><button aria-pressed={!demo} onClick={()=>chooseScenario('live')}>My home</button>{HOME_SCENARIOS.map(item=><button key={item.id} aria-pressed={demo?.scenario===item.id} onClick={()=>chooseScenario(item.id)}>{item.label}</button>)}</div></div>}
    {demo&&<p className="ch-demo-banner"><i/>DEMO · SYNTHETIC ORDERS · 26 OCT 2026<button onClick={()=>chooseScenario('live')}>Exit</button></p>}
    <div className="ch-hero"><CompanionLandscape/><span className="ch-hero-kicker">A LITTLE ROOM FOR YOU</span><button className="ch-avatar ch-main-avatar" aria-label="Call Coopy" onPointerDown={event=>{if(event.button!==0||!event.isPrimary)return;cancelPress();longPressed.current=false;pressTimer.current=setTimeout(()=>{longPressed.current=true;setShowPresenter(true);},1000);}} onPointerUp={cancelPress} onPointerLeave={cancelPress} onPointerCancel={cancelPress} onContextMenu={event=>event.preventDefault()} onClick={()=>{if(longPressed.current){longPressed.current=false;return;}onCall();}}><img src={`/main-shell/home-${mascotMood}.svg`} alt="" width="150" height="133"/></button></div>
    <h1 className="ch-brief" aria-live="polite">{feed.brief}</h1>
    <p className="ch-call-hint"><button onClick={onCall}><span className="ch-call-dot"/>A thought? I’m here. <Glyph name="mic"/></button></p>
    {feed.cards.length>0&&<div className="ch-updates" aria-label="Your updates">{feed.cards.map(card=><article className={`ch-card ch-card-${card.kind}`} key={card.id}>
      <span className="ch-card-art">{card.sku?<HomeProductImage sku={card.sku}/>:card.reference?<ReferenceImage product={card.reference}/>:<Glyph name="spark"/>}</span>
      <div className="ch-card-copy"><span className="ch-card-label">{card.demo?'PREPARED / ':''}{card.kind==='problem'?'A LITTLE DETOUR':card.kind==='decision'?'YOUR WORD COMES NEXT':card.kind==='receipt'?'YOUR APPROVAL, KEPT':card.kind==='arrival'?'ON ITS WAY':card.kind==='followup'?'HOW DID IT FEEL?':'A GENTLE PAUSE'}</span><h2>{card.title}</h2><p>{card.line}</p><button className="ch-card-action" onClick={()=>openCard(card)}>{card.action}<Glyph name={card.locked?'lock':'arrow-right'}/></button></div>
    </article>)}</div>}
    {showMemory&&<article className="ch-memory-card"><div><h2>I learned {extras.firstCallCount} {extras.firstCallCount===1?'thing':'things'} about you</h2><p>Make sure I got them right</p></div><a href="/privacy">Check</a></article>}
    {!feed.cards.length&&<WorldInvitation owned={demo?[]:extras.owned} onExplore={onExplore}/>}
    {!!feed.cards.length&&<button className="ch-explore-link ch-explore-window" onClick={onExplore}><WorldWindow compact/><span><small>A CHANGE OF SCENERY</small><strong>A little wander?</strong></span><Glyph name="arrow-right"/></button>}
    {!demo&&live.pendingCount>3&&<p className="ch-more-note">The closest things first. Your other plans are in Decisions.</p>}
    <p className="ch-local-note">{demo?'PREPARED EVENTS · REAL LISTING PHOTOS · REFERENCE PRICES':'Local simulation · approval always comes first'}</p>
    <p className="ch-notice" role="status">{notice}</p>
    {sheet&&product&&demo&&createPortal(<div className="ch-modal-host"><Modal title="PREPARED DAY / DEMO DETAILS" onClose={closeSheet}><div className="ch-sheet">
      <p className="ch-sheet-demo">SIMULATION · changes stay in this prepared day</p>
      <ReferenceImage product={product} large/><h2>{referenceName(product)}</h2><strong className="ch-reference-price">{homeMoney(product.price)}</strong><p className="ch-price-caption">HISTORICAL REFERENCE PRICE · NOT A LIVE QUOTE</p>
      {sheet.kind==='decision'&&<><p>your word comes next. this saves a demo choice; it does not place an order.</p><div className="ch-sheet-actions"><button className="ch-primary" onClick={()=>act({kind:'approve',itemId:product.id},'demo choice saved. no order or payment placed.')}>Approve demo choice <Glyph name="check"/></button><button onClick={()=>act({kind:'dismiss',itemId:product.id},'removed from this prepared day.')}>Not now</button></div></>}
      {sheet.kind==='problem'&&order&&<><p>{sheet.line}</p>{swap&&<div className="ch-swap"><ReferenceImage product={swap}/><div><small>A PREPARED ALTERNATIVE</small><h3>{referenceName(swap)}</h3><p>{homeMoney(swap.price)} reference{difference!==null?` · ${difference>=0?'+':'−'}${homeMoney(Math.abs(difference))}`:''}</p><p>Fictional arrival · {demoDeliveryTime(order.swapEta)}</p><a href={swap.url} target="_blank" rel="noopener noreferrer">See the actual listing <Glyph name="arrow-up"/></a></div></div>}<div className="ch-sheet-actions">{swap&&<button className="ch-primary" onClick={()=>act({kind:'swap',orderId:order.id},'demo swap saved. no retailer order was changed.')}>Choose this demo swap <Glyph name="swap"/></button>}<button onClick={()=>act({kind:'wait',orderId:order.id},'waiting in this story. no retailer order was changed.')}>Wait for {demoDeliveryTime(order.eta)}</button><button onClick={()=>act({kind:'cancel',orderId:order.id},'removed from this story. no real order was cancelled.')}>Remove from this story</button></div></>}
      {sheet.kind==='arrival'&&order&&<><p>Prepared order {order.id} · {demoDeliveryTime(order.eta)}</p><ol className="ch-timeline">{timeline.map((label,index)=><li key={label} data-complete={index<=stage} aria-current={index===stage?'step':undefined}><span>{index<=stage?<Glyph name="check"/>:String(index+1).padStart(2,'0')}</span><div>{label}<small>{index===stage?'CURRENT PREPARED STEP':index>stage?'UPCOMING IN THIS STORY':''}</small></div></li>)}</ol><p className="ch-evidence-note">This timeline is written for the demo. No carrier tracking is connected.</p></>}
      {sheet.kind==='followup'&&<><p>how did the shade feel?</p><div className="ch-rating" role="group" aria-label="Rate the prepared purchase">{[1,2,3,4,5].map(value=><button key={value} aria-label={`${value} ${value===1?'star':'stars'}`} aria-pressed={rating===value} onClick={()=>{setRating(value);act({kind:'rate',orderId:sheet.sourceId,rating:value},'rating saved only in this prepared day.',true);}}>{value}<Glyph name="star"/></button>)}</div>{rating!==null&&<div className="ch-rating-reply"><p>{rating<=2?'oh, that didn’t land. we can talk through what felt wrong.':'noted. a little closer to your kind of thing.'}</p>{rating<=2&&<button className="ch-primary" onClick={()=>{closeSheet();onCall();}}>Talk to Coopy <Glyph name="mic"/></button>}<p className="ch-evidence-note">Your demo rating does not change the catalog reviews or your live profile.</p></div>}</>}
      {sheet.kind==='nudge'&&<><p>{sheet.line}</p><div className="ch-reason"><small>WHY THIS IS HERE</small><p>{sheet.reason}</p></div><div className="ch-sheet-actions">{sheet.id.startsWith('held:')?<button onClick={()=>act({kind:'remove-held',itemId:product.id},'the late-night item is gone from this story.')}>Let this one go <Glyph name="minus"/></button>:<button className="ch-primary" onClick={()=>act({kind:'save',itemId:product.id},'kept for review in this prepared day only.')}>Keep for demo review <Glyph name="plus"/></button>}</div></>}
      <details className="ch-source"><summary>What’s real here? <Glyph name="help"/></summary><p>{product.sourceNote}</p><ul>{product.verifiedAttributes.map((fact,index)=><li key={index}>{fact}</li>)}</ul><p>Reviews, delivery, durability and current stock are unverified for this reference product. Demo events are not retailer evidence.</p></details><a className="ch-listing-link" href={product.url} target="_blank" rel="noopener noreferrer">Read current details on Coupang <Glyph name="arrow-up"/></a>
    </div></Modal></div>,document.body)}
  </section>;
}
