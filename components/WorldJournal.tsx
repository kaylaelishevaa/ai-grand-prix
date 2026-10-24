'use client';

import {useRef,useState} from 'react';
import {Button} from './CoupiApp';
import {Glyph} from './Glyph';
import type {District} from '@/lib/journey-types';
import type {Profile} from '@/lib/types';
import {resolveSceneKind} from '@/lib/scenes';
import './world-journal.css';

const prompts={dressing:'What do you want to remember about tonight?',kitchen:'What made this little ritual feel like yours?',desk:'What did you make a little progress on today?',reading:'A line, a thought, a feeling you want to keep…'};
export default function WorldJournal({district,onProfile,onVisit,readOnly=false,archived=false}:{district:District;onProfile:(profile:Profile)=>void;onVisit:(id:string)=>void;readOnly?:boolean;archived?:boolean}) {
  const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const pending=useRef<{key:string;id:string}|null>(null);
  async function update(action:'add'|'delete',entryId?:string) {
    if(busy)return;setBusy(true);setError('');setSaved(false);
    const key=JSON.stringify([action,district.id,text.trim(),entryId]);
    if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
    try{
      const response=await fetch('/api/world/journal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,districtId:district.id,requestId:pending.current.id,...(action==='add'?{text:text.trim()}:{entryId})})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Couldn’t save that moment. Try again.');
      onProfile(result.profile);pending.current=null;
      if(action==='add'){setText('');setSaved(true);}
    }catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}
  }
  const entries=[...(district.journal||[])].reverse();
  return <section className="world-journal" aria-labelledby="journal-title">
    <div className="journal-heading"><span className="journal-orbit"><Glyph name="clock"/></span><div><p className="eyebrow">A LITTLE DIARY / ONLY YOUR WORDS</p><h2 id="journal-title">Life happened here.</h2><p>Keep a moment. This version of your room comes with it.</p></div><span className="journal-count">{String(entries.length).padStart(2,'0')} MOMENTS</span></div>
    {!readOnly&&<form className="journal-compose" onSubmit={e=>{e.preventDefault();void update('add');}}><label className="sr-only" htmlFor="journal-note">A moment in this world</label><textarea id="journal-note" value={text} disabled={busy} onChange={e=>{setText(e.target.value);setSaved(false);}} maxLength={1000} placeholder={prompts[resolveSceneKind(district.scene)]}/><div><span>Saved in this profile. Journal notes aren’t sent to the AI.</span><Button secondary type="submit" disabled={busy||!text.trim()||entries.length>=100}>{busy?'keeping it…':'Keep this moment'} <Glyph name="plus"/></Button></div></form>}
    {readOnly&&<p className="journal-empty">{archived?'Your kept moments stay here, even after a world closes.':'You’re revisiting a saved moment. Go back to now to keep a new one.'}</p>}
    {error&&<p className="journal-feedback journal-error" role="alert">{error}</p>}{saved&&!readOnly&&<p className="journal-feedback" role="status"><Glyph name="check"/> kept. you can come back to this room, just as it was.</p>}
    {entries.length>0?<ol className="journal-entries">{entries.map(entry=><li key={entry.id}><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}<span>{new Date(entry.createdAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span></time><div><p>{entry.text}</p><div className="journal-entry-actions">{entry.scene&&<button onClick={()=>onVisit(entry.id)}><Glyph name="scene"/> revisit this moment <Glyph name="arrow-up"/></button>}<button disabled={busy} onClick={()=>void update('delete',entry.id)} aria-label={`Delete journal entry from ${new Date(entry.createdAt).toLocaleString()}`}>delete</button></div></div></li>)}</ol>:<p className="journal-empty">Nothing to fill in perfectly. A sentence is a good beginning.</p>}
  </section>;
}
