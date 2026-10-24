'use client';

import {useEffect,useMemo,useState} from 'react';
import {Button,Speech} from './CoupiApp';
import {Glyph} from './Glyph';
import {worldTemplates,type WorldTemplate} from '@/data/world-templates';
import type {District} from '@/lib/journey-types';
import type {DioramaPhase} from './diorama/engine';
import WorldAtlas,{type WorldPlace} from './WorldAtlas';
import KeptMoments,{type JournalArchive} from './KeptMoments';
import './world-home.css';

export default function WorldHome({districts,archives,phase,busy,complete,command,onCommand,onCreate,onEnter,onPreview,onCall,onArchive}:{
  districts:District[];phase:DioramaPhase;busy:boolean;complete:boolean;command:string;
  archives:JournalArchive[];onArchive:(archiveId:string,entryId:string)=>void;
  onCommand:(text:string)=>void;onCreate:(text?:string)=>void;onEnter:(d:District)=>void;
  onPreview:(template:WorldTemplate)=>void;onCall:()=>void;
}) {
  const [mode,setMode]=useState<'personal'|'explore'>('personal'),[page,setPage]=useState(0),[compact,setCompact]=useState(false);
  useEffect(()=>{const media=window.matchMedia('(max-width:640px)');const change=()=>{setCompact(media.matches);setPage(0);};change();media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  const moments=districts.reduce((sum,d)=>sum+(d.journal?.length||0),0)+archives.reduce((sum,a)=>sum+a.entries.length,0);
  const places=useMemo<WorldPlace[]>(()=>mode==='personal'?districts.map(d=>({id:d.id,name:d.name,scene:d.scene,subtitle:d.provenance,moments:d.journal?.length})):worldTemplates.map(template=>({id:template.id,name:template.name,scene:template.scene,subtitle:template.subtitle})),[districts,mode]);
  const size=6,pages=Math.max(1,Math.ceil(places.length/size)),currentPage=Math.min(page,pages-1);
  const visible=useMemo(()=>places.slice(currentPage*size,(currentPage+1)*size),[places,currentPage,size]);
  function enter(id:string){if(mode==='personal'){const district=districts.find(d=>d.id===id);if(district)onEnter(district);}else{const template=worldTemplates.find(t=>t.id===id);if(template)onPreview(template);}}
  return <section className="world-home screen-surface" data-atlas-mode={mode} data-phase={phase}>
    <div className="world-heading"><div><p className="eyebrow orange">YOUR LIFE / IN LITTLE PLACES</p><h1>a world <em>of you.</em></h1><p className="world-overview-invitation">The whole world first. Follow a light to step inside.</p></div><div className="world-intro"><Speech>{mode==='personal'?'a morning. a first date. a little pause. where shall we go?':'a few beginnings. the rest of the story is yours.'}</Speech></div></div>
    <div className="world-atlas-navigation"><div role="tablist" aria-label="Choose your world landscape"><button id="personal-worlds-tab" type="button" role="tab" aria-selected={mode==='personal'} aria-controls="world-landscape" onClick={()=>{setMode('personal');setPage(0);}}>Your worlds <span>{String(districts.length).padStart(2,'0')}</span></button><button id="suggested-worlds-tab" type="button" role="tab" aria-selected={mode==='explore'} aria-controls="world-landscape" onClick={()=>{setMode('explore');setPage(0);}}>Worlds to explore <Glyph name="spark"/></button></div><span className="world-moment-count"><Glyph name="clock"/>{moments} {moments===1?'moment':'moments'} kept</span></div>
    <div id="world-landscape" role="tabpanel" aria-labelledby={mode==='personal'?'personal-worlds-tab':'suggested-worlds-tab'}>
      {places.length?<><div className="atlas-context"><span>{mode==='personal'?'FROM YOUR OWN STORY':'CURATED BEGINNINGS / MAKE ONE YOURS'}</span><span>{mode==='personal'?'each place holds a little of your life':'sunshine, butterflies, rainy afternoons'}</span></div><WorldAtlas places={visible} compact={compact} onEnter={enter}/></>:<div className="world-building"><span className="world-seed"><Glyph name="scene"/></span><h2>Your story is the landscape.</h2><p>{busy?'Finding the right places, from everything you shared.':'A few little places are waiting to become yours.'}</p><Button disabled={busy||!complete} onClick={()=>onCreate()}>Build my world <Glyph name="arrow-right"/></Button>{!complete&&<Button secondary onClick={onCall}>Finish our first call</Button>}<button className="text-button" onClick={()=>{setMode('explore');setPage(0);}}>Wander through a few beginnings <Glyph name="arrow-up"/></button></div>}
      {pages>1&&<nav className="atlas-pagination" aria-label="More places in your world"><button disabled={currentPage===0} onClick={()=>setPage(p=>p-1)} aria-label="Previous places"><Glyph name="arrow-left"/></button><span>CHAPTER {String(currentPage+1).padStart(2,'0')} <i>/</i> {String(pages).padStart(2,'0')}</span><button disabled={currentPage>=pages-1} onClick={()=>setPage(p=>p+1)} aria-label="Next places"><Glyph name="arrow-right"/></button></nav>}
    </div>
    {districts.length>0&&<form className="new-district" onSubmit={e=>{e.preventDefault();onCreate(command);}}><span className="new-district-orbit"><Glyph name="plus"/></span><label htmlFor="new-district"><strong>Where does your story go next?</strong><span>A place for a ritual. A trip. A new chapter.</span></label><div><input id="new-district" value={command} onChange={e=>onCommand(e.target.value)} maxLength={1000} placeholder="Make a place for…"/><Button type="submit" secondary disabled={busy||!command.trim()}>Grow it <Glyph name="arrow-up"/></Button></div></form>}
    <KeptMoments archives={archives} onVisit={onArchive}/>
    <div className="world-journal-invitation"><Glyph name="clock"/><p><strong>Some places become part of your story.</strong> Keep a moment inside a world. Come back to how it felt. Let the scenery change with you.</p><span>YOUR WORDS / YOUR PACE</span></div>
  </section>;
}
