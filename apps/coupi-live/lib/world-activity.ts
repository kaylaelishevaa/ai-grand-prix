import {z} from 'zod';
import {worldTemplates} from '@/data/world-templates';
import {eligibleCatalog,sanitizeProfileForAI} from './profile';
import type {Profile,SceneResult,SKU} from './types';

export interface WorldComment {id:string;text:string;createdAt:string;}
export interface WorldReaction {worldId:string;likedAt:string|null;comments:WorldComment[];review:{rating:number;text:string;updatedAt:string}|null;}
export interface ProductLike {skuId:string;worldId:string;likedAt:string;memoryId:string;}
export interface WorldActivity {worlds:WorldReaction[];products:ProductLike[];receipts:{requestId:string;hash:string}[];}
export interface WorldActivityResponse {profile:Profile;}
export interface WorldSubject {id:string;name:string;scene:SceneResult;products:SKU[];}
const clean=(value:string)=>value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').trim();
const base={worldId:z.string().min(1).max(140),requestId:z.string().min(1).max(100)};
export const worldActivityInputSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('like'),liked:z.boolean()}).strict(),
 z.object({...base,action:z.literal('comment'),text:z.string().max(500).transform(clean).pipe(z.string().min(1))}).strict(),
 z.object({...base,action:z.literal('deleteComment'),commentId:z.string().min(1).max(100)}).strict(),
 z.object({...base,action:z.literal('review'),rating:z.number().int().min(1).max(5),text:z.string().max(500).transform(clean)}).strict(),
 z.object({...base,action:z.literal('deleteReview')}).strict(),
 z.object({...base,action:z.literal('productLike'),skuId:z.string().min(1).max(100),liked:z.boolean()}).strict(),
]);
export type WorldActivityInput=z.infer<typeof worldActivityInputSchema>;

/** Only this profile's current districts and the explicit editorial starter list exist here. */
export function worldSubject(profile:Profile,worldId:string):WorldSubject|undefined {
 const template=worldId.startsWith('template:')?worldTemplates.find(item=>worldId==='template:'+item.id):undefined;
 const district=worldId.startsWith('district:')?profile.journey?.districts.find(item=>worldId==='district:'+item.id):undefined;
 const found=template||district;if(!found)return;
 const eligible=new Map(eligibleCatalog(profile).map(sku=>[sku.id,sku]));
 const products=found.scene.items.map(item=>eligible.get(item.skuId)).filter((sku):sku is SKU=>!!sku);
 if(!products.length)return;
 return{id:worldId,name:found.name,scene:found.scene,products};
}
export function activityForWorld(profile:Profile,worldId:string):WorldReaction {
 return profile.worldActivity?.worlds.find(item=>item.worldId===worldId)||{worldId,likedAt:null,comments:[],review:null};
}
/** An erased preference, owned item or new quarantine can never silently act as an anchor. */
export function likedProductIds(profile:Profile):string[] {
 const eligible=new Set(eligibleCatalog(profile).map(sku=>sku.id)),safe=sanitizeProfileForAI(profile);
 return (profile.worldActivity?.products||[]).filter(item=>eligible.has(item.skuId)&&profile.memoryLines.some(line=>line.id===item.memoryId&&!line.excludedFromAI&&safe.memoryLines.some(memory=>memory.text===line.text&&memory.source===line.source))).map(item=>item.skuId);
}
export const hasLikedProductContext=(profile:Profile)=>likedProductIds(profile).length>0;
/** This is one profile's recent activity, never a popularity claim about other shoppers. */
export function weeklyLocalWorlds(profile:Profile,now=new Date()) {
 const start=now.getTime()-7*86400000;
 const favorites=(profile.worldActivity?.worlds||[]).filter(item=>item.likedAt&&Date.parse(item.likedAt)>=start&&Date.parse(item.likedAt)<=now.getTime()&&worldSubject(profile,item.worldId)).sort((a,b)=>b.likedAt!.localeCompare(a.likedAt!)).map(item=>item.worldId);
 return{label:favorites.length?'Your week’s favorites':'This week’s picks',note:favorites.length?'Your likes from the last 7 days · private to this profile':'Curated starting points · no public popularity data',worldIds:favorites.length?favorites:worldTemplates.filter(item=>worldSubject(profile,'template:'+item.id)).map(item=>'template:'+item.id)};
}
