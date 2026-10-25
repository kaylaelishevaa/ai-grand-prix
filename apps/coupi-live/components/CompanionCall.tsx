'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {getReview, getSku} from '@/lib/catalog';
import type {CallResponse} from '@/lib/journey-types';
import type {Profile, Verdict} from '@/lib/types';
import {safePersonalizationCandidates,type PersonalizationResponse,type PersonalizationReview} from '@/lib/personalization';
import {Glyph} from './Glyph';
import {ProductVisual,ProductEvidence} from './ProductEvidence';
import VerdictComparison from './VerdictComparison';
import SellerQA from './SellerQA';
import FirstCallReview from './FirstCallReview';
import './companion-call.css';

interface CompanionCallProps {
  profile: Profile;
  offline?: boolean;
  onProfile(profile: Profile): void;
  onComplete(profile?: Profile): void;
  onOpenProduct(skuId: string, verdict?: Verdict): void;
  onClose(): void;
}
interface TranscriptTurn {
  id: string;
  role: 'you' | 'coopy';
  text: string;
  photo?: boolean;
  response?: CallResponse;
}
interface VoiceResult {isFinal: boolean; 0: {transcript: string};}
interface BrowserRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: {results: ArrayLike<VoiceResult>}) => void) | null;
  onerror: ((event: {error: string}) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type VoiceWindow = Window & {SpeechRecognition?: new () => BrowserRecognition; webkitSpeechRecognition?: new () => BrowserRecognition;};
const money = (value: number) => '₩' + value.toLocaleString('en-US');
const MAX_PHOTO = 8_000_000;

function CallPet({speaking, listening}: {speaking: boolean; listening: boolean}) {
  return <div className={`call-presence ${speaking ? 'is-speaking' : ''} ${listening ? 'is-listening' : ''}`}>
    <span className="call-presence-orbit orbit-a"/><span className="call-presence-orbit orbit-b"/>
    <span className="pet pet-large" role="img" aria-label="Coopy, your animated teal companion"><span className="pet-eyes"><i/><i/></span><span className="pet-cheeks"/><span className="pet-mouth"/></span>
    <span className="call-presence-shadow"/>
  </div>;
}

function VoiceGlyph({muted}: {muted: boolean}) {
  return <svg className="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m11 4-6 5H2v6h3l6 5Z"/>{muted ? <path d="m16 9 6 6m0-6-6 6"/> : <><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></>}</svg>;
}

/** One conversation surface. Intent is resolved by the server from words, context and an optional frame. */
export default function CompanionCall(props: CompanionCallProps) {
  const callbacks = useRef(props); callbacks.current = props;
  const currentProfile=useRef(props.profile);
  if(props.profile.id!==currentProfile.current.id||props.profile.revision>=currentProfile.current.revision)currentProfile.current=props.profile;
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [latest, setLatest] = useState<CallResponse | null>(null);
  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [busy, setBusy] = useState(true);
  const [comparisonBusy, setComparisonBusy] = useState(false);
  const comparisonPending = useRef(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState<PersonalizationReview | null>(null);
  const [reviewError, setReviewError] = useState('');
  const personalizationDraftId = useRef(props.profile.journey?.personalizationDraft?.id);
  const reviewAutoOpened = useRef(false);
  const confirmAttempt = useRef<{fingerprint:string;id:string}|null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraPending, setCameraPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mounted = useRef(false), busyRef = useRef(false), voiceOnRef = useRef(true), draftRef = useRef('');
  const request = useRef<AbortController | null>(null);
  const callEpoch=useRef(0);
  const recognition = useRef<BrowserRecognition | null>(null);
  const stream = useRef<MediaStream | null>(null), cameraGeneration = useRef(0);
  const video = useRef<HTMLVideoElement | null>(null), fileInput = useRef<HTMLInputElement>(null);
  const transcript = useRef<HTMLDivElement>(null), composer = useRef<HTMLTextAreaElement>(null);
  const attempt = useRef<{fingerprint: string; id: string} | null>(null);
  const interviewAttempt = useRef<{action:'resumeInterview'|'finishInterview';id:string}|null>(null);
  const voiceEpoch = useRef(0);
  draftRef.current = draft;
  voiceOnRef.current = voiceOn;
  const activeDraft = currentProfile.current.journey?.personalizationDraft;
  const count = activeDraft?.answerCount ?? latest?.interviewCount ?? props.profile.journey?.interviewCount ?? 0;
  const complete = latest?.interviewComplete ?? props.profile.journey?.interviewComplete ?? false;
  const paused = !complete&&(latest?.profile.journey?.interviewPaused??props.profile.journey?.interviewPaused??false);
  const mode = latest?.conversationMode ?? (complete||paused?'conversation':'interview');
  const worldReady = latest?.worldReady ?? false;
  const rememberedIds = new Set(props.profile.memoryLines.map(line => line.id));
  const newMemories = activeDraft ? safePersonalizationCandidates(currentProfile.current,activeDraft) : turns.flatMap(turn => turn.response?.memories || []).filter((line, index, all) => rememberedIds.has(line.id) && all.findIndex(other => other.id === line.id) === index);

  function stopSpeech() {
    voiceEpoch.current++;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    if (mounted.current) setSpeaking(false);
  }
  function stopRecognition() {
    const current = recognition.current;
    recognition.current = null;
    if (current) { current.onend = null; current.onerror = null; current.onresult = null; try { current.abort(); } catch {} }
    if (mounted.current) setListening(false);
  }
  function stopCamera() {
    cameraGeneration.current++;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    if (mounted.current) {setCameraOpen(false); setCameraPending(false);}
  }
  function speak(text: string) {
    stopSpeech();
    if (callbacks.current.offline || !voiceOnRef.current || !('speechSynthesis' in window) || document.hidden) return;
    const epoch = voiceEpoch.current;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.96;
    utterance.pitch = 1.04;
    utterance.onstart = () => {if (mounted.current && epoch === voiceEpoch.current) setSpeaking(true);};
    const finish = () => {if (mounted.current && epoch === voiceEpoch.current) setSpeaking(false);};
    utterance.onend = finish; utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }
  function toggleVoice() {
    const enabled = !voiceOnRef.current;
    voiceOnRef.current = enabled;
    setVoiceOn(enabled);
    try {localStorage.setItem('coupi.call.voice', enabled ? 'on' : 'off');} catch {}
    if (!enabled) stopSpeech();
    else if (latest) speak([latest.message, latest.question !== latest.message ? latest.question : null].filter(Boolean).join(' '));
  }
  function acceptProfile(profile:Profile) {
    if(profile.id!==currentProfile.current.id||profile.revision<currentProfile.current.revision)throw new Error('Your profile changed. Please try again with your current preferences.');
    currentProfile.current=profile;callbacks.current.onProfile(profile);
  }
  async function checkedRequest<T>(url:string,body:Record<string,unknown>|FormData):Promise<T> {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const scope={epoch:callEpoch.current,profileId:currentProfile.current.id,draftId:currentProfile.current.journey?.personalizationDraft?.id};
    const result = await fetch(url, {method: 'POST', headers: body instanceof FormData ? undefined : {'Content-Type': 'application/json'}, body: body instanceof FormData ? body : JSON.stringify(body), signal: controller.signal, cache: 'no-store'});
    const data = await result.json();
    // A response may already be buffered when fetch is aborted. Re-check its
    // conversation and draft before allowing it to update memory or navigation.
    if(controller.signal.aborted||!mounted.current||scope.epoch!==callEpoch.current||scope.profileId!==currentProfile.current.id||scope.draftId!==currentProfile.current.journey?.personalizationDraft?.id)throw new DOMException('This call changed.','AbortError');
    if (!result.ok) throw new Error(data.error || 'That connection slipped. Your answer is still here.');
    return data as T;
  }
  async function sendRequest(body: Record<string, string> | FormData): Promise<CallResponse> {
    return checkedRequest<CallResponse>('/api/call',body);
  }
  async function sendPersonalization(body:Record<string,unknown>):Promise<PersonalizationResponse> {
    return checkedRequest<PersonalizationResponse>('/api/personalization',body);
  }
  function withDraft(body:Record<string,string>):Record<string,string> {
    return personalizationDraftId.current ? {...body,personalizationDraftId:personalizationDraftId.current} : body;
  }
  // The server derives this proposal from staged user statements. Opening it
  // does not confirm memory or make worlds available.
  async function loadReview() {
    const draftId=personalizationDraftId.current;if(!draftId)return;
    stopSpeech();stopRecognition();stopCamera();setReviewError('');
    const data=await sendPersonalization({action:'draft',requestId:crypto.randomUUID(),draftId});
    if(!mounted.current)return;
    if(!data.review)throw new Error('I need a little of your story before there is anything to review.');
    acceptProfile(data.profile);
    setLatest(current=>current?{...current,profile:data.profile}:current);
    reviewAutoOpened.current=true;setReview(data.review);
  }
  async function openReview() {
    if(busyRef.current||comparisonPending.current)return;
    busyRef.current=true;setBusy(true);setError('');
    try{await loadReview();}
    catch(failure){if(mounted.current&&!(failure instanceof DOMException&&failure.name==='AbortError'))setError(failure instanceof Error?failure.message:'The review could not open. Your call is still here.');}
    finally{busyRef.current=false;if(mounted.current)setBusy(false);}
  }
  function keepTalking() {
    if(busyRef.current)return;
    setReview(null);setReviewError('');
    requestAnimationFrame(()=>composer.current?.focus());
  }
  async function confirmReview(edits:PersonalizationReview) {
    const draftId=personalizationDraftId.current;
    if(busyRef.current||!draftId)return;
    const fingerprint=JSON.stringify([draftId,edits]);
    if(confirmAttempt.current?.fingerprint!==fingerprint)confirmAttempt.current={fingerprint,id:crypto.randomUUID()};
    busyRef.current=true;setBusy(true);setReviewError('');
    try{
      const data=await sendPersonalization({action:'confirm',requestId:confirmAttempt.current.id,draftId,review:edits});
      if(!mounted.current)return;
      acceptProfile(data.profile);
      if(!data.worldReady)throw new Error('Your review is not ready to build a world yet. Check your story, then try again.');
      personalizationDraftId.current=undefined;setReview(null);
      leave(()=>callbacks.current.onComplete(data.profile));
    }catch(failure){if(mounted.current&&!(failure instanceof DOMException&&failure.name==='AbortError'))setReviewError(failure instanceof Error?failure.message:'That did not save. Your edits are still here.');}
    finally{busyRef.current=false;if(mounted.current)setBusy(false);}
  }
  function acceptResponse(data: CallResponse, id: string) {
    acceptProfile(data.profile);
    setLatest(data);
    const responseText = [data.message, data.question && data.question !== data.message ? data.question : ''].filter(Boolean).join('\n\n');
    setTurns(current => [...current, {id: id + '-reply', role: 'coopy', text: responseText, response: data}]);
    speak(responseText);
  }
  function replaceVerdict(turnId: string, previous: Verdict, verdict: Verdict, profile: Profile) {
    // A comparison changes this card without ending the call or rewriting the
    // user's transcript. The server has already updated the decision queue.
    const previousStillPending = profile.decisions.some(item => item.skuId === previous.pickSkuId && !item.approvedAt);
    const update = (response: CallResponse): CallResponse => ({
      ...response, verdict, profile,
      // The server deliberately preserves delegated or unrelated proposals.
      // Keep those visible rather than hiding them when this card changes.
      proposedSkuIds: [...new Set([...response.proposedSkuIds.filter(id => id !== previous.pickSkuId || previousStillPending), verdict.pickSkuId].filter((id): id is string => !!id))],
    });
    setTurns(current => current.map(turn => turn.id === turnId && turn.response ? {...turn, response: update(turn.response)} : turn));
    setLatest(current => current?.verdict === previous ? update(current) : current);
    comparisonWorking(false);
    acceptProfile(profile);
  }
  function comparisonWorking(value: boolean) {
    comparisonPending.current = value;
    setComparisonBusy(value);
    if (value) stopRecognition();
  }
  async function begin() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const id = crypto.randomUUID();
      if(!callbacks.current.profile.journey?.interviewComplete){
        const staged=await sendPersonalization({action:'start',requestId:id+'-draft'});
        if(!mounted.current)return;
        if(!staged.draftId)throw new Error('I couldn’t start your preference draft. Please try again.');
        personalizationDraftId.current=staged.draftId;acceptProfile(staged.profile);
      }
      const data = await sendRequest(withDraft({action: 'start', requestId: id}));
      if (!mounted.current) return;
      setStarted(true); acceptResponse(data, id);
      if(personalizationDraftId.current&&!reviewAutoOpened.current&&(data.personalization?.reviewReady||data.interviewCount>=5))await loadReview();
    } catch (failure) {
      if (mounted.current && !(failure instanceof DOMException && failure.name === 'AbortError')) setError(failure instanceof Error ? failure.message : 'The call could not start. Try again.');
    } finally {busyRef.current = false; if (mounted.current) setBusy(false);}
  }
  async function changeInterview(action:'resumeInterview'|'finishInterview') {
    if(busyRef.current||comparisonPending.current||!started)return;
    if(action==='finishInterview'&&personalizationDraftId.current){await openReview();return;}
    stopSpeech();stopRecognition();
    if(!interviewAttempt.current||interviewAttempt.current.action!==action)interviewAttempt.current={action,id:crypto.randomUUID()};
    const id=interviewAttempt.current.id;
    busyRef.current=true;setBusy(true);setError('');
    try{
      const data=await sendRequest(withDraft({action,requestId:id}));
      if(!mounted.current)return;
      acceptResponse(data,id);interviewAttempt.current=null;
      if(action==='finishInterview'&&data.status==='ok'&&data.interviewComplete&&data.worldReady)leave(()=>callbacks.current.onComplete(data.profile));
      else requestAnimationFrame(()=>composer.current?.focus());
    }catch(failure){
      if(mounted.current&&!(failure instanceof DOMException&&failure.name==='AbortError'))setError(failure instanceof Error?failure.message:'That change didn’t save. You can keep talking or try again.');
    }finally{busyRef.current=false;if(mounted.current)setBusy(false);}
  }

  useEffect(() => {
    mounted.current = true;callEpoch.current++;
    // Read the preference before begin() can speak. Offline suppresses output
    // without replacing the user's preference for their next online call.
    try {
      const enabled = localStorage.getItem('coupi.call.voice') !== 'off';
      voiceOnRef.current = enabled;
      setVoiceOn(enabled);
    } catch {}
    setVoiceSupported(Boolean((window as VoiceWindow).SpeechRecognition || (window as VoiceWindow).webkitSpeechRecognition));
    setSpeechSupported('speechSynthesis' in window);
    // Defer one task so React's development effect probe cannot start a duplicate call.
    const start = setTimeout(() => void begin(), 0);
    const time = setInterval(() => setElapsed(value => value + 1), 1000);
    const visibility = () => {if (document.hidden) {stopSpeech(); stopRecognition(); stopCamera();}};
    document.addEventListener('visibilitychange', visibility);
    return () => {mounted.current = false; callEpoch.current++;clearTimeout(start); clearInterval(time); request.current?.abort(); stopSpeech(); stopRecognition(); stopCamera(); document.removeEventListener('visibilitychange', visibility);};
    // A call is scoped to one profile; updates inside that profile must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.profile.id]);
  useEffect(() => {
    // Browser dictation and remote speech voices can use their own network services.
    // Offline rehearsal keeps both off, including when the setting changes mid-call.
    if (props.offline) {stopSpeech(); stopRecognition();}
  }, [props.offline]);
  useEffect(() => {
    if (!photo) {setPhotoUrl(''); return;}
    const url = URL.createObjectURL(photo); setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    const element = transcript.current;
    if (element) element.scrollTo({top: element.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }, [turns.length, busy]);
  useEffect(() => {
    if (cameraOpen && video.current && stream.current) {video.current.srcObject = stream.current; void video.current.play().catch(() => {});}
  }, [cameraOpen]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current || comparisonPending.current || !started || (!draft.trim() && !photo)) return;
    stopRecognition(); stopSpeech();
    const message = draft.trim(), chosenPhoto = photo;
    const fingerprint = JSON.stringify([message, chosenPhoto?.name, chosenPhoto?.size, chosenPhoto?.lastModified]);
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) attempt.current = {fingerprint, id: crypto.randomUUID()};
    const id = attempt.current.id;
    let body: FormData | Record<string, string> = withDraft({action: 'message', requestId: id, message});
    if (chosenPhoto) {const form = new FormData(); form.set('action', 'message'); form.set('requestId', id); form.set('message', message); form.set('file', chosenPhoto); if(personalizationDraftId.current)form.set('personalizationDraftId',personalizationDraftId.current); body = form;}
    busyRef.current = true; setBusy(true); setError('');
    try {
      const data = await sendRequest(body);
      if (!mounted.current) return;
      if (data.status !== 'ok') {
        acceptProfile(data.profile);
        setError(data.message);
        // A rejected/uncertain answer is not a completed turn: keep the question,
        // draft, attachment and request id so the user can edit or retry it.
        setLatest(data);
        speak(data.message);
        requestAnimationFrame(() => composer.current?.focus());
        return;
      }
      setTurns(current => [...current, {id, role: 'you', text: message, photo: Boolean(chosenPhoto)}]);
      acceptResponse(data, id);
      setDraft(''); setPhoto(null); attempt.current = null;
      if (fileInput.current) fileInput.current.value = '';
      if(personalizationDraftId.current&&!reviewAutoOpened.current&&(data.personalization?.reviewReady||data.interviewCount>=5))await loadReview();
      else requestAnimationFrame(() => composer.current?.focus());
    } catch (failure) {
      if (mounted.current && !(failure instanceof DOMException && failure.name === 'AbortError')) setError(failure instanceof Error ? failure.message : 'That connection slipped. Your answer is still here.');
    } finally {busyRef.current = false; if (mounted.current) setBusy(false);}
  }
  function toggleMicrophone() {
    if (props.offline) {stopRecognition(); return;}
    if (listening) {recognition.current?.stop(); setListening(false); return;}
    const Constructor = (window as VoiceWindow).SpeechRecognition || (window as VoiceWindow).webkitSpeechRecognition;
    if (!Constructor) {setError('This browser cannot transcribe voice. You can type the same answer below.'); return;}
    stopSpeech(); stopRecognition(); setError('');
    const mic = new Constructor(), before = draftRef.current.trim();
    mic.lang = 'en-US'; mic.interimResults = true; mic.continuous = false;
    mic.onresult = event => {
      if (!mounted.current || recognition.current !== mic) return;
      const words = Array.from(event.results).map(result => result[0].transcript).join(' ');
      setDraft([before, words].filter(Boolean).join(' ').slice(0, 2000));
    };
    mic.onerror = event => {if (!mounted.current || recognition.current !== mic) return; setListening(false); if (event.error !== 'aborted') setError(event.error === 'not-allowed' ? 'Microphone access is off. Allow it in your browser, or type below.' : event.error === 'no-speech' ? 'I didn’t catch that. Try the mic again, or type below.' : 'Voice transcription is unavailable right now. Typing still works.');};
    mic.onend = () => {if (mounted.current && recognition.current === mic) {setListening(false); recognition.current = null;}};
    recognition.current = mic;
    try {mic.start(); setListening(true);} catch {recognition.current = null; setError('The microphone could not start. Type below, or try again.');}
  }
  function selectPhoto(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {setError('Choose a JPEG, PNG or WebP photo. Convert HEIC first.'); return;}
    if (file.size > MAX_PHOTO) {setError('Choose a photo smaller than 8 MB.'); return;}
    setError(''); setPhoto(file);
  }
  async function openCamera() {
    if (cameraOpen || cameraPending) {stopCamera(); return;}
    if (!navigator.mediaDevices?.getUserMedia) {setError('The camera is unavailable here. Attach a photo instead.'); return;}
    const generation = ++cameraGeneration.current;
    setCameraPending(true); setError('');
    try {
      const media = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}}, audio: false});
      if (!mounted.current || generation !== cameraGeneration.current || document.hidden) {media.getTracks().forEach(track => track.stop()); return;}
      stream.current = media; setCameraOpen(true);
    } catch {if (mounted.current && generation === cameraGeneration.current) setError('I couldn’t open the camera. Allow camera access, or attach a photo.');}
    finally {if (mounted.current && generation === cameraGeneration.current) setCameraPending(false);}
  }
  async function capture() {
    const current = video.current;
    if (!current?.videoWidth) {setError('The camera is still waking up. Try once the preview appears.'); return;}
    const canvas = document.createElement('canvas'), ratio = Math.min(1, 1280 / current.videoWidth);
    canvas.width = Math.round(current.videoWidth * ratio); canvas.height = Math.round(current.videoHeight * ratio);
    const context = canvas.getContext('2d');
    if (!context) {setError('This browser couldn’t capture that frame. Attach a photo instead.'); return;}
    context.drawImage(current, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!mounted.current) return;
    if (!blob) {setError('The frame could not be captured. Please try again.'); return;}
    selectPhoto(new File([blob], 'your-view.jpg', {type: 'image/jpeg'})); stopCamera();
    composer.current?.focus();
  }
  function leave(callback: () => void) {callEpoch.current++;request.current?.abort();stopSpeech(); stopRecognition(); stopCamera(); callback();}

  return <section className="companion-call" aria-label={complete ? 'Call Coopy' : 'Your first call with Coopy'}>
    <div className="call-topline"><span className="call-live"><i/>{mode==='request'?'YOUR NEED / FIRST':paused?'QUESTIONS PAUSED':complete?'YOUR OPEN LINE':'GETTING TO KNOW YOU'} <span>· {Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}</span></span><div className="call-top-actions">{speechSupported && !props.offline && <button className="call-icon-button" onClick={toggleVoice} aria-label={voiceOn ? 'Mute Coopy’s spoken voice' : 'Enable Coopy’s spoken voice'} aria-pressed={voiceOn}><VoiceGlyph muted={!voiceOn}/><span>{voiceOn ? 'voice on' : 'voice off'}</span></button>}<button className="call-icon-button" onClick={() => leave(props.onClose)} aria-label="Leave call"><Glyph name="close"/><span>leave call</span></button></div></div>
    <div className="call-body">
      <aside className="call-company">
        <div className="call-face-stage"><div className="call-face-light"/><CallPet speaking={speaking} listening={listening}/><div className={`call-wave ${busy || speaking || listening ? 'active' : ''}`} aria-hidden="true">{Array.from({length: 9}, (_, i) => <i key={i} style={{animationDelay: `${i * -0.14}s`}}/>)}</div><span className="call-presence-label">{listening ? 'I’M LISTENING' : busy ? started ? 'TAKING IT IN' : 'CONNECTING' : speaking ? 'COOPY IS SPEAKING' : 'RIGHT HERE WITH YOU'}</span></div>
        {!complete && <div className="call-question-progress"><div aria-label={`${count} of up to 5 optional stories shared`}>{Array.from({length: 5}, (_, i) => <i className={i < count ? 'done' : mode==='interview'&&i === count ? 'current' : ''} key={i}/>)}</div><span>{count} / up to 5 · optional{paused?' · paused':''}</span></div>}
        <h2 className="call-invitation">{mode==='interview'?'your life,\nin your words.':'show me.\ntell me.'}</h2>
        <p className="call-company-note">{complete||paused?'A shelf, two things you’re choosing between, something you need. I’ll follow your lead.':'Tell me a little, or ask for what you need right now. The questions can wait.'}</p>
        <section className="call-memory-trace" aria-label={activeDraft?'Draft observations from this call':'Memories from this call'}><span className="eyebrow">{activeDraft?'HEARD SO FAR / DRAFT':newMemories.length ? 'WRITING INTO MY HEAD' : 'NOTHING ASSUMED'}</span>{newMemories.length ? newMemories.slice(-5).map(line => <div className="call-memory-line" key={line.id}><Glyph name="spark"/><div><p>{line.text}</p><small>{line.source}<br/>{activeDraft?'not added to memory · review first':line.kind==='inventory'?(line.confidence>=.6?'visible in your frame':'tentative observation'):line.kind==='decision'?'recorded action':line.confidence>=.8?'said by you':'tentative · you can correct this'}</small></div></div>) : <p className="call-memory-empty">{activeDraft?'Your story stays a draft until you review it.':'You’ll see what I remember, as we talk.'}</p>}</section>
      </aside>
      <div className="call-conversation">
        <div ref={transcript} className="call-transcript" role="log" aria-label="Your conversation" aria-live="polite" aria-relevant="additions">
          {turns.map(turn => <article className={`call-turn from-${turn.role}`} key={turn.id}><span className="call-speaker">{turn.role === 'you' ? 'YOU' : 'COOPY'}</span>{turn.text && <p className="call-turn-text">{turn.text}</p>}{turn.photo && <span className="call-photo-receipt"><Glyph name="image"/> one frame shared</span>}
            {turn.response?.navigation&&<a className="call-account-guidance" href={turn.response.navigation.href} onClick={()=>leave(()=>{})}><Glyph name={turn.response.navigation.section==='addresses'?'home':'lock'}/><span>{turn.response.navigation.label}<small>You review and save the changes.</small></span><Glyph name="arrow-right"/></a>}
            {turn.response?.inventory && <div className="call-inventory"><span className="eyebrow">WHAT I CAN SEE</span>{turn.response.inventory.items.map((item, i) => <div key={i}><Glyph name={item.status === 'present' ? 'check' : item.status === 'low' ? 'minus' : 'help'}/><b>{item.name}</b><span>{item.quantity || item.status}</span></div>)}{turn.response.inventory.uncertainties.map((line, i) => <p className="call-uncertainty" key={i}>{line}</p>)}</div>}
            {turn.response?.verdict?.pickSkuId && (() => {const verdict = turn.response.verdict, sku = getSku(verdict.pickSkuId!); return sku ? <section className="call-verdict"><ProductVisual sku={sku} className="call-verdict-art"/><div className="call-verdict-content"><span className="eyebrow">MY PICK FOR YOU</span><h3>{sku.name}</h3><strong>{money(sku.price)}</strong><span className="delivery-pill"><Glyph name={/rocket/i.test(sku.delivery)?'rocket':'help'}/>{sku.delivery}{sku.origin==='coupang-reference'?'':' · demo'}</span><ProductEvidence sku={sku}/><SellerQA skuId={sku.id}/><p>{verdict.reason}</p>{verdict.dissent && <p className="call-verdict-dissent">{verdict.dissent}</p>}<div className="call-citations">{verdict.citations.map(id => {const review = getReview(id); return review ? <details key={id}><summary>{id} <Glyph name="arrow-up"/></summary><div><b>{review.stars} / 5 · {review.title}</b><p>{review.text}</p><small>{review.author} · {review.date} · seeded review</small></div></details> : null;})}</div><VerdictComparison profile={props.profile} pickSkuId={sku.id} verdict={verdict} origin="call" disabled={busy||comparisonBusy||props.profile.owned.some(item=>item.skuId===sku.id)} onBusyChange={comparisonWorking} onChange={(next,profile)=>replaceVerdict(turn.id,verdict,next,profile)}/><button className="text-button" disabled={comparisonBusy} onClick={() => leave(() => props.onOpenProduct(sku.id, verdict))}>Look closer & delegate <Glyph name="arrow-right"/></button></div></section> : null;})()}
            {(turn.response?.proposedSkuIds || []).filter(id => id !== turn.response?.verdict?.pickSkuId).map(id => {const sku = getSku(id); return sku ? <button className="call-filler-card" disabled={comparisonBusy} key={id} onClick={() => leave(() => props.onOpenProduct(id))}><ProductVisual sku={sku} className="call-filler-art"/><span><b>{sku.name}</b><small>{sku.origin==='coupang-reference'?'historical reference price · review before approval':'pending your approval · open to review'}</small></span><strong>{money(sku.price)}</strong><Glyph name="arrow-up"/></button> : null;})}
            {turn.response?.meta && <small className="call-response-meta">{turn.response.meta.offline ? 'CACHED REPLAY' : turn.response.meta.cached ? 'FROM CACHE' : 'LIVE RESPONSE'} · {(turn.response.meta.latencyMs / 1000).toFixed(1)}S</small>}
          </article>)}
          {busy && <div className="call-thinking" role="status"><i/><i/><i/><span>{started ? 'a second, I’m with you…' : 'pulling up a chair…'}</span></div>}
        </div>
        {error && <div className="call-error" role="alert"><Glyph name="help"/><span>{error}</span>{!started && <button className="text-button" onClick={() => void begin()} disabled={busy||comparisonBusy}>Try again</button>}</div>}
        {cameraOpen && <section className="call-camera-preview" aria-label="Your camera preview"><video ref={video} autoPlay muted playsInline/><div><span>PREVIEW · ONLY A CAPTURED FRAME IS SENT</span><button className="call-capture" onClick={() => void capture()} aria-label="Capture this frame"><Glyph name="camera"/> Capture frame</button><button className="call-icon-button" onClick={stopCamera} aria-label="Close camera"><Glyph name="close"/></button></div></section>}
        {!complete&&started&&(paused||worldReady||Boolean(activeDraft&&newMemories.length))&&<div className="call-complete" aria-label="Optional getting-to-know-you questions">
          <p>{paused?'the questions can wait. we’ll take care of what you need first.':activeDraft?'a little context is enough. review what I heard, or keep talking.':'a little context is enough to begin. keep talking, or start with what you’ve shared.'}</p>
          {paused&&<button className="text-button" disabled={busy||comparisonBusy} onClick={()=>void changeInterview('resumeInterview')}>Back to our questions <Glyph name="arrow-right"/></button>}
          {Boolean(activeDraft&&newMemories.length)&&<button className="text-button call-review-story" disabled={busy||comparisonBusy} onClick={()=>void openReview()}>Review my story <Glyph name="arrow-right"/></button>}
          {!activeDraft&&worldReady&&<button className="text-button" disabled={busy||comparisonBusy} onClick={()=>void changeInterview('finishInterview')}>Build from what I’ve shared <Glyph name="scene"/></button>}
          {activeDraft?<small>Preference memory is saved only after you confirm. No need to finish all five questions.</small>:!worldReady&&<small>No need to finish five questions. One useful story or request gives us a beginning.</small>}
        </div>}
        {complete&&worldReady&&!props.profile.journey?.districts.length&&<button className="text-button" disabled={busy||comparisonBusy} onClick={()=>void changeInterview('finishInterview')}>Build my world <Glyph name="scene"/></button>}
        <form className="call-composer" onSubmit={submit}>
          {photoUrl && <div className="call-attached-photo"><img src={photoUrl} alt="The frame you are about to share with Coopy"/><div><b>A little context.</b><small>Sent only when you send your message.</small></div><button type="button" onClick={() => {setPhoto(null); if (fileInput.current) fileInput.current.value = '';}} aria-label="Remove attached photo" disabled={busy||comparisonBusy}><Glyph name="close"/></button></div>}
          <label className="sr-only" htmlFor="coopy-call-answer">Tell or ask Coopy something</label><textarea id="coopy-call-answer" ref={composer} value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} disabled={!started || busy || comparisonBusy} rows={3} placeholder={listening ? 'listening in English…' : mode==='interview'?'your story, in English…':'tell me in English…'} onKeyDown={event => {if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {event.preventDefault(); event.currentTarget.form?.requestSubmit();}}}/>
          <div className="call-composer-tools"><div><button type="button" className={`call-icon-button ${listening ? 'mic-listening' : ''}`} disabled={props.offline || !voiceSupported || busy || comparisonBusy || !started} onClick={toggleMicrophone} aria-label={listening ? 'Stop voice input' : 'Speak your answer'} aria-pressed={listening} title={props.offline ? 'Offline rehearsal uses typing' : voiceSupported ? 'Speak your answer' : 'Voice input unavailable; type your answer'}><Glyph name={listening ? 'stop' : 'mic'}/></button><button type="button" className="call-icon-button" disabled={busy || comparisonBusy || !started} onClick={() => fileInput.current?.click()} aria-label="Attach a photo"><Glyph name="image"/></button><button type="button" className={`call-icon-button ${cameraOpen ? 'camera-is-open' : ''}`} disabled={busy || comparisonBusy || !started} onClick={() => void openCamera()} aria-label={cameraOpen ? 'Close camera' : cameraPending ? 'Cancel opening camera' : 'Open your camera'} aria-pressed={cameraOpen}><Glyph name="camera"/></button></div><button className="button call-send" type="submit" disabled={busy || comparisonBusy || !started || (!draft.trim() && !photo)}>Send <Glyph name="arrow-up"/></button></div>
          <input ref={fileInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} onChange={event => selectPhoto(event.target.files?.[0])}/>
          <p className="call-input-note">{props.offline ? 'Offline rehearsal · type your answer. Browser voice is off.' : listening ? 'Voice fills this box. Read it, then send.' : !voiceSupported ? 'Voice input isn’t available in this browser. Typing works.' : 'Speak, type, or share a frame. No need to choose a mode.'}</p>
        </form>
      </div>
    </div>
    {review&&<FirstCallReview review={review} onConfirm={edits=>void confirmReview(edits)} onContinue={keepTalking} busy={busy} error={reviewError}/>}
  </section>;
}
