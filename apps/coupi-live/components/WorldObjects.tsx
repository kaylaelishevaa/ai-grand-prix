'use client';

import type {SceneResult} from '@/lib/types';
import {getSku} from '@/lib/catalog';
import {ProductVisual} from './ProductEvidence';
import {Glyph} from './Glyph';

/** A quiet alternative to spatial hotspots, especially for touch and keyboard use. */
export default function WorldObjects({scene,onSelect}:{scene:SceneResult;onSelect:(skuId:string)=>void}) {
  const products=scene.items.flatMap(item=>{const sku=getSku(item.skuId);return sku?[sku]:[];});
  return <details className="world-objects" open><summary><span className="world-objects-symbol"><Glyph name="box"/></span><span><strong>Objects in this world</strong><small>{products.length} products · tap a photo to look closer</small></span><Glyph name="plus"/></summary><div className="world-object-strip">{products.map(sku=><button key={sku.id} type="button" aria-label={`View ${sku.name}`} onClick={()=>onSelect(sku.id)}><ProductVisual sku={sku}/><strong>{sku.name}</strong><span>₩{sku.price.toLocaleString('en-US')}</span></button>)}</div><p>{products.every(sku=>sku.origin==='coupang-reference')?'Original product photos · historical reference prices. Check the listing for current price and delivery.':'Reference or simulated prices. Open an object for its sources.'}</p></details>;
}
