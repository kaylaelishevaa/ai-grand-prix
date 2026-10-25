import {AsyncLocalStorage} from 'node:async_hooks';

/** The D1 methods used by the server, shared without a Worker-only global type. */
export interface D1Result<T=Record<string,unknown>> {
  success:boolean;
  results:T[];
  meta:{changes?:number;[key:string]:unknown};
  error?:string;
}
export interface D1PreparedStatement {
  bind(...values:unknown[]):D1PreparedStatement;
  first<T=Record<string,unknown>>(columnName?:string):Promise<T|null>;
  all<T=Record<string,unknown>>():Promise<D1Result<T>>;
  run<T=Record<string,unknown>>():Promise<D1Result<T>>;
}
export interface D1Database {
  prepare(query:string):D1PreparedStatement;
  batch<T=Record<string,unknown>>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>;
}
export interface RuntimeEnv {
  DB?:D1Database;
  OPENAI_API_KEY?:string;
  OPENAI_MODEL?:string;
  OPENAI_REALTIME_MODEL?:string;
  OPENAI_TRANSCRIPTION_MODEL?:string;
  OPENAI_SEARCH_MODEL?:string;
  COUPI_PRODUCT_SEARCH_MODE?:string;
  DEMO_OFFLINE?:string;
  NODE_ENV?:string;
  COUPI_CACHE_DIR?:string;
  COUPI_DATA_DIR?:string;
  COUPI_ACCOUNT_DIR?:string;
  [key:string]:unknown;
}

const requestEnvironment=new AsyncLocalStorage<RuntimeEnv>();

/** Keep bindings and secrets isolated across concurrent Worker requests. */
export function withRuntimeEnv<T>(env:RuntimeEnv,task:()=>T):T {
  return requestEnvironment.run(env,task);
}
export function runtimeEnv():RuntimeEnv {
  return {...(typeof process==='undefined'?{}:process.env),...requestEnvironment.getStore()};
}
export function workerDatabase():D1Database|undefined {
  return requestEnvironment.getStore()?.DB;
}
export function isWorkerRuntime():boolean {
  return requestEnvironment.getStore()!==undefined;
}
