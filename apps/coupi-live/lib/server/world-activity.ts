import {createHash} from 'node:crypto';
import {worldActivityInputSchema,worldSubject,activityForWorld,likedProductIds,type WorldActivityInput,type WorldActivityResponse,type WorldActivity} from '../world-activity';
import {remember} from '../memory';
import {deleteMemory} from '../profile';
import type {Profile} from '../types';
import {AppError} from './errors';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function updateWorldActivity(profile:Profile,raw:WorldActivityInput,now=new Date()):WorldActivityResponse {
 const input=worldActivityInputSchema.parse(raw),requestHash=hash(input),previous=profile.worldActivity;
 const receipt=previous?.receipts.find(item=>item.requestId===input.requestId);
 if(receipt){if(receipt.hash!==requestHash)throw new AppError('ACTIVITY_REQUEST_CHANGED','This action ID was already used. Try again with your current choice.',409);return{profile};}
 const subject=worldSubject(profile,input.worldId);if(!subject)throw new AppError('WORLD_NOT_FOUND','This world is unavailable in your current profile.',404);
 let next=structuredClone(profile);const activity:WorldActivity=structuredClone(previous||{worlds:[],products:[],receipts:[]});
 const reaction=structuredClone(activityForWorld(profile,input.worldId)),at=now.toISOString();
 if(input.action==='like')reaction.likedAt=input.liked?(reaction.likedAt||at):null;
 else if(input.action==='comment'){
  if(reaction.comments.length>=30)throw new AppError('COMMENT_LIMIT','This world has 30 private notes. Remove one before adding another.',409);
  reaction.comments.push({id:'comment-'+hash([input.requestId,input.worldId]).slice(0,24),text:input.text,createdAt:at});
 }else if(input.action==='deleteComment'){
  if(!reaction.comments.some(item=>item.id===input.commentId))throw new AppError('COMMENT_NOT_FOUND','That private note is not in this world.',404);
  reaction.comments=reaction.comments.filter(item=>item.id!==input.commentId);
 }else if(input.action==='review')reaction.review={rating:input.rating,text:input.text,updatedAt:at};
 else if(input.action==='deleteReview')reaction.review=null;
 else if(input.action==='productLike'){
  const sku=subject.products.find(item=>item.id===input.skuId);
  if(!sku)throw new AppError('PRODUCT_NOT_IN_WORLD','Choose an available product from this world. Owned and private categories are excluded.',409);
  const prior=activity.products.find(item=>item.skuId===sku.id),activeIds=new Set(likedProductIds(profile)),active=activeIds.has(sku.id);
  if(input.liked&&!active){
   // The limit counts usable preferences, not historical slots. Keep memory and receipts intact:
   // pruning this index must not resurrect forgotten evidence or erase surviving provenance.
   activity.products=activity.products.filter(item=>activeIds.has(item.skuId));
   if(activity.products.length>=30)throw new AppError('PRODUCT_LIKE_LIMIT','Keep up to 30 favorite products. Unsave one first.',409);
   const memoryId='product-like:'+hash([input.requestId,sku.id]).slice(0,24);
   next=remember(next,{id:memoryId,text:`I liked ${sku.name} as a starting object for a world. This is a preference, not ownership or permission to buy.`,source:'from your saved world products, '+now.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),confidence:.98,kind:'product-like',contributions:{['choice:'+sku.id]:1}},now);
   activity.products=activity.products.filter(item=>item.skuId!==sku.id);activity.products.push({skuId:sku.id,worldId:input.worldId,likedAt:at,memoryId});
  }else if(!input.liked&&prior){next=deleteMemory(next,prior.memoryId,now);activity.products=activity.products.filter(item=>item.skuId!==sku.id);}
 }
 const index=activity.worlds.findIndex(item=>item.worldId===input.worldId);
 if(index<0)activity.worlds.push(reaction);else activity.worlds[index]=reaction;
 activity.receipts=[...activity.receipts,{requestId:input.requestId,hash:requestHash}].slice(-256);
 next={...next,worldActivity:activity,revision:next.revision+1,updatedAt:at};
 return{profile:next};
}
