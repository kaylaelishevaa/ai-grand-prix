#!/usr/bin/env node
/** Publish the tested design checkpoint on top of the reviewed GitHub main ancestry. */
import {spawnSync} from 'node:child_process';
import {cp,mkdtemp,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bundle=path.join(root,'COUPI-3D-branch.bundle');
const reviewedMain='7e5b085e28ee598ddb3afb9edc69a50ae8d51bc5';
const reviewedDesign='f1e51d18142be6a623079c7610c2c13a3c5024ca';
const remote='https://github.com/kaylaelishevaa/ai-grand-prix.git';
const preview=process.argv.includes('--preview');
if(process.argv.slice(2).some(arg=>arg!=='--preview'))throw new Error('Usage: node scripts/publish-reviewed-main.mjs [--preview]');
function git(cwd,args,{capture=false}={}){
  const result=spawnSync('git',['--no-pager',...args],{cwd,encoding:'utf8',stdio:capture?['ignore','pipe','pipe']:'inherit'});
  if(result.error)throw new Error('Could not start Git: '+result.error.message);
  if(result.status!==0)throw new Error(capture?String(result.stderr).trim():'Git stopped. No force push was attempted.');
  return capture?result.stdout.trim():'';
}
try{
  await stat(bundle);
  const work=await mkdtemp(path.join(tmpdir(),'coupi-main-publish-'));
  const source=path.join(work,'reviewed-design'),checkout=path.join(work,'main'),assembled=path.join(work,'assembled');
  console.log('Preparing the tested design in:',work);
  git(work,['clone','--branch','feat/coupi-3d-dioramas',bundle,source]);
  if(git(source,['rev-parse','HEAD'],{capture:true})!==reviewedDesign)throw new Error('The design bundle has changed. Review the new checkpoint before publishing.');
  git(work,['clone','--single-branch','--branch','main',remote,checkout]);
  git(checkout,['merge-base','--is-ancestor',reviewedMain,'HEAD']);
  const mainCommit=git(checkout,['rev-parse','HEAD'],{capture:true});
  console.log('Preserving current main source:',mainCommit);
  const {prepareMainIntegration}=await import(pathToFileURL(path.join(source,'scripts/prepare-main-integration.mjs')).href);
  await prepareMainIntegration({main:checkout,out:assembled,sourceRoot:source,mainCommit});
  const changed=['apps/coupi-live','integration','scripts/run-worlds.mjs','package.json','.gitignore'];
  for(const item of changed)await cp(path.join(assembled,item),path.join(checkout,item),{recursive:true});
  git(checkout,['add','--',...changed]);
  git(checkout,['diff','--cached','--check']);
  git(checkout,['diff','--cached','--stat']);
  console.log('Main source files stay in place; the integrated Next.js app lives in apps/coupi-live.');
  if(preview){console.log('Preview only. Staged checkout:',checkout);process.exit(0);}
  git(checkout,['commit','-m','Integrate reviewed COUPI Home, Call, worlds, search and visual design']);
  git(checkout,['push','origin','HEAD:main']);
  console.log('Published main:',git(checkout,['rev-parse','HEAD'],{capture:true}));
  console.log('GitHub:',remote.replace(/\.git$/,'')+'/tree/main');
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
