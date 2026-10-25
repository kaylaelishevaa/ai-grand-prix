'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {Art, Button, Meta, Modal, Pet, ReviewRow, Speech, TypedDissent} from './CoupiApp';
import CompanionCall from './CompanionCall';
import LiveCallExperience from './LiveCallExperience';
import CompanionHome from './CompanionHome';
import SearchView from './SearchView';
import VerdictComparison from './VerdictComparison';
import HatchDiorama from './HatchDiorama';
import SceneDiorama from './SceneDiorama';
import SceneFallback from './SceneFallback';
import WorldHome from './WorldHome';
import WorldJournal from './WorldJournal';
import WorldCommunity from './WorldCommunity';
import WorldObjects from './WorldObjects';
import ProductFooter from './ProductFooter';
import NetworkNotice from './NetworkNotice';
import SellerQA from './SellerQA';
import {ProductEvidence} from './ProductEvidence';
import {worldTemplates,type WorldTemplate} from '@/data/world-templates';
import {Glyph} from './Glyph';
import {catalog, getReview, getSku, reviewsForSku} from '@/lib/catalog';
import {eligibleCatalog} from '@/lib/profile';
import {hasLikedProductContext,likedProductIds} from '@/lib/world-activity';
import {acceptsProfileUpdate,rebuildProductAnchors} from '@/lib/world-navigation';
import {resolveSceneKind} from '@/lib/scenes';
import {resolveSceneContext} from '@/lib/world-context';
import {getSceneMood} from '@/lib/scene-moods';
import {isDecisionLocked} from '@/lib/guardrails';
import {decisionApprovalIssue} from '@/lib/delegation-policy';
import {HOME_SCENARIOS,type HomeScenario} from '@/lib/home-feed';
import type {AskResponse, Profile, SceneResult, Verdict} from '@/lib/types';
import type {CallResponse, District, WorldResponse} from '@/lib/journey-types';
import {initialMainView,mainHref,mainLocation,type InitialMainView,type MainLocation} from './main-shell-routes';
import './journey.css';
import './main-shell.css';
import './main-polish.css';
import './main-visual.css';

type View = 'hatch' | 'home' | 'call' | 'search' | 'world' | 'district' | 'preview' | 'archive';
type Panel = 'verdict' | 'why' | 'review' | 'reviews' | 'delegate' | 'everything';
const money = (value:number) => '₩' + value.toLocaleString('en-US');
const uid = () => crypto.randomUUID();

async function api<T>(url:string, body?:unknown):Promise<T> {
  const response = await fetch(url, {method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const data = await response.json();
  if(!response.ok) throw new Error(data.error || data.message || 'That didn’t connect. Please try again.');
  return data;
}

function RoomFallback({scene,onSelect}:{scene:SceneResult;onSelect:(id:string)=>void}) {
  return <SceneFallback scene={scene} onSelect={onSelect}/>;
}

export default function JourneyApp({initialView='auto'}:{initialView?:InitialMainView}) {
  const [profile,setProfile] = useState<Profile|null>(null);
  const [view,setView] = useState<View>(initialView==='auto'?'home':initialView);
  const [status,setStatus] = useState<{offline:boolean;configured:boolean}|null>(null);
  const [hatched,setHatched] = useState(false);
  const [typedCall,setTypedCall] = useState(false);
  const [presenter,setPresenter] = useState(false);
  const [homeScenario,setHomeScenario] = useState<HomeScenario>();
  const [busy,setBusy] = useState('Waking up your companion');
  const [busySeconds,setBusySeconds] = useState(0);
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
  const [comparisonBusy,setComparisonBusy] = useState(false);
  const [productOrigin,setProductOrigin] = useState<'call'|'ask'|'scene'>('scene');
  const [productError,setProductError] = useState('');
  const [panel,setPanel] = useState<Panel>('verdict');
  const [reviewId,setReviewId] = useState('');
  const [cap,setCap] = useState(30000);
  const [options,setOptions] = useState({watchPrice:true,haggle:false,bundle:true,scheduleDelivery:true});
  const [delegating,setDelegating] = useState(false);
  const lastView = useRef<View>('home');
  const productRequest = useRef(0);
  const worldRequest = useRef<{key:string;id:string}|null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const initial = useRef(false);
  const mainScroll=useRef<HTMLElement>(null);
  const latestProfile=useRef<Profile|null>(null);
  const storeProfile = useCallback((p:Profile) => {
    if(!acceptsProfileUpdate(latestProfile.current,p))return false;
    setProfile(p);latestProfile.current=p;
    try { localStorage.setItem('coupi.live.profile.v1',JSON.stringify(p)); } catch {}
    return true;
  },[]);
  const flash = useCallback((text:string) => {setNotice(text);if(noticeTimer.current)clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setNotice(''),5500);},[]);
  const task = useCallback(async(label:string,work:()=>Promise<void>) => {
    setBusy(label);setError('');
    try {await work();} catch(e) {setError(e instanceof Error?e.message:'Please try again.');} finally {setBusy('');}
  },[]);
  useEffect(()=>{setBusySeconds(0);if(!busy)return;const started=Date.now();const timer=setInterval(()=>setBusySeconds(Math.floor((Date.now()-started)/1000)),1000);return()=>clearInterval(timer);},[busy]);

  useEffect(()=>{
    if(initial.current)return; initial.current=true;
    void task('Waking up your companion',async()=>{
      const [result,connection] = await Promise.all([api<{profile:Profile}>('/api/profile'),api<{offline:boolean;configured:boolean}>('/api/status')]);
      let p=result.profile;
      const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
      if(timezone&&timezone!==p.timezone)p=(await api<{profile:Profile}>('/api/profile',{action:'settings',timezone})).profile;
      storeProfile(p);setStatus(connection);setHatched(!!p.journey?.hatched);
      const query=new URLSearchParams(location.search);
      const scenario=HOME_SCENARIOS.find(item=>item.id===query.get('state'))?.id;
      const presenting=query.get('presenter')==='1'||!!scenario;
      setPresenter(presenting);setHomeScenario(scenario||(presenting?'normal':undefined));
      const route=mainLocation(location.pathname,location.search,initialView),next=initialMainView(route,p.journey,presenting);
      setDistrictId(route.districtId||'');setTemplateId(route.templateId||'');setArchiveId(route.archiveId||'');setMomentId(route.momentId||'');setArchivedMomentId(route.momentId||'');
      setView(next==='preview'&&!worldTemplates.some(t=>t.id===route.templateId)?'world':next);
      if(route.view==='auto'&&next!=='home')history.replaceState(null,'',mainHref(next));
    });
  },[storeProfile,task,initialView]);
  useEffect(()=>()=>{if(noticeTimer.current)clearTimeout(noticeTimer.current);},[]);
  useEffect(()=>{
    const back=()=>{const route=mainLocation(location.pathname,location.search,'auto');setView(initialMainView(route,latestProfile.current?.journey));setDistrictId(route.districtId||'');setTemplateId(route.templateId||'');setArchiveId(route.archiveId||'');setMomentId(route.momentId||'');setArchivedMomentId(route.momentId||'');setProductId(null);productRequest.current++;setError('');mainScroll.current?.scrollTo({top:0,behavior:'instant'});};
    window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);
  },[]);

  const districts=profile?.journey?.districts||[];
  const district=districts.find(d=>d.id===districtId);
  const template=worldTemplates.find(item=>item.id===templateId);
  const moment=district?.journal?.find(entry=>entry.id===momentId);
  const districtScene=moment?.scene||district?.scene;
  const archives=profile?.journey?.archivedJournals||[];
  const archive=archives.find(item=>item.id===archiveId);
  const archivedMoment=archive?.entries.find(entry=>entry.id===archivedMomentId)||archive?.entries.at(-1);
  const activeScene=view==='preview'?template?.scene:view==='district'?districtScene:view==='archive'?archivedMoment?.scene:undefined;
  const scenicKind=activeScene?resolveSceneKind(activeScene):undefined;
  const scenicContext=activeScene?resolveSceneContext(activeScene):undefined;
  const scenicMood=scenicKind?getSceneMood(scenicKind,scenicContext):undefined;
  const contextName=view==='preview'?template?.name:view==='district'?district?.name:undefined;
  const pending=profile?.decisions.filter(d=>!d.approvedAt)||[];
  const sku=productId?getSku(productId):undefined;
  const rehearsal=profile?.rehearsalClock||(profile?.pretend2am?'night':null);
  const phase=rehearsal==='night'?'night':view==='hatch'?'dawn':view==='call'?'store':'noon';
  const productDecision=sku?profile?.decisions.find(item=>item.skuId===sku.id&&!item.approvedAt):undefined;
  const approvedDecision=sku?profile?.decisions.find(item=>item.skuId===sku.id&&!!item.approvedAt):undefined;
  const productOwned=!!sku&&!!profile?.owned.some(item=>item.skuId===sku.id);

  function changeView(next:View,detail:Omit<MainLocation,'view'>={}) {
    const href=mainHref(next,{districtId,templateId,archiveId,momentId:next==='archive'?archivedMomentId:momentId,...detail});
    if(location.pathname+location.search!==href)history.pushState(null,'',href);
    setView(next);setError('');mainScroll.current?.scrollTo({top:0,behavior:'instant'});
  }
  function openUtility(next:'call') {setTypedCall(false);if(view!==next){lastView.current=view;changeView(next);}}
  function closeUtility() {changeView(lastView.current==='call'?'home':lastView.current);}
  function closeProduct() {productRequest.current++;setProductId(null);setProductError('');setProductBusy(false);setComparisonBusy(false);}
  async function hatch() {
    if(busy||hatched)return;
    setHatched(true);
    if(profile?.journey?.hatched)return;
    await task('A little hello',async()=>{const result=await api<CallResponse>('/api/call',{action:'hatch',requestId:uid()});storeProfile(result.profile);});
  }
  async function makeWorld(text?:string,rebuildId?:string,enterNew=false,selection?:{selectedSkuIds:string[];avoidSkuIds?:string[]}) {
    if(busy)return;
    const selectedSkuIds=selection?.selectedSkuIds||rebuildProductAnchors(profile,rebuildId),avoidSkuIds=selection?.avoidSkuIds||[];
    const profileId=latestProfile.current?.id;
    const key=JSON.stringify([text?.trim()||'',rebuildId||'',selectedSkuIds,avoidSkuIds]);
    if(worldRequest.current?.key!==key)worldRequest.current={key,id:uid()};
    await task(rebuildId?'Making room for a new feeling':districts.length?'Growing your world':'Building a world from your story',async()=>{
      const result=await api<WorldResponse>('/api/world',{requestId:worldRequest.current!.id,...(text?.trim()?{command:text.trim()}:{}),...(rebuildId?{districtId:rebuildId}:{}),...(selectedSkuIds.length?{selectedSkuIds}:{}),...(avoidSkuIds.length?{avoidSkuIds}:{})});
      if(latestProfile.current?.id!==profileId||result.profile.id!==profileId||!acceptsProfileUpdate(latestProfile.current,result.profile))throw new Error('Your preferences changed while I was building. Try again from your current profile.');
      worldRequest.current=null;
      storeProfile(result.profile);setCommand('');setRebuild('');setMomentId('');
      if(enterNew){const added=result.districts.at(-1);if(added){setDistrictId(added.id);setPersonalWords('');changeView('district',{districtId:added.id,momentId:''});}}
    });
  }
  function completeCall(updated?:Profile) {if(updated)storeProfile(updated);changeView('world');if(!(updated?.journey?.districts||districts).length)void makeWorld();}
  function enterDistrict(d:District) {setDistrictId(d.id);setRebuild('');setMomentId('');changeView('district',{districtId:d.id,momentId:''});}
  function previewWorld(t:WorldTemplate) {setTemplateId(t.id);setPersonalWords('');changeView('preview',{templateId:t.id});}
  const nextDistrict=district?districts[districts.findIndex(item=>item.id===district.id)+1]:undefined;
  const nextTemplate=template?worldTemplates[worldTemplates.findIndex(item=>item.id===template.id)+1]:undefined;

  async function openProduct(id:string,existing?:Verdict) {
    const item=getSku(id);if(!item)return;
    const sequence=++productRequest.current;
    setComparisonBusy(false);setProductOrigin(view==='call'?'call':view==='search'?'ask':'scene');setProductId(id);setPanel('verdict');setReviewId('');setVerdict(existing||null);setProductError('');setCap(item.price);setOptions({watchPrice:true,haggle:false,bundle:true,scheduleDelivery:true});
    const savedPlan=profile?.decisions.find(decision=>decision.skuId===id&&!decision.approvedAt)?.delegation;
    if(savedPlan){setCap(savedPlan.budgetCap);setOptions({watchPrice:savedPlan.watchPrice,haggle:savedPlan.haggle,bundle:savedPlan.bundle,scheduleDelivery:savedPlan.scheduleDelivery});}
    if(existing||profile?.owned.some(owned=>owned.skuId===id)){setProductBusy(false);return;}
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
  async function delegate() {
    if(!sku||delegating||comparisonBusy||productBusy||verdict?.clarifyingQuestion)return;
    setDelegating(true);setProductError('');
    try {
      const result=await api<{profile:Profile;blocked?:string}>('/api/delegate',{action:'assign',skuId:sku.id,budgetCap:cap,...options,source:contextName?`${view==='preview'?'the suggested':'your'} ${contextName} world`:view==='search'?'your search':'your call'});
      storeProfile(result.profile);
      if(result.blocked){setProductError(result.blocked);return;}
      setPanel('verdict');flash('i’ll take it from here. your yes is still the last step.');
    }catch(e){setProductError(e instanceof Error?e.message:'Please try again.');}finally{setDelegating(false);}
  }
  async function updateProductPlan(action:'approve'|'refresh'|'remove') {
    if(!productDecision||delegating||comparisonBusy||productBusy)return;
    const sequence=productRequest.current;
    setDelegating(true);setProductError('');
    try {
      const result=await api<{profile:Profile;blocked?:string|string[];approved?:string[]}>(action==='refresh'?'/api/delegate':'/api/decisions',action==='approve'?{action,ids:[productDecision.id]}:{action,id:productDecision.id});
      storeProfile(result.profile);
      const blocked=Array.isArray(result.blocked)?result.blocked.join(' '):result.blocked;
      if(blocked){if(sequence===productRequest.current)setProductError(blocked);return;}
      if(action==='approve'&&result.approved?.length)flash('approved by you. i’ll remember you have this.');
      if(action==='remove')flash('put down. nothing bought.');
      if(action==='refresh')flash('checked against the current demo catalog.');
    }catch(e){if(sequence===productRequest.current)setProductError(e instanceof Error?e.message:'Please try again.');}finally{setDelegating(false);}
  }
  function renderProductPlan() {
    if(!sku||!profile)return null;
    if(approvedDecision)return <section className="runner-up" aria-label="Your approval receipt"><span className="eyebrow">APPROVED BY YOU</span><div className="product-row"><Glyph name="check"/><span><b>{sku.name}</b><small>{new Date(approvedDecision.approvedAt!).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</small></span><strong>{money(approvedDecision.delegation?.quotedPrice??sku.price)}</strong></div><p>now part of your world. i won’t suggest buying it again.</p><p className="footnote">Saved in your local approval ledger. No merchant order or payment was placed.</p></section>;
    if(productOwned)return <section className="runner-up"><span className="eyebrow">ALREADY IN YOUR WORLD</span><p>one is enough. you already have this.</p></section>;
    if(!productDecision)return null;
    const locked=isDecisionLocked(profile,productDecision),job=productDecision.delegation,issue=decisionApprovalIssue(productDecision);
    return <section className="runner-up" aria-label="Coopy's pending plan" aria-live="polite"><span className="eyebrow">COOPY’S PLAN / YOUR WORD COMES NEXT</span><div className="decision-statuses">{locked&&<span className="status-chip status-night"><Glyph name="moon"/> sleep on it · 07:00</span>}<span className={`status-chip status-${job?.status||'ready'}`}>{job?.status==='watching'?'watching…':job?.status==='haggled'?`haggled −${money(job.discount)} · simulated`:'ready for your approval'}</span></div><div className="product-row"><span><b>{sku.name}</b><small>{job?`your cap ${money(job.budgetCap)}`:'your call, kept here until you decide'}</small></span><strong>{money(job?.quotedPrice??sku.price)}</strong></div>{locked&&<p className="lock-note">it’s late. i’ll hold this until 7am. morning-you gets a vote.</p>}{issue&&<p className="footnote">{issue}</p>}{job?.deliveryPlan&&<p className="delegation-detail">{job.deliveryPlan}{job.bundle&&job.bundledDecisionIds.length?` · grouped with ${job.bundledDecisionIds.length} other pending item${job.bundledDecisionIds.length===1?'':'s'}`:''}</p>}<div className="sheet-actions"><Button disabled={delegating||productBusy||comparisonBusy||locked||!!issue} onClick={()=>location.assign('/checkout?items='+encodeURIComponent(productDecision.id))}>{delegating?'Checking your limits…':'Review checkout'} <Glyph name="check"/></Button>{job?.status==='watching'&&<Button secondary disabled={delegating||comparisonBusy} onClick={()=>void updateProductPlan('refresh')}>Check now</Button>}<Button secondary disabled={delegating||comparisonBusy} onClick={()=>{setPanel('delegate');setProductError('');}}>Adjust the plan</Button><Button secondary disabled={delegating||comparisonBusy} onClick={()=>void updateProductPlan('remove')}>Let it go</Button></div><p className="footnote">Executes only with your approval. This is a local plan; negotiation, delivery booking and payment are simulated.{pending.length>1?` ${pending.length-1} other proposal${pending.length===2?' is':'s are'} kept with their products.`:''}</p></section>;
  }


  return <div className="coupi-main-page"><div className="app-shell journey-shell coupi-main-frame" data-view={view} data-phase={phase} data-scene-kind={scenicKind} data-scene-setting={scenicContext?.setting} data-modal={productId?'open':'closed'} data-navigation="main" data-call-interface={!typedCall&&!status?.offline?'video':'text'}>
    <header className="main-shell-header">
      <div className="main-shell-top"><a className="main-shell-brand" href="/home" aria-label="Coupi home"><img src="/main-shell/coupi.png" alt="" width="36" height="36"/><span>coupi</span></a><nav className="main-shell-actions" aria-label="Search, plans and account"><Link href="/search" aria-label="Search" aria-current={view==='search'?'page':undefined}><Glyph name="search"/></Link><Link href="/account" aria-label="Settings"><Glyph name="user"/></Link><Link href="/decisions" aria-label="Decisions"><Glyph name="box"/>{pending.length>0&&<span>{pending.length}</span>}</Link></nav></div>
      {view!=='home'&&view!=='call'&&<h1>{view==='hatch'?'Meet Coopy':view==='search'?'Search':'Explore'}</h1>}
    </header>
    <main ref={mainScroll} className={`journey-main journey-${view} main-shell-content`} aria-label={view==='world'?'Explore':view==='home'?'Home':view==='call'?'Call':view==='search'?'Search':'Your world'}>
      <NetworkNotice/>
      {busy&&<div className="busy-banner" role="status"><span className="busy-dot"/>{busy}{busySeconds>=5&&<span aria-hidden="true"> · {Math.floor(busySeconds/60)}:{String(busySeconds%60).padStart(2,'0')}</span>}<span className="shimmer"/></div>}
      {error&&<div className="error-banner" role="alert"><b>one little pause.</b><p>{error}</p><button aria-label="Dismiss error" onClick={()=>setError('')}><Glyph name="close"/></button></div>}
      {!profile&&!busy&&<div className="empty-state"><Pet/><h2>Let’s reconnect.</h2><Button secondary onClick={()=>location.reload()}>Try again</Button></div>}

      {profile&&view==='hatch'&&<section className="hatch-chapter screen-surface">
        <div className="hatch-copy"><p className="eyebrow orange">01 / A SMALL BEGINNING</p><h1>{hatched?<>oh, hello.<br/>i’m Coopy.</>:<>a little someone,<br/><em>just for you.</em></>}</h1>
          {hatched?<><p className="hatch-invitation">Before I show you anything — can I call you? I’d rather hear your story than show you a catalog.</p><Button disabled={!!busy} onClick={()=>changeView('call')}>Let’s talk <Glyph name="arrow-right"/></Button><p className="hatch-reassurance">five little questions. your voice, or your words.</p></>:<><p>Something’s about to become your person.<br/>Tap the egg. Start with a hello.</p><Button secondary disabled={!!busy} onClick={()=>void hatch()}>Tap to hatch <Glyph name="spark"/></Button></>}
        </div>
        <div className="hatch-world"><span className="hatch-orbit orbit-a"/><span className="hatch-orbit orbit-b"/><HatchDiorama hatched={hatched} onHatch={()=>void hatch()} phase="dawn" fallback={<button className="intro-egg" disabled={hatched||!!busy} onClick={()=>void hatch()} aria-label="Tap to hatch Coopy">{hatched?<Pet size="large"/>:<span className="egg-shape"/>}</button>}/><span className="hatch-coordinates">YOUR WORLD / NOT YET WRITTEN</span></div>
      </section>}

      <LiveCallExperience profile={profile} visible={view==='call'&&!typedCall&&!status?.offline} onProfile={storeProfile} onClose={closeUtility} onType={()=>setTypedCall(true)} onComplete={completeCall} onOpenProduct={(id,v,review)=>{void openProduct(id,v);if(review){setReviewId(review);setPanel('review');}}}/>
      {profile&&view==='call'&&(typedCall||status?.offline)&&<CompanionCall profile={profile} offline={status?.offline} onProfile={storeProfile} onComplete={completeCall} onOpenProduct={(id,v)=>void openProduct(id,v)} onClose={closeUtility}/>}

      {profile&&view==='home'&&<CompanionHome profile={profile} offline={status?.offline} presenter={presenter} initialScenario={homeScenario} onCall={()=>openUtility('call')} onExplore={()=>changeView('world')} onOpenProduct={id=>void openProduct(id)}/>}
      {profile&&view==='search'&&<SearchView profile={profile} onProfile={storeProfile} offline={status?.offline} onOpenProduct={(id,result)=>void openProduct(id,result)}/>}

      {profile&&view==='world'&&<WorldHome profile={profile} compactLayout districts={districts} archives={archives} phase={phase} busy={!!busy} complete={!!profile.journey?.interviewComplete||hasLikedProductContext(profile)} command={command} onCommand={setCommand} onCreate={text=>void makeWorld(text,undefined,!!text,!profile.journey?.interviewComplete?{selectedSkuIds:likedProductIds(profile).slice(0,3)}:undefined)} onEnter={enterDistrict} onPreview={previewWorld} onCall={()=>changeView('call')} onArchive={(id,entryId)=>{setArchiveId(id);setArchivedMomentId(entryId);changeView('archive',{archiveId:id,momentId:entryId});}}/>}

      {profile&&view==='archive'&&(archive&&archivedMoment?<section className="district-detail screen-surface"><button className="text-button" onClick={()=>changeView('world')}><Glyph name="arrow-left"/> Your world</button><div className="district-heading"><div><p className="eyebrow orange">KEPT MOMENTS / YOUR OWN WORDS</p><h1>{archivedMoment.districtName}</h1><p>{new Date(archivedMoment.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})} · a room, just as you kept it</p></div></div><div className="moment-return"><span>This world’s recommendations were cleared when you changed your memory.<br/>Your diary remains. It doesn’t enter Coopy’s AI memory.</span></div><div className="full-district"><SceneDiorama scene={archivedMoment.scene} phase={phase} onSelect={id=>void openProduct(id)} fallback={<RoomFallback scene={archivedMoment.scene} onSelect={id=>void openProduct(id)}/>}/><div className="district-scene-note"><span>SAVED ROOM / Product details use the current demo catalog.</span></div></div><p className="moment-note">{archivedMoment.text}</p><WorldJournal key={archive.id} district={{id:archive.id,name:archive.name,scene:archivedMoment.scene,createdAt:archivedMoment.createdAt,sourceMemoryIds:[],provenance:'from your saved diary',journal:archive.entries}} readOnly archived onProfile={storeProfile} onVisit={id=>{setArchivedMomentId(id);changeView('archive',{archiveId:archive.id,momentId:id});}}/></section>:<div className="empty-state"><h2>That moment has been put away.</h2><Button secondary onClick={()=>changeView('world')}>Back to your world</Button></div>)}

      {profile&&view==='preview'&&template&&<section className="world-preview screen-surface">
        <button className="text-button" onClick={()=>changeView('world')}><Glyph name="arrow-left"/> Your world</button>
        <div className="world-preview-heading"><div><p className="eyebrow orange">{scenicMood?.time} / A WORLD TO EXPLORE</p><h1>{template.name}</h1></div><p>{template.description}</p></div>
        <div className="full-district"><SceneDiorama scene={template.scene} phase={phase} onSelect={id=>void openProduct(id)} fallback={<RoomFallback scene={template.scene} onSelect={id=>void openProduct(id)}/>}/><div className="world-preview-note"><span>Tap a light to meet the object. Or browse them below.</span><span>CURATED WORLD / MAKE YOUR OWN VERSION</span></div></div>
        <WorldObjects scene={template.scene} onSelect={id=>void openProduct(id)}/>
        <WorldCommunity key={'template:'+template.id} profile={profile} worldId={'template:'+template.id} onProfile={storeProfile} disabled={!!busy} onBuild={(selectedSkuIds,avoidSkuIds)=>void makeWorld(`Create a new version of ${template.name}, built around my selected products with a different bundle. ${personalWords.trim()||template.prompt}`,undefined,true,{selectedSkuIds,avoidSkuIds})}/>
        <form className="world-personalize" onSubmit={e=>{e.preventDefault();void makeWorld(template.prompt+(personalWords.trim()?` My own words: ${personalWords.trim()}`:''),undefined,true);}}><div><h2>Same beginning.<br/>Your own story.</h2><p>{template.journalPrompt} Make a version that fits you, then keep your moments inside it.</p></div><div><label htmlFor="personal-world-words">WHAT WOULD MAKE THIS FEEL LIKE YOU? · OPTIONAL</label><textarea id="personal-world-words" value={personalWords} onChange={e=>setPersonalWords(e.target.value)} maxLength={600} placeholder="Your occasion, your mood, your little details…"/><Button type="submit" disabled={!!busy||!profile.journey?.interviewComplete}>Make it mine <Glyph name="arrow-right"/></Button><p>{profile.journey?.interviewComplete?'Coopy will rebuild it from your words, current memory and budget.':'Share a little about yourself in Call, or save a product above to start from something you like.'}</p>{!profile.journey?.interviewComplete&&<button type="button" className="text-button" onClick={()=>openUtility('call')}>Tell Coopy about me <Glyph name="arrow-right"/></button>}</div></form>
        <nav className="scene-journey-links" aria-label="Continue your journey"><span>ANOTHER TURN IN THE PATH</span><button onClick={()=>nextTemplate?previewWorld(nextTemplate):changeView('world')}>{nextTemplate?nextTemplate.name:'Back to your world'}<Glyph name="arrow-right"/></button></nav>
      </section>}

      {profile&&view==='district'&&(district?<section className="district-detail screen-surface">
        <button className="text-button" onClick={()=>changeView('world')}><Glyph name="arrow-left"/> Your world</button>
        <div className="district-heading"><div><p className="eyebrow orange">{districtScene?.blueprint?.atmosphere.timeLabel||scenicMood?.time} / {districtScene?.blueprint?'IMAGINED FROM YOUR STORY':scenicMood?.label}</p><h1>{moment?.districtName||district.name}</h1><p>{moment?`a moment kept on ${new Date(moment.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}`:district.provenance}</p></div></div>
        {moment&&<div className="moment-return"><span>THEN / YOUR SAVED ROOM<br/>Product details still show the current demo catalog.</span><button onClick={()=>{setMomentId('');changeView('district',{districtId:district.id,momentId:''});}}>Back to now <Glyph name="arrow-right"/></button></div>}
        <div className="full-district"><SceneDiorama scene={districtScene!} phase={phase} onSelect={id=>void openProduct(id)} fallback={<RoomFallback scene={districtScene!} onSelect={id=>void openProduct(id)}/>}/><div className="district-scene-note"><span>Tap a light to meet the object. Or browse them below.</span><span>{districtScene!.blueprint?'BUILT FROM YOUR WORDS':'YOUR OWN WORLD'} / {districtScene!.items.length} objects</span></div></div>
        <WorldObjects scene={districtScene!} onSelect={id=>void openProduct(id)}/>
        {moment&&<p className="moment-note">{moment.text}</p>}
        {!moment&&<WorldCommunity key={'district:'+district.id} profile={profile} worldId={'district:'+district.id} onProfile={storeProfile} disabled={!!busy} onBuild={(selectedSkuIds,avoidSkuIds)=>void makeWorld(`A new interpretation of ${district.name}, keeping my selected products and trying a different bundle. ${rebuild.trim()}`,undefined,true,{selectedSkuIds,avoidSkuIds})}/>}
        {!moment&&<form className="district-rebuild" onSubmit={e=>{e.preventDefault();void makeWorld(rebuild,district.id);}}><Glyph name="spark"/><input aria-label="Change this district" value={rebuild} onChange={e=>setRebuild(e.target.value)} maxLength={1000} placeholder="Change the feeling. Or tell me what’s missing…"/><Button secondary type="submit" disabled={!!busy||!rebuild.trim()}>Reimagine <Glyph name="arrow-up"/></Button></form>}
        <p className="district-explanation">{districtScene!.explanation}</p>
        <WorldJournal key={district.id} district={district} readOnly={!!moment} onProfile={storeProfile} onVisit={id=>{setMomentId(id);changeView('district',{districtId:district.id,momentId:id});}}/>
        <nav className="scene-journey-links" aria-label="Continue your journey"><span>{nextDistrict?'A LITTLE FURTHER ALONG':'A GOOD PLACE TO PAUSE'}</span><button onClick={()=>nextDistrict?enterDistrict(nextDistrict):changeView('world')}>{nextDistrict?nextDistrict.name:'Back to your world'}<Glyph name="arrow-right"/></button></nav>
      </section>:<div className="empty-state"><h2>This little world has moved.</h2><Button secondary onClick={()=>changeView('world')}>Back to your world</Button></div>)}


      {view!=='call'&&<div className="main-shell-footer"><ProductFooter/><Link href="/guided">Guided day <Glyph name="arrow-up"/></Link></div>}
    </main>
    <nav className="main-shell-nav" aria-label="Main navigation">
      <a href="/home" aria-current={view==='home'?'page':undefined}><Glyph name="home"/><span>Home</span></a>
      <a href="/call" aria-current={view==='call'?'page':undefined}><svg viewBox="0 0 24 24" className="glyph" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="5" width="12" height="14" rx="4"/><path d="m15 9 6-3v12l-6-3"/></svg><span>Call</span></a>
      <a href="/explore" aria-current={['world','district','preview','archive'].includes(view)?'page':undefined}><svg viewBox="0 0 24 24" className="glyph" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c5 4 5 12 0 16-5-4-5-12 0-16Z"/></svg><span>Explore</span></a>
    </nav>
    {notice&&<div className="toast" role="status">{notice}</div>}

    {sku&&profile&&<Modal title={panel==='delegate'?'ASSIGN COOPY':panel==='why'?'HOW I DECIDED':panel==='reviews'?'RAW EVIDENCE · UNFILTERED':panel==='review'?'THE ORIGINAL REVIEW':'A LITTLE CLOSER'} onClose={closeProduct}>
      {panel!=='verdict'&&<button className="text-button panel-back" onClick={()=>{setPanel('verdict');setProductError('');}}><Glyph name="arrow-left"/> Back to the verdict</button>}
      {productError&&<div className="sheet-error" role="alert"><p>{productError}</p>{panel==='verdict'&&<button className="text-button" onClick={()=>void openProduct(sku.id)}>Try the evidence check again</button>}</div>}
      {panel==='verdict'&&<><Art sku={sku} className="sheet-art"/><div className="sheet-product-heading"><h2>{sku.name}</h2><strong>{money(sku.price)}</strong></div><span className="delivery-pill"><Glyph name={sku.facts.deliveryStatus==='unknown'?'clock':'rocket'}/>{sku.delivery}{sku.origin==='coupang-reference'?'':' · demo'}</span><ProductEvidence sku={sku}/>
        {productBusy?<div className="product-thinking" role="status"><span className="busy-dot"/> looking at your story, then the evidence…</div>:<><Speech>{verdict?.clarifyingQuestion||verdict?.reason||sku.description}</Speech>{verdict?.clarifyingQuestion&&<Button secondary onClick={()=>{closeProduct();openUtility('call');}}>Tell Coopy in the call <Glyph name="mic"/></Button>}{verdict?.dissent&&<TypedDissent text={verdict.dissent}/>}</>}
        <SellerQA skuId={sku.id}/><div className="citations">{(verdict?.citations||reviewsForSku(sku.id).filter(r=>r.stars<=2).slice(0,2).map(r=>r.id)).map(id=><button key={id} onClick={()=>{setReviewId(id);setPanel('review');}}><Glyph name="arrow-up"/>{id} · {getReview(id)?.stars}<Glyph name="star"/></button>)}</div>
        <VerdictComparison profile={profile} pickSkuId={sku.id} verdict={verdict} origin={productOrigin} disabled={productBusy||comparisonBusy||delegating||productOwned} onBusyChange={setComparisonBusy} onChange={(next,p)=>{productRequest.current++;setComparisonBusy(false);storeProfile(p);setProductId(next.pickSkuId);setVerdict(next);setCap(getSku(next.pickSkuId!)!.price);setProductError('');setPanel('verdict');flash('new pick, honest trade-off. i remembered your choice.');}}/>
        {renderProductPlan()}<div className="journey-verdict-actions">{!productDecision&&!productOwned&&<Button disabled={productBusy||comparisonBusy||delegating||!!verdict?.clarifyingQuestion} onClick={()=>{setPanel('delegate');setProductError('');}}>Let Coopy handle it <Glyph name="arrow-right"/></Button>}<button className="text-button" disabled={comparisonBusy} onClick={()=>setPanel('why')}>Why?</button></div>
        <div className="verdict-quiet-actions"><button onClick={()=>setPanel('reviews')}>Read all reviews <Glyph name="arrow-right"/></button><button onClick={()=>setPanel('everything')}>See everything</button></div>
      </>}
      {panel==='why'&&<><h2 className="modal-title">Nothing behind<br/>a curtain.</h2><ol className="evaluation-ladder"><li><span>1</span><div><h3>{catalog.length} catalog products</h3><p>Only the listed attributes, prices and delivery claims enter the comparison.</p></div></li><li><span>2</span><div><h3>{eligibleCatalog(profile).length} eligible choices</h3><p>Already-owned products and sensitive categories are removed by code.</p></div></li><li><span>3</span><div><h3>Your story, with its source</h3><p>Current memories guide fit. Deleted memories are excluded from the next answer.</p></div></li><li><span>4</span><div><h3>{verdict?.citations.length||0} review IDs checked</h3><p>{verdict?'The response passed catalog and citation checks. You can read every source below.':'A live verdict has not completed. The raw review list is still available.'}</p></div></li></ol>
        {verdict?.runnerUpSkuId&&(()=>{const runner=getSku(verdict.runnerUpSkuId!);return runner?<div className="runner-up"><span className="eyebrow">THE RUNNER-UP</span><div className="product-row"><Art sku={runner}/><span><b>{runner.name}</b><small>{money(runner.price)}</small></span></div><p>{verdict.whyRunnerUpLost}</p><button className="text-button" onClick={()=>setPanel('verdict')}>Compare the contenders <Glyph name="swap"/></button></div>:null;})()}
        <div className="citations">{verdict?.citations.map(id=><button key={id} onClick={()=>{setReviewId(id);setPanel('review');}}><Glyph name="arrow-up"/>{id}</button>)}</div><Button secondary onClick={()=>setPanel('reviews')}>Read all reviews <Glyph name="arrow-right"/></Button><p className="evidence-caption">the AI orders the evidence — it never hides it.</p>
      </>}
      {panel==='review'&&(()=>{const review=getReview(reviewId);return review?<><ReviewRow review={review}/><Button secondary onClick={()=>setPanel('reviews')}>Read the unfiltered list <Glyph name="arrow-right"/></Button></>:<p>This review isn’t in the corpus.</p>;})()}
      {panel==='reviews'&&(()=>{const ids=[...new Set([sku.id,verdict?.runnerUpSkuId,reviewId?getReview(reviewId)?.skuId:null].filter((id):id is string=>!!id))];const rows=ids.flatMap(reviewsForSku);return <><h2 className="modal-title">All {rows.length} reviews.</h2><p className="raw-intro">{sku.origin==='coupang-reference'?'No customer reviews have been imported for this reference.':'Seeded demo reviews. Original order, no relevance filter, no hidden negatives.'}</p>{rows.map(review=><ReviewRow review={review} key={review.id}/>)}{!rows.length&&<p>No reviews are available for this product. Coopy cannot invent them.</p>}<p className="raw-end">That’s every review in the local corpus.</p><a className="text-button" href={sku.sourceUrl||`https://www.coupang.com/np/search?q=${encodeURIComponent(sku.aliases[0]||sku.name)}`} target="_blank" rel="noopener noreferrer">{sku.sourceUrl?'Open original Coupang listing':'Find similar products on Coupang'} <Glyph name="arrow-up"/></a><p className="footnote">{sku.sourceUrl?'Opens the original listing. Check current reviews, price and delivery there.':'Opens a product search. Live reviews are not connected to this demo SKU.'}</p></>;})()}
      {panel==='everything'&&<><h2 className="modal-title">Nothing hidden.</h2><p className="raw-intro">The full catalog is always one tap away.</p><div className="evidence-catalog-list">{eligibleCatalog(profile).map(item=><button className="product-row" key={item.id} onClick={()=>void openProduct(item.id)}><Art sku={item}/><span><b>{item.name}</b><small>{item.category}</small></span><strong>{money(item.price)}</strong></button>)}</div></>}
      {panel==='delegate'&&<div className="delegation-panel"><h2 className="modal-title">leave the little<br/>things with me.</h2><div className="product-row"><Art sku={sku}/><span><b>{sku.name}</b><small>{money(sku.price)} · {sku.priceBasis==='historical-reference'?'historical reference price':'catalog price'}</small></span></div><p className="delegation-intro">Give me a limit. I’ll prepare a plan, and bring it back for your word.</p><div className="delegation-options">{([['watchPrice','Watch the price','Keep it pending if it’s above your cap. Check again when you return.'],['haggle','Try for a better price','Rehearse an offer within a code-enforced floor. No seller is contacted.'],['bundle','Bring things together','Group the delivery plan with your other pending items.'],['scheduleDelivery','Plan the delivery','Keep any listed delivery information in the plan. Unknown timing stays unknown; nothing is booked.']] as const).map(([key,title,detail])=><label key={key}><input type="checkbox" checked={options[key]} onChange={e=>setOptions(o=>({...o,[key]:e.target.checked}))}/><span><b>{title}</b><small>{detail}</small></span></label>)}</div><div className="delegation-budget"><label htmlFor="delegation-cap">MY LIMIT FOR THIS ITEM<strong>{money(cap)}</strong></label><input id="delegation-cap" type="range" min="0" max={Math.max(50000,Math.ceil(sku.price*1.5/1000)*1000)} step="100" value={cap} onChange={e=>setCap(Number(e.target.value))}/><p>Per item. Other pending items keep their own limits.</p></div><div className="delegation-vow"><Glyph name="lock"/><span>executes only with your approve.</span></div><Button disabled={delegating||comparisonBusy||productBusy||productOwned||!!verdict?.clarifyingQuestion} onClick={()=>void delegate()}>{delegating?'Checking your limits…':'Take care of it, Coopy'} <Glyph name="arrow-right"/></Button><div className="product-inline-links"><Link href="/terms#delegation">Delegation Terms</Link><Link href="/permissions">Your permissions</Link><Link href="/decisions">All your plans</Link></div><p className="footnote">Local agent plan. Negotiations and orders are simulated; no merchant integration is connected.</p></div>}
    </Modal>}
  </div></div>;
}
