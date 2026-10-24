'use client';

import {useEffect,useRef,useState} from 'react';
import SceneDiorama from './SceneDiorama';
import SceneFallback from './SceneFallback';
import {Button,Speech} from './CoupiApp';
import {Glyph} from './Glyph';
import {worldTemplates,type WorldTemplate} from '@/data/world-templates';
import type {District} from '@/lib/journey-types';
import type {SceneResult} from '@/lib/types';
import type {DioramaPhase} from './diorama/engine';
import './world-home.css';
import KeptMoments,{type JournalArchive} from './KeptMoments';

/** Only rooms close to the viewport own a WebGL context. Offscreen worlds stay lightweight. */
function WorldMiniature({scene,phase}:{scene:SceneResult;phase:DioramaPhase}) {
  const host=useRef<HTMLDivElement>(null);
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    if(!host.current)return;
    const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{rootMargin:'100px'});
    observer.observe(host.current);return()=>observer.disconnect();
  },[]);
  const fallback=<SceneFallback scene={scene} onSelect={()=>{}}/>;
  return <div ref={host} className="district-miniature" inert aria-hidden="true">{visible?<SceneDiorama scene={scene} phase={phase} onSelect={()=>{}} fallback={fallback}/>:fallback}</div>;
}

export default function WorldHome({districts,archives,phase,busy,complete,command,onCommand,onCreate,onEnter,onPreview,onCall,onArchive}:{
  districts:District[];phase:DioramaPhase;busy:boolean;complete:boolean;command:string;
  archives:JournalArchive[];onArchive:(archiveId:string,entryId:string)=>void;
  onCommand:(text:string)=>void;onCreate:(text?:string)=>void;onEnter:(d:District)=>void;
  onPreview:(template:WorldTemplate)=>void;onCall:()=>void;
}) {
  const moments=districts.reduce((sum,d)=>sum+(d.journal?.length||0),0)+archives.reduce((sum,a)=>sum+a.entries.length,0);
  return <section className="world-home screen-surface">
    <div className="world-heading"><div><p className="eyebrow orange">YOUR WORLD / STILL BECOMING</p><h1>a little world,<br/><em>a lot of you.</em></h1></div><div className="world-intro"><Speech>{districts.length?'make a place for your life. i’ll remember where we left off.':'your story first. then a little world to call your own.'}</Speech><p>Places for your rituals, your next chapter, and the days in between.</p></div></div>
    <nav className="world-chapters" aria-label="Explore your homepage"><a href="#your-worlds">Your worlds <span>{String(districts.length).padStart(2,'0')}</span></a><a href="#worlds-to-explore">Worlds to explore <Glyph name="arrow-up"/></a><span>{moments} {moments===1?'moment':'moments'} kept</span></nav>
    <section id="your-worlds" className="personal-worlds" aria-labelledby="your-worlds-title">
      <div className="world-section-heading"><div><span className="eyebrow">01 / PERSONAL</span><h2 id="your-worlds-title">Your worlds.</h2></div><p>Made from your story.<br/>Growing with the life you put into them.</p></div>
      {!districts.length?<div className="world-building"><span className="world-seed"><Glyph name="scene"/></span><h2>Your story is the blueprint.</h2><p>{busy?'Finding the right pieces, with your context in mind.':'Your first districts are ready to be imagined.'}</p><Button disabled={busy||!complete} onClick={()=>onCreate()}>Build my world <Glyph name="arrow-right"/></Button>{!complete&&<Button secondary onClick={onCall}>Finish our first call</Button>}</div>:<div className="district-collection">{districts.map((d,index)=><article className="district-card" key={d.id} style={{animationDelay:`${Math.min(index,3)*90}ms`}}>
        <WorldMiniature scene={d.scene} phase={phase}/>
        <button className="district-open" onClick={()=>onEnter(d)} aria-label={`Wander into ${d.name}`}><span className="district-index">YOUR WORLD {String(index+1).padStart(2,'0')} <span>{d.journal?.length?`${d.journal.length} ${d.journal.length===1?'moment':'moments'} kept`:'a story just beginning'}</span></span><span className="district-title">{d.name}</span><span className="district-provenance">{d.provenance}</span><span className="district-enter"><Glyph name="arrow-up"/></span></button>
      </article>)}</div>}
      {districts.length>0&&<form className="new-district" onSubmit={e=>{e.preventDefault();onCreate(command);}}><span className="new-district-orbit"><Glyph name="plus"/></span><label htmlFor="new-district"><strong>There’s room for more you.</strong><span>A place for a ritual. A trip. A new chapter.</span></label><div><input id="new-district" value={command} onChange={e=>onCommand(e.target.value)} maxLength={1000} placeholder="Make a place for…"/><Button type="submit" secondary disabled={busy||!command.trim()}>Grow it <Glyph name="arrow-up"/></Button></div></form>}
    </section>
    <KeptMoments archives={archives} onVisit={onArchive}/>
    <section id="worlds-to-explore" className="suggested-worlds" aria-labelledby="explore-worlds-title">
      <div className="world-section-heading"><div><span className="eyebrow">02 / A LITTLE INSPIRATION</span><h2 id="explore-worlds-title">Worlds to explore.</h2></div><p>Curated starting points.<br/>Step inside. Then make one yours.</p></div>
      <div className="suggested-collection">{worldTemplates.map(template=><article className="suggested-world district-card" key={template.id}>
        <WorldMiniature scene={template.scene} phase={template.scene.kind==='dressing'?'dawn':phase}/>
        <button className="district-open" onClick={()=>onPreview(template)} aria-label={`Explore ${template.name}`}><span className="district-index">CURATED STARTER</span><span className="district-title">{template.name}</span><span className="suggested-subtitle">{template.subtitle}</span><span className="district-enter"><Glyph name="arrow-up"/></span></button>
      </article>)}</div>
      <div className="world-journal-invitation"><Glyph name="clock"/><p><strong>A world can become a diary.</strong> Keep a moment in a room. Revisit how it looked. Let it change as you do.</p><span>YOUR WORDS / YOUR PACE</span></div>
    </section>
  </section>;
}
