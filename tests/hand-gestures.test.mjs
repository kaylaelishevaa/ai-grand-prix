import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/hand-gestures.js', import.meta.url), 'utf8');
function setup() {
  const scheduled = new Map(); let id = 0;
  const context = {window:{},requestAnimationFrame:fn=>{scheduled.set(++id,fn);return id;},cancelAnimationFrame:key=>scheduled.delete(key)};
  vm.createContext(context); vm.runInContext(source, context);
  return {...context.window,scheduled};
}
const {NookSwipeDetector} = setup();
const swipe = (detector, xs, {start=0,step=100,y=.5,mirror=false}={}) => xs.map((x,i)=>detector.update({x,y,mirror},start+i*step));
function deferred() {let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

test('three deliberate open-palm samples create visible left and right swipes', () => {
  assert.equal(swipe(new NookSwipeDetector(),[.3,.42,.55]).at(-1),'right');
  assert.equal(swipe(new NookSwipeDetector(),[.7,.58,.45]).at(-1),'left');
  assert.equal(swipe(new NookSwipeDetector(),[.3,.42,.55],{mirror:true}).at(-1),'left');
  assert.equal(swipe(new NookSwipeDetector(),[.7,.58,.45],{mirror:true}).at(-1),'right');
});
test('jitter, a single jump, vertical motion and slow movement never act', () => {
  for (const xs of [[.5,.51,.49,.52,.5],[.3,.3,.55],[.2,.8,.8]]) assert.ok(swipe(new NookSwipeDetector(),xs).every(x=>x===null));
  const vertical=new NookSwipeDetector();
  assert.equal(vertical.update({x:.3,y:.2},0),null);
  assert.equal(vertical.update({x:.43,y:.4},100),null);
  assert.equal(vertical.update({x:.56,y:.6},200),null);
  assert.ok(swipe(new NookSwipeDetector(),[.3,.32,.34,.36,.38,.4,.42,.44],{step:300}).every(x=>x===null));
});
test('a fired swipe requires cooldown and neutral hand before another product can be acted on', () => {
  const d=new NookSwipeDetector();assert.equal(swipe(d,[.3,.42,.55]).at(-1),'right');
  d.reset(); // UI changing to another product must not bypass the lock.
  assert.ok(swipe(d,[.7,.56,.42],{start:300}).every(x=>x===null));
  d.update(null,700);d.update(null,900);
  assert.equal(swipe(d,[.3,.42,.55],{start:1000}).at(-1),'right');
});
test('lost, closed or low-confidence hands cannot bridge a swipe trajectory', () => {
  for(const neutral of [null,{x:.4,y:.5,open:false},{x:.4,y:.5,confidence:.2}]) {
    const d=new NookSwipeDetector();d.update({x:.3,y:.5},0);d.update({x:.4,y:.5},100);d.update(neutral,200);
    assert.equal(d.update({x:.6,y:.5},300),null);
  }
  const d=new NookSwipeDetector();d.update({x:.3,y:.5},0);d.update({x:.4,y:.5},100);assert.equal(d.update({x:.6,y:.5},1000),null);
});
function landmarks(x,open=true) {
  const points=Array.from({length:21},()=>({x,y:.5}));points[0]={x,y:.7};
  for(const [offset,mcp,pip,tip] of [[-.06,5,6,8],[-.02,9,10,12],[.02,13,14,16],[.06,17,18,20]]){
    points[mcp]={x:x+offset,y:.54};points[pip]={x:x+offset,y:.4};points[tip]={x:x+offset,y:open?.23:.57};
  }
  return points;
}
test('landmarks require at least three extended fingers, and map mirror direction', () => {
  const d=new NookSwipeDetector();
  assert.equal(d.updateLandmarks(landmarks(.3),0,true),null);
  assert.equal(d.updateLandmarks(landmarks(.42),100,true),null);
  assert.equal(d.updateLandmarks(landmarks(.55),200,true),'left');
  const closed=new NookSwipeDetector();
  for(const [i,x] of [.3,.42,.55].entries())assert.equal(closed.updateLandmarks(landmarks(x,false),i*100),null);
});
test('stopping a pending model start closes the late model and never starts its frame loop', async () => {
  const {NookHandGestures,scheduled}=setup(), pending=deferred(), creating=deferred();let closed=0;
  const gestures=new NookHandGestures({video:{},runtimeLoader:async()=>({files:{},mod:{HandLandmarker:{createFromOptions:()=>{creating.resolve();return pending.promise;}}}})});
  const start=gestures.start();await creating.promise;gestures.stop();pending.resolve({close(){closed++;}});
  assert.equal(await start,false);assert.equal(closed,1);assert.equal(gestures.running,false);assert.equal(scheduled.size,0);
});
test('landmark detection reuses video, skips inactive products and runs at most seventeen frames per second', async () => {
  const {NookHandGestures,scheduled}=setup();let detects=0,active=true,closed=0;
  const video={readyState:4,videoWidth:400,paused:false,currentTime:1};
  const gestures=new NookHandGestures({video,isEnabled:()=>active,runtimeLoader:async()=>({files:{},mod:{HandLandmarker:{createFromOptions:async()=>({detectForVideo(value){assert.equal(value,video);detects++;return {landmarks:[]};},close(){closed++;}})}}})});
  assert.equal(await gestures.start(),true);
  function frame(now){const [id,fn]=scheduled.entries().next().value;scheduled.delete(id);video.currentTime+=.02;fn(now);}
  for(let now=0;now<=220;now+=20)frame(now);
  assert.equal(detects,4);active=false;frame(400);assert.equal(detects,4);
  gestures.stop();assert.equal(closed,1);assert.equal(scheduled.size,0);
});

test('short 12-percent motions trigger at 120ms without allowing stationary repeats', () => {
  const d=new NookSwipeDetector();
  assert.equal(swipe(d,[.4,.465,.53],{step:60}).at(-1),'right');
  for(let time=180;time<1500;time+=60)assert.equal(d.update({x:.53,y:.5},time),null);
  assert.equal(swipe(new NookSwipeDetector(),[.53,.465,.4],{step:60,mirror:true}).at(-1),'right');
});
test('moderate detection confidence allows a short swipe but low confidence resets it', () => {
  const d=new NookSwipeDetector();
  assert.equal(d.update({x:.4,y:.5,confidence:.57},0),null);
  assert.equal(d.update({x:.465,y:.5,confidence:.57},60),null);
  assert.equal(d.update({x:.53,y:.5,confidence:.57},120),'right');
  const low=new NookSwipeDetector();
  for(const [i,x] of [.4,.465,.53].entries())assert.equal(low.update({x,y:.5,confidence:.5},i*60),null);
});
test('neutral release does not bypass the shorter cooldown', () => {
  const d=new NookSwipeDetector();
  assert.equal(swipe(d,[.4,.465,.53],{step:60}).at(-1),'right');
  d.update(null,180);d.update(null,360);
  assert.ok(swipe(d,[.4,.465,.53],{start:420,step:60}).every(result=>result===null));
  assert.equal(swipe(d,[.4,.465,.53],{start:800,step:60}).at(-1),'right');
});
