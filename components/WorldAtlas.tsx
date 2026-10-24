'use client';

import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Glyph} from './Glyph';
import {resolveSceneKind} from '@/lib/scenes';
import {getSceneMood} from '@/lib/scene-moods';
import {resolveSceneContext} from '@/lib/world-context';
import {atlasLayout} from './diorama/atlas-layout';
import type {AtlasController,AtlasPlace} from './diorama/atlas-engine';

export type WorldPlace=AtlasPlace&{subtitle:string;moments?:number};

function IllustratedAtlas({places,compact}:{places:WorldPlace[];compact:boolean}) {
  const positions=atlasLayout(places.length,compact);
  return <svg className="atlas-illustration" viewBox={compact?'0 0 400 610':'0 0 1200 650'} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <path d={compact?'M190 110C330 230 75 310 210 440':'M170 400C330 480 320 100 490 180S780 160 900 300 1030 570 780 520'} fill="none" stroke="#c5ad8c" strokeWidth="3" strokeDasharray="2 13" strokeLinecap="round"/>
    {places.map((place,index)=>{const kind=resolveSceneKind(place.scene),mood=getSceneMood(kind,resolveSceneContext(place.scene)),point=positions[index];return <g key={place.id} transform={`translate(${point.fallbackX/100*(compact?400:1200)} ${point.fallbackY/100*(compact?610:650)-72}) scale(${compact?.9:1.12})`}>
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
  const [mode,setMode]=useState<'loading'|'ready'|'fallback'>('loading');
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
        for(const point of points){const label=labels.current.get(point.id);if(!label)continue;label.style.transform=`translate3d(${point.x}px,${point.y}px,0) translate(-50%,0)`;label.style.opacity=point.visible?'1':'0';label.style.visibility=point.visible?'visible':'hidden';}
      }});
      engine.current=instance;
      if(!instance){setMode('fallback');return;}
      resize=new ResizeObserver(([entry])=>instance.resize(entry.contentRect.width,entry.contentRect.height));resize.observe(host.current);
      intersection=new IntersectionObserver(([entry])=>instance.setActive(entry.isIntersecting),{rootMargin:'100px'});intersection.observe(host.current);
    }).catch(()=>{if(!cancelled)setMode('fallback');});
    return()=>{cancelled=true;resize?.disconnect();intersection?.disconnect();engine.current?.dispose();engine.current=null;};
  },[renderKey]);
  return <div className="world-atlas" data-state={mode} data-compact={compact} role="group" aria-label="Your world, a landscape of connected places">
    <div ref={host} className="atlas-stage"
      onPointerMove={event=>{if(event.pointerType==='touch')return;const bounds=event.currentTarget.getBoundingClientRect();engine.current?.setPointer((event.clientX-bounds.left)/bounds.width*2-1,(event.clientY-bounds.top)/bounds.height*2-1);}}
      onPointerLeave={()=>engine.current?.setPointer(0,0)}>
      <div className="atlas-light light-morning"/><div className="atlas-light light-twilight"/><div className="atlas-light light-rain"/>
      <canvas key={renderKey} ref={canvas} className="world-atlas-canvas" aria-hidden="true"/>
      {mode!=='ready'&&<IllustratedAtlas places={places} compact={compact}/>}
      <span className="atlas-coordinate" aria-hidden="true">A FEW PLACES / ONE LITTLE LIFE</span>
      <div className="atlas-beacons">{places.map((place,index)=>{const mood=getSceneMood(resolveSceneKind(place.scene),resolveSceneContext(place.scene)),point=positions[index];return <button key={place.id} ref={element=>{if(element)labels.current.set(place.id,element);else labels.current.delete(place.id);}} className="atlas-beacon"
        style={{'--place-accent':mood.accent,...(mode!=='ready'?{left:`${point.fallbackX}%`,top:`${point.fallbackY}%`,transform:'translate(-50%,0)',opacity:1,visibility:'visible'}:{left:0,top:0})} as CSSProperties & {'--place-accent':string}}
        aria-label={`Enter ${place.name}`} onClick={()=>onEnter(place.id)}><span>{String(index+1).padStart(2,'0')}</span></button>;})}</div>
      <p className="atlas-invitation"><span/><span>follow a feeling. choose a place.</span><Glyph name="arrow-up"/></p>
    </div>
    <div className="atlas-wayfinding">{places.map((place,index)=>{const mood=getSceneMood(resolveSceneKind(place.scene),resolveSceneContext(place.scene));return <button key={place.id} className="atlas-waypoint" style={{'--place-accent':mood.accent} as CSSProperties} aria-label={`Wander into ${place.name}`} onClick={()=>onEnter(place.id)}>
      <span className="waypoint-number">{String(index+1).padStart(2,'0')}</span><span className="waypoint-copy"><span className="destination-weather">{mood.time}</span><span className="destination-name">{place.name}<Glyph name="arrow-up"/></span><span className="destination-story">{place.moments?`${place.moments} ${place.moments===1?'moment':'moments'} kept · `:''}{place.subtitle}</span></span>
    </button>;})}</div>
  </div>;
}
