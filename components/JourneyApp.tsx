'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import CoupiApp, {Art, Button, Meta, Modal, Pet, ReviewRow, Speech, SystemClock, TypedDissent} from './CoupiApp';
import CompanionCall from './CompanionCall';
import HatchDiorama from './HatchDiorama';
import SceneDiorama from './SceneDiorama';
import SceneFallback from './SceneFallback';
import WorldHome from './WorldHome';
import WorldJournal from './WorldJournal';
import {worldTemplates,type WorldTemplate} from '@/data/world-templates';
import {Glyph} from './Glyph';
import {catalog, getReview, getSku, reviewsForSku} from '@/lib/catalog';
import {eligibleCatalog} from '@/lib/profile';
import {isDecisionLocked} from '@/lib/guardrails';
import {decisionApprovalIssue} from '@/lib/delegation-policy';
import type {AskResponse, Profile, SceneResult, Verdict} from '@/lib/types';
import type {CallResponse, District, WorldResponse} from '@/lib/journey-types';
import './journey.css';

type View = 'hatch' | 'call' | 'world' | 'district' | 'preview' | 'archive' | 'stroll' | 'head' | 'decisions';
type Panel = 'verdict' | 'why' | 'review' | 'reviews' | 'delegate' | 'everything';
const money = (value:number) => '₩' + value.toLocaleString('en-US');
const uid = () => crypto.randomUUID();
const captions:Record<View,string> = {hatch:'replaces onboarding',call:'replaces a search box',world:'replaces the homepage',district:'replaces categories',preview:'replaces trend feeds',archive:'replaces a forgotten browsing history',stroll:'replaces endless scrolling',head:'replaces a hidden profile',decisions:'replaces the cart'};

async function api<T>(url:string, body?:unknown):Promise<T> {
  const response = await fetch(url, {method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const data = await response.json();
  if(!response.ok) throw new Error(data.error || data.message || 'That didn’t connect. Please try again.');
  return data;
}

function RoomFallback({scene,onSelect}:{scene:SceneResult;onSelect:(id:string)=>void}) {
  return <SceneFallback scene={scene} onSelect={onSelect}/>;
}

export default function JourneyApp() {
  const [profile,setProfile] = useState<Profile|null>(null);
  const [view,setView] = useState<View>('hatch');
  const [status,setStatus] = useState<{offline:boolean;configured:boolean}|null>(null);
  const [hatched,setHatched] = useState(false);
  const [busy,setBusy] = useState('Waking up your companion');
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [districtId,setDistrictId] = useState('');
  const [command,setCommand] = useState('');
  const [rebuild,setRebuild] = useState('');
  const [templateId,setTemplateId] = useState('');
  const [personalWords,setPersonalWords] = useState('');
  const [momentId,setMomentId] = useState('');
  const [archiveId,setArchiveId] = useState('');
  const [archivedMomentId,setArchivedMomentId] = useState('');
  const [productId,setProductId] = useState<string|null>(null);
  const [verdict,setVerdict] = useState<Verdict|null>(null);
  const [productBusy,setProductBusy] = useState(false);
  const [productError,setProductError] = useState('');
  const [panel,setPanel] = useState<Panel>('verdict');
  const [reviewId,setReviewId] = useState('');
  const [selected,setSelected] = useState<string[]>([]);
  const [cap,setCap] = useState(30000);
  const [options,setOptions] = useState({watchPrice:true,haggle:false,bundle:true,scheduleDelivery:true});
  const [delegating,setDelegating] = useState(false);
  const lastView = useRef<View>('world');
  const productRequest = useRef(0);
  const worldRequest = useRef<{key:string;id:string}|null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const initial = useRef(false);
  const latestProfile = useRef(profile); latestProfile.current=profile;
  const storeProfile = useCallback((p:Profile) => {
    setProfile(p);
    try { localStorage.setItem('coupi.live.profile.v1',JSON.stringify(p)); } catch {}
  },[]);
  const flash = useCallback((text:string) => {setNotice(text);if(noticeTimer.current)clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setNotice(''),5500);},[]);
  const task = useCallback(async(label:string,work:()=>Promise<void>) => {
    setBusy(label);setError('');
    try {await work();} catch(e) {setError(e instanceof Error?e.message:'Please try again.');} finally {setBusy('');}
  },[]);

  useEffect(()=>{
    if(initial.current)return; initial.current=true;
    void task('Waking up your companion',async()=>{
      const [result,connection] = await Promise.all([api<{profile:Profile}>('/api/profile'),api<{offline:boolean;configured:boolean}>('/api/status')]);
      let p=result.profile;
      const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
      if(timezone&&timezone!==p.timezone)p=(await api<{profile:Profile}>('/api/profile',{action:'settings',timezone})).profile;
      storeProfile(p);setStatus(connection);setHatched(!!p.journey?.hatched);
      const utility=new URLSearchParams(location.search).get('utility');
      setView(utility==='head'||utility==='call'?utility:p.journey?.interviewComplete?'world':p.journey?.hatched?'call':'hatch');
    });
  },[storeProfile,task]);
  useEffect(()=>()=>{if(noticeTimer.current)clearTimeout(noticeTimer.current);},[]);
  useEffect(()=>{setSelected(current=>current.filter(id=>profile?.decisions.some(d=>d.id===id&&!d.approvedAt&&!isDecisionLocked(profile,d)&&!decisionApprovalIssue(d))));},[profile]);

  const districts=profile?.journey?.districts||[];
  const district=districts.find(d=>d.id===districtId);
  const template=worldTemplates.find(item=>item.id===templateId);
  const moment=district?.journal?.find(entry=>entry.id===momentId);
  const districtScene=moment?.scene||district?.scene;
  const archives=profile?.journey?.archivedJournals||[];
  const archive=archives.find(item=>item.id===archiveId);
  const archivedMoment=archive?.entries.find(entry=>entry.id===archivedMomentId)||archive?.entries.at(-1);
  const contextName=view==='preview'?template?.name:view==='district'||view==='stroll'?district?.name:undefined;
  const pending=profile?.decisions.filter(d=>!d.approvedAt)||[];
  const sku=productId?getSku(productId):undefined;
  const phase=profile?.pretend2am?'night':view==='hatch'?'dawn':view==='call'?'store':'noon';
  const step=view==='hatch'?0:view==='call'&&!profile?.journey?.interviewComplete?1:view==='world'?2:['district','preview','stroll'].includes(view)?3:view==='decisions'?4:2;

  function changeView(next:View) {setView(next);setError('');window.scrollTo({top:0,behavior:'instant'});}
  function openUtility(next:'call'|'head') {if(view!==next){lastView.current=view;changeView(next);}}
  function closeUtility() {changeView(lastView.current==='head'||lastView.current==='call'?'world':lastView.current);}
  function closeProduct() {productRequest.current++;setProductId(null);setProductError('');setProductBusy(false);}
  async function hatch() {
    if(busy||hatched)return;
    setHatched(true);
    await task('A little hello',async()=>{const result=await api<CallResponse>('/api/call',{action:'hatch',requestId:uid()});storeProfile(result.profile);});
  }
  async function makeWorld(text?:string,rebuildId?:string,enterNew=false) {
    if(busy)return;
    const key=JSON.stringify([text?.trim()||'',rebuildId||'']);
    if(worldRequest.current?.key!==key)worldRequest.current={key,id:uid()};
    await task(rebuildId?'Making room for a new feeling':districts.length?'Growing your world':'Building a world from your story',async()=>{
      const result=await api<WorldResponse>('/api/world',{requestId:worldRequest.current!.id,...(text?.trim()?{command:text.trim()}:{}),...(rebuildId?{districtId:rebuildId}:{})});
      worldRequest.current=null;
      storeProfile(result.profile);setCommand('');setRebuild('');setMomentId('');
      if(enterNew){const added=result.districts.at(-1);if(added){setDistrictId(added.id);setPersonalWords('');changeView('district');}}
    });
  }
  function completeCall() {changeView('world');if(!districts.length)void makeWorld();}
  function enterDistrict(d:District) {setDistrictId(d.id);setRebuild('');setMomentId('');changeView('district');}
  function previewWorld(t:WorldTemplate) {setTemplateId(t.id);setPersonalWords('');changeView('preview');}

  async function openProduct(id:string,existing?:Verdict) {
    const item=getSku(id);if(!item)return;
    const sequence=++productRequest.current;
    setProductId(id);setPanel('verdict');setReviewId('');setVerdict(existing||null);setProductError('');setCap(item.price);setOptions({watchPrice:true,haggle:false,bundle:true,scheduleDelivery:true});
    if(existing){setProductBusy(false);return;}
    setProductBusy(true);
    try {
      const result=await api<AskResponse>('/api/ask',{requestId:uid(),pickSkuId:id,question:`Evaluate ${item.name} (SKU ${id}) for me${contextName?` in the ${contextName} world`:''}. Explain its fit and a documented drawback. I am inspecting this exact item.`});
      if(productRequest.current!==sequence)return;
      storeProfile(result.profile);
      if(result.status==='verdict'||result.status==='clarify')setVerdict(result.verdict);
      else if('message' in result)setProductError(result.message);
    } catch(e) {if(productRequest.current===sequence)setProductError(e instanceof Error?e.message:'The evidence check didn’t connect.');}
    finally {if(productRequest.current===sequence)setProductBusy(false);}
  }
  async function swapProduct() {
    if(!sku||productBusy)return;
    const sequence=++productRequest.current;setProductBusy(true);setProductError('');
    try {
      const result=await api<AskResponse>('/api/ask',{requestId:uid(),question:`Find another ${sku.category} item serving the same purpose as ${sku.name}, respecting my current profile.`,excludeSkuIds:[sku.id],swapDirection:'another'});
      if(productRequest.current!==sequence)return;
      storeProfile(result.profile);
      if(result.status==='verdict'&&result.verdict.pickSkuId){setProductId(result.verdict.pickSkuId);setVerdict(result.verdict);setCap(getSku(result.verdict.pickSkuId)!.price);}
      else if(result.status==='clarify'){setVerdict(result.verdict);}
      else if(result.status==='blocked'||result.status==='fallback')setProductError(result.message);
    }catch(e){if(productRequest.current===sequence)setProductError(e instanceof Error?e.message:'Please try again.');}
    finally{if(productRequest.current===sequence)setProductBusy(false);}
  }
  async function delegate() {
    if(!sku||delegating)return;
    setDelegating(true);setProductError('');
    try {
      const result=await api<{profile:Profile;blocked?:string}>('/api/delegate',{action:'assign',skuId:sku.id,budgetCap:cap,...options,source:contextName?`${view==='preview'?'the suggested':'your'} ${contextName} world`:'your call'});
      storeProfile(result.profile);
      if(result.blocked){setProductError(result.blocked);return;}
      closeProduct();changeView('decisions');flash('i’ll take it from here. your yes is still the last step.');
    }catch(e){setProductError(e instanceof Error?e.message:'Please try again.');}finally{setDelegating(false);}
  }
  const handleEmbeddedProfile=useCallback((p:Profile)=>{
    const wasHatched=latestProfile.current?.journey?.hatched;
    storeProfile(p);
    if(wasHatched&&!p.journey?.hatched){setHatched(false);setView('hatch');}
  },[storeProfile]);

  return <div className="app-shell journey-shell" data-view={view} data-phase={phase} data-modal={productId?'open':'closed'}>
    <div className="ambient-field" aria-hidden="true"><span className="ambient-orb orb-one"/><span className="ambient-orb orb-two"/><span className="ambient-orb orb-three"/></div><div className="film-grain" aria-hidden="true"/>
    <header className="journey-header">
      <button className="wordmark" aria-label="Your world" onClick={()=>changeView(profile?.journey?.interviewComplete?'world':'hatch')}><span className="brand-flower"><Glyph name="flower"/></span>COUPI<span className="brand-dot">.</span></button>
      <span className="journey-brand-note">a little someone.<br/>a world that feels like you.</span>
      <div className="journey-utilities">
        {profile?.journey?.interviewComplete&&<button aria-label="Your world" className={view==='world'?'current':''} onClick={()=>changeView('world')}><Glyph name="scene"/><span>Your world</span></button>}
        <button className={view==='decisions'?'current':''} onClick={()=>changeView('decisions')} aria-label={`Decisions, ${pending.length} pending`}><Glyph name="check"/><span>Decisions</span>{pending.length>0&&<i>{pending.length}</i>}</button>
        <button className={view==='call'?'current':''} onClick={()=>openUtility('call')} aria-label="Call Coopy"><Glyph name="mic"/><span>Call</span><b className="call-presence"/></button>
        <button className={view==='head'?'current':''} onClick={()=>openUtility('head')} aria-label="Open the Head"><Glyph name="head"/><span>Head</span></button>
      </div>
    </header>
    <div className="journey-system"><span><i/>{status?.offline?'OFFLINE REPLAY':'COOPY IS HERE'}</span><SystemClock/><span>{profile?.pretend2am?'NIGHT REHEARSAL':'ON YOUR SIDE'}</span></div>
    <nav className="journey-trail" aria-label="Your journey">{['Meet','Tell your story','Your world','Wander','Your word'].map((label,index)=><span key={label} className={index===step?'active':index<step?'done':''} aria-current={index===step?'step':undefined}><b>{String(index+1).padStart(2,'0')}</b>{label}</span>)}</nav>

    <main className={`journey-main journey-${view}`}>
      {busy&&<div className="busy-banner" role="status"><span className="busy-dot"/>{busy}<span className="shimmer"/></div>}
      {error&&<div className="error-banner" role="alert"><b>one little pause.</b><p>{error}</p><button aria-label="Dismiss error" onClick={()=>setError('')}><Glyph name="close"/></button></div>}
      {!profile&&!busy&&<div className="empty-state"><Pet/><h2>Let’s reconnect.</h2><Button secondary onClick={()=>location.reload()}>Try again</Button></div>}

      {profile&&view==='hatch'&&<section className="hatch-chapter screen-surface">
        <div className="hatch-copy"><p className="eyebrow orange">01 / A SMALL BEGINNING</p><h1>{hatched?<>oh, hello.<br/>i’m Coopy.</>:<>a little someone,<br/><em>just for you.</em></>}</h1>
          {hatched?<><p className="hatch-invitation">Before I show you anything — can I call you? I’d rather hear your story than show you a catalog.</p><Button disabled={!!busy} onClick={()=>changeView('call')}>Let’s talk <Glyph name="arrow-right"/></Button><p className="hatch-reassurance">five little questions. your voice, or your words.</p></>:<><p>Something’s about to become your person.<br/>Tap the egg. Start with a hello.</p><Button secondary disabled={!!busy} onClick={()=>void hatch()}>Tap to hatch <Glyph name="spark"/></Button></>}
        </div>
        <div className="hatch-world"><span className="hatch-orbit orbit-a"/><span className="hatch-orbit orbit-b"/><HatchDiorama hatched={hatched} onHatch={()=>void hatch()} phase="dawn" fallback={<button className="intro-egg" disabled={hatched||!!busy} onClick={()=>void hatch()} aria-label="Tap to hatch Coopy">{hatched?<Pet size="large"/>:<span className="egg-shape"/>}</button>}/><span className="hatch-coordinates">YOUR WORLD / NOT YET WRITTEN</span></div>
      </section>}

      {profile&&view==='call'&&<CompanionCall profile={profile} offline={status?.offline} onProfile={storeProfile} onComplete={completeCall} onOpenProduct={(id,v)=>void openProduct(id,v)} onDecisions={()=>changeView('decisions')} onClose={closeUtility}/>}

      {profile&&view==='world'&&<WorldHome districts={districts} archives={archives} phase={phase} busy={!!busy} complete={!!profile.journey?.interviewComplete} command={command} onCommand={setCommand} onCreate={text=>void makeWorld(text,undefined,!!text)} onEnter={enterDistrict} onPreview={previewWorld} onCall={()=>changeView('call')} onArchive={(id,entryId)=>{setArchiveId(id);setArchivedMomentId(entryId);changeView('archive');}}/>}

      {profile&&view==='archive'&&(archive&&archivedMoment?<section className="district-detail screen-surface"><button className="text-button" onClick={()=>changeView('world')}><Glyph name="arrow-left"/> Your world</button><div className="district-heading"><div><p className="eyebrow orange">KEPT MOMENTS / YOUR OWN WORDS</p><h1>{archivedMoment.districtName}</h1><p>{new Date(archivedMoment.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})} · a room, just as you kept it</p></div></div><div className="moment-return"><span>This world’s recommendations were cleared when you changed your memory.<br/>Your diary remains. It doesn’t enter Coopy’s AI memory.</span></div><div className="full-district"><SceneDiorama scene={archivedMoment.scene} phase={phase} onSelect={id=>void openProduct(id)} fallback={<RoomFallback scene={archivedMoment.scene} onSelect={id=>void openProduct(id)}/>}/><div className="district-scene-note"><span>SAVED ROOM / Product details use the current demo catalog.</span></div></div><p className="moment-note">{archivedMoment.text}</p><WorldJournal key={archive.id} district={{id:archive.id,name:archive.name,scene:archivedMoment.scene,createdAt:archivedMoment.createdAt,sourceMemoryIds:[],provenance:'from your saved diary',journal:archive.entries}} readOnly archived onProfile={storeProfile} onVisit={id=>{setArchivedMomentId(id);window.scrollTo({top:0,behavior:'smooth'});}}/></section>:<div className="empty-state"><h2>That moment has been put away.</h2><Button secondary onClick={()=>changeView('world')}>Back to your world</Button></div>)}

      {profile&&view==='preview'&&template&&<section className="world-preview screen-surface">
        <button className="text-button" onClick={()=>changeView('world')}><Glyph name="arrow-left"/> Your world</button>
        <div className="world-preview-heading"><div><p className="eyebrow orange">CURATED STARTER / {template.chapter}</p><h1>{template.name}</h1></div><p>{template.description}</p></div>
        <div className="full-district"><SceneDiorama scene={template.scene} phase={template.scene.kind==='dressing'?'dawn':phase} onSelect={id=>void openProduct(id)} fallback={<RoomFallback scene={template.scene} onSelect={id=>void openProduct(id)}/>}/><div className="world-preview-note"><span>A little simulation. Tap a dot to look closer.</span><span>CURATED OBJECTS / NOT PERSONALIZED YET</span></div></div>
        <form className="world-personalize" onSubmit={e=>{e.preventDefault();void makeWorld(template.prompt+(personalWords.trim()?` My own words: ${personalWords.trim()}`:''),undefined,true);}}><div><h2>Same beginning.<br/>Your own story.</h2><p>{template.journalPrompt} Make a version that fits you, then keep your moments inside it.</p></div><div><label htmlFor="personal-world-words">WHAT WOULD MAKE THIS FEEL LIKE YOU? · OPTIONAL</label><textarea id="personal-world-words" value={personalWords} onChange={e=>setPersonalWords(e.target.value)} maxLength={600} placeholder="Your occasion, your mood, your little details…"/><Button type="submit" disabled={!!busy||!profile.journey?.interviewComplete}>Make it mine <Glyph name="arrow-right"/></Button><p>Coopy will rebuild it from your words, current memory and budget.</p></div></form>
      </section>}

      {profile&&view==='district'&&(district?<section className="district-detail screen-surface">
        <button className="text-button" onClick={()=>changeView('world')}><Glyph name="arrow-left"/> Your world</button>
        <div className="district-heading"><div><p className="eyebrow orange">04 / WANDER A LITTLE</p><h1>{moment?.districtName||district.name}</h1><p>{moment?`a moment kept on ${new Date(moment.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}`:district.provenance}</p></div><button className="quiet-pill" onClick={()=>changeView('stroll')}><Glyph name="heart"/> walk around <span>optional</span></button></div>
        {moment&&<div className="moment-return"><span>THEN / YOUR SAVED ROOM<br/>Product details still show the current demo catalog.</span><button onClick={()=>setMomentId('')}>Back to now <Glyph name="arrow-right"/></button></div>}
        <div className="full-district"><SceneDiorama scene={districtScene!} phase={phase} onSelect={id=>void openProduct(id)} fallback={<RoomFallback scene={districtScene!} onSelect={id=>void openProduct(id)}/>}/><div className="district-scene-note"><span>Tap a glowing dot. Ask why. Take your time.</span><span>{districtScene!.items.length} little finds · {money(districtScene!.items.reduce((sum,item)=>sum+(getSku(item.skuId)?.price||0),0))}</span></div></div>
        {moment&&<p className="moment-note">{moment.text}</p>}
        {!moment&&<form className="district-rebuild" onSubmit={e=>{e.preventDefault();void makeWorld(rebuild,district.id);}}><Glyph name="spark"/><input aria-label="Change this district" value={rebuild} onChange={e=>setRebuild(e.target.value)} maxLength={1000} placeholder="Change the feeling. Or tell me what’s missing…"/><Button secondary type="submit" disabled={!!busy||!rebuild.trim()}>Reimagine <Glyph name="arrow-up"/></Button></form>}
        <p className="district-explanation">{districtScene!.explanation}</p>
        <WorldJournal key={district.id} district={district} readOnly={!!moment} onProfile={storeProfile} onVisit={id=>{setMomentId(id);window.scrollTo({top:0,behavior:'smooth'});}}/>
      </section>:<div className="empty-state"><h2>This little world has moved.</h2><Button secondary onClick={()=>changeView('world')}>Back to your world</Button></div>)}

      {profile&&view==='stroll'&&<CoupiApp embedded initialView="taste" initialDeckMode="stroll" districtSkuIds={district?.scene.items.map(i=>i.skuId)} onProfileChange={storeProfile} onExit={()=>changeView('district')} onOpenProduct={id=>void openProduct(id)}/>}
      {profile&&view==='head'&&<><button className="text-button utility-back" onClick={closeUtility}><Glyph name="arrow-left"/> Back to your world</button><CoupiApp embedded initialView="head" onProfileChange={handleEmbeddedProfile} onExit={closeUtility} onOpenProduct={id=>void openProduct(id)}/></>}

      {profile&&view==='decisions'&&<section className="decisions-chapter screen-surface">
        <p className="eyebrow orange">05 / I DO THE LEGWORK. YOU DO THE YES.</p><h1>your word.<br/><em>then your day.</em></h1>
        <div className="decision-promise"><Pet/><p>everything here is a proposal.<br/><b>executes only with your approve.</b></p><button className="quiet-pill" onClick={()=>openUtility('call')}><Glyph name="mic"/> talk it through</button></div>
        {!pending.length&&<div className="decisions-empty"><h2>{profile.decisions.some(d=>d.approvedAt)?'All settled. Go live a little.':'Nothing to decide. A lovely place to be.'}</h2><p>{profile.decisions.some(d=>d.approvedAt)?'Your approvals are below. Coopy remembers what you now own.':'Wander into a district, or tell Coopy what you need.'}</p><Button secondary onClick={()=>changeView(profile.journey?.interviewComplete?'world':'call')}>{profile.journey?.interviewComplete?'Back to your world':'Let’s talk'} <Glyph name="arrow-right"/></Button></div>}
        <div className="delegated-list">{pending.map(d=>{
          const item=getSku(d.skuId);if(!item)return null;
          const locked=isDecisionLocked(profile,d),job=d.delegation;
          const canApprove=!locked&&!decisionApprovalIssue(d);
          return <article className="delegated-item" key={d.id}>
            <input type="checkbox" aria-label={`Approve ${item.name}`} disabled={!!busy||!canApprove} checked={selected.includes(d.id)} onChange={e=>setSelected(values=>e.target.checked?[...values,d.id]:values.filter(id=>id!==d.id))}/>
            <button className="decision-product" onClick={()=>void openProduct(item.id)}><Art sku={item}/></button><div className="delegated-copy"><button onClick={()=>void openProduct(item.id)}>{item.name}</button><p>{d.source}</p><div className="decision-statuses">{locked?<span className="status-chip status-night"><Glyph name="moon"/> sleep on it · 07:00</span>:null}<span className={`status-chip status-${job?.status||'ready'}`}>{job?.status==='watching'?'watching…':job?.status==='haggled'?`haggled −${money(job.discount)} · simulated`:'ready to approve'}</span>{job?.simulation&&<span className="status-detail">LOCAL PLAN · NOT A MERCHANT OFFER</span>}</div>{locked&&<p className="lock-note">it’s late. morning-you gets a vote.</p>}{job&&<p className="delegation-detail">{job.deliveryPlan}{job.bundle&&job.bundledDecisionIds.length>0?` · grouped with ${job.bundledDecisionIds.length} pending ${job.bundledDecisionIds.length===1?'item':'items'}`:''}</p>}</div>
            <div className="decision-cost"><strong>{money(job?.quotedPrice??item.price)}</strong>{job&&<small>cap {money(job.budgetCap)}</small>}<div>{job?.status==='watching'&&<button disabled={!!busy} onClick={()=>void task('Checking the catalog price',async()=>{const result=await api<{profile:Profile;blocked?:string}>('/api/delegate',{action:'refresh',id:d.id});storeProfile(result.profile);if(result.blocked)flash(result.blocked);})}>Check now</button>}<button disabled={!!busy} onClick={()=>void task('Putting it down',async()=>{const result=await api<{profile:Profile}>('/api/decisions',{action:'remove',id:d.id});storeProfile(result.profile);})}>Let it go</button></div></div>
          </article>;
        })}</div>
        {pending.length>0&&<div className="journey-approve"><div><span>{selected.length} selected · your approval required</span><strong>{money(pending.filter(d=>selected.includes(d.id)).reduce((sum,d)=>sum+(d.delegation?.quotedPrice??getSku(d.skuId)?.price??0),0))}</strong></div><Button disabled={!!busy||!selected.length} onClick={()=>void task('Checking your word against your limits',async()=>{const result=await api<{profile:Profile;approved:string[];blocked:string[]}>('/api/decisions',{action:'approve',ids:selected});storeProfile(result.profile);setSelected([]);flash(result.blocked.length?result.blocked.join(' '):`${result.approved.length} approved by you. Saved in your local order ledger.`);})}>Approve selected <Glyph name="check"/></Button></div>}
        <details className="approval-history"><summary>Already approved · {profile.decisions.filter(d=>d.approvedAt).length}</summary>{profile.decisions.filter(d=>d.approvedAt).map(d=><div key={d.id}><Glyph name="check"/><span>{getSku(d.skuId)?.name}</span><span>{money(d.delegation?.quotedPrice??getSku(d.skuId)?.price??0)}</span></div>)}</details>
        <p className="checkout-note">Approvals are saved locally. Seller negotiation, price monitoring, delivery booking and payments are not connected to Coupang. Prices and reviews in this demo are seeded.</p>
      </section>}
      {view!=='head'&&view!=='stroll'&&<p className="screen-caption"><span className="caption-mark"/>{captions[view]}</p>}
    </main>
    <footer className="journey-footer"><span>COOPY / ON YOUR SIDE</span><Link href="/guided">take the guided day <Glyph name="arrow-up"/></Link><span>SIMULATION — SYNTHETIC CATALOG & ORDERS</span></footer>
    {notice&&<div className="toast" role="status">{notice}</div>}

    {sku&&profile&&<Modal title={panel==='delegate'?'ASSIGN COOPY':panel==='why'?'HOW I DECIDED':panel==='reviews'?'RAW EVIDENCE · UNFILTERED':panel==='review'?'THE ORIGINAL REVIEW':'A LITTLE CLOSER'} onClose={closeProduct}>
      {panel!=='verdict'&&<button className="text-button panel-back" onClick={()=>{setPanel('verdict');setProductError('');}}><Glyph name="arrow-left"/> Back to the verdict</button>}
      {productError&&<div className="sheet-error" role="alert"><p>{productError}</p>{panel==='verdict'&&<button className="text-button" onClick={()=>void openProduct(sku.id)}>Try the evidence check again</button>}</div>}
      {panel==='verdict'&&<><Art sku={sku} className="sheet-art"/><div className="sheet-product-heading"><h2>{sku.name}</h2><strong>{money(sku.price)}</strong></div><span className="delivery-pill"><Glyph name="rocket"/>{sku.delivery} · demo</span>
        {productBusy?<div className="product-thinking" role="status"><span className="busy-dot"/> looking at your story, then the evidence…</div>:<><Speech>{verdict?.clarifyingQuestion||verdict?.reason||sku.description}</Speech>{verdict?.clarifyingQuestion&&<Button secondary onClick={()=>{closeProduct();openUtility('call');}}>Tell Coopy in the call <Glyph name="mic"/></Button>}{verdict?.dissent&&<TypedDissent text={verdict.dissent}/>}</>}
        <div className="citations">{(verdict?.citations||reviewsForSku(sku.id).filter(r=>r.stars<=2).slice(0,2).map(r=>r.id)).map(id=><button key={id} onClick={()=>{setReviewId(id);setPanel('review');}}><Glyph name="arrow-up"/>{id} · {getReview(id)?.stars}<Glyph name="star"/></button>)}</div>
        <div className="journey-verdict-actions"><Button disabled={productBusy||profile.owned.some(i=>i.skuId===sku.id)} onClick={()=>{setPanel('delegate');setProductError('');}}>Let Coopy handle it <Glyph name="arrow-right"/></Button><button className="text-button" onClick={()=>setPanel('why')}>Why?</button><button className="text-button" disabled={productBusy} onClick={()=>void swapProduct()}>Swap <Glyph name="swap"/></button></div>
        <div className="verdict-quiet-actions"><button onClick={()=>setPanel('reviews')}>Read all reviews <Glyph name="arrow-right"/></button><button onClick={()=>setPanel('everything')}>See everything</button></div>
      </>}
      {panel==='why'&&<><h2 className="modal-title">Nothing behind<br/>a curtain.</h2><ol className="evaluation-ladder"><li><span>1</span><div><h3>{catalog.length} catalog products</h3><p>Only the listed attributes, prices and delivery claims enter the comparison.</p></div></li><li><span>2</span><div><h3>{eligibleCatalog(profile).length} eligible choices</h3><p>Already-owned products and sensitive categories are removed by code.</p></div></li><li><span>3</span><div><h3>Your story, with its source</h3><p>Current memories guide fit. Deleted memories are excluded from the next answer.</p></div></li><li><span>4</span><div><h3>{verdict?.citations.length||0} review IDs checked</h3><p>{verdict?'The response passed catalog and citation checks. You can read every source below.':'A live verdict has not completed. The raw review list is still available.'}</p></div></li></ol>
        {verdict?.runnerUpSkuId&&(()=>{const runner=getSku(verdict.runnerUpSkuId!);return runner?<div className="runner-up"><span className="eyebrow">THE RUNNER-UP</span><div className="product-row"><Art sku={runner}/><span><b>{runner.name}</b><small>{money(runner.price)}</small></span></div><p>{verdict.whyRunnerUpLost}</p><button className="text-button" onClick={()=>void openProduct(runner.id)}>Look closer <Glyph name="arrow-up"/></button></div>:null;})()}
        <div className="citations">{verdict?.citations.map(id=><button key={id} onClick={()=>{setReviewId(id);setPanel('review');}}><Glyph name="arrow-up"/>{id}</button>)}</div><Button secondary onClick={()=>setPanel('reviews')}>Read all reviews <Glyph name="arrow-right"/></Button><p className="evidence-caption">the AI orders the evidence — it never hides it.</p>
      </>}
      {panel==='review'&&(()=>{const review=getReview(reviewId);return review?<><ReviewRow review={review}/><Button secondary onClick={()=>setPanel('reviews')}>Read the unfiltered list <Glyph name="arrow-right"/></Button></>:<p>This review isn’t in the corpus.</p>;})()}
      {panel==='reviews'&&(()=>{const ids=[...new Set([sku.id,verdict?.runnerUpSkuId,reviewId?getReview(reviewId)?.skuId:null].filter((id):id is string=>!!id))];const rows=ids.flatMap(reviewsForSku);return <><h2 className="modal-title">All {rows.length} reviews.</h2><p className="raw-intro">Seeded demo reviews. Original order, no relevance filter, no hidden negatives.</p>{rows.map(review=><ReviewRow review={review} key={review.id}/>)}{!rows.length&&<p>No reviews are available for this product. Coopy cannot invent them.</p>}<p className="raw-end">That’s every review in the local corpus.</p><a className="text-button" href={`https://www.coupang.com/np/search?q=${encodeURIComponent(sku.aliases[0]||sku.name)}`} target="_blank" rel="noopener noreferrer">Find similar products on Coupang <Glyph name="arrow-up"/></a><p className="footnote">Opens a product search. A verified Coupang listing and its live reviews are not connected to this demo SKU.</p></>;})()}
      {panel==='everything'&&<><h2 className="modal-title">Nothing hidden.</h2><p className="raw-intro">The full catalog is always one tap away.</p><div className="evidence-catalog-list">{eligibleCatalog(profile).map(item=><button className="product-row" key={item.id} onClick={()=>void openProduct(item.id)}><Art sku={item}/><span><b>{item.name}</b><small>{item.category}</small></span><strong>{money(item.price)}</strong></button>)}</div></>}
      {panel==='delegate'&&<div className="delegation-panel"><h2 className="modal-title">leave the little<br/>things with me.</h2><div className="product-row"><Art sku={sku}/><span><b>{sku.name}</b><small>{money(sku.price)} · catalog price</small></span></div><p className="delegation-intro">Give me a limit. I’ll prepare a plan, and bring it back for your word.</p><div className="delegation-options">{([['watchPrice','Watch the price','Keep it pending if it’s above your cap. Check again when you return.'],['haggle','Try for a better price','Rehearse an offer within a code-enforced floor. No seller is contacted.'],['bundle','Bring things together','Group the delivery plan with your other pending items.'],['scheduleDelivery','Plan Rocket delivery','Keep the catalog delivery promise in the plan. Nothing is booked.']] as const).map(([key,title,detail])=><label key={key}><input type="checkbox" checked={options[key]} onChange={e=>setOptions(o=>({...o,[key]:e.target.checked}))}/><span><b>{title}</b><small>{detail}</small></span></label>)}</div><div className="delegation-budget"><label htmlFor="delegation-cap">MY LIMIT FOR THIS ITEM<strong>{money(cap)}</strong></label><input id="delegation-cap" type="range" min="0" max={Math.max(50000,Math.ceil(sku.price*1.5/1000)*1000)} step="100" value={cap} onChange={e=>setCap(Number(e.target.value))}/><p>Per item. Other pending items keep their own limits.</p></div><div className="delegation-vow"><Glyph name="lock"/><span>executes only with your approve.</span></div><Button disabled={delegating} onClick={()=>void delegate()}>{delegating?'Checking your limits…':'Take care of it, Coopy'} <Glyph name="arrow-right"/></Button><p className="footnote">Local agent plan. Negotiations and orders are simulated; no merchant integration is connected.</p></div>}
    </Modal>}
  </div>;
}
