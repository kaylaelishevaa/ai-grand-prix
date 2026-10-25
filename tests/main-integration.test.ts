import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat,realpath,symlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {findConfig,findConfigPath} from 'next/dist/lib/find-config';
import {launcherSource,prepareMainIntegration} from '../scripts/prepare-main-integration.mjs';
const run=promisify(execFile),hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const directories=['app','components','data','docs','lib','public','scripts','tests'];
const files=['README.md','package.json','package-lock.json','tsconfig.json','next-env.d.ts','next.config.ts','postcss.config.mjs','.env.example','.gitignore'];
async function put(root:string,file:string,text:string){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),text);}
async function exists(file:string){try{await stat(file);return true;}catch{return false;}}

test('integration retains main originals, switches one Node entrypoint and excludes private/runtime artifacts',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'coupi-integration-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const main=path.join(root,'main'),sourceRoot=path.join(root,'source'),out=path.join(root,'output');
  const original=JSON.stringify({name:'teammate-app',scripts:{dev:'original dev',build:'original build',start:'original worker'},dependencies:{next:'original-version'}},null,2);
  await put(main,'package.json',original);await put(main,'.gitignore','legacy-ignore\n');await put(main,'package-lock.json','legacy lock unchanged');
  const parentPostcss="module.exports={plugins:{'@tailwindcss/postcss':{}}};\n";await put(main,'postcss.config.js',parentPostcss);
  for(const file of ['worker/index.ts','site-pages/main.html','site-pages/explore.html','public/coupi-shell.css','data/catalog.json'])await put(main,file,'original '+file);
  for(const directory of directories)await put(sourceRoot,directory+'/sample.txt','app '+directory);
  for(const file of files)await put(sourceRoot,file,file==='package.json'?JSON.stringify({scripts:{dev:'next dev',build:'next build',start:'next start'}}):'app '+file);
  await put(sourceRoot,'postcss.config.mjs',await readFile(new URL('../postcss.config.mjs',import.meta.url),'utf8'));
  await put(sourceRoot,'docs/main-integration.md','Integration instructions');
  for(const tree of [main,sourceRoot])for(const file of ['.env.local','.env.production','public/.env.secret','.dev.vars','.data/profile.json','.cache/answer.json','node_modules/private.txt','dist/build.txt','.sites-runtime/token.json','.vinext/build.js','.openai/execution-profile.json','archive.bundle','artifact.zip','artifact.tar.gz'])await put(tree,file,'private artifact');
  await put(sourceRoot,'scripts/prepare-main-integration.mjs','must not recursively package');await put(sourceRoot,'tests/main-integration.test.ts','packager-only test');
  await symlink(path.join(sourceRoot,'.env.local'),path.join(sourceRoot,'public/linked-private.txt'));
  const result=await prepareMainIntegration({main,out,sourceRoot});assert(result.mainFiles>0);assert(result.appFiles>0);
  const rootPackage=JSON.parse(await readFile(path.join(out,'package.json'),'utf8'));
  assert.deepEqual(rootPackage.dependencies,{next:'original-version'});
  assert.equal(rootPackage.scripts.dev,'node scripts/run-worlds.mjs dev');assert.equal(rootPackage.scripts['dev:sites'],'original dev');assert.equal(rootPackage.scripts['setup:worlds'],'npm --prefix apps/coupi-live ci');
  assert.equal(await readFile(path.join(out,'integration/main-package.original.json'),'utf8'),original);
  assert.equal(await readFile(path.join(out,'package-lock.json'),'utf8'),'legacy lock unchanged');
  assert.equal(await readFile(path.join(out,'postcss.config.js'),'utf8'),parentPostcss);
  const nestedApp=path.join(out,'apps/coupi-live');
  assert.equal(await findConfigPath(nestedApp,'postcss'),path.join(nestedApp,'postcss.config.mjs'));
  assert.deepEqual(await findConfig(nestedApp,'postcss'),{plugins:{}},'The nested app never inherits main’s Tailwind plugin requirements');
  const manifest=JSON.parse(await readFile(path.join(out,'integration/source-manifest.json'),'utf8'));
  for(const record of manifest.mainFiles){assert.equal(record.sha256,hash(await readFile(path.join(main,record.path),'utf8')));if(!manifest.changedMainFiles.includes(record.path))assert.equal(await readFile(path.join(out,record.path),'utf8'),await readFile(path.join(main,record.path),'utf8'));}
  for(const record of manifest.appFiles)assert.equal(record.sha256,hash(await readFile(path.join(out,'apps/coupi-live',record.path),'utf8')));
  for(const prefix of ['', 'apps/coupi-live'])for(const file of ['.env.local','.env.production','public/.env.secret','.dev.vars','.data','.cache','node_modules','dist','.sites-runtime','.vinext','.openai/execution-profile.json','archive.bundle','artifact.zip','artifact.tar.gz'])assert.equal(await exists(path.join(out,prefix,file)),false,file);
  assert(await exists(path.join(out,'apps/coupi-live/.env.example')));assert.equal(await exists(path.join(out,'apps/coupi-live/scripts/prepare-main-integration.mjs')),false);
  assert.equal(await exists(path.join(out,'apps/coupi-live/public/linked-private.txt')),false);
  assert.equal(await readFile(path.join(main,'package.json'),'utf8'),original,'The input main tree is never changed');
  await assert.rejects(()=>prepareMainIntegration({main,out,sourceRoot}),/new or empty/);
  await assert.rejects(()=>prepareMainIntegration({main,out:path.join(sourceRoot,'accidental-output'),sourceRoot}),/separate/);
  await rm(path.join(sourceRoot,'.env.example'));await symlink(path.join(sourceRoot,'.env.local'),path.join(sourceRoot,'.env.example'));
  const refused=path.join(root,'refused-output');
  await assert.rejects(()=>prepareMainIntegration({main,out:refused,sourceRoot}),/not a symlink/);
  assert.equal(await exists(refused),false,'Validate top-level symlinks before writing any output');
});

test('root launcher runs only the nested app, loads environment silently and forwards exit/arguments',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'coupi-launch-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const app=path.join(root,'apps/coupi-live');await mkdir(path.join(app,'node_modules'),{recursive:true});
  await put(root,'scripts/run-worlds.mjs',launcherSource);
  await put(root,'.env.local','COUPI_TEST_LAUNCHER_SECRET=local-test-value\n');
  await put(app,'package.json',JSON.stringify({scripts:{dev:'node probe.mjs',build:'node probe.mjs',start:'node probe.mjs'}}));
  await put(app,'probe.mjs',`import {writeFileSync} from 'node:fs';writeFileSync('probe.json',JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2),loaded:process.env.COUPI_TEST_LAUNCHER_SECRET==='local-test-value'}));if(process.argv.includes('--fail'))process.exitCode=9;`);
  const result=await run(process.execPath,[path.join(root,'scripts/run-worlds.mjs'),'dev','--from-parent'],{cwd:root,env:{...process.env,COUPI_TEST_LAUNCHER_SECRET:undefined}});
  const observed=JSON.parse(await readFile(path.join(app,'probe.json'),'utf8'));
  assert.equal(observed.cwd,await realpath(app));assert.deepEqual(observed.args,['--from-parent']);assert.equal(observed.loaded,true);
  assert(!result.stdout.includes('local-test-value'));assert(!result.stderr.includes('local-test-value'));
  await assert.rejects(()=>run(process.execPath,[path.join(root,'scripts/run-worlds.mjs'),'start','--fail'],{cwd:root}),(error:any)=>error.code===9);
  await assert.rejects(()=>run(process.execPath,[path.join(root,'scripts/run-worlds.mjs'),'anything'],{cwd:root}),(error:any)=>error.code===1&&error.stderr.includes('Usage:'));
  await rm(path.join(app,'node_modules'),{recursive:true});
  await assert.rejects(()=>run(process.execPath,[path.join(root,'scripts/run-worlds.mjs'),'build'],{cwd:root}),(error:any)=>error.code===1&&error.stderr.includes('setup:worlds'));
});
