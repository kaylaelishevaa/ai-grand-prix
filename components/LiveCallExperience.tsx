'use client';

import {useEffect,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import type {Profile,Verdict} from '@/lib/types';
import type {CallResponse} from '@/lib/journey-types';
import type {PersonalizationReview,PersonalizationResponse} from '@/lib/personalization';
import {getReview,getSku} from '@/lib/catalog';
import {eligibleCatalog} from '@/lib/profile';
import {liveCallBody,parseLiveCallTurn,publicCallResult,type LiveCallTurn} from '@/lib/call-bridge';
import {LiveCallLifecycle,liveDiscoveryContext,type CallScope} from '@/lib/live-call-session';
import FirstCallReview from './FirstCallReview';
import {Glyph} from './Glyph';
import './live-call-experience.css';

interface CallCallbacks {onProfile:(profile:Profile)=>void;onClose:()=>void;onType:()=>void;onOpenProduct:(skuId:string,verdict?:Verdict,reviewId?:string)=>void;onComplete:(profile?:Profile)=>void;}

/** A parser-created iframe stays in place; async profile/controller changes never recreate it. */
export default function LiveCallExperience({profile,visible=true,...callbacks}:CallCallbacks&{profile:Profile|null;visible?:boolean}){
  const frame=useRef<HTMLIFrameElement>(null),before=useRef<HTMLDivElement>(null),after=useRef<HTMLDivElement>(null);
  const [ports,setPorts]=useState<{before:HTMLDivElement;after:HTMLDivElement}|null>(null),[frameReady,setFrameReady]=useState(false);
  useEffect(()=>{if(before.current&&after.current)setPorts({before:before.current,after:after.current});},[]);
  useEffect(()=>{if(!visible)setFrameReady(false);},[visible]);
  return <section className="live-call-experience" data-discovery={!!profile?.journey?.personalizationDraft} hidden={!visible} style={{display:visible?'block':'none'}}>
    <div ref={before}/>
    <iframe ref={frame} src="/live-call/index.html?embedded=1" title="Your conversation with Coopy" allow="camera; microphone; autoplay" className="live-call-frame" inert={!visible||!frameReady} style={{display:visible&&frameReady?'block':'none'}}/>
    <div ref={after}/>
    {visible&&profile&&ports&&<LiveCallController key={profile.id} {...callbacks} profile={profile} frame={frame} before={ports.before} after={ports.after} onReady={setFrameReady}/>}
  </section>;
}

/** Voice, camera and text share one checked call. Only the shopper confirms discovery. */
export function LiveCallController({profile,frame,before,after,onReady,onProfile,onClose,onType,onOpenProduct,onComplete}:CallCallbacks&{profile:Profile;frame:RefObject<HTMLIFrameElement|null>;before:HTMLElement;after:HTMLElement;onReady:(ready:boolean)=>void}) {
  const childWindow=useRef<Window|null>(null),lifecycle=useRef(new LiveCallLifecycle());
  const latest=useRef({profile,onProfile,onClose,onOpenProduct,onComplete});latest.current={profile:profile.id!==latest.current.profile.id||profile.revision>=latest.current.profile.revision?profile:latest.current.profile,onProfile,onClose,onOpenProduct,onComplete};
  const initialInterview=useRef(!profile.journey?.interviewComplete),startId=useRef<string>('');
  const writes=useRef(Promise.resolve()),seen=useRef(new Set<string>()),results=useRef(new Map<string,CallResponse>()),mounted=useRef(true);
  const pendingRef=useRef(0),controlRef=useRef(false),acceptingTurns=useRef(true),reviewRef=useRef<PersonalizationReview|null>(null);
  const retry=useRef<LiveCallTurn|null>(null),submitTurn=useRef<(turn:LiveCallTurn)=>void>(()=>{});
  const requestReviewRef=useRef<(id?:string)=>void>(()=>{}),skipRef=useRef<(id?:string)=>void>(()=>{});
  const confirmAttempt=useRef<{key:string;requestId:string}|null>(null);
  const [error,setError]=useState(''),[active,setActive]=useState(false),[pending,setPending]=useState(0),[controlBusy,setControlBusy]=useState(false),[worldReady,setWorldReady]=useState(false);
  const [ready,setReady]=useState(!initialInterview.current),[bootAttempt,setBootAttempt]=useState(0),[review,setReview]=useState<PersonalizationReview|null>(null);
  const draft=profile.journey?.personalizationDraft;
  const interviewing=!profile.journey?.interviewComplete;
  const staged=draft?.candidates.filter(line=>!line.excludedFromAI)||[];
  function post(message:unknown){(frame.current?.contentWindow||childWindow.current)?.postMessage(message,location.origin);}
  function stop(){post({type:'coupi-live-call-stop'});setActive(false);}
  function syncContext(current=latest.current.profile,pendingReview=reviewRef.current!==null){
    const context=liveDiscoveryContext(current,pendingReview);post(context.personalization);post(context.progress);
  }
  function acceptProfile(updated:Profile){
    if(updated.id!==latest.current.profile.id||updated.revision<latest.current.profile.revision)throw new Error('Your profile changed. Please start a new call.');
    latest.current.profile=updated;latest.current.onProfile(updated);syncContext(updated);
  }
  function accept(result:CallResponse){acceptProfile(result.profile);setWorldReady(result.worldReady);setError('');}
  async function personalization(action:'start'|'draft'|'confirm'|'discard',values:{review?:PersonalizationReview;requestId?:string;scope?:CallScope}={}){
    const scope=values.scope||lifecycle.current.capture(latest.current.profile),controller=lifecycle.current.controller(scope,latest.current.profile,true);
    try{
      const response=await fetch('/api/personalization',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,requestId:values.requestId||crypto.randomUUID(),...(action!=='start'?{draftId:scope.draftId}:{}),...(values.review?{review:values.review}:{})}),cache:'no-store',signal:controller.signal});
      const data=await response.json() as PersonalizationResponse&{error?:string};
      if(!response.ok)throw new Error(data.error||'I couldn’t save that thought. Try again.');
      if(!lifecycle.current.current(scope,latest.current.profile,true))throw new Error('Your conversation changed. Please try again.');
      acceptProfile(data.profile);setWorldReady(data.worldReady);return data;
    }finally{lifecycle.current.release(controller);}
  }
  async function loadReview(){
    const data=await personalization('draft');
    if(!data.review)throw new Error('Share a little about your day first. Then we can review it together.');
    reviewRef.current=data.review;setReview(data.review);setError('');syncContext(data.profile,true);
  }
  useEffect(()=>{
    if(!initialInterview.current)return;
    let cancelled=false;mounted.current=true;
    if(!startId.current)startId.current=crypto.randomUUID();
    // Serialize Strict Mode mounts and route restoration with genuine spoken turns.
    writes.current=writes.current.catch(()=>{}).then(async()=>{
      if(cancelled)return;
      try{await personalization('start',{requestId:startId.current});if(!cancelled)setReady(true);}
      catch(cause){if(!cancelled)setError(cause instanceof Error?cause.message:'Your first call couldn’t start. Try again.');}
    });
    return()=>{cancelled=true;};
  // Initial discovery is an explicit session, not a new draft on every profile revision.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[bootAttempt]);
  useEffect(()=>{onReady(ready);return()=>onReady(false);},[ready,onReady]);
  useEffect(()=>{
    const node=frame.current,loaded=()=>{childWindow.current=node?.contentWindow||null;if(ready)syncContext();};
    node?.addEventListener('load',loaded);loaded();
    return()=>node?.removeEventListener('load',loaded);
  },[ready,profile.revision]);
  useEffect(()=>{
    mounted.current=true;acceptingTurns.current=true;lifecycle.current.begin();post({type:'coupi-live-call-open'});
    const enqueue=(turn:LiveCallTurn)=>{
      if(!acceptingTurns.current)return;
      if(reviewRef.current){post({type:'coupi-call-error',id:turn.id,error:'Finish reviewing, or choose Keep talking to continue.'});return;}
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
          if(!lifecycle.current.current(scope,latest.current.profile,true)){seen.current.delete(turn.id);if(lifecycle.current.current(scope,latest.current.profile))post({type:'coupi-call-error',id:turn.id,error:'Your discovery session changed. Please say that again.'});return;}
          controller=lifecycle.current.controller(scope,latest.current.profile,true);
          const response=await fetch('/api/call',{method:'POST',...liveCallBody(turn,scope.draftId),cache:'no-store',signal:controller.signal});
          const result=await response.json() as CallResponse&{error?:string};
          if(!response.ok)throw new Error(result.error||'That thought didn’t connect. Try again.');
          if(!lifecycle.current.current(scope,latest.current.profile,true))return;
          if(result.profile?.id!==profileId||latest.current.profile.id!==profileId)throw new Error('Your profile changed. Please start a new call.');
          accept(result);post({type:'coupi-call-result',id:turn.id,result:publicCallResult(result)});
          if(result.status==='fallback')throw new Error(result.message||'I couldn’t verify that answer. Try again.');
          results.current.set(turn.id,result);if(results.current.size>16){const oldest=results.current.keys().next().value!;results.current.delete(oldest);seen.current.delete(oldest);}
          if(retry.current?.id===turn.id)retry.current=null;
          if(pendingRef.current===1&&result.status==='ok'&&result.personalization?.reviewReady&&!reviewRef.current&&result.conversationMode!=='request'){
            try{await loadReview();}catch(cause){if(lifecycle.current.current(scope,latest.current.profile))setError(cause instanceof Error?cause.message:'Your words are kept in the draft. Tap Review my story to try again.');}
          }
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
        if(!acceptingTurns.current||!latest.current.profile.journey?.personalizationDraft){post({type:'coupi-personalization-result',id:message.id,error:'This discovery session is no longer active.'});return;}
        if(message.type==='coupi-personalization-review')requestReviewRef.current(message.id);else skipRef.current(message.id);return;
      }
      if(message.type==='coupi-live-call-exit'){leave(latest.current.onClose);return;}
      if(message.type==='coupi-live-call-state'){setActive(message.cameraActive===true||message.microphoneActive===true);return;}
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
      if(message.type!=='coupi-live-call-transcript')return;
      try{const turn=parseLiveCallTurn(message);if(turn)enqueue(turn);}catch(cause){const error=cause instanceof Error?cause.message:'Try sharing that frame again.';setError(error);if(typeof message.id==='string'&&message.id.length<=90)post({type:'coupi-call-error',id:message.id,error});}
    }
    window.addEventListener('message',receive);
    return()=>{mounted.current=false;acceptingTurns.current=false;lifecycle.current.end();retry.current=null;window.removeEventListener('message',receive);(frame.current?.contentWindow||childWindow.current)?.postMessage({type:'coupi-live-call-stop'},location.origin);};
  },[]);
  function control(operation:()=>Promise<void>,id?:string){
    if(controlRef.current){if(id)post({type:'coupi-personalization-result',id,error:'Your review is already opening. Please wait.'});return;}
    controlRef.current=true;setControlBusy(true);setError('');
    const scope=lifecycle.current.capture(latest.current.profile);
    writes.current=writes.current.catch(()=>{}).then(async()=>{
      try{if(!lifecycle.current.current(scope,latest.current.profile,true))throw new Error('Your discovery session changed. Please try again.');await operation();}
      catch(cause){if(lifecycle.current.current(scope,latest.current.profile)){const message=cause instanceof Error?cause.message:'Please try again.';setError(message);if(id)post({type:'coupi-personalization-result',id,error:message});}}
      finally{controlRef.current=false;if(mounted.current)setControlBusy(false);}
    });
  }
  function requestReview(id?:string){control(async()=>{await loadReview();if(id)post({type:'coupi-personalization-result',id,result:{ok:true,draft_ready:true,saved:false}});},id);}
  requestReviewRef.current=requestReview;
  function skipDiscovery(id?:string){control(async()=>{const result=await personalization('discard');reviewRef.current=null;setReview(null);syncContext(result.profile,false);if(id)post({type:'coupi-personalization-result',id,result:{ok:true,skipped:true,saved:false}});},id);}
  skipRef.current=skipDiscovery;
  function confirmReview(values:PersonalizationReview){
    if(pendingRef.current||controlRef.current)return;
    // Confirmation ends media before the route changes. Late transcripts cannot enter another turn.
    acceptingTurns.current=false;stop();
    const key=JSON.stringify([latest.current.profile.id,latest.current.profile.journey?.personalizationDraft?.id,values]);
    if(confirmAttempt.current?.key!==key)confirmAttempt.current={key,requestId:crypto.randomUUID()};
    const requestId=confirmAttempt.current.requestId;
    control(async()=>{try{const result=await personalization('confirm',{review:values,requestId});if(!result.worldReady||!result.profile.journey?.interviewComplete||result.profile.journey.personalizationDraft)throw new Error('Your saved context changed. Review one everyday preference before building.');reviewRef.current=null;setReview(null);latest.current.onComplete(result.profile);}catch(cause){acceptingTurns.current=true;throw cause;}});
  }
  function interviewAction(action:'resumeInterview'|'finishInterview'){
    if(pendingRef.current)return;
    if(action==='finishInterview'&&latest.current.profile.journey?.personalizationDraft){requestReview();return;}
    control(async()=>{
      if(action==='resumeInterview'&&!latest.current.profile.journey?.personalizationDraft)await personalization('start');
      const scope=lifecycle.current.capture(latest.current.profile),controller=lifecycle.current.controller(scope,latest.current.profile,true);
      try{
        const response=await fetch('/api/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,requestId:crypto.randomUUID(),personalizationDraftId:scope.draftId}),cache:'no-store',signal:controller.signal});
        const result=await response.json() as CallResponse&{error?:string};
        if(!response.ok)throw new Error(result.error||'Please try again.');
        if(!lifecycle.current.current(scope,latest.current.profile,true))return;accept(result);
        if(action==='finishInterview'&&result.status==='ok'&&result.worldReady&&result.interviewComplete){stop();latest.current.onComplete(result.profile);}
      }finally{lifecycle.current.release(controller);}
    });
  }
  function leave(action:()=>void){acceptingTurns.current=false;lifecycle.current.end();stop();action();}
  const controls=<>
    <div className="live-call-wayfinding"><button className="text-button" onClick={()=>leave(onClose)}><Glyph name="arrow-left"/> Back</button><span><i className={active?'active':''}/>{pending?'MAKING SENSE OF YOUR WORDS':active?'IN YOUR COMPANY':'YOUR VOICE. YOUR PACE.'}</span><button className="text-button" disabled={pending>0||controlBusy} onClick={()=>leave(onType)}>Type instead <Glyph name="arrow-right"/></button></div>
    {error&&<div className="live-call-memory-error" role="status"><p>{error}</p>{!ready?<button className="text-button" onClick={()=>setBootAttempt(value=>value+1)}>Reconnect</button>:retry.current&&<button className="text-button" disabled={pending>0} onClick={()=>retry.current&&submitTurn.current(retry.current)}>Try that turn again <Glyph name="arrow-right"/></button>}</div>}
    {interviewing&&<div className="live-call-interview-progress"><span>{profile.journey?.interviewPaused?'YOUR REQUEST COMES FIRST':`OUR FIRST CALL / ${draft?.answerCount??profile.journey?.interviewCount??0} OF UP TO 5 STORIES`}</span><div className="live-call-shortcuts">{profile.journey?.interviewPaused&&<button className="text-button" disabled={controlBusy||pending>0} onClick={()=>interviewAction('resumeInterview')}>Back to my story</button>}{draft&&staged.length>0?<button className="text-button" disabled={controlBusy||pending>0} onClick={()=>requestReview()}>Review my story <Glyph name="arrow-right"/></button>:worldReady&&<button className="text-button" disabled={controlBusy||pending>0} onClick={()=>interviewAction('finishInterview')}>Start my world <Glyph name="arrow-right"/></button>}</div></div>}
    {!ready&&<div className="live-call-connecting" role="status"><span className="eyebrow">A LITTLE SPACE FOR YOU</span><h2>let’s get to know you.</h2><p>Getting your conversation ready…</p></div>}
  </>;
  const ending=<>
    {draft?<p className="live-call-provenance">A draft until you review it. Camera is optional. <button className="text-button" disabled={controlBusy||pending>0} onClick={()=>skipDiscovery()}>Skip for now</button></p>:<p className="live-call-provenance">Your own story, grounded recommendations. Purchases always need your approval.</p>}
    {review&&<FirstCallReview review={review} busy={controlBusy||pending>0} error={error} onContinue={()=>{reviewRef.current=null;setReview(null);setError('');syncContext(latest.current.profile,false);}} onConfirm={confirmReview}/>}
  </>;
  return <>{createPortal(controls,before)}{createPortal(ending,after)}</>;
}
