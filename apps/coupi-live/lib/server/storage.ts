import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {workerDatabase} from './runtime';
import {AppError} from './errors';

type Kind='profiles'|'accounts';
type Database=NonNullable<ReturnType<typeof workerDatabase>>;
interface DocumentRead {kind:Kind;id:string;version:number|null;json:string|null;}
interface Transaction {db:Database;reads:Map<string,DocumentRead>;writes:Map<string,string>;members:Map<string,string|null>;memberWrites:Map<string,string>;}
const transactions=new AsyncLocalStorage<Transaction>();
const keyFor=(kind:Kind,id:string)=>kind+':'+id;
function transaction(){const value=transactions.getStore();if(!value)throw new Error('Database operation requires a storage transaction');return value;}

/** A callback runs once. Optimistic checks cover every document it read, including
 * other household members used to calculate a shared checkout budget. */
export async function withDatabaseTransaction<T>(task:()=>Promise<T>):Promise<T>{
 const db=workerDatabase();if(!db)throw new Error('No Worker database binding');
 const current=transactions.getStore();if(current){if(current.db!==db)throw new Error('Database binding changed inside transaction');return task();}
 const state:Transaction={db,reads:new Map(),writes:new Map(),members:new Map(),memberWrites:new Map()};
 return transactions.run(state,async()=>{const output=await task();await commit(state);return output;});
}

export async function readDocument<T>(kind:Kind,id:string):Promise<T|null>{
 if(!transactions.getStore())return withDatabaseTransaction(()=>readDocument<T>(kind,id));
 const state=transaction(),key=keyFor(kind,id),staged=state.writes.get(key);
 if(staged!==undefined)return JSON.parse(staged) as T;
 let read=state.reads.get(key);
 if(!read){const row=await state.db.prepare(`SELECT json, storage_version FROM ${kind} WHERE id = ?`).bind(id).first<{json:string;storage_version:number}>();read={kind,id,version:row?.storage_version??null,json:row?.json??null};state.reads.set(key,read);}
 return read.json===null?null:JSON.parse(read.json) as T;
}
export async function writeDocument(kind:Kind,id:string,value:unknown):Promise<void>{
 if(!transactions.getStore())return withDatabaseTransaction(()=>writeDocument(kind,id,value));
 await readDocument(kind,id);const state=transaction(),key=keyFor(kind,id),json=JSON.stringify(value);
 if(state.reads.get(key)?.json===json)state.writes.delete(key);else state.writes.set(key,json);
}
export async function readAccountMembership(profileId:string):Promise<string|null>{
 if(!transactions.getStore())return withDatabaseTransaction(()=>readAccountMembership(profileId));
 const state=transaction();if(state.memberWrites.has(profileId))return state.memberWrites.get(profileId)!;
 if(!state.members.has(profileId)){const row=await state.db.prepare('SELECT account_id FROM account_members WHERE profile_id = ?').bind(profileId).first<{account_id:string}>();state.members.set(profileId,row?.account_id??null);}
 return state.members.get(profileId)!;
}
export async function writeAccountMembership(profileId:string,accountId:string):Promise<void>{
 if(!transactions.getStore())return withDatabaseTransaction(()=>writeAccountMembership(profileId,accountId));
 await readAccountMembership(profileId);const state=transaction();if(state.members.get(profileId)===accountId)state.memberWrites.delete(profileId);else state.memberWrites.set(profileId,accountId);
}

async function commit(state:Transaction){
 if(!state.writes.size&&!state.memberWrites.size)return;
 const conditions:string[]=[],values:unknown[]=[];
 for(const read of state.reads.values()){
  conditions.push(read.version===null?`NOT EXISTS (SELECT 1 FROM ${read.kind} WHERE id = ?)`:`EXISTS (SELECT 1 FROM ${read.kind} WHERE id = ? AND storage_version = ?)`);
  values.push(read.id);if(read.version!==null)values.push(read.version);
 }
 for(const [profileId,accountId] of state.members){conditions.push(accountId===null?'NOT EXISTS (SELECT 1 FROM account_members WHERE profile_id = ?)':'EXISTS (SELECT 1 FROM account_members WHERE profile_id = ? AND account_id = ?)');values.push(profileId);if(accountId!==null)values.push(accountId);}
 // D1 batch is transactional. A failed precondition deliberately violates the
 // existing NOT NULL constraint, aborting ALL writes rather than partially
 // committing several independent compare-and-swap updates.
 const statements=[state.db.prepare(`INSERT INTO profiles (id, json, storage_version) SELECT ?, NULL, 0 WHERE NOT (${conditions.join(' AND ')||'1'})`).bind('transaction-guard-'+randomUUID(),...values)];
 for(const [key,json] of state.writes){const read=state.reads.get(key)!;statements.push(read.version===null?state.db.prepare(`INSERT INTO ${read.kind} (id, json, storage_version) VALUES (?, ?, 0)`).bind(read.id,json):state.db.prepare(`UPDATE ${read.kind} SET json = ?, storage_version = storage_version + 1 WHERE id = ?`).bind(json,read.id));}
 for(const [profileId,accountId] of state.memberWrites)statements.push(state.db.prepare('INSERT INTO account_members (profile_id, account_id) VALUES (?, ?) ON CONFLICT(profile_id) DO UPDATE SET account_id = excluded.account_id').bind(profileId,accountId));
 try{await state.db.batch(statements);}catch(error){
  const message=error instanceof Error?[error.message,error.cause instanceof Error?error.cause.message:''].join(' '):'';
  if(message.includes('NOT NULL constraint failed: profiles.json'))throw new AppError('SESSION_CONFLICT','Your saved information changed during this request. Please try again.',409);
  throw error;
 }
}
