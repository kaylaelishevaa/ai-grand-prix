'use client';

import {useEffect,useMemo,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {getSku} from '@/lib/catalog';
import {resolveSceneKind} from '@/lib/scenes';
import {resolveSceneContext} from '@/lib/world-context';
import {getSceneMood} from '@/lib/scene-moods';
import type {SceneResult} from '@/lib/types';
import {Glyph} from './Glyph';
import type {DioramaController,DioramaPhase} from './diorama/engine';
import {separateTouchpoints,type SceneTouchpoint} from './diorama/touchpoints';
import './scene-experience.css';

/** The objects belong to the landscape. Only small, accessible touchpoints sit above them. */
export default function SceneDiorama({scene,phase,onSelect,fallback}:{
  scene:SceneResult;phase:DioramaPhase;onSelect:(skuId:string,oneLiner:string)=>void;fallback:ReactNode;
}) {
  const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const engine=useRef<DioramaController|null>(null);
  const markers=useRef(new Map<string,HTMLButtonElement>());
  const leaders=useRef(new Map<string,SVGLineElement>());
  const displayed=useRef(new Map<string,SceneTouchpoint>());
  const interaction=useRef({hover:'',focus:'',pressed:''});
  const dimensions=useRef('');
  const [mode,setMode]=useState<'loading'|'ready'|'fallback'>('loading');
  const kind=resolveSceneKind(scene);
  const contextSignature=JSON.stringify(resolveSceneContext(scene));
  const context=useMemo(()=>resolveSceneContext(scene),[contextSignature]);
  const mood=getSceneMood(kind,context);
  const blueprintSignature=JSON.stringify(scene.blueprint||null);
  const blueprint=useMemo(()=>scene.blueprint,[blueprintSignature]);
  const signature=JSON.stringify([scene.name,scene.explanation,scene.items,context,blueprintSignature]);
  const items=useMemo(()=>scene.items.flatMap(item=>{
    const sku=getSku(item.skuId);
    return sku?[{skuId:sku.id,type:sku.type,name:sku.name,color:sku.color}]:[];
  }),[signature]);
  const latest=useRef({items,phase,kind,context,blueprint});latest.current={items,phase,kind,context,blueprint};
  const applied=useRef({items,kind,context,blueprint});

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
            const width=host.current?.clientWidth||390,height=host.current?.clientHeight||520;
            const size=`${width}:${height}`,locked=Object.values(interaction.current).some(Boolean);
            if(!locked||dimensions.current!==size){
              displayed.current=new Map(separateTouchpoints(entries.filter(entry=>entry.visible),width,height).map(point=>[point.skuId,point]));
              dimensions.current=size;
            }
            for(const entry of entries){
              const marker=markers.current.get(entry.skuId);if(!marker)continue;
              const point=displayed.current.get(entry.skuId)||entry;
              marker.style.transform=`translate3d(${point.x}px,${point.y}px,0) translate(-50%,-50%)`;
              marker.style.opacity=String(entry.opacity);
              marker.style.visibility=entry.visible?'visible':'hidden';
              marker.style.pointerEvents=entry.visible&&entry.opacity>.8?'auto':'none';
              const leader=leaders.current.get(entry.skuId);
              if(leader){leader.setAttribute('x1',String(entry.x));leader.setAttribute('y1',String(entry.y));leader.setAttribute('x2',String(point.x));leader.setAttribute('y2',String(point.y));leader.style.opacity=entry.visible&&Math.hypot(entry.x-point.x,entry.y-point.y)>9?String(entry.opacity*.45):'0';}
              // Keep labels within the viewport, including dots close to an edge.
              marker.dataset.edge=point.x<110?'left':point.x>width-110?'right':'center';
            }
          },
        });
        engine.current=instance;applied.current={items:latest.current.items,kind:latest.current.kind,context:latest.current.context,blueprint:latest.current.blueprint};
        if(!instance){fail();return;}
        observer=new ResizeObserver(entries=>{const bounds=entries[0]?.contentRect;if(bounds)instance.resize(bounds.width,bounds.height);});
        observer.observe(host.current);
      }catch{fail();}
    }).catch(fail);
    return()=>{cancelled=true;observer?.disconnect();engine.current?.dispose();engine.current=null;};
  },[mode==='fallback']);

  useEffect(()=>{
    if(engine.current&&(applied.current.items!==items||applied.current.kind!==kind||applied.current.context!==context||applied.current.blueprint!==blueprint)){
      markers.current.forEach(element=>{element.style.opacity='0';element.style.pointerEvents='none';});
      displayed.current.clear();interaction.current={hover:'',focus:'',pressed:''};
      engine.current.setItems(items,kind,context,blueprint);applied.current={items,kind,context,blueprint};
    }
  },[items,kind,context,blueprint]);
  useEffect(()=>{engine.current?.setPhase(phase);},[phase]);

  if(mode==='fallback')return <>{fallback}</>;
  const atmosphere=blueprint?.atmosphere;
  const light=atmosphere?parseInt(atmosphere.skyTop.slice(1,3),16)*.2126+parseInt(atmosphere.skyTop.slice(3,5),16)*.7152+parseInt(atmosphere.skyTop.slice(5,7),16)*.0722:255;
  const ink=atmosphere?(light>148?'#16424A':'#FFF8F0'):phase==='night'?'#f5e7d8':mood.ink;
  return <div ref={host} className="scene-diorama scenic-landscape" data-state={mode} data-phase={phase} data-kind={kind} data-setting={context.setting} data-generated={!!blueprint} style={{background:atmosphere?`linear-gradient(165deg,${atmosphere.skyTop},${atmosphere.skyBottom})`:phase==='night'?'radial-gradient(ellipse at 25% 35%,#735165,#243c44 70%,#1d3037)':mood.background,'--scene-ink':ink,'--scene-muted':mood.muted,'--scene-accent':blueprint?.palette.accent||mood.accent,'--scene-glow':atmosphere?.lightColor||mood.accent} as CSSProperties} role="group" aria-label={`${scene.name}. Explore the objects in this 3D scene using their glowing touchpoints.`}
    onPointerMove={event=>{if(event.pointerType==='touch'||Object.values(interaction.current).some(Boolean))return;const bounds=event.currentTarget.getBoundingClientRect();engine.current?.setPointer((event.clientX-bounds.left)/bounds.width*2-1,(event.clientY-bounds.top)/bounds.height*2-1);}}
    onPointerLeave={()=>engine.current?.setPointer(0,0)}>
    <div className="scene-sky" aria-hidden="true"><span className="scene-celestial"/><span className="scene-cloud cloud-near"/><span className="scene-cloud cloud-far"/></div>
    <canvas ref={canvas} className="scene-diorama-canvas" aria-hidden="true"/>
    {mode==='loading'&&<div className="scene-diorama-loading">{fallback}</div>}
    {mode==='ready'&&<div className="scene-touchpoints" aria-label="Little things in this world"><svg className="scene-touchpoint-leaders" aria-hidden="true">{items.map(item=><line key={item.skuId} ref={element=>{if(element)leaders.current.set(item.skuId,element);else leaders.current.delete(item.skuId);}}/>)}</svg>{items.map((item,index)=><button key={item.skuId} className="scene-touchpoint" type="button" style={{animationDelay:`${index*270}ms`}}
      ref={element=>{if(element)markers.current.set(item.skuId,element);else markers.current.delete(item.skuId);}}
      onPointerEnter={event=>{if(event.pointerType!=='touch')interaction.current.hover=item.skuId;}}
      onPointerLeave={()=>{interaction.current.hover='';interaction.current.pressed='';}}
      onPointerDown={()=>{interaction.current.pressed=item.skuId;}}
      onPointerUp={()=>{interaction.current.pressed='';}}
      onPointerCancel={()=>{interaction.current.pressed='';}}
      onFocus={()=>{interaction.current.focus=item.skuId;}}
      onBlur={()=>{interaction.current.focus='';}}
      aria-label={`Open ${item.name}`} onClick={()=>onSelect(item.skuId,scene.items.find(i=>i.skuId===item.skuId)?.oneLiner||'')}>
      <span className="scene-dot"><Glyph name="plus"/></span><span className="scene-object-whisper">{item.name}<Glyph name="arrow-up"/></span>
    </button>)}</div>}
    <div className="scene-atmosphere-label" aria-hidden="true"><span>{atmosphere?.timeLabel||mood.time}</span><span>{atmosphere?.weatherLabel||mood.weather}</span></div>
    <span className="diorama-world-mark" aria-hidden="true"><i/>{blueprint?'imagined from your words':mood.subtitle}</span>
  </div>;
}
