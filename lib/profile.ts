import { catalog, getSku } from './catalog';
import type { MemoryLine, PriceBand, Profile, SKU, SwipeAction, SwipeReason } from './types';
import {remember, memoryConfidence, PRICE_TRAIT, REVIEW_TRAIT} from './memory';

const DAY = 24 * 60 * 60 * 1000;
const BANDS: PriceBand[] = ['under-10k', 'under-30k', 'under-70k', 'premium'];
const iso = (now: Date) => now.toISOString();
const clone = (profile: Profile): Profile => structuredClone(profile);
function touch(profile: Profile, now: Date): Profile {
  profile.revision += 1;
  profile.updatedAt = iso(now);
  return profile;
}

export function skuTraitKeys(sku: SKU): string[] {
  return [
    `category:${sku.category}`,
    ...sku.vibeTags.map((tag) => `${sku.category}:vibe:${tag}`),
    ...sku.palette.map((color) => `${sku.category}:palette:${color}`),
    `${sku.category}:priceBand:${sku.priceBand}`,
  ];
}

const allKnownTraits = new Set(catalog.flatMap(skuTraitKeys));
function excludedCategories(profile: Profile) {
  return new Set([
    ...profile.quarantine.filter((item) => item.sensitive).map((item) => item.category),
    ...catalog.filter((sku) => sku.sensitive).map((sku) => sku.category),
  ]);
}
function isSafeTrait(profile: Profile, key: string): boolean {
  if([PRICE_TRAIT,REVIEW_TRAIT,'habit:night-cancellations'].includes(key))return true;
  if(key.startsWith('choice:')){const sku=getSku(key.slice(7));return !!sku&&!sku.sensitive&&!excludedCategories(profile).has(sku.category);}
  const category = key.startsWith('category:') ? key.slice('category:'.length) : key.split(':')[0];
  return allKnownTraits.has(key) && !excludedCategories(profile).has(category);
}

export function createProfile(id: string, now: Date = new Date()): Profile {
  return {
    id,
    version: 1,
    revision: 0,
    traits: {},
    swipes: [],
    memoryLines: [],
    forgottenTraitKeys: [],
    summarizedSwipeCount: 0,
    owned: catalog.filter((sku) => sku.ownedByDefault).map((sku) => ({
      skuId: sku.id, acquiredAt: iso(new Date(now.getTime() - 21 * DAY)), source: 'seed',
    })),
    decisions: [],
    quarantine: [{ category: 'personal-care', sensitive: true, note: 'Sensitive category — excluded from scenes, Today, and AI taste memory by code.' }],
    xp: 0,
    budget: 150000,
    pretend2am: false,
    rehearsalClock: null,
    timezone: 'Asia/Seoul',
    answeredQuestionIds: [],
    updatedAt: iso(now),
  };
}

export interface SwipeInput {
  id: string;
  skuId: string;
  action: SwipeAction;
  reason?: SwipeReason;
  source: string;
}

/** All preference weights are code, not a model inference. Skip is weaker than an explicit dislike. */
export function applySwipe(profile: Profile, input: SwipeInput, now: Date = new Date()): Profile {
  if (profile.swipes.some((event) => event.id === input.id)) return profile;
  if (!input.id || input.id.length > 160) throw new Error('A valid swipe id is required.');
  if (!['ooh', 'skip', 'nah'].includes(input.action)) throw new Error('Invalid swipe action.');
  if (input.reason && !['too pricey', 'not my style', 'have one'].includes(input.reason)) throw new Error('Invalid swipe reason.');
  const sku = getSku(input.skuId);
  if (!sku) throw new Error('Unknown catalog item.');
  if (excludedCategories(profile).has(sku.category) || sku.sensitive) throw new Error('This sensitive category is quarantined.');
  const next = clone(profile);
  const contributions: Record<string, number> = {};
  const keys = skuTraitKeys(sku);
  if (input.reason === 'have one') {
    if (!next.owned.some((item) => item.skuId === sku.id)) {
      next.owned.push({ skuId: sku.id, acquiredAt: iso(now), source: 'have-one' });
    }
    // Ownership says nothing about whether the user likes an object's color or material.
  } else if (input.reason === 'too pricey') {
    const bandIndex = BANDS.indexOf(sku.priceBand);
    contributions[PRICE_TRAIT] = 1;
    contributions[`${sku.category}:priceBand:${sku.priceBand}`] = -3;
    for (const band of BANDS.slice(0, bandIndex)) {
      const key = `${sku.category}:priceBand:${band}`;
      if (allKnownTraits.has(key)) contributions[key] = 2;
    }
  } else if (input.reason === 'not my style') {
    for (const key of keys.filter((key) => key.includes(':vibe:') || key.includes(':palette:'))) contributions[key] = -3;
  } else {
    const weight = input.action === 'ooh' ? 2 : input.action === 'skip' ? -0.5 : -2;
    for (const key of keys) contributions[key] = weight;
  }
  next.swipes.push({ ...input, source: input.source.trim().slice(0, 100) || 'taste deck', at: iso(now), contributions });
  next.xp += 10;
  return remember(next,{id:'swipe:'+input.id,text:input.reason==='have one'?`already owns ${sku.name}`:input.reason==='too pricey'?`price-sensitive about ${sku.name}`:`${input.action==='ooh'?'likes':input.action==='skip'?'passed on':'dislikes'} ${sku.name}${input.reason?' — '+input.reason:''}`,source:`from your ${input.source.includes('stroll')?'stroll':input.source.includes('duel')?'duel':'day-0'} swipe${input.reason?' · '+input.reason:''}`,confidence:input.reason?0.9:input.action==='skip'?0.35:0.65,kind:'swipe',contributions},now);
}

export function deleteMemory(profile: Profile, lineId: string, now: Date = new Date()): Profile {
  const line = profile.memoryLines.find((memory) => memory.id === lineId);
  if (!line) return profile;
  const next = clone(profile);
  const erased = new Set(line.traitKeys);
  const removed=next.memoryLines.filter(memory=>memory.id===lineId||memory.traitKeys.some(key=>erased.has(key)));
  for(const memory of removed)for(const [key,value] of Object.entries(memory.contributions||{})){next.traits[key]=(next.traits[key]||0)-value;if(Math.abs(next.traits[key])<0.00001)delete next.traits[key];}
  for(const swipe of next.swipes)if(removed.some(memory=>memory.id==='swipe:'+swipe.id))swipe.contributions={};
  for (const key of erased) delete next.traits[key];
  for (const swipe of next.swipes) for (const key of erased) delete swipe.contributions[key];
  // Removing just the display sentence would leave the algorithm remembering it. Erase linked sentences too.
  next.memoryLines = next.memoryLines.filter((memory) => memory.id!==lineId&&!memory.traitKeys.some((key) => erased.has(key)));
  if(next.journey){
    const remaining=new Set(next.memoryLines.map(memory=>memory.id));
    const invalidated=next.journey.districts.filter(district=>!district.sourceMemoryIds.every(id=>remaining.has(id)));
    for(const district of invalidated){
      // Forgetting inferred context must not erase a diary someone deliberately wrote.
      // Preserve only saved entries and their snapshots, never current recommendations or provenance.
      const saved=(district.journal||[]).filter(entry=>typeof entry.text==='string'&&entry.text.trim()).map(entry=>({id:entry.id,text:entry.text,createdAt:entry.createdAt,districtName:entry.districtName,scene:entry.scene}));
      if(!saved.length)continue;
      const archives=next.journey.archivedJournals||[];
      const archive=archives.find(item=>item.id===district.id);
      if(archive){
        const known=new Set(archive.entries.map(entry=>entry.id));
        for(const entry of saved)if(!known.has(entry.id)){archive.entries.push(entry);known.add(entry.id);}
      }else archives.push({id:district.id,name:saved.at(-1)!.districtName,entries:saved});
      next.journey.archivedJournals=archives;
    }
    next.journey.districts=next.journey.districts.filter(district=>district.sourceMemoryIds.every(id=>remaining.has(id)));
    if(next.journey.pendingCall&&!remaining.has(next.journey.pendingCall.memoryId))delete next.journey.pendingCall;
    // A saved reply may repeat the deleted fact. New answers use surviving memory only.
    delete next.journey.lastReply;
  }
  if(removed.some(memory=>memory.id.startsWith('chapter:')))delete next.chapterAnswer;
  next.forgottenTraitKeys = [...new Set([...next.forgottenTraitKeys, ...erased])].sort();
  return touch(next, now);
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

export function installMemoryLines(
  profile: Profile,
  lines: { text: string; traitKeys: string[] }[],
  source: string,
  batchId: string,
  now: Date = new Date(),
): Profile {
  if (lines.length > 12) throw new Error('Too many memory lines.');
  let next = clone(profile);
  const assigned = new Set<string>();
  const additions: MemoryLine[] = [];
  for (const line of lines) {
    const text = line.text.trim();
    const keys = [...new Set(line.traitKeys)];
    if (!text || text.length > 240 || !keys.length || keys.length > 40) throw new Error('Invalid memory summary.');
    if (keys.some((key) => !profile.traits[key] || !isSafeTrait(profile, key) || profile.forgottenTraitKeys.includes(key))) {
      throw new Error('A memory line refers to an unknown, forgotten, or quarantined trait.');
    }
    if (keys.some((key) => assigned.has(key))) throw new Error('A trait must belong to only one new memory line.');
    keys.forEach((key) => assigned.add(key));
    additions.push({ id: `memory-${stableId(batchId + ':' + keys.join('|') + ':' + text)}`, text, traitKeys: keys, source: source.slice(0, 140), batchId, confidence:0.8,createdAt:iso(now) });
  }
  for(const line of additions)next=remember(next,{...line,kind:'summary'},now);
  next.summarizedSwipeCount = next.swipes.length;
  return touch(next, now);
}

export function markQuestionAnswered(profile: Profile, requestId: string, now: Date = new Date()): Profile {
  if (!requestId || profile.answeredQuestionIds.includes(requestId)) return profile;
  const next = clone(profile);
  next.answeredQuestionIds.push(requestId);
  next.xp += 5;
  return touch(next, now);
}

/** Never send the swipe log, sensitive records, ownership dates, or erased evidence to the model. */
export function sanitizeProfileForAI(profile: Profile) {
  const entries = Object.entries(profile.traits)
    .filter(([key, score]) => Number.isFinite(score) && score !== 0 && isSafeTrait(profile, key) && !profile.forgottenTraitKeys.includes(key))
    .sort(([a], [b]) => a.localeCompare(b));
  const safeKeys = new Set(entries.map(([key]) => key));
  return {
    traits: Object.fromEntries(entries.map(([key,score])=>{const evidence=profile.memoryLines.filter(line=>line.traitKeys.includes(key));return[key,Math.round(score*(evidence.length?Math.max(...evidence.map(line=>memoryConfidence(line))):1)*100)/100];})),
    memoryLines: [...new Map(profile.memoryLines
      .filter((line) => line.traitKeys.every((key) => safeKeys.has(key))&&memoryConfidence(line)>=0.2&&line.kind!=='scripted'&&!line.excludedFromAI)
      .map((line) => ({text:line.text,traitKeys:[...line.traitKeys].sort(),source:line.source,createdAt:line.createdAt?.slice(0,10),confidence:Math.round(memoryConfidence(line)*10)/10}))
      .map(line=>[JSON.stringify([line.text,line.source,line.traitKeys]),line])).values()].sort((a,b)=>a.text.localeCompare(b.text)),
    budget: profile.budget,
  };
}

export function eligibleCatalog(profile: Profile, _mode: 'scene' | 'today' | 'ask' = 'scene'): SKU[] {
  const owned = new Set(profile.owned.map((item) => item.skuId));
  const excluded = excludedCategories(profile);
  return catalog.filter((sku) => !owned.has(sku.id) && !sku.sensitive && !excluded.has(sku.category));
}

export function scoreSku(profile: Profile, sku: SKU): number {
  if (!eligibleCatalog(profile).some((item) => item.id === sku.id)) return -Infinity;
  const traits=sanitizeProfileForAI(profile).traits;
  return skuTraitKeys(sku).reduce((sum, key) => sum + (traits[key] || 0), 0)+(traits['choice:'+sku.id]||0)*3;
}
