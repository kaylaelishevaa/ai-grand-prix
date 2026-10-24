'use client';

import {useEffect,useMemo,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {getSku} from '@/lib/catalog';
import {resolveSceneKind} from '@/lib/scenes';
import {resolveSceneContext} from '@/lib/world-context';
import {getSceneMood} from '@/lib/scene-moods';
import type {SceneResult} from '@/lib/types';
import {Glyph} from './Glyph';
import type {DioramaController,DioramaPhase} from './diorama/engine';
import './scene-experience.css';

/** The objects belong to the landscape. Only small, accessible touchpoints sit above them. */
export default function SceneDiorama({scene,phase,onSelect,fallback}:{
  scene:SceneResult;phase:DioramaPhase;onSelect:(skuId:string,oneLiner:string)=>void;fallback:ReactNode;
}) {
  const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const engine=useRef<DioramaController|null>(null);
  const markers=useRef(new Map<string,HTMLButtonElement>());
  const [mode,setMode]=useState<'loading'|'ready'|'fallback'>('loading');
  const kind=resolveSceneKind(scene);
  const contextSignature=JSON.stringify(resolveSceneContext(scene));
  const context=useMemo(()=>resolveSceneContext(scene),[contextSignature]);
  const mood=getSceneMood(kind,context);
  const signature=JSON.stringify([scene.name,scene.explanation,scene.items,context]);
  const items=useMemo(()=>scene.items.flatMap(item=>{
    const sku=getSku(item.skuId);
    return sku?[{skuId:sku.id,type:sku.type,name:sku.name,color:sku.color}]:[];
  }),[signature]);
  const latest=useRef({items,phase,kind,context});latest.current={items,phase,kind,context};
  const applied=useRef({items,kind,context});

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
          onReady:()=>{if(!cancelled)setMode('ready');},onFailure:fail,
          onProjection:entries=>{
            for(const entry of entries){
              const marker=markers.current.get(entry.skuId);if(!marker)continue;
              marker.style.transform=`translate3d(${entry.x}px,${entry.y}px,0) translate(-50%,-50%)`;
              marker.style.opacity=String(entry.opacity);
              marker.style.visibility=entry.visible?'visible':'hidden';
              marker.style.pointerEvents=entry.visible&&entry.opacity>.8?'auto':'none';
              // Keep labels within the viewport, including dots close to an edge.
              marker.dataset.edge=entry.x<110?'left':entry.x>(host.current?.clientWidth||640)-110?'right':'center';
            }
          },
        });
        engine.current=instance;applied.current={items:latest.current.items,kind:latest.current.kind,context:latest.current.context};
        if(!instance){fail();return;}
        observer=new ResizeObserver(entries=>{const bounds=entries[0]?.contentRect;if(bounds)instance.resize(bounds.width,bounds.height);});
        observer.observe(host.current);
      }catch{fail();}
    }).catch(fail);
    return()=>{cancelled=true;observer?.disconnect();engine.current?.dispose();engine.current=null;};
  },[mode==='fallback']);

  useEffect(()=>{
    if(engine.current&&(applied.current.items!==items||applied.current.kind!==kind||applied.current.context!==context)){
      markers.current.forEach(element=>{element.style.opacity='0';element.style.pointerEvents='none';});
      engine.current.setItems(items,kind,context);applied.current={items,kind,context};
    }
  },[items,kind,context]);
  useEffect(()=>{engine.current?.setPhase(phase);},[phase]);

  if(mode==='fallback')return <>{fallback}</>;
  return <div ref={host} className="scene-diorama scenic-landscape" data-state={mode} data-phase={phase} data-kind={kind} data-setting={context.setting} style={{background:phase==='night'?'radial-gradient(ellipse at 25% 35%,#735165,#243c44 70%,#1d3037)':mood.background,'--scene-ink':phase==='night'?'#f5e7d8':mood.ink,'--scene-muted':mood.muted,'--scene-accent':mood.accent} as CSSProperties} role="group" aria-label={`${mood.label}. Explore the objects in this 3D scene using their glowing touchpoints.`}
    onPointerMove={event=>{if(event.pointerType==='touch')return;const bounds=event.currentTarget.getBoundingClientRect();engine.current?.setPointer((event.clientX-bounds.left)/bounds.width*2-1,(event.clientY-bounds.top)/bounds.height*2-1);}}
    onPointerLeave={()=>engine.current?.setPointer(0,0)}>
    <div className="scene-sky" aria-hidden="true"><span className="scene-celestial"/><span className="scene-cloud cloud-near"/><span className="scene-cloud cloud-far"/></div>
    <canvas ref={canvas} className="scene-diorama-canvas" aria-hidden="true"/>
    {mode==='loading'&&<div className="scene-diorama-loading">{fallback}</div>}
    {mode==='ready'&&<div className="scene-touchpoints" aria-label="Little things in this world">{items.map((item,index)=><button key={item.skuId} className="scene-touchpoint" type="button" style={{animationDelay:`${index*270}ms`}}
      ref={element=>{if(element)markers.current.set(item.skuId,element);else markers.current.delete(item.skuId);}}
      aria-label={`Open ${item.name}`} onClick={()=>onSelect(item.skuId,scene.items.find(i=>i.skuId===item.skuId)?.oneLiner||'')}>
      <span className="scene-dot"><Glyph name="plus"/></span><span className="scene-object-whisper">{item.name}<Glyph name="arrow-up"/></span>
    </button>)}</div>}
    <div className="scene-atmosphere-label" aria-hidden="true"><span>{mood.time}</span><span>{mood.weather}</span></div>
    <span className="diorama-world-mark" aria-hidden="true"><i/>{mood.subtitle}</span>
  </div>;
}
