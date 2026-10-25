'use client';

import {useState} from 'react';
import type {DistrictJournalEntry} from '@/lib/journey-types';
import {Glyph} from './Glyph';

export type JournalArchive={id:string;name:string;entries:DistrictJournalEntry[]};
export default function KeptMoments({archives,onVisit}:{archives:JournalArchive[];onVisit:(archiveId:string,entryId:string)=>void}) {
  const [all,setAll]=useState(false);
  const moments=archives.flatMap(archive=>archive.entries.map(entry=>({archive,entry}))).sort((a,b)=>b.entry.createdAt.localeCompare(a.entry.createdAt));
  if(!moments.length)return null;
  return <section className="kept-moments" aria-labelledby="kept-moments-title"><div className="world-section-heading"><div><span className="eyebrow">YOUR OWN WORDS / KEPT SAFE</span><h2 id="kept-moments-title">Kept moments.</h2></div><p>Old worlds can close.<br/>Your diary stays with you.</p></div><div className="kept-moments-list">{(all?moments:moments.slice(0,6)).map(({archive,entry})=><button key={entry.id} onClick={()=>onVisit(archive.id,entry.id)}><span><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</time><b>{entry.districtName}</b></span><span>{entry.text}</span><Glyph name="arrow-up"/></button>)}</div>{moments.length>6&&<button className="text-button" onClick={()=>setAll(value=>!value)}>{all?'Show fewer moments':`All ${moments.length} moments`} <Glyph name="arrow-right"/></button>}</section>;
}
