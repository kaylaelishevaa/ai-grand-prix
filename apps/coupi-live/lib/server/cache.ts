import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import type {CallMeta} from '../types';
export function canonical(value:unknown):string{
 if(value===null||typeof value!=='object')return JSON.stringify(value)??'null';
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 const record=value as Record<string,unknown>;return '{'+Object.keys(record).sort().filter(key=>record[key]!==undefined).map(key=>JSON.stringify(key)+':'+canonical(record[key])).join(',')+'}';
}
export function requestHash(request:unknown){return createHash('sha256').update(canonical(request)).digest('hex');}
export interface CacheEntry<T>{version:1;output:T;meta:CallMeta;createdAt:string;}
export class ResponseCache{
 constructor(public directory=process.env.COUPI_CACHE_DIR||path.join(process.cwd(),'.cache','responses')){}
 async get<T>(key:string):Promise<CacheEntry<T>|null>{
  if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid cache key');
  try{const result=JSON.parse(await readFile(path.join(this.directory,key+'.json'),'utf8'));return result.version===1?result:null;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
 }
 async set<T>(key:string,value:CacheEntry<T>){
  if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid cache key');
  await mkdir(this.directory,{recursive:true});const dest=path.join(this.directory,key+'.json'),temp=dest+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,dest);
 }
}
