import test from 'node:test';
import assert from 'node:assert/strict';
import {observeElementSize,type ElementSize} from '../lib/observe-element-size';

test('queued resize callbacks do not measure or set state after fallback detaches or cleans up',()=>{
  let connected=true,reads=0,disconnects=0,deliver=()=>{},observed:Element|undefined;
  const element={get isConnected(){return connected;},getBoundingClientRect(){reads++;return {width:390,height:430};}} as HTMLElement;
  class Observer implements ResizeObserver {
    constructor(callback:ResizeObserverCallback){deliver=()=>callback([],this);}
    observe(target:Element){observed=target;}
    unobserve(){}
    disconnect(){disconnects++;}
  }
  const writes:ElementSize[]=[];
  const stop=observeElementSize(element,size=>writes.push(size),Observer);
  assert.equal(observed,element);assert.equal(reads,1);assert.deepEqual(writes,[{width:390,height:430}]);
  connected=false; // React removes the fallback before passive cleanup runs.
  deliver();assert.equal(reads,1);assert.equal(writes.length,1);
  stop();assert.equal(disconnects,1);
  connected=true; // Even if the old node is reattached, a queued callback is disposed.
  deliver();assert.equal(reads,1);assert.equal(writes.length,1);
});

test('null hosts, hidden elements and browsers without ResizeObserver are safe',()=>{
  const writes:ElementSize[]=[];
  assert.doesNotThrow(()=>observeElementSize(null,size=>writes.push(size),undefined)());
  const hidden={isConnected:true,getBoundingClientRect:()=>({width:0,height:0})} as HTMLElement;
  observeElementSize(hidden,size=>writes.push(size),undefined)();
  assert.equal(writes.length,0);
  const visible={isConnected:true,getBoundingClientRect:()=>({width:390,height:430})} as HTMLElement;
  observeElementSize(visible,size=>writes.push(size),undefined)();
  assert.deepEqual(writes,[{width:390,height:430}]);
});
