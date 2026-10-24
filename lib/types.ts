import type {JourneyState} from './journey-types';
export type PriceBand = 'under-10k' | 'under-30k' | 'under-70k' | 'premium';
export interface SKU {id:string;name:string;type:string;color?:string;price:number;category:string;vibeTags:string[];palette:string[];priceBand:PriceBand;ownedByDefault?:boolean;sensitive?:boolean;aliases:string[];description:string;facts:Record<string,string|number|boolean>;reviewIds:string[];delivery:string;}
export interface Review {id:string;skuId:string;stars:number;date:string;author:string;title:string;text:string;helpful:number;photo:boolean;tags:string[];relevant?:boolean;}
export type SwipeAction='ooh'|'skip'|'nah';
export type SwipeReason='too pricey'|'not my style'|'have one';
export interface Swipe {id:string;skuId:string;action:SwipeAction;reason?:SwipeReason;source:string;at:string;contributions:Record<string,number>;}
export interface MemoryLine {id:string;text:string;traitKeys:string[];source:string;batchId:string;confidence:number;createdAt:string;confirmedAt?:string;kind?:string;contributions?:Record<string,number>;excludedFromAI?:boolean;}
export interface OwnedItem {skuId:string;acquiredAt:string;source:'seed'|'approved'|'have-one';}
export interface DecisionDelegation {budgetCap:number;watchPrice:boolean;haggle:boolean;bundle:boolean;scheduleDelivery:boolean;status:'watching'|'haggled'|'ready';quotedPrice:number;discount:number;floorPrice:number;bundledDecisionIds:string[];deliveryPlan:string|null;checkedAt:string;simulation:true;}
export interface Decision {id:string;skuId:string;source:string;addedAt:string;lockedUntil:string|null;approvedAt:string|null;delegation?:DecisionDelegation;}
export interface Quarantine {category:string;sensitive:true;note:string;}
export interface Profile {journey?:JourneyState;id:string;version:1;revision:number;traits:Record<string,number>;swipes:Swipe[];memoryLines:MemoryLine[];forgottenTraitKeys:string[];summarizedSwipeCount:number;owned:OwnedItem[];decisions:Decision[];quarantine:Quarantine[];xp:number;budget:number;pretend2am:boolean;timezone:string;answeredQuestionIds:string[];updatedAt:string;memoryEventIds?:string[];lastVerdict?:{requestId:string;pickSkuId:string;runnerUpSkuId:string|null};chapterAnswer?:'yes'|'not yet';}
export interface SceneItem {skuId:string;oneLiner:string;}
export interface SceneResult {name:string;explanation:string;items:SceneItem[];}
export interface Verdict {pickSkuId:string|null;reason:string;dissent:string;citations:string[];runnerUpSkuId:string|null;whyRunnerUpLost:string;clarifyingQuestion:string|null;}
export interface InventoryItem {name:string;quantity:string;status:'present'|'low'|'uncertain';}
export interface ScanResult {items:InventoryItem[];lowOrMissing:{name:string;reason:string;confidence:'high'|'medium'|'low'}[];uncertainties:string[];}
export interface CallMeta {cached:boolean;offline:boolean;model:string;inputTokens:number;outputTokens:number;latencyMs:number;cacheKey:string;}
export interface ApiError {error:string;code:string;}
export interface ProfileResponse {profile:Profile;summaryError?:string;summaryMeta?:CallMeta;}
export type AskResponse={status:'verdict'|'clarify';verdict:Verdict;profile:Profile;meta:CallMeta}|{status:'blocked';message:string;skuId:string;profile:Profile}|{status:'fallback';message:string;catalog:SKU[];reviews:Review[];profile:Profile};
export interface SceneResponse {scene:SceneResult;profile:Profile;meta:CallMeta;}
export interface ScanResponse {inventory:ScanResult;mappedSkuIds:string[];unmapped:string[];profile:Profile;meta:CallMeta;blocked:string[];}
