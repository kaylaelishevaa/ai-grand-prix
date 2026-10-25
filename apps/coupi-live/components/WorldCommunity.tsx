'use client';
import {useEffect,useRef,useState} from 'react';
import type {Profile} from '@/lib/types';
import {activityForWorld,likedProductIds,worldSubject,type WorldActivityInput,type WorldActivityResponse} from '@/lib/world-activity';
import {ProductVisual} from './ProductEvidence';
import './world-community.css';

export interface WorldCommunityProps {profile:Profile;worldId:string;onProfile:(profile:Profile)=>void;onBuild?:(selectedSkuIds:string[],avoidSkuIds?:string[])=>void;disabled?:boolean;}
type Action=WorldActivityInput extends infer T?T extends WorldActivityInput?Omit<T,'requestId'|'worldId'>:never:never;

/** Reactions are private profile records. These controls do not publish, buy or grant autonomy. */
export default function WorldCommunity({profile,worldId,onProfile,onBuild,disabled=false}:WorldCommunityProps){
 const subject=worldSubject(profile,worldId),reaction=activityForWorld(profile,worldId),liked=likedProductIds(profile);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[comment,setComment]=useState(''),[rating,setRating]=useState(reaction.review?.rating||0),[review,setReview]=useState(reaction.review?.text||''),[selected,setSelected]=useState<string[]>(()=>subject?.products.filter(item=>liked.includes(item.id)).map(item=>item.id).slice(0,3)||[]);
 const current=useRef({profile,worldId,onProfile}),flight=useRef<AbortController|null>(null),epoch=useRef(0),pending=useRef<{fingerprint:string;id:string}|null>(null);
 current.current={profile,worldId,onProfile};
 useEffect(()=>{const generation=++epoch.current;setBusy(false);setError('');setComment('');setRating(reaction.review?.rating||0);setReview(reaction.review?.text||'');setSelected(subject?.products.filter(item=>liked.includes(item.id)).map(item=>item.id).slice(0,3)||[]);pending.current=null;return()=>{if(epoch.current===generation)epoch.current++;flight.current?.abort();flight.current=null;};},[profile.id,worldId]); // A different profile/world owns a different composer.
 const activeSelected=selected.filter(id=>liked.includes(id)&&subject?.products.some(item=>item.id===id)).slice(0,3);
 async function act(action:Action):Promise<boolean>{
  if(disabled||flight.current)return false;
  const controller=new AbortController(),generation=epoch.current,profileId=profile.id,fingerprint=JSON.stringify([worldId,action]);flight.current=controller;
  if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,id:crypto.randomUUID()};
  const requestId=pending.current.id;setBusy(true);setError('');
  try{
   const response=await fetch('/api/world/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...action,worldId,requestId}),signal:controller.signal});
   const data=await response.json() as WorldActivityResponse&{error?:string};
   if(controller.signal.aborted||epoch.current!==generation||current.current.profile.id!==profileId||current.current.worldId!==worldId)return false;
   if(!response.ok||!data.profile)throw new Error(data.error||'That change could not be saved. Try again.');
   if(data.profile.id!==profileId)throw new Error('Your profile changed. Reload this world before saving.');
   pending.current=null;
   if(data.profile.revision>=current.current.profile.revision)current.current.onProfile(data.profile);
   return true;
  }catch(cause){if(!controller.signal.aborted&&epoch.current===generation)setError(cause instanceof Error?cause.message:'Could not save this change.');return false;}
  finally{if(flight.current===controller)flight.current=null;if(epoch.current===generation)setBusy(false);}
 }
 if(!subject)return null;
 const locked=disabled||busy;
 return <section className="world-community" aria-label={`Your notes on ${subject.name}`} aria-busy={busy}>
  <div className="world-community-heading"><div><h3>Make a little of it yours</h3><p>Private to this profile · local simulation</p></div><button type="button" className="world-like" aria-pressed={!!reaction.likedAt} disabled={locked} onClick={()=>void act({action:'like',liked:!reaction.likedAt})}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 5.8c-2.3-2.6-6.4-1.5-8.5 1-2.1-2.5-6.2-3.6-8.5-1-3.1 3.5.8 7.5 8.5 13.2 7.7-5.7 11.6-9.7 8.5-13.2Z"/></svg>{reaction.likedAt?'Liked':'Like world'}</button></div>
  {error&&<p className="world-community-error" role="alert">{error}</p>}
  <details className="world-community-section"><summary>Save products · build your own version</summary><p className="world-community-hint">Save what you like, then choose up to 3 starting objects. Coopy adds a different bundle. Saving changes your preferences; it never buys.</p>
   <div className="world-community-products">{subject.products.map(sku=>{const saved=liked.includes(sku.id),chosen=activeSelected.includes(sku.id);return <div key={sku.id} className="world-community-product"><ProductVisual sku={sku}/><div><strong>{sku.name}</strong><small>₩{sku.price.toLocaleString()}{sku.priceBasis==='historical-reference'?' · historical reference':' · simulated price'}</small><button type="button" className="world-product-save" disabled={locked} aria-pressed={saved} onClick={async()=>{if(await act({action:'productLike',skuId:sku.id,liked:!saved}))setSelected(ids=>saved?ids.filter(id=>id!==sku.id):ids.includes(sku.id)?ids:ids.length<3?[...ids,sku.id]:ids);}}>{saved?'Saved · remove':'Save preference'}</button></div><label className="world-anchor-choice"><input type="checkbox" aria-label={`Build around ${sku.name}`} checked={chosen} disabled={locked||!saved||(!chosen&&activeSelected.length>=3)} onChange={()=>setSelected(ids=>chosen?ids.filter(id=>id!==sku.id):[...ids.filter(id=>liked.includes(id)),sku.id].slice(0,3))}/><span>Use</span></label></div>;})}</div>
   {onBuild&&<button type="button" className="world-build-button" disabled={locked||!activeSelected.length} onClick={()=>onBuild(activeSelected,subject.products.filter(item=>!activeSelected.includes(item.id)).map(item=>item.id))}>Build around {activeSelected.length||'my'} {activeSelected.length===1?'product':'products'} <span aria-hidden="true">↗</span></button>}
  </details>
  <details className="world-community-section"><summary>{reaction.review?'Your world review':'Review this world'}</summary><p className="world-community-hint">How well does this world fit you? This is a personal world review, not a product review.</p><div className="world-rating" role="group" aria-label="Rate this world"><span>Fit for me</span>{[1,2,3,4,5].map(value=><button key={value} type="button" aria-label={`${value} out of 5`} aria-pressed={rating===value} disabled={locked} onClick={()=>setRating(value)}>{value}</button>)}</div><label className="world-community-label">Your review <span>(optional)</span><textarea maxLength={500} rows={2} value={review} disabled={locked} onChange={event=>setReview(event.target.value)} placeholder="What would make this more you?"/></label><div className="world-community-actions"><button type="button" disabled={locked||!rating} onClick={()=>void act({action:'review',rating,text:review})}>{reaction.review?'Update review':'Save review'}</button>{reaction.review&&<button type="button" disabled={locked} onClick={async()=>{if(await act({action:'deleteReview'})){setRating(0);setReview('');}}}>Remove review</button>}</div></details>
  <details className="world-community-section"><summary>Private notes{reaction.comments.length?` · ${reaction.comments.length}`:''}</summary><p className="world-community-hint">A small diary for this world. These notes are not shared or used as shopping preferences.</p><form onSubmit={async event=>{event.preventDefault();if(await act({action:'comment',text:comment}))setComment('');}}><label className="world-community-label">Add a note<textarea maxLength={500} rows={2} value={comment} disabled={locked} onChange={event=>setComment(event.target.value)} placeholder="A plan, a memory, a little idea…"/></label><button type="submit" disabled={locked||!comment.trim()}>Save note</button></form><ol className="world-private-notes">{reaction.comments.map(note=><li key={note.id}><p>{note.text}</p><div><time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleDateString(undefined,{day:'numeric',month:'short'})}</time><button type="button" disabled={locked} onClick={()=>void act({action:'deleteComment',commentId:note.id})}>Delete note</button></div></li>)}</ol></details>
 </section>;
}
