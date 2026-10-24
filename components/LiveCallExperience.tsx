'use client';

import {useEffect,useRef,useState} from 'react';
import type {Profile,Verdict} from '@/lib/types';
import type {CallResponse} from '@/lib/journey-types';
import {getReview,getSku} from '@/lib/catalog';
import {eligibleCatalog} from '@/lib/profile';
import {liveCallBody,parseLiveCallTurn,publicCallResult,type LiveCallTurn} from '@/lib/call-bridge';
import {Glyph} from './Glyph';
import './live-call-experience.css';

/** Voice, camera and text share one validated call and approval pipeline. */
export default function LiveCallExperience({profile,onProfile,onClose,onType,onOpenProduct,onComplete}:{profile:Profile;onProfile:(profile:Profile)=>void;onClose:()=>void;onType:()=>void;onOpenProduct:(skuId:string,verdict?:Verdict,reviewId?:string)=>void;onComplete:(profile?:Profile)=>void}) {
  const frame=useRef<HTMLIFrameElement>(null);
  const latest=useRef({profile,onProfile,onClose,onOpenProduct,onComplete});latest.current={profile,onProfile,onClose,onOpenProduct,onComplete};
  const interviewing=!profile.journey?.interviewComplete,initialInterview=useRef(interviewing);
  const writes=useRef(Promise.resolve()),seen=useRef(new Set<string>()),results=useRef(new Map<string,CallResponse>()),mounted=useRef(true);
  const pendingRef=useRef(0),controlRef=useRef(false);
  const retry=useRef<LiveCallTurn|null>(null),submitTurn=useRef<(turn:LiveCallTurn)=>void>(()=>{});
  const [error,setError]=useState(''),[active,setActive]=useState(false),[pending,setPending]=useState(0),[controlBusy,setControlBusy]=useState(false),[worldReady,setWorldReady]=useState(false);
  function post(message:unknown){frame.current?.contentWindow?.postMessage(message,location.origin);}
  function stop(){post({type:'coupi-live-call-stop'});setActive(false);}
  function accept(result:CallResponse){
    if(result.profile.id===latest.current.profile.id&&result.profile.revision>=latest.current.profile.revision){latest.current.profile=result.profile;latest.current.onProfile(result.profile);}
    setWorldReady(result.worldReady);setError('');
  }
  useEffect(()=>{
    mounted.current=true;const controllers=new Set<AbortController>();
    const enqueue=(turn:LiveCallTurn)=>{
      const cached=results.current.get(turn.id);
      if(cached&&cached.profile.id===latest.current.profile.id&&cached.profile.revision===latest.current.profile.revision){post({type:'coupi-call-result',id:turn.id,result:publicCallResult(cached)});return;}
      if(cached){results.current.delete(turn.id);seen.current.delete(turn.id);}
      if(seen.current.has(turn.id))return;
      const profileId=latest.current.profile.id;
      seen.current.add(turn.id);post({type:'coupi-call-pending',id:turn.id});pendingRef.current++;setPending(pendingRef.current);
      writes.current=writes.current.catch(()=>{}).then(async()=>{
        if(!mounted.current)return;
        const controller=new AbortController();controllers.add(controller);
        try{
          if(latest.current.profile.id!==profileId)throw new Error('Your profile changed. Please start a new call.');
          const wasInterviewing=!latest.current.profile.journey?.interviewComplete;
          const response=await fetch('/api/call',{method:'POST',...liveCallBody(turn),cache:'no-store',signal:controller.signal});
          const result=await response.json() as CallResponse&{error?:string};
          if(!response.ok)throw new Error(result.error||'That thought didn’t connect. Try again.');
          if(!mounted.current)return;
          if(result.profile?.id!==profileId||latest.current.profile.id!==profileId||result.profile.revision<latest.current.profile.revision)throw new Error('Your profile changed. Please start a new call.');
          accept(result);
          post({type:'coupi-call-result',id:turn.id,result:publicCallResult(result)});
          if(result.status==='fallback')throw new Error(result.message||'I couldn’t verify that answer. Try again.');
          results.current.set(turn.id,result);if(results.current.size>16){const oldest=results.current.keys().next().value!;results.current.delete(oldest);seen.current.delete(oldest);}
          if(retry.current?.id===turn.id)retry.current=null;
          if(pendingRef.current===1&&wasInterviewing&&result.status==='ok'&&result.worldReady&&result.interviewCount>=5&&result.interviewComplete&&result.conversationMode!=='request'&&!result.verdict&&!result.inventory){stop();latest.current.onComplete(result.profile);}
        }catch(cause){
          seen.current.delete(turn.id);
          if(mounted.current&&!controller.signal.aborted){const message=cause instanceof Error?cause.message:'That thought didn’t connect. Try again.';retry.current=latest.current.profile.id===profileId?turn:null;setError(message);post({type:'coupi-call-error',id:turn.id,error:message});}
        }finally{controllers.delete(controller);pendingRef.current=Math.max(0,pendingRef.current-1);if(mounted.current)setPending(pendingRef.current);}
      });
    };
    submitTurn.current=enqueue;
    function receive(event:MessageEvent){
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||!event.data||typeof event.data!=='object')return;
      const message=event.data;
      if(message.type==='coupi-live-call-exit'){latest.current.onClose();return;}
      if(message.type==='coupi-live-call-state'){setActive(message.cameraActive===true||message.microphoneActive===true);return;}
      if(message.type==='coupi-live-call-product'){
        if(message.namespace!=='world-simulation'||typeof message.skuId!=='string'||!getSku(message.skuId))return;
        stop();void writes.current.catch(()=>{}).then(()=>{
          if(!mounted.current)return;
          if(!eligibleCatalog(latest.current.profile).some(item=>item.id===message.skuId)){setError('that item isn’t eligible for your world anymore.');return;}
          const result=typeof message.callId==='string'?results.current.get(message.callId):undefined;
          const verdict=result&&result.profile.id===latest.current.profile.id&&result.profile.revision===latest.current.profile.revision&&result.verdict?.pickSkuId===message.skuId?result.verdict:undefined;
          const citation=typeof message.reviewId==='string'&&verdict?.citations.includes(message.reviewId)&&getReview(message.reviewId)?message.reviewId:undefined;
          latest.current.onOpenProduct(message.skuId,verdict,citation);
        });return;
      }
      if(message.type!=='coupi-live-call-transcript')return;
      try{const turn=parseLiveCallTurn(message);if(turn)enqueue(turn);}catch(cause){const error=cause instanceof Error?cause.message:'Try sharing that frame again.';setError(error);if(typeof message.id==='string'&&message.id.length<=90)post({type:'coupi-call-error',id:message.id,error});}
    }
    window.addEventListener('message',receive);const child=frame.current?.contentWindow;
    return()=>{mounted.current=false;controllers.forEach(controller=>controller.abort());retry.current=null;window.removeEventListener('message',receive);child?.postMessage({type:'coupi-live-call-stop'},location.origin);};
  },[]);
  function interviewAction(action:'resumeInterview'|'finishInterview'){
    if(controlRef.current||pendingRef.current)return;
    controlRef.current=true;setControlBusy(true);setError('');
    const profileId=latest.current.profile.id;
    writes.current=writes.current.catch(()=>{}).then(async()=>{
      try{
        if(!mounted.current)return;
        if(latest.current.profile.id!==profileId)throw new Error('Your profile changed. Please start a new call.');
        const response=await fetch('/api/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,requestId:crypto.randomUUID()}),cache:'no-store'});
        const result=await response.json() as CallResponse&{error?:string};
        if(!response.ok)throw new Error(result.error||'Please try again.');
        if(!mounted.current)return;
        if(result.profile?.id!==profileId||latest.current.profile.id!==profileId||result.profile.revision<latest.current.profile.revision)throw new Error('Your profile changed. Please start a new call.');
        accept(result);
        if(action==='finishInterview'){stop();latest.current.onComplete(result.profile);}
        else post({type:'coupi-interview-progress',count:result.interviewCount,question:result.question||'',complete:result.interviewComplete,conversationMode:'interview',paused:false,worldReady:result.worldReady});
      }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:'Please try again.');}
      finally{controlRef.current=false;if(mounted.current)setControlBusy(false);}
    });
  }
  function leave(action:()=>void){stop();action();}
  return <section className="live-call-experience">
    <div className="live-call-wayfinding"><button className="text-button" onClick={()=>leave(onClose)}><Glyph name="arrow-left"/> Back</button><span><i className={active?'active':''}/>{pending?'MAKING SENSE OF YOUR WORDS':active?'IN YOUR COMPANY':'VOICE / CAMERA / A LITTLE COMPANY'}</span><button className="text-button" onClick={()=>leave(onType)}>Type instead <Glyph name="arrow-right"/></button></div>
    {error&&<div className="live-call-memory-error" role="status"><p>{error}</p>{retry.current&&<button className="text-button" disabled={pending>0} onClick={()=>retry.current&&submitTurn.current(retry.current)}>Try that turn again <Glyph name="arrow-right"/></button>}</div>}
    {(interviewing||(!profile.journey?.districts.length&&worldReady))&&<div className="live-call-interview-progress">{profile.journey?.interviewPaused?'YOUR REQUEST COMES FIRST':`OUR FIRST CALL / ${profile.journey?.interviewCount||0} STORIES · UP TO 5`}<div className="live-call-shortcuts">{profile.journey?.interviewPaused&&<button className="text-button" disabled={controlBusy||pending>0} onClick={()=>void interviewAction('resumeInterview')}>Back to my story</button>}{worldReady&&<button className="text-button" disabled={controlBusy||pending>0} onClick={()=>void interviewAction('finishInterview')}>That’s enough to start my world <Glyph name="arrow-right"/></button>}</div></div>}
    <iframe ref={frame} src={'/live-call/index.html'+(initialInterview.current?'?interview=1':'')} title="Coopy live voice, camera and virtual try-on" allow="camera; microphone; autoplay" className="live-call-frame"/>
    {interviewing?<div className="live-call-memories" aria-live="polite">{profile.memoryLines.filter(line=>line.source==='from our first call').slice(-5).map(line=><p key={line.id}>{line.text}<small>{line.source} · {line.confidence>=.85?'said by you':'tentative preference'}</small></p>)}</div>:<p className="live-call-provenance">Sourced references and simulated products keep their own evidence. Purchases always need your approval.</p>}
  </section>;
}
