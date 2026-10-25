'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {eligibleCatalog} from '@/lib/profile';
import {getReview,getSku} from '@/lib/catalog';
import type {AskResponse,Profile,SKU,Verdict} from '@/lib/types';
import {Glyph} from './Glyph';
import {ProductEvidence,ProductVisual} from './ProductEvidence';
import './search-view.css';

export interface SearchViewProps {profile:Profile;onProfile:(profile:Profile)=>void;onOpenProduct:(id:string,verdict?:Verdict)=>void;offline?:boolean;}
type SearchRequest={question:string;requestId:string;clarification?:{question:string;answer:string};};
type SearchAnswer={response:AskResponse;question:string;profileId:string;revision:number;};
const normalize=(text:string)=>text.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const money=(amount:number)=>'₩'+amount.toLocaleString('en-US');
const discoveryOrder=['7434051500','9026994633','7612276799','1814412512','9474375760','6775922884','8561267958','6994027284'];
/** Only locally stored, sourced listing photos belong in the discovery surface. */
export function hasReferencePhoto(sku:SKU):boolean{return sku.origin==='coupang-reference'&&!!sku.image&&/^\/(?:verified-products|live-call\/products|home-reference\/products|scene-reference\/products)\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(sku.image);}
export function discoveryCatalog(profile:Profile):SKU[]{
 const available=eligibleCatalog(profile,'ask').filter(hasReferencePhoto),featured=discoveryOrder.map(id=>available.find(sku=>sku.id===id)).filter((sku):sku is SKU=>!!sku),seen=new Set(featured.map(sku=>sku.id));
 return [...featured,...available.filter(sku=>!seen.has(sku.id))];
}

/** Literal keyword search only. Eligibility is recalculated after every profile change. */
export function searchCatalog(profile:Profile,query:string):SKU[]{
 const terms=normalize(query).split(' ').filter(Boolean),available=eligibleCatalog(profile,'ask');
 if(!terms.length)return available;
 return available.map(sku=>{
  const name=normalize(sku.name),aliases=sku.aliases.map(normalize),text=normalize([sku.name,...sku.aliases,sku.category,sku.type,sku.description,...sku.vibeTags,...sku.palette].join(' '));
  if(!terms.every(term=>text.includes(term)))return null;
  const rank=terms.reduce((score,term)=>score+(name.includes(term)?4:aliases.some(alias=>alias.includes(term))?3:1),0);
  return{sku,rank};
 }).filter((item):item is {sku:SKU;rank:number}=>!!item).sort((a,b)=>Number(hasReferencePhoto(b.sku))-Number(hasReferencePhoto(a.sku))||b.rank-a.rank||a.sku.name.localeCompare(b.sku.name)).map(item=>item.sku);
}

/** The server validates facts; the client also rejects foreign/stale profiles and unknown evidence. */
export function validateSearchAnswer(value:unknown,current:Profile):AskResponse{
 const response=value as AskResponse;
 if(!response||!response.profile||response.profile.id!==current.id||!Number.isSafeInteger(response.profile.revision)||response.profile.revision<current.revision)throw new Error('Your profile changed. Ask again with your current preferences.');
 if(response.status==='verdict'||response.status==='clarify'){
  const v=response.verdict,allowed=new Set(eligibleCatalog(response.profile,'ask').map(sku=>sku.id));
  if(!v||!Array.isArray(v.citations)||typeof v.reason!=='string'||typeof v.dissent!=='string')throw new Error('That answer could not be checked. Try again, or browse the catalog below.');
  if(response.status==='clarify'){
   if(!v.clarifyingQuestion||typeof v.clarifyingQuestion!=='string'||v.pickSkuId!==null||v.runnerUpSkuId!==null||v.citations.length)throw new Error('That question could not be checked. Please try again.');
  }else if(!v.pickSkuId||!allowed.has(v.pickSkuId)||v.clarifyingQuestion||v.runnerUpSkuId&&!allowed.has(v.runnerUpSkuId)||v.citations.some(id=>{const review=getReview(id);return!review||![v.pickSkuId,v.runnerUpSkuId].includes(review.skuId);})){throw new Error('That recommendation could not be checked. Browse the catalog or try again.');}
 }else if(response.status==='fallback'){
  if(!Array.isArray(response.catalog)||typeof response.message!=='string')throw new Error('The catalog response was incomplete. Please try again.');
 }else if(response.status==='blocked'){
  if(typeof response.message!=='string')throw new Error('That response was incomplete. Please try again.');
 }else throw new Error('That response could not be checked. Please try again.');
 return response;
}

export default function SearchView({profile,onProfile,onOpenProduct,offline=false}:SearchViewProps){
 const [query,setQuery]=useState(''),[answer,setAnswer]=useState(''),[result,setResult]=useState<SearchAnswer|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[limit,setLimit]=useState(8),[showAll,setShowAll]=useState(false);
 const current=useRef({profile,onProfile,onOpenProduct}),flight=useRef<AbortController|null>(null),epoch=useRef(0),receipt=useRef<{fingerprint:string;id:string}|null>(null),lastRequest=useRef<Omit<SearchRequest,'requestId'>|null>(null);
 if(current.current.profile.id!==profile.id||profile.revision>=current.current.profile.revision)current.current.profile=profile;
 current.current.onProfile=onProfile;current.current.onOpenProduct=onOpenProduct;
 useEffect(()=>{epoch.current++;setQuery('');setAnswer('');setResult(null);setError('');setBusy(false);setLimit(8);setShowAll(false);receipt.current=null;lastRequest.current=null;return()=>{epoch.current++;flight.current?.abort();flight.current=null;};},[profile.id]);
 const active=result?.profileId===profile.id&&result.revision===profile.revision?result:null;
 const response=active?.response,verdict=response?.status==='verdict'?response.verdict:null;
 const eligible=eligibleCatalog(profile,'ask'),allowed=new Set(eligible.map(sku=>sku.id));
 const discovery=discoveryCatalog(profile),discoveryIds=new Set(discovery.map(sku=>sku.id));
 const stillLife=['9026994633','7434051500','7612276799'].map(id=>discovery.find(sku=>sku.id===id)).filter((sku):sku is SKU=>!!sku);
 const invitations=[{id:'7434051500',query:'mugs',title:'Slow mornings',note:'a cup, a little pause',tone:'peach'},{id:'9474375760',query:'tshirt',title:'Out the door',note:'find your everyday fit',tone:'blue'},{id:'1814412512',query:'lipstick',title:'A little color',note:'a shade for your day',tone:'rose'}].map(item=>({...item,sku:discovery.find(sku=>sku.id===item.id)})).filter(item=>!!item.sku);
 const pick=verdict?.pickSkuId&&allowed.has(verdict.pickSkuId)?getSku(verdict.pickSkuId):undefined;
 const fallbackIds=response?.status==='fallback'?new Set(response.catalog.map(sku=>sku.id)):null;
 const allBySource=[...discovery,...eligible.filter(sku=>!discoveryIds.has(sku.id))];
 const matches=showAll?allBySource.filter(sku=>!fallbackIds||fallbackIds.has(sku.id)):query.trim()?searchCatalog(profile,query):discovery;
 function changeQuery(value:string){setQuery(value);setResult(null);setAnswer('');setError('');setShowAll(false);setLimit(8);receipt.current=null;lastRequest.current=null;}
 function localSearch(event:FormEvent){event.preventDefault();setResult(null);setAnswer('');setError('');setShowAll(false);setLimit(8);}
 function cancel(){epoch.current++;flight.current?.abort();flight.current=null;setBusy(false);}
 async function ask(input:Omit<SearchRequest,'requestId'>={question:query.trim()}){
  if(flight.current||!input.question.trim())return;
  const controller=new AbortController(),generation=epoch.current,profileId=current.current.profile.id;
  const fingerprint=JSON.stringify([profileId,input]);if(receipt.current?.fingerprint!==fingerprint)receipt.current={fingerprint,id:crypto.randomUUID()};
  const body={...input,question:input.question.trim(),requestId:receipt.current.id};lastRequest.current=input;flight.current=controller;setBusy(true);setError('');
  try{
   const res=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
   const data=await res.json();
   if(controller.signal.aborted||generation!==epoch.current||current.current.profile.id!==profileId)return;
   if(!res.ok)throw new Error(data.error||'Coopy couldn’t finish that search. Try again.');
   const checked=validateSearchAnswer(data,current.current.profile);
   current.current.profile=checked.profile;current.current.onProfile(checked.profile);
   setResult({response:checked,question:body.question,profileId,revision:checked.profile.revision});setAnswer('');setShowAll(checked.status==='fallback');setLimit(8);receipt.current=null;
  }catch(cause){if(!controller.signal.aborted&&generation===epoch.current)setError(cause instanceof Error?cause.message:'That didn’t connect. Your search is still here.');}
  finally{if(flight.current===controller)flight.current=null;if(generation===epoch.current)setBusy(false);}
 }
 function open(skuId:string,v?:Verdict){if(eligibleCatalog(current.current.profile,'ask').some(sku=>sku.id===skuId))current.current.onOpenProduct(skuId,v);}
 return <section className="search-view" data-searching={Boolean(query||result)} aria-label="Search with Coopy">
  <header className="search-heading search-discovery-hero">
   <svg className="search-landscape-lines" viewBox="0 0 440 300" preserveAspectRatio="none" aria-hidden="true"><path d="M-30 230C74 169 112 308 244 247S412 199 470 230"/><path d="M-30 245C74 184 112 323 244 262S412 214 470 245"/><path d="M315-60C223 39 435 104 427 211"/></svg>
   <div className="search-hero-copy"><span className="search-eyebrow"><i/> DISCOVER WITH COOPY</span><h1>a little<br/><em>more you.</em></h1><p>A softer morning.<br/>A brighter way out the door.</p></div>
   <div className="search-still-life" aria-label="Sourced Coupang product photographs"><span className="search-still-halo" aria-hidden="true"/>{stillLife.map((sku,index)=><button type="button" key={sku.id} className={`search-still-object search-photo-${index+1}`} onClick={()=>open(sku.id)} aria-label={`Explore ${sku.name}`}><ProductVisual sku={sku}/><span className="search-object-dot" aria-hidden="true"><Glyph name="plus"/></span></button>)}</div>
   <div className="search-companion-note"><img src="/main-shell/coupi.png" alt=""/><span>Tell me the little thing<br/>you have in mind.</span><Glyph name="spark"/></div>
  </header>
  <form className="search-form" onSubmit={localSearch} role="search">
   <label htmlFor="coopy-search">What would make today a little better?</label><div className="search-input"><Glyph name="search"/><input id="coopy-search" aria-label="Search products or ask a question" type="search" value={query} maxLength={2000} disabled={busy} onChange={event=>changeQuery(event.target.value)} placeholder="Red socks, a softer morning…" autoComplete="off" enterKeyHint="search"/>{query&&<button type="button" disabled={busy} onClick={()=>changeQuery('')} aria-label="Clear search"><Glyph name="close"/></button>}</div>
   <div className="search-actions"><button className="search-local" type="submit" disabled={busy||!query.trim()}>Search products</button><button className="search-ask" type="button" disabled={busy||!query.trim()} onClick={()=>void ask()}><Glyph name="spark"/>{busy?'Checking…':'Ask Coopy'}</button></div>
   <p className="search-form-note">{offline?'Offline rehearsal · keyword search is local. Coopy uses cached answers only.':'Search matches catalog words. Coopy checks the evidence and your preferences.'}</p>
  </form>
  {!query&&!result&&invitations.length>0&&<section className="search-invitations" aria-label="Try a product search"><div className="search-invitations-heading"><h2>Start with a feeling.</h2><span>SOURCED PRODUCT PHOTOS</span></div><div className="search-invitation-rail">{invitations.map(item=><button type="button" key={item.id} className="search-invitation" data-tone={item.tone} onClick={()=>changeQuery(item.query)}><span className="search-invitation-image"><ProductVisual sku={item.sku!}/><Glyph name="arrow-up"/></span><strong>{item.title}</strong><small>{item.note}</small></button>)}</div></section>}
  {busy&&<div className="search-pending" role="status"><span className="search-working"><i/><i/><i/></span><p>Checking the catalog and the evidence.<small>Nothing is added or bought.</small></p><button type="button" onClick={cancel}>Cancel</button></div>}
  {error&&<div className="search-error" role="alert"><p>{error}</p>{lastRequest.current&&<button type="button" disabled={busy} onClick={()=>void ask(lastRequest.current!)}>Try again <Glyph name="refresh"/></button>}</div>}
  {result&&!active&&!busy&&<p className="search-change-note">Your preferences changed. Ask again for an updated recommendation.</p>}
  {response?.status==='clarify'&&<form className="search-clarification" onSubmit={event=>{event.preventDefault();if(answer.trim())void ask({question:active!.question,clarification:{question:response.verdict.clarifyingQuestion!,answer:answer.trim()}});}}><span className="search-eyebrow">ONE LITTLE QUESTION</span><h2>{response.verdict.clarifyingQuestion}</h2><label htmlFor="coopy-search-answer">A little more context</label><input id="coopy-search-answer" value={answer} maxLength={2000} disabled={busy} onChange={event=>setAnswer(event.target.value)} placeholder="Tell me what matters…"/><button className="search-ask" disabled={busy||!answer.trim()} type="submit">Find my pick <Glyph name="arrow-right"/></button></form>}
  {response?.status==='blocked'&&<section className="search-blocked"><Glyph name="check"/><div><span className="search-eyebrow">ALREADY IN YOUR WORLD</span><h2>{response.message}</h2><p>One is enough. Nothing added.</p></div></section>}
  {response?.status==='fallback'&&<section className="search-fallback"><h2>I’m not sure yet.</h2><p>{response.message}</p><p>The available catalog is below. Open any product to see its evidence.</p></section>}
  {pick&&verdict&&<article className="search-verdict"><div className="search-verdict-top"><ProductVisual sku={pick}/><div><span className="search-eyebrow">COOPY’S PICK</span><h2>{pick.name}</h2><strong>{money(pick.price)}</strong><small>{pick.priceBasis==='historical-reference'?'Historical reference price':'Simulated catalog price'}</small></div></div><p className="search-reason">{verdict.reason}</p><p className="search-dissent">{verdict.dissent}</p><div className="search-citations">{verdict.citations.map((id,index)=>{const review=getReview(id);return review?<details key={id}><summary>Review {index+1} · {review.stars}<Glyph name="star"/></summary><div><strong>{review.title}</strong><p>{review.text}</p><small>{review.author} · {review.date} · {review.helpful} helpful{review.photo?' · photo':''}</small></div></details>:null;})}</div><ProductEvidence sku={pick}/><button type="button" className="search-open-pick" onClick={()=>open(pick.id,verdict)}>Why this one & next steps <Glyph name="arrow-right"/></button><span className="search-response-note">{response&&(response.status==='verdict'||response.status==='clarify')?(response.meta.offline?'Cached rehearsal':response.meta.cached?'From cache':'Live recommendation'):''} · your approval comes last</span></article>}
  <section className="search-results" aria-label="Available catalog products"><header><div><h2>{showAll?'Available products':query.trim()?'Keyword matches':'A few things to meet.'}</h2><p role="status">{!query.trim()&&!showAll?'Sourced listings · reference prices':`${matches.length} ${matches.length===1?'product':'products'}${query.trim()&&!showAll?' matching your words':''}`}</p></div>{query.trim()&&!showAll&&<button type="button" onClick={()=>{setShowAll(true);setLimit(8);}}>See all</button>}</header>
   {!matches.length?<div className="search-empty"><Glyph name="search"/><h3>{query.trim()?'No exact keyword matches.':'No new photo finds, for now.'}</h3><p>{query.trim()?'Try a product name, or ask Coopy to understand what you need.':'Your owned items and private categories are still respected. You can search or explore the labeled demo catalog.'}</p><button type="button" onClick={()=>{setShowAll(true);setLimit(8);}}>Browse available products <Glyph name="arrow-right"/></button></div>:<ul>{matches.slice(0,limit).map(sku=><li key={sku.id}><button type="button" className="search-product" onClick={()=>open(sku.id)}><ProductVisual sku={sku}/><span className="search-product-copy"><strong>{sku.name}</strong><span>{money(sku.price)}</span><small>{sku.origin==='coupang-reference'?'Coupang reference · historical price':'Simulated catalog'} · {sku.delivery}</small></span><Glyph name="arrow-right"/></button></li>)}</ul>}
   {matches.length>limit&&<button type="button" className="search-more" onClick={()=>setLimit(value=>value+8)}>Show {Math.min(8,matches.length-limit)} more <span>{limit} of {matches.length}</span><Glyph name="plus"/></button>}
   {!query.trim()&&!showAll&&<button type="button" className="search-include-demo" onClick={()=>{setShowAll(true);setLimit(8);}}>Include the simulated catalog <Glyph name="arrow-right"/></button>}
   <p className="search-catalog-note">{!query.trim()&&!showAll?'Original listing photos. Prices are historical references; stock and delivery are unverified. Keyword search also includes clearly labeled demo products.':'Sourced listings and simulated products are labeled separately. Prices and delivery are not live quotes.'} Owned items and private categories stay out.</p>
  </section>
 </section>;
}
