#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=path.join(root,'apps','coupi-live'),mode=process.argv[2];
if(!['dev','build','start'].includes(mode)){console.error('Usage: node scripts/run-worlds.mjs dev|build|start [arguments]');process.exit(1);}
if(!existsSync(path.join(app,'package.json'))){console.error('The integrated app is missing: apps/coupi-live.');process.exit(1);}
if(!existsSync(path.join(app,'node_modules'))){console.error('Install the integrated app first: npm run setup:worlds');process.exit(1);}
const envPath=path.join(root,'.env.local');
if(existsSync(envPath)){
  if(typeof process.loadEnvFile!=='function'){console.error('Use Node 22.13 or newer to load the server environment.');process.exit(1);}
  try{process.loadEnvFile(envPath);}catch{console.error('Could not read root .env.local. Check its format and permissions.');process.exit(1);}
}
const args=['--prefix',app,'run',mode,...(process.argv.length>3?['--',...process.argv.slice(3)]:[])];
const child=spawn(process.platform==='win32'?'npm.cmd':'npm',args,{cwd:root,env:process.env,stdio:'inherit'});
const interrupt=()=>child.kill('SIGINT'),terminate=()=>child.kill('SIGTERM');
process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
child.on('error',()=>{console.error('Could not launch npm. Check your Node installation.');process.exitCode=1;});
child.on('exit',(code,signal)=>{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',terminate);process.exitCode=code??(signal==='SIGINT'?130:signal==='SIGTERM'?143:1);});
