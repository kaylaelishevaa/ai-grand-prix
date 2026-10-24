import test from 'node:test';
import assert from 'node:assert/strict';
import {separateTouchpoints} from '../components/diorama/touchpoints';

test('six close or edge-projected products retain separate 44px hit targets on a phone',()=>{
  for(const [width,height] of [[320,440],[390,520],[1200,600]])for(const [x,y] of [[0,0],[width,0],[0,height],[width,height],[width/2,height/2]]){
    const points=Array.from({length:6},(_,index)=>({skuId:`sku-${index}`,x:x+index*.1,y:y+index*.1}));
    const placed=separateTouchpoints(points,width,height);
    assert.equal(placed.length,6);
    for(const item of placed){assert(item.x>=24&&item.x<=width-24);assert(item.y>=24&&item.y<=height-24);}
    for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++)assert(Math.abs(placed[i].x-placed[j].x)>=44||Math.abs(placed[i].y-placed[j].y)>=44,'44px buttons cannot share a clickable pixel');
    assert.deepEqual(placed.map(p=>[p.skuId,p.anchorX,p.anchorY]),points.map(p=>[p.skuId,p.x,p.y]));
    assert.deepEqual(separateTouchpoints([...points].reverse(),width,height).reverse(),placed,'renderer traversal does not change placement');
  }
});

test('well-separated product anchors stay over their actual object',()=>{
  const points=[{skuId:'kettle',x:90,y:110},{skuId:'mugs',x:180,y:230},{skuId:'tray',x:290,y:310}];
  assert.deepEqual(separateTouchpoints(points,390,520),points.map(p=>({...p,anchorX:p.x,anchorY:p.y})));
});
