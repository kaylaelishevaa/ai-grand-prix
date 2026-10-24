import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// No browser, microphone, network, or OpenAI credential is used by these tests.
const source = readFileSync(new URL('../public/voice-call.js', import.meta.url), 'utf8');
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
class Emitter {
  handlers = new Map();
  addEventListener(name, fn) {
    if (!this.handlers.has(name)) this.handlers.set(name, []);
    this.handlers.get(name).push(fn);
  }
  emit(name, event = {}) {for (const fn of this.handlers.get(name) || []) fn(event);}
}
function microphone() {
  const track = new Emitter();
  track.enabled = true;
  track.stops = 0;
  track.stop = () => track.stops++;
  return {track, getTracks: () => [track], getAudioTracks: () => [track]};
}
function response(body, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    headers: {get: key => headers[key] || null},
    json: async () => body,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  };
}
function fixture(t, options = {}) {
  const timerDelays = [];
  const context = {
    window: {isSecureContext: true, fetch: () => {throw Error('Unexpected real network');}},
    navigator: {}, document: {readyState: 'loading', addEventListener() {}},
    setTimeout: (fn,ms)=>{timerDelays.push(ms);return setTimeout(fn,ms);}, clearTimeout, setInterval, clearInterval, AbortController,
    MediaStream: class {}, Audio: class {}, TextEncoder, console,
  };
  vm.createContext(context);
  vm.runInContext(source, context, {filename: 'public/voice-call.js'});
  const peers = [];
  class Peer extends Emitter {
    constructor() {
      super();
      this.channel = new Emitter();
      this.channel.readyState = 'open';
      this.channel.sent = [];
      this.channel.send = value => this.channel.sent.push(JSON.parse(value));
      this.channel.close = () => {
        this.channel.readyState = 'closed';
        this.channel.emit('close');
      };
      this.addedTracks = [];
      peers.push(this);
    }
    addTrack(track, stream) {this.addedTracks.push([track, stream]);}
    createDataChannel(name) {assert.equal(name, 'oai-events'); return this.channel;}
    async createOffer() {return {sdp: 'v=0\no=offer'};}
    async setLocalDescription(description) {this.localDescription = description;}
    async setRemoteDescription(description) {
      assert.equal(description.type, 'answer');
      assert.equal(description.sdp, 'v=0\no=answer');
      this.channel.emit('message', {data: JSON.stringify({type: 'session.created', session: {id: 'session_mock'}})});
    }
    close() {this.connectionState = 'closed'; this.emit('connectionstatechange');}
  }
  const mic = microphone();
  const audio = {srcObject: null, play: async () => {}, pause() {this.paused = true;}};
  const calls = [], transcripts = [], states = [], recommendations = [], tryons = [], actions = [], checkouts = [], visionStates = [], captures = [], transcriptionStates = [];
  let permissions = 0;
  const voice = new context.window.NookVoiceSession({
    audio, PeerConnection: Peer, greeting: options.greeting,
    mediaDevices: {getUserMedia: async constraints => {
      permissions++;
      assert.equal(constraints.video, false);
      assert.equal(constraints.audio.echoCancellation, true);
      assert.equal(constraints.audio.channelCount.ideal, 1);
      return options.getUserMedia ? options.getUserMedia(permissions) : mic;
    }},
    fetch: async (url, params = {}) => {
      calls.push([url, params]);
      if (url.endsWith('/status')) return response({ready: options.ready ?? true});
      if (url.endsWith('/session')) {
        assert.equal(params.headers['Content-Type'], 'application/sdp');
        assert.equal(params.body, 'v=0\no=offer');
        return options.sessionResponse || response('v=0\no=answer', 200, {'x-nook-call-id': 'call_mock'});
      }
      if (url.endsWith('/end')) return response({ok: true});
      if (url.endsWith('/search')) return options.search ? options.search(params) : response({products: [], message: 'No matching catalog products'});
      throw Error(`Unexpected endpoint ${url}`);
    },
    getContext: options.getContext || (() => ({mode: 'makeup', cameraRunning: true})),
    getVisionEnabled: options.getVisionEnabled,
    getCameraSnapshot: reason => {captures.push(reason);return options.getCameraSnapshot?.(reason);},
    onVisionState: value => visionStates.push(value),
    onState: value => states.push(value),
    onTranscript: value => transcripts.push(value),
    onTranscriptionState: value => transcriptionStates.push(value),
    onRecommendations: (products, message, metadata) => recommendations.push({products, message, metadata}),
    onTryon: async (mode, overlay) => {tryons.push({mode, overlay});return options.onTryon?.(mode,overlay);},
    onProductAction: async (action, product_id) => {actions.push({action,product_id});return {ok:true,action,product_id:product_id || "324548922",purchased:false};},
    onCheckout: options.checkoutUnavailable?undefined:async value=>{checkouts.push(value);return options.onCheckout?options.onCheckout(value):{ok:true,item_ids:['324548922']};},
  });
  t.after(() => voice.end());
  return {
    voice, mic, audio, calls, transcripts, states, recommendations, tryons, peers, actions, checkouts, timerDelays, visionStates, captures, transcriptionStates,
    get permissions() {return permissions;},
    get channel() {return voice.call?.channel;},
    emit(event) {this.channel.emit('message', {data: JSON.stringify(event)});},
  };
}
const countReplies = channel => channel.sent.filter(event => event.type === 'response.create').length;
const toolOutputs = channel => channel.sent.filter(event => event.item?.type === 'function_call_output');
async function connect(f) {assert.equal(await f.voice.start(), true); await tick();}
function done(f, id, output = []) {f.emit({type: 'response.done', response: {id, status: 'completed', output}});}
function tool(f, callId, name, args, responseId) {
  const event = {type: 'response.function_call_arguments.done', call_id: callId, name, arguments: JSON.stringify(args), response_id: responseId};
  f.emit(event);
  return {type: 'function_call', call_id: callId, name, arguments: event.arguments};
}

test('explicit audio-only start, one greeting, mute, and end release all call resources', async t => {
  const f = fixture(t);
  assert.equal(f.permissions, 0);
  await connect(f);
  assert.equal(f.permissions, 1);
  const channel = f.channel;
  assert.equal(countReplies(channel), 1);
  assert.equal(f.peers[0].addedTracks.length, 1);
  assert.equal(f.voice.mute(), true);
  assert.equal(f.mic.track.enabled, false);
  f.voice.end();
  assert.equal(f.voice.call, null);
  assert.equal(f.mic.track.stops, 1);
  assert.equal(channel.readyState, 'closed');
  assert.equal(f.peers[0].connectionState, 'closed');
  assert.equal(f.audio.srcObject, null);
  const end = f.calls.find(([url]) => url.endsWith('/end'));
  assert.deepEqual(JSON.parse(end[1].body), {call_id: 'call_mock'});
});

test('missing server configuration never prompts for a microphone', async t => {
  const f = fixture(t, {ready: false});
  assert.equal(await f.voice.start(), false);
  assert.equal(f.permissions, 0);
  assert.equal(f.voice.state, 'error');
  assert.match(f.states.at(-1).message, /not configured/i);
});

test('late permission after cancellation closes only the old microphone, preserving a new call', async t => {
  const permission = deferred(), oldMic = microphone(), newMic = microphone();
  const f = fixture(t, {getUserMedia: count => count === 1 ? permission.promise : newMic});
  const firstStart = f.voice.start();
  await tick();
  f.voice.end();
  await connect(f);
  const newCall = f.voice.call;
  permission.resolve(oldMic);
  assert.equal(await firstStart, false);
  assert.equal(oldMic.track.stops, 1);
  assert.equal(newMic.track.stops, 0);
  assert.equal(f.voice.call, newCall);
  f.voice.end();
  assert.equal(newMic.track.stops, 1);
});

test('a failed SDP handshake releases microphone and reports the server error', async t => {
  const f = fixture(t, {sessionResponse: response({error: 'Voice quota unavailable'}, 429)});
  assert.equal(await f.voice.start(), false);
  assert.equal(f.mic.track.stops, 1);
  assert.equal(f.voice.call, null);
  assert.equal(f.voice.state, 'error');
  assert.match(f.states.at(-1).message, /quota unavailable/);
});

test('multiple tools deduplicate across GA events and wait for response.done plus all tool results', async t => {
  const search = deferred();
  const catalogResult = {products: [{id: 'verified-1', name: 'Catalog lipstick', url: 'https://www.coupang.com/vp/products/1'}], message: 'Historical reference prices', current_prices_verified: false};
  const f = fixture(t, {search: () => search.promise});
  await connect(f);
  const channel = f.channel, baseline = countReplies(channel);
  f.emit({type: 'response.created', response: {id: 'r-tools'}});
  const first = tool(f, 'search-1', 'search_products', {query: 'rose lipstick', category: 'makeup', max_price: 20000}, 'r-tools');
  const second = tool(f, 'try-1', 'set_tryon', {mode: 'makeup', color: '#aa3344', opacity: 0.7}, 'r-tools');
  await tick();
  assert.equal(countReplies(channel), baseline, 'No response.create while originating response is active');
  done(f, 'r-tools', [first, second]);
  await tick();
  assert.equal(countReplies(channel), baseline, 'No response.create while search is pending');
  search.resolve(response(catalogResult));
  await tick(); await tick();
  assert.equal(f.calls.filter(([url]) => url.endsWith('/search')).length, 1);
  assert.equal(f.tryons.length, 1);
  assert.equal(f.recommendations.length, 1);
  assert.deepEqual(f.recommendations[0].products, catalogResult.products);
  assert.equal(f.recommendations[0].metadata.sourceOnly,true);
  assert.equal(f.recommendations[0].metadata.query,'rose lipstick');
  assert.equal(f.recommendations[0].metadata.maxPrice,20000);
  assert.equal(toolOutputs(channel).length, 2);
  assert.equal(countReplies(channel), baseline + 1);
  const output = toolOutputs(channel).find(event => event.item.call_id === 'search-1');
  assert.deepEqual(JSON.parse(output.item.output), catalogResult);

  // Reordered/duplicate completion events must not reopen a finished response.
  tool(f, 'search-1', 'search_products', {query: 'duplicate'}, 'r-tools');
  f.emit({type: 'response.created', response: {id: 'r-followup'}});
  done(f, 'r-followup');
  assert.equal(f.voice.sendText('Show me something else'), true);
  await tick();
  assert.equal(countReplies(channel), baseline + 2);
  assert.equal(f.calls.filter(([url]) => url.endsWith('/search')).length, 1);
});

test('invalid tools and failed catalog requests return honest failures without product invention', async t => {
  const f = fixture(t, {search: () => response({error: 'Unavailable'}, 503)});
  await connect(f);
  f.emit({type: 'response.created', response: {id: 'r-errors'}});
  const items = [
    tool(f, 'bad-budget', 'search_products', {query: 'lipstick', max_price: -1}, 'r-errors'),
    tool(f, 'bad-mode', 'set_tryon', {mode: 'purchase'}, 'r-errors'),
    tool(f, 'unavailable', 'search_products', {query: 'lamp', category: 'desk'}, 'r-errors'),
  ];
  done(f, 'r-errors', items);
  await tick(); await tick();
  assert.equal(f.calls.filter(([url]) => url.endsWith('/search')).length, 1);
  assert.equal(f.tryons.length, 0);
  assert.equal(f.recommendations.length, 0);
  const outputs = toolOutputs(f.channel).map(event => JSON.parse(event.item.output));
  assert.equal(outputs.length, 3);
  assert(outputs.every(output => output.ok === false && output.products.length === 0));
});

test('ending during a product lookup aborts it and suppresses late UI or model updates', async t => {
  const search = deferred();
  const f = fixture(t, {search: () => search.promise});
  await connect(f);
  f.emit({type: 'response.created', response: {id: 'r-pending'}});
  tool(f, 'pending-search', 'search_products', {query: 'lamp'}, 'r-pending');
  const channel = f.channel;
  const request = f.calls.find(([url]) => url.endsWith('/search'));
  f.voice.end();
  assert.equal(request[1].signal.aborted, true);
  search.resolve(response({products: [{id: 'late'}], message: 'Late results'}));
  await tick();
  assert.equal(f.recommendations.length, 0);
  assert.equal(toolOutputs(channel).length, 0);
});

test('GA transcript events pass literal text, and typed input works after muting interrupted speech', async t => {
  const f = fixture(t);
  await connect(f);
  f.emit({type: 'response.created', response: {id: 'greeting'}});
  done(f, 'greeting');
  f.emit({type: 'conversation.item.input_audio_transcription.completed', item_id: 'user-1', transcript: '<img src=x onerror=alert(1)>'});
  f.emit({type: 'response.output_audio_transcript.delta', item_id: 'assistant-1', delta: 'A rose '});
  f.emit({type: 'response.output_audio_transcript.done', item_id: 'assistant-1', transcript: 'A rose lipstick.'});
  assert.equal(f.transcripts[0].text, '<img src=x onerror=alert(1)>');
  assert.equal(f.transcripts[1].text, 'A rose ');
  assert.equal(f.transcripts[2].text, 'A rose lipstick.');
  f.emit({type: 'input_audio_buffer.speech_started'});
  f.voice.mute();
  const baseline = countReplies(f.channel);
  assert.equal(f.voice.sendText('Under 20000 won please'), true);
  await tick();
  assert.equal(countReplies(f.channel), baseline + 1);
  assert.equal(f.mic.track.enabled, false);
});

test('camera context updates debounce and do not force a spoken response', async t => {
  const f = fixture(t);
  await connect(f);
  const baseline = countReplies(f.channel);
  f.voice.updateContext({mode: 'clothes', opacity: 0.4});
  f.voice.updateContext({mode: 'clothes', opacity: 0.8});
  await tick(380);
  assert.equal(countReplies(f.channel), baseline);
  const updates = f.channel.sent.filter(event => event.item?.content?.[0]?.text?.startsWith('App context changed'));
  assert.equal(updates.length, 1);
  assert.match(updates[0].item.content[0].text, /"opacity":0.8/);
});

test('removed photo-generation tool is rejected without capture, upload or UI changes', async t => {
  const f=fixture(t);await connect(f);
  const networkCount=f.calls.length;
  const item=tool(f,'removed-photo','request_realistic_preview',{instruction:'Make it realistic'},'r-removed-photo');
  done(f,'r-removed-photo',[item]);await tick();
  const output=JSON.parse(toolOutputs(f.channel).at(-1).item.output);
  assert.equal(output.ok,false);
  assert.match(output.error,/Unknown tool/);
  assert.equal(f.calls.length,networkCount);
  assert.equal(f.captures.length,0);
  assert.equal(f.tryons.length,0);
  assert.equal(imageEvents(f.channel).length,0);
});

test('glasses search preserves the requested category and returns only the catalog result',async t=>{
  const glasses={id:'900001',name:'Verified frames',category:'glasses',productType:'glasses',url:'https://www.coupang.com/vp/products/900001'};
  const f=fixture(t,{search:params=>{const query=JSON.parse(params.body);assert.equal(query.category,'glasses');assert.equal(query.query,'안경');return response({products:[glasses],message:'Reference listing'});}});
  await connect(f);
  const item=tool(f,'glasses-search','search_products',{query:'안경',category:'glasses',max_price:null},'r-glasses-search');
  done(f,'r-glasses-search',[item]);await tick();
  const output=JSON.parse(toolOutputs(f.channel).at(-1).item.output);
  assert.deepEqual(output.products,[glasses]);
  assert.equal(f.recommendations.length,1);
});

test('long context remains valid bounded JSON and preserves live glasses and sharing state', async t => {
  const context={mode:'glasses',screen:'active',cameraRunning:true,
    vision:{enabled:true,state:'received',last_image_at:'2026-10-25T01:00:00Z'},
    tried_product:{id:'900001',productType:'glasses',title:'Long catalog name '.repeat(1000)},
    visible_product:{id:'900001',title:'Another long catalog name '.repeat(1000)},
    unused:'x'.repeat(6000)};
  const f=fixture(t,{getContext:()=>context});await connect(f);
  const greeting=f.channel.sent.find(event=>event.item?.content?.[0]?.text?.startsWith('App context,'));
  const initial=greeting.item.content[0].text.split('App context, not a spoken shopper request: ')[1].split('. The shopper answered')[0];
  assert(initial.length<=1600);
  assert.equal(JSON.parse(initial).mode,'glasses');
  assert.deepEqual(JSON.parse(initial).vision,context.vision);
  f.voice.updateContext({...context,vision:{enabled:false,state:'paused'}});
  await tick(380);
  const update=f.channel.sent.find(event=>event.item?.content?.[0]?.text?.startsWith('App context changed'));
  const encoded=update.item.content[0].text.split('App context changed (not a spoken shopper message): ')[1].split('. Keep this context')[0];
  assert(encoded.length<=1600);
  const decoded=JSON.parse(encoded);
  assert.equal(decoded.vision.enabled,false);
  assert.equal(decoded.vision.state,'paused');
  assert.equal(decoded.tried_product.id,'900001');
  assert.equal(decoded.tried_product.productType,'glasses');
});

test('failed peer connection releases microphone immediately', async t => {
  const f = fixture(t);
  await connect(f);
  f.peers[0].connectionState = 'failed';
  f.peers[0].emit('connectionstatechange');
  assert.equal(f.voice.call, null);
  assert.equal(f.mic.track.stops, 1);
  assert.equal(f.voice.state, 'error');
});

for (const code of ['credit_balance_exhausted', 'insufficient_quota', 'invalid_api_key']) {
  for (const eventType of ['error', 'response.done']) {
    test(`${eventType} with ${code} closes the call and microphone with an actionable error`, async t => {
      const f = fixture(t);
      await connect(f);
      const channel = f.channel;
      const error = {code, message: 'Provider detail that must not replace the actionable message'};
      f.emit(eventType === 'error' ? {type: 'error', error} : {
        type: 'response.done', response: {id: 'r-fatal', status: 'failed', status_details: {error}, output: []},
      });
      assert.equal(f.voice.call, null);
      assert.equal(f.mic.track.stops, 1);
      assert.equal(channel.readyState, 'closed');
      assert.equal(f.audio.srcObject, null);
      assert.equal(f.voice.state, 'error');
      assert.match(f.states.at(-1).message, code === 'invalid_api_key' ? /update the configured OpenAI API key/ : /Voice needs API credits/);
      assert(f.calls.some(([url]) => url.endsWith('/end')));
    });
  }
}


test('phone-call greeting is used once and position controls reach the local camera hook', async t => {
  const f=fixture(t,{greeting:'How can I help you today?'});
  await connect(f);
  const greeting=f.channel.sent.find(e=>e.item?.type==='message');
  assert.match(greeting.item.content[0].text,/How can I help you today/);
  f.emit({type:'response.created',response:{id:'r-position'}});
  const item=tool(f,'position-1','set_tryon',{mode:'desk',x:.2,y:.8,rotation:-25,scale:1.2},'r-position');
  done(f,'r-position',[item]);await tick();await tick();
  assert.equal(f.tryons[0].mode,'desk');
  assert.deepEqual(JSON.parse(JSON.stringify(f.tryons[0].overlay)),{x:.2,y:.8,rotation:-25,scale:1.2});
  const clear=tool(f,'clear-1','set_tryon',{mode:'none'},'r-clear');
  done(f,'r-clear',[clear]);await tick();
  assert.equal(f.tryons[1].mode,'none');
});

test('card actions use the application hook and return its grounded result without making purchases',async t=>{
  const f=fixture(t);await connect(f);
  for(const [index,action] of ['skip','save','try_on','details','browse'].entries()){
    const item=tool(f,'action-'+index,'product_action',{action,product_id:'324548922'},'r-action-'+index);
    done(f,'r-action-'+index,[item]);await tick();
  }
  assert.equal(f.actions.length,5);
  assert.deepEqual(f.actions.map(x=>x.action),['skip','save','try_on','details','browse']);
  assert(toolOutputs(f.channel).every(e=>JSON.parse(e.item.output).purchased===false));
  assert.equal(f.calls.filter(([url])=>url.endsWith('/search')).length,0);
});

test('invalid card IDs, unsupported actions and nonnumeric overlay values never reach UI hooks',async t=>{
  const f=fixture(t);await connect(f);
  const items=[
    tool(f,'unsafe-id','product_action',{action:'save',product_id:'https://attacker.test'},'r-invalid'),
    tool(f,'order','product_action',{action:'purchase',product_id:'324548922'},'r-invalid'),
    tool(f,'bad-x','set_tryon',{mode:'desk',x:'0.4'},'r-invalid'),
    tool(f,'bad-rotation','set_tryon',{mode:'desk',rotation:null},'r-invalid'),
  ];
  done(f,'r-invalid',items);await tick();await tick();
  assert.equal(f.actions.length,0);assert.equal(f.tryons.length,0);
  assert(toolOutputs(f.channel).every(e=>JSON.parse(e.item.output).ok===false));
});

test('microphone consent has its own timeout budget before the connection handshake timer starts',async t=>{
  const permission=deferred();const mic=microphone();const f=fixture(t,{getUserMedia:()=>permission.promise});
  const start=f.voice.start();await tick();
  assert(f.timerDelays.includes(60000));assert(!f.timerDelays.includes(25000));
  permission.resolve(mic);await start;await tick();
  assert(f.timerDelays.includes(25000));assert(f.voice.call.ready);
});

const cameraSnapshot = (capturedAt = 1234, preview = false) => ({
  images: [{kind:'camera',dataUrl:'data:image/jpeg;base64,/9j/2Q=='},...(preview?[{kind:'tryon_preview',dataUrl:'data:image/png;base64,iVBORw0KGgo='}]:[])],
  metadata:{capturedAt,mode:'makeup',mirror:true},
});
const imageEvents = channel => channel.sent.filter(event=>event.item?.content?.some(part=>part.type==='input_image'));
const imageDeletes = channel => channel.sent.filter(event=>event.type==='conversation.item.delete');
function acknowledgeImage(f,event,type='conversation.item.added') {f.emit({type,item:{id:event.item.id,type:'message',role:'user'}});}

test('opt-in camera images precede greeting, distinguish preview, and require an ACK for received state',async t=>{
  const snapshot=cameraSnapshot(1234,true);
  const f=fixture(t,{getVisionEnabled:()=>true,getCameraSnapshot:()=>snapshot});await connect(f);
  assert.deepEqual(f.captures,['call-start']);
  const image=imageEvents(f.channel)[0];
  assert.equal(f.channel.sent[0],image);
  assert.equal(image.type,'conversation.item.create');
  assert.equal(image.item.type,'message');assert.equal(image.item.role,'user');
  assert.match(image.item.id,/^nook_cam_1_1$/);
  assert.equal(image.event_id,'nook_cam_1_1_create');
  assert.equal(image.item.content[0].type,'input_text');
  assert.match(image.item.content[0].text,/camera, tryon_preview/);
  assert.match(image.item.content[0].text,/virtual preview using the selected product listing photo/);
  assert.deepEqual(image.item.content.slice(1),snapshot.images.map(({dataUrl})=>({type:'input_image',image_url:dataUrl})));
  assert.deepEqual(f.visionStates.map(entry=>entry.state),['sent']);
  const greeting=f.channel.sent.find(event=>event.item?.content?.[0]?.text?.includes('The shopper answered'));
  assert.match(greeting.item.content[0].text,/only when you have actually received camera images/);
  acknowledgeImage(f,image);acknowledgeImage(f,image,'conversation.item.done');acknowledgeImage(f,image,'conversation.item.created');
  assert.deepEqual(f.visionStates.map(entry=>entry.state),['sent','received']);
  assert.equal(f.visionStates.at(-1).capturedAt,1234);
  const baseline=countReplies(f.channel);
  assert.equal(f.voice.sendCameraSnapshot(cameraSnapshot(2345)),true);
  await tick();assert.equal(countReplies(f.channel),baseline,'Periodic images never create an unsolicited voice response');
});

test('camera sharing defaults off and is blocked before ready, when paused, and after call end',async t=>{
  let enabled=false;
  const f=fixture(t,{getVisionEnabled:()=>enabled,getCameraSnapshot:()=>cameraSnapshot()});
  assert.equal(f.voice.sendCameraSnapshot(cameraSnapshot()),false);
  await connect(f);assert.equal(f.captures.length,0);assert.equal(imageEvents(f.channel).length,0);
  assert.equal(f.voice.sendCameraSnapshot(cameraSnapshot()),false);
  enabled=true;assert.equal(f.voice.sendCameraSnapshot(cameraSnapshot()),true);
  const image=imageEvents(f.channel)[0];const channel=f.channel;
  enabled=false;assert.equal(f.voice.clearCameraSnapshots(),true);
  assert.equal(f.voice.sendCameraSnapshot(cameraSnapshot()),false);
  acknowledgeImage(f,image);assert.equal(f.visionStates.at(-1).state,'paused','Late ACK cannot restore paused vision');
  assert.equal(imageDeletes(channel).length,1);
  assert.match(channel.sent.at(-1).item.content[0].text,/camera sharing is paused/);
  const oldCall=f.voice.call;
  f.voice.end();const messages=channel.sent.length;
  enabled=true;assert.equal(f.voice.sendCameraSnapshot(cameraSnapshot()),false);
  f.voice._event(oldCall,{type:'conversation.item.added',item:{id:image.item.id}});
  assert.equal(channel.sent.length,messages);assert.equal(oldCall.visionSnapshots.size,0);
  assert.equal(oldCall.visionDeleteQueue.size,0);
  const defaults=fixture(t,{getCameraSnapshot:()=>cameraSnapshot()});await connect(defaults);
  assert.equal(defaults.captures.length,0,'Camera access must be explicitly enabled by the host UI');
});

test('fresh frames are captured at speech start and before typed requests',async t=>{
  const f=fixture(t,{getVisionEnabled:()=>true,getCameraSnapshot:()=>cameraSnapshot()});await connect(f);
  acknowledgeImage(f,imageEvents(f.channel)[0]);
  f.emit({type:'input_audio_buffer.speech_started'});
  assert.deepEqual(f.captures,['call-start','speech-start']);
  f.emit({type:'input_audio_buffer.speech_stopped'});
  assert.equal(f.voice.sendText('What is on my desk?'),true);
  assert.deepEqual(f.captures,['call-start','speech-start','text']);
  const last=f.channel.sent.slice(-2);
  assert(last[0].item.content.some(part=>part.type==='input_image'));
  assert.equal(last[1].item.content[0].text,'What is on my desk?');
});

test('camera images retain the latest two acknowledgements and defer pruning during responses',async t=>{
  const f=fixture(t,{getVisionEnabled:()=>true});await connect(f);
  for(let i=0;i<2;i++) {assert(f.voice.sendCameraSnapshot(cameraSnapshot(i)));acknowledgeImage(f,imageEvents(f.channel).at(-1));}
  f.emit({type:'response.created',response:{id:'r-vision'}});
  assert(f.voice.sendCameraSnapshot(cameraSnapshot(3)));
  acknowledgeImage(f,imageEvents(f.channel).at(-1));
  assert.equal(imageDeletes(f.channel).length,0,'Do not mutate image history while a response uses it');
  assert.equal(f.voice.call.visionDeleteQueue.size,1);
  assert(f.voice.sendCameraSnapshot(cameraSnapshot(4)));
  acknowledgeImage(f,imageEvents(f.channel).at(-1));
  assert.equal(f.voice.sendCameraSnapshot(cameraSnapshot(5)),false,'Long responses cannot accumulate unbounded frames');
  done(f,'r-vision');
  assert.deepEqual(imageDeletes(f.channel).map(event=>event.item_id),imageEvents(f.channel).slice(0,2).map(event=>event.item.id));
  assert.equal(f.voice.call.visionSnapshots.size,2);assert.equal(f.voice.call.visionDeleteQueue.size,0);
  assert(f.voice.sendCameraSnapshot(cameraSnapshot(6)));
  acknowledgeImage(f,imageEvents(f.channel).at(-1),'conversation.item.created');
  assert.equal(f.voice.call.visionSnapshots.size,2);
  assert.equal(imageDeletes(f.channel).length,3);
});

test('invalid images, oversized payloads, channel backpressure and failed sends are safely rejected',async t=>{
  const f=fixture(t,{getVisionEnabled:()=>true});await connect(f);
  const badImages=[null,{images:[],metadata:{}},{images:[{kind:'camera',dataUrl:'https://example.com/a.jpg'}]},
    {images:[{kind:'camera',dataUrl:'data:image/svg+xml;base64,PHN2Zz4='}]},
    {images:[{kind:'camera',dataUrl:'data:image/jpeg;base64,'+'A'.repeat(55000)}]},
    {images:[...cameraSnapshot().images,...cameraSnapshot().images,...cameraSnapshot().images]},
    {images:[{kind:'tryon_preview',dataUrl:cameraSnapshot().images[0].dataUrl}]}];
  for(const invalid of badImages)assert.equal(f.voice.sendCameraSnapshot(invalid),false);
  f.channel.bufferedAmount=128*1024+1;assert.equal(f.voice.sendCameraSnapshot(cameraSnapshot()),false);
  assert.equal(imageEvents(f.channel).length,0);
  f.channel.bufferedAmount=0;const send=f.channel.send;f.channel.send=()=>{throw Error('SCTP is closing');};
  assert.equal(f.voice.sendCameraSnapshot(cameraSnapshot()),false);assert.equal(f.voice.call.visionSnapshots.size,0);
  f.channel.send=send;assert.equal(f.voice.sendCameraSnapshot(cameraSnapshot()),true);
  assert.equal(f.voice.call.visionSnapshots.size,1);
});

test('unacknowledged frames remain bounded and paused history waits for an active response to finish',async t=>{
  const f=fixture(t,{getVisionEnabled:()=>true});await connect(f);
  for(let i=0;i<4;i++)assert(f.voice.sendCameraSnapshot(cameraSnapshot(i)));
  for(let i=0;i<10;i++)assert.equal(f.voice.sendCameraSnapshot(cameraSnapshot(i)),false);
  assert.equal(imageEvents(f.channel).length,4);
  f.emit({type:'response.created',response:{id:'r-pause'}});
  f.voice.clearCameraSnapshots();assert.equal(imageDeletes(f.channel).length,0);
  assert.equal(f.voice.call.visionSnapshots.size,0);assert.equal(f.voice.call.visionDeleteQueue.size,4);
  done(f,'r-pause');assert.equal(imageDeletes(f.channel).length,4);
});

test('look_at_camera sends fresh images before a compact tool result and waits for response.done',async t=>{
  const f=fixture(t,{getVisionEnabled:()=>true,getCameraSnapshot:reason=>reason==='tool'?cameraSnapshot(5678,true):null});await connect(f);
  const baseline=countReplies(f.channel);
  f.emit({type:'response.created',response:{id:'r-look'}});
  const item=tool(f,'look-1','look_at_camera',{},'r-look');
  await tick();assert.equal(countReplies(f.channel),baseline);
  const image=imageEvents(f.channel)[0],output=toolOutputs(f.channel)[0];
  assert(f.channel.sent.indexOf(image)<f.channel.sent.indexOf(output));
  const result=JSON.parse(output.item.output);
  assert.equal(result.ok,true);assert.equal(result.captured_at,5678);assert.equal(result.contains_tryon_preview,true);
  assert(!output.item.output.includes('data:image'));assert(!output.item.output.includes('base64'));
  done(f,'r-look',[item]);await tick();
  assert.equal(countReplies(f.channel),baseline+1);assert.equal(toolOutputs(f.channel).length,1);
  assert.deepEqual(f.captures,['call-start','tool']);
});

test('look_at_camera honestly reports unavailable vision without accessing a disabled camera',async t=>{
  const f=fixture(t,{getVisionEnabled:()=>false,getCameraSnapshot:()=>{throw Error('must not capture');}});await connect(f);
  const item=tool(f,'look-disabled','look_at_camera',{},'r-look-disabled');
  done(f,'r-look-disabled',[item]);await tick();
  const result=JSON.parse(toolOutputs(f.channel)[0].item.output);
  assert.equal(result.ok,false);assert.equal(result.captured_at,null);assert.match(result.info,/Do not claim to see/);
  assert.equal(imageEvents(f.channel).length,0);assert.equal(f.captures.length,0);
});


test('mode-specific overlay validation rejects ignored adjustments before making any change',async t=>{
  const f=fixture(t);await connect(f);
  const invalid=[
    ...['scale','x','y','rotation'].map(field=>({mode:'makeup',color:'#aa3344',[field]:.6})),
    ...['x','y'].map(field=>({mode:'clothes',[field]:.6})),
    {mode:'clothes',color:'#aa3344'},
    ...['color','x','y'].map(field=>({mode:'glasses',[field]:field==='color'?'#aa3344':.6})),
    {mode:'desk',color:'#aa3344'},
    {mode:'none',opacity:.5},
    {mode:'desk',unsupported:.5},
  ];
  for(const [index,args] of invalid.entries()){
    const item=tool(f,'unsupported-'+index,'set_tryon',args,'r-unsupported-'+index);
    done(f,'r-unsupported-'+index,[item]);await tick();
  }
  assert.equal(f.tryons.length,0,'No partial changes or mode switches on rejected arguments');
  const outputs=toolOutputs(f.channel).map(event=>JSON.parse(event.item.output));
  assert.equal(outputs.length,invalid.length);
  assert(outputs.every(output=>output.ok===false&&/No change made:.*retry only supported fields/.test(output.error)));
});

test('supported makeup, clothes, glasses and desk adjustments reach the camera hook and report only applied fields',async t=>{
  const f=fixture(t);await connect(f);
  const valid=[
    {mode:'makeup',color:'#aa3344',opacity:.6},
    {mode:'clothes',opacity:.7,scale:1.2,rotation:15},
    {mode:'glasses',opacity:.9,scale:1.1,rotation:5},
    {mode:'desk',opacity:.8,scale:1.1,x:.2,y:.6,rotation:-20},
    {mode:'none'},
  ];
  for(const [index,args] of valid.entries()){
    const item=tool(f,'supported-'+index,'set_tryon',args,'r-supported-'+index);
    done(f,'r-supported-'+index,[item]);await tick();
  }
  assert.equal(f.tryons.length,valid.length);
  const outputs=toolOutputs(f.channel).map(event=>JSON.parse(event.item.output));
  for(const [index,{mode,...overlay}] of valid.entries()){
    assert.deepEqual(JSON.parse(JSON.stringify(f.tryons[index])),{mode,overlay});
    assert.equal(outputs[index].ok,true);
    assert.deepEqual(outputs[index].overlay,overlay);
  }
});

test('product preview metadata reaches Nori, and a failed renderer is never reported as an applied preview',async t=>{
  const preview={ok:true,product_id:'7608596658',product_type:'lamp',preview_kind:'object',preview_is_approximate:true};
  const f=fixture(t,{onTryon:()=>preview});await connect(f);
  const item=tool(f,'selected-photo','set_tryon',{mode:'desk',x:.7,y:.8},'r-selected-photo');
  done(f,'r-selected-photo',[item]);await tick();
  const applied=JSON.parse(toolOutputs(f.channel).at(-1).item.output);
  assert.deepEqual(applied.preview,preview);
  assert.match(applied.notice,/selected product listing photo/);
  f.voice.options.onTryon=async()=>({ok:false,error:'Choose a product first.'});
  const rejected=tool(f,'no-selection','set_tryon',{mode:'desk',scale:1.2},'r-no-selection');
  done(f,'r-no-selection',[rejected]);await tick();
  const failed=JSON.parse(toolOutputs(f.channel).at(-1).item.output);
  assert.equal(failed.ok,false);assert.equal(failed.error,'Choose a product first.');
});


test('rejected camera create events free capacity without interrupting voice and late acknowledgements are ignored',async t=>{
  const f=fixture(t,{getVisionEnabled:()=>true});await connect(f);
  const call=f.voice.call;
  for(let i=0;i<4;i++)assert(f.voice.sendCameraSnapshot(cameraSnapshot(i)));
  const rejected=imageEvents(f.channel).slice();
  assert.equal(new Set(rejected.map(event=>event.event_id)).size,4);
  assert.equal(f.voice.sendCameraSnapshot(cameraSnapshot(5)),false);
  const state=f.voice.state,replyRequested=call.replyRequested;
  for(const image of rejected){
    f.emit({type:'error',event_id:'server-error-'+image.event_id,error:{type:'invalid_request_error',code:'invalid_image',event_id:image.event_id,message:'Could not decode image.'}});
  }
  assert.equal(call.visionSnapshots.size,0);
  assert.equal(f.voice.call,call);assert.equal(f.voice.state,state);
  assert.equal(call.replyRequested,replyRequested,'Image rejections do not alter audio response bookkeeping');
  assert.equal(f.visionStates.filter(entry=>entry.state==='error').length,4);
  assert.equal(f.mic.track.stops,0);
  const states=f.visionStates.length;
  for(const image of rejected)acknowledgeImage(f,image);
  assert.equal(f.visionStates.length,states,'Late rejected-image ACKs cannot claim vision was received');
  assert.equal(call.visionSnapshots.size,0);
  assert(f.voice.sendCameraSnapshot(cameraSnapshot(6)),'Next frame can retry after all four images were rejected');
  acknowledgeImage(f,imageEvents(f.channel).at(-1));
  assert.equal(f.visionStates.at(-1).state,'received');
  assert.equal(call.visionSnapshots.size,1);
});


function latestTranscript(f) {
  return [...new Map(f.transcripts.map(row=>[row.key,row])).values()].sort((a,b)=>a.order-b.order);
}

test('speech reserves its place before assistant output and late finals update the original turn',async t=>{
  const f=fixture(t);await connect(f);
  f.emit({type:'input_audio_buffer.speech_started',item_id:'u-first'});
  assert.equal(f.transcripts.at(-1).pending,true);
  f.emit({type:'conversation.item.input_audio_transcription.delta',event_id:'u-delta',item_id:'u-first',delta:'Find pink'});
  assert.equal(f.transcripts.at(-1).text,'Find pink');
  f.emit({type:'input_audio_buffer.committed',item_id:'u-first',previous_item_id:null});
  f.emit({type:'response.created',response:{id:'r-first'}});
  f.emit({type:'response.output_audio_transcript.delta',event_id:'a-delta',response_id:'r-first',item_id:'a-first',delta:'Here are pink options.'});
  f.emit({type:'input_audio_buffer.speech_started',item_id:'u-second'});
  f.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'u-second',transcript:'Under 20000 won.'});
  f.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'u-first',transcript:'Find pink lipstick.'});
  const rows=latestTranscript(f);
  assert.deepEqual(rows.map(row=>row.key),['u-first','a-first','u-second']);
  assert.equal(rows[0].text,'Find pink lipstick.');
  assert.equal(rows[0].pending,false);
});

test('server predecessor repairs delayed committed ordering and duplicate or late deltas cannot repeat final text',async t=>{
  const f=fixture(t);await connect(f);
  f.emit({type:'response.output_audio_transcript.delta',event_id:'same-delta',item_id:'a',delta:'Hello'});
  f.emit({type:'response.output_audio_transcript.delta',event_id:'same-delta',item_id:'a',delta:'Hello'});
  f.emit({type:'conversation.item.added',previous_item_id:'u',item:{id:'a',type:'message',role:'assistant',content:[]}});
  f.emit({type:'input_audio_buffer.committed',item_id:'u',previous_item_id:null});
  f.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'u',transcript:'Hi'});
  f.emit({type:'response.output_audio_transcript.done',item_id:'a',transcript:'Hello there'});
  f.emit({type:'response.output_audio_transcript.delta',event_id:'late-delta',item_id:'a',delta:' there'});
  const rows=latestTranscript(f);
  assert.deepEqual(rows.map(row=>row.key),['u','a']);
  assert.equal(rows[1].text,'Hello there');assert.equal(rows[1].final,true);
});

test('response slots preserve an interrupted assistant turn even if its first transcript arrives after new speech',async t=>{
  const f=fixture(t);await connect(f);
  f.emit({type:'input_audio_buffer.speech_started',item_id:'u1'});
  f.emit({type:'response.created',response:{id:'r1'}});
  f.emit({type:'input_audio_buffer.speech_started',item_id:'u2'});
  f.emit({type:'response.output_audio_transcript.delta',item_id:'a1',response_id:'r1',delta:'An option'});
  assert.deepEqual(latestTranscript(f).map(row=>row.key),['u1','a1','u2']);
});

const uploadImage={dataUrl:'data:image/jpeg;base64,/9j/AA==',name:'desk.jpg',text:'Find a lamp for this desk'};
test('explicit image waits for acknowledgement and enters the call independently of camera sharing',async t=>{
  const f=fixture(t,{getVisionEnabled:()=>false});await connect(f);done(f,'greeting');await tick();
  const baseline=countReplies(f.channel),sent=f.voice.sendImage(uploadImage);
  const event=f.channel.sent.at(-1);
  assert.equal(event.item.content[1].type,'input_image');
  assert.equal(event.item.content[0].text,uploadImage.text);
  assert.equal(f.transcripts.at(-1).delivery,'sending');
  assert.equal(countReplies(f.channel),baseline);
  f.emit({type:'conversation.item.added',item:event.item});
  assert.equal(await sent,true);await tick();
  assert.equal(f.transcripts.at(-1).delivery,'sent');
  assert.equal(f.transcripts.at(-1).image.name,'desk.jpg');
  assert.equal(countReplies(f.channel),baseline+1);
  f.voice.clearCameraSnapshots();
  assert.equal(f.channel.sent.some(item=>item.type==='conversation.item.delete'&&item.item_id===event.item.id),false);
});

test('invalid, oversized, disconnected, and congested image sends fail without a success row',async t=>{
  const f=fixture(t);
  await assert.rejects(f.voice.sendImage(uploadImage),/connected call/);
  await connect(f);
  const baseline=f.transcripts.length;
  await assert.rejects(f.voice.sendImage({...uploadImage,dataUrl:'data:image/svg+xml;base64,PHN2Zz4='}),/JPEG or PNG/);
  await assert.rejects(f.voice.sendImage({...uploadImage,dataUrl:'data:image/jpeg;base64,'+'A'.repeat(55000)}),/JPEG or PNG/);
  f.channel.bufferedAmount=200000;await assert.rejects(f.voice.sendImage(uploadImage),/connection is busy/);
  f.channel.bufferedAmount=0;f.peers[0].sctp={maxMessageSize:20};await assert.rejects(f.voice.sendImage(uploadImage),/too large/);
  assert.equal(f.transcripts.length,baseline);
});

test('image rejection and disconnect reject pending uploads without requesting an invented reply',async t=>{
  const f=fixture(t);await connect(f);done(f,'greeting');await tick();
  const baseline=countReplies(f.channel),rejected=f.voice.sendImage(uploadImage),event=f.channel.sent.at(-1);
  f.emit({type:'error',error:{event_id:event.event_id,message:'Invalid image'}});
  await assert.rejects(rejected,/not accepted/);await tick();
  assert.equal(f.transcripts.at(-1).delivery,'failed');
  assert.equal(countReplies(f.channel),baseline);
  const interrupted=f.voice.sendImage(uploadImage);const expected=assert.rejects(interrupted,/call ended/);
  f.voice.end();await expected;
});

test('image acknowledgement queues one reply until an active model response completes',async t=>{
  const f=fixture(t);await connect(f);f.emit({type:'response.created',response:{id:'active'}});
  const baseline=countReplies(f.channel),sent=f.voice.sendImage(uploadImage),event=f.channel.sent.at(-1);
  f.emit({type:'conversation.item.done',item:event.item});assert.equal(await sent,true);await tick();
  assert.equal(countReplies(f.channel),baseline);
  done(f,'active');await tick();assert.equal(countReplies(f.channel),baseline+1);
  f.emit({type:'conversation.item.done',item:event.item});await tick();assert.equal(countReplies(f.channel),baseline+1);
});


test('long delayed hidden snapshot and tool predecessor chains preserve every visible turn',async t=>{
  const f=fixture(t);await connect(f);
  const ordered=['u1',...Array.from({length:10},(_,i)=>'hidden-'+(i+1)),'a1','u2',...Array.from({length:10},(_,i)=>'hidden-'+(i+11)),'a2'];
  for(const key of ['u1','a1','u2','a2']) {
    if(key.startsWith('u'))f.emit({type:'input_audio_buffer.speech_started',item_id:key});
    else f.emit({type:'response.output_audio_transcript.delta',item_id:key,delta:key});
    f.emit({type:key.startsWith('u')?'input_audio_buffer.committed':'conversation.item.added',item_id:key,previous_item_id:key==='u1'?null:ordered[ordered.indexOf(key)-1],...(key.startsWith('a')?{item:{id:key,type:'message',role:'assistant',content:[]}}:{})});
  }
  for(const [index,key] of ordered.filter(key=>key.startsWith('hidden-')).reverse().entries()) {
    const item=index%2?{id:key,type:'function_call_output',call_id:'tool-'+index,output:'{}'}:{id:key,type:'message',role:'user',content:[{type:'input_image',image_url:'data:image/jpeg;base64,/9j/AA=='}]};
    f.emit({type:'conversation.item.added',previous_item_id:ordered[ordered.indexOf(key)-1],item});
  }
  for(const key of ['u2','u1'])f.emit({type:'conversation.item.input_audio_transcription.completed',item_id:key,transcript:key+' final'});
  assert.deepEqual(latestTranscript(f).map(row=>row.key),['u1','a1','u2','a2']);
  assert.deepEqual(Array.from(f.voice.call.timeline).filter(key=>ordered.includes(key)),ordered);
});

test('hidden frames and function output during interruption never displace a pending human transcript behind its reply',async t=>{
  const f=fixture(t);await connect(f);
  f.emit({type:'input_audio_buffer.speech_started',item_id:'u1'});
  f.emit({type:'conversation.item.added',previous_item_id:null,item:{id:'frame1',type:'message',role:'user',content:[{type:'input_image'}]}});
  f.emit({type:'input_audio_buffer.committed',item_id:'u1',previous_item_id:'frame1'});
  f.emit({type:'response.created',response:{id:'r1'}});
  f.emit({type:'conversation.item.added',previous_item_id:'u1',item:{id:'lookup',type:'function_call',name:'search_products'}});
  f.emit({type:'conversation.item.added',previous_item_id:'lookup',item:{id:'result',type:'function_call_output',output:'{}'}});
  f.emit({type:'response.created',response:{id:'r2'}});
  f.emit({type:'input_audio_buffer.speech_started',item_id:'u2'});
  f.emit({type:'response.output_audio_transcript.delta',response_id:'r2',item_id:'a1',delta:'Here are options'});
  f.emit({type:'conversation.item.added',previous_item_id:'result',item:{id:'a1',type:'message',role:'assistant',content:[]}});
  f.emit({type:'conversation.item.added',previous_item_id:'a1',item:{id:'frame2',type:'message',role:'user',content:[{type:'input_image'}]}});
  f.emit({type:'input_audio_buffer.committed',item_id:'u2',previous_item_id:'frame2'});
  f.emit({type:'response.created',response:{id:'r3'}});
  f.emit({type:'response.output_audio_transcript.delta',response_id:'r3',item_id:'a2',delta:'A different style'});
  assert.deepEqual(latestTranscript(f).map(row=>row.key),['u1','a1','u2','a2']);
  assert.equal(latestTranscript(f).find(row=>row.key==='u2').pending,true);
});

test('checkout tools open one review for each explicit scope and never invoke a payment endpoint',async t=>{
  const f=fixture(t);await connect(f);
  for(const [index,scope] of ['selected','comparison','cart','products'].entries()) {
    const args={scope,...(scope==='products'?{product_ids:['324548922','lamp-pink','324548922']}:{})};
    const item=tool(f,'checkout-'+index,'start_checkout',args,'r-checkout-'+index);
    done(f,'r-checkout-'+index,[item]);await tick();
    // Repeated completion events must not open a second review.
    done(f,'r-checkout-'+index,[item]);await tick();
  }
  assert.equal(f.checkouts.length,4);
  assert.deepEqual(f.checkouts.map(value=>value.scope),['selected','comparison','cart','products']);
  assert.deepEqual(JSON.parse(JSON.stringify(f.checkouts[3])),{scope:'products',productIds:['324548922','lamp-pink']});
  assert.equal(f.checkouts[0].productIds,undefined);
  assert.equal(toolOutputs(f.channel).length,4);
  for(const event of toolOutputs(f.channel)) {
    const result=JSON.parse(event.item.output);
    assert.equal(result.ok,true);assert.equal(result.review_opened,true);
    assert.equal(result.demo,true);assert.equal(result.payment_processed,false);
    assert.match(result.instruction,/press the final demo payment button themselves/);
  }
  assert.equal(f.calls.length,2);assert.equal(f.actions.length,0);
});

test('invalid checkout scopes, IDs, mixed selectors and payment commands never reach UI controls',async t=>{
  const f=fixture(t);await connect(f);
  const invalid=[{}, {scope:'pay'}, {scope:'all'}, {scope:'products'}, {scope:'products',product_ids:[]},
    {scope:'products',product_ids:['https://attacker.test']}, {scope:'products',product_ids:[4]},
    {scope:'products',product_ids:['x'.repeat(81)]}, {scope:'products',product_ids:['a\nb']}, {scope:'products',product_ids:['a\n']},
    {scope:'products',product_ids:Array.from({length:11},(_,i)=>String(i))},
    {scope:'selected',product_ids:['324548922']}, {scope:'cart',confirm:true}, {scope:'cart',payment:'charge'}];
  const items=invalid.map((args,i)=>tool(f,'invalid-checkout-'+i,'start_checkout',args,'r-checkout-invalid'));
  items.push(tool(f,'automatic-pay','confirm_payment',{},'r-checkout-invalid'));
  done(f,'r-checkout-invalid',items);await tick();
  assert.equal(f.checkouts.length,0);
  assert.equal(toolOutputs(f.channel).length,items.length);
  assert(toolOutputs(f.channel).every(event=>JSON.parse(event.item.output).ok===false));
});

test('checkout callback failures, missing controls and invalid success results remain failures',async t=>{
  for(const settings of [{checkoutUnavailable:true},{onCheckout:async()=>{throw Error('Selection changed.');}},
    {onCheckout:async()=>({ok:false,error:'Your bag is empty.'})},{onCheckout:async()=>undefined},
    {onCheckout:async()=>({ok:true,review_opened:false})},{onCheckout:async()=>({ok:true,payment_processed:true})},{onCheckout:async()=>({ok:true,demo:false})}]) {
    const f=fixture(t,settings);await connect(f);
    const item=tool(f,'checkout-failed','start_checkout',{scope:'cart'},'r-checkout-failed');
    done(f,'r-checkout-failed',[item]);await tick();
    const result=JSON.parse(toolOutputs(f.channel).at(-1).item.output);
    assert.equal(result.ok,false);assert.notEqual(result.review_opened,true);
    assert.match(result.instruction,/Do not invent/);
  }
});

test('ending a call suppresses late checkout results and stale tools cannot open a review',async t=>{
  const pending=deferred();const f=fixture(t,{onCheckout:()=>pending.promise});await connect(f);
  const oldCall=f.voice.call,channel=f.channel;
  const item=tool(f,'pending-checkout','start_checkout',{scope:'selected'},'r-checkout-pending');
  done(f,'r-checkout-pending',[item]);
  assert.equal(f.checkouts.length,1);
  f.voice.end();
  pending.resolve({ok:true});await tick();
  assert.equal(toolOutputs(channel).length,0);
  await f.voice._tool(oldCall,{call_id:'stale-checkout',name:'start_checkout',arguments:'{"scope":"cart"}'});
  assert.equal(f.checkouts.length,1);
});

test('long UI context retains checkout state and exact cart and comparison IDs',async t=>{
  const context={mode:'glasses',screen:'active',visible_panel:'comparison',cameraRunning:true,
    cart_ids:['324548922','lamp-pink'],comparison_ids:['chair-black','chair-white'],
    visible_product:{id:'lamp-pink',title:'long '.repeat(1000)},
    checkout:{step:'review',item_ids:['lamp-pink'],reference_total:29000,demo:true},unused:'x'.repeat(6000)};
  const f=fixture(t,{getContext:()=>context});await connect(f);
  const greeting=f.channel.sent.find(event=>event.item?.content?.[0]?.text?.startsWith('App context,'));
  const encoded=greeting.item.content[0].text.split('App context, not a spoken shopper request: ')[1].split('. The shopper answered')[0];
  assert(encoded.length<=1600);
  const decoded=JSON.parse(encoded);
  assert.deepEqual(decoded.checkout,context.checkout);
  assert.deepEqual(decoded.cart_ids,context.cart_ids);
  assert.deepEqual(decoded.comparison_ids,context.comparison_ids);
  assert.equal(decoded.visible_product.id,'lamp-pink');assert.equal(decoded.screen,'active');
  assert.equal(decoded.visible_panel,'comparison');
});

test('oversized checkout context stays bounded without changing any exact product ID',async t=>{
  const ids=Array.from({length:10},(_,i)=>String(i)+'x'.repeat(79));
  const context={mode:'desk',screen:'comparison',cart_ids:ids,comparison_ids:ids.slice(0,3),
    checkout:{step:'review',item_ids:ids,reference_total:900000,demo:true},unused:'x'.repeat(6000)};
  const f=fixture(t,{getContext:()=>context});await connect(f);
  const greeting=f.channel.sent.find(event=>event.item?.content?.[0]?.text?.startsWith('App context,'));
  const encoded=greeting.item.content[0].text.split('App context, not a spoken shopper request: ')[1].split('. The shopper answered')[0];
  assert(encoded.length<=1600);
  const decoded=JSON.parse(encoded);
  assert.equal(decoded.screen,'comparison');assert.equal(decoded.checkout.step,'review');
  assert.equal(decoded.checkout.demo,true);assert.equal(decoded.checkout.reference_total,900000);
  assert(decoded.cart_ids_truncated || decoded.comparison_ids_truncated || decoded.checkout.item_ids_truncated);
  assert([...decoded.cart_ids,...decoded.comparison_ids,...decoded.checkout.item_ids].every(id=>ids.includes(id)));
});

test('final ASR wording survives late item snapshots and transient failure events',async t=>{
  const f=fixture(t);await connect(f);
  f.emit({type:'conversation.item.created',item:{id:'u-caption',type:'message',role:'user',content:[{type:'input_audio',transcript:'Coupon lip steak'}]}});
  f.emit({type:'conversation.item.input_audio_transcription.delta',item_id:'u-caption',delta:'Coupang '});
  f.emit({type:'conversation.item.input_audio_transcription.delta',item_id:'u-caption',delta:'lipstick'});
  assert.equal(f.transcripts.at(-1).text,'Coupang lipstick');
  f.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'u-caption',transcript:'Coupang lipstick under 10,000 won.'});
  f.emit({type:'conversation.item.done',item:{id:'u-caption',type:'message',role:'user',content:[{type:'input_audio',transcript:'Coupon lip steak'}]}});
  f.emit({type:'conversation.item.input_audio_transcription.failed',item_id:'u-caption'});
  assert.equal(f.transcripts.at(-1).text,'Coupang lipstick under 10,000 won.');
  assert.equal(f.transcripts.at(-1).error,false);
  assert.equal(f.transcripts.at(-1).final,true);
});

test('a recovered ASR completion clears the failed-caption marker without inventing a correction',async t=>{
  const f=fixture(t);await connect(f);
  f.emit({type:'conversation.item.input_audio_transcription.failed',item_id:'u-caption'});
  assert.equal(f.transcripts.at(-1).error,true);
  f.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'u-caption',transcript:'이 립밤 보여 주세요.'});
  assert.equal(f.transcripts.at(-1).text,'이 립밤 보여 주세요.');
  assert.equal(f.transcripts.at(-1).error,false);
});

test('a compatible-caption fallback is observable without disconnecting the call',async t=>{
  const f=fixture(t,{sessionResponse:response('v=0\no=answer',200,{'x-coupi-transcription-model':'gpt-4o-mini-transcribe'})});
  await connect(f);
  assert.equal(f.voice.call.ready,true);
  assert.equal(f.transcriptionStates.length,1);
  assert.equal(f.transcriptionStates[0].model,'gpt-4o-mini-transcribe');
  assert.equal(f.transcriptionStates[0].compatibilityMode,true);
});
