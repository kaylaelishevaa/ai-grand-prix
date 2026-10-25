import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import catalog from '../data/teammate-catalog.json';

const origin='https://coupi.test';
function renderer(){
  const context={window:{location:{origin},NookProductPreview:null as any},URL,setTimeout,clearTimeout};
  vm.runInNewContext(readFileSync(new URL('../public/live-call/product-preview.js',import.meta.url),'utf8'),context);
  return context.window.NookProductPreview;
}

test('integrated preview accepts only the two same-origin product asset roots',()=>{
  const Preview=renderer();
  for(const path of ['/products/123.jpg','/live-call/products/123.jpg','/live-call/products/demo-123-pink.png']){
    assert.equal(Preview.assetPath(path,origin),path);
    assert.equal(Preview.assetPath(origin+path,origin),path);
  }
  for(const path of ['https://other.test/live-call/products/123.jpg','//other.test/live-call/products/123.jpg','data:image/png;base64,AA','/live-call/products/../private.png','/live-call/products/%2e%2e/private.png','/live-call/products/nested/123.jpg','/live-call/products/123.svg','/live-call/products/123.jpg?redirect=https://other.test','/live-call/products/123.jpg#anything','/live-call/products/%2f123.jpg','/other/products/123.jpg'])assert.throws(()=>Preview.assetPath(path,origin),/Only verified local product images/,path);
});

type Raster={width:number;height:number;data:Uint8ClampedArray};
/** Exercise the production crop/mask/colour pipeline on decoded catalog pixels.
 * This small raster surface implements only the canvas calls used by load(). */
function rasterCanvas(){
  const canvas:Raster&{getContext:()=>any}={width:0,height:0,data:new Uint8ClampedArray(),getContext:()=>context};
  const context={
    drawImage(image:Raster,...args:number[]){
      const [sx,sy,sw,sh,dx,dy,dw,dh]=args.length===8?args:[0,0,image.width,image.height,args[0]||0,args[1]||0,image.width,image.height];
      canvas.data=new Uint8ClampedArray(canvas.width*canvas.height*4);
      for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
        const from=(Math.min(image.height-1,Math.floor(sy+y*sh/dh))*image.width+Math.min(image.width-1,Math.floor(sx+x*sw/dw)))*4;
        const to=((dy+y)*canvas.width+dx+x)*4;
        canvas.data.set(image.data.subarray(from,from+4),to);
      }
    },
    getImageData(){return {width:canvas.width,height:canvas.height,data:canvas.data.slice()};},
    putImageData(image:Raster){canvas.data=image.data.slice();},
  };
  return canvas;
}

test('all 68 integrated demo records load their actual local product pixels into a usable preview',async()=>{
  const Preview=renderer(),decoded=new Map<string,Promise<Raster>>(),loaded:string[]=[];
  const loadImage=(path:string)=>{
    loaded.push(path);
    if(!decoded.has(path))decoded.set(path,sharp(readFileSync(new URL('../public'+path,import.meta.url))).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true}).then(({data,info})=>({width:info.width,height:info.height,data:new Uint8ClampedArray(data)})));
    return decoded.get(path)!;
  };
  const preview=new Preview({origin,canvasFactory:rasterCanvas,loadImage});
  assert.equal(catalog.length,68);
  for(const product of catalog){
    const expected=product.preview.image||product.image;
    assert.match(expected,/^\/live-call\/products\//);
    const result=await preview.load(product);
    assert.equal(loaded.at(-1),expected,product.id+' must use its selected catalog asset');
    assert.equal(result.ok,true,product.id);assert.equal(result.productId,product.id);
    assert(result.width>0&&result.height>0,product.id+' needs visible product pixels');
    assert.equal(result.kind,product.preview.kind,product.id+' must retain its supported preview type');
  }
});
