'use client';
import {getSku} from '@/lib/catalog';
import {resolveSceneKind} from '@/lib/scenes';
import type {SceneResult} from '@/lib/types';
import {productArt} from './art';
import {Glyph} from './Glyph';
import './scene-fallback.css';

/** Each room keeps its context and every product action when WebGL is unavailable. */
export default function SceneFallback({scene,onSelect}:{scene:SceneResult;onSelect:(id:string)=>void}) {
  const kind=resolveSceneKind(scene);
  return <div className={`scene-room fallback-room room-${kind}`} data-kind={kind}>
    <div className="room-window"><i/><i/><i/><i/></div><div className="room-light"/>
    {kind==='kitchen'?<><div className="room-shelf"/><div className="room-counter"/><div className="room-vase"/></>:kind==='dressing'?<><div className="fallback-closet"><span/><i/><i/><i/></div><div className="fallback-mirror"/><div className="fallback-vanity"/><div className="fallback-bench"/><div className="fallback-rug"/></>:kind==='reading'?<><div className="fallback-bookcase">{Array.from({length:8},(_,i)=><i key={i}/>)}</div><div className="fallback-armchair"/><div className="fallback-side-table"/><div className="fallback-rug"/></>:<><div className="fallback-pegboard"/><div className="fallback-desk"/><div className="fallback-chair"/><div className="fallback-desk-shelf"/></>}
    {scene.items.map((item,index)=>{const sku=getSku(item.skuId);return sku?<button className={`scene-object object-${index} fallback-product type-${sku.type}`} key={sku.id} onClick={()=>onSelect(sku.id)} aria-label={`Explore ${sku.name}`}><div className="product-art" dangerouslySetInnerHTML={{__html:productArt(sku.type,sku.color)}}/><span className="hotspot"><Glyph name="plus"/></span><span className="object-label">{sku.name}</span></button>:null;})}
  </div>;
}
