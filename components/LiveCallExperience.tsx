'use client';

import {useEffect,useRef,useState} from 'react';
import type {Profile} from '@/lib/types';
import {getSku} from '@/lib/catalog';
import {eligibleCatalog} from '@/lib/profile';
import {Glyph} from './Glyph';
import './live-call-experience.css';

/** Hosts the teammate's camera/Realtime implementation without replacing the world journey. */
export default function LiveCallExperience({profile,onProfile,onClose,onType,onOpenProduct,onComplete}:{profile:Profile;onProfile:(profile:Profile)=>void;onClose:()=>void;onType:()=>void;onOpenProduct:(skuId:string)=>void;onComplete:()=>void}) {
  const frame=useRef<HTMLIFrameElement>(null);
  const latest=useRef({profile,onProfile,onClose,onOpenProduct,onComplete});latest.current={profile,onProfile,onClose,onOpenProduct,onComplete};
  const interviewing=!profile.journey?.interviewComplete;
  const initialInterview=useRef(interviewing);
  const writes=useRef(Promise.resolve());
  const seen=useRef(new Set<string>());
  const [error,setError]=useState(''),[active,setActive]=useState(false);
  useEffect(()=>{
    let mounted=true;
    function receive(event:MessageEvent) {
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||!event.data||typeof event.data!=='object')return;
      const message=event.data;
      if(message.type==='coupi-live-call-exit'){latest.current.onClose();return;}
      if(message.type==='coupi-live-call-state'){setActive(message.cameraActive===true||message.microphoneActive===true);return;}
      if(message.type==='coupi-live-call-product'){
        if(message.namespace!=='world-simulation'||typeof message.skuId!=='string'||!getSku(message.skuId))return;
        const skuId=message.skuId;
        frame.current?.contentWindow?.postMessage({type:'coupi-live-call-stop'},location.origin);
        setActive(false);
        void writes.current.catch(()=>{}).then(()=>{
          if(!mounted)return;
          if(!eligibleCatalog(latest.current.profile).some(item=>item.id===skuId)){setError('that item isn’t eligible for your world anymore.');return;}
          latest.current.onOpenProduct(skuId);
        });
        return;
      }
      if(message.type!=='coupi-live-call-transcript'||message.role!=='user'||typeof message.text!=='string'||typeof message.id!=='string')return;
      const text=message.text.trim().slice(0,400),id=message.id.slice(0,90);
      if(!text||!id||seen.current.has(id))return;
      seen.current.add(id);
      writes.current=writes.current.catch(()=>{}).then(async()=>{
        try {
          const firstCall=!latest.current.profile.journey?.interviewComplete;
          const response=await fetch(firstCall?'/api/call':'/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(firstCall?{action:'message',requestId:'live-interview:'+id,message:text}:{action:'callStatement',id:'live:'+id,text}),cache:'no-store'});
          const result=await response.json();
          if(!response.ok)throw new Error(result.error||'That memory could not be saved.');
          if(result.profile?.id===latest.current.profile.id&&result.profile.revision>=latest.current.profile.revision){latest.current.profile=result.profile;if(mounted)latest.current.onProfile(result.profile);}
          if(firstCall&&result.status==='fallback')throw new Error('That answer did not save.');
          if(firstCall&&mounted){
            frame.current?.contentWindow?.postMessage({type:'coupi-interview-progress',count:result.interviewCount,question:result.question||'',complete:result.interviewComplete===true},location.origin);
            if(result.interviewComplete){frame.current?.contentWindow?.postMessage({type:'coupi-live-call-stop'},location.origin);latest.current.onComplete();}
          }
          if(mounted)setError('');
        }catch{seen.current.delete(id);if(mounted)setError('that thought didn’t save to your world. the call can continue.');}
      });
    }
    window.addEventListener('message',receive);
    const child=frame.current?.contentWindow;
    return()=>{mounted=false;window.removeEventListener('message',receive);child?.postMessage({type:'coupi-live-call-stop'},location.origin);};
  },[]);
  function leave(action:()=>void){frame.current?.contentWindow?.postMessage({type:'coupi-live-call-stop'},location.origin);action();}
  return <section className="live-call-experience">
    <div className="live-call-wayfinding"><button className="text-button" onClick={()=>leave(onClose)}><Glyph name="arrow-left"/> Back</button><span><i className={active?'active':''}/>{active?'IN YOUR COMPANY':'VOICE / CAMERA / A LITTLE COMPANY'}</span><button className="text-button" onClick={()=>leave(onType)}>Type instead <Glyph name="arrow-right"/></button></div>
    {error&&<p className="live-call-memory-error" role="status">{error}</p>}
    {interviewing&&<p className="live-call-interview-progress">OUR FIRST CALL / {profile.journey?.interviewCount||0} OF 5 LITTLE STORIES</p>}
    <iframe ref={frame} src={'/live-call/index.html'+(initialInterview.current?'?interview=1':'')} title="Coopy live voice, camera and virtual try-on" allow="camera; microphone; autoplay" className="live-call-frame"/>
    {interviewing?<div className="live-call-memories" aria-live="polite">{profile.memoryLines.filter(line=>line.source==='from our first call').slice(-5).map(line=><p key={line.id}>{line.text}<small>{line.source} · {Math.round(line.confidence*100)}% confidence</small></p>)}</div>:<p className="live-call-provenance">18 sourced Coupang references for try-on. Reference prices; check the listing for current details.</p>}
  </section>;
}
