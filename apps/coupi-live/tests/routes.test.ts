import {fixtureBlueprint} from './fixtures/blueprint';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GET as getProfile, POST as postProfile } from '../app/api/profile/route';
import { POST as ask } from '../app/api/ask/route';
import { POST as scene } from '../app/api/scene/route';
import { POST as decisions } from '../app/api/decisions/route';
import { POST as scan } from '../app/api/scan/route';
import { GET as getStatus } from '../app/api/status/route';
import { getReview, getSku, reviews } from '../lib/catalog';
import {comparisonGroupForSku} from '../lib/comparison-groups';
import type { Profile } from '../lib/types';

type Handler = (request: Request) => Promise<Response>;
type Json = Record<string, any>;
interface CapturedCall { operation: string; input: Json; body: Json; }
const origin = 'http://localhost:3000';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=', 'base64');

class BrowserSession {
  cookie = '';
  async send(handler: Handler, pathname: string, body?: Json, overrideOrigin = origin) {
    const headers = new Headers({ origin: overrideOrigin });
    if (this.cookie) headers.set('cookie', this.cookie);
    if (body) headers.set('content-type', 'application/json');
    const request = new Request(origin + pathname, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
    return this.consume(await handler(request));
  }
  async photo(bytes = png, mime = 'image/png') {
    const form = new FormData();
    form.set('file', new File([bytes], 'fridge.png', { type: mime }));
    form.set('expectedStaples', JSON.stringify(['oat milk', 'spinach']));
    const response = await scan(new Request(origin + '/api/scan', { method: 'POST', headers: { origin, cookie: this.cookie }, body: form }));
    return this.consume(response);
  }
  private async consume(response: Response) {
    const cookie = response.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';', 1)[0];
    return { response, status: response.status, body: await response.json() as Json };
  }
}

/** A provider fake exists only in this test. Real handlers, validation, profile files and cache files run unchanged. */
async function fixture(run: (context: { root: string; calls: CapturedCall[]; browser: BrowserSession; setAskMode: (mode: 'valid' | 'invalid-once' | 'always-invalid' | 'clarify') => void }) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'coupi-routes-'));
  const names = ['COUPI_DATA_DIR', 'COUPI_CACHE_DIR', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'DEMO_OFFLINE'] as const;
  const previousEnv = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const previousFetch = globalThis.fetch;
  const previousInfo = console.info;
  const calls: CapturedCall[] = [];
  let askMode = 'valid';
  let askAttempt = 0;
  process.env.COUPI_DATA_DIR = path.join(root, 'profiles');
  process.env.COUPI_CACHE_DIR = path.join(root, 'responses');
  process.env.OPENAI_API_KEY = 'sk-test-routes-not-a-real-key';
  process.env.OPENAI_MODEL = 'test-model';
  process.env.DEMO_OFFLINE = '0';
  console.info = () => {};
  globalThis.fetch = (async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer sk-test-routes-not-a-real-key');
    const body = JSON.parse(String(init?.body)) as Json;
    const input = JSON.parse(body.input[0].content.find((part: Json) => part.type === 'input_text').text) as Json;
    const operation = body.text.format.name;
    calls.push({ operation, input, body });
    let output: Json;
    if (operation === 'taste_memory') {
      assert(input.tally['kitchen:vibe:warm-neutrals'] > 0);
      output = { lines: [{ text: 'Prefers warm neutrals in the kitchen', traitKeys: ['kitchen:vibe:warm-neutrals'] }] };
    } else if (operation === 'scene') {
      output = { blueprint:fixtureBlueprint(['kettleAlt', 'glass', 'cottonApron', 'bambooTray', 'miniSpeaker']), name: 'A quieter kitchen', explanation: 'Five catalog picks with a total of ₩95,500.', items: ['kettleAlt', 'glass', 'cottonApron', 'bambooTray', 'miniSpeaker'].map((skuId) => ({ skuId, oneLiner: 'A simple fit for your quieter kitchen.' })) };
    } else if (operation === 'ask_verdict') {
      askAttempt++;
      if (askMode === 'clarify') {
        output = { pickSkuId: null, reason: 'The catalog does not specify that size.', dissent: '', citations: [], runnerUpSkuId: null, whyRunnerUpLost: '', clarifyingQuestion: 'Which listed size would you accept?' };
      } else {
        const warm = Boolean(input.profile.traits['kitchen:vibe:warm-neutrals']);
        const pick = warm ? 'apron' : 'glass';
        const invalid = askMode === 'always-invalid' || (askMode === 'invalid-once' && askAttempt === 1);
        output = { pickSkuId: pick, reason: warm ? 'Linen matches your kitchen palette preference.' : 'A clear cup duo without relying on a deleted preference.', dissent: warm ? 'Two seeded reviews mention creases after washing.' : 'Two seeded reviews describe fragile glass.', citations: invalid ? ['invented-review'] : [`${pick}-001`, `${pick}-013`], runnerUpSkuId: warm ? 'cottonApron' : 'mugs', whyRunnerUpLost: 'The other listed material is a weaker fit for this request.', clarifyingQuestion: null };
      }
      if(input.question.includes('red socks'))output={pickSkuId:'socksBudget',runnerUpSkuId:'socksRunner',reason:'The budget red socks cost less.',dissent:'Two seeded reviews mention pilling.',citations:['B04','B14'],whyRunnerUpLost:'The runner socks cost more, though their average rating is higher.',clarifyingQuestion:null};
    } else if (operation === 'photo_inventory') {
      assert(body.input[0].content.some((part: Json) => part.type === 'input_image'));
      output = { items: [{ name: 'oat milk', quantity: 'a small amount visible', status: 'low' }], lowOrMissing: [{ name: 'oat milk', reason: 'Visible low quantity', confidence: 'high' }, { name: 'spinach', reason: 'Expected staple; visible greens drawer is empty', confidence: 'medium' }], uncertainties: [] };
    } else throw new Error('Unexpected model operation: ' + operation);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }], usage: { input_tokens: 127, output_tokens: 33 } });
  }) as typeof fetch;
  try {
    await run({ root, calls, browser: new BrowserSession(), setAskMode(mode) { askMode = mode; askAttempt = 0; } });
  } finally {
    globalThis.fetch = previousFetch;
    console.info = previousInfo;
    for (const name of names) {
      if (previousEnv[name] === undefined) delete process.env[name]; else process.env[name] = previousEnv[name];
    }
    await rm(root, { recursive: true, force: true });
  }
}

function daytimeZone() {
  const utcHour = new Date().getUTCHours();
  return utcHour >= 7 && utcHour < 22 ? 'UTC' : 'Pacific/Honolulu';
}

test('live route loop persists learning, grounds evidence, enforces guardrails and replays offline', { concurrency: false }, async (t) => {
  await fixture(async ({ browser, calls, root }) => {
    let profile: Profile;
    const question = 'Choose something for my kitchen from the catalog.';
    const command = 'Make it minimalist, with five items under ₩100,000 total.';
    await t.test('a new HTTP-only cookie starts an isolated persistent profile', async () => {
      const response = await browser.send(getProfile, '/api/profile');
      assert.equal(response.status, 200);
      assert.match(response.response.headers.get('set-cookie') || '', /HttpOnly; SameSite=Strict/);
      profile = response.body.profile;
      assert.equal(profile.memoryLines.length, 0);
      assert(profile.owned.some((item) => item.skuId === 'detergent'));
      assert(profile.quarantine.some((item) => item.category === 'personal-care'));
      assert.equal(calls.length, 0);
      const persisted = JSON.parse(await readFile(path.join(root, 'profiles', profile.id + '.json'), 'utf8'));
      assert.equal(persisted.id, profile.id);
      await browser.send(postProfile, '/api/profile', { action: 'settings', timezone: daytimeZone() });
    });
    await t.test('each swipe immediately persists sourced memory without a provider call', async () => {
      for (let i = 0; i < 6; i++) {
        const response = await browser.send(postProfile, '/api/profile', { action: 'swipe', swipe: { id: `route-swipe-${i}`, skuId: 'apron', action: 'ooh', source: 'bus deck' } });
        assert.equal(response.status, 200);
        profile = response.body.profile;
        assert.equal(calls.length, 0);
        assert.equal(profile.memoryLines.length, i+1);
        assert.equal(profile.memoryLines.at(-1)!.confidence,0.65);
        assert(profile.memoryLines.at(-1)!.createdAt);
      }
      assert.equal(profile!.xp, 60);
      assert.equal(profile!.traits['kitchen:vibe:warm-neutrals'], 12);
      assert.equal(profile!.memoryLines[0].source, 'from your day-0 swipe');
      assert.equal(profile!.summarizedSwipeCount, 0);
      const reloaded = await browser.send(getProfile, '/api/profile');
      assert.equal(reloaded.body.profile.memoryLines[0].id, profile!.memoryLines[0].id);
    });
    await t.test('verdict cites seeded reviews; deleting a memory changes the next provider input', async () => {
      const before = await browser.send(ask, '/api/ask', { question, requestId: 'before-delete' });
      assert.equal(before.status, 200);
      assert.equal(before.body.status, 'verdict');
      assert.equal(before.body.verdict.pickSkuId, 'apron');
      for (const id of before.body.verdict.citations) assert(getReview(id));
      const lastBefore = calls.at(-1)!;
      assert.equal(lastBefore.input.profile.traits['kitchen:vibe:warm-neutrals'], 7.8);
      const deleted = await browser.send(postProfile, '/api/profile', { action: 'deleteMemory', lineId: before.body.profile.memoryLines[0].id });
      assert.equal(deleted.status, 200);
      assert.equal(deleted.body.profile.traits['kitchen:vibe:warm-neutrals'], undefined);
      assert(deleted.body.profile.swipes.every((event: Json) => !('kitchen:vibe:warm-neutrals' in event.contributions)));
      const after = await browser.send(ask, '/api/ask', { question, requestId: 'after-delete' });
      assert.equal(after.status, 200);
      assert.equal(after.body.verdict.pickSkuId, 'glass');
      assert.equal(calls.at(-1)!.input.profile.traits['kitchen:vibe:warm-neutrals'], undefined);
      assert(!calls.at(-1)!.input.profile.memoryLines.some((line:Json)=>line.traitKeys.includes('kitchen:vibe:warm-neutrals')));
      assert(!calls.at(-1)!.input.catalog.some((sku: Json) => sku.id === 'skinCream' || sku.id === 'detergent'));
      profile = after.body.profile;
    });
    await t.test('custom scene words reach structured generation and only catalog IDs return', async () => {
      const response = await browser.send(scene, '/api/scene', { command });
      assert.equal(response.status, 200);
      assert.equal(calls.at(-1)!.operation, 'scene');
      assert.equal(calls.at(-1)!.input.command, command);
      assert.equal(response.body.scene.items.length, 5);
      assert(response.body.scene.items.every((item: Json) => getSku(item.skuId)));
      assert(response.body.scene.items.reduce((sum: number, item: Json) => sum + getSku(item.skuId)!.price, 0) < 100000);
      assert.equal(response.body.meta.cached, false);
    });
    await t.test('owned detergent refusal happens before any provider call, including direct add', async () => {
      const count = calls.length;
      const response = await browser.send(ask, '/api/ask', { question: 'Buy laundry detergent', requestId: 'owned-question', pickSkuId: 'detergent' });
      assert.equal(response.status, 200);
      assert.equal(response.body.status, 'blocked');
      assert.match(response.body.message, /3 weeks ago/);
      const add = await browser.send(decisions, '/api/decisions', { action: 'add', skuId: 'detergent', source: 'manual' });
      assert.match(add.body.blocked, /don’t need/);
      assert.equal(calls.length, count);
      assert.equal(add.body.profile.xp, profile!.xp);
    });
    await t.test('pretend 2 AM creates a real lock and the approval route refuses it without XP', async () => {
      await browser.send(postProfile, '/api/profile', { action: 'settings', pretend2am: true });
      const add = await browser.send(decisions, '/api/decisions', { action: 'add', skuId: 'kettle', source: 'stroll' });
      assert.equal(add.status, 200);
      assert(add.body.decision.lockedUntil);
      const xp = add.body.profile.xp;
      const approved = await browser.send(decisions, '/api/decisions', { action: 'approve', ids: [add.body.decision.id] });
      assert.equal(approved.status, 200);
      assert.deepEqual(approved.body.approved, []);
      assert.match(approved.body.blocked[0], /held until 7:00 AM/);
      assert.equal(approved.body.profile.xp, xp);
      assert(!approved.body.profile.owned.some((item: Json) => item.skuId === 'kettle'));
    });
    await t.test('a multipart photo produces inventory, mapped groceries and locked decision cards', async () => {
      const before = calls.length;
      const response = await browser.photo();
      assert.equal(response.status, 200);
      assert.equal(calls.length, before + 1);
      assert.deepEqual(response.body.mappedSkuIds.map((id:string)=>comparisonGroupForSku(getSku(id)!)), ['oat-milk', 'spinach']);
      const rows = response.body.profile.decisions.filter((item: Json) => response.body.mappedSkuIds.includes(item.skuId));
      assert.equal(rows.length, 2);
      assert(rows.every((item: Json) => item.source === 'photo scan' && item.lockedUntil));
      const files = await readdir(path.join(root, 'responses'));
      for (const file of files) {
        const text = await readFile(path.join(root, 'responses', file), 'utf8');
        assert(!text.includes(png.toString('base64')));
        assert(!text.includes('sk-test-routes-not-a-real-key'));
      }
    });
    await t.test('offline mode replays Ask, scene and photo with zero network; cache misses fail loudly', async () => {
      // Ambient context has changed since the original answers; rehearse the current context first.
      await browser.send(scene, '/api/scene', { command,requestId:'warm-scene' });
      await browser.send(ask, '/api/ask', { question, requestId: 'warm-current-context' });
      process.env.DEMO_OFFLINE = '1';
      const before = calls.length;
      const askReplay = await browser.send(ask, '/api/ask', { question, requestId: 'offline-after-delete' });
      assert.equal(askReplay.status, 200);
      assert.equal(askReplay.body.meta.cached, true);
      assert.equal(askReplay.body.meta.offline, true);
      assert.equal(askReplay.body.meta.inputTokens, 0);
      const sceneReplay = await browser.send(scene, '/api/scene', { command,requestId:'warm-scene' });
      assert.equal(sceneReplay.status, 200);
      assert.equal(sceneReplay.body.meta.cached, true);
      const scanReplay = await browser.photo();
      assert.equal(scanReplay.status, 200);
      assert.equal(scanReplay.body.meta.cached, true);
      for(const skuId of scanReplay.body.mappedSkuIds)assert.equal(scanReplay.body.profile.decisions.filter((item: Json) => item.skuId === skuId).length, 1);
      const missing = await browser.send(ask, '/api/ask', { question: 'A new path I never rehearsed.', requestId: 'cache-miss' });
      assert.equal(missing.status, 503);
      assert.equal(missing.body.code, 'OFFLINE_CACHE_MISS');
      assert.match(missing.body.error, /No network request was made/);
      assert.equal(calls.length, before);
      const status = await (await getStatus()).json();
      assert.equal(status.offline, true);
      assert.equal(status.reviewCount, reviews.length);
      assert(!JSON.stringify(status).includes('sk-test'));
    });
    await t.test('a second browser learns offline without inheriting the first profile', async () => {
      const second = new BrowserSession();
      const fresh = await second.send(getProfile, '/api/profile');
      assert.notEqual(second.cookie, browser.cookie);
      assert.equal(fresh.body.profile.memoryLines.length, 0);
      const before = calls.length;
      let result: Json = {};
      for (let i = 0; i < 6; i++) {
        result = (await second.send(postProfile, '/api/profile', { action: 'swipe', swipe: { id: `second-${i}`, skuId: 'apron', action: 'ooh', source: 'bus deck' } })).body;
      }
      assert.equal(result.profile.memoryLines.length, 6);
      assert.equal(result.summaryMeta, undefined);
      assert.equal(calls.length, before);
      assert((await browser.send(getProfile, '/api/profile')).body.profile.memoryLines.some((line:Json)=>line.kind==='inventory'));
    });
    await t.test('reset keeps the local timezone, clears the journey, and preserves deterministic offline replay', async () => {
      const before = calls.length;
      const configured = await browser.send(postProfile, '/api/profile', { action: 'settings', timezone: 'Asia/Singapore', pretend2am: true });
      assert.equal(configured.body.profile.timezone, 'Asia/Singapore');
      assert(configured.body.profile.swipes.length > 0);
      assert(configured.body.profile.memoryLines.length > 0);
      assert(configured.body.profile.decisions.length > 0);
      const reset = await browser.send(postProfile, '/api/profile', { action: 'reset' });
      assert.equal(reset.status, 200);
      assert.equal(reset.body.profile.id, configured.body.profile.id);
      assert.equal(reset.body.profile.timezone, 'Asia/Singapore');
      assert.equal(reset.body.profile.pretend2am, false);
      assert.equal(reset.body.profile.xp, 0);
      assert.equal(reset.body.profile.summarizedSwipeCount, 0);
      assert.deepEqual(reset.body.profile.traits, {});
      for (const field of ['swipes', 'memoryLines', 'forgottenTraitKeys', 'decisions', 'answeredQuestionIds']) assert.deepEqual(reset.body.profile[field], []);
      assert.deepEqual(reset.body.profile.owned.map((item: Json) => ({ skuId: item.skuId, source: item.source })), [{ skuId: 'detergent', source: 'seed' }]);
      assert.equal((await browser.send(getProfile, '/api/profile')).body.profile.timezone, 'Asia/Singapore');

      let replay: Json = {};
      for (let i = 0; i < 6; i++) {
        replay = (await browser.send(postProfile, '/api/profile', { action: 'swipe', swipe: { id: `reset-${i}`, skuId: 'apron', action: 'ooh', source: 'bus deck' } })).body;
      }
      assert.equal(replay.profile.memoryLines.length, 6);
      assert.equal(replay.profile.timezone, 'Asia/Singapore');
      assert.equal(replay.summaryMeta, undefined);
      assert.equal(calls.length, before);
    });
  });
});

test('route evidence failures retry once, then expose raw evidence; malformed requests make no provider call', { concurrency: false }, async (t) => {
  await fixture(async ({ browser, calls, setAskMode }) => {
    await browser.send(getProfile, '/api/profile');
    await t.test('one invalid citation retries exactly once and returns a valid seeded citation', async () => {
      setAskMode('invalid-once');
      const response = await browser.send(ask, '/api/ask', { question: 'Test the retry path.', requestId: 'retry' });
      assert.equal(response.status, 200);
      assert.equal(response.body.status, 'verdict');
      assert.equal(calls.length, 2);
      assert(response.body.verdict.citations.every((id: string) => getReview(id)));
      assert.equal(response.body.profile.xp, 5);
    });
    await t.test('two invalid citation payloads return the unfiltered corpus and no question XP', async () => {
      setAskMode('always-invalid');
      const before = calls.length;
      const response = await browser.send(ask, '/api/ask', { question: 'Test the fallback path.', requestId: 'fallback' });
      assert.equal(response.status, 200);
      assert.equal(response.body.status, 'fallback');
      assert.match(response.body.message, /I’m not sure/);
      assert.equal(response.body.reviews.length, reviews.length);
      assert(response.body.catalog.length > 0);
      assert.equal(calls.length - before, 2);
      assert.equal(response.body.profile.xp, 5);
    });
    await t.test('one clarifying question has no pick, no evidence inventions, and no answer XP', async () => {
      setAskMode('clarify');
      const response = await browser.send(ask, '/api/ask', { question: 'A size the catalog does not know.', requestId: 'clarify' });
      assert.equal(response.status, 200);
      assert.equal(response.body.status, 'clarify');
      assert.equal(response.body.verdict.pickSkuId, null);
      assert.deepEqual(response.body.verdict.citations, []);
      assert(response.body.verdict.clarifyingQuestion);
      assert.equal(response.body.profile.xp, 5);
    });
    await t.test('cross-origin writes, unknown SKUs and invalid image bytes fail before inference', async () => {
      const before = calls.length;
      const crossOrigin = await browser.send(postProfile, '/api/profile', { action: 'reset' }, 'https://unrelated.example');
      assert.equal(crossOrigin.status, 403);
      assert.equal(crossOrigin.body.code, 'ORIGIN_MISMATCH');
      const unknown = await browser.send(postProfile, '/api/profile', { action: 'swipe', swipe: { id: 'bad-swipe', skuId: 'not-in-catalog', action: 'ooh', source: 'bus deck' } });
      assert.equal(unknown.status, 400);
      assert.equal(unknown.body.code, 'INVALID_SWIPE');
      const image = await browser.photo(Buffer.from('not an image'));
      assert.equal(image.status, 415);
      assert.equal(image.body.code, 'INVALID_IMAGE');
      assert.equal(calls.length, before);
    });
  });
});

test('one runner-up choice changes the very next ask, with dated provenance and reversible influence', {concurrency:false}, async()=>{
  await fixture(async({browser,calls})=>{
    await browser.send(getProfile,'/api/profile');
    const question='Find red socks arriving tomorrow.';
    const first=await browser.send(ask,'/api/ask',{question,requestId:'first-socks'});
    assert.equal(first.body.verdict.pickSkuId,'socksBudget');
    const invalid=await browser.send(postProfile,'/api/profile',{action:'verdictChoice',requestId:'first-socks',skuId:'kettle'});
    assert.equal(invalid.status,400);
    const choice=await browser.send(postProfile,'/api/profile',{action:'verdictChoice',requestId:'first-socks',skuId:'socksRunner'});
    assert.equal(choice.status,200);
    const learned=choice.body.profile.memoryLines.find((line:Json)=>line.kind==='verdict');
    assert.equal(learned.text,'weighs reviews over price');
    assert.equal(learned.source,'from your verdict choice');
    assert(learned.confidence>0&&learned.confidence<0.8);
    assert(learned.createdAt);
    const again=await browser.send(postProfile,'/api/profile',{action:'verdictChoice',requestId:'first-socks',skuId:'socksRunner'});
    assert.equal(again.body.profile.memoryLines.filter((line:Json)=>line.kind==='verdict').length,1);
    const next=await browser.send(ask,'/api/ask',{question,requestId:'next-socks'});
    assert.equal(next.body.verdict.pickSkuId,'socksRunner');
    assert(calls.at(-1)!.input.profile.traits['priority:reviews-over-price']>0);
    assert(calls.at(-1)!.input.rankingPolicy.reviewWeight>calls.at(-1)!.input.rankingPolicy.priceWeight);
    const day=new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:choice.body.profile.timezone}).format(new Date(learned.createdAt));
    assert(next.body.verdict.reason.includes('ranked reviews above price — you taught me that on '+day));
    assert(next.body.verdict.citations.every((id:string)=>getReview(id)?.skuId==='socksRunner'));
    // An exact retry remains cacheable despite continuously aging confidence.
    const count=calls.length;
    const replay=await browser.send(ask,'/api/ask',{question,requestId:'next-socks'});
    assert.equal(replay.body.meta.cached,true);
    assert.equal(calls.length,count);
    const corrected=await browser.send(postProfile,'/api/profile',{action:'correctMemory',lineId:learned.id,text:'I prefer the lowest price.'});
    assert.equal(corrected.status,200);
    assert.equal(corrected.body.profile.traits['priority:reviews-over-price'],undefined);
    const after=await browser.send(ask,'/api/ask',{question,requestId:'corrected-socks'});
    assert.equal(after.body.verdict.pickSkuId,'socksBudget');
    assert(!after.body.verdict.reason.includes('you taught me'));
    assert(!JSON.stringify(calls.at(-1)!.input.profile).includes('weighs reviews over price'));
    const fact=after.body.profile.memoryLines.find((line:Json)=>line.source==='from your correction');
    await browser.send(postProfile,'/api/profile',{action:'deleteMemory',lineId:fact.id});
    assert(!(await browser.send(getProfile,'/api/profile')).body.profile.memoryLines.some((line:Json)=>line.id===fact.id));
  });
});

test('ask, swap, scene, scan, call and scripted chapter share immediately editable memory', {concurrency:false},async()=>{
  await fixture(async({browser,calls})=>{
    await browser.send(getProfile,'/api/profile');
    const asked=await browser.send(ask,'/api/ask',{question:'A cheap kitchen choice under ₩30,000',requestId:'constraints'});
    assert(asked.body.profile.memoryLines.some((line:Json)=>line.text.startsWith('price-sensitive')&&line.source==='from your words'));
    const swapped=await browser.send(ask,'/api/ask',{question:'Another kitchen option',requestId:'swap',excludeSkuIds:['mugs'],swapDirection:'cheaper'});
    assert(swapped.body.profile.memoryLines.some((line:Json)=>line.kind==='swap'&&line.text.includes('→ cheaper')));
    const rebuilt=await browser.send(scene,'/api/scene',{command:'A quieter kitchen with five things'});
    assert(rebuilt.body.profile.memoryLines.some((line:Json)=>line.kind==='scene'&&line.source==='from your scene rebuild'));
    assert((await browser.send(getProfile,'/api/profile')).body.profile.memoryLines.some((line:Json)=>line.kind==='scene'));
    const scanned=await browser.photo();
    assert(scanned.body.profile.memoryLines.some((line:Json)=>line.kind==='inventory'&&line.text.includes('oat milk')));
    const count=calls.length;
    const call=await browser.send(postProfile,'/api/profile',{action:'callStatement',id:'small-counter',text:'I cook for one and have a small counter.'});
    const line=call.body.profile.memoryLines.find((line:Json)=>line.kind==='call');
    assert.match(line.source,/^from your call, \d{1,2} [A-Za-z]{3} \d{4}$/);
    const confirmed=await browser.send(postProfile,'/api/profile',{action:'confirmMemory',lineId:line.id});
    assert.equal(confirmed.body.profile.memoryLines.find((m:Json)=>m.id===line.id).confidence,0.98);
    const scripted=await browser.send(postProfile,'/api/profile',{action:'guidedCall',id:'store-call-1',chapter:'store'});
    assert(scripted.body.profile.memoryLines.some((line:Json)=>line.source==='from the scripted store call'));
    const chapter=await browser.send(postProfile,'/api/profile',{action:'chapter',answer:'not yet'});
    assert.equal(chapter.body.profile.chapterAnswer,'not yet');
    assert(chapter.body.profile.memoryLines.some((line:Json)=>line.kind==='scripted'&&line.source.includes('scripted scenario')));
    assert.equal(calls.length,count);
    for(const memory of chapter.body.profile.memoryLines){assert(memory.text);assert(memory.source);assert(memory.createdAt);assert(memory.confidence>=0&&memory.confidence<=1);}
  });
});
