/** Records genuine model responses online; replays those exact requests offline. No production mocks. */
import {readFile} from 'node:fs/promises';
import {createProfile,applySwipe,deleteMemory} from '../lib/profile';
import {generateScene,answerQuestion,scanPhoto} from '../lib/server/services';
import {addDecision,approveDecisions} from '../lib/guardrails';
async function main(){
 const offline=process.env.DEMO_OFFLINE==='1';
 console.log(`COUPI rehearsal · ${offline?'CACHE ONLY — zero model network calls':'LIVE — records genuine model responses'}`);
 let profile=createProfile('rehearsal');
 for(const [i,skuId] of ['apron','matcha','lamp','mugs','kettle','tray'].entries())profile=applySwipe(profile,{id:'rehearsal-'+i,skuId,action:'ooh',source:'bus deck'});
 console.log('✓ Each swipe → immediate ambient memory:',profile.memoryLines.map(m=>m.text));
 const scene=await generateScene(profile,'Sunday morning kitchen');
 console.log('✓ Scene:',scene.scene.name,scene.scene.items.map(x=>x.skuId).join(', '));
 const rebuilt=await generateScene(profile,'Minimalist kitchen, under ₩100000 total');
 console.log('✓ Rebuild:',rebuilt.scene.name,rebuilt.scene.items.map(x=>x.skuId).join(', '));
 const question='Cheapest red socks that match Nike Superfly, arriving tomorrow';
 const first=await answerQuestion(profile,{question,requestId:'rehearsal-question-1'});profile=first.profile;
 console.log('✓ Ask:',first.status,first.status==='verdict'||first.status==='clarify'?first.verdict:'');
 if(profile.memoryLines.length){const removed=profile.memoryLines[0];profile=deleteMemory(profile,removed.id);const next=await answerQuestion(profile,{question,requestId:'rehearsal-question-2'});profile=next.profile;console.log('✓ Deleted memory; new request used the reduced profile:',removed.text);}
 const owned=await answerQuestion(profile,{question:'Buy laundry detergent',requestId:'rehearsal-owned'});if(owned.status!=='blocked')throw new Error('Owned guard failed');console.log('✓ Owned detergent refused before model call.');
 profile={...profile,pretend2am:true};const added=addDecision(profile,'vase','rehearsal');profile=added.profile;
 if(!added.decision?.lockedUntil)throw new Error('Night lock was not set');
 const approval=approveDecisions(profile,[added.decision.id]);if(approval.approved.length)throw new Error('Night lock was bypassed');console.log('✓ Pretend 2am locks an added item; approval is blocked.');
 const photoArg=process.argv.find(arg=>arg.startsWith('--photo='));
 if(photoArg){const photoPath=photoArg.slice(8),buffer=await readFile(photoPath),mime=/\.png$/i.test(photoPath)?'image/png':/\.webp$/i.test(photoPath)?'image/webp':'image/jpeg';const scanned=await scanPhoto(profile,buffer,mime,['oat milk','greens']);console.log('✓ Photo inventory:',scanned.inventory,'Mapped:',scanned.mappedSkuIds);}
 console.log(offline?'Replay passed. Every model response came from disk.':'Recorded. Set DEMO_OFFLINE=1 and rerun the same command to verify the zero-network replay.');
}
main().catch(error=>{console.error('Rehearsal stopped:',error instanceof Error?error.message:'Unknown error');process.exitCode=1;});
