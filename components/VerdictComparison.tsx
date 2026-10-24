'use client';

import {useEffect, useId, useMemo, useRef, useState} from 'react';
import {buildComparison, compareProducts, type ComparisonBadge} from '@/lib/comparison';
import {getReview, getSku, reviewsForSku} from '@/lib/catalog';
import {eligibleCatalog} from '@/lib/profile';
import {samePurpose} from '@/lib/comparison-groups';
import type {Profile, Verdict} from '@/lib/types';
import {Glyph, type GlyphName} from './Glyph';
import {productArt} from './art';
import './verdict-comparison.css';

const money=(value:number)=>'₩'+value.toLocaleString('en-US');
const badgeGlyph:Record<ComparisonBadge['kind'],GlyphName>={cheapest:'minus','most-loved':'star','best-for-you':'heart',fastest:'rocket','best-value':'check','your-choice':'check'};

function Badge({badge}:{badge:ComparisonBadge}) {
  return <span className="comparison-badge" data-award={badge.kind}><Glyph name={badgeGlyph[badge.kind]}/>{badge.label}{badge.tied&&<small> · tied</small>}</span>;
}

/** The exact same evidence and selection controls live in scenes, calls and Ask. */
export default function VerdictComparison({profile,pickSkuId,verdict,origin='scene',disabled=false,onChange,onBusyChange}:{
  profile:Profile;pickSkuId:string;verdict?:Verdict|null;origin?:'call'|'ask'|'scene';disabled?:boolean;
  onChange:(verdict:Verdict,profile:Profile)=>void;onBusyChange?:(busy:boolean)=>void;
}) {
  const uid=useId();
  const [otherId,setOtherId]=useState<string|null>(null);
  const [evidence,setEvidence]=useState<{ids:string[];title:string}|null>(null);
  const [working,setWorking]=useState(false),[error,setError]=useState('');
  const panel=useRef<HTMLDivElement>(null);
  const evidencePanel=useRef<HTMLElement>(null);
  const inFlight=useRef(false),generation=useRef(0);
  const selection=useRef<{key:string;requestId:string}|null>(null);
  const previousPick=useRef(pickSkuId);
  const eligibleIds=useMemo(()=>new Set(eligibleCatalog(profile,'ask').map(sku=>sku.id)),[profile]);
  const comparison=useMemo(()=>eligibleIds.has(pickSkuId)?buildComparison(profile,pickSkuId):null,[profile,pickSkuId,eligibleIds]);
  const head=useMemo(()=>comparison&&otherId&&otherId!==pickSkuId&&eligibleIds.has(otherId)&&getSku(pickSkuId)&&getSku(otherId)&&samePurpose(getSku(pickSkuId)!,getSku(otherId)!)?compareProducts(profile,pickSkuId,otherId):null,[profile,pickSkuId,otherId,comparison,eligibleIds]);
  const main=getSku(pickSkuId),other=otherId?getSku(otherId):undefined;
  useEffect(()=>{if(previousPick.current!==pickSkuId){generation.current++;previousPick.current=pickSkuId;setOtherId(null);setEvidence(null);setError('');selection.current=null;}},[pickSkuId]);
  useEffect(()=>()=>{generation.current++;},[]);
  useEffect(()=>{if(otherId)panel.current?.focus({preventScroll:true});},[otherId]);
  useEffect(()=>{if(evidence){evidencePanel.current?.focus({preventScroll:true});evidencePanel.current?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}},[evidence]);

  function showEvidence(ids:string[],title:string){setEvidence({ids:[...new Set(ids)],title});}
  function ReviewChips({ids,label='Review source'}:{ids:string[];label?:string}) {
    if(!ids.length)return null;
    return <div className="comparison-citations">{ids.slice(0,2).map(id=><button type="button" key={id} onClick={()=>showEvidence([id],label)}><Glyph name="arrow-up"/>{id}</button>)}{ids.length>2&&<button type="button" onClick={()=>showEvidence(ids,label)}>All {ids.length} sources <Glyph name="arrow-right"/></button>}</div>;
  }
  async function choose() {
    if(!otherId||inFlight.current||disabled)return;
    const key=pickSkuId+':'+otherId;
    if(selection.current?.key!==key)selection.current={key,requestId:crypto.randomUUID()};
    inFlight.current=true;setWorking(true);onBusyChange?.(true);setError('');
    const token=++generation.current;
    try {
      const response=await fetch('/api/compare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fromSkuId:pickSkuId,skuId:otherId,requestId:selection.current.requestId,origin}),cache:'no-store'});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||result.message||'That comparison could not be saved.');
      if(token!==generation.current)return;
      if(result.blocked)throw new Error(result.blocked);
      onChange(result.verdict,result.profile);setOtherId(null);setEvidence(null);selection.current=null;
    } catch(cause){if(token===generation.current)setError(cause instanceof Error?cause.message:'Please try again.');}
    finally{inFlight.current=false;setWorking(false);if(token===generation.current)onBusyChange?.(false);}
  }
  if(!main)return null;
  if(!comparison)return <section className="verdict-comparison"><p className="comparison-limit">{profile.owned.some(item=>item.skuId===pickSkuId)?'already in your world. no repeat purchase proposed.':'This item is excluded by your profile’s recommendation rules.'}</p></section>;
  const fitIds=head?[...new Set(head.dimensions.flatMap(d=>d.memoryIds))]:[];
  const otherOption=comparison.contenders.find(option=>option.skuId===otherId);
  return <section className="verdict-comparison" aria-label="Contenders and evaluation dimensions">
    <div className="comparison-winner"><Badge badge={comparison.main.badge}/><p>{comparison.main.badge.basis}</p><ReviewChips ids={comparison.main.badge.reviewIds} label="Badge evidence"/>{comparison.main.badge.memoryIds.length>0&&<details className="comparison-memory"><summary><Glyph name="head"/> Memories behind this badge</summary>{comparison.main.badge.memoryIds.map(id=>{const line=profile.memoryLines.find(memory=>memory.id===id);return line?<div className="comparison-memory-line" key={id}><p>“{line.text}”</p><small>{line.source}</small></div>:null;})}</details>}</div>
    <div className="contenders-heading"><h3>CONTENDERS</h3><span>{comparison.contenders.length} alternatives · same purpose</span></div>
    <div className="contenders-row">{comparison.contenders.map(option=>{const sku=getSku(option.skuId);if(!sku)return null;return <button type="button" className={`contender-card ${otherId===sku.id?'is-current':''}`} key={sku.id} disabled={disabled||working} aria-expanded={otherId===sku.id} aria-controls={uid+'-head'} onClick={()=>{setOtherId(current=>current===sku.id?null:sku.id);setEvidence(null);setError('');}}>
      <span className="contender-art" dangerouslySetInnerHTML={{__html:productArt(sku.type,sku.color)}}/>
      <span className="contender-copy"><Badge badge={option.badge}/><b>{sku.name}</b><strong>{money(sku.price)}</strong><small>Compare with your pick <Glyph name="arrow-up"/></small></span>
    </button>;})}</div>
    <p className="comparison-scope">{comparison.scope}</p>
    {!!comparison.limits.length&&<p className="comparison-limit">{comparison.limits.join(' ')}</p>}

    {head&&other&&<div className="head-to-head" id={uid+'-head'} ref={panel} tabIndex={-1} aria-label={`${other.name} versus ${main.name}`}>
      <div className="comparison-panel-title"><span>HEAD-TO-HEAD</span><button type="button" onClick={()=>{setOtherId(null);setEvidence(null);}} aria-label="Close head-to-head"><Glyph name="close"/></button></div>
      <h3>a different kind<br/>of right.</h3>
      <div className="comparison-product-head"><div><span>CURRENT PICK</span><b>{main.name}</b><strong>{money(main.price)}</strong></div><span className="comparison-versus">vs</span><div><span>CONTENDER</span><b>{other.name}</b><strong>{money(other.price)}</strong></div></div>
      {otherOption&&<div className="comparison-award-detail"><Badge badge={otherOption.badge}/><p>{otherOption.badge.basis}</p><ReviewChips ids={otherOption.badge.reviewIds} label={`${other.name} · badge evidence`}/></div>}
      <div className="comparison-dimensions">{head.dimensions.map(dimension=><section className="comparison-dimension" key={dimension.key}>
        <header><h4>{dimension.label}</h4>{dimension.key==='price'&&typeof dimension.delta==='number'&&<span className="dimension-delta">{dimension.delta===0?'same price':`${dimension.delta<0?'−':'+'}${money(Math.abs(dimension.delta))}`}</span>}</header>
        <div className="dimension-values"><div><p>{dimension.left}</p><ReviewChips ids={dimension.leftReviewIds} label={`${main.name} · ${dimension.label}`}/></div><div><p>{dimension.right}</p><ReviewChips ids={dimension.rightReviewIds} label={`${other.name} · ${dimension.label}`}/></div></div>
        <p className="dimension-note">{dimension.note}</p>
      </section>)}</div>
      <details className="comparison-memory" open><summary><Glyph name="head"/> Memory used for fit · {fitIds.length}</summary>{fitIds.length?fitIds.map(id=>{const line=profile.memoryLines.find(memory=>memory.id===id);return line?<div className="comparison-memory-line" key={id}><p>“{line.text}”</p><small>{line.source} · {Math.round(line.confidence*100)}% confidence</small></div>:null;}):<p>No matching active memory. Coopy has not invented a preference.</p>}</details>
      <details className="comparison-catalog-facts"><summary>Inspect the catalog facts <Glyph name="arrow-up"/></summary><div>{[main,other].map(sku=><section key={sku.id}><h4>{sku.name}</h4><dl><div><dt>price</dt><dd>{money(sku.price)}</dd></div><div><dt>delivery</dt><dd>{sku.delivery}</dd></div><div><dt>palette</dt><dd>{sku.palette.join(', ')}</dd></div><div><dt>vibe</dt><dd>{sku.vibeTags.join(', ')}</dd></div><div><dt>price band</dt><dd>{sku.priceBand}</dd></div>{Object.entries(sku.facts).filter(([key])=>key!=='comparisonGroup').map(([name,value])=><div key={name}><dt>{name.replace(/([A-Z])/g,' $1')}</dt><dd>{String(value)}</dd></div>)}</dl></section>)}</div></details>
      {error&&<p role="alert" className="comparison-error">{error}</p>}
      <button type="button" className="comparison-choose" disabled={disabled||working} onClick={()=>void choose()}>{working?'checking the trade-off…':'Make this my pick'}<Glyph name="swap"/></button>
      <p className="comparison-selection-note">Your choice teaches Coopy. Buying still needs your approval.</p>
      <div className="comparison-raw-links"><button type="button" onClick={()=>showEvidence(reviewsForSku(main.id).map(r=>r.id),`${main.name} · all reviews`)}>All reviews · current pick <Glyph name="arrow-right"/></button><button type="button" onClick={()=>showEvidence(reviewsForSku(other.id).map(r=>r.id),`${other.name} · all reviews`)}>All reviews · contender <Glyph name="arrow-right"/></button></div>
    </div>}
    {evidence&&<section className="comparison-evidence" ref={evidencePanel} tabIndex={-1} aria-label="Original comparison evidence"><div className="comparison-panel-title"><span>{evidence.title}</span><button type="button" aria-label="Close comparison evidence" onClick={()=>setEvidence(null)}><Glyph name="close"/></button></div><p className="comparison-evidence-note">Original seeded reviews. No relevance filter. No hidden negatives.</p><div className="comparison-review-scroll" tabIndex={0}>{evidence.ids.map(id=>{const review=getReview(id);return review?<article key={id}><header><b>{review.stars} / 5 <Glyph name="star"/></b><span>{review.id}</span></header><small>{getSku(review.skuId)?.name} · {review.date}</small><h4>{review.title}</h4><p>{review.text}</p><footer><span>{review.author} · Helpful {review.helpful}</span>{review.photo&&<span><Glyph name="image"/> Photo badge</span>}</footer></article>:null;})}</div></section>}
    {verdict?.clarifyingQuestion&&<p className="comparison-limit">These catalog comparisons do not answer the missing detail in Coopy’s question.</p>}
  </section>;
}
