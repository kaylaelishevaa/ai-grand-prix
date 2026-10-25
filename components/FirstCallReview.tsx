'use client';

import {useEffect,useId,useRef,useState,type FormEvent} from 'react';
import {createPortal} from 'react-dom';
import type {PersonalizationReview} from '@/lib/personalization';
import {Glyph} from './Glyph';
import './first-call-review.css';

const interests:{id:PersonalizationReview['interests'][number];label:string}[]=[
  {id:'cozy_home',label:'Cozy at home'},{id:'focused_work',label:'My workspace'},
  {id:'everyday_style',label:'Everyday style'},{id:'beauty_play',label:'Beauty & color'},
  {id:'outdoors',label:'Out & about'},
];
const vibes:{id:PersonalizationReview['vibe'];label:string}[]=[{id:null,label:'Still discovering'},{id:'calm',label:'Calm'},{id:'bold',label:'Bold'},{id:'mixed',label:'A little of both'}];

/** The form preserves literal edits; the server is the only authority that can confirm a draft. */
export function reviewFromEdits(selected:PersonalizationReview['interests'],vibe:PersonalizationReview['vibe'],budget:string,story:string):PersonalizationReview {
  const raw=budget.trim(),amount=raw?Number(raw):null;
  if(raw&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(amount)||(amount!==null&&(amount<=0||amount>10000000))))throw new Error('Use a whole-won amount from ₩1 to ₩10,000,000, or leave the budget blank.');
  if(story.length>1200)throw new Error('Keep your story within 1,200 characters.');
  if(!selected.length&&!vibe&&amount===null&&!story.trim())throw new Error('Keep one interest or a little story to give your world a beginning.');
  return{interests:[...selected],vibe,budgetPerItem:amount,story};
}

export default function FirstCallReview({review,onConfirm,onContinue,busy,error}:{review:PersonalizationReview;onConfirm:(review:PersonalizationReview)=>void;onContinue:()=>void;busy:boolean;error?:string}) {
  const [ready,setReady]=useState(false),[selected,setSelected]=useState([...review.interests]),[vibe,setVibe]=useState(review.vibe),[budget,setBudget]=useState(review.budgetPerItem===null?'':String(review.budgetPerItem)),[story,setStory]=useState(review.story),[validation,setValidation]=useState('');
  const dialog=useRef<HTMLDialogElement>(null),latest=useRef({onContinue,busy});latest.current={onContinue,busy};
  const id=useId();
  useEffect(()=>setReady(true),[]);
  useEffect(()=>{
    const node=dialog.current;if(!ready||!node)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';node.showModal();node.querySelector<HTMLElement>('[data-review-focus]')?.focus();
    return()=>{if(node.open)node.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
  },[ready]);
  function toggle(value:PersonalizationReview['interests'][number]){setValidation('');setSelected(current=>current.includes(value)?current.filter(item=>item!==value):[...current,value]);}
  function confirm(event:FormEvent){event.preventDefault();if(busy)return;try{const edits=reviewFromEdits(selected,vibe,budget,story);setValidation('');onConfirm(edits);}catch(cause){setValidation(cause instanceof Error?cause.message:'Check those details, then try again.');}}
  if(!ready)return null;
  return createPortal(<dialog ref={dialog} className="first-call-review" aria-labelledby={id+'-title'} aria-describedby={id+'-intro'} onCancel={event=>{event.preventDefault();if(!latest.current.busy)latest.current.onContinue();}}>
    <form onSubmit={confirm}>
      <header className="first-review-heading"><span className="first-review-status"><i/>DRAFT / NOT ADDED TO MEMORY</span><h2 id={id+'-title'} tabIndex={-1} data-review-focus>Does this feel like you?</h2><p id={id+'-intro'}>A little of what I heard. Change anything. Only what you confirm here becomes preference memory.</p></header>
      <fieldset disabled={busy} className="first-review-interests"><legend>Where would you like to wander?</legend><div>{interests.map(item=><label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={()=>toggle(item.id)}/><span>{item.label}<Glyph name="check"/></span></label>)}</div></fieldset>
      <fieldset disabled={busy} className="first-review-vibe"><legend>What feels good right now?</legend><div>{vibes.map(item=><label key={item.id||'none'}><input type="radio" name={id+'-vibe'} value={item.id||''} checked={vibe===item.id} onChange={()=>{setValidation('');setVibe(item.id);}}/><span>{item.label}</span></label>)}</div></fieldset>
      <div className="first-review-field"><label htmlFor={id+'-budget'}>A comfortable amount <span>optional / per item</span></label><div className="first-review-money"><span aria-hidden="true">₩</span><input id={id+'-budget'} type="text" inputMode="numeric" value={budget} maxLength={8} disabled={busy} onChange={event=>{setValidation('');setBudget(event.target.value);}} aria-describedby={id+'-budget-help'} placeholder="Leave it open"/></div><p id={id+'-budget-help'}>Per item, not your monthly budget. This never gives Coopy permission to buy.</p></div>
      <div className="first-review-field"><label htmlFor={id+'-story'}>Your story <span>{story.length} / 1,200</span></label><textarea id={id+'-story'} value={story} maxLength={1200} disabled={busy} rows={5} onChange={event=>{setValidation('');setStory(event.target.value);}} placeholder="The little things you’d like Coopy to remember…"/><p>Your words, with room to change your mind later.</p></div>
      {(validation||error)&&<p className="first-review-error" role="alert">{validation||error}</p>}
      <footer className="first-review-actions"><button type="submit" className="first-review-confirm" disabled={busy}>{busy?'saving your words…':'Build my worlds'}<Glyph name="arrow-right"/></button><button type="button" className="first-review-continue" disabled={busy} onClick={onContinue}>Keep talking</button><p>Keep talking leaves these edits unconfirmed. Your call stays open.</p></footer>
    </form>
  </dialog>,document.body);
}
