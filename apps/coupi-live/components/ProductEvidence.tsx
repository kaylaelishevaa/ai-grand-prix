'use client';

import {useEffect,useState} from 'react';
import type {SKU} from '@/lib/types';
import {Glyph} from './Glyph';
import generatedAssets from '@/data/generated-product-assets.json';
import './product-evidence.css';

export function ProductVisual({sku,className=''}:{sku:SKU;className?:string}) {
  const [listingFailed,setListingFailed]=useState(false);
  const photo=sku.origin==='coupang-reference'&&sku.image&&/^\/(?:verified-products|live-call\/products|home-reference\/products|scene-reference\/products)\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(sku.image)?sku.image:null;
  useEffect(()=>setListingFailed(false),[sku.id,sku.image]);
  const fallbackId=(generatedAssets.skus as string[]).includes(sku.id),fallbackType=(generatedAssets.types as string[]).includes(sku.type);
  const fallback=fallbackId?`/generated-products/${sku.id}.webp`:fallbackType?`/generated-products/type-${sku.type}.webp`:null;
  const useListing=!!photo&&!listingFailed,src=useListing?photo:fallback;
  return <div className={`product-art ${className}`} data-image-source={useListing?'coupang-listing':'catalog-photo'}>{src?<img src={src} alt={sku.name} onError={()=>{if(useListing)setListingFailed(true);}} style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<span role="img" aria-label={sku.name} className="product-art-last-resort"><Glyph name="image"/></span>}</div>;
}
export function ProductEvidence({sku}:{sku:SKU}) {
  return sku.origin==='coupang-reference'?<p className="product-evidence-note"><span>COUPANG REFERENCE · HISTORICAL PRICE</span><br/>Reviews, current stock and delivery have not been verified. {sku.sourceUrl&&<a href={sku.sourceUrl} target="_blank" rel="noopener noreferrer">Original listing <Glyph name="arrow-up"/></a>}</p>:<p className="product-evidence-note">SIMULATED CATALOG · SEEDED REVIEW EVIDENCE</p>;
}
