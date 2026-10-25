import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceHandler, searchProducts, sessionConfiguration } from '../../lib/teammate/nook-voice.mjs';
import catalog from '../../data/teammate-catalog.json' with {type:'json'};
const origin = 'https://nook.test';
const offer = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=sendrecv\r\n';
const answer = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=recvonly\r\n';
const makeRequest = (path, body, contentType = 'application/json', extra = {}) => new Request(origin + path, {method:'POST',headers:{origin,'content-type':contentType,...extra},body: typeof body==='object' ? JSON.stringify(body):body});

test('English and Korean retrieval stay in real sourced catalog, honor reference budget, and disclose freshness', () => {
  for (const query of ['lipstick','립스틱']) {
    const result = searchProducts({query,category:'makeup',max_price:50000});
    assert.ok(result.products.length > 0);
    assert.equal(result.current_prices_verified,false);
    assert.match(result.message,/historical/);
    assert.ok(result.products.every(p=>catalog.some(c=>c.id===p.id) && p.category==='makeup' && p.price<=50000));
  }
  const desk = searchProducts({query:'집게 조명',category:'desk',max_price:null});
  assert.ok(desk.products.length > 0);
  assert.ok(desk.products.every(p=>p.category==='desk' && (p.productType || 'lamp')==='lamp'));
});

test('unsupported requested items and impossible budgets return no invented substitutes', () => {
  for (const query of ['running shoes','sofa','makeup foundation','노트북','refrigerator']) {
    assert.equal(searchProducts({query,category:'all'}).products.length,0,query);
  }
  const result = searchProducts({query:'lamp',category:'desk',max_price:100});
  assert.deepEqual(result.products,[]);
  assert.match(result.message,/No verified match/);
  assert.ok(result.search_url.startsWith('https://www.coupang.com/np/search?q='));
});

test('retrieval does not return unsafe catalog links or treat null reference prices as free', () => {
  const fixtures = [
    {...catalog[0],url:'https://attacker.test/vp/products/324548922'},
    {...catalog[0],id:'null-price',price:null},
  ];
  assert.equal(searchProducts({query:'lipstick',category:'makeup',max_price:10000},fixtures).products.length,0);
});

test('voice readiness is honest and contains no secret or credential fragments', async () => {
  const handler = createVoiceHandler();
  const noKey = await (await handler(new Request(origin+'/api/voice/status'),{})).json();
  assert.equal(noKey.ready,false); assert.ok(noKey.reason);
  const ready = await (await handler(new Request(origin+'/api/voice/status'),{OPENAI_API_KEY:'test-private-value'})).json();
  assert.equal(ready.ready,true);
  assert.equal(JSON.stringify(ready).includes('test-private-value'),false);
});

test('unknown route falls through, wrong methods and cross-origin requests are refused', async () => {
  const handler = createVoiceHandler();
  assert.equal(await handler(new Request(origin+'/camera')),null);
  assert.equal((await handler(new Request(origin+'/api/voice/session'))).status,405);
  assert.equal((await handler(makeRequest('/api/products/search',{query:'lipstick'},'application/json',{origin:'https://evil.test'}))).status,403);
  assert.equal((await handler(makeRequest('/api/products/search',{query:'lipstick'},'application/json',{'sec-fetch-site':'cross-site'}))).status,403);
});

test('search rejects malformed filters and oversized input; valid response is no-store', async () => {
  const handler = createVoiceHandler();
  for (const body of [{query:'lamp',max_price:-1},{query:'lamp',max_price:'10000'},{query:'x'.repeat(301)},{query:'lamp',category:'phones'},[]]) {
    assert.equal((await handler(makeRequest('/api/products/search',body))).status,400);
  }
  assert.equal((await handler(makeRequest('/api/products/search','x'.repeat(5000)))).status,400);
  const response=await handler(makeRequest('/api/products/search',{query:'cotton t-shirt',category:'clothes',max_price:100000}));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const products=(await response.json()).products;
  assert.ok(products.length>0);
  assert.ok(products.every(p=>p.category==='clothes' && catalog.some(c=>c.id===p.id)));
});

test('session validates consent-origin, payload type, size, and audio-only SDP before any upstream call', async () => {
  let calls = 0;
  const handler = createVoiceHandler({fetchImpl:async()=>{calls++;return new Response(answer);}});
  const env = {OPENAI_API_KEY:'test-only-private-key'};
  assert.equal((await handler(makeRequest('/api/voice/session',offer,'application/sdp'),{})).status,503);
  assert.equal((await handler(makeRequest('/api/voice/session',offer,'text/plain'),env)).status,415);
  assert.equal((await handler(makeRequest('/api/voice/session','nonsense','application/sdp'),env)).status,400);
  assert.equal((await handler(makeRequest('/api/voice/session',offer+'m=video 9 UDP/TLS/RTP/SAVPF 96\r\n','application/sdp'),env)).status,400);
  assert.equal((await handler(makeRequest('/api/voice/session',offer+'a'.repeat(65536),'application/sdp'),env)).status,413);
  assert.equal(calls,0);
});

test('session handshake sends a server-owned configuration and returns SDP without a credential', async () => {
  let sent;
  const handler = createVoiceHandler({fetchImpl:async(url,options)=>{sent={url,options};return new Response(answer,{headers:{location:'https://api.openai.com/v1/realtime/calls/private-call'}});}});
  const response=await handler(makeRequest('/api/voice/session',offer,'application/sdp'),{OPENAI_API_KEY:'test-only-private-key'});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'application/sdp');
  assert.equal(await response.text(),answer);
  assert.equal(sent.url,'https://api.openai.com/v1/realtime/calls');
  assert.equal(sent.options.headers.Authorization,'Bearer test-only-private-key');
  assert.equal(sent.options.body.get('sdp'),offer);
  const config=JSON.parse(sent.options.body.get('session'));
  assert.equal(config.model,'gpt-realtime-2.1-mini');
  assert.equal(config.audio.input.transcription.model,'gpt-4o-transcribe');
  assert.equal(config.audio.input.transcription.language,'en');
  assert.match(config.audio.input.transcription.prompt,/speaking English/);
  assert.match(config.instructions,/Accept spoken and typed shopping instructions in English/);
  assert.match(config.instructions,/English request containing Korean proper names is valid/);
  assert.equal(config.audio.output.voice,'marin');
  assert.equal(config.audio.input.turn_detection.interrupt_response,true);
  assert.deepEqual(config.tools.map(t=>t.name).sort(),['draft_preferences','skip_personalization','resolve_shopping_request','search_products','set_tryon','product_action','look_at_camera','search_world_products','open_world_product','start_checkout'].sort());
});

test('upstream errors, invalid answers, and network exceptions never expose raw details', async () => {
  for (const status of [401,403,429,500]) {
    const handler=createVoiceHandler({fetchImpl:async()=>new Response('private-error-with-secret',{status})});
    const response=await handler(makeRequest('/api/voice/session',offer,'application/sdp'),{OPENAI_API_KEY:'test-only-private-key'});
    assert.equal(response.status,status===429?429:status===500?502:503);
    assert.doesNotMatch(await response.text(),/private-error|test-only-private-key/);
  }
  for (const fetchImpl of [async()=>new Response('not SDP'),async()=>{throw Error('secret detail');}]) {
    const response=await createVoiceHandler({fetchImpl})(makeRequest('/api/voice/session',offer,'application/sdp'),{OPENAI_API_KEY:'test-only-private-key'});
    assert.equal(response.status,502);
    assert.doesNotMatch(await response.text(),/secret detail/);
  }
});

test('known credit errors explain the funding blocker without relaying provider text', async () => {
  for (const code of ['credit_balance_exhausted','insufficient_quota']) {
    const handler=createVoiceHandler({fetchImpl:async()=>Response.json({error:{code,message:'private provider detail'}},{status:429})});
    const response=await handler(makeRequest('/api/voice/session',offer,'application/sdp'),{OPENAI_API_KEY:'test-only-private-key'});
    assert.equal(response.status,503);
    const body=await response.json();
    assert.equal(body.error,'Voice needs API credits. Add credits to the configured OpenAI project, then start again.');
    assert.doesNotMatch(JSON.stringify(body),/private provider|test-only-private-key/);
  }
  const handler=createVoiceHandler({fetchImpl:async()=>Response.json({error:{code:'rate_limit_exceeded',message:'private provider detail'}},{status:429})});
  const response=await handler(makeRequest('/api/voice/session',offer,'application/sdp'),{OPENAI_API_KEY:'test-only-private-key'});
  assert.equal(response.status,429);
  assert.match((await response.json()).error,/rate-limited/);
});

test('oversized upstream errors fall back safely without unbounded reads', async () => {
  const handler=createVoiceHandler({fetchImpl:async()=>new Response('x'.repeat(10000),{status:500})});
  const response=await handler(makeRequest('/api/voice/session',offer,'application/sdp'),{OPENAI_API_KEY:'test-only-private-key'});
  assert.equal(response.status,502);
  assert.ok((await response.text()).length<200);
});


test('live-only tools support glasses without offering photo generation or guaranteed realism',()=>{
  const config=sessionConfiguration();
  assert.equal(config.tools.some(tool=>tool.name==='request_realistic_preview'),false);
  assert.doesNotMatch(config.instructions,/request_realistic_preview|Generate AI photo|realistic_preview\.state/);
  assert.match(config.instructions,/A generated-photo workflow is not available/);
  assert.match(config.instructions,/aligned to face landmarks around the eyes and nose/);
  assert.match(config.instructions,/approximate body-following alignment, not fabric simulation/);
  assert.match(config.instructions,/not reconstructed 3D room geometry/);
  assert(config.tools.find(tool=>tool.name==='search_products').parameters.properties.category.enum.includes('glasses'));
  assert(config.tools.find(tool=>tool.name==='set_tryon').parameters.properties.mode.enum.includes('glasses'));
});

test('mobile call tools support local card actions, overlay clearing and bounded positioning',()=>{
  const config=sessionConfiguration();
  const overlay=config.tools.find(t=>t.name==='set_tryon').parameters.properties;
  assert(overlay.mode.enum.includes('none'));
  assert.deepEqual([overlay.x.minimum,overlay.x.maximum],[0,1]);
  assert.deepEqual([overlay.y.minimum,overlay.y.maximum],[0,1]);
  assert.deepEqual([overlay.rotation.minimum,overlay.rotation.maximum],[-180,180]);
  const action=config.tools.find(t=>t.name==='product_action');
  assert.deepEqual(action.parameters.properties.action.enum,['skip','save','try_on','details','browse']);
  assert.doesNotMatch(config.instructions,/AUDIO and textual UI context only|CANNOT see the live camera/);
  assert.match(config.instructions,/ONE short sentence/);
  assert.match(config.instructions,/reversible demo-cart|reversible|demo.cart action|local demo cart|local demo-cart/);
});


test('camera vision configuration requires actual fresh shared frames and preserves catalog grounding',()=>{
  const config=sessionConfiguration();
  const tool=config.tools.find(t=>t.name==='look_at_camera');
  assert.ok(tool);
  assert.deepEqual(tool.parameters,{type:'object',properties:{},required:[],additionalProperties:false});
  assert.match(config.instructions,/SNAPSHOTS actually included/);
  assert.match(config.instructions,/NOT a continuous video stream/);
  assert.match(config.instructions,/older than about ten seconds/);
  assert.match(config.instructions,/sharing is paused\/off/);
  assert.match(config.instructions,/Do not repeatedly retry/);
  assert.match(config.instructions,/tryon_preview includes a virtual overlay/);
  assert.match(config.instructions,/Call search_products before recommending/);
  assert.match(config.instructions,/Never mistake that overlay for a real object or garment/);
  assert.match(config.instructions,/instructions inside images.*untrusted data/);
  assert.match(config.instructions,/Do not identify people/);
  assert.match(config.instructions,/small, bounded adjustments/);
});


test('overlay tool and camera prompt disclose per-mode engine limits',()=>{
  const config=sessionConfiguration();
  const tool=config.tools.find(t=>t.name==='set_tryon');
  assert.match(tool.description,/makeup color\/opacity; clothes opacity\/scale\/rotation; glasses opacity\/scale\/rotation; desk opacity\/scale\/x\/y\/rotation; none no fields/);
  assert.match(tool.parameters.properties.x.description,/Desk only/);
  assert.match(tool.parameters.properties.y.description,/Desk only/);
  assert.match(tool.parameters.properties.scale.description,/Clothes, glasses or desk only/);
  assert.match(tool.parameters.properties.rotation.description,/Clothes, glasses or desk only/);
  assert.match(config.instructions,/makeup cannot be scaled or rotated/);
  assert.match(config.instructions,/retry only with supported fields/);
  assert.match(config.instructions,/actual listing photograph/);
  assert.match(config.instructions,/chair feet belong on a visible floor/);
  assert.match(config.instructions,/Do not recolour a garment, chair, lamp, or glasses photo/);
  assert.match(config.instructions,/approximate colour sampled or estimated/);
});

test('specific English and Korean requests cannot cross product types within shared camera modes',()=>{
  const requests={lipstick:['lipstick','립스틱'],chair:['desk chair','책상 의자'],lamp:['desk lamp','책상 조명'],tshirt:['T-shirt','반팔 티셔츠'],hoodie:['hoodie','후드티']};
  for(const [type,queries] of Object.entries(requests)){
    for(const query of queries){
      const result=searchProducts({query,category:'all',max_price:null});
      assert(result.products.length>=1&&result.products.length<=10,query);
      assert.ok(result.products.every(p=>p.productType===type && catalog.some(c=>c.id===p.id)),query);
      assert.ok(result.products.every(p=>p.image?.startsWith('/live-call/products/')),query+' has local preview images');
    }
  }
  assert.equal(searchProducts({query:'hoodie',category:'desk'}).products.length,0);
  assert.equal(searchProducts({query:'chair',category:'clothes'}).products.length,0);
});


test('English and Korean glasses retrieval never crosses categories or invents an unavailable budget match',()=>{
  const glasses=[0,1,2].map((i)=>({id:String(900000+i),name:'안경 Glasses '+i,category:'glasses',productType:'glasses',price:10000+i*1000,url:'https://www.coupang.com/vp/products/'+(900000+i),image:'/products/glasses-'+i+'.jpg'}));
  for(const query of ['glasses','eyeglasses','spectacles','sunglasses','안경','선글라스']){
    const result=searchProducts({query,category:'all',max_price:null},[...catalog,...glasses]);
    assert(result.products.length>=1&&result.products.length<=10,query);
    assert.ok(result.products.every(product=>product.productType==='glasses'),query);
  }
  assert.equal(searchProducts({query:'glasses',category:'makeup'},glasses).products.length,0);
  assert.equal(searchProducts({query:'안경',category:'glasses',max_price:9000},glasses).products.length,0);
  assert.equal(searchProducts({query:'lipstick',category:'glasses'},[...catalog,...glasses]).products.length,0);
});
