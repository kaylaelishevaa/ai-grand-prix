'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {getReview, getSku} from '@/lib/catalog';
import type {CallResponse} from '@/lib/journey-types';
import type {Profile, Verdict} from '@/lib/types';
import {Glyph} from './Glyph';
import {productArt} from './art';
import VerdictComparison from './VerdictComparison';
import './companion-call.css';

interface CompanionCallProps {
  profile: Profile;
  offline?: boolean;
  onProfile(profile: Profile): void;
  onComplete(): void;
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
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraPending, setCameraPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const beganAsInterview = useRef(!props.profile.journey?.interviewComplete);
  const mounted = useRef(false), busyRef = useRef(false), voiceOnRef = useRef(true), draftRef = useRef('');
  const request = useRef<AbortController | null>(null);
  const recognition = useRef<BrowserRecognition | null>(null);
  const stream = useRef<MediaStream | null>(null), cameraGeneration = useRef(0);
  const video = useRef<HTMLVideoElement | null>(null), fileInput = useRef<HTMLInputElement>(null);
  const transcript = useRef<HTMLDivElement>(null), composer = useRef<HTMLTextAreaElement>(null);
  const attempt = useRef<{fingerprint: string; id: string} | null>(null);
  const voiceEpoch = useRef(0);
  draftRef.current = draft;
  voiceOnRef.current = voiceOn;
  const count = latest?.interviewCount ?? props.profile.journey?.interviewCount ?? 0;
  const complete = latest?.interviewComplete ?? props.profile.journey?.interviewComplete ?? false;
  const finishedFirstCall = complete && (beganAsInterview.current || !props.profile.journey?.districts.length);
  const rememberedIds = new Set(props.profile.memoryLines.map(line => line.id));
  const newMemories = turns.flatMap(turn => turn.response?.memories || []).filter((line, index, all) => rememberedIds.has(line.id) && all.findIndex(other => other.id === line.id) === index);

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
    utterance.lang = navigator.language || 'en-US';
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
  async function sendRequest(body: Record<string, string> | FormData): Promise<CallResponse> {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const result = await fetch('/api/call', {method: 'POST', headers: body instanceof FormData ? undefined : {'Content-Type': 'application/json'}, body: body instanceof FormData ? body : JSON.stringify(body), signal: controller.signal, cache: 'no-store'});
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || 'That connection slipped. Your answer is still here.');
    return data as CallResponse;
  }
  function acceptResponse(data: CallResponse, id: string) {
    callbacks.current.onProfile(data.profile);
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
    callbacks.current.onProfile(profile);
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
      const data = await sendRequest({action: 'start', requestId: id});
      if (!mounted.current) return;
      setStarted(true); acceptResponse(data, id);
    } catch (failure) {
      if (mounted.current && !(failure instanceof DOMException && failure.name === 'AbortError')) setError(failure instanceof Error ? failure.message : 'The call could not start. Try again.');
    } finally {busyRef.current = false; if (mounted.current) setBusy(false);}
  }

  useEffect(() => {
    mounted.current = true;
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
    return () => {mounted.current = false; clearTimeout(start); clearInterval(time); request.current?.abort(); stopSpeech(); stopRecognition(); stopCamera(); document.removeEventListener('visibilitychange', visibility);};
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
    let body: FormData | Record<string, string> = {action: 'message', requestId: id, message};
    if (chosenPhoto) {const form = new FormData(); form.set('action', 'message'); form.set('requestId', id); form.set('message', message); form.set('file', chosenPhoto); body = form;}
    busyRef.current = true; setBusy(true); setError('');
    try {
      const data = await sendRequest(body);
      if (!mounted.current) return;
      if (data.status !== 'ok') {
        callbacks.current.onProfile(data.profile);
        setError(data.message);
        // A rejected/uncertain answer is not a completed turn: keep the question,
        // draft, attachment and request id so the user can edit or retry it.
        setLatest(current => current ? {...current, profile:data.profile, interviewCount:data.interviewCount, interviewComplete:data.interviewComplete} : data);
        speak(data.message);
        requestAnimationFrame(() => composer.current?.focus());
        return;
      }
      setTurns(current => [...current, {id, role: 'you', text: message, photo: Boolean(chosenPhoto)}]);
      acceptResponse(data, id);
      setDraft(''); setPhoto(null); attempt.current = null;
      if (fileInput.current) fileInput.current.value = '';
      if (!data.interviewComplete || !beganAsInterview.current) requestAnimationFrame(() => composer.current?.focus());
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
    mic.lang = navigator.language || 'en-US'; mic.interimResults = true; mic.continuous = false;
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
  function leave(callback: () => void) {stopSpeech(); stopRecognition(); stopCamera(); callback();}

  return <section className="companion-call" aria-label={complete ? 'Call Coopy' : 'Your first call with Coopy'}>
    <div className="call-topline"><span className="call-live"><i/>{complete ? 'YOUR OPEN LINE' : 'OUR FIRST CALL'} <span>· {Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}</span></span><div className="call-top-actions">{speechSupported && !props.offline && <button className="call-icon-button" onClick={toggleVoice} aria-label={voiceOn ? 'Mute Coopy’s spoken voice' : 'Enable Coopy’s spoken voice'} aria-pressed={voiceOn}><VoiceGlyph muted={!voiceOn}/><span>{voiceOn ? 'voice on' : 'voice off'}</span></button>}<button className="call-icon-button" onClick={() => leave(props.onClose)} aria-label="Leave call"><Glyph name="close"/><span>leave call</span></button></div></div>
    <div className="call-body">
      <aside className="call-company">
        <div className="call-face-stage"><div className="call-face-light"/><CallPet speaking={speaking} listening={listening}/><div className={`call-wave ${busy || speaking || listening ? 'active' : ''}`} aria-hidden="true">{Array.from({length: 9}, (_, i) => <i key={i} style={{animationDelay: `${i * -0.14}s`}}/>)}</div><span className="call-presence-label">{listening ? 'I’M LISTENING' : busy ? started ? 'TAKING IT IN' : 'CONNECTING' : speaking ? 'COOPY IS SPEAKING' : 'RIGHT HERE WITH YOU'}</span></div>
        {!complete && <div className="call-question-progress"><div aria-label={`${count} of 5 answers shared`}>{Array.from({length: 5}, (_, i) => <i className={i < count ? 'done' : i === count ? 'current' : ''} key={i}/>)}</div><span>{count} / 5 little stories</span></div>}
        <h2 className="call-invitation">{finishedFirstCall ? 'a little world,\nfrom your words.' : complete ? 'show me.\ntell me.' : 'your life,\nin your words.'}</h2>
        <p className="call-company-note">{complete ? 'A shelf, two things you’re choosing between, something you need. I’ll follow your lead.' : 'No right answers. Tell me a little about the day you actually live.'}</p>
        <section className="call-memory-trace" aria-label="Memories from this call"><span className="eyebrow">{newMemories.length ? 'WRITING INTO MY HEAD' : 'NOTHING ASSUMED'}</span>{newMemories.length ? newMemories.slice(-5).map(line => <div className="call-memory-line" key={line.id}><Glyph name="spark"/><div><p>{line.text}</p><small>{line.source}<br/>{Math.round(line.confidence * 100)}% confidence</small></div></div>) : <p className="call-memory-empty">You’ll see what I remember, as we talk.</p>}</section>
      </aside>
      <div className="call-conversation">
        <div ref={transcript} className="call-transcript" role="log" aria-label="Your conversation" aria-live="polite" aria-relevant="additions">
          {turns.map(turn => <article className={`call-turn from-${turn.role}`} key={turn.id}><span className="call-speaker">{turn.role === 'you' ? 'YOU' : 'COOPY'}</span>{turn.text && <p className="call-turn-text">{turn.text}</p>}{turn.photo && <span className="call-photo-receipt"><Glyph name="image"/> one frame shared</span>}
            {turn.response?.inventory && <div className="call-inventory"><span className="eyebrow">WHAT I CAN SEE</span>{turn.response.inventory.items.map((item, i) => <div key={i}><Glyph name={item.status === 'present' ? 'check' : item.status === 'low' ? 'minus' : 'help'}/><b>{item.name}</b><span>{item.quantity || item.status}</span></div>)}{turn.response.inventory.uncertainties.map((line, i) => <p className="call-uncertainty" key={i}>{line}</p>)}</div>}
            {turn.response?.verdict?.pickSkuId && (() => {const verdict = turn.response.verdict, sku = getSku(verdict.pickSkuId!); return sku ? <section className="call-verdict"><div className="call-verdict-art" dangerouslySetInnerHTML={{__html: productArt(sku.type, sku.color)}}/><div className="call-verdict-content"><span className="eyebrow">MY PICK FOR YOU</span><h3>{sku.name}</h3><strong>{money(sku.price)}</strong><p>{verdict.reason}</p>{verdict.dissent && <p className="call-verdict-dissent">{verdict.dissent}</p>}<div className="call-citations">{verdict.citations.map(id => {const review = getReview(id); return review ? <details key={id}><summary>{id} <Glyph name="arrow-up"/></summary><div><b>{review.stars} / 5 · {review.title}</b><p>{review.text}</p><small>{review.author} · {review.date} · seeded review</small></div></details> : null;})}</div><VerdictComparison profile={props.profile} pickSkuId={sku.id} verdict={verdict} origin="call" disabled={busy||comparisonBusy||props.profile.owned.some(item=>item.skuId===sku.id)} onBusyChange={comparisonWorking} onChange={(next,profile)=>replaceVerdict(turn.id,verdict,next,profile)}/><button className="text-button" disabled={comparisonBusy} onClick={() => leave(() => props.onOpenProduct(sku.id, verdict))}>Look closer & delegate <Glyph name="arrow-right"/></button></div></section> : null;})()}
            {(turn.response?.proposedSkuIds || []).filter(id => id !== turn.response?.verdict?.pickSkuId).map(id => {const sku = getSku(id); return sku ? <button className="call-filler-card" disabled={comparisonBusy} key={id} onClick={() => leave(() => props.onOpenProduct(id))}><span className="call-filler-art" dangerouslySetInnerHTML={{__html: productArt(sku.type, sku.color)}}/><span><b>{sku.name}</b><small>pending your approval · open to review</small></span><strong>{money(sku.price)}</strong><Glyph name="arrow-up"/></button> : null;})}
            {turn.response?.meta && <small className="call-response-meta">{turn.response.meta.offline ? 'CACHED REPLAY' : turn.response.meta.cached ? 'FROM CACHE' : 'LIVE RESPONSE'} · {(turn.response.meta.latencyMs / 1000).toFixed(1)}S</small>}
          </article>)}
          {busy && <div className="call-thinking" role="status"><i/><i/><i/><span>{started ? 'a second, I’m with you…' : 'pulling up a chair…'}</span></div>}
        </div>
        {error && <div className="call-error" role="alert"><Glyph name="help"/><span>{error}</span>{!started && <button className="text-button" onClick={() => void begin()} disabled={busy||comparisonBusy}>Try again</button>}</div>}
        {cameraOpen && <section className="call-camera-preview" aria-label="Your camera preview"><video ref={video} autoPlay muted playsInline/><div><span>PREVIEW · ONLY A CAPTURED FRAME IS SENT</span><button className="call-capture" onClick={() => void capture()} aria-label="Capture this frame"><Glyph name="camera"/> Capture frame</button><button className="call-icon-button" onClick={stopCamera} aria-label="Close camera"><Glyph name="close"/></button></div></section>}
        {finishedFirstCall ? <div className="call-complete"><p>five stories. the beginning of something that feels like you.</p><button className="button" onClick={() => leave(props.onComplete)}>Build my world <Glyph name="arrow-right"/></button><small>Every district starts with what you shared.</small></div> : <form className="call-composer" onSubmit={submit}>
          {photoUrl && <div className="call-attached-photo"><img src={photoUrl} alt="The frame you are about to share with Coopy"/><div><b>A little context.</b><small>Sent only when you send your message.</small></div><button type="button" onClick={() => {setPhoto(null); if (fileInput.current) fileInput.current.value = '';}} aria-label="Remove attached photo" disabled={busy||comparisonBusy}><Glyph name="close"/></button></div>}
          <label className="sr-only" htmlFor="coopy-call-answer">{complete ? 'Tell or ask Coopy something' : 'Your answer to Coopy'}</label><textarea id="coopy-call-answer" ref={composer} value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} disabled={!started || busy || comparisonBusy} rows={3} placeholder={listening ? 'listening…' : complete ? 'tell me what’s on your mind…' : 'tell me a little…'} onKeyDown={event => {if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {event.preventDefault(); event.currentTarget.form?.requestSubmit();}}}/>
          <div className="call-composer-tools"><div><button type="button" className={`call-icon-button ${listening ? 'mic-listening' : ''}`} disabled={props.offline || !voiceSupported || busy || comparisonBusy || !started} onClick={toggleMicrophone} aria-label={listening ? 'Stop voice input' : 'Speak your answer'} aria-pressed={listening} title={props.offline ? 'Offline rehearsal uses typing' : voiceSupported ? 'Speak your answer' : 'Voice input unavailable; type your answer'}><Glyph name={listening ? 'stop' : 'mic'}/></button><button type="button" className="call-icon-button" disabled={busy || comparisonBusy || !started} onClick={() => fileInput.current?.click()} aria-label="Attach a photo"><Glyph name="image"/></button><button type="button" className={`call-icon-button ${cameraOpen ? 'camera-is-open' : ''}`} disabled={busy || comparisonBusy || !started} onClick={() => void openCamera()} aria-label={cameraOpen ? 'Close camera' : cameraPending ? 'Cancel opening camera' : 'Open your camera'} aria-pressed={cameraOpen}><Glyph name="camera"/></button></div><button className="button call-send" type="submit" disabled={busy || comparisonBusy || !started || (!draft.trim() && !photo)}>Send <Glyph name="arrow-up"/></button></div>
          <input ref={fileInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} onChange={event => selectPhoto(event.target.files?.[0])}/>
          <p className="call-input-note">{props.offline ? 'Offline rehearsal · type your answer. Browser voice is off.' : listening ? 'Voice fills this box. Read it, then send.' : !voiceSupported ? 'Voice input isn’t available in this browser. Typing works.' : 'Speak, type, or share a frame. No need to choose a mode.'}</p>
        </form>}
      </div>
    </div>
  </section>;
}
