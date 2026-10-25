import test from 'node:test';
import assert from 'node:assert/strict';
import {separateTouchpoints} from '../components/diorama/touchpoints';
import {positionProductPreview} from '../components/diorama/photo-preview';

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

test('always-visible 56px photo targets stay separated and fully inside small phone stages',()=>{
  for(const [width,height] of [[320,295],[368,330],[436,370]])for(const [x,y] of [[0,0],[width,height],[width/2,height/2]]){
    const points=Array.from({length:6},(_,index)=>({skuId:`reference-${index}`,x:x+index*.1,y:y+index*.1}));
    const placed=separateTouchpoints(points,width,height,56);
    for(const point of placed){assert(point.x-28>=2&&point.x+28<=width-2);assert(point.y-28>=2&&point.y+28<=height-2);}
    for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++)assert(Math.abs(placed[i].x-placed[j].x)>=56||Math.abs(placed[i].y-placed[j].y)>=56,'photos cannot conceal another product or share its click target');
    assert.deepEqual(placed.map(p=>[p.skuId,p.anchorX,p.anchorY]),points.map(p=>[p.skuId,p.x,p.y]));
  }
});

test('listing photo previews remain inside phone scenes, including every edge and clustered hotspot',()=>{
  for(const [width,height] of [[320,330],[390,360],[460,420],[1200,600]]){
    for(let x=24;x<=width-24;x+=17)for(let y=24;y<=height-24;y+=19){
      const preview=positionProductPreview({skuId:'real-listing',x,y},width,height);
      assert(preview.x>=12&&preview.y>=34,'photo avoids the stage edge and time label');
      assert(preview.x+preview.width<=width-12+.001);
      assert(preview.y+preview.height<=height-12+.001);
      assert(preview.width>=144&&preview.width<=188&&preview.height===190);
    }
  }
});

test('centered phone previews move beside the product without covering its 44px target',()=>{
  for(const [width,height] of [[390,360],[460,420]]){
    const point={skuId:'real-listing',x:width/2,y:height/2};
    const preview=positionProductPreview(point,width,height);
    assert(preview.x+preview.width<=point.x-22||preview.x>=point.x+22||preview.y+preview.height<=point.y-22||preview.y>=point.y+22);
    assert.deepEqual(positionProductPreview(point,width,height),preview,'hover placement never oscillates');
  }
});
