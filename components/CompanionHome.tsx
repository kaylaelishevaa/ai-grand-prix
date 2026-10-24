'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {Art,Modal,Pet} from './CoupiApp';
import {Glyph} from './Glyph';
import {applyHomeDemoAction,buildDemoHome,buildLiveHome,createHomeDemo,demoDeliveryTime,HOME_SCENARIOS,homeMoney,referenceById,referenceName,type HomeCard,type HomeDemoAction,type HomeReference,type HomeScenario} from '@/lib/home-feed';
import type {Profile} from '@/lib/types';
import './companion-home.css';

export interface CompanionHomeProps {profile:Profile;onCall:()=>void;onExplore:()=>void;onOpenProduct:(skuId:string)=>void;offline?:boolean;presenter?:boolean;initialScenario?:HomeScenario;}

function ReferenceImage({product,large=false}:{product:HomeReference;large?:boolean}) {
  const [failed,setFailed]=useState(false);
  return <span className={`ch-reference-image${large?' is-large':''}`}>{failed?<Glyph name="image"/>:<img src={product.image} alt={referenceName(product)} onError={()=>setFailed(true)}/>}</span>;
}
function WorldInvitation({onExplore}:{onExplore:()=>void}) {
  return <button className="ch-world-invitation" onClick={onExplore}><svg viewBox="0 0 320 125" fill="none" aria-hidden="true"><path d="M27 105c26-45 74-54 116-18S222 64 295 36" stroke="#c7b998" strokeWidth="1.5" strokeDasharray="3 7"/><path d="M27 72c-20-20 13-42 44-32 26-8 61 14 39 37-18 17-64 17-83-5Z" fill="#c9d7b3"/><path d="M190 46c-19-26 25-46 54-30 32-7 65 28 35 46-22 13-75 2-89-16Z" fill="#dbb3ac"/><path d="M119 107c-21-15 7-39 32-32 26-6 48 16 30 31-14 12-46 13-62 1Z" fill="#bacfc8"/><path d="M64 69V35m-10 10 10-10 10 10M231 44V11m-9 12 9-12 9 12" stroke="#64837a" strokeWidth="2" strokeLinecap="round"/><circle cx="149" cy="92" r="7" fill="#e8681a"/><circle cx="149" cy="92" r="13" stroke="#e8681a" strokeOpacity=".2"/><path d="M288 83v10m-5-5h10M120 20v8m-4-4h8" stroke="#bb9c72" strokeLinecap="round"/></svg><span><strong>a little world of your own.</strong><small>follow a feeling. keep a moment.</small></span><Glyph name="arrow-right"/></button>;
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
  const mood=demo?.scenario||live.mood;
  const closeSheet=useCallback(()=>{setSheet(null);setRating(null);},[]);
  function chooseScenario(value:HomeScenario|'live'){setDemo(value==='live'?null:createHomeDemo(value));closeSheet();setNotice('');}
  function openCard(card:HomeCard){if(card.sku){onOpenProduct(card.sku.id);return;}setRating(null);setSheet(card);}
  function act(action:HomeDemoAction,message:string,keepOpen=false){if(!demo)return;setDemo(applyHomeDemoAction(demo,action));setNotice(message);if(!keepOpen)closeSheet();}
  const order=demo?.orders.find(item=>item.id===sheet?.sourceId),product=sheet?.reference,swap=order?.swapId?referenceById(order.swapId):undefined;
  const difference=product?.price!=null&&swap?.price!=null?swap.price-product.price:null;
  const timeline=['Saved in this story','Packed','Out for delivery','Delivered'];
  const stage=order?({packed:1,out_for_delivery:2,delivered:3,delayed:1,cancelled:0}[order.status]):0;

  return <section className="companion-home screen-surface" data-mood={mood} aria-label="Home, a little less to think about">
    {showPresenter&&<div className="ch-presenter"><span>VIEW A PREPARED DAY</span><div role="group" aria-label="Homepage presenter scenarios"><button aria-pressed={!demo} onClick={()=>chooseScenario('live')}>My home</button>{HOME_SCENARIOS.map(item=><button key={item.id} aria-pressed={demo?.scenario===item.id} onClick={()=>chooseScenario(item.id)}>{item.label}</button>)}</div></div>}
    {demo&&<p className="ch-demo-banner"><i/>DEMO · SYNTHETIC ORDERS · 26 OCT 2026<button onClick={()=>chooseScenario('live')}>Exit</button></p>}
    <div className="ch-hero"><span className="ch-halo"/><span className="ch-orbit"/><button className="ch-avatar" onClick={onCall} aria-label="Call Coopy"><Pet size="large" happy={mood==='first'}/><span className="ch-avatar-spark"><Glyph name={mood==='night'?'moon':mood==='problem'?'help':'spark'}/></span></button><span className="ch-presence"><i/>{offline?'HERE, OFFLINE':'YOUR LITTLE SOMEONE'}</span></div>
    <h1 className="ch-brief" aria-live="polite">{feed.brief}</h1>
    <p className="ch-call-hint"><button onClick={onCall}>a thought? tap me. <Glyph name="mic"/></button></p>
    {feed.cards.length>0&&<div className="ch-updates" aria-label="Your updates">{feed.cards.map(card=><article className={`ch-card ch-card-${card.kind}`} key={card.id}>
      <span className="ch-card-art">{card.sku?<Art sku={card.sku}/>:card.reference?<ReferenceImage product={card.reference}/>:<Glyph name="spark"/>}</span>
      <div className="ch-card-copy"><span className="ch-card-label">{card.demo?'PREPARED / ':''}{card.kind==='problem'?'A LITTLE DETOUR':card.kind==='decision'?'YOUR WORD COMES NEXT':card.kind==='receipt'?'YOUR APPROVAL, KEPT':card.kind==='arrival'?'ON ITS WAY':card.kind==='followup'?'HOW DID IT FEEL?':'A GENTLE PAUSE'}</span><h2>{card.title}</h2><p>{card.line}</p><button className="ch-card-action" onClick={()=>openCard(card)}>{card.action}<Glyph name={card.locked?'lock':'arrow-right'}/></button></div>
    </article>)}</div>}
    {!feed.cards.length&&<WorldInvitation onExplore={onExplore}/>}
    {!!feed.cards.length&&<button className="ch-explore-link" onClick={onExplore}><Glyph name="scene"/> a little wander, while life happens <Glyph name="arrow-right"/></button>}
    {!demo&&live.pendingCount>3&&<p className="ch-more-note">the three closest things. your other plans stay with their products.</p>}
    <p className="ch-local-note">{demo?'PREPARED EVENTS · REAL LISTING PHOTOS · REFERENCE PRICES':'YOUR LOCAL PLANS · NOTHING BUYS ITSELF'}</p>
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
