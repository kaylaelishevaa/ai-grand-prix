export interface VoiceEnvironment {OPENAI_API_KEY?:string;OPENAI_REALTIME_MODEL?:string;DEMO_OFFLINE?:string;}
export interface VoiceSearchInput {query:string;category?:'all'|'makeup'|'clothes'|'desk'|'glasses';max_price?:number|null;}
export interface VoiceProduct {id:string;name:string;category:string;price:number|null;url:string;[key:string]:unknown;}
export interface VoiceSearchResult {products:VoiceProduct[];message:string;current_prices_verified:false;catalog_scope:string;search_url:string;}
export function searchProducts(input:VoiceSearchInput,products?:unknown[]):VoiceSearchResult;
export function sessionConfiguration(env?:VoiceEnvironment,profileContext?:unknown):{model:string;instructions:string;tools:{name:string;[key:string]:unknown}[];[key:string]:unknown};
export function createVoiceHandler(options?:{products?:unknown[];fetchImpl?:typeof fetch;profileContext?:unknown}):(request:Request,env?:VoiceEnvironment)=>Promise<Response|null>;
export const handleVoiceRequest:(request:Request,env?:VoiceEnvironment)=>Promise<Response|null>;
