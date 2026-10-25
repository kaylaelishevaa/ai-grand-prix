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
  const timers = [];
  const context = {
    window: {isSecureContext: true, fetch: () => {throw Error('Unexpected real network');}, localStorage: options.storage},
    navigator: {}, document: {readyState: 'loading', addEventListener() {}},
    setTimeout: (fn,ms)=>{timerDelays.push(ms);const id=setTimeout(fn,ms);timers.push({fn,ms,id});return id;}, clearTimeout, setInterval, clearInterval, AbortController,
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
    sender(track=null) {return {track,replacements:[],async replaceTrack(next){this.track=next;this.replacements.push(next);}};}
    addTrack(track, stream) {this.addedTracks.push([track, stream]);return this.sender(track);}
    addTransceiver(kind, options) {assert.equal(kind,'audio');assert.equal(options.direction,'sendrecv');return {sender:this.sender()};}
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
  const calls = [], transcripts = [], states = [], recommendations = [], tryons = [], actions = [], checkouts = [], preferences = [], visionStates = [], captures = [], transcriptionStates = [], playbackBlocked = [];
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
    onPlaybackBlocked: value => playbackBlocked.push(value),
    onState: value => states.push(value),
    onTranscript: value => transcripts.push(value),
    onTranscriptionState: value => transcriptionStates.push(value),
    onRecommendations: (products, message, metadata, retrievalStatus) => recommendations.push({products, message, metadata, retrievalStatus}),
    onTryon: async (mode, overlay) => {tryons.push({mode, overlay});return options.onTryon?.(mode,overlay);},
    onProductAction: async (action, product_id) => {actions.push({action,product_id});return {ok:true,action,product_id:product_id || "324548922",purchased:false};},
    onPreferences: options.preferencesUnavailable?undefined:async value=>{preferences.push(value);return options.onPreferences?options.onPreferences(value):{ok:true,saved:false,...(value.action==='skip'?{skipped:true}:{draft_ready:true})};},
    onCheckout: options.checkoutUnavailable?undefined:async value=>{checkouts.push(value);return options.onCheckout?options.onCheckout(value):{ok:true,item_ids:['324548922']};},
  });
  t.after(() => voice.end());
  return {
    voice, mic, audio, calls, transcripts, states, recommendations, tryons, peers, actions, checkouts, preferences, timerDelays, visionStates, captures, transcriptionStates, playbackBlocked,
    get permissions() {return permissions;},
    get channel() {return voice.call?.channel;},
    emit(event) {this.channel.emit('message', {data: JSON.stringify(event)});},
    expireTimer(ms) {const timer=timers.findLast(timer=>timer.ms===ms);assert.ok(timer);clearTimeout(timer.id);timer.fn();},
  };
}
const countReplies = channel => channel.sent.filter(event => event.type === 'response.create').length;
const toolOutputs = channel => channel.sent.filter(event => event.item?.type === 'function_call_output');
const memoryContexts = channel => channel.sent.flatMap(event => {
  const text = event.item?.content?.[0]?.text || '';
  const prefix = 'Saved shopping preferences (not a spoken request): ';
  return text.startsWith(prefix) ? [JSON.parse(text.slice(prefix.length))] : [];
});

for(const inputMode of ['voice','text'])test(`${inputMode} product search sends saved preferences and preserves retrieval metadata`,async t=>{
  let body;
  const search={query:'neutral eyeglasses',category:'glasses',max_price:25000};
  const f=fixture(t,{storage:{getItem:key=>key==='coupi_memory'?JSON.stringify([{text:'I like neutral frames'}]):null},search:params=>{body=JSON.parse(params.body);return response({products:[],message:'No matches',search,retrieval_status:'live'});}});
  assert.equal(await f.voice.start({inputMode}),true);await tick();
  const item=tool(f,'memory-search','search_products',{query:'glasses',category:'glasses',max_price:30000},'r-memory-search');
  done(f,'r-memory-search',[item]);await tick();await tick();
  assert.deepEqual(body,{query:'glasses',category:'glasses',max_price:30000,memories:['I like neutral frames'],limit:10});
  assert.equal(f.recommendations[0].metadata.query,search.query);assert.equal(f.recommendations[0].metadata.maxPrice,search.max_price);
  assert.equal(f.recommendations[0].retrievalStatus,'live');assert.equal(f.permissions,inputMode==='text'?0:1);
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

test('Chat releases microphone and silences speaker without ending the connection or blocking typed replies',async t=>{
  const f=fixture(t);await connect(f);done(f,'greeting');await tick();
  const call=f.voice.call,channel=f.channel,replies=countReplies(channel);
  f.emit({type:'input_audio_buffer.speech_started'});
  assert.equal(await f.voice.setInputMode('text'),true);
  assert.equal(call.microphone,null);assert.equal(call.audioSender.track,null);assert.equal(f.audio.muted,true);assert.equal(call.inputMode,'text');
  assert.equal(call.speaking,false);assert.equal(call.awaitingVad,false);assert.equal(f.voice.call,call);assert.equal(channel.readyState,'open');assert.equal(f.mic.track.stops,1);
  assert.equal(f.voice.mute(),false);assert.equal(call.microphone,null);
  f.emit({type:'input_audio_buffer.speech_started'});assert.equal(call.speaking,false);
  await tick();assert.equal(countReplies(channel),replies,'Switching input mode does not generate a new greeting');
  assert.equal(f.voice.sendText('Show black glasses'),true);await tick();assert.equal(countReplies(channel),replies+1);
  f.emit({type:'response.output_audio_transcript.delta',item_id:'text-reply',delta:'Here are black frames.'});
  assert.equal(f.transcripts.at(-1).text,'Here are black frames.');assert.equal(f.audio.muted,true);
  assert.equal(await f.voice.setInputMode('voice'),true);assert.equal(f.permissions,2);assert.equal(f.audio.muted,false);assert.equal(call.muted,false);
});

test('selecting Chat repeatedly never reacquires or restores a muted microphone',async t=>{
  const f=fixture(t);await connect(f);f.voice.mute();f.audio.muted=true;
  await f.voice.setInputMode('text');await f.voice.setInputMode('text');
  assert.equal(f.permissions,1);assert.equal(f.mic.track.stops,1);assert.equal(f.voice.call.microphone,null);assert.equal(f.audio.muted,true);
});

test('Chat stays silent when microphone permission resolves late and when a new Chat starts',async t=>{
  const permission=deferred();const f=fixture(t,{getUserMedia:()=>permission.promise});
  const starting=f.voice.start();await tick();assert.equal(f.permissions,1);
  assert.equal(await f.voice.setInputMode('text'),true);permission.resolve(f.mic);assert.equal(await starting,true);await tick();
  assert.equal(f.voice.call.inputMode,'text');assert.equal(f.voice.call.microphone,null);assert.equal(f.mic.track.stops,1);assert.equal(f.audio.muted,true);
  assert.equal(f.peers[0].addedTracks.length,0);
  f.voice.end();assert.equal(await f.voice.start({inputMode:'text'}),true);await tick();
  assert.equal(f.permissions,1);assert.equal(f.voice.call.inputMode,'text');assert.equal(f.peers[1].addedTracks.length,0);assert.equal(f.audio.muted,true);
});

test('late playback errors cannot offer speaker activation while text mode is enabled',async t=>{
  const playback=deferred();const f=fixture(t,{play:()=>playback.promise});await connect(f);
  f.peers[0].emit('track',{streams:[{}]});await f.voice.setInputMode('text');
  playback.reject(Error('Playback blocked'));await tick();
  assert.equal(f.playbackBlocked.at(-1),false);assert.equal(f.audio.muted,true);
  const plays=f.audio.plays;assert.equal(await f.voice.resumeAudio(),false);assert.equal(f.audio.plays,plays);
});

test('audio playback rejected after ending cannot restore the old call speaker prompt', async t => {
  const f = fixture(t), playing = deferred(), blocked = [];
  f.voice.options.onPlaybackBlocked = value => blocked.push(value);
  f.audio.play = () => playing.promise;
  await connect(f);
  f.peers[0].emit('track', {streams: [{}]});
  f.voice.end();
  assert.deepEqual(blocked, [false]);
  playing.reject(Error('Playback interrupted by ending the call'));
  await tick();
  assert.deepEqual(blocked, [false]);
  assert.equal(f.audio.srcObject, null);
});

test('a previous call playback completion cannot dismiss a new call speaker prompt', async t => {
  const f = fixture(t), playing = deferred(), blocked = [];
  f.voice.options.onPlaybackBlocked = value => blocked.push(value);
  f.audio.play = () => playing.promise;
  await connect(f);
  f.peers[0].emit('track', {streams: [{}]});
  f.voice.end();
  await connect(f);
  f.audio.play = () => Promise.reject(Error('Playback requires a user gesture'));
  f.peers[1].emit('track', {streams: [{}]});
  await tick();
  assert.deepEqual(blocked, [false, true]);
  playing.resolve();
  await tick();
  assert.deepEqual(blocked, [false, true]);
});

test('resuming speaker audio cannot update a replacement call after the original ends', async t => {
  const f = fixture(t), playing = deferred(), blocked = [];
  f.voice.options.onPlaybackBlocked = value => blocked.push(value);
  await connect(f);
  f.audio.play = () => playing.promise;
  const resuming = f.voice.resumeAudio();
  f.voice.end();
  await connect(f);
  playing.resolve();
  await resuming;
  assert.deepEqual(blocked, [false]);
});

test('ending during local WebRTC setup prevents a stale connection state and server session', async t => {
  const f = fixture(t), localDescription = deferred();
  f.voice.PeerConnection.prototype.setLocalDescription = () => localDescription.promise;
  const starting = f.voice.start();
  await tick();
  assert.equal(f.peers.length, 1);
  f.voice.end();
  const endedStates = f.states.length;
  localDescription.resolve();
  assert.equal(await starting, false);
  assert.equal(f.states.length, endedStates);
  assert.equal(f.calls.filter(([url]) => url.endsWith('/session')).length, 0);
  assert.equal(f.mic.track.stops, 1);
});

test('ending during remote WebRTC setup cannot complete an ended call successfully', async t => {
  const f = fixture(t), remoteDescription = deferred();
  f.voice.PeerConnection.prototype.setRemoteDescription = () => remoteDescription.promise;
  const starting = f.voice.start();
  await tick();
  assert.equal(f.calls.filter(([url]) => url.endsWith('/session')).length, 1);
  f.voice.end();
  remoteDescription.resolve();
  assert.equal(await starting, false);
  assert.equal(f.voice.call, null);
  assert.equal(f.mic.track.stops, 1);
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

test('long spoken product requests respect the catalog search API query limit', async t => {
  const f = fixture(t, {search: params => {
    const query = JSON.parse(params.body).query;
    return query.length <= 300 ? response({products: [], message: 'No matching catalog products'}) : response({error: 'Query is too long'}, 400);
  }});
  await connect(f);
  f.emit({type: 'response.created', response: {id: 'r-long-search'}});
  const item = tool(f, 'long-search', 'search_products', {query: 'pink lipstick '.repeat(30), category: 'makeup', max_price: 10000}, 'r-long-search');
  done(f, 'r-long-search', [item]);
  await tick();
  const request = f.calls.find(([url]) => url.endsWith('/search'));
  assert.equal(JSON.parse(request[1].body).query.length, 300);
  assert.equal(f.recommendations.length, 1);
  assert.equal(JSON.parse(toolOutputs(f.channel).find(event => event.item.call_id === 'long-search').item.output).message, 'No matching catalog products');
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

test('long context preserves input mode, product finish, availability and camera sharing state', async t => {
  const context={mode:'glasses',interaction_format:'video',input_mode:'voice',screen:'active',cameraRunning:true,
    vision:{enabled:true,state:'received',last_image_at:'2026-10-25T01:00:00Z'},
    tried_product:{id:'900001',productType:'glasses',title:'Long catalog name '.repeat(1000)},
    visible_product:{id:'900002',productType:'lipbalm',finish:'clear-balm',preview_available:true,title:'Another long catalog name '.repeat(1000)},
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
  assert.equal(decoded.interaction_format,'video');assert.equal(decoded.input_mode,'voice');
  assert.equal(decoded.visible_product.finish,'clear-balm');assert.equal(decoded.visible_product.preview_available,true);
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
    assert.match(result.instruction,/press the final payment button themselves/);
    assert.match(result.instruction,/Do not announce completion until the application sends checkout_complete/);
    assert.equal(result.order_placed,false);
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

const completedReceipt = (id='DEMO-ORDER-1') => ({
  id, item_ids:['lip-pink'], items:[{id:'lip-pink',product:{id:'lip-pink',name:'Pink lip tint',privateNote:'not forwarded'},quantity:2,included:true,unitPrice:5000,lineTotal:10000}],
  referenceTotal:10000,currency:'KRW',demo:true,payment_processed:false,order_placed:false,paymentMethod:'demo-card',privateNote:'not forwarded',
});
const checkoutMessages = channel => channel.sent.filter(event=>event.item?.id?.startsWith('coupi_checkout_'));
const ackCheckout = (f,event) => f.emit({type:'conversation.item.added',item:event.item});

test('default greeting asks what to buy without presenting categories',async t=>{
  const f=fixture(t);await connect(f);
  const greeting=f.channel.sent.find(event=>event.item?.content?.[0]?.text?.includes('The shopper answered'));
  assert.match(greeting.item.content[0].text,/Begin with this brief greeting: "What do you want to buy\?"/);
  assert.doesNotMatch(greeting.item.content[0].text,/lipstick|glasses|desk lamp/);
});

test('confirmed checkout sends bounded system data, waits for ACK, and never fabricates shopper captions',async t=>{
  const f=fixture(t);await connect(f);done(f,'greeting');await tick();
  const before=countReplies(f.channel),captions=f.transcripts.length;
  const suggestions=[{id:'lip-pink',name:'Already bought'},
    {id:'glasses-1',name:'Round glasses',productType:'glasses',price:15000,description:'Do not forward me',image:'private image'},
    {id:'glasses-1',name:'Duplicate'}, {id:'lamp-1',name:'Desk lamp',price:22000},
    {id:'https://invalid',name:'Invalid'}, {id:'shirt-1',name:'T-shirt'}, {id:'hoodie-1',name:'Fourth suggestion'}];
  assert.equal(f.voice.notifyCheckoutComplete(completedReceipt(),suggestions),true);
  const [event]=checkoutMessages(f.channel);
  assert.equal(event.type,'conversation.item.create');assert.equal(event.item.role,'system');
  const data=JSON.parse(event.item.content[0].text.split('\n')[1]);
  assert.equal(data.event,'checkout_complete');
  assert.deepEqual(data.receipt,{id:'DEMO-ORDER-1',items:[{id:'lip-pink',name:'Pink lip tint',quantity:2,subtotal:10000}],subtotal:10000,currency:'KRW',demo:true,payment_processed:false,order_placed:false});
  assert.deepEqual(data.suggestions,[{id:'glasses-1',name:'Round glasses',productType:'glasses',reference_price:15000},{id:'lamp-1',name:'Desk lamp',reference_price:22000},{id:'shirt-1',name:'T-shirt'}]);
  assert.doesNotMatch(JSON.stringify(data),/private|description|paymentMethod/);
  await tick();assert.equal(countReplies(f.channel),before);
  ackCheckout(f,event);await tick();
  assert.equal(countReplies(f.channel),before+1);
  assert.equal(f.transcripts.length,captions);
  assert.equal(f.calls.length,2); // No payment or extra model HTTP endpoint.
});

test('purchase acknowledgment waits behind an active answer and duplicate receipt or ACK cannot repeat it',async t=>{
  const f=fixture(t);await connect(f);done(f,'greeting');await tick();
  f.emit({type:'response.created',response:{id:'answer'}});
  const before=countReplies(f.channel);
  assert.equal(f.voice.notifyCheckoutComplete(completedReceipt()),true);
  const [event]=checkoutMessages(f.channel);ackCheckout(f,event);await tick();
  assert.equal(countReplies(f.channel),before);
  assert.equal(f.voice.notifyCheckoutComplete(completedReceipt()),false);
  assert.equal(checkoutMessages(f.channel).length,1);
  done(f,'answer');await tick();assert.equal(countReplies(f.channel),before+1);
  f.emit({type:'response.created',response:{id:'thanks'}});done(f,'thanks');
  ackCheckout(f,event);f.emit({type:'conversation.item.done',item:event.item});await tick();
  assert.equal(countReplies(f.channel),before+1);
});

test('purchase notifications reject incomplete, inconsistent, or real-payment claims',async t=>{
  const f=fixture(t);assert.equal(f.voice.notifyCheckoutComplete(completedReceipt()),false);
  await connect(f);done(f,'greeting');await tick();
  const before=f.channel.sent.length;
  for(const receipt of [null,{}, {...completedReceipt(),id:'bad receipt'}, {...completedReceipt(),id:'DEMO-ORDER-1\n'}, {...completedReceipt(),demo:false},
    {...completedReceipt(),payment_processed:true}, {...completedReceipt(),order_placed:true},
    {...completedReceipt(),referenceTotal:1}, {...completedReceipt(),currency:'USD'},
    {...completedReceipt(),item_ids:['different-id']}, {...completedReceipt(),items:[]},
    {...completedReceipt(),items:[{...completedReceipt().items[0],quantity:0}]},
    {...completedReceipt(),items:[{...completedReceipt().items[0],product:{id:'different-id',name:'Other'}}]},
    {...completedReceipt(),items:[{...completedReceipt().items[0],included:false}]}]) {
    assert.equal(f.voice.notifyCheckoutComplete(receipt),false);
  }
  assert.equal(f.channel.sent.length,before);
  assert.equal(f.voice.notifyCheckoutComplete(completedReceipt()),true);
});

test('failed sends can retry but rejected or timed-out ACKs never schedule stale purchase speech',async t=>{
  const f=fixture(t);await connect(f);done(f,'greeting');await tick();
  const before=countReplies(f.channel),send=f.channel.send;
  f.channel.send=()=>{throw Error('Disconnected transport');};
  assert.equal(f.voice.notifyCheckoutComplete(completedReceipt()),false);
  f.channel.send=send;
  assert.equal(f.voice.notifyCheckoutComplete(completedReceipt()),true);
  const rejected=checkoutMessages(f.channel).at(-1);
  f.emit({type:'error',error:{event_id:rejected.event_id,code:'invalid_event',message:'Rejected'}});
  ackCheckout(f,rejected);await tick();assert.equal(countReplies(f.channel),before);
  assert.equal(f.voice.notifyCheckoutComplete(completedReceipt('DEMO-ORDER-2')),true);
  const expired=checkoutMessages(f.channel).at(-1);
  f.expireTimer(12000);ackCheckout(f,expired);await tick();
  assert.equal(countReplies(f.channel),before);
  assert.equal(f.voice.call.checkoutNotifications.size,0);
});

test('ending a call discards pending purchase speech and reconnecting never reannounces the same receipt',async t=>{
  const f=fixture(t);await connect(f);done(f,'greeting');await tick();
  const oldChannel=f.channel,oldCall=f.voice.call;
  assert.equal(f.voice.notifyCheckoutComplete(completedReceipt()),true);
  const event=checkoutMessages(oldChannel)[0],before=countReplies(oldChannel);
  f.voice.end();
  assert.equal(oldCall.checkoutNotifications.size,0);
  oldChannel.emit('message',{data:JSON.stringify({type:'conversation.item.added',item:event.item})});
  assert.equal(f.voice.notifyCheckoutComplete(completedReceipt('DEMO-LATE')),false);
  await tick();assert.equal(countReplies(oldChannel),before);
  await connect(f);done(f,'greeting-new');await tick();
  assert.equal(f.voice.notifyCheckoutComplete(completedReceipt()),false);
  f.emit({type:'conversation.item.added',item:event.item});await tick();
  assert.equal(checkoutMessages(f.channel).length,0);assert.equal(countReplies(f.channel),1);
});

const purchaseContext = () => ({receipt_id:'DEMO-ORDER-1',item_ids:['lip-pink'],pairing_ids:['glasses-1','lamp-1'],demo:true,payment_processed:false,order_placed:false});
const initialContext = f => JSON.parse(f.channel.sent.find(event=>event.item?.content?.[0]?.text?.startsWith('App context,')).item.content[0].text.split('App context, not a spoken shopper request: ')[1].split('. The shopper answered')[0]);

test('purchase context preserves exact pairing IDs while stripping unrelated data and invalid flags',async t=>{
  const original={...purchaseContext(),pairing_ids:['glasses-1','lip-pink','glasses-1','bad id','lamp-1'],private_note:'not for model'};
  const f=fixture(t,{getContext:()=>({last_purchase:original})});await connect(f);
  assert.deepEqual(initialContext(f).last_purchase,{...purchaseContext(),pairing_ids_truncated:true});
  assert.equal(original.pairing_ids.length,5);
  f.voice.updateContext({last_purchase:{...original,payment_processed:true}});f.expireTimer(350);
  const update=f.channel.sent.at(-1).item.content[0].text;
  assert.match(update,/"last_purchase":null/);assert.doesNotMatch(update,/private_note/);
});

test('oversized purchase context keeps exact recent receipt and pairing references without inventing partial IDs',async t=>{
  const items=Array.from({length:20},(_,i)=>String(i).padStart(2,'0')+'x'.repeat(78));
  const pairings=Array.from({length:3},(_,i)=>'p'+i+'y'.repeat(78));
  const last_purchase={...purchaseContext(),item_ids:items,pairing_ids:pairings};
  const context={screen:'active',visible_panel:'call',cart_ids:items,comparison_ids:items.slice(0,3),
    checkout:{step:'complete',item_ids:items,reference_total:900000,demo:true},last_purchase,unused:'x'.repeat(6000)};
  const f=fixture(t,{getContext:()=>context});await connect(f);
  const decoded=initialContext(f);
  assert(JSON.stringify(decoded).length<=1600);
  assert.equal(decoded.last_purchase.receipt_id,last_purchase.receipt_id);
  assert.equal(decoded.last_purchase.demo,true);assert.equal(decoded.last_purchase.payment_processed,false);assert.equal(decoded.last_purchase.order_placed,false);
  assert.equal(decoded.last_purchase.item_ids_truncated,true);
  assert(decoded.last_purchase.item_ids.every(id=>items.includes(id)));
  assert.deepEqual(decoded.last_purchase.pairing_ids,pairings);
});

test('checkout context updates around confirmation preserve the system event and schedule exactly one ACKed response',async t=>{
  const f=fixture(t);await connect(f);done(f,'greeting');await tick();
  const before=countReplies(f.channel);
  f.voice.updateContext({checkout:{step:'complete'},last_purchase:purchaseContext(),cart_ids:[]});
  assert.equal(f.voice.notifyCheckoutComplete(completedReceipt(),[{id:'glasses-1',name:'Round glasses'}]),true);
  const notification=checkoutMessages(f.channel)[0];
  f.voice.updateContext({checkout:{step:'complete'},last_purchase:purchaseContext(),visible_panel:'checkout'});
  f.expireTimer(350);await tick();
  assert.equal(checkoutMessages(f.channel).length,1);assert.equal(countReplies(f.channel),before);
  assert.equal(f.channel.sent.some(event=>event.type==='conversation.item.delete'),false);
  ackCheckout(f,notification);await tick();assert.equal(countReplies(f.channel),before+1);
  f.emit({type:'response.created',response:{id:'purchase-thanks'}});done(f,'purchase-thanks');
  f.voice.updateContext({checkout:{step:'idle'},last_purchase:purchaseContext(),visible_panel:'call'});
  f.expireTimer(350);await tick();
  assert.equal(countReplies(f.channel),before+1);assert.equal(checkoutMessages(f.channel).length,1);
  assert.match(f.channel.sent.at(-1).item.content[0].text,/"pairing_ids":\["glasses-1","lamp-1"\]/);
});

const preferenceDraft=()=>({interests:['cozy_home','focused_work'],vibe:'calm',budget:30000,story:'I like reading at home and keeping my desk tidy.'});
const personalizing=()=>({personalization:{active:true,draft_pending:false,preferences:null}});
test('optional voice preferences open a confirmed draft without saving or inventing user captions',async t=>{
  const f=fixture(t,{getContext:personalizing,greeting:'What do you enjoy in your free time?'});await connect(f);
  const before=f.transcripts.length;
  tool(f,'preferences-1','draft_preferences',preferenceDraft());await tick();
  assert.equal(f.preferences.length,1);assert.equal(f.preferences[0].action,'draft');assert.deepEqual(JSON.parse(JSON.stringify(f.preferences[0].preferences)),preferenceDraft());
  const result=JSON.parse(toolOutputs(f.channel).at(-1).item.output);
  assert.equal(result.ok,true);assert.equal(result.draft_ready,true);assert.equal(result.confirmation_required,true);assert.equal(result.saved,false);
  assert.match(result.instruction,/tap Save preferences/);assert.match(result.instruction,/same call stays connected/);assert.equal(f.transcripts.length,before);
  tool(f,'preferences-1','draft_preferences',preferenceDraft());await tick();assert.equal(f.preferences.length,1,'duplicate tool event must not reopen review');
});

test('draft preferences require an active opt-in and reject unknown or malformed fields',async t=>{
  const off=fixture(t);await connect(off);tool(off,'prefs-off','draft_preferences',preferenceDraft());await tick();assert.equal(off.preferences.length,0);assert.match(JSON.parse(toolOutputs(off.channel).at(-1).item.output).error,/not active/);
  const f=fixture(t,{getContext:personalizing});await connect(f);
  const invalid=[{...preferenceDraft(),age:20},{...preferenceDraft(),interests:['unsupported']},{...preferenceDraft(),vibe:'wealthy'},{...preferenceDraft(),budget:-1},{...preferenceDraft(),budget:1.5},{...preferenceDraft(),budget:'30000'},{...preferenceDraft(),story:'x'.repeat(1201)},{...preferenceDraft(),story:null},{interests:[],vibe:'mixed',budget:null,story:''}];
  for(let i=0;i<invalid.length;i++){tool(f,'bad-prefs-'+i,'draft_preferences',invalid[i]);await tick();assert.equal(JSON.parse(toolOutputs(f.channel).at(-1).item.output).ok,false);}
  assert.equal(f.preferences.length,0);
});

test('skip exits only opted-in personalization and cannot attach a hidden draft',async t=>{
  let active=true;
  const f=fixture(t,{getContext:()=>({personalization:{active}}),onPreferences:request=>{assert.equal(request.action,'skip');active=false;return {ok:true,skipped:true,saved:false};}});await connect(f);
  tool(f,'skip-bad','skip_personalization',{story:'Save this anyway'});await tick();assert.equal(f.preferences.length,0);
  tool(f,'skip-ok','skip_personalization',{});await tick();assert.equal(f.preferences.length,1);assert.equal(active,false);assert.equal(f.voice.call.ready,true);
  const result=JSON.parse(toolOutputs(f.channel).at(-1).item.output);assert.equal(result.skipped,true);assert.equal(result.saved,false);assert.match(result.instruction,/Stop onboarding questions/);
  tool(f,'draft-too-late','draft_preferences',preferenceDraft());await tick();assert.equal(f.preferences.length,1);assert.equal(JSON.parse(toolOutputs(f.channel).at(-1).item.output).ok,false);
});

test('preference UI failure and unexpected persistence are not reported as a successful draft',async t=>{
  const variants=[{preferencesUnavailable:true},{onPreferences:()=>{throw Error('Review closed');}},{onPreferences:()=>({ok:true,draft_ready:false})},{onPreferences:()=>({ok:true,draft_ready:true,saved:true})}];
  for(let i=0;i<variants.length;i++){const f=fixture(t,{...variants[i],getContext:personalizing});await connect(f);tool(f,'prefs-failure-'+i,'draft_preferences',preferenceDraft());await tick();assert.equal(JSON.parse(toolOutputs(f.channel).at(-1).item.output).ok,false);}
});

test('a late draft callback after call end emits neither success nor another response',async t=>{
  const pending=deferred();const f=fixture(t,{getContext:personalizing,onPreferences:()=>pending.promise});await connect(f);
  const channel=f.channel;tool(f,'prefs-pending','draft_preferences',preferenceDraft());await tick();assert.equal(f.preferences.length,1);
  f.voice.end();const replies=countReplies(channel);pending.resolve({ok:true,draft_ready:true,saved:false});await tick();assert.equal(toolOutputs(channel).length,0);assert.equal(countReplies(channel),replies);
});

test('personalization context drops extra fields, preserves opt-in and compacts story before catalog IDs',async t=>{
  const ids=Array.from({length:10},(_,i)=>'p'+i+'a'.repeat(78));
  const input={personalization:{active:true,draft_pending:true,preferences:{...preferenceDraft(),story:'Long voluntary story. '.repeat(100),secret:'omit'},transcript:'omit'},cart_ids:ids,checkout:{step:'review',item_ids:ids,reference_total:100000,demo:true},unused:'x'.repeat(6000)};
  const f=fixture(t,{getContext:()=>input});await connect(f);const decoded=initialContext(f);
  assert(JSON.stringify(decoded).length<=1600);assert.equal(decoded.personalization.active,true);assert.equal(decoded.personalization.draft_pending,true);assert.deepEqual(decoded.personalization.preferences.interests,preferenceDraft().interests);
  assert(decoded.personalization.preferences.story.length<=160);assert(!('secret' in decoded.personalization.preferences));assert(!('transcript' in decoded.personalization));assert(decoded.checkout.item_ids.every(id=>ids.includes(id)));assert.equal(input.personalization.preferences.secret,'omit');
});

test('skipping while a preference draft is pending cannot announce a stale review',async t=>{
  let active=true;const pending=deferred();
  const f=fixture(t,{getContext:()=>({personalization:{active}}),onPreferences:()=>pending.promise});await connect(f);
  tool(f,'prefs-late-skip','draft_preferences',preferenceDraft());await tick();active=false;pending.resolve({ok:true,draft_ready:true,saved:false});await tick();
  const result=JSON.parse(toolOutputs(f.channel).at(-1).item.output);assert.equal(result.ok,false);assert.match(result.error,/Personalization ended/);assert.equal(result.draft_ready,undefined);
});

test('Chat starts without microphone support, requests text replies and stays silent',async t=>{
  const f=fixture(t,{getVisionEnabled:()=>false});let plays=0;f.audio.play=async()=>{plays++;};
  f.voice.mediaDevices=undefined;
  assert.equal(await f.voice.start({inputMode:'text'}),true);await tick();
  assert.equal(f.permissions,0);assert.equal(f.peers[0].addedTracks.length,0);
  assert.equal(f.voice.call.inputMode,'text');assert.equal(f.audio.muted,true);
  const configuration=f.channel.sent.find(event=>event.type==='session.update');
  assert.deepEqual(configuration.session.output_modalities,['text']);assert.equal(configuration.session.audio.input.turn_detection,null);
  assert.deepEqual(f.channel.sent.find(event=>event.type==='response.create').response.output_modalities,['text']);
  f.peers[0].emit('track',{streams:[{}]});await f.voice.resumeAudio();await tick();
  assert.equal(plays,0);assert.equal(f.voice.mute(),false);
  assert.match(f.states.at(-1).message,/message or photo/);
});

test('Chat sends typed messages and uploaded photos through the same real conversation',async t=>{
  const f=fixture(t,{getVisionEnabled:()=>false});assert.equal(await f.voice.start({inputMode:'text'}),true);await tick();done(f,'greeting');
  assert.equal(f.voice.sendText('Find a pink lip tint under 10000 won'),true);await tick();
  const user=f.channel.sent.find(event=>event.item?.id?.startsWith('coupi_text_')).item;
  f.emit({type:'response.created',response:{id:'text-answer'}});
  f.emit({type:'response.output_text.done',item_id:'assistant-text',response_id:'text-answer',text:'I will look for a pink tint within that budget.'});
  done(f,'text-answer');
  assert.deepEqual(latestTranscript(f).map(row=>row.key),[user.id,'assistant-text']);
  const sent=f.voice.sendImage(uploadImage),event=f.channel.sent.at(-1);
  f.emit({type:'conversation.item.added',item:event.item});assert.equal(await sent,true);await tick();
  assert.equal(f.transcripts.at(-1).delivery,'sent');
  assert(f.channel.sent.filter(event=>event.type==='response.create').every(event=>event.response.output_modalities[0]==='text'));
  assert.equal(f.permissions,0);
});

test('Voice to Chat stops recording and playback while preserving the peer and conversation',async t=>{
  const f=fixture(t);await connect(f);const call=f.voice.call,peer=call.peer,channel=f.channel;
  f.voice.sendText('I like pink');f.emit({type:'input_audio_buffer.speech_started',item_id:'last-spoken'});
  assert.equal(await f.voice.setInputMode('text'),true);
  assert.equal(f.mic.track.stops,1);assert.equal(call.microphone,null);assert.equal(call.audioSender.track,null);
  assert.equal(call.inputMode,'text');assert.equal(call.awaitingVad,false);assert.equal(f.audio.paused,true);assert.equal(f.audio.muted,true);
  assert.equal(f.voice.call,call);assert.equal(call.peer,peer);assert.equal(f.channel,channel);
  assert(latestTranscript(f).some(row=>row.text==='I like pink'));
  f.emit({type:'input_audio_buffer.speech_started',item_id:'stale-voice-event'});
  assert.equal(call.awaitingVad,false);assert.equal(latestTranscript(f).some(row=>row.key==='stale-voice-event'),false);
  assert.equal(f.voice.sendText('Now show me another option'),true);
  assert.equal(f.calls.filter(([url])=>url.endsWith('/session')).length,1);
});

test('explicit Voice switch acquires microphone and restores audio in the same Chat session',async t=>{
  const f=fixture(t);assert.equal(await f.voice.start({inputMode:'text'}),true);await tick();
  const call=f.voice.call;assert.equal(f.permissions,0);f.voice.sendText('Find glasses');
  assert.equal(await f.voice.setInputMode('voice'),true);
  assert.equal(f.permissions,1);assert.equal(f.voice.call,call);assert.equal(call.audioSender.track,f.mic.track);
  assert.equal(call.inputMode,'voice');assert.equal(f.audio.muted,false);assert.equal(f.audio.autoplay,true);
  const configuration=f.channel.sent.findLast(event=>event.type==='session.update');
  assert.deepEqual(configuration.session.output_modalities,['audio']);assert.equal(configuration.session.audio.input.turn_detection.type,'server_vad');
  assert.equal(f.calls.filter(([url])=>url.endsWith('/session')).length,1);
  assert.equal(f.voice.mute(),true);assert.equal(f.mic.track.enabled,false);
});

test('denied microphone permission leaves Chat usable without resetting its transcript',async t=>{
  const f=fixture(t,{getUserMedia:()=>Promise.reject(Object.assign(new Error('Denied'),{name:'NotAllowedError'}))});
  assert.equal(await f.voice.start({inputMode:'text'}),true);await tick();const call=f.voice.call;
  f.voice.sendText('I prefer blue');
  assert.equal(await f.voice.setInputMode('voice'),false);
  assert.equal(f.voice.call,call);assert.equal(call.inputMode,'text');assert.equal(f.audio.muted,true);
  assert.match(f.states.at(-1).message,/denied.*keep chatting/);
  assert.equal(f.voice.sendText('Show blue hoodies'),true);assert(latestTranscript(f).some(row=>row.text==='I prefer blue'));
});

test('returning to Chat while voice permission is pending releases the late microphone',async t=>{
  const permission=deferred(),lateMic=microphone();const f=fixture(t,{getUserMedia:()=>permission.promise});
  assert.equal(await f.voice.start({inputMode:'text'}),true);await tick();const call=f.voice.call;
  const voiceSwitch=f.voice.setInputMode('voice');assert.equal(f.permissions,1);
  assert.equal(await f.voice.setInputMode('text'),true);
  permission.resolve(lateMic);assert.equal(await voiceSwitch,false);
  assert.equal(lateMic.track.stops,1);assert.equal(call.inputMode,'text');assert.equal(call.audioSender.track,null);
});

test('ending Chat during a pending Voice permission request stops the newly granted microphone',async t=>{
  const permission=deferred(),lateMic=microphone();const f=fixture(t,{getUserMedia:()=>permission.promise});
  assert.equal(await f.voice.start({inputMode:'text'}),true);await tick();const voiceSwitch=f.voice.setInputMode('voice');
  f.voice.end();permission.resolve(lateMic);assert.equal(await voiceSwitch,false);
  assert.equal(lateMic.track.stops,1);assert.equal(f.voice.call,null);
});

test('a delayed playback failure cannot show a speaker prompt after switching to silent Chat',async t=>{
  const f=fixture(t),playing=deferred(),blocked=[];f.voice.options.onPlaybackBlocked=value=>blocked.push(value);
  await connect(f);f.audio.play=()=>playing.promise;f.peers[0].emit('track',{streams:[{}]});
  await f.voice.setInputMode('text');playing.reject(new Error('Interrupted playback'));await tick();
  assert.deepEqual(blocked,[false]);assert.equal(f.audio.muted,true);
});

test('Voice can return after Chat with a new microphone without an old track ending the call',async t=>{
  const first=microphone(),second=microphone(),f=fixture(t,{getUserMedia:attempt=>attempt===1?first:second});await connect(f);
  const call=f.voice.call;await f.voice.setInputMode('text');assert.equal(first.track.stops,1);
  assert.equal(await f.voice.setInputMode('voice'),true);assert.equal(f.permissions,2);
  first.track.emit('ended');assert.equal(f.voice.call,call);assert.equal(call.microphone,second);
  assert.equal(call.audioSender.track,second.track);f.voice.end();assert.equal(second.track.stops,1);
});

test('unavailable try-on keeps the real reason and offered alternatives without claiming an adjustment',async t=>{
  const alternative={id:'clean-frame',name:'Available matching glasses'};
  const f=fixture(t,{onTryon:()=>({ok:false,unavailableReason:'The source photo shows a person wearing the frames.',alternatives:[alternative]})});await connect(f);
  tool(f,'unavailable-preview','set_tryon',{mode:'glasses',scale:1.1});await tick();
  const result=JSON.parse(toolOutputs(f.channel).at(-1).item.output);
  assert.equal(result.ok,false);assert.match(result.error,/shows a person/);assert.deepEqual(result.alternatives,[alternative]);
  assert.match(result.instruction,/Do not claim the preview/);assert.equal(result.preview,undefined);assert.equal(result.notice,undefined);
});

const shoppingEvents=channel=>channel.sent.filter(event=>event.item?.id?.startsWith('coupi_skip_'));
const ackShopping=(f,event)=>f.emit({type:'conversation.item.added',item:event.item});

test('Skip during connection replaces the interview with one hidden shopping event, without acquiring media',async t=>{
  let active=true;
  const f=fixture(t,{greeting:'Tell me about your hobbies.',getContext:()=>({personalization:{active},input_mode:'text'})});
  assert.equal(f.voice.skipPersonalization(),false);
  const starting=f.voice.start({inputMode:'text'});active=false;
  assert.equal(f.voice.skipPersonalization(),true);assert.equal(await starting,true);await tick();
  assert.equal(f.permissions,0);assert.equal(countReplies(f.channel),0);
  assert.equal(shoppingEvents(f.channel).length,1);
  assert.equal(f.channel.sent.some(event=>event.item?.content?.[0]?.text?.includes('Begin with this brief greeting')),false);
  const event=shoppingEvents(f.channel)[0];assert.equal(event.item.role,'system');
  assert.match(event.item.content[0].text,/"active":false/);assert.match(event.item.content[0].text,/What do you want to buy/);
  assert.match(event.item.content[0].text,/ONE-TIME transition acknowledgment/);
  assert.match(event.item.content[0].text,/If a newer shopper request is present, answer that request normally instead/);
  assert.match(event.item.content[0].text,/do not repeat the shopping opener in recommendations, tool follow-ups or later replies/);
  ackShopping(f,event);await tick();assert.equal(countReplies(f.channel),1);assert.equal(f.transcripts.length,0);
  ackShopping(f,event);f.voice.skipPersonalization();await tick();assert.equal(countReplies(f.channel),1);
});

test('Skip cancels an active interview, clears speech and suppresses late captions before the shopping question',async t=>{
  let active=true;const f=fixture(t,{getContext:()=>({personalization:{active}})});await connect(f);
  f.emit({type:'response.created',response:{id:'interview'}});
  f.emit({type:'response.output_audio_transcript.delta',item_id:'interview-caption',response_id:'interview',delta:'Tell me about '});
  f.peers[0].emit('track',{streams:[{}]});await tick();const call=f.voice.call,before=countReplies(f.channel);
  active=false;assert.equal(f.voice.skipPersonalization(),true);
  assert(f.channel.sent.some(event=>event.type==='response.cancel'&&event.response_id==='interview'));
  assert(f.channel.sent.some(event=>event.type==='output_audio_buffer.clear'));
  assert.equal(f.audio.muted,true);assert.equal(f.audio.paused,true);assert.equal(f.mic.track.stops,0);assert.equal(f.voice.call,call);
  const appEvent=shoppingEvents(f.channel)[0];ackShopping(f,appEvent);await tick();assert.equal(countReplies(f.channel),before);
  const captions=f.transcripts.length;
  f.emit({type:'response.output_audio_transcript.done',item_id:'interview-caption',response_id:'interview',transcript:'Tell me about your hobbies.'});
  assert.equal(f.transcripts.length,captions);assert.equal(await f.voice.resumeAudio(),false);
  f.emit({type:'response.done',response:{id:'interview',status:'cancelled'}});await tick();assert.equal(countReplies(f.channel),before+1);
  f.emit({type:'response.created',response:{id:'shopping'}});await tick();assert.equal(f.audio.muted,false);
  f.emit({type:'response.output_audio_transcript.done',item_id:'shopping-caption',response_id:'shopping',transcript:'What do you want to buy?'});
  assert.equal(f.transcripts.at(-1).text,'What do you want to buy?');assert(f.transcripts.every(row=>row.role==='assistant'));
  done(f,'interview');f.voice.skipPersonalization();await tick();assert.equal(countReplies(f.channel),before+1);
});

test('Skip handles a greeting request whose response ID arrives after the button click',async t=>{
  const f=fixture(t);await connect(f);const before=countReplies(f.channel);
  assert.equal(f.voice.call.replyRequested,true);f.voice.skipPersonalization();ackShopping(f,shoppingEvents(f.channel)[0]);await tick();
  assert.equal(countReplies(f.channel),before);
  f.emit({type:'response.created',response:{id:'late-greeting'}});
  assert(f.channel.sent.some(event=>event.type==='response.cancel'&&event.response_id==='late-greeting'));
  f.emit({type:'response.done',response:{id:'late-greeting',status:'cancelled'}});await tick();
  assert.equal(countReplies(f.channel),before+1);
  f.emit({type:'response.created',response:{id:'shopping'}});done(f,'late-greeting');await tick();
  assert.equal(countReplies(f.channel),before+1);assert(f.voice.call.activeResponses.has('shopping'));
});

test('Skip proceeds when cancellation reports no active response and ignores duplicate acknowledgments',async t=>{
  const f=fixture(t);await connect(f);const before=countReplies(f.channel);f.voice.skipPersonalization();
  const cancel=f.channel.sent.findLast(event=>event.type==='response.cancel'),appEvent=shoppingEvents(f.channel)[0];
  ackShopping(f,appEvent);f.emit({type:'error',error:{code:'response_cancel_not_active',event_id:cancel.event_id}});await tick();
  assert.equal(countReplies(f.channel),before+1);ackShopping(f,appEvent);await tick();assert.equal(countReplies(f.channel),before+1);
});

test('Skip retires a pending preference draft so its late callback cannot restart the interview',async t=>{
  let active=true;const pending=deferred();
  const f=fixture(t,{getContext:()=>({personalization:{active}}),onPreferences:()=>pending.promise});await connect(f);
  f.emit({type:'response.created',response:{id:'interview'}});tool(f,'late-draft','draft_preferences',preferenceDraft(),'interview');await tick();
  active=false;f.voice.skipPersonalization();ackShopping(f,shoppingEvents(f.channel)[0]);
  f.emit({type:'response.done',response:{id:'interview',status:'cancelled'}});await tick();const replies=countReplies(f.channel);
  assert.equal(replies,2);f.emit({type:'response.created',response:{id:'shopping'}});
  pending.resolve({ok:true,draft_ready:true,saved:false});await tick();done(f,'shopping');await tick();
  assert.equal(countReplies(f.channel),replies);assert.match(toolOutputs(f.channel).at(-1).item.output,/skipped the interview/);
});

test('Skip retries a missing application ACK once and ending the call discards pending shopping speech',async t=>{
  const f=fixture(t);await connect(f);done(f,'greeting');f.voice.skipPersonalization();
  const first=shoppingEvents(f.channel)[0];f.expireTimer(12000);assert.equal(shoppingEvents(f.channel).length,2);
  ackShopping(f,first);await tick();assert.equal(countReplies(f.channel),2);
  const oldChannel=f.channel;f.voice.end();oldChannel.emit('message',{data:JSON.stringify({type:'conversation.item.added',item:shoppingEvents(oldChannel)[1].item})});await tick();
  assert.equal(countReplies(oldChannel),2);assert.equal(f.voice.skipPersonalization(),false);
});

test('an unconfirmed Skip never blocks an ordinary shopping message or cancels its later reply',async t=>{
  const f=fixture(t);await connect(f);done(f,'greeting');f.voice.skipPersonalization();
  f.expireTimer(12000);f.expireTimer(12000);assert.equal(f.voice.call.shoppingTransition.failed,true);
  assert.equal(f.voice.sendText('Find a red lipstick'),true);await tick();assert.equal(countReplies(f.channel),2);
  const cancels=f.channel.sent.filter(event=>event.type==='response.cancel').length;
  f.emit({type:'response.created',response:{id:'ordinary-shopping'}});
  assert.equal(f.channel.sent.filter(event=>event.type==='response.cancel').length,cancels);assert.equal(f.audio.muted,false);
  f.emit({type:'response.output_audio_transcript.done',response_id:'ordinary-shopping',item_id:'ordinary-answer',transcript:'I will find a red lipstick.'});
  assert.equal(f.transcripts.at(-1).text,'I will find a red lipstick.');
});
