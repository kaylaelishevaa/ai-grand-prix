import test from 'node:test';
import assert from 'node:assert/strict';
import {searchCoupang,coupangSearchQueries,coupangListing,coupangImage,productImage} from '../lib/coupang-search.mjs';
import {createVoiceHandler} from '../lib/nook-voice.mjs';
import {isDemoProduct,demoCatalog} from '../lib/demo-catalog.mjs';
import catalog from '../data/catalog.json' with {type:'json'};

const image='https://thumbnail.coupangcdn.com/image/example.jpg';
const product=(i=0)=>({url:`https://www.coupang.com/vp/products/${900000+i}`,name:`White glasses ${i}`,product_type:'glasses',price:100+i,image_url:image});
const response=(products,sources=products)=>Response.json({status:'completed',output:[
  {type:'web_search_call',action:{sources:sources.map(p=>({url:p.url}))}},
  {type:'message',content:[{type:'output_text',text:JSON.stringify({products})}]},
]});
const env={OPENAI_API_KEY:'test-key'};

test('search requests ten choices by default and never exceeds the fifteen-item ceiling',async()=>{
  const rows=Array.from({length:25},(_,i)=>product(i));
  for(const [limit,expected] of [[undefined,10],[15,15],[99,15]]){
    let request;
    const result=await searchCoupang({query:'glasses',limit},env,async(url,init)=>{request=JSON.parse(init.body);return response(rows);});
    assert.equal(result.products.length,expected);assert.equal(result.search.limit,expected);
    assert.match(request.instructions,new RegExp('up to '+expected+' distinct'));
  }
});

test('saved memories reach live ranking while the current query and budget remain authoritative',async()=>{
  let request;
  const result=await searchCoupang({query:'black glasses',category:'glasses',max_price:20000,memories:['I prefer rose-gold frames.','I like T-shirts.']},env,async(url,init)=>{
    request=JSON.parse(init.body);return response([{...product(),name:'Black frames',price:19900}]);
  });
  const input=JSON.parse(request.input);
  assert.equal(input.query,'black glasses');assert.equal(input.max_price,20000);
  assert.deepEqual(input.saved_preferences,['I prefer rose-gold frames.','I like T-shirts.']);
  assert.match(request.instructions,/current request and explicit max_price override memories/);
  assert.equal(result.products[0].productType,'glasses');
});

test('search endpoint validates preference, exclusion and result-limit boundaries',async()=>{
  const handler=createVoiceHandler({fetchImpl:()=>{throw Error('must not fetch');}});
  for(const invalid of [{limit:16},{limit:0},{limit:1.5},{memories:'cotton'},{memories:Array(21).fill('cotton')},{memories:['x'.repeat(401)]},{exclude_ids:[1]},{exclude_ids:['bad']}]){
    const request=new Request('https://coupi.test/api/products/search',{method:'POST',headers:{origin:'https://coupi.test','Content-Type':'application/json'},body:JSON.stringify({query:'glasses',...invalid})});
    assert.equal((await handler(request,env)).status,400);
  }
});

test('unsupported requests stop before search instead of returning unrelated products',async()=>{
  for(const query of ['women’s shoes size 37','鞋子 100元','신발','smartphone','sofa']){
    const result=await searchCoupang({query,category:'all'},env,()=>{throw Error('must not fetch');});
    assert.deepEqual(result.products,[]);assert.equal(result.retrieval_status,'unsupported_category');
    assert.match(result.message,/lipstick, chairs, desk lamps, T-shirts, hoodies, and glasses/);
  }
});

test('all searches still reject cited products outside the original six types',async()=>{
  const types=['lipstick','chair','lamp','tshirt','hoodie','glasses','shoes','phone','sofa','constructor'];
  const rows=types.map((type,i)=>({...product(i),product_type:type}));
  const result=await searchCoupang({query:'recommend something',category:'all'},env,async()=>response(rows));
  assert.deepEqual(result.products.map(p=>p.productType),types.slice(0,6));
});

test('query-specific restrictions apply in English, Korean and Chinese without a category hint',async()=>{
  for(const [query,type] of [['metal glasses','glasses'],['台灯','lamp'],['후드','hoodie']]){
    const rows=['glasses','lipstick','lamp','hoodie'].map((type,i)=>({...product(i),product_type:type}));
    const result=await searchCoupang({query,category:'all'},env,async()=>response(rows));
    assert.deepEqual(result.products.map(p=>p.productType),[type]);
  }
});

test('Coupang variant IDs survive normalization while tracking and redirect parameters do not',()=>{
  const item='https://www.coupang.com/vp/products/123?itemId=456&vendorItemId=789';
  assert.equal(coupangListing(item+'&redirect=https://evil.test&tracking=1#x').url,item);
  assert.equal(coupangListing('https://coupang.com/vp/products/123?itemId=invalid').url,'https://www.coupang.com/vp/products/123');
});

test('the search boundary rejects removed categories and malformed queries before calling upstream',async()=>{
  const handler=createVoiceHandler({fetchImpl:()=>{throw Error('must not fetch');}});
  for(const input of [{query:'shoes',category:'shoes'},{query:'phone',category:'other'},{query:null},{query:'  '}]){
    const request=new Request('https://coupi.test/api/products/search',{method:'POST',headers:{origin:'https://coupi.test','Content-Type':'application/json'},body:JSON.stringify(input)});
    assert.equal((await handler(request,env)).status,400);
  }
});

test('stale Lazada image URLs cannot be fetched through the restored Coupang proxy',async()=>{
  const request=new Request('https://coupi.test/api/products/image?url='+encodeURIComponent('https://img.lazcdn.com/g/p/example.jpg'));
  assert.equal((await productImage(request,()=>{throw Error('must not fetch');})).status,400);
});

test('Coupang search uses domain-filtered sources and returns at most fifteen distinct KRW listings',async()=>{
  let request;
  const result=await searchCoupang({query:'white glasses',category:'glasses',limit:15},env,async(url,init)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');request=JSON.parse(init.body);return response(Array.from({length:18},(_,i)=>product(i)));
  });
  assert.deepEqual(request.tools[0].filters.allowed_domains,['coupang.com']);
  assert.equal(request.tool_choice,'required');assert.equal(request.store,false);
  assert.equal(result.products.length,15);assert.equal(new Set(result.products.map(p=>p.id)).size,15);
  assert.equal(result.products[0].source,'coupang_web');assert.equal(result.products[0].currency,'KRW');
  assert.equal(result.products[0].image,'/api/products/image?url='+encodeURIComponent(image));
  assert.equal(result.search_url,'https://www.coupang.com/np/search?q=white%20glasses');
});

test('search terms preserve the shopper request, category, budget and memories',async()=>{
  assert.deepEqual(coupangSearchQueries(' round metal glasses '),['round metal glasses','round metal glasses site:coupang.com/vp/products/']);
  let request;
  const result=await searchCoupang({query:'round metal glasses',max_price:100,memories:['Prefer thin frames']},env,async(url,init)=>{
    request=JSON.parse(init.body);return response([]);
  });
  const input=JSON.parse(request.input);
  assert.deepEqual(input.search_queries,['round metal glasses','round metal glasses site:coupang.com/vp/products/']);
  assert.equal(input.max_price,100);assert.deepEqual(input.saved_preferences,['Prefer thin frames']);
  assert.equal(result.retrieval_status,'listing_sources_unavailable');
  assert.equal(result.search_url,'https://www.coupang.com/np/search?q='+encodeURIComponent('round metal glasses'));
});

test('search only accepts cited Coupang items of the requested type within budget and excludes seen IDs',async()=>{
  const known={...product(),price:79},uncited=product(1),expensive={...product(2),price:129},wrong={...product(3),product_type:'chair'};
  const result=await searchCoupang({query:'glasses under ₩100',category:'glasses',max_price:100,exclude_ids:['900000']},env,async()=>response([known,uncited,expensive,wrong],[known,expensive,wrong]));
  assert.deepEqual(result.products,[]);
  const accepted=await searchCoupang({query:'glasses under ₩100',category:'glasses',max_price:100},env,async()=>response([known,uncited,expensive,wrong],[known,expensive,wrong]));
  assert.deepEqual(accepted.products.map(p=>p.id),['900000']);
});

test('missing photo and price remain unavailable',async()=>{
  const row={...product(),price:null,image_url:'https://evil.test/image.jpg'};
  const result=await searchCoupang({query:'glasses'},env,async()=>response([row]));
  assert.equal(result.products[0].price,null);assert.equal(result.products[0].image,null);
});

test('Coupang item and image URLs reject credentials, redirects and lookalike hosts',()=>{
  const item='https://www.coupang.com/vp/products/123';
  assert.deepEqual(coupangListing(item+'?tracking=1#x'),{id:'123',url:item});
  for(const url of ['http://www.coupang.com/vp/products/123','https://www.coupang.com.evil.test/vp/products/123','https://x@www.coupang.com/vp/products/123','https://www.coupang.com/np/search?q=glasses','https://www.coupang.com/vp/products/abc','https://www.lazada.sg/products/pdp-i123.html'])assert.equal(coupangListing(url),null);
  assert.equal(coupangImage(image),image);
  for(const host of ['thumbnail.coupangcdn.com','image.coupangcdn.com'])assert.equal(coupangImage(`https://${host}/p/example.jpg`),`https://${host}/p/example.jpg`);
  for(const url of ['http://thumbnail.coupangcdn.com/image/example.jpg','https://thumbnail.coupangcdn.com.evil.test/image/example.jpg','https://x@thumbnail.coupangcdn.com/image/example.jpg','https://thumbnail.coupangcdn.com/image/example.svg',image+'?redirect=https://evil.test'])assert.equal(coupangImage(url),null);
});

test('explicit live mode returns sourced Coupang listings without promising unreviewed try-on support',async()=>{
  const liveEnv={...env,COUPI_PRODUCT_SEARCH_MODE:'live'};
  let calls=0;
  const handler=createVoiceHandler({fetchImpl:async()=>{calls++;return response([product()]);}});
  const request=new Request('https://coupi.test/api/products/search',{method:'POST',headers:{origin:'https://coupi.test','Content-Type':'application/json'},body:JSON.stringify({query:'glasses',category:'glasses'})});
  const responseValue=await handler(request,liveEnv);assert.equal(responseValue.status,200);
  const body=await responseValue.json();assert.equal(body.products.length,1);assert.equal(body.products[0].source,'coupang_web');
  assert.equal(body.products[0].preview.available,false);assert.match(body.products[0].preview.unavailableReason,/not been reviewed/);
  const status=await(await handler(new Request('https://coupi.test/api/voice/status'),liveEnv)).json();
  assert.equal(status.productSearchMode,'live');assert.equal(calls,1);
});

test('configured API keys keep default demo search local and every returned product preview-ready',async()=>{
  let calls=0;
  const handler=createVoiceHandler({fetchImpl:async()=>{calls++;throw Error('Demo search must not use live retrieval');}});
  for(const config of [env,{...env,COUPI_PRODUCT_SEARCH_MODE:'demo'},{...env,COUPI_PRODUCT_SEARCH_MODE:'unknown'}]){
    const request=new Request('https://coupi.test/api/products/search',{method:'POST',headers:{origin:'https://coupi.test','Content-Type':'application/json'},body:JSON.stringify({query:'glasses',category:'glasses'})});
    const result=await handler(request,config);assert.equal(result.status,200);
    const body=await result.json();assert.ok(body.products.length>0);assert.ok(body.products.every(isDemoProduct));
    assert.ok(body.products.every(p=>p.source!=='coupang_web'&&catalog.some(record=>record.id===p.id)));
    const status=await(await handler(new Request('https://coupi.test/api/voice/status'),config)).json();
    assert.equal(status.ready,true);assert.equal(status.productSearchMode,'demo');assert.equal(status.catalogCount,demoCatalog(catalog).length);
  }
  assert.equal(calls,0);
});

test('missing configuration and upstream errors are explicit',async()=>{
  await assert.rejects(searchCoupang({query:'glasses'},{},()=>{throw Error('must not fetch');}),/not configured/);
  await assert.rejects(searchCoupang({query:'glasses'},env,async()=>new Response('private',{status:500})),/unavailable/);
  await assert.rejects(searchCoupang({query:'glasses'},env,async()=>Response.json({status:'incomplete'})),/did not finish/);
});

test('image proxy permits bounded Coupang raster images without redirects',async()=>{
  const request=new Request('https://coupi.test/api/products/image?url='+encodeURIComponent(image));
  let options;
  const result=await productImage(request,async(url,init)=>{assert.equal(url,image);options=init;return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/jpeg'}});});
  assert.equal(options.redirect,'manual');assert.equal(result.status,200);
  assert.equal((await productImage(request,async()=>new Response(null,{status:302,headers:{Location:'https://evil.test/image.jpg'}}))).status,502);
  assert.equal((await productImage(request,async()=>new Response('<svg/>',{headers:{'Content-Type':'image/svg+xml'}}))).status,502);
  assert.equal((await productImage(new Request('https://coupi.test/api/products/image?url=http://localhost'),()=>{throw Error('must not fetch');})).status,400);
  const cdnRequest=new Request('https://coupi.test/api/products/image?url='+encodeURIComponent('https://image.coupangcdn.com/image/frames.jpg'));
  const jpg=await productImage(cdnRequest,async()=>new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/jpg'}}));
  assert.equal(jpg.status,200);assert.equal(jpg.headers.get('content-type'),'image/jpeg');
});
