import catalog from '../data/teammate-catalog.json';

export interface CallReceiptLine {id:string;name:string;image:string;url:string;quantity:number;unitPrice:number;lineTotal:number;}
export interface CallReceipt {id:string;createdAt:string;items:CallReceiptLine[];total:number;currency:'KRW';paymentMethod:'demo-card'|'demo-wallet';simulation:true;}
type ReceiptStorage=Pick<Storage,'getItem'|'setItem'>;
const products=new Map(catalog.map(product=>[String(product.id),product]));
const key=(profileId:string)=>/^[A-Za-z0-9_-]{1,100}$/.test(profileId)?'coupi.call.receipts.v1.'+profileId:null;
const object=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;

/** Accept only the actual demo checkout shape and prices from the approved call catalog. */
export function validateCallReceipt(input:unknown,createdAt=new Date().toISOString()):CallReceipt|null {
  const receipt=object(input);
  if(!receipt||typeof receipt.id!=='string'||!/^DEMO-[A-Za-z0-9-]{1,75}$/.test(receipt.id)||receipt.demo!==true||receipt.payment_processed!==false||receipt.order_placed!==false||receipt.currency!=='KRW'||!['demo-card','demo-wallet'].includes(String(receipt.paymentMethod))||!Array.isArray(receipt.items)||!receipt.items.length||receipt.items.length>100||!Array.isArray(receipt.item_ids)||receipt.item_ids.length!==receipt.items.length||!Number.isFinite(Date.parse(createdAt)))return null;
  const items:CallReceiptLine[]=[],seen=new Set<string>();
  for(let index=0;index<receipt.items.length;index++){
    const item=object(receipt.items[index]),product=item&&typeof item.id==='string'?products.get(item.id):undefined;
    if(!item||!product||seen.has(product.id)||receipt.item_ids[index]!==product.id||object(item.product)?.id!==product.id||item.included!==true||!Number.isInteger(item.quantity)||Number(item.quantity)<1||Number(item.quantity)>9||!Number.isSafeInteger(product.price)||item.unitPrice!==product.price||item.lineTotal!==Number(item.quantity)*Number(product.price))return null;
    seen.add(product.id);items.push({id:product.id,name:product.name,image:product.image,url:product.url,quantity:Number(item.quantity),unitPrice:Number(product.price),lineTotal:Number(item.lineTotal)});
  }
  const total=items.reduce((sum,item)=>sum+item.lineTotal,0);
  if(!Number.isSafeInteger(total)||receipt.referenceTotal!==total)return null;
  return {id:receipt.id,createdAt,items,total,currency:'KRW',paymentMethod:receipt.paymentMethod as CallReceipt['paymentMethod'],simulation:true};
}

export function readCallReceipts(profileId:string,storage:Pick<Storage,'getItem'>):CallReceipt[]{
  const name=key(profileId);if(!name)return [];
  try{
    const stored=JSON.parse(storage.getItem(name)||'null');if(stored?.version!==1||stored.profileId!==profileId||!Array.isArray(stored.receipts))return [];
    return stored.receipts.slice(0,30).flatMap((entry:unknown)=>{
      const value=object(entry);if(!value||typeof value.createdAt!=='string'||!Array.isArray(value.items))return [];
      const receipt=validateCallReceipt({id:value.id,currency:'KRW',paymentMethod:value.paymentMethod,demo:true,payment_processed:false,order_placed:false,referenceTotal:value.total,item_ids:value.items.map(item=>object(item)?.id),items:value.items.map(item=>({...object(item),product:{id:object(item)?.id},included:true}))},value.createdAt);
      return receipt?[receipt]:[];
    });
  }catch{return [];}
}

export function saveCallReceipt(profileId:string,input:unknown,storage:ReceiptStorage,now=new Date()):{ok:boolean;receipt?:CallReceipt;error?:string}{
  const name=key(profileId),receipt=validateCallReceipt(input,now.toISOString());
  if(!name||!receipt)return {ok:false,error:'That call receipt could not be saved to your orders.'};
  try{
    const existing=readCallReceipts(profileId,storage),duplicate=existing.find(item=>item.id===receipt.id);
    if(duplicate){if(JSON.stringify({...duplicate,createdAt:''})!==JSON.stringify({...receipt,createdAt:''}))return {ok:false,error:'That receipt ID already belongs to a different checkout.'};return {ok:true,receipt:duplicate};}
    storage.setItem(name,JSON.stringify({version:1,profileId,receipts:[receipt,...existing].slice(0,30)}));return {ok:true,receipt};
  }catch{return {ok:false,error:'Your browser could not save this receipt. Keep the confirmation open.'};}
}
