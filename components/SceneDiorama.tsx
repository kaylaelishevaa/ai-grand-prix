'use client';

import {useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties} from 'react';
import {getSku} from '@/lib/catalog';
import type {SceneResult} from '@/lib/types';
import productImages from '@/data/product-images.json';
import {Glyph} from './Glyph';
import {productArt} from './art';
import type {DioramaController, DioramaItem, DioramaPhase} from './diorama/engine';

type ProductImage = {src:string; sourceUrl:string; alt:string};
const images:Record<string,ProductImage> = productImages;

function ProductFrame({item}:{item:DioramaItem}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[item.imageUrl]);
  return <span className="diorama-frame" style={{'--product-tint':item.color||'#E2D8BE'} as CSSProperties}>
    {item.imageUrl&&!failed
      ? <img src={item.imageUrl} alt={images[item.skuId]?.alt||item.name} draggable={false} onError={()=>setFailed(true)}/>
      : <span className="diorama-image-placeholder" aria-label={`${item.name}, illustrated placeholder`} dangerouslySetInnerHTML={{__html:productArt(item.type,item.color)}}/>}
    <span className="diorama-frame-label">{item.name}</span>
  </span>;
}

/** Accessible DOM billboards share the WebGL camera projection, avoiding cross-origin texture failures. */
export default function SceneDiorama({scene,phase,onSelect,fallback}:{
  scene:SceneResult; phase:DioramaPhase; onSelect:(skuId:string,oneLiner:string)=>void; fallback:ReactNode;
}) {
  const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const engine=useRef<DioramaController|null>(null);
  const cards=useRef(new Map<string,HTMLButtonElement>());
  const [mode,setMode]=useState<'loading'|'ready'|'fallback'>('loading');
  const items=useMemo(()=>scene.items.flatMap(item=>{
    const sku=getSku(item.skuId);
    return sku?[{skuId:sku.id,type:sku.type,name:sku.name,color:sku.color,imageUrl:images[sku.id]?.src}]:[];
  }),[scene]);
  const latest=useRef({items,phase}); latest.current={items,phase};
  const appliedItems=useRef(items);

  useEffect(()=>{
    if(mode==='fallback')return;
    let cancelled=false,observer:ResizeObserver|undefined;
    const fail=()=>{if(!cancelled)setMode('fallback');};
    import('./diorama/engine').then(({createDiorama})=>{
      if(cancelled||!canvas.current||!host.current)return;
      try {
        const instance=createDiorama(canvas.current,{
          ...latest.current,
          reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          onReady:()=>{if(!cancelled)setMode('ready');},
          onFailure:fail,
          onProjection:entries=>{
            for(const entry of entries){
              const element=cards.current.get(entry.skuId);
              if(!element)continue;
              element.style.transform=`translate3d(${entry.x}px,${entry.y}px,0) translate(-50%,-100%) scale(${entry.scale})`;
              element.style.opacity=String(entry.opacity);
              element.style.visibility=entry.visible?'visible':'hidden';
              element.style.pointerEvents=entry.visible&&entry.opacity>.8?'auto':'none';
            }
          },
        });
        engine.current=instance;
        appliedItems.current=latest.current.items;
        if(!instance){fail();return;}
        observer=new ResizeObserver(entries=>{
          const bounds=entries[0]?.contentRect;
          if(bounds)instance.resize(bounds.width,bounds.height);
        });
        observer.observe(host.current);
      }catch{fail();}
    }).catch(fail);
    return()=>{cancelled=true;observer?.disconnect();engine.current?.dispose();engine.current=null;};
    // The ready transition must not recreate the renderer.
  },[mode==='fallback']);

  useEffect(()=>{
    if(engine.current&&appliedItems.current!==items){
      cards.current.forEach(element=>{element.style.opacity='0';element.style.pointerEvents='none';});
      engine.current.setItems(items);appliedItems.current=items;
    }
  },[items]);
  useEffect(()=>{engine.current?.setPhase(phase);},[phase]);

  if(mode==='fallback')return <>{fallback}</>;
  return <div ref={host} className="scene-diorama" data-state={mode} data-phase={phase} role="group" aria-label="Your miniature room. Explore each 3D product using its glowing hotspot."
    onPointerMove={event=>{
      if(event.pointerType==='touch')return;
      const bounds=event.currentTarget.getBoundingClientRect();
      engine.current?.setPointer((event.clientX-bounds.left)/bounds.width*2-1,(event.clientY-bounds.top)/bounds.height*2-1);
    }} onPointerLeave={()=>engine.current?.setPointer(0,0)}>
    <canvas ref={canvas} className="scene-diorama-canvas" aria-hidden="true"/>
    {mode==='loading'&&<div className="scene-diorama-loading">{fallback}</div>}
    {mode==='ready'&&<div className="diorama-billboards" aria-label="Explore this little world">
      {items.map(item=><button key={item.skuId} className="diorama-billboard" type="button"
        ref={element=>{if(element)cards.current.set(item.skuId,element);else cards.current.delete(item.skuId);}}
        aria-label={`Explore ${item.name}`} onClick={()=>onSelect(item.skuId,scene.items.find(i=>i.skuId===item.skuId)?.oneLiner||'')}>
        <ProductFrame item={item}/><span className="diorama-card-stem"/>
        <span className="diorama-hotspot"><Glyph name="plus"/></span>
      </button>)}
    </div>}
    <span className="diorama-world-mark" aria-hidden="true"><i/> a little world, just for you</span>
  </div>;
}
