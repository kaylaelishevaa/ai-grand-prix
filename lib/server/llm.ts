import {performance} from 'node:perf_hooks';
import type {CallMeta} from '../types';
import {ResponseCache,requestHash} from './cache';
import {AppError} from './errors';
const RESPONSE_URL='https://api.openai.com/v1/responses';
export interface StructuredRequest<T>{operation:string;instructions:string;input:unknown;schema:Record<string,unknown>;validate:(value:unknown)=>T;image?:{dataUrl:string;sha256:string};maxAttempts?:number;maxOutputTokens?:number;}
interface Dependencies{fetch?:typeof fetch;cache?:ResponseCache;env?:NodeJS.ProcessEnv;}
export async function structuredCall<T>(request:StructuredRequest<T>,deps:Dependencies={}):Promise<{data:T;meta:CallMeta}>{
 if(typeof window!=='undefined')throw new Error('Server only');
 const env=deps.env||process.env,model=env.OPENAI_MODEL?.trim();
 if(!model)throw new AppError('MODEL_NOT_CONFIGURED','Set OPENAI_MODEL in .env.local and restart the app.',503);
 const offline=env.DEMO_OFFLINE==='1',cache=deps.cache||new ResponseCache();
 const cacheKey=requestHash({version:2,operation:request.operation,model,instructions:request.instructions,input:request.input,schema:request.schema,imageHash:request.image?.sha256});
 const start=performance.now();const cached=await cache.get<T>(cacheKey);
 if(cached){try{const data=request.validate(cached.output),meta={...cached.meta,cached:true,offline,inputTokens:0,outputTokens:0,latencyMs:Math.round(performance.now()-start)};console.info('[coupi:model]',JSON.stringify({operation:request.operation,...meta}));return{data,meta};}catch{if(offline)throw new AppError('OFFLINE_CACHE_INVALID','DEMO_OFFLINE: this cached response no longer passes validation. Rehearse this request online again.',503);}}
 if(offline)throw new AppError('OFFLINE_CACHE_MISS',`DEMO_OFFLINE cache miss for ${request.operation} (${cacheKey.slice(0,12)}). No network request was made. Rehearse this exact path online first.`,503);
 const key=env.OPENAI_API_KEY?.trim();if(!key)throw new AppError('KEY_NOT_CONFIGURED','Set OPENAI_API_KEY in .env.local and restart the app.',503);
 let correction='',inputTokens=0,outputTokens=0;
 const attempts=Math.min(Math.max(request.maxAttempts||1,1),2);
 for(let attempt=0;attempt<attempts;attempt++){
  const content:Record<string,unknown>[]=[{type:'input_text',text:JSON.stringify(request.input)}];
  if(request.image)content.push({type:'input_image',image_url:request.image.dataUrl,detail:'auto'});
  const body:Record<string,unknown>={model,store:false,instructions:request.instructions+correction,input:[{role:'user',content}],text:{format:{type:'json_schema',name:request.operation.replace(/[^a-zA-Z0-9_-]/g,'_'),strict:true,schema:request.schema}},max_output_tokens:request.maxOutputTokens||4500};
  if(/^gpt-5/.test(model))body.reasoning={effort:'low'};
  let response:Response;
  try{response=await (deps.fetch||fetch)(RESPONSE_URL,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90_000)});}catch(error){console.info('[coupi:model]',JSON.stringify({operation:request.operation,model,latencyMs:Math.round(performance.now()-start),inputTokens,outputTokens,status:'network-error'}));throw new AppError('OPENAI_NETWORK_ERROR',(error as Error).name==='TimeoutError'?'The model timed out. Please try again.':'The server could not reach OpenAI. Check network access and try again.',502);}
  const payload=await response.json().catch(()=>({}));
  inputTokens+=Number(payload.usage?.input_tokens||0);outputTokens+=Number(payload.usage?.output_tokens||0);
  if(!response.ok){const code=String(payload.error?.code||'');console.info('[coupi:model]',JSON.stringify({operation:request.operation,model,latencyMs:Math.round(performance.now()-start),inputTokens,outputTokens,status:response.status,code}));const message=response.status===401?'OpenAI rejected the API key. Update .env.local and restart.':response.status===429?(code==='insufficient_quota'?'This OpenAI project has no available API quota or credits. Add credits or use a funded project.':'OpenAI is rate-limiting requests. Wait a moment and try again.'):response.status===403?'This OpenAI project does not have access to the requested model.':response.status===400?'OpenAI rejected the model or request format. Check OPENAI_MODEL and the server integration.':'OpenAI could not complete this request. Try again.';throw new AppError('OPENAI_'+response.status,message,response.status===401||response.status===403?503:502);}
  const outputs=Array.isArray(payload.output)?payload.output:[];
  const parts=outputs.flatMap((item:{content?:unknown[]})=>item.content||[]) as {type:string;text?:string}[];
  if(parts.some(p=>p.type==='refusal'))throw new AppError('MODEL_REFUSAL','I’m not sure I can help with that request. Try a specific shopping question or inspect the catalog.',422);
  let data:T;
  try{if(payload.status==='incomplete')throw new Error('Incomplete structured output');const text=parts.filter(p=>p.type==='output_text').map(p=>p.text||'').join('');data=request.validate(JSON.parse(text));}
  catch{console.info('[coupi:model]',JSON.stringify({operation:request.operation,model,attempt:attempt+1,inputTokens,outputTokens,latencyMs:Math.round(performance.now()-start),status:'invalid-output'}));if(attempt+1<attempts){correction='\nYour previous output failed validation. Return only valid catalog IDs and review IDs from the provided data. All citations must belong to compared products. Do not invent missing facts. If uncertain, ask one clarifying question.';continue;}throw new AppError('INVALID_MODEL_OUTPUT','I’m not sure — here’s everything. The answer did not pass evidence validation.',422);}
  const meta:CallMeta={cached:false,offline:false,model,inputTokens,outputTokens,latencyMs:Math.round(performance.now()-start),cacheKey};
  await cache.set(cacheKey,{version:1,output:data,meta,createdAt:new Date().toISOString()});
  console.info('[coupi:model]',JSON.stringify({operation:request.operation,...meta}));return{data,meta};
 }
 throw new AppError('INVALID_MODEL_OUTPUT','I’m not sure — here’s everything.',422);
}
