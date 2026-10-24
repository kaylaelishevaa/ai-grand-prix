import {getSku} from './catalog';
import type {CallResponse} from './journey-types';

export interface LiveCallTurn {id:string;text:string;photo?:{dataUrl:string;mime:'image/jpeg';capturedAt:string};}
const FRAME_ERROR='That camera frame could not be shared. Try another frame, or type instead.';
function frameBytes(dataUrl:string):Uint8Array<ArrayBuffer> {
  if(dataUrl.length>22000||!/^data:image\/jpeg;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataUrl))throw new Error(FRAME_ERROR);
  try{
    const bytes=Uint8Array.from(atob(dataUrl.slice('data:image/jpeg;base64,'.length)),char=>char.charCodeAt(0));
    if(bytes.length<3||bytes[0]!==0xff||bytes[1]!==0xd8||bytes[2]!==0xff)throw new Error(FRAME_ERROR);
    return bytes;
  }catch{throw new Error(FRAME_ERROR);}
}

/** Bound each opted-in frame before it enters the same multipart endpoint as a typed call. */
export function parseLiveCallTurn(value:unknown):LiveCallTurn|null {
  if(!value||typeof value!=='object')return null;
  const row=value as Record<string,unknown>;
  if(row.role!=='user'||row.synthetic===true||row.final===false||typeof row.id!=='string'||typeof row.text!=='string')return null;
  const id=row.id,text=row.text.trim().slice(0,2000);
  // Preserve the child's correlation ID exactly; truncation would merge different turns.
  if(!/^[A-Za-z0-9:_-]{1,90}$/.test(id)||!text)return null;
  const turn:LiveCallTurn={id,text};
  if(row.photo!==undefined){
    const photo=row.photo as Record<string,unknown>;
    if(!photo||photo.mime!=='image/jpeg'||typeof photo.dataUrl!=='string'||typeof photo.capturedAt!=='string'||photo.capturedAt.length>64||!Number.isFinite(Date.parse(photo.capturedAt)))throw new Error(FRAME_ERROR);
    frameBytes(photo.dataUrl);
    turn.photo={dataUrl:photo.dataUrl,mime:'image/jpeg',capturedAt:photo.capturedAt};
  }
  return turn;
}

export function liveCallBody(turn:LiveCallTurn):{body:string|FormData;headers?:Record<string,string>} {
  const input={action:'message',requestId:'live-call:'+turn.id,message:turn.text};
  if(!turn.photo)return{body:JSON.stringify(input),headers:{'Content-Type':'application/json'}};
  const bytes=frameBytes(turn.photo.dataUrl);
  const body=new FormData();for(const [key,value] of Object.entries(input))body.set(key,value);
  body.set('file',new Blob([bytes],{type:'image/jpeg'}),'shared-frame.jpg');
  return{body};
}

/** The child and Realtime receive evidence for this turn, never the full profile or private diary. */
export function publicCallResult(result:CallResponse) {
  const ids=[...new Set([result.verdict?.pickSkuId,result.verdict?.runnerUpSkuId,...result.proposedSkuIds].filter((id):id is string=>!!id))];
  const verdict=result.verdict?{pickSkuId:result.verdict.pickSkuId,reason:result.verdict.reason,dissent:result.verdict.dissent,citations:[...result.verdict.citations],runnerUpSkuId:result.verdict.runnerUpSkuId,whyRunnerUpLost:result.verdict.whyRunnerUpLost,clarifyingQuestion:result.verdict.clarifyingQuestion}:undefined;
  const inventory=result.inventory?{items:result.inventory.items.map(item=>({name:item.name,quantity:item.quantity,status:item.status})),lowOrMissing:result.inventory.lowOrMissing.map(item=>({name:item.name,reason:item.reason,confidence:item.confidence})),uncertainties:[...result.inventory.uncertainties]}:undefined;
  return {status:result.status,message:result.message,question:result.question,conversationMode:result.conversationMode,interviewCount:result.interviewCount,interviewComplete:result.interviewComplete,worldReady:result.worldReady,verdict,inventory,proposedSkuIds:[...result.proposedSkuIds],
    products:ids.flatMap(id=>{const sku=getSku(id);return sku?[{id:sku.id,name:sku.name,price:sku.price,delivery:sku.delivery,origin:sku.origin||'synthetic',priceBasis:sku.priceBasis,image:sku.image,sourceUrl:sku.sourceUrl,sourceNote:sku.sourceNote}]:[];})};
}
