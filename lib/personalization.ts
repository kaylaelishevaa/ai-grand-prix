import {z} from 'zod';
import type {MemoryLine,Profile} from './types';
import {catalog} from './catalog';
import {sanitizeProfileForAI} from './profile';

export const PERSONALIZATION_INTERESTS={cozy_home:'Cozy at home',focused_work:'My workspace',everyday_style:'Everyday style',beauty_play:'Beauty & color',outdoors:'Out & about'} as const;
const cleanText=(value:string)=>value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').trim();
export const personalizationReviewSchema=z.object({
  interests:z.array(z.enum(['cozy_home','focused_work','everyday_style','beauty_play','outdoors'])).max(5).refine(values=>new Set(values).size===values.length,'Choose each interest once.'),
  vibe:z.enum(['calm','bold','mixed']).nullable(),
  budgetPerItem:z.number().int().min(1).max(10_000_000).nullable(),
  story:z.string().max(1200).transform(cleanText),
}).strict();
export type PersonalizationReview=z.infer<typeof personalizationReviewSchema>;
export interface PersonalizationDraft {
  id:string;
  startedAt:string;
  answerCount:number;
  reviewReady:boolean;
  /** Proposed self-reports, never canonical memory or scene-generation context. */
  candidates:MemoryLine[];
  review?:PersonalizationReview;
}
export interface PersonalizationResponse {profile:Profile;draftId?:string;review?:PersonalizationReview;worldReady:boolean;}
export const personalizationInputSchema=z.object({
  action:z.enum(['start','draft','confirm','discard']),
  requestId:z.string().trim().min(1).max(100),
  draftId:z.string().trim().min(1).max(100).optional(),
  review:personalizationReviewSchema.optional(),
}).strict();
export type PersonalizationInput=z.infer<typeof personalizationInputSchema>;

/** Re-check current quarantine when a draft is reopened; its old exclusion flag can be stale. */
export function safePersonalizationCandidates(profile:Profile,draft:PersonalizationDraft):MemoryLine[]{
  const safe=sanitizeProfileForAI({...profile,memoryLines:draft.candidates,traits:{}});
  const excluded=new Set(profile.quarantine.filter(item=>item.sensitive).map(item=>item.category));
  const privateProducts=catalog.filter(sku=>sku.sensitive||excluded.has(sku.category));
  const privateTerms=privateProducts.flatMap(sku=>[sku.name,...sku.aliases,sku.category]).map(value=>value.toLocaleLowerCase());
  const privateTypes=new Set(privateProducts.map(sku=>sku.type.toLocaleLowerCase()));
  return draft.candidates.filter(line=>!line.excludedFromAI&&!privateTerms.some(term=>line.text.toLocaleLowerCase().includes(term))&&!line.text.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).some(word=>privateTypes.has(word))&&safe.memoryLines.some(item=>item.text===line.text&&item.source===line.source)).map(line=>structuredClone(line));
}
