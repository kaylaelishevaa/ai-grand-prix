import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import type {CallMeta} from '../types';
import {isWorkerRuntime,runtimeEnv,workerDatabase} from './runtime';
export function canonical(value:unknown):string{
 if(value===null||typeof value!=='object')return JSON.stringify(value)??'null';
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 const record=value as Record<string,unknown>;return '{'+Object.keys(record).sort().filter(key=>record[key]!==undefined).map(key=>JSON.stringify(key)+':'+canonical(record[key])).join(',')+'}';
}
export function requestHash(request:unknown){return createHash('sha256').update(canonical(request)).digest('hex');}
export interface CacheEntry<T>{version:1;output:T;meta:CallMeta;createdAt:string;}
export class ResponseCache{
 public directory:string;
 constructor(directory?:string){this.directory=directory||runtimeEnv().COUPI_CACHE_DIR||(isWorkerRuntime()?'':path.join(process.cwd(),'.cache','responses'));}
 async get<T>(key:string):Promise<CacheEntry<T>|null>{
  if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid cache key');
  const db=workerDatabase();
  if(db){
   const row=await db.prepare('SELECT json FROM response_cache WHERE hash = ?').bind(key).first<{json:string}>();
   if(!row)return null;
   try{const result=JSON.parse(row.json);return result?.version===1?result:null;}catch(error){if(error instanceof SyntaxError)return null;throw error;}
  }
  if(isWorkerRuntime())throw new Error('Worker database binding DB is not configured');
  try{const result=JSON.parse(await readFile(path.join(this.directory,key+'.json'),'utf8'));return result.version===1?result:null;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
 }
 async set<T>(key:string,value:CacheEntry<T>){
  if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid cache key');
  const db=workerDatabase();
  if(db){await db.prepare('INSERT INTO response_cache (hash, json, created_at) VALUES (?, ?, ?) ON CONFLICT(hash) DO UPDATE SET json = excluded.json, created_at = excluded.created_at').bind(key,JSON.stringify(value),value.createdAt).run();return;}
  if(isWorkerRuntime())throw new Error('Worker database binding DB is not configured');
  await mkdir(this.directory,{recursive:true});const dest=path.join(this.directory,key+'.json'),temp=dest+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,dest);
 }
}
