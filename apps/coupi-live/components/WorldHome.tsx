'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {Button,Speech} from './CoupiApp';
import {Glyph} from './Glyph';
import {worldTemplates,type WorldTemplate} from '@/data/world-templates';
import type {District} from '@/lib/journey-types';
import type {Profile} from '@/lib/types';
import {weeklyLocalWorlds} from '@/lib/world-activity';
import type {DioramaPhase} from './diorama/engine';
import WorldAtlas,{type WorldPlace} from './WorldAtlas';
import KeptMoments,{type JournalArchive} from './KeptMoments';
import './world-home.css';

export default function WorldHome({profile,compactLayout=false,districts,archives,phase,busy,complete,command,onCommand,onCreate,onEnter,onPreview,onCall,onArchive}:{
  profile:Profile;compactLayout?:boolean;districts:District[];phase:DioramaPhase;busy:boolean;complete:boolean;command:string;
  archives:JournalArchive[];onArchive:(archiveId:string,entryId:string)=>void;
  onCommand:(text:string)=>void;onCreate:(text?:string)=>void;onEnter:(d:District)=>void;
  onPreview:(template:WorldTemplate)=>void;onCall:()=>void;
}) {
  const [mode,setMode]=useState<'personal'|'explore'>(districts.length?'personal':'explore'),[page,setPage]=useState(0),[compact,setCompact]=useState(compactLayout);
  const previousCount=useRef(districts.length);
  useEffect(()=>{if(previousCount.current===0&&districts.length>0){setMode('personal');setPage(0);}previousCount.current=districts.length;},[districts.length]);
  useEffect(()=>{if(compactLayout){setCompact(true);return;}const media=window.matchMedia('(max-width:640px)');const change=()=>{setCompact(media.matches);setPage(0);};change();media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[compactLayout]);
  const moments=districts.reduce((sum,d)=>sum+(d.journal?.length||0),0)+archives.reduce((sum,a)=>sum+a.entries.length,0);
  const weekly=useMemo(()=>weeklyLocalWorlds(profile),[profile]);
  const places=useMemo<WorldPlace[]>(()=>{
    if(mode==='personal')return districts.map(d=>({id:d.id,name:d.name,scene:d.scene,subtitle:d.provenance,moments:d.journal?.length}));
    const candidates:WorldPlace[]=[...districts.filter(d=>weekly.worldIds.includes('district:'+d.id)).map(d=>({id:'district:'+d.id,name:d.name,scene:d.scene,subtitle:d.provenance,moments:d.journal?.length})),...worldTemplates.map(t=>({id:'template:'+t.id,name:t.name,scene:t.scene,subtitle:t.subtitle}))];
    return candidates.sort((a,b)=>{const aRank=weekly.worldIds.indexOf(a.id),bRank=weekly.worldIds.indexOf(b.id);return(aRank<0?999:aRank)-(bRank<0?999:bRank);});
  },[districts,mode,weekly]);
  const size=6,pages=Math.max(1,Math.ceil(places.length/size)),currentPage=Math.min(page,pages-1);
  const visible=useMemo(()=>places.slice(currentPage*size,(currentPage+1)*size),[places,currentPage,size]);
  function enter(id:string){if(mode==='personal'||id.startsWith('district:')){const district=districts.find(d=>d.id===(mode==='personal'?id:id.slice(9)));if(district)onEnter(district);}else{const template=worldTemplates.find(t=>'template:'+t.id===id);if(template)onPreview(template);}}
  return <section className="world-home screen-surface" data-atlas-mode={mode} data-phase={phase}>
    <div className="world-heading"><div><p className="eyebrow orange"><span/> LITTLE PLACES, POSSIBLE LIVES</p><h1>{mode==='personal'?<>a world <em>of you.</em></>:<>a little further.<br/><em>a little more you.</em></>}</h1><p className="world-overview-invitation">{mode==='personal'?'Your rituals, occasions and little escapes. All connected.':'An evening out. A slower morning. Where would you like to be?'}</p></div><div className="world-intro"><Speech>{mode==='personal'?'a morning. a first date. a little pause. where shall we go?':'a few beginnings. the rest of the story is yours.'}</Speech></div></div>
    <div className="world-atlas-navigation"><div role="tablist" aria-label="Choose your world landscape"><button id="personal-worlds-tab" type="button" role="tab" aria-selected={mode==='personal'} aria-controls="world-landscape" onClick={()=>{setMode('personal');setPage(0);}}>Your worlds <span>{String(districts.length).padStart(2,'0')}</span></button><button id="suggested-worlds-tab" type="button" role="tab" aria-selected={mode==='explore'} aria-controls="world-landscape" onClick={()=>{setMode('explore');setPage(0);}}>{weekly.label} <Glyph name="spark"/></button></div><span className="world-moment-count"><Glyph name="clock"/>{moments} {moments===1?'moment':'moments'} kept</span></div>
    {mode==='explore'&&<p className="explore-week-note">{weekly.label==='This week’s picks'?'Curated worlds to make your own':'Your recent favorites first, with a few new beginnings'}</p>}
    {!!places.length&&<div className="explore-companion"><span className="companion-presence-dot"/><p><strong>i’ll come with you.</strong><small>Choose a world. Coopy follows your curiosity.</small></p><Glyph name="arrow-up"/></div>}
    <div id="world-landscape" role="tabpanel" aria-labelledby={mode==='personal'?'personal-worlds-tab':'suggested-worlds-tab'}>
      {places.length?<><div className="atlas-context"><span>{mode==='personal'?'FROM YOUR OWN STORY':'CURATED BEGINNINGS / MAKE ONE YOURS'}</span><span>{mode==='personal'?'each place holds a little of your life':'sunshine, butterflies, rainy afternoons'}</span></div><WorldAtlas places={visible} compact={compact} onEnter={enter}/></>:<div className="world-building"><span className="world-seed"><Glyph name="scene"/></span><h2>Your story is the landscape.</h2><p>{busy?'Finding the right places, from everything you shared.':'A few little places are waiting to become yours.'}</p><Button disabled={busy||!complete} onClick={()=>onCreate()}>Build my world <Glyph name="arrow-right"/></Button>{!complete&&<Button secondary onClick={onCall}>Finish our first call</Button>}<button className="text-button" onClick={()=>{setMode('explore');setPage(0);}}>Wander through a few beginnings <Glyph name="arrow-up"/></button></div>}
      {pages>1&&<nav className="atlas-pagination" aria-label="More places in your world"><button disabled={currentPage===0} onClick={()=>setPage(p=>p-1)} aria-label="Previous places"><Glyph name="arrow-left"/></button><span>CHAPTER {String(currentPage+1).padStart(2,'0')} <i>/</i> {String(pages).padStart(2,'0')}</span><button disabled={currentPage>=pages-1} onClick={()=>setPage(p=>p+1)} aria-label="Next places"><Glyph name="arrow-right"/></button></nav>}
    </div>
    {districts.length>0&&<form className="new-district" onSubmit={e=>{e.preventDefault();onCreate(command);}}><span className="new-district-orbit"><Glyph name="plus"/></span><label htmlFor="new-district"><strong>Where does your story go next?</strong><span>A place for a ritual. A trip. A new chapter.</span></label><div><input id="new-district" value={command} onChange={e=>onCommand(e.target.value)} maxLength={1000} placeholder="Make a place for…"/><Button type="submit" secondary disabled={busy||!command.trim()}>Grow it <Glyph name="arrow-up"/></Button></div></form>}
    <KeptMoments archives={archives} onVisit={onArchive}/>
    <div className="world-journal-invitation"><Glyph name="clock"/><p><strong>Some places become part of your story.</strong> Keep a moment inside a world. Come back to how it felt. Let the scenery change with you.</p><span>YOUR WORDS / YOUR PACE</span></div>
  </section>;
}
