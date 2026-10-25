'use client';

import {useEffect,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import type {Profile,Verdict} from '@/lib/types';
import type {CallResponse} from '@/lib/journey-types';
import {getReview,getSku} from '@/lib/catalog';
import {eligibleCatalog} from '@/lib/profile';
import {liveCallBody,parseLiveCallTurn,publicCallResult,type LiveCallTurn} from '@/lib/call-bridge';
import FirstCallController from './FirstCallController';
import {usesFirstCall} from '@/lib/call-entry';
import {LiveCallLifecycle} from '@/lib/live-call-session';
import {Glyph} from './Glyph';
import './live-call-experience.css';

interface CallCallbacks {onProfile:(profile:Profile)=>void;onClose:()=>void;onType:()=>void;onOpenProduct:(skuId:string,verdict?:Verdict,reviewId?:string)=>void;onComplete:(profile?:Profile)=>void;}

/** A parser-created iframe stays in place; async profile/controller changes never recreate it. */
export default function LiveCallExperience({profile,visible=true,...callbacks}:CallCallbacks&{profile:Profile|null;visible?:boolean}){
  const frame=useRef<HTMLIFrameElement>(null),before=useRef<HTMLDivElement>(null),after=useRef<HTMLDivElement>(null);
  const [ports,setPorts]=useState<{before:HTMLDivElement;after:HTMLDivElement}|null>(null),[frameReady,setFrameReady]=useState(false);
  useEffect(()=>{if(before.current&&after.current)setPorts({before:before.current,after:after.current});},[]);
  useEffect(()=>{if(!visible)setFrameReady(false);},[visible]);
  const Controller=profile&&usesFirstCall(profile)?FirstCallController:LiveCallController;
  return <section className="live-call-experience" data-ready={frameReady} hidden={!visible} style={{display:visible?'flex':'none'}}>
    <div ref={before} className="live-call-before"/>
    <iframe ref={frame} src="/live-call/index.html?embedded=1" title="Your conversation with Coupi" allow="camera; microphone; autoplay" className="live-call-frame" inert={!visible||!frameReady} style={{display:visible&&frameReady?'block':'none'}}/>
    <div ref={after} className="live-call-after"/>
    {visible&&profile&&ports&&<Controller key={profile.id} {...callbacks} profile={profile} frame={frame} before={ports.before} after={ports.after} onReady={setFrameReady}/>}
  </section>;
}

/** Ordinary voice, camera and text use direct Realtime tools; first-call discovery has its own controller. */
export function LiveCallController({profile,frame,before,after,onReady,onProfile,onClose,onOpenProduct,onComplete}:CallCallbacks&{profile:Profile;frame:RefObject<HTMLIFrameElement|null>;before:HTMLElement;after:HTMLElement;onReady:(ready:boolean)=>void}) {
  const directRealtime=true;
  const childWindow=useRef<Window|null>(null),lifecycle=useRef(new LiveCallLifecycle());
  const latest=useRef({profile,onProfile,onClose,onOpenProduct,onComplete});latest.current={profile:profile.id!==latest.current.profile.id||profile.revision>=latest.current.profile.revision?profile:latest.current.profile,onProfile,onClose,onOpenProduct,onComplete};
  const writes=useRef(Promise.resolve()),seen=useRef(new Set<string>()),results=useRef(new Map<string,CallResponse>()),mounted=useRef(true);
  const pendingRef=useRef(0),acceptingTurns=useRef(true);
  const retry=useRef<LiveCallTurn|null>(null),submitTurn=useRef<(turn:LiveCallTurn)=>void>(()=>{});
  const [navigation,setNavigation]=useState<CallResponse['navigation']>(undefined);
  const [error,setError]=useState(''),[pending,setPending]=useState(0);
  function post(message:unknown){(frame.current?.contentWindow||childWindow.current)?.postMessage(message,location.origin);}
  function stop(){post({type:'coupi-live-call-stop'});}
  function syncContext(){post({type:'coupi-personalization-context',active:false,question:'',count:0,draftPending:false,memories:[]});}
  function acceptProfile(updated:Profile){
    if(updated.id!==latest.current.profile.id||updated.revision<latest.current.profile.revision)throw new Error('Your profile changed. Please start a new call.');
    latest.current.profile=updated;latest.current.onProfile(updated);syncContext();
  }
  function accept(result:CallResponse){acceptProfile(result.profile);setNavigation(result.navigation);setError('');}
  useEffect(()=>{onReady(true);return()=>onReady(false);},[onReady]);
  useEffect(()=>{
    const node=frame.current,loaded=()=>{childWindow.current=node?.contentWindow||null;syncContext();};
    node?.addEventListener('load',loaded);loaded();
    return()=>node?.removeEventListener('load',loaded);
  },[profile.revision]);
  useEffect(()=>{
    mounted.current=true;acceptingTurns.current=true;lifecycle.current.begin();post({type:'coupi-live-call-open'});
    const enqueue=(turn:LiveCallTurn)=>{
      if(!acceptingTurns.current)return;
      const cached=results.current.get(turn.id);
      if(cached&&cached.profile.id===latest.current.profile.id&&cached.profile.revision===latest.current.profile.revision){post({type:'coupi-call-result',id:turn.id,result:publicCallResult(cached)});return;}
      if(cached){results.current.delete(turn.id);seen.current.delete(turn.id);}
      if(seen.current.has(turn.id))return;
      const scope=lifecycle.current.capture(latest.current.profile),profileId=scope.profileId;
      seen.current.add(turn.id);post({type:'coupi-call-pending',id:turn.id});pendingRef.current++;setPending(pendingRef.current);
      writes.current=writes.current.catch(()=>{}).then(async()=>{
        let controller:AbortController|undefined;
        try{
          if(!acceptingTurns.current)return;
          if(!lifecycle.current.current(scope,latest.current.profile)){seen.current.delete(turn.id);if(lifecycle.current.current(scope,latest.current.profile))post({type:'coupi-call-error',id:turn.id,error:'Your call changed. Please say that again.'});return;}
          controller=lifecycle.current.controller(scope,latest.current.profile);
          const response=await fetch('/api/call',{method:'POST',...liveCallBody(turn),cache:'no-store',signal:controller.signal});
          const result=await response.json() as CallResponse&{error?:string};
          if(!response.ok)throw new Error(result.error||'That thought didn’t connect. Try again.');
          if(!lifecycle.current.current(scope,latest.current.profile))return;
          if(result.profile?.id!==profileId||latest.current.profile.id!==profileId)throw new Error('Your profile changed. Please start a new call.');
          accept(result);post({type:'coupi-call-result',id:turn.id,result:publicCallResult(result)});
          if(result.status==='fallback')throw new Error(result.message||'I couldn’t verify that answer. Try again.');
          results.current.set(turn.id,result);if(results.current.size>16){const oldest=results.current.keys().next().value!;results.current.delete(oldest);seen.current.delete(oldest);}
          if(retry.current?.id===turn.id)retry.current=null;

        }catch(cause){
          seen.current.delete(turn.id);
          if(lifecycle.current.current(scope,latest.current.profile)&&!controller?.signal.aborted){const message=cause instanceof Error?cause.message:'That thought didn’t connect. Try again.';retry.current=latest.current.profile.id===profileId?turn:null;setError(message);post({type:'coupi-call-error',id:turn.id,error:message});}
        }finally{if(controller)lifecycle.current.release(controller);pendingRef.current=Math.max(0,pendingRef.current-1);if(mounted.current)setPending(pendingRef.current);}
      });
    };
    submitTurn.current=enqueue;
    function receive(event:MessageEvent){
      if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||!event.data||typeof event.data!=='object')return;
      const message=event.data;
      if(message.type==='coupi-live-call-ready'){childWindow.current=frame.current?.contentWindow||null;syncContext();return;}
      if(message.type==='coupi-personalization-review'||message.type==='coupi-personalization-skip'){
        if(typeof message.id!=='string'||!/^personalization-[A-Za-z0-9_-]{1,80}$/.test(message.id))return;
        post({type:'coupi-personalization-result',id:message.id,error:'Calls now start with shopping. Tell Coupi what you want to buy.'});return;
      }
      if(message.type==='coupi-live-call-exit'){leave(latest.current.onClose);return;}
      if(message.type==='coupi-live-call-state')return;
      if(message.type==='coupi-live-call-product'){
        if(message.namespace!=='world-simulation'||typeof message.skuId!=='string'||!getSku(message.skuId))return;
        const scope=lifecycle.current.capture(latest.current.profile);stop();void writes.current.catch(()=>{}).then(()=>{
          if(!lifecycle.current.current(scope,latest.current.profile))return;
          if(!eligibleCatalog(latest.current.profile).some(item=>item.id===message.skuId)){setError('that item isn’t eligible for your world anymore.');return;}
          const result=typeof message.callId==='string'?results.current.get(message.callId):undefined;
          const verdict=result&&result.profile.id===latest.current.profile.id&&result.profile.revision===latest.current.profile.revision&&result.verdict?.pickSkuId===message.skuId?result.verdict:undefined;
          const citation=typeof message.reviewId==='string'&&verdict?.citations.includes(message.reviewId)&&getReview(message.reviewId)?message.reviewId:undefined;
          latest.current.onOpenProduct(message.skuId,verdict,citation);
        });return;
      }
      // Older iframe code may still forward transcripts. Ordinary calls must never
      // trigger a second model request or mutate the profile through the verdict service.
      if(message.type!=='coupi-live-call-transcript'||directRealtime)return;
      try{const turn=parseLiveCallTurn(message);if(turn)enqueue(turn);}catch(cause){const error=cause instanceof Error?cause.message:'Try sharing that frame again.';setError(error);if(typeof message.id==='string'&&message.id.length<=90)post({type:'coupi-call-error',id:message.id,error});}
    }
    window.addEventListener('message',receive);
    return()=>{mounted.current=false;acceptingTurns.current=false;lifecycle.current.end();retry.current=null;window.removeEventListener('message',receive);(frame.current?.contentWindow||childWindow.current)?.postMessage({type:'coupi-live-call-stop'},location.origin);};
  },[]);
  function leave(action:()=>void){acceptingTurns.current=false;lifecycle.current.end();stop();action();}
  const controls=error?<div className="live-call-memory-error" role="status"><p>{error}</p>{retry.current&&<button className="text-button" disabled={pending>0} onClick={()=>retry.current&&submitTurn.current(retry.current)}>Try that turn again <Glyph name="arrow-right"/></button>}</div>:null;
  const ending=navigation?<a className="call-account-guidance" href={navigation.href} onClick={()=>leave(()=>{})}><Glyph name={navigation.section==='addresses'?'home':'lock'}/><span>{navigation.label}<small>You review and save the changes.</small></span><Glyph name="arrow-right"/></a>:null;
  return <>{createPortal(controls,before)}{createPortal(ending,after)}</>;
}
