import {getSku,reviewsForSku,reviewStats} from '../catalog';
import {eligibleCatalog,sanitizeProfileForAI,scoreSku} from '../profile';
import {memoryConfidence} from '../memory';
import {getReferenceProduct} from '../reference-catalog';
import type {Profile,SKU} from '../types';

export const WORLD_CATALOG_NAMESPACE='world-simulation' as const;
const normalize=(value:string)=>value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const ignored=new Set(['i','my','me','the','a','an','for','and','or','to','of','in','on','is','it','want','need','find','show','please','buy','under','over','won','krw','something','products','product','world','worlds','from']);
/** Names and exact eligible IDs only; never diary entries or erased source stories. */
export function permittedVoiceWorlds(profile:Profile){
  const safe=sanitizeProfileForAI(profile),allowed=new Set(eligibleCatalog(profile).map(sku=>sku.id));
  const sourceIds=new Set(profile.memoryLines.filter(line=>!line.excludedFromAI&&line.kind!=='scripted'&&memoryConfidence(line)>=.2&&safe.memoryLines.some(memory=>memory.text===line.text&&memory.source===line.source)).map(line=>line.id));
  return(profile.journey?.districts||[]).filter(district=>district.sourceMemoryIds.every(id=>sourceIds.has(id))).map(district=>({
    id:district.id,name:district.name,products:district.scene.items.filter(item=>allowed.has(item.skuId)).map(item=>({skuId:item.skuId,name:getSku(item.skuId)!.name})),
  })).filter(district=>district.products.length);
}
function productFacts(sku:SKU){
  const evidence=reviewsForSku(sku.id).slice().sort((a,b)=>a.stars-b.stars||b.helpful-a.helpful).slice(0,3);
  const reference=getReferenceProduct(sku.id);
  return{skuId:sku.id,name:sku.name,origin:sku.origin||'synthetic',sourceUrl:sku.sourceUrl||null,image:sku.image||null,priceBasis:sku.priceBasis||'synthetic',sourceNote:sku.sourceNote||null,category:sku.category,productType:sku.type,price:sku.price,description:sku.description,facts:sku.facts,vibeTags:sku.vibeTags,palette:sku.palette,delivery:sku.delivery,preview:reference?.preview||{available:false},sourceReviewEvidence:reference?.reviewEvidence||null,reviewStats:reviewStats(sku.id),reviewIds:sku.reviewIds,reviews:evidence.map(review=>({id:review.id,stars:review.stars,text:review.text,helpful:review.helpful})),catalog_namespace:WORLD_CATALOG_NAMESPACE};
}
export function searchVoiceWorldProducts(profile:Profile,input:{query:string;max_price?:number|null}){
  const query=normalize(input.query),tokens=[...new Set(query.split(' ').filter(token=>token.length>1&&!ignored.has(token)))];
  const districtIds=new Set(permittedVoiceWorlds(profile).filter(district=>query.includes(normalize(district.name))).flatMap(district=>district.products.map(product=>product.skuId)));
  const products=eligibleCatalog(profile).filter(sku=>input.max_price==null||sku.price<=input.max_price).map(sku=>{
    const identity=normalize([sku.id,sku.name,...sku.aliases].join(' ')),attributes=normalize([sku.category,...sku.vibeTags,...sku.palette,sku.description].join(' '));
    const score=(districtIds.has(sku.id)?100:0)+tokens.reduce((sum,token)=>sum+(identity.includes(token)?8:attributes.includes(token)?1:0),0);
    return{sku,score};
  }).filter(row=>row.score>0).sort((a,b)=>b.score-a.score||scoreSku(profile,b.sku)-scoreSku(profile,a.sku)||a.sku.price-b.sku.price||a.sku.id.localeCompare(b.sku.id)).slice(0,4).map(row=>productFacts(row.sku));
  return{ok:true,catalog_namespace:WORLD_CATALOG_NAMESPACE,products,message:products.length?'These are eligible products from the app catalog. Each row identifies synthetic demo data or a sourced Coupang listing with a historical reference price. Sourced rows have no seeded reviews; unknown delivery remains unknown. Open the exact SKU for its evidence and approval controls.':'No eligible match in the world catalog. Ask one short clarification; do not invent a matching product.',purchased:false};
}
export function openVoiceWorldProduct(profile:Profile,skuId:string){
  const sku=eligibleCatalog(profile).find(product=>product.id===skuId);
  if(!sku)return{ok:false,catalog_namespace:WORLD_CATALOG_NAMESPACE,error:'That world product is unavailable, already owned or excluded from your current profile.',purchased:false};
  return{ok:true,catalog_namespace:WORLD_CATALOG_NAMESPACE,skuId:sku.id,product:productFacts(sku),purchased:false};
}
