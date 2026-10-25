#!/usr/bin/env node
/** Assemble a reviewable Node-runtime integration without rewriting main's sources or Git ancestry. */
import {createHash} from 'node:crypto';
import {copyFile,lstat,mkdir,readFile,readdir,realpath,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const SOURCE_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const APP_DIRECTORIES=['app','components','data','docs','lib','public','scripts','tests'];
const APP_FILES=['README.md','package.json','package-lock.json','tsconfig.json','next-env.d.ts','next.config.ts','postcss.config.mjs','.env.example','.gitignore'];
const OMIT_DIRECTORIES=new Set(['.git','.cache','.data','.next','.wrangler','.sites-runtime','.vinext','.vercel','.turbo','node_modules','dist','build','coverage','test-results','playwright-report']);
const OMIT_FILES=new Set(['.DS_Store','tsconfig.tsbuildinfo']);
const OMIT_APP_PATHS=new Set(['scripts/prepare-main-integration.mjs','tests/main-integration.test.ts']);
const PROVENANCE={mainCommit:'b3ed68003063020502f60c2cc6149b3539b932fe',personalizationSourceCommit:'12079ef'};
const slash=value=>value.split(path.sep).join('/');
const digest=value=>createHash('sha256').update(value).digest('hex');
const privateFile=name=>(name.startsWith('.env')&&name!=='.env.example')||name.startsWith('.dev.vars')||/\.(?:pem|key|p12|pfx|bundle|zip|tgz|tar|gz|bz2|xz|rar|7z)$/i.test(name);
const within=(target,root)=>target===root||target.startsWith(root+path.sep);

export const launcherSource=`#!/usr/bin/env node
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
`;

async function exists(file){try{await stat(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function requireSource(root,item,directory=false){
  const file=path.join(root,item);let entry;
  try{entry=await lstat(file);}catch(error){if(error.code==='ENOENT')throw Error('Source is incomplete: '+item);throw error;}
  if(entry.isSymbolicLink()||(directory?!entry.isDirectory():!entry.isFile())||await realpath(file)!==file)throw Error('Source must be a real '+(directory?'directory':'file')+', not a symlink: '+item);
}
async function canonical(file){try{return await realpath(file);}catch(error){if(error.code!=='ENOENT')throw error;return path.join(await canonical(path.dirname(file)),path.basename(file));}}
async function emptyOrNew(directory){if(await exists(directory)){if(!(await stat(directory)).isDirectory()||(await readdir(directory)).length)throw Error('The output must be a new or empty directory. Existing files are never overwritten.');}else await mkdir(directory,{recursive:true});}
async function copyTree(source,destination,{relative='',app=false,records=[]}={}){
  await mkdir(destination,{recursive:true});
  for(const entry of (await readdir(source,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const rel=slash(path.join(relative,entry.name));
    if(OMIT_FILES.has(entry.name)||rel==='.openai/execution-profile.json'||privateFile(entry.name)||entry.isSymbolicLink()||(app&&OMIT_APP_PATHS.has(rel)))continue;
    const from=path.join(source,entry.name),to=path.join(destination,entry.name);
    if(entry.isDirectory()){if(!OMIT_DIRECTORIES.has(entry.name))await copyTree(from,to,{relative:rel,app,records});}
    else if(entry.isFile()){await copyFile(from,to);records.push({path:rel,sha256:digest(await readFile(from))});}
  }
  return records;
}

export async function prepareMainIntegration({main,out,sourceRoot=SOURCE_ROOT}){
  if(!main||!out)throw Error('Pass --main /path/to/extracted-main --out /path/to/new-directory.');
  main=await canonical(path.resolve(main));out=await canonical(path.resolve(out));sourceRoot=await canonical(path.resolve(sourceRoot));
  if(within(out,main)||within(out,sourceRoot)||within(main,out)||within(sourceRoot,out))throw Error('Output must be separate from both source trees.');
  for(const required of ['package.json','worker/index.ts','site-pages/main.html','site-pages/explore.html'])await requireSource(main,required);
  if(await exists(path.join(main,'.gitignore')))await requireSource(main,'.gitignore');
  for(const generated of ['apps/coupi-live','scripts/run-worlds.mjs','integration/README.md','integration/source-manifest.json','integration/main-package.original.json','integration/main-gitignore.original.txt'])if(await exists(path.join(main,generated)))throw Error('Main already contains an integration at the target paths. Review it manually instead of replacing it.');
  const originalPackage=await readFile(path.join(main,'package.json'),'utf8'),pkg=JSON.parse(originalPackage);
  for(const mode of ['dev','build','start'])if(typeof pkg.scripts?.[mode]!=='string'||pkg.scripts[mode+':sites'])throw Error('Unexpected main scripts; refusing an ambiguous runtime switch.');
  for(const item of APP_DIRECTORIES)await requireSource(sourceRoot,item,true);
  for(const item of [...APP_FILES,'docs/main-integration.md'])await requireSource(sourceRoot,item);
  await emptyOrNew(out);
  const mainFiles=await copyTree(main,out),appFiles=[],appRoot=path.join(out,'apps/coupi-live');
  await mkdir(appRoot,{recursive:true});
  for(const directory of APP_DIRECTORIES)await copyTree(path.join(sourceRoot,directory),path.join(appRoot,directory),{relative:directory,app:true,records:appFiles});
  for(const file of APP_FILES){await copyFile(path.join(sourceRoot,file),path.join(appRoot,file));appFiles.push({path:file,sha256:digest(await readFile(path.join(sourceRoot,file)))});}
  for(const mode of ['dev','build','start']){pkg.scripts[mode+':sites']=pkg.scripts[mode];pkg.scripts[mode]='node scripts/run-worlds.mjs '+mode;}
  pkg.scripts['setup:worlds']='npm --prefix apps/coupi-live ci';
  pkg.scripts['test:worlds']='npm --prefix apps/coupi-live test';
  pkg.scripts['typecheck:worlds']='npm --prefix apps/coupi-live run typecheck';
  await writeFile(path.join(out,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  await mkdir(path.join(out,'scripts'),{recursive:true});await writeFile(path.join(out,'scripts/run-worlds.mjs'),launcherSource,{mode:0o755});
  const previousIgnore=await exists(path.join(main,'.gitignore'))?await readFile(path.join(main,'.gitignore'),'utf8'):'';
  await writeFile(path.join(out,'.gitignore'),previousIgnore+'\n# COUPI Node runtime: local secrets, state and build outputs\n.env\n.env.*\n!.env.example\n.dev.vars*\napps/coupi-live/node_modules/\napps/coupi-live/.next/\napps/coupi-live/.data/\napps/coupi-live/.cache/\napps/coupi-live/tsconfig.tsbuildinfo\n');
  const integration=path.join(out,'integration');await mkdir(integration,{recursive:true});
  await writeFile(path.join(integration,'main-package.original.json'),originalPackage);
  await writeFile(path.join(integration,'main-gitignore.original.txt'),previousIgnore);
  await copyFile(path.join(sourceRoot,'docs/main-integration.md'),path.join(integration,'README.md'));
  const manifest={format:1,source:PROVENANCE,notes:['Source commit labels identify the inspected archives; this packager does not invent Git ancestry.','Original main package and gitignore are archived under integration/. No other original main file is changed.','Environment files, runtime data/cache, dependencies, build outputs, symlinks and artifact bundles are excluded.'],changedMainFiles:['package.json','.gitignore'],mainFiles,appFiles:appFiles.sort((a,b)=>a.path.localeCompare(b.path))};
  await writeFile(path.join(integration,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return{out,mainFiles:mainFiles.length,appFiles:appFiles.length};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2),values={};
  for(let i=0;i<args.length;i+=2){if(!['--main','--out'].includes(args[i])||!args[i+1]){console.error('Usage: node scripts/prepare-main-integration.mjs --main /extracted-main --out /new-directory');process.exit(1);}values[args[i].slice(2)]=args[i+1];}
  void prepareMainIntegration(values).then(result=>{console.info('Prepared main integration:',result.out);console.info(result.mainFiles+' preserved main files; '+result.appFiles+' app files. No Git publication performed.');}).catch(error=>{console.error(error instanceof Error?error.message:'Integration could not be prepared.');process.exitCode=1;});
}
