import {catalog,getSku, reviewStats} from './catalog';
import type {MemoryLine, Profile} from './types';

export const REVIEW_TRAIT = 'priority:reviews-over-price';
export const PRICE_TRAIT = 'priority:price';
const DAY = 86400000;
function compactId(value:string){if(value.length<=96)return value;let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);return 'memory-'+(hash>>>0).toString(16);}

/** One writer for observed interactions. Event IDs also prevent retries resurrecting erased evidence. */
export function remember(profile:Profile, event:{id:string;text:string;source:string;confidence:number;kind:string;contributions?:Record<string,number>;traitKeys?:string[]}, now=new Date()):Profile {
  event={...event,id:compactId(event.id)};
  if(profile.memoryEventIds?.includes(event.id)||profile.memoryLines.some(line=>line.id===event.id))return profile;
  const next=structuredClone(profile);
  const lower=event.text.toLocaleLowerCase();
  const excludedFromAI=catalog.filter(sku=>sku.sensitive||profile.quarantine.some(q=>q.sensitive&&q.category===sku.category)).some(sku=>[sku.name,...sku.aliases,sku.category].some(term=>lower.includes(term.toLocaleLowerCase())));
  const contributions=excludedFromAI?{}:event.contributions||{};
  next.memoryLines.push({id:event.id,text:event.text.trim().slice(0,400),source:event.source.slice(0,140),confidence:Math.max(0,Math.min(1,event.confidence)),createdAt:now.toISOString(),kind:event.kind,batchId:event.id,traitKeys:excludedFromAI?[]:event.traitKeys||Object.keys(contributions),contributions,excludedFromAI});
  next.memoryEventIds=[...(next.memoryEventIds||[]),event.id];
  for(const [key,value] of Object.entries(contributions))next.traits[key]=(next.traits[key]||0)+value;
  next.forgottenTraitKeys=next.forgottenTraitKeys.filter(key=>!(key in contributions));
  next.revision++;next.updatedAt=now.toISOString();
  return next;
}

export function memoryConfidence(line:MemoryLine, now=new Date()):number {
  const base=line.confidence??0.65;
  const age=Math.max(0,now.getTime()-Date.parse(line.confirmedAt||line.createdAt||now.toISOString()))/DAY;
  return Math.max(0,Math.min(1,base*Math.pow(0.5,age/(base<0.8?14:90))));
}

export function confirmMemory(profile:Profile,id:string,now=new Date()):Profile {
  const next=structuredClone(profile),line=next.memoryLines.find(line=>line.id===id);
  if(!line)return profile;
  line.confidence=0.98;line.confirmedAt=now.toISOString();
  line.source='reconfirmed by you · '+line.source.replace(/^reconfirmed by you · /,'');
  next.revision++;next.updatedAt=now.toISOString();return next;
}

export function rememberWords(profile:Profile,text:string,id:string,kind:'ask'|'scene'|'call',now=new Date()):Profile {
  const source=kind==='ask'?'from your words':kind==='scene'?'from your scene rebuild':'from your call statement';
  const positive=(pattern:RegExp)=>text.split(/[.!?;—]/).some(clause=>pattern.test(clause)&&! /\b(not|never|don't|do not|no longer)\b/i.test(clause));
  const pricey=positive(/\b(cheap(?:est|er)?|budget|affordable|price[- ]sensitive|under\s*[₩$\d]|less expensive|lowest price|price (?:over|above|before) reviews)\b/i);
  const reviews=positive(/\b(reviews? (?:over|above|before) price|best[- ]reviewed|better reviews)\b/i);
  const contributions:Record<string,number>={};
  if(pricey)contributions[PRICE_TRAIT]=1;
  if(reviews)contributions[REVIEW_TRAIT]=1;
  return remember(profile,{id,text:pricey?'price-sensitive — “'+text+'”':reviews?'weighs reviews over price — “'+text+'”':text,source,confidence:pricey||reviews?0.8:0.9,kind,contributions},now);
}

/** A choice can suggest a tradeoff, but a tied review score cannot establish one. */
export function rememberVerdictChoice(profile:Profile,requestId:string,skuId:string,now=new Date()):Profile {
  const verdict=profile.lastVerdict;
  if(!verdict||verdict.requestId!==requestId||skuId!==verdict.runnerUpSkuId)throw new Error('Choose the runner-up from your latest verdict.');
  const chosen=getSku(skuId)!,pick=getSku(verdict.pickSkuId)!;
  const reviewTradeoff=chosen.price>pick.price&&(reviewStats(chosen.id).average||0)>(reviewStats(pick.id).average||0);
  return remember(profile,{id:'verdict-choice:'+requestId,text:reviewTradeoff?'weighs reviews over price':`chose ${chosen.name} over ${pick.name}`,source:'from your verdict choice',confidence:reviewTradeoff?0.68:0.55,kind:'verdict',contributions:reviewTradeoff?{[REVIEW_TRAIT]:1}:{['choice:'+chosen.id]:1}},now);
}

export function reviewPreference(profile:Profile,now=new Date()) {
  return profile.memoryLines.filter(line=>line.kind!=='scripted'&&!line.excludedFromAI&&line.traitKeys.includes(REVIEW_TRAIT)&&!profile.forgottenTraitKeys.includes(REVIEW_TRAIT)&&memoryConfidence(line,now)>=0.2).sort((a,b)=>memoryConfidence(b,now)-memoryConfidence(a,now))[0];
}

/** Old saved profiles are upgraded in place without replacing their evidence. */
export function migrateMemory(profile:Profile):Profile {
  profile.memoryLines=profile.memoryLines.map(line=>({...line,confidence:line.confidence??0.65,createdAt:line.createdAt||profile.swipes[Math.max(0,Number(line.batchId?.replace('swipes-',''))-1)]?.at||profile.updatedAt}));
  return profile;
}
