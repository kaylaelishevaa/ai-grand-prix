'use client';

import {useEffect,useState} from 'react';
import type {SKU} from '@/lib/types';
import {Glyph} from './Glyph';

export function ProductVisual({sku,className=''}:{sku:SKU;className?:string}) {
  const [failed,setFailed]=useState(false);
  const photo=sku.origin==='coupang-reference'&&sku.image&&/^\/(?:verified-products|live-call\/products|home-reference\/products|scene-reference\/products)\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(sku.image)?sku.image:null;
  useEffect(()=>setFailed(false),[sku.id,sku.image]);
  return <div className={`product-art ${className}`}>{photo&&!failed?<img src={photo} alt={sku.name} onError={()=>setFailed(true)} style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<div role="img" aria-label={`Photo unavailable for ${sku.name}`} style={{width:'100%',height:'100%',minHeight:64,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:7,padding:10,color:'var(--muted, #607577)',background:'var(--paper, #f2f7f6)',textAlign:'center'}}><Glyph name="image"/><span style={{fontSize:11,lineHeight:1.35}}>Photo unavailable</span></div>}</div>;
}
export function ProductEvidence({sku}:{sku:SKU}) {
  return sku.origin==='coupang-reference'?<p className="product-evidence-note"><span>COUPANG REFERENCE · HISTORICAL PRICE</span><br/>Reviews, current stock and delivery have not been verified. {sku.sourceUrl&&<a href={sku.sourceUrl} target="_blank" rel="noopener noreferrer">Original listing <Glyph name="arrow-up"/></a>}</p>:<p className="product-evidence-note">SIMULATED CATALOG · SEEDED REVIEW EVIDENCE</p>;
}
