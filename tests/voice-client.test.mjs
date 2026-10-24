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
    window: {isSecureContext: true, fetch: () => {throw Error('Unexpected real network');}, localStorage: options.storage},
    navigator: {}, document: {readyState: 'loading', addEventListener() {}},
    setTimeout: (fn,ms)=>{timerDelays.push(ms);return setTimeout(fn,ms);}, clearTimeout, setInterval, clearInterval, AbortController,
    MediaStream: class {}, Audio: class {}, console,
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
  const audio = {srcObject: null, muted:false, plays:0, play: async () => {audio.plays++;return options.play?.();}, pause() {this.paused = true;}};
  const calls = [], transcripts = [], states = [], recommendations = [], tryons = [], actions = [], visionStates = [], captures = [], playbackBlocked = [];
  let permissions = 0;
  const voice = new context.window.NookVoiceSession({
    audio, PeerConnection: Peer, greeting: options.greeting,
    mediaDevices: {getUserMedia: async constraints => {
      permissions++;
      assert.equal(constraints.video, false);
      assert.equal(constraints.audio.echoCancellation, true);
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
    onPlaybackBlocked: value => playbackBlocked.push(value),
    onState: value => states.push(value),
    onTranscript: value => transcripts.push(value),
    onRecommendations: (products, message) => recommendations.push({products, message}),
    onTryon: async (mode, overlay) => {tryons.push({mode, overlay});return options.onTryon?.(mode,overlay);},
    onProductAction: async (action, product_id) => {actions.push({action,product_id});return {ok:true,action,product_id:product_id || "324548922",purchased:false};},
  });
  t.after(() => voice.end());
  return {
    voice, mic, audio, calls, transcripts, states, recommendations, tryons, peers, actions, timerDelays, visionStates, captures, playbackBlocked,
    get permissions() {return permissions;},
    get channel() {return voice.call?.channel;},
    emit(event) {this.channel.emit('message', {data: JSON.stringify(event)});},
  };
}
const countReplies = channel => channel.sent.filter(event => event.type === 'response.create').length;
const toolOutputs = channel => channel.sent.filter(event => event.item?.type === 'function_call_output');
const memoryContexts = channel => channel.sent.flatMap(event => {
  const text = event.item?.content?.[0]?.text || '';
  const prefix = 'Saved shopping preferences (not a spoken request): ';
  return text.startsWith(prefix) ? [JSON.parse(text.slice(prefix.length))] : [];
});

test('voice product search sends active memories and requests ten results',async t=>{
  let body;
  const f=fixture(t,{storage:{getItem:key=>key==='coupi_memory'?JSON.stringify([{text:'I like neutral frames'}]):null},search:params=>{body=JSON.parse(params.body);return response({products:[],message:'No matches'});}});
  await connect(f);
  const item=tool(f,'memory-search','search_products',{query:'glasses',category:'glasses',max_price:30000},'r-memory-search');
  done(f,'r-memory-search',[item]);await tick();await tick();
  assert.deepEqual(body,{query:'glasses',category:'glasses',max_price:30000,memories:['I like neutral frames'],limit:10});
});
async function connect(f) {assert.equal(await f.voice.start(), true); await tick();}
function done(f, id, output = []) {f.emit({type: 'response.done', response: {id, status: 'completed', output}});}
function tool(f, callId, name, args, responseId) {
  const event = {type: 'response.function_call_arguments.done', call_id: callId, name, arguments: JSON.stringify(args), response_id: responseId};
  f.emit(event);
  return {type: 'function_call', call_id: callId, name, arguments: event.arguments};
}

test('saved preferences reach the AI before its first response even with large camera context', async t => {
  const memories = [{text: 'I prefer cotton T-shirts under ₩30,000.', source: 'you told me'}, {text: 'I like neutral colors.', source: 'you saved a suggestion'}];
  const values = new Map([['coupi_memory', JSON.stringify(memories)]]);
  const f = fixture(t, {storage: {getItem: key => values.get(key) || null}, getContext: () => ({mode:'clothes', unused:'x'.repeat(6000)})});
  await connect(f);
  assert.deepEqual(memoryContexts(f.channel), [{memory_paused:false, saved_memories:memories.map(m => m.text)}]);
  const preferenceIndex = f.channel.sent.findIndex(event => event.item?.content?.[0]?.text?.startsWith('Saved shopping preferences'));
  assert(preferenceIndex < f.channel.sent.findIndex(event => event.type === 'response.create'));
  f.voice.updateContext({mode:'clothes'});
  assert.equal(memoryContexts(f.channel).length, 1);
});

test('active calls refresh saved preferences and stop using paused or forgotten memories', async t => {
  const values = new Map([['coupi_memory', JSON.stringify([{text:'Cotton',source:'you told me'}])]]);
  const f = fixture(t, {storage:{getItem:key => values.get(key) || null}});
  await connect(f);
  const replies = countReplies(f.channel);
  values.set('coupi_memory', JSON.stringify([{text:'Linen',source:'you told me'}]));
  f.emit({type:'input_audio_buffer.speech_started'});
  assert.deepEqual(memoryContexts(f.channel).at(-1).saved_memories, ['Linen']);
  values.set('coupi_memory_paused', '1');
  f.voice.updateContext({mode:'makeup'});
  assert.deepEqual(memoryContexts(f.channel).at(-1), {memory_paused:true,saved_memories:[]});
  assert.equal(countReplies(f.channel), replies);
  values.set('coupi_memory_paused', '0');
  f.voice.sendText('Recommend a T-shirt');
  assert.deepEqual(memoryContexts(f.channel).at(-1).saved_memories, ['Linen']);
  values.set('coupi_memory', '[]');
  tool(f, 'after-forget', 'search_products', {query:'T-shirt',category:'clothes',max_price:null}, 'search-response');
  await tick();
  assert.deepEqual(memoryContexts(f.channel).at(-1), {memory_paused:false,saved_memories:[]});
});

test('paused, corrupt and unavailable memory storage supply no preferences', async t => {
  const stores = [
    {getItem:key => key === 'coupi_memory_paused' ? '1' : JSON.stringify([{text:'Private preference'}])},
    {getItem:key => key === 'coupi_memory' ? '{bad json' : null},
    {getItem() { throw Error('Storage blocked'); }},
  ];
  for (const storage of stores) {
    const f = fixture(t, {storage});
    await connect(f);
    assert.deepEqual(memoryContexts(f.channel)[0].saved_memories, []);
  }
});

test('stored preferences are bounded and malformed entries cannot break a call', async t => {
  const memories = [null, {}, {text:7}, {text:'  '}, ...Array.from({length:25}, (_, i) => ({text:String(i) + 'x'.repeat(500)}))];
  const f = fixture(t, {storage:{getItem:key => key === 'coupi_memory' ? JSON.stringify(memories) : null}});
  await connect(f);
  const preferences = memoryContexts(f.channel)[0].saved_memories;
  assert.equal(preferences.length, 20);
  assert(preferences.every(text => text.length === 400));
});

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

test('text mode mutes both directions without ending the connection or blocking typed replies',async t=>{
  const f=fixture(t);await connect(f);done(f,'greeting');await tick();
  const call=f.voice.call,channel=f.channel,replies=countReplies(channel);
  f.emit({type:'input_audio_buffer.speech_started'});
  assert.equal(f.voice.setTextMode(true),true);
  assert.equal(f.mic.track.enabled,false);assert.equal(f.audio.muted,true);assert.equal(call.muted,true);
  assert.equal(call.speaking,false);assert.equal(call.awaitingVad,false);assert.equal(f.voice.call,call);assert.equal(channel.readyState,'open');assert.equal(f.mic.track.stops,0);
  assert.equal(f.voice.mute(),true);assert.equal(f.mic.track.enabled,false);
  f.emit({type:'input_audio_buffer.speech_started'});assert.equal(call.speaking,false);
  await tick();assert.equal(countReplies(channel),replies,'Switching input mode does not generate a new greeting');
  assert.equal(f.voice.sendText('Show black glasses'),true);await tick();assert.equal(countReplies(channel),replies+1);
  f.emit({type:'response.output_audio_transcript.delta',item_id:'text-reply',delta:'Here are black frames.'});
  assert.equal(f.transcripts.at(-1).delta,'Here are black frames.');assert.equal(f.audio.muted,true);
  assert.equal(f.voice.setTextMode(false),false);assert.equal(f.mic.track.enabled,true);assert.equal(f.audio.muted,false);assert.equal(call.muted,false);
});

test('leaving text mode restores an existing microphone and speaker mute preference',async t=>{
  const f=fixture(t);await connect(f);f.voice.mute();f.audio.muted=true;
  f.voice.setTextMode(true);f.voice.setTextMode(true);f.voice.setTextMode(false);
  assert.equal(f.mic.track.enabled,false);assert.equal(f.voice.call.muted,true);assert.equal(f.audio.muted,true);
});

test('text mode stays silent when a new call starts or microphone permission resolves later',async t=>{
  const permission=deferred();const f=fixture(t,{getUserMedia:()=>permission.promise});
  const starting=f.voice.start();await tick();assert.equal(f.permissions,1);
  f.voice.setTextMode(true);permission.resolve(f.mic);assert.equal(await starting,true);await tick();
  assert.equal(f.voice.call.muted,true);assert.equal(f.mic.track.enabled,false);assert.equal(f.audio.muted,true);
  f.voice.end();await connect(f);
  assert.equal(f.voice.textMode,true);assert.equal(f.voice.call.muted,true);assert.equal(f.mic.track.enabled,false);assert.equal(f.audio.muted,true);
  f.voice.setTextMode(false);assert.equal(f.mic.track.enabled,true);assert.equal(f.audio.muted,false);
});

test('late playback errors cannot offer speaker activation while text mode is enabled',async t=>{
  const playback=deferred();const f=fixture(t,{play:()=>playback.promise});await connect(f);
  f.peers[0].emit('track',{streams:[{}]});f.voice.setTextMode(true);
  playback.reject(Error('Playback blocked'));await tick();
  assert.equal(f.playbackBlocked.at(-1),false);assert.equal(f.audio.muted,true);
  const plays=f.audio.plays;assert.equal(await f.voice.resumeAudio(),false);assert.equal(f.audio.plays,plays);
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
  assert.equal(f.transcripts[1].delta, 'A rose ');
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
