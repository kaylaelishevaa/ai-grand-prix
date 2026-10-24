'use client';

import {useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties} from 'react';
import {getSku} from '@/lib/catalog';
import {resolveSceneKind, SCENE_LABELS} from '@/lib/scenes';
import type {SceneResult} from '@/lib/types';
import productImages from '@/data/product-images.json';
import {Glyph} from './Glyph';
import {productArt} from './art';
import type {DioramaController, DioramaItem, DioramaPhase} from './diorama/engine';
import {layoutBillboards} from './diorama/math';

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
  const markers=useRef(new Map<string,HTMLButtonElement>());
  const leaders=useRef(new Map<string,HTMLSpanElement>());
  const metrics=useRef(new Map<string,{width:number;height:number}>());
  const viewport=useRef({width:640,height:480});
  const [mode,setMode]=useState<'loading'|'ready'|'fallback'>('loading');
  const kind=resolveSceneKind(scene);
  const items=useMemo(()=>scene.items.flatMap(item=>{
    const sku=getSku(item.skuId);
    return sku?[{skuId:sku.id,type:sku.type,name:sku.name,color:sku.color,imageUrl:images[sku.id]?.src}]:[];
  }),[scene]);
  const latest=useRef({items,phase,kind}); latest.current={items,phase,kind};
  const appliedItems=useRef(items);
  const appliedKind=useRef(kind);

  useEffect(()=>{
    if(mode==='fallback')return;
    let cancelled=false,observer:ResizeObserver|undefined;
    const fail=()=>{if(!cancelled)setMode('fallback');};
    import('./diorama/engine').then(({createDiorama})=>{
      if(cancelled||!canvas.current||!host.current)return;
      try {
        viewport.current={width:host.current.clientWidth,height:host.current.clientHeight};
        const instance=createDiorama(canvas.current,{
          ...latest.current,
          reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          onReady:()=>{if(!cancelled)setMode('ready');},
          onFailure:fail,
          onProjection:entries=>{
            const layouts=layoutBillboards(entries.flatMap(entry=>{
              const element=cards.current.get(entry.skuId);
              if(!element||!entry.visible)return [];
              let bounds=metrics.current.get(entry.skuId);
              if(!bounds){bounds={width:element.offsetWidth,height:element.offsetHeight};metrics.current.set(entry.skuId,bounds);}
              return [{skuId:entry.skuId,x:entry.x,y:entry.y,scale:entry.scale,width:bounds.width*entry.scale,height:bounds.height*entry.scale}];
            }),viewport.current.width,viewport.current.height);
            for(const entry of entries){
              const element=cards.current.get(entry.skuId);
              const marker=markers.current.get(entry.skuId),leader=leaders.current.get(entry.skuId);
              const layout=layouts.find(item=>item.skuId===entry.skuId);
              if(!element||!marker||!leader)continue;
              if(layout){
                element.style.transform=`translate3d(${layout.left}px,${layout.top}px,0) scale(${entry.scale})`;
                const dx=layout.leaderX-entry.x,dy=layout.leaderY-entry.y;
                leader.style.transform=`translate3d(${entry.x}px,${entry.y}px,0) rotate(${Math.atan2(dy,dx)}rad) scaleX(${Math.hypot(dx,dy)})`;
              }
              marker.style.transform=`translate3d(${entry.x}px,${entry.y}px,0) translate(-50%,-50%) scale(${entry.scale})`;
              element.style.opacity=String(entry.opacity);
              marker.style.opacity=String(entry.opacity);
              leader.style.opacity=String(entry.opacity*.5);
              element.style.visibility=entry.visible?'visible':'hidden';
              marker.style.visibility=entry.visible?'visible':'hidden';
              leader.style.visibility=entry.visible?'visible':'hidden';
              element.style.pointerEvents=entry.visible&&entry.opacity>.8?'auto':'none';
              marker.style.pointerEvents=entry.visible&&entry.opacity>.8?'auto':'none';
            }
          },
        });
        engine.current=instance;
        appliedItems.current=latest.current.items;
        appliedKind.current=latest.current.kind;
        if(!instance){fail();return;}
        observer=new ResizeObserver(entries=>{
          const bounds=entries[0]?.contentRect;
          if(bounds){viewport.current={width:bounds.width,height:bounds.height};metrics.current.clear();instance.resize(bounds.width,bounds.height);}
        });
        observer.observe(host.current);
      }catch{fail();}
    }).catch(fail);
    return()=>{cancelled=true;observer?.disconnect();engine.current?.dispose();engine.current=null;};
    // The ready transition must not recreate the renderer.
  },[mode==='fallback']);

  useEffect(()=>{
    if(engine.current&&(appliedItems.current!==items||appliedKind.current!==kind)){
      cards.current.forEach(element=>{element.style.opacity='0';element.style.pointerEvents='none';});
      markers.current.forEach(element=>{element.style.opacity='0';element.style.pointerEvents='none';});
      leaders.current.forEach(element=>{element.style.opacity='0';});
      metrics.current.clear();
      engine.current.setItems(items,kind);appliedItems.current=items;appliedKind.current=kind;
    }
  },[items,kind]);
  useEffect(()=>{engine.current?.setPhase(phase);},[phase]);

  if(mode==='fallback')return <>{fallback}</>;
  return <div ref={host} className="scene-diorama" data-state={mode} data-phase={phase} data-kind={kind} role="group" aria-label={`Your ${kind==='dressing'?'closet and vanity':kind==='reading'?'reading nook':kind==='desk'?'workspace':'kitchen'} diorama. Explore each 3D product using its glowing hotspot.`}
    onPointerMove={event=>{
      if(event.pointerType==='touch')return;
      const bounds=event.currentTarget.getBoundingClientRect();
      engine.current?.setPointer((event.clientX-bounds.left)/bounds.width*2-1,(event.clientY-bounds.top)/bounds.height*2-1);
    }} onPointerLeave={()=>engine.current?.setPointer(0,0)}>
    <canvas ref={canvas} className="scene-diorama-canvas" aria-hidden="true"/>
    {mode==='loading'&&<div className="scene-diorama-loading">{fallback}</div>}
    {mode==='ready'&&<div className="diorama-billboards" aria-label="Explore this little world">
      {items.map(item=><span key={item.skuId} className="diorama-product-label">
        <span className="diorama-leader" aria-hidden="true" ref={element=>{if(element)leaders.current.set(item.skuId,element);else leaders.current.delete(item.skuId);}}/>
        <button className="diorama-billboard" type="button"
        ref={element=>{if(element)cards.current.set(item.skuId,element);else cards.current.delete(item.skuId);}}
        aria-label={`Explore ${item.name}`} onClick={()=>onSelect(item.skuId,scene.items.find(i=>i.skuId===item.skuId)?.oneLiner||'')}>
          <ProductFrame item={item}/>
        </button>
        <button className="diorama-anchor" type="button" aria-label={`Open ${item.name}`}
          ref={element=>{if(element)markers.current.set(item.skuId,element);else markers.current.delete(item.skuId);}}
          onClick={()=>onSelect(item.skuId,scene.items.find(i=>i.skuId===item.skuId)?.oneLiner||'')}>
          <span className="diorama-hotspot"><Glyph name="plus"/></span>
        </button>
      </span>)}
    </div>}
    <span className="diorama-world-mark" aria-hidden="true"><i/> {SCENE_LABELS[kind]}</span>
  </div>;
}
