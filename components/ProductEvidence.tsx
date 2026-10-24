'use client';

import {useEffect,useState} from 'react';
import type {SKU} from '@/lib/types';
import {productArt} from './art';
import {Glyph} from './Glyph';

export function ProductVisual({sku,className=''}:{sku:SKU;className?:string}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[sku.id,sku.image]);
  return <div className={`product-art ${className}`}>{sku.image&&!failed?<img src={sku.image} alt={sku.name} onError={()=>setFailed(true)} style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<div style={{width:'100%',height:'100%'}} dangerouslySetInnerHTML={{__html:productArt(sku.type,sku.color)}}/>}</div>;
}
export function ProductEvidence({sku}:{sku:SKU}) {
  return sku.origin==='coupang-reference'?<p className="product-evidence-note"><span>COUPANG REFERENCE · HISTORICAL PRICE</span><br/>Reviews, current stock and delivery have not been verified. {sku.sourceUrl&&<a href={sku.sourceUrl} target="_blank" rel="noopener noreferrer">Original listing <Glyph name="arrow-up"/></a>}</p>:<p className="product-evidence-note">SIMULATED CATALOG · SEEDED REVIEW EVIDENCE</p>;
}
