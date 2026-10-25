import records from '../data/teammate-catalog.json';
import latestRecords from '../data/verified-catalog.json';
import sceneRecords from '../data/scene-reference-catalog.json';
import type {PriceBand,SKU} from './types';

/** Keep legacy IDs and order, refresh exact overlaps, then append newly sourced options. */
export interface ReferenceProduct {
  id:string; name:string; category:string; productType:string; url:string;
  price:number|null; priceStatus:string; image:string; sourceNote:string; checkedAt:string;
  brand:string; aliases:string[]; tags:string[]; verifiedAttributes:string[];
  sourceImageUrl?:string; imageSourcePage?:string; imageSha256?:string; sourceProductId?:string;
  preview:Record<string,unknown>; reviewEvidence?:Record<string,unknown>;
}
const currentRecords:ReferenceProduct[]=[...latestRecords,...sceneRecords];
const latestById=new Map<string,ReferenceProduct>(currentRecords.map(product=>[product.id,product]));
const legacyIds=new Set(records.map(product=>product.id));
export const referenceProducts:ReferenceProduct[]=[
  ...records.map(product=>latestById.get(product.id)||product),
  ...currentRecords.filter(product=>!legacyIds.has(product.id)),
];
const references=new Map(referenceProducts.map(product=>[product.id,product]));
export const getReferenceProduct=(id:string):ReferenceProduct|undefined=>references.get(id);
const categories:Record<string,string>={makeup:'beauty',desk:'home',clothes:'wardrobe',glasses:'wardrobe'};
const priceBand=(price:number):PriceBand=>price<10000?'under-10k':price<30000?'under-30k':price<70000?'under-70k':'premium';

/** No null-to-zero conversion: an unpriced listing can be previewed, never quoted or recommended. */
export function adaptReferenceProduct(product:ReferenceProduct):SKU|null {
  if(product.priceStatus!=='reference'||typeof product.price!=='number'||!Number.isSafeInteger(product.price)||product.price<=0)return null;
  const sourceType=product.productType==='glasses'?(product.tags.includes('sunglasses')?'sunglasses':'eyeglasses'):product.productType;
  return {
    id:product.id,name:product.name,type:product.productType,category:categories[product.category]||product.category,
    price:product.price,priceBand:priceBand(product.price),vibeTags:[],palette:[],
    aliases:[...product.aliases],description:product.verifiedAttributes[0]||product.name,
    origin:'coupang-reference',sourceUrl:product.url,sourceNote:product.sourceNote,
    image:product.image,checkedAt:product.checkedAt,priceBasis:'historical-reference',
    reviewIds:[],delivery:'Delivery unknown · check the sourced listing',
    facts:{
      dataOrigin:'Sourced Coupang listing reference; not a synthetic SKU',
      brand:product.brand,sourceTitle:product.name,sourceCategory:product.category,
      comparisonGroup:'reference:'+sourceType,
      priceStatus:'Historical reference, not a live quote',deliveryStatus:'unknown',
      reviewStatus:'Not available for this reference',stockStatus:'unverified',
      ...Object.fromEntries(product.verifiedAttributes.map((attribute,index)=>['listingAttribute'+(index+1),attribute])),
    },
  };
}

/** Only positive, explicitly sourced prices enter the numeric shopping/approval domain. */
export const pricedReferenceSkus:SKU[]=referenceProducts.map(adaptReferenceProduct).filter((product):product is SKU=>product!==null);
