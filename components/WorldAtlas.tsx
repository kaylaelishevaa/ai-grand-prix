'use client';

import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Glyph} from './Glyph';
import {resolveSceneKind} from '@/lib/scenes';
import {getSceneMood} from '@/lib/scene-moods';
import {resolveSceneContext} from '@/lib/world-context';
import {validatedBlueprintForScene} from '@/lib/blueprint-projection';
import {GeneratedBlueprintSVG} from './SceneFallback';
import WorldVignette from './WorldVignette';
import {atlasLayout} from './diorama/atlas-layout';
import type {AtlasController,AtlasPlace,AtlasProjection} from './diorama/atlas-engine';
import './world-atlas.css';

export type WorldPlace=AtlasPlace&{subtitle:string;moments?:number};

function IllustratedAtlas({places,compact}:{places:WorldPlace[];compact:boolean}) {
  const positions=atlasLayout(places.length,compact);
  const width=compact?400:1200,height=compact?336:650,scale=compact?(places.length<=2?.72:places.length<=4?.5:.4):places.length<=4?1.12:.93;
  const path=positions.map((p,i)=>`${i?'L':'M'}${p.fallbackX/100*width} ${p.fallbackY/100*height-18}`).join(' ');
  return <svg className="atlas-illustration" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <path d={path} fill="none" stroke="#c5ad8c" strokeWidth="3" strokeDasharray="2 13" strokeLinecap="round"/>
    {places.map((place,index)=>{const kind=resolveSceneKind(place.scene),mood=getSceneMood(kind,resolveSceneContext(place.scene)),point=positions[index],blueprint=validatedBlueprintForScene(place.scene);if(blueprint)return <g key={place.id} transform={`translate(${point.fallbackX/100*width} ${point.fallbackY/100*height-60*scale}) scale(${scale})`}><GeneratedBlueprintSVG blueprint={blueprint} x={-165} y={-172} width={330} height={230} thumbnail/></g>;return <g key={place.id} transform={`translate(${point.fallbackX/100*width} ${point.fallbackY/100*height-60*scale}) scale(${scale})`}>
      <ellipse cx="0" cy="37" rx="126" ry="29" fill={mood.accent} opacity=".07"/>
      <path d="M-132 4C-120-40-43-58 1-43 59-68 132-39 134-4 151 29 67 58 12 50-58 64-143 41-132 4Z" fill={mood.palette.floor}/>
      <path d="M-132 4C-103 29-58 39 12 35 89 45 124 24 134-4L134 9C130 45 72 63 12 58-64 72-134 41-132 4Z" fill={mood.palette.wall}/>
      <ellipse cx="-68" cy="-24" rx="20" ry="8" fill={mood.palette.wood}/><path d="M-70-27v-62" stroke={mood.palette.wood} strokeWidth="5"/><ellipse cx="-68" cy="-83" rx="26" ry="34" fill={mood.palette.leaf}/><ellipse cx="-83" cy="-70" rx="19" ry="25" fill={mood.palette.sage}/>
      {kind==='dressing'?<><path d="M-42-17V-80Q0-125 37-80v67" fill="none" stroke={mood.palette.brass} strokeWidth="4"/><path d="M-24-68l-9 36h28l-9-36" fill={mood.palette.teal}/><path d="M-15-70v-11" stroke={mood.palette.brass} strokeWidth="2"/><ellipse cx="67" cy="-31" rx="30" ry="13" fill={mood.palette.paper}/><path d="M52-28v30m30-32v27" stroke={mood.palette.brass} strokeWidth="3"/><ellipse cx="66" cy="-66" rx="22" ry="31" fill={mood.palette.mirror} stroke={mood.palette.brass} strokeWidth="3"/></>
      :kind==='reading'?<><path d="M-20-29Q-28-64 3-61h15q29 3 17 38l-2 25h-52Z" fill={mood.palette.sage}/><ellipse cx="8" cy="-12" rx="27" ry="12" fill={mood.palette.paper}/><path d="M70 6v-76" stroke={mood.palette.brass} strokeWidth="3"/><path d="M50-65l8-21h25l8 21Z" fill={mood.palette.window}/><ellipse cx="-68" cy="-23" rx="31" ry="14" fill={mood.palette.mirror} opacity=".65"/></>
      :<><path d="M-37-22v38m63-33v35" stroke={mood.palette.wood} strokeWidth="5"/><ellipse cx="0" cy="-22" rx="52" ry="21" fill={mood.palette.wood}/><ellipse cx="-9" cy="-27" rx="18" ry="8" fill={mood.palette.paper}/><path d="M65-12v-68" stroke={mood.palette.brass} strokeWidth="4"/>{kind==='desk'?<><path d="M50-65l14-18 23 20Z" fill={mood.palette.teal}/><path d="M-19-54l22-12 20 14-21 12Z" fill={mood.palette.paper}/></>:<><path d="M-17-32v-15q0-12 13-12t13 12v15Z" fill={mood.palette.teal}/><circle cx="73" cy="-79" r="18" fill={mood.palette.window}/></>}</>}
      <path d="M-102 8q-4-18 10-23M96 12q-9-21 6-31" fill="none" stroke={mood.palette.leaf} strokeWidth="4"/>
    </g>;})}
  </svg>;
}

export default function WorldAtlas({places,compact,onEnter}:{places:WorldPlace[];compact:boolean;onEnter:(id:string)=>void}) {
  const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),engine=useRef<AtlasController|null>(null);
  const labels=useRef(new Map<string,HTMLButtonElement>());
  const projectedPlaces=useRef<AtlasProjection[]>([]),hovered=useRef<string|null>(null);
  const [mode,setMode]=useState<'loading'|'ready'|'fallback'>('loading');
  const [highlighted,setHighlighted]=useState<string|null>(null);
  const focusPlace=(id:string|null)=>{if(hovered.current===id)return;hovered.current=id;if(id)setHighlighted(id);engine.current?.focusPlace(id);};
  const selected=places.find(place=>place.id===highlighted)||places[0],selectedIndex=places.indexOf(selected);
  const selectedMood=selected?getSceneMood(resolveSceneKind(selected.scene),resolveSceneContext(selected.scene)):null;
  const selectedBlueprint=selected?validatedBlueprintForScene(selected.scene):null;
  const positions=atlasLayout(places.length,compact);
  // Disposing an atlas deliberately loses its WebGL context. A replacement
  // renderer must own a new canvas; label-only profile updates need no rebuild.
  const renderKey=JSON.stringify([compact,places.map(place=>[place.id,place.scene])]);
  useEffect(()=>{
    let cancelled=false,resize:ResizeObserver|undefined,intersection:IntersectionObserver|undefined;
    setMode('loading');
    import('./diorama/atlas-engine').then(({createWorldAtlas})=>{
      if(cancelled||!canvas.current||!host.current)return;
      const instance=createWorldAtlas(canvas.current,places,{compact,reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,onReady:()=>{if(!cancelled)setMode('ready');},onFailure:()=>{if(!cancelled)setMode('fallback');},onProjection:points=>{
        projectedPlaces.current=points;for(const point of points){const label=labels.current.get(point.id);if(!label)continue;label.style.transform=`translate3d(${point.x}px,${point.y}px,0) translate(-50%,0)`;label.style.opacity=point.visible?'1':'0';label.style.visibility=point.visible?'visible':'hidden';}
      }});
      engine.current=instance;
      if(!instance){setMode('fallback');return;}
      resize=new ResizeObserver(([entry])=>instance.resize(entry.contentRect.width,entry.contentRect.height));resize.observe(host.current);
      intersection=new IntersectionObserver(([entry])=>instance.setActive(entry.isIntersecting),{rootMargin:'100px'});intersection.observe(host.current);
    }).catch(()=>{if(!cancelled)setMode('fallback');});
    return()=>{cancelled=true;resize?.disconnect();intersection?.disconnect();engine.current?.dispose();engine.current=null;};
  },[renderKey]);
  return <div className="world-atlas atlas-overview" data-state={mode} data-compact={compact} data-count={places.length} role="group" aria-label="Your world, a landscape of connected places">
    <div ref={host} className="atlas-stage"
      onPointerMove={event=>{if(event.pointerType==='touch')return;const bounds=event.currentTarget.getBoundingClientRect(),x=event.clientX-bounds.left,y=event.clientY-bounds.top;engine.current?.setPointer(x/bounds.width*2-1,y/bounds.height*2-1);const nearby=projectedPlaces.current.filter(point=>point.visible).map(point=>({id:point.id,distance:Math.hypot(x-(point.x-(compact?15:30)),y-(point.y-(compact?34:65)))})).sort((a,b)=>a.distance-b.distance)[0];focusPlace(nearby&&nearby.distance<(compact?65:130)?nearby.id:null);}}
      onPointerLeave={()=>{engine.current?.setPointer(0,0);focusPlace(null);}}>
      <div className="atlas-light light-morning"/><div className="atlas-light light-twilight"/><div className="atlas-light light-rain"/>
      <canvas key={renderKey} ref={canvas} className="world-atlas-canvas" aria-hidden="true"/>
      {mode!=='ready'&&<IllustratedAtlas places={places} compact={compact}/>}
      <span className="atlas-coordinate" aria-hidden="true">A FEW PLACES / ONE LITTLE LIFE</span>
      <div className="atlas-beacons">{places.map((place,index)=>{const mood=getSceneMood(resolveSceneKind(place.scene),resolveSceneContext(place.scene)),point=positions[index],blueprint=validatedBlueprintForScene(place.scene);return <button key={place.id} ref={element=>{if(element)labels.current.set(place.id,element);else labels.current.delete(place.id);}} className="atlas-beacon"
        style={{'--place-accent':blueprint?.palette.accent||mood.accent,...(mode!=='ready'?{left:`${point.fallbackX}%`,top:`${point.fallbackY}%`,transform:'translate(-50%,0)',opacity:1,visibility:'visible'}:{left:0,top:0})} as CSSProperties & {'--place-accent':string}}
        aria-label={`Enter ${place.name}`} data-highlighted={selected?.id===place.id} onPointerDown={event=>event.currentTarget.setPointerCapture(event.pointerId)} onPointerEnter={()=>focusPlace(place.id)} onFocus={()=>focusPlace(place.id)} onBlur={()=>focusPlace(null)} onClick={()=>onEnter(place.id)}><span>{String(index+1).padStart(2,'0')}</span></button>;})}</div>
      <p className="atlas-invitation"><span/><span>follow a feeling. choose a place.</span><Glyph name="arrow-up"/></p>
    </div>
    {selected&&selectedMood&&<div className="atlas-wayfinding"><button className="atlas-waypoint" style={{'--place-accent':selectedBlueprint?.palette.accent||selectedMood.accent} as CSSProperties} aria-label={`Wander into ${selected.name}`} onClick={()=>onEnter(selected.id)}>
      <span className="waypoint-number">{String(selectedIndex+1).padStart(2,'0')}</span><span className="waypoint-copy"><span className="destination-weather">{selectedBlueprint?.atmosphere.timeLabel||selectedMood.time}</span><span className="destination-name">{selected.name}<Glyph name="arrow-up"/></span><span className="destination-story">{selected.subtitle}</span></span>
    </button><span className="atlas-place-count">{places.length} {places.length===1?'PLACE':'PLACES'}<br/>ONE LITTLE WORLD</span></div>}
    <nav className="atlas-place-index" aria-label="Districts in the whole world" onPointerLeave={()=>focusPlace(null)}>{places.map((place,index)=><button key={place.id} type="button" aria-label={`Explore ${place.name}`} data-selected={selected?.id===place.id} onPointerEnter={()=>focusPlace(place.id)} onFocus={()=>focusPlace(place.id)} onBlur={()=>focusPlace(null)} onClick={()=>onEnter(place.id)}><WorldVignette scene={place.scene}/><span className="atlas-index-copy"><small>{String(index+1).padStart(2,'0')} / {resolveSceneContext(place.scene).type}</small><strong>{place.name}</strong></span><Glyph name="arrow-up"/></button>)}</nav>
  </div>;
}
